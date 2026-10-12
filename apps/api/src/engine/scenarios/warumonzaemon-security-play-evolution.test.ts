import { expect, it } from "vitest";
import { Phase } from "@aegis/shared/schema/enums";
import { setupScenario } from "#api/engine/testkit/scenario";
import { advance } from "#api/engine/testkit/advance";
import { settle } from "#api/engine/testkit/harness";
import { observe } from "#api/engine/testkit/observe";
import fixture from "#api/engine/scenarios/warumonzaemon-security-play-evolution.fixture";
import "#api/cards/P/P-216";
import "#api/cards/BT15/BT15-031";
import "#api/cards/BT1/BT1-084";

it("allows the Dark Master played by On Deletion to evolve and still deletes its evolved host at turn end", async () => {
  const s = setupScenario(fixture, { autoAcceptOptional: true, autoSelectCards: true });
  const loop = s.engine.startTurnLoop();
  try {
    await advance(s.engine).waitForMainPhase(0);
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("waru").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(
      () =>
        s.state.players[0]!.battleArea.some((p) => p.topCard.instanceId === s.inst("master").instanceId) &&
        !s.state.pendingDecision &&
        s.engine.mainVerbContinuationsInFlight === 0,
    );
    const master = s.state.players[0]!.battleArea.find((p) => p.topCard.instanceId === s.inst("master").instanceId)!;
    expect(observe(s.engine).isRestricted(master, "digivolve")).toBe(false);
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        instanceId: s.inst("evolution").instanceId,
        permanentId: master.permanentId,
      }),
    ).toEqual({ ok: true });
    await settle(
      () =>
        master.topCard.instanceId === s.inst("evolution").instanceId &&
        !s.state.pendingDecision &&
        s.engine.mainVerbContinuationsInFlight === 0,
    );
    expect(master.stack.map((card) => card.instanceId)).toContain(s.inst("master").instanceId);
    expect(s.state.memory).toBe(4);
    expect(s.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
    await advance(s.engine).waitForMainPhase(1);
    expect(s.state.players[0]!.battleArea.some((p) => p.permanentId === master.permanentId)).toBe(false);
    expect(s.state.players[0]!.trash.map((card) => card.instanceId)).toEqual(
      expect.arrayContaining([s.inst("waru").instanceId, s.inst("master").instanceId, s.inst("evolution").instanceId]),
    );
  } finally {
    if (s.state.phase === Phase.Breeding) s.engine.applyIntent(s.state.turnSeat, { type: "endPhase" });
    s.engine.applyIntent(0, { type: "surrender" });
    await loop;
  }
});

it("continues to reject evolution for the Dark Master played by On Play", async () => {
  const own = fixture.board[0]!;
  const s = setupScenario(
    {
      ...fixture,
      board: {
        ...fixture.board,
        0: {
          ...own,
          battleArea: [],
          hand: [{ card: "P-216", as: "waru" }, { card: "BT15-031", as: "master" }, ...(own.hand ?? [])],
          security: 3,
        },
      },
    },
    { autoAcceptOptional: true, autoSelectCards: true },
  );
  const loop = s.engine.startTurnLoop();
  try {
    await advance(s.engine).waitForMainPhase(0);
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("waru").instanceId })).toEqual({ ok: true });
    await settle(
      () =>
        s.state.players[0]!.battleArea.some((p) => p.topCard.instanceId === s.inst("master").instanceId) &&
        !s.state.pendingDecision &&
        s.engine.mainVerbContinuationsInFlight === 0,
    );
    const master = s.state.players[0]!.battleArea.find((p) => p.topCard.instanceId === s.inst("master").instanceId)!;
    expect(observe(s.engine).isRestricted(master, "digivolve")).toBe(true);
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        instanceId: s.inst("evolution").instanceId,
        permanentId: master.permanentId,
      }).ok,
    ).toBe(false);
    expect(s.state.players[0]!.hand.map((card) => card.instanceId)).toContain(s.inst("evolution").instanceId);
    expect(s.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
    await advance(s.engine).waitForMainPhase(1);
    expect(s.state.players[0]!.battleArea.some((p) => p.permanentId === master.permanentId)).toBe(false);
  } finally {
    if (s.state.phase === Phase.Breeding) s.engine.applyIntent(s.state.turnSeat, { type: "endPhase" });
    s.engine.applyIntent(0, { type: "surrender" });
    await loop;
  }
});
