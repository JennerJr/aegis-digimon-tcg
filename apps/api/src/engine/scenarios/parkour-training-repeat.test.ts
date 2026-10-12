import { describe, expect, it } from "vitest";
import { Phase } from "@aegis/shared/schema/enums";
import { setupScenario } from "#api/engine/testkit/scenario";
import { advance } from "#api/engine/testkit/advance";
import { settle } from "#api/engine/testkit/harness";
import fixture from "#api/engine/scenarios/parkour-training-repeat.fixture";
import "#api/cards/LM/LM-058";

describe("Parkour Training repeated use", () => {
  it.each([false, true])("requires both colors after placement with sources=%s", async (sources) => {
    const prepared = {
      ...fixture,
      board: {
        ...fixture.board,
        0: {
          ...fixture.board[0],
          battleArea: sources
            ? [
                { card: "BT1-028", as: "blueSource" },
                { card: "BT1-064", as: "greenSource" },
              ]
            : [],
        },
      },
    };
    const s = setupScenario(prepared, { autoSelectCards: true, autoAcceptOptional: true });
    const loop = s.engine.startTurnLoop();
    try {
      await advance(s.engine).waitForMainPhase(0);
      const first = s.inst("firstTraining");
      const second = s.inst("secondTraining");
      expect(first.playableFromHand).toBe(true);
      expect(second.playableFromHand).toBe(true);
      expect(s.engine.applyIntent(0, { type: "playCard", instanceId: first.instanceId })).toEqual({ ok: true });
      await settle(
        () =>
          s.state.players[0]!.battleArea.some((p) => p.topCard.instanceId === first.instanceId) &&
          !s.state.pendingDecision,
      );
      expect(s.state.memory).toBe(4);
      expect(second.playableFromHand).toBe(sources);
      const result = s.engine.applyIntent(0, { type: "playCard", instanceId: second.instanceId });
      expect(result.ok).toBe(sources);
      if (sources) {
        await settle(
          () =>
            s.state.players[0]!.battleArea.some((p) => p.topCard.instanceId === second.instanceId) &&
            !s.state.pendingDecision,
        );
      }
      expect(s.state.memory).toBe(sources ? 2 : 4);
      expect(s.state.players[0]!.hand.some((card) => card.instanceId === second.instanceId)).toBe(!sources);
    } finally {
      if (s.state.phase === Phase.Breeding) s.engine.applyIntent(s.state.turnSeat, { type: "endPhase" });
      s.engine.applyIntent(0, { type: "surrender" });
      await loop;
    }
  });
});
