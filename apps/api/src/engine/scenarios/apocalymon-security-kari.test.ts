import { describe, expect, it } from "vitest";
import { Phase } from "@aegis/shared/schema/enums";
import { setupScenario } from "#api/engine/testkit/scenario";
import { advance } from "#api/engine/testkit/advance";
import { settle } from "#api/engine/testkit/harness";
import fixture from "#api/engine/scenarios/apocalymon-security-kari.fixture";
import "#api/cards/EX10/EX10-061";
import "#api/cards/BT4/BT4-097";
import "#api/cards/EX10/EX10-012";
import "#api/cards/BT15/BT15-031";

describe("Apocalymon security placement triggers Kari", () => {
  it("offers Kari after security cards pay the play reduction", async () => {
    const s = setupScenario(fixture, { autoAcceptOptional: true, autoSelectCards: true, autoChooseOption: true });
    const loop = s.engine.startTurnLoop();
    try {
      await advance(s.engine).waitForMainPhase(0);
      expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("apocalymon").instanceId })).toEqual({
        ok: true,
      });
      await settle(
        () => s.state.players[0]!.battleArea.some((p) => p.topCard.cardId === "EX10-061") && !s.state.pendingDecision,
      );
      expect(s.state.players[0]!.security.map((card) => card.instanceId)).not.toContain(s.inst("metal").instanceId);
      expect(s.perm("kari").isSuspended).toBe(true);
      expect(s.events.some((event) => event.kind === "effectTriggered" && event.sourceCardId === "BT4-097")).toBe(true);
    } finally {
      if (s.state.phase === Phase.Breeding) s.engine.applyIntent(s.state.turnSeat, { type: "endPhase" });
      s.engine.applyIntent(0, { type: "surrender" });
      await loop;
    }
  });
});
