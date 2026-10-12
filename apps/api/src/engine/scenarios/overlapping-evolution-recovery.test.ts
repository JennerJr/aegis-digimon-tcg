import { expect, it } from "vitest";
import { Phase } from "@aegis/shared/schema/enums";
import { setupScenario } from "#api/engine/testkit/scenario";
import { advance } from "#api/engine/testkit/advance";
import { settle } from "#api/engine/testkit/harness";
import fixture from "#api/engine/scenarios/overlapping-evolution-recovery.fixture";
import "#api/cards/BT14/BT14-003";
import "#api/cards/BT14/BT14-033";
import "#api/cards/BT14/BT14-102";
import "#api/cards/BT14/BT14-037";
import "#api/cards/BT16/BT16-019";
import "#api/cards/BT1/BT1-087";
import "#api/cards/P/P-105";
import "#api/cards/EX4/EX4-038";
import "#api/cards/EX9/EX9-019";

it("resolves successive evolutions, their draws, recovery and the mandatory DP target", async () => {
  const preferred: string[] = [];
  const s = setupScenario(fixture, { autoAcceptOptional: true, autoSelectCards: true, preferInstanceIds: preferred });
  preferred.push(s.inst("securityAngel").instanceId, s.inst("replacement").instanceId, s.perm("high").permanentId);
  const loop = s.engine.startTurnLoop();
  try {
    await settle(() => s.state.phase === Phase.Breeding);
    expect(s.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
    await advance(s.engine).waitForMainPhase(0);
    await settle(
      () => !s.state.pendingDecision && s.perm("angelBase").topCard.instanceId === s.inst("securityAngel").instanceId,
    );
    expect(s.state.memory).toBe(7);
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("secondBase").permanentId,
        instanceId: s.inst("secondEvolution").instanceId,
        useAlternateCost: true,
      }),
    ).toEqual({ ok: true });
    await settle(() => !s.state.pendingDecision && s.engine.mainVerbContinuationsInFlight === 0);
    expect(s.state.players[0]!.hand.map((card) => card.instanceId)).toContain(s.inst("delayedDraw").instanceId);
    expect(s.state.memory).toBe(5);
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("angelBase").permanentId,
        instanceId: s.inst("magna").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(
      () =>
        !s.state.pendingDecision &&
        s.engine.mainVerbContinuationsInFlight === 0 &&
        s.state.players[0]!.security.length === 6,
    );
    expect(s.perm("angelBase").topCard.instanceId).toBe(s.inst("magna").instanceId);
    expect(s.perm("high").currentDP).toBe(2000);
    expect(s.state.memory).toBe(2);
    expect(s.state.players[0]!.deck).toHaveLength(6);
  } finally {
    if (s.state.phase === Phase.Breeding) s.engine.applyIntent(s.state.turnSeat, { type: "endPhase" });
    s.engine.applyIntent(0, { type: "surrender" });
    await loop;
  }
});
