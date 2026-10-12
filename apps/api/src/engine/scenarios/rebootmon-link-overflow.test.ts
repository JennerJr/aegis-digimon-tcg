import { Phase } from "@aegis/shared/schema/enums";
import { expect, it } from "vitest";
import { setupScenario } from "#api/engine/testkit/scenario";
import { advance } from "#api/engine/testkit/advance";
import { settle } from "#api/engine/testkit/harness";
import fixture from "#api/engine/scenarios/rebootmon-link-overflow.fixture";
import "#api/cards/BT25/BT25-060";
import "#api/cards/BT25/BT25-072";
import "#api/cards/BT26/BT26-063";
import "#api/cards/BT21/BT21-073";
import "#api/cards/EX3/EX3-024";

it.each([false, true])("lets Rebootmon discard an existing link during a forced attack=%s", async (forced) => {
  const s = setupScenario(
    forced ? fixture : { ...fixture, board: { ...fixture.board, 1: { ...fixture.board[1], battleArea: [] } } },
    { autoAcceptOptional: true, autoSelectCards: true, preferInstanceIds: [] },
  );
  const loop = s.engine.startTurnLoop();
  try {
    await settle(() => s.state.phase === Phase.Breeding && !s.state.pendingDecision);
    expect(s.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
    await advance(s.engine).waitForMainPhase(0);
    const attack = forced
      ? undefined
      : s.engine.applyIntent(0, {
          type: "attack",
          attackerPermanentId: s.perm("reboot").permanentId,
          target: { kind: "player" },
        });
    expect(attack?.ok).toBe(forced ? undefined : true);
    await settle(() => s.engine.mainVerbContinuationsInFlight === 0 && !s.state.pendingDecision);
    expect(s.perm("reboot").linked).toHaveLength(2);
    expect(s.perm("reboot").linked.map((card) => card.instanceId)).toContain(s.inst("newLink").instanceId);
    expect(s.state.players[0]!.trash.map((card) => card.instanceId)).toContain(s.inst("oldLink").instanceId);
    expect(s.state.players[1]!.security).toHaveLength(3);
    expect(s.decisions.some(({ req }) => req.promptText === "Choose 1 link card to trash.")).toBe(true);
  } finally {
    s.engine.applyIntent(0, { type: "surrender" });
    await loop;
  }
});
