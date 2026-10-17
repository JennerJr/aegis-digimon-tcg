import { Room, CloseCode, Protocol } from "@colyseus/sdk";
import { OPPONENT_DECK_CHANNEL } from "@aegis/shared/decks/OPPONENT_DECK_CHANNEL";
import { USED_DECK_CHANNEL, type UsedDeck } from "@aegis/shared/decks/UsedDeck";
// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DECISION_CHANNEL,
  EVENT_CHANNEL,
  type DecisionRequest,
  type SequencedServerEvent,
  type GameState,
} from "@aegis/shared";
import type { AegisRoom } from "./client";

const joinOrCreate = vi.fn();
const spectate = vi.fn<(...args: unknown[]) => Promise<AegisRoom>>();
const createBot = vi.fn<(...args: unknown[]) => Promise<AegisRoom>>();
const reconnect = vi.fn();

vi.mock("./client", () => ({
  spectate: (...args: unknown[]) => spectate(...args),
  joinOrCreate: (...args: unknown[]) => joinOrCreate(...args),
  createBot: (...args: unknown[]) => createBot(...args),
  createPrivate: vi.fn(),
  joinPrivateByCode: vi.fn(),
  reconnect: (...args: unknown[]) => reconnect(...args),
  resumeReconnectSession: (session: { reconnectionToken: string; slot: string }) =>
    reconnect(session.reconnectionToken, session.slot),
  connectionSlot: () => "legacy",
  flushIntents: vi.fn(),
  clearPendingIntents: vi.fn(),
  sendIntent: vi.fn(),
}));

const { useRoom } = await import("./useRoom");
const { sendIntent, flushIntents } = await import("./client");
const { saveReconnectSession, loadReconnectSession } = await import("./reconnectSession");

const STORAGE_KEY = "aegis:matchSession";
const OPTIONS = { displayName: "Tamer", deck: { mainDeck: [], eggDeck: [] } };

interface FakeRoom {
  room: AegisRoom;
  emitState: (state: Partial<GameState>) => void;
  /** Several patches decoded back to back, before React renders, into one live state object. */
  emitPatchesTogether: (state: Partial<GameState>, patches: readonly (() => void)[]) => void;
  emitLeave: (code: number) => void;
  emitDecision: (decision: DecisionRequest) => void;
  emitEvent: (event: SequencedServerEvent) => void;
  emitUsedDeck: (deck: UsedDeck) => void;
  emitOpponentDeck: (deck: UsedDeck) => void;
}

class DecodingRoom extends Room {
  receive(event: MessageEvent) {
    this.onMessageCallback(event);
  }
}

function fakeRoom(roomId: string, { answersPings = true }: { answersPings?: boolean } = {}): FakeRoom {
  let onState: ((state: GameState) => void) | undefined;
  let onLeave: ((code: number) => void) | undefined;
  const messages = new Map<string, (message: DecisionRequest | SequencedServerEvent | UsedDeck) => void>();
  const decoder = new DecodingRoom("decoder");
  decoder.onMessage("x", () => {});
  const room = {
    roomId,
    sessionId: `${roomId}-session`,
    reconnectionToken: `${roomId}:token`,
    connection: {
      isOpen: true,
      events: { onmessage: (event: MessageEvent) => decoder.receive(event) },
      close: vi.fn<(code: number) => void>((code) => onLeave?.(code)),
    },
    reconnection: { enabled: true },
    ping: (answer: (ms: number) => void) => {
      if (answersPings) answer(20);
    },
    send: vi.fn(),
    leave: vi.fn(async () => 1000),
    onStateChange: (handler: (state: GameState) => void) => {
      onState = handler;
    },
    onMessage: (channel: string, handler: (message: DecisionRequest | SequencedServerEvent | UsedDeck) => void) =>
      messages.set(channel, handler),
    onError: vi.fn(),
    onLeave: (handler: (code: number) => void) => {
      onLeave = handler;
    },
  } as unknown as AegisRoom;
  return {
    room,
    emitState: (state) => act(() => onState?.(state as GameState)),
    emitPatchesTogether: (state, patches) =>
      act(() => {
        for (const patch of patches) {
          patch();
          onState?.(state as GameState);
        }
      }),
    emitLeave: (code) => act(() => onLeave?.(code)),
    emitDecision: (decision) => act(() => messages.get(DECISION_CHANNEL)?.(decision)),
    emitEvent: (event) => act(() => messages.get(EVENT_CHANNEL)?.(event)),
    emitOpponentDeck: (deck) => act(() => messages.get(OPPONENT_DECK_CHANNEL)?.(deck)),
    emitUsedDeck: (deck) => act(() => messages.get(USED_DECK_CHANNEL)?.(deck)),
  };
}

describe("useRoom reconnection token persistence", () => {
  beforeEach(() => {
    sessionStorage.clear();
    joinOrCreate.mockReset();
    createBot.mockReset();
    reconnect.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it("keeps a snapshot of every revision even when several patches land before a render", async () => {
    const joined = fakeRoom("room-1");
    joinOrCreate.mockResolvedValue(joined.room);
    const { result } = renderHook(() => useRoom(OPTIONS));
    await waitFor(() => expect(result.current.status).toBe("connected"));

    const live = { stateVersion: 1, memory: 0 } as Partial<GameState>;
    joined.emitPatchesTogether(live, [
      () => undefined,
      () => {
        live.stateVersion = 2;
        live.memory = 3;
      },
      () => {
        live.stateVersion = 3;
        live.memory = 6;
      },
    ]);

    expect(result.current.snapshots.map(({ stateVersion, state }) => [stateVersion, state.memory])).toEqual([
      [1, 0],
      [2, 3],
      [3, 6],
    ]);
  });

  it("resumes the same seat when a received MessagePack frame cannot be decoded", async () => {
    const joined = fakeRoom("damaged-frame");
    const resumed = fakeRoom("damaged-frame");
    joinOrCreate.mockResolvedValue(joined.room);
    reconnect.mockResolvedValue(resumed.room);
    const { result } = renderHook(() => useRoom(OPTIONS));
    await waitFor(() => expect(result.current.status).toBe("connected"));
    const frame = new MessageEvent("message", {
      data: new Uint8Array([Protocol.ROOM_DATA, 161, 120, 129, 161]).buffer,
    });
    expect(() => act(() => joined.room.connection.events.onmessage?.(frame))).not.toThrow();
    await waitFor(() => expect(result.current.room).toBe(resumed.room));
    expect(joined.room.connection.close).toHaveBeenCalledExactlyOnceWith(CloseCode.MAY_TRY_RECONNECT);
    expect(reconnect).toHaveBeenCalledExactlyOnceWith("damaged-frame:token", "legacy");
    expect(joinOrCreate).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe("connected");
  });

  it("persists the reconnection token once a fresh join binds", async () => {
    const joined = fakeRoom("room-1");
    joinOrCreate.mockResolvedValue(joined.room);

    const { result } = renderHook(() => useRoom(OPTIONS));

    await waitFor(() => expect(result.current.status).toBe("connected"));
    expect(loadReconnectSession()).toMatchObject({
      reconnectionToken: "room-1:token",
      roomId: "room-1",
      slot: "legacy",
    });
  });

  it.each(["local-fixture", "local-fixture"] as const)(
    "opens the requested dev scenario %s instead of resuming the previous board",
    async (devScenario) => {
      saveReconnectSession({
        reconnectionToken: "previous-board:token",
        roomId: "previous-board",
        slot: "legacy",
        savedAt: Date.now(),
      });
      reconnect.mockResolvedValue(fakeRoom("previous-board").room);
      const requested = fakeRoom("requested-board");
      createBot.mockResolvedValue(requested.room);
      const options = { ...OPTIONS, devScenario };

      const { result } = renderHook(() => useRoom(options, { mode: "bot" }));

      await waitFor(() => expect(result.current.status).toBe("connected"));
      expect(createBot).toHaveBeenCalledWith(options);
      expect(reconnect).not.toHaveBeenCalled();
      expect(result.current.room).toBe(requested.room);
      expect(loadReconnectSession()).toMatchObject({ roomId: "requested-board" });
    },
  );

  it("resumes a persisted legacy seat instead of matchmaking on a fresh mount", async () => {
    saveReconnectSession({
      reconnectionToken: "room-1:token",
      roomId: "room-1",
      slot: "legacy",
      savedAt: Date.now(),
    });
    const resumed = fakeRoom("room-1");
    reconnect.mockResolvedValue(resumed.room);

    const { result } = renderHook(() => useRoom(OPTIONS));

    expect(result.current.status).toBe("reconnecting");
    await waitFor(() => expect(result.current.status).toBe("connected"));
    expect(reconnect).toHaveBeenCalledWith("room-1:token", "legacy");
    expect(joinOrCreate).not.toHaveBeenCalled();
    expect(loadReconnectSession()).toEqual({
      reconnectionToken: "room-1:token",
      roomId: "room-1",
      slot: "legacy",
      savedAt: expect.any(Number),
    });
  });

  it("retries the original persisted session instead of matchmaking after a transient reload failure", async () => {
    saveReconnectSession({
      reconnectionToken: "room-1:token",
      roomId: "room-1",
      slot: "legacy",
      savedAt: Date.now(),
    });
    const resumed = fakeRoom("room-1");
    reconnect.mockRejectedValueOnce(new Error("gateway unavailable")).mockResolvedValueOnce(resumed.room);

    const { result, rerender } = renderHook(({ options }) => useRoom(options), {
      initialProps: { options: OPTIONS },
    });

    rerender({ options: { ...OPTIONS, displayName: "Hydrated account name" } });

    await waitFor(() => expect(result.current.status).toBe("connected"), { timeout: 2_500 });
    expect(reconnect).toHaveBeenCalledTimes(2);
    expect(reconnect).toHaveBeenNthCalledWith(1, "room-1:token", "legacy");
    expect(reconnect).toHaveBeenNthCalledWith(2, "room-1:token", "legacy");
    expect(joinOrCreate).not.toHaveBeenCalled();
    expect(loadReconnectSession()).toMatchObject({ roomId: "room-1" });
  }, 3_000);

  it("keeps the persisted session fresh so a reload late in a long match still resumes", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"], shouldAdvanceTime: true });
    try {
      const joined = fakeRoom("long-match");
      joinOrCreate.mockResolvedValue(joined.room);
      const { result } = renderHook(() => useRoom(OPTIONS));
      await waitFor(() => expect(result.current.status).toBe("connected"));

      vi.advanceTimersByTime(4 * 60_000);
      expect(loadReconnectSession()).toMatchObject({ roomId: "long-match" });
      expect(Date.now() - loadReconnectSession()!.savedAt).toBeLessThanOrEqual(5_000);
    } finally {
      vi.useRealTimers();
    }
  });

  it("resumes the seat when the socket goes silent without ever closing", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"], shouldAdvanceTime: true });
    try {
      const silent = fakeRoom("silent-match", { answersPings: false });
      const resumed = fakeRoom("silent-match");
      joinOrCreate.mockResolvedValue(silent.room);
      reconnect.mockResolvedValue(resumed.room);
      const { result } = renderHook(() => useRoom(OPTIONS));
      await waitFor(() => expect(result.current.status).toBe("connected"));

      act(() => vi.advanceTimersByTime(20_000));

      await waitFor(() => expect(result.current.room).toBe(resumed.room));
      expect(reconnect).toHaveBeenCalledExactlyOnceWith("silent-match:token", "legacy");
      expect(result.current.status).toBe("connected");
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps a connection that answers its liveness probes", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"], shouldAdvanceTime: true });
    try {
      const joined = fakeRoom("live-match");
      joinOrCreate.mockResolvedValue(joined.room);
      const { result } = renderHook(() => useRoom(OPTIONS));
      await waitFor(() => expect(result.current.status).toBe("connected"));

      act(() => vi.advanceTimersByTime(5 * 60_000));

      expect(reconnect).not.toHaveBeenCalled();
      expect(result.current.room).toBe(joined.room);
    } finally {
      vi.useRealTimers();
    }
  });

  it("stops retrying at once when the server says the room is gone", async () => {
    const joined = fakeRoom("gone");
    joinOrCreate.mockResolvedValue(joined.room);
    reconnect.mockRejectedValue(Object.assign(new Error("room not found"), { code: 522 }));
    const { result } = renderHook(() => useRoom(OPTIONS));
    await waitFor(() => expect(result.current.status).toBe("connected"));

    joined.emitLeave(1006);

    await waitFor(() => expect(result.current.status).toBe("closed"));
    expect(reconnect).toHaveBeenCalledOnce();
    expect(loadReconnectSession()).toBeUndefined();
  });

  it("forgets the session once the match is over", async () => {
    const joined = fakeRoom("room-1");
    joinOrCreate.mockResolvedValue(joined.room);
    const { result } = renderHook(() => useRoom(OPTIONS));
    await waitFor(() => expect(result.current.status).toBe("connected"));

    joined.emitState({ gameOver: true, players: [] as unknown as GameState["players"] });

    expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("forgets the session when the player leaves on purpose", async () => {
    const joined = fakeRoom("room-1");
    joinOrCreate.mockResolvedValue(joined.room);
    const { result, unmount } = renderHook(() => useRoom(OPTIONS));
    await waitFor(() => expect(result.current.status).toBe("connected"));

    unmount();

    expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("restores a rejected decision response and allows the player to retry", async () => {
    const joined = fakeRoom("rejected-decision");
    joinOrCreate.mockResolvedValue(joined.room);
    const { result } = renderHook(() => useRoom(OPTIONS));
    await waitFor(() => expect(result.current.status).toBe("connected"));
    const decision: DecisionRequest = {
      decisionId: "dec-1",
      seat: 0,
      kind: "selectCards",
      promptText: "Choose",
      options: { candidateInstanceIds: ["a"], min: 1 },
    };
    joined.emitState({ pendingDecision: { decisionId: decision.decisionId } as GameState["pendingDecision"] });
    joined.emitDecision(decision);
    act(() => result.current.acknowledgeDecision(decision.decisionId));
    expect(result.current.decision).toBeUndefined();
    joined.emitEvent({
      kind: "actionRejected",
      intent: "respondDecision",
      reason: "decision-pending",
      decisionId: decision.decisionId,
      seq: 1,
      batch: "reject-1",
      stateVersion: 0,
    });
    expect(result.current.decision).toEqual(decision);
    act(() => result.current.acknowledgeDecision(decision.decisionId));
    joined.emitState({ pendingDecision: undefined });
    expect(result.current.decision).toBeUndefined();
  });

  it("does not replace a newer decision with a rejection for an older response", async () => {
    const joined = fakeRoom("newer-decision");
    joinOrCreate.mockResolvedValue(joined.room);
    const { result } = renderHook(() => useRoom(OPTIONS));
    await waitFor(() => expect(result.current.status).toBe("connected"));
    const first: DecisionRequest = { decisionId: "dec-1", seat: 0, kind: "optional", promptText: "First" };
    const second: DecisionRequest = { ...first, decisionId: "dec-2", promptText: "Second" };
    joined.emitDecision(first);
    act(() => result.current.acknowledgeDecision(first.decisionId));
    joined.emitState({ pendingDecision: { decisionId: second.decisionId } as GameState["pendingDecision"] });
    joined.emitDecision(second);
    joined.emitEvent({
      kind: "actionRejected",
      intent: "respondDecision",
      reason: "decision-pending",
      decisionId: first.decisionId,
      seq: 1,
      batch: "reject-1",
      stateVersion: 0,
    });
    expect(result.current.decision).toEqual(second);
  });
  it("reopens an optimistically closed decision when the server re-sends it after reconnect", async () => {
    const joined = fakeRoom("same-room");
    const resumed = fakeRoom("same-room");
    joinOrCreate.mockResolvedValue(joined.room);
    reconnect.mockResolvedValue(resumed.room);
    const { result } = renderHook(() => useRoom(OPTIONS));
    await waitFor(() => expect(result.current.status).toBe("connected"));
    const decision: DecisionRequest = {
      decisionId: "dec-1",
      seat: 0,
      kind: "chooseOption",
      promptText: "Choose",
      sourceCardId: "BT1-010",
      options: { choices: ["First", "Second"] },
      stateVersion: 4,
    };
    joined.emitState({
      pendingDecision: { decisionId: decision.decisionId } as GameState["pendingDecision"],
      stateVersion: 4,
    });
    joined.emitDecision(decision);
    act(() => result.current.acknowledgeDecision(decision.decisionId));
    joined.emitDecision(decision);
    expect(result.current.decision).toBeUndefined();
    joined.emitLeave(1006);
    await waitFor(() => expect(reconnect).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(result.current.room).toBe(resumed.room));
    resumed.emitDecision(decision);
    expect(result.current.decision).toEqual(decision);
  });
});

it("joins as an observer without readying a player and persists its role", async () => {
  const joined = fakeRoom("watched-match");
  spectate.mockResolvedValue(joined.room);
  const { result } = renderHook(() =>
    useRoom({ ...OPTIONS, spectator: true }, { mode: "spectator", roomCode: "ABCDEF" }),
  );
  await waitFor(() => expect(result.current.status).toBe("connected"));
  joined.emitState({ players: [] } as unknown as Partial<GameState>);
  expect(spectate).toHaveBeenCalledWith({ roomCode: "ABCDEF", displayName: OPTIONS.displayName });
  expect(joined.room.send).not.toHaveBeenCalled();
  expect(loadReconnectSession()?.spectator).toBe(true);
});

it("GitHub #5197: displays a spectator's already decoded initial state without waiting for another patch", async () => {
  sessionStorage.clear();
  vi.mocked(sendIntent).mockClear();
  const joined = fakeRoom("already-started-match");
  const initial = { players: [{ seat: 0 }, { seat: 1 }], stateVersion: 42, memory: 3, roomCode: "ABCDEF" } as GameState;
  Reflect.set(joined.room, "state", initial);
  spectate.mockResolvedValue(joined.room);
  const { result } = renderHook(() =>
    useRoom({ ...OPTIONS, spectator: true }, { mode: "spectator", roomCode: "ABCDEF" }),
  );
  await waitFor(() => expect(result.current.status).toBe("connected"));
  expect(result.current.state).toBe(initial);
  expect(result.current.snapshots.at(-1)?.stateVersion).toBe(42);
  expect(result.current.roomCode).toBe("ABCDEF");
  expect(sendIntent).not.toHaveBeenCalled();
});

it("consumes an already decoded player state and sends ready only once across later patches", async () => {
  sessionStorage.clear();
  vi.mocked(sendIntent).mockClear();
  const joined = fakeRoom("decoded-player");
  const initial = { players: [{ seat: 0 }, { seat: 1 }], stateVersion: 42 } as GameState;
  Reflect.set(joined.room, "state", initial);
  joinOrCreate.mockResolvedValue(joined.room);
  const { result } = renderHook(() => useRoom(OPTIONS));
  await waitFor(() => expect(result.current.status).toBe("connected"));
  expect(result.current.state).toBe(initial);
  expect(sendIntent).toHaveBeenCalledTimes(1);
  expect(sendIntent).toHaveBeenCalledWith(joined.room, { type: "ready" });
  joined.emitState({ ...initial, stateVersion: 43 });
  expect(result.current.snapshots.at(-1)?.stateVersion).toBe(43);
  expect(sendIntent).toHaveBeenCalledTimes(1);
});

it("GitHub #5197: restores a spectator's decoded state on reload without sending player intents", async () => {
  sessionStorage.clear();
  vi.mocked(sendIntent).mockClear();
  vi.mocked(flushIntents).mockClear();
  saveReconnectSession({
    reconnectionToken: "watched-match:token",
    roomId: "watched-match",
    slot: "legacy",
    spectator: true,
    savedAt: Date.now(),
  });
  const resumed = fakeRoom("watched-match");
  const initial = { players: [{ seat: 0 }, { seat: 1 }], stateVersion: 42, roomCode: "ABCDEF" } as GameState;
  Reflect.set(resumed.room, "state", initial);
  reconnect.mockResolvedValue(resumed.room);
  const { result } = renderHook(() =>
    useRoom({ ...OPTIONS, spectator: true }, { mode: "spectator", roomCode: "ABCDEF" }),
  );
  await waitFor(() => expect(result.current.status).toBe("connected"));
  expect(result.current.state).toBe(initial);
  expect(loadReconnectSession()?.spectator).toBe(true);
  expect(sendIntent).not.toHaveBeenCalled();
  expect(flushIntents).not.toHaveBeenCalled();
});

it("GitHub #5210: restores game-two mulligan from a decoded state when its message arrived before binding", async () => {
  sessionStorage.clear();
  const joined = fakeRoom("game-two");
  const initial = {
    players: [
      { seat: 0, sessionId: joined.room.sessionId },
      { seat: 1, sessionId: "opponent" },
    ],
    stateVersion: 1,
    pendingDecision: { decisionId: "mull-1", seat: 0, kind: "mulligan", promptText: "Redraw your opening hand?" },
  } as GameState;
  Reflect.set(joined.room, "state", initial);
  joinOrCreate.mockResolvedValue(joined.room);
  const { result } = renderHook(() => useRoom(OPTIONS));
  await waitFor(() => expect(result.current.status).toBe("connected"));
  expect(result.current.decision).toMatchObject(initial.pendingDecision!);
});

it("requests the authoritative used deck again after reconnect and keeps an immutable copy", async () => {
  sessionStorage.clear();
  const joined = fakeRoom("deck-match");
  const resumed = fakeRoom("deck-resumed");
  joinOrCreate.mockResolvedValue(joined.room);
  reconnect.mockResolvedValue(resumed.room);
  const { result } = renderHook(() => useRoom(OPTIONS));
  await waitFor(() => expect(result.current.room).toBe(joined.room));
  expect(joined.room.send).toHaveBeenCalledWith(USED_DECK_CHANNEL, {});
  const deck: UsedDeck = { deckId: "used", deckName: "Original", mainDeck: ["BT1-009"], eggDeck: ["BT1-001"] };
  joined.emitUsedDeck(deck);
  deck.mainDeck[0] = "BT1-010";
  expect(result.current.usedDeck?.mainDeck).toEqual(["BT1-009"]);
  joined.emitLeave(1006);
  await waitFor(() => expect(result.current.room).toBe(resumed.room));
  expect(resumed.room.send).toHaveBeenCalledWith(USED_DECK_CHANNEL, {});
  resumed.emitUsedDeck({ ...deck, mainDeck: ["BT1-009"] });
  expect(result.current.usedDeck?.mainDeck).toEqual(["BT1-009"]);
});

it("requests opponent decks only after completion and recovers them on reconnect", async () => {
  sessionStorage.clear();
  const joined = fakeRoom("opponent-deck-match");
  const resumed = fakeRoom("opponent-deck-resumed");
  joinOrCreate.mockResolvedValue(joined.room);
  reconnect.mockResolvedValue(resumed.room);
  const { result } = renderHook(() => useRoom(OPTIONS));
  await waitFor(() => expect(result.current.room).toBe(joined.room));
  expect(joined.room.send).not.toHaveBeenCalledWith(OPPONENT_DECK_CHANNEL, {});
  joined.emitState({ gameOver: true, players: [] as unknown as GameState["players"] });
  expect(joined.room.send).toHaveBeenCalledWith(OPPONENT_DECK_CHANNEL, {});
  const deck: UsedDeck = { deckId: null, deckName: "Opponent", mainDeck: ["BT1-009"], eggDeck: [] };
  joined.emitOpponentDeck(deck);
  deck.mainDeck[0] = "BT1-010";
  expect(result.current.opponentDeck?.mainDeck).toEqual(["BT1-009"]);
  joined.emitLeave(1006);
  await waitFor(() => expect(result.current.room).toBe(resumed.room));
  resumed.emitState({ gameOver: true, players: [] as unknown as GameState["players"] });
  expect(resumed.room.send).toHaveBeenCalledWith(OPPONENT_DECK_CHANNEL, {});
  resumed.emitOpponentDeck(deck);
  expect(result.current.opponentDeck?.mainDeck).toEqual(["BT1-010"]);
});
