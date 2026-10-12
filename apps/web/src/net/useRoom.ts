import { resetRoomState } from "@/net/resetRoomState";
import { ROLLBACK_RESET_CHANNEL } from "@aegis/shared/protocol/RollbackKind";

import { USED_DECK_CHANNEL, type UsedDeck } from "@aegis/shared/decks/UsedDeck";
import { spectate } from "./client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { GameState } from "@aegis/shared";
import {
  EVENT_CHANNEL,
  MATCH_EXPIRED_CLOSE_CODE,
  MESSAGE_FLOOD_CLOSE_CODE,
  REPLAY_CHANNEL,
  type ReplayDownloadMessage,
  DECISION_CHANNEL,
  SERIES_CHANNEL,
  type SequencedServerEvent,
  type DecisionRequest,
  type SeriesSeatMessage,
} from "@aegis/shared";
import { emptyBatchInbox, receiveServerEvent, type BatchInbox, type ServerBatch } from "./serverBatches";
import { recordSnapshot, type StateSnapshot } from "./presentedState";
import {
  joinOrCreate,
  createBot,
  createPrivate,
  joinPrivateByCode,
  joinSeriesGame,
  resumeReconnectSession,
  connectionSlot,
  flushIntents,
  clearPendingIntents,
  type AegisRoom,
  type RoomSlot,
} from "./client";
import { intents } from "./intents";
import {
  RECONNECT_GRACE_MS,
  clearReconnectSession,
  loadReconnectSession,
  saveReconnectSession,
  type ReconnectSession,
} from "./reconnectSession";
import { ResumeCancelledError, resumeSeat } from "./resumeSeat";
import type { AegisJoinOptions } from "./types";
import { keepLocalReplay } from "../replays/local";

export type ConnectionStatus = "connecting" | "connected" | "reconnecting" | "error" | "closed";

const WS_NORMAL_CLOSURE = 1000;
const FINAL_CLOSE_CODES = new Set([WS_NORMAL_CLOSURE, MATCH_EXPIRED_CLOSE_CODE, MESSAGE_FLOOD_CLOSE_CODE]);
/** Grace runs from the drop, not the join, so a live seat keeps its saved session fresh. */
const SESSION_HEARTBEAT_MS = 5_000;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const waitUntilVisible = (): Promise<void> => {
  if (typeof document === "undefined" || !document.hidden) return Promise.resolve();
  return new Promise((resolve) => {
    const onVisible = () => {
      if (document.hidden) return;
      document.removeEventListener("visibilitychange", onVisible);
      resolve();
    };
    document.addEventListener("visibilitychange", onVisible);
  });
};

export interface DecisionSyncState {
  decision: DecisionRequest | undefined;
  confirmedDecisionId: string | undefined;
}

export function acknowledgeDecisionResponse({
  current,
  decisionId,
}: {
  current: DecisionSyncState;
  decisionId: string;
}): DecisionSyncState {
  if (current.decision?.decisionId !== decisionId) return current;
  return { decision: undefined, confirmedDecisionId: undefined };
}

export function reconcileDecisionPatch({
  current,
  pendingDecisionId,
}: {
  current: DecisionSyncState;
  pendingDecisionId: string | undefined;
}): DecisionSyncState {
  if (current.decision === undefined) {
    return { decision: undefined, confirmedDecisionId: undefined };
  }
  if (pendingDecisionId === current.decision.decisionId) {
    return {
      decision: current.decision,
      confirmedDecisionId: current.decision.decisionId,
    };
  }
  // Decisions and patches use separate channels, so a late patch can trail a new decision.
  // Only a decision already seen in synchronized state may be cleared.
  if (current.confirmedDecisionId === current.decision.decisionId) {
    return { decision: undefined, confirmedDecisionId: undefined };
  }
  return current;
}

export interface UseRoomResult {
  room: AegisRoom | undefined;
  status: ConnectionStatus;
  state: GameState | undefined;
  events: SequencedServerEvent[];
  /** `events` grouped by server batch; the presentation sequences by these. */
  batches: readonly ServerBatch[];
  decision: DecisionRequest | undefined;
  acknowledgeDecision: (decisionId: string) => void;
  error: string | undefined;
  sessionId: string | undefined;
  /**
   * Bumped on every patch. Colyseus mutates GameState in place, so memoize on this, not on
   * the state reference. Unlike `GameState.stateVersion`, it is not per batch.
   */
  patchVersion: number;
  /** The board at each recent server revision, oldest first (presentedState.ts). */
  snapshots: readonly StateSnapshot[];
  /** Non-empty only for the host of a private room. */
  roomCode: string;
  /** This seat's claim on the next game of its best-of-three, once the series has handed it out. */
  seriesSeat: Omit<SeriesGameTicket, "roomId"> | undefined;
  replayDownload?: ReplayDownloadMessage;
  usedDeck?: UsedDeck;
}

/** Where the next game of a series is and how this player takes their seat in it. */
export interface SeriesGameTicket {
  roomId: string;
  slot: RoomSlot;
  seatToken: string;
}

export type MatchMode = "casual" | "bot" | "private_host" | "private_guest" | "spectator" | "series";

export interface MatchConfig {
  mode: MatchMode;
  /** The code to join as a guest, or to reopen as the host after a finished private game. */
  roomCode?: string;
  /** A guest back in a private room waits here until the host has reopened it. */
  waitForHost?: boolean;
  /** The `series` mode's seat in a later game of a best-of-three. */
  seriesGame?: SeriesGameTicket;
}

const HOST_REOPEN_POLL_MS = 2000;
const HOST_REOPEN_WAIT_MS = 10 * 60 * 1000;

function isMissingRoom(error: unknown): boolean {
  return error instanceof Error && /room not (found|available)/.test(error.message);
}

async function joinWhenHostReopens(
  code: string,
  options: AegisJoinOptions,
  isCancelled: () => boolean,
): Promise<AegisRoom> {
  const deadline = Date.now() + HOST_REOPEN_WAIT_MS;
  for (;;) {
    try {
      return await joinPrivateByCode(code, options);
    } catch (error) {
      if (!isMissingRoom(error) || Date.now() >= deadline || isCancelled()) throw error;
    }
    await delay(HOST_REOPEN_POLL_MS);
  }
}

function connectRoom(
  options: AegisJoinOptions,
  match: MatchConfig | undefined,
  isCancelled: () => boolean,
): Promise<AegisRoom> {
  switch (match?.mode) {
    case "spectator":
      if (!match.roomCode) throw new Error("roomCode required for spectator");
      return spectate({ roomCode: match.roomCode, displayName: options.displayName });
    case "bot":
      return createBot(options);
    case "private_host":
      return createPrivate(match.roomCode ? { ...options, roomCode: match.roomCode } : options);
    case "series":
      if (!match.seriesGame) throw new Error("seriesGame required for a series game");
      return joinSeriesGame(match.seriesGame.roomId, match.seriesGame.slot, {
        ...options,
        seriesToken: match.seriesGame.seatToken,
      });
    case "private_guest":
      if (!match.roomCode) throw new Error("roomCode required for private guest");
      if (match.waitForHost) return joinWhenHostReopens(match.roomCode, options, isCancelled);
      return joinPrivateByCode(match.roomCode, options);
    default:
      return joinOrCreate(options);
  }
}

/**
 * The live GameState sits in a ref because Colyseus mutates it in place and React would
 * skip `setState` on the same reference; `patchVersion` forces each re-render.
 */
export function useRoom(options: AegisJoinOptions, match?: MatchConfig, disabled = false): UseRoomResult {
  const [status, setStatus] = useState<ConnectionStatus>(() =>
    !disabled && !options.devScenario && loadReconnectSession() ? "reconnecting" : "connecting",
  );
  const [patchVersion, setVersion] = useState(0);
  const [snapshots, setSnapshots] = useState<readonly StateSnapshot[]>([]);
  const snapshotsRef = useRef<readonly StateSnapshot[]>([]);
  const [events, setEvents] = useState<SequencedServerEvent[]>([]);
  const [inbox, setInbox] = useState<BatchInbox>(emptyBatchInbox);
  const [decision, setDecision] = useState<DecisionRequest>();
  const confirmedDecisionIdRef = useRef<string | undefined>(undefined);
  const answeredDecisionsRef = useRef(new Map<string, DecisionRequest>());
  const [error, setError] = useState<string>();
  const [usedDeck, setUsedDeck] = useState<UsedDeck>();
  const [replayDownload, setReplayDownload] = useState<ReplayDownloadMessage>();
  const [sessionId, setSessionId] = useState<string>();
  const [roomCode, setRoomCode] = useState("");
  const [seriesSeat, setSeriesSeat] = useState<Omit<SeriesGameTicket, "roomId">>();
  const roomRef = useRef<AegisRoom | undefined>(undefined);
  const roomSlotRef = useRef<RoomSlot>("legacy");
  const stateRef = useRef<GameState | undefined>(undefined);
  const readySentRef = useRef(false);

  useEffect(() => {
    if (disabled) return;
    let cancelled = false;
    confirmedDecisionIdRef.current = undefined;
    answeredDecisionsRef.current.clear();
    setDecision(undefined);
    setUsedDeck(undefined);

    let stopHeartbeat = () => {};

    const bindRoom = (room: AegisRoom) => {
      // attemptReconnect owns recovery; the SDK's own reconnection would race it for the seat.
      room.reconnection.enabled = false;
      answeredDecisionsRef.current.clear();
      roomRef.current = room;
      roomSlotRef.current = connectionSlot(room);
      setSessionId(room.sessionId);
      const session: ReconnectSession = {
        reconnectionToken: room.reconnectionToken,
        roomId: room.roomId,
        slot: roomSlotRef.current,
        savedAt: Date.now(),
        spectator: options.spectator === true,
      };
      let gameOver = false;
      let replayRequested = false;
      const stampSession = () => {
        if (cancelled || gameOver || roomRef.current !== room || !room.connection.isOpen) return;
        saveReconnectSession({ ...session, savedAt: Date.now() });
      };
      stampSession();
      stopHeartbeat();
      const heartbeat = setInterval(stampSession, SESSION_HEARTBEAT_MS);
      stopHeartbeat = () => clearInterval(heartbeat);

      room.onMessage<UsedDeck>(USED_DECK_CHANNEL, (message) => setUsedDeck(structuredClone(message)));
      if (!options.spectator) room.send(USED_DECK_CHANNEL, {});
      room.onMessage<ReplayDownloadMessage>(REPLAY_CHANNEL, (message) => {
        setReplayDownload(message);
        // Every finished match stays in this browser, saved or not to Google Drive.
        if (message.kind === "ready") void keepLocalReplay(message).catch(() => undefined);
      });
      const acceptState = (next: GameState) => {
        stateRef.current = next;
        if (next.gameOver) {
          if (!options.spectator && !replayRequested) {
            replayRequested = true;
            room.send(REPLAY_CHANNEL, {});
          }
          gameOver = true;
          stopHeartbeat();
          clearReconnectSession();
        }
        // Once per join, so the match start does not race the client's asset loading.
        if (!readySentRef.current) {
          readySentRef.current = true;
          if (!options.spectator) intents.ready(room);
        }
        if (next.roomCode) setRoomCode(next.roomCode);
        const pending = next.pendingDecision;
        setDecision((current) => {
          const reconciled = reconcileDecisionPatch({
            current: {
              decision: current,
              confirmedDecisionId: confirmedDecisionIdRef.current,
            },
            pendingDecisionId: pending?.decisionId,
          });
          confirmedDecisionIdRef.current = reconciled.confirmedDecisionId;
          // A later series game can already be waiting for mulligan before this socket
          // binds its message handler. The synchronized request contains all its inputs.
          if (
            !reconciled.decision &&
            pending?.kind === "mulligan" &&
            next.players[pending.seat]?.sessionId === room.sessionId &&
            !answeredDecisionsRef.current.has(pending.decisionId)
          ) {
            confirmedDecisionIdRef.current = pending.decisionId;
            return {
              decisionId: pending.decisionId,
              seat: pending.seat,
              kind: "mulligan",
              promptText: pending.promptText,
            };
          }
          return reconciled.decision;
        });
        setVersion((v) => v + 1);
        // Copied here, once per patch: `next` is the one live schema object, so an updater
        // left for React's render would only see it after every queued patch had landed,
        // and the revisions in between would never be recorded.
        snapshotsRef.current = recordSnapshot(snapshotsRef.current, next);
        setSnapshots(snapshotsRef.current);
      };
      room.onStateChange(acceptState);
      // A spectator can receive the full state before the join promise resolves.
      // Idle matches may publish no subsequent patch, so consume that decoded state now.
      if (room.state?.players?.length === 2) acceptState(room.state);
      room.onMessage(ROLLBACK_RESET_CHANNEL, () => {
        resetRoomState(room);
        clearPendingIntents();
        answeredDecisionsRef.current.clear();
        confirmedDecisionIdRef.current = undefined;
        setDecision(undefined);
        setEvents([]);
        setInbox(emptyBatchInbox);
        snapshotsRef.current = [];
        setSnapshots([]);
      });
      room.onMessage<SequencedServerEvent>(EVENT_CHANNEL, (event) => {
        if (event.kind === "actionRejected" && event.decisionId) {
          const rejected = answeredDecisionsRef.current.get(event.decisionId);
          answeredDecisionsRef.current.delete(event.decisionId);
          if (rejected && stateRef.current?.pendingDecision?.decisionId === rejected.decisionId) {
            setDecision((current) => {
              if (current && current.decisionId !== rejected.decisionId) return current;
              confirmedDecisionIdRef.current = rejected.decisionId;
              return rejected;
            });
          }
        }
        // `batchClosed` is a stream boundary and narrates nothing, so it stays out of the log.
        if (event.kind !== "batchClosed") setEvents((prev) => [...prev.slice(-99), event]);
        setInbox((prev) => receiveServerEvent(prev, event));
      });
      room.onMessage<SeriesSeatMessage>(SERIES_CHANNEL, (message) => {
        if (message.kind === "seat") setSeriesSeat({ seatToken: message.seatToken, slot: connectionSlot(room) });
      });
      room.onMessage<DecisionRequest>(DECISION_CHANNEL, (req) => {
        if (answeredDecisionsRef.current.has(req.decisionId)) return;
        confirmedDecisionIdRef.current =
          stateRef.current?.pendingDecision?.decisionId === req.decisionId ? req.decisionId : undefined;
        setDecision(req);
      });
      room.onError((code, message) => {
        setStatus("error");
        setError(`${code}: ${message ?? "room error"}`);
      });
      room.onLeave((code) => {
        stopHeartbeat();
        if (cancelled) return;
        if (FINAL_CLOSE_CODES.has(code)) {
          clearReconnectSession();
          setStatus("closed");
          return;
        }
        void attemptReconnect(Date.now() + RECONNECT_GRACE_MS);
      });
    };

    const attemptReconnect = async (deadline: number) => {
      const token = roomRef.current?.reconnectionToken;
      if (!token) {
        clearReconnectSession();
        setStatus("closed");
        return;
      }
      setStatus("reconnecting");
      const saved = loadReconnectSession() ?? {
        reconnectionToken: token,
        roomId: roomRef.current?.roomId ?? "",
        slot: roomSlotRef.current,
        savedAt: Date.now(),
      };
      let next: AegisRoom;
      try {
        next = await resumeSeat({
          resume: () => resumeReconnectSession({ ...saved, reconnectionToken: token }),
          deadline,
          isCancelled: () => cancelled,
          waitUntilVisible,
        });
      } catch (error) {
        if (cancelled || error instanceof ResumeCancelledError) return;
        clearPendingIntents();
        clearReconnectSession();
        setStatus("closed");
        setError(error instanceof Error ? error.message : String(error));
        return;
      }
      if (cancelled) {
        void next.leave();
        return;
      }
      bindRoom(next);
      setStatus("connected");
      if (!options.spectator) flushIntents(next);
    };

    const resumeOrConnect = async (): Promise<AegisRoom> => {
      // A dev-scenario link requests a new seeded board, even when this tab
      // still holds a reconnection token from a different match.
      if (options.devScenario) clearReconnectSession();
      const saved = loadReconnectSession();
      if (saved) {
        setStatus("reconnecting");
        try {
          return await resumeSeat({
            resume: () => resumeReconnectSession(saved),
            deadline: saved.savedAt + RECONNECT_GRACE_MS,
            isCancelled: () => cancelled,
            waitUntilVisible,
          });
        } catch (error) {
          if (!(error instanceof ResumeCancelledError)) clearReconnectSession();
          throw error;
        }
      }
      if (cancelled) throw new Error("cancelled");
      setStatus("connecting");
      return connectRoom(options, match, () => cancelled);
    };

    resumeOrConnect()
      .then((room) => {
        if (cancelled) {
          void room.leave();
          return;
        }
        bindRoom(room);
        setStatus("connected");
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setStatus("error");
        setError(err instanceof Error ? err.message : String(err));
      });

    return () => {
      cancelled = true;
      stopHeartbeat();
      // A reload never runs this cleanup, so only a deliberate exit forgets the seat.
      clearReconnectSession();
      void roomRef.current?.leave();
      roomRef.current = undefined;
      roomSlotRef.current = "legacy";
      stateRef.current = undefined;
      readySentRef.current = false;
      clearPendingIntents();
    };
    // Options can change after mount (account/deck hydration); restarting would drop a
    // resumed seat and matchmake a second game. A new match remounts with fresh options.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disabled]);

  const acknowledgeDecision = useCallback((decisionId: string) => {
    setDecision((current) => {
      if (current?.decisionId === decisionId) answeredDecisionsRef.current.set(decisionId, current);
      const acknowledged = acknowledgeDecisionResponse({
        current: { decision: current, confirmedDecisionId: confirmedDecisionIdRef.current },
        decisionId,
      });
      confirmedDecisionIdRef.current = acknowledged.confirmedDecisionId;
      return acknowledged.decision;
    });
  }, []);

  return {
    room: roomRef.current,
    status,
    state: stateRef.current,
    events,
    batches: inbox.batches,
    decision,
    acknowledgeDecision,
    error,
    sessionId,
    patchVersion,
    snapshots,
    roomCode,
    seriesSeat,
    replayDownload,
    usedDeck,
  };
}
