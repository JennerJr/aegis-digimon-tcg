// @vitest-environment jsdom
import type { GameState, SequencedServerEvent } from "@aegis/shared";
import { setupEngine, drainMicrotasks, settle } from "@aegis-api/engine/testkit/harness.js";
import "@aegis-api/cards/BT17/BT17-078.js";
import "@aegis-api/cards/BT5/BT5-031.js";
import "@aegis-api/cards/AD1/AD1-004.js";
import "@aegis-api/cards/AD1/AD1-014.js";
import "@aegis-api/cards/BT19/BT19-014.js";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "./scenarioHarness/testingLibrary";
import { GameScreen } from "../src/game/GameScreen";
import type { AegisRoom } from "../src/net/client";
import { mirroredCombatWindow, openCombatWindow } from "../src/game/combatWindowModel";
import { combatWindowsFor } from "../src/game/screen/model/combatWindows";

afterEach(cleanup);

it("GH5346 replaces the accepted Blast DNA counter with Omnimon targets despite a rejected duplicate", async () => {
  // Oracle 99a68825: AD1-004 field + BT5-031 hand, with three physical routes.
  const s = setupEngine({
    0: {
      battleArea: [
        { card: "AD1-004", as: "warField" },
        { card: "AD1-014", as: "metalField" },
        { card: "BT1-010", as: "sacrifice" },
      ],
      hand: [
        { card: "BT17-078", as: "ace" },
        { card: "BT5-031", as: "metalHand" },
        { card: "BT5-031", as: "otherMetalHand" },
        { card: "AD1-004", as: "warHand" },
      ],
      deck: ["BT1-010", "BT1-010"],
      security: ["BT1-010"],
    },
    1: {
      battleArea: [{ card: "BT19-014", as: "attacker" }],
      deck: ["BT1-010"],
      security: ["BT1-010"],
    },
  });
  s.state.players[0]!.sessionId = "viewer";
  s.state.players[1]!.sessionId = "opponent";
  s.state.turnSeat = 1;
  s.state.memory = 3;
  await s.ready();
  expect(
    s.engine.applyIntent(1, {
      type: "attack",
      attackerPermanentId: s.perm("attacker").permanentId,
      target: { kind: "player" },
    }),
  ).toEqual({ ok: true });
  await settle(() => s.state.pendingDecision !== undefined);
  const attackDecision = s.decisions.at(-1)!.req;
  expect(
    s.engine.applyIntent(1, {
      type: "respondDecision",
      decisionId: attackDecision.decisionId,
      response: { kind: "chooseTargets", instanceIds: [s.perm("sacrifice").permanentId] },
    }),
  ).toEqual({ ok: true });
  await drainMicrotasks(500);
  if (s.engine.combat.hasOpenBlockWindow)
    expect(s.engine.applyIntent(0, { type: "declineBlock" })).toEqual({ ok: true });
  await settle(() => s.events.some((e) => e.kind === "counterWindowOpened"));
  const opened = s.events.find((e) => e.kind === "counterWindowOpened");
  if (opened?.kind !== "counterWindowOpened") throw new Error("Missing counter");
  expect(opened.eligibleCounters).toHaveLength(3);
  const choice = opened.eligibleCounters.find(
    (e) => e.effectKey.includes(s.perm("warField").permanentId) && e.effectKey.includes(s.inst("metalHand").instanceId),
  )!;
  const intent = { type: "respondCounter" as const, sourceInstanceId: choice.instanceId, effectKey: choice.effectKey };
  const answered = { current: undefined as string | undefined };
  const rejection = { current: undefined as number | undefined };
  const events = (): SequencedServerEvent[] =>
    s.events.map((e, i) => ({ ...e, seq: i + 1, batch: `batch-${i}`, stateVersion: 0 }));
  const windows = () =>
    combatWindowsFor({
      events: events(),
      state: s.state,
      viewerSeat: 0,
      isMyTurn: false,
      mirroredWindow: mirroredCombatWindow(s.state, 0),
      openCombatWindow: openCombatWindow(events(), s.state, 0),
      answeredCombatWindowKeyRef: answered,
      rolledBackRejectionSeqRef: rejection,
    });
  expect(windows().counterWindow).not.toBeNull();
  windows().markCombatWindowAnswered();
  expect(windows().counterWindow).toBeNull();
  expect(s.engine.applyIntent(0, intent)).toEqual({ ok: true });
  await settle(() => s.state.pendingDecision !== undefined);
  const decision = s.decisions.at(-1)!.req;
  expect(decision.kind).toBe("chooseTargets");
  expect(decision.sourceCardId).toBe("BT17-078");
  expect(decision.options?.candidateInstanceIds).toEqual([s.perm("attacker").permanentId]);
  expect(s.state.combatWindow?.kind).toBe("counter");
  expect(s.events.some((e) => e.kind === "counterResolved")).toBe(false);
  // applyIntent returns the refusal; the room broadcasts it (as in the Oracle receipt).
  expect(s.engine.applyIntent(0, intent)).toEqual({ ok: false, reason: "decision-pending" });
  s.events.push({ kind: "actionRejected", intent: "respondCounter", reason: "decision-pending" });
  expect(windows().counterWindow).toBeNull();

  const send = vi.fn<(type: string, payload: unknown) => void>();
  const room = {
    state: s.state,
    connection: { isOpen: true },
    send,
    onMessage: () => () => {},
  } as unknown as AegisRoom;
  render(
    <GameScreen
      joinOptions={{ displayName: "dentineice", deck: { mainDeck: [], eggDeck: [] } }}
      identityColor="White"
      onExit={() => {}}
      demoConnection={{
        room,
        status: "connected",
        state: s.state.toJSON() as unknown as GameState,
        events: events(),
        batches: [],
        decision,
        acknowledgeDecision: () => {},
        error: undefined,
        sessionId: "viewer",
        roomCode: "",
      }}
    />,
  );
  expect(screen.queryByRole("region", { name: "Counter timing" })).toBeNull();
  expect(screen.queryByRole("dialog", { name: "Counter timing" })).toBeNull();
  const target = screen.getByRole("img", { name: /^Shoutmon EX6$/i });
  fireEvent.click(target, { detail: 1 });
  fireEvent.click(screen.getByRole("button", { name: /^Confirm/i }));
  expect(send).toHaveBeenCalledWith("respondDecision", {
    rollbackRevision: 0,
    decisionId: decision.decisionId,
    response: { kind: "chooseTargets", instanceIds: [s.perm("attacker").permanentId] },
  });
  expect(send).not.toHaveBeenCalledWith("respondCounter", expect.anything());
  expect(
    s.engine.applyIntent(0, {
      type: "respondDecision",
      decisionId: decision.decisionId,
      response: { kind: "chooseTargets", instanceIds: [s.perm("attacker").permanentId] },
    }),
  ).toEqual({ ok: true });
  await settle(() => !s.engine.counterResolutionInFlight && s.state.pendingDecision === undefined);
  expect(s.events.filter((e) => e.kind === "counterResolved")).toEqual([expect.objectContaining({ activated: true })]);
  expect(s.state.players[1]!.battleArea).toHaveLength(0);
  expect(s.engine.applyIntent(0, intent).ok).toBe(false);
});
