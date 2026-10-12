import { expect, it } from "vitest";
import { Phase } from "@aegis/shared/schema/enums";
import { setupScenario } from "#api/engine/testkit/scenario";
import { advance } from "#api/engine/testkit/advance";
import { settle } from "#api/engine/testkit/harness";
import fixture from "#api/engine/scenarios/candlemon-reveal-categories.fixture";
import "#api/cards/BT18/BT18-030";

it.each(["bothCategories", "dataOnly"])(
  "Candlemon fills the remaining category after selecting %s as Data",
  async (first) => {
    const preferred: string[] = [];
    const s = setupScenario(fixture, { autoSelectCards: true, preferInstanceIds: preferred });
    preferred.push(s.inst(first).instanceId);
    const loop = s.engine.startTurnLoop();
    try {
      await settle(() => s.state.phase === Phase.Breeding);
      expect(s.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
      await advance(s.engine).waitForMainPhase(0);
      expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("candlemon").instanceId })).toEqual({
        ok: true,
      });
      await settle(() => s.engine.mainVerbContinuationsInFlight === 0 && !s.state.pendingDecision);
      const added = s.state.players[0]!.hand.filter((card) =>
        [s.inst("bothCategories").instanceId, s.inst("dataOnly").instanceId].includes(card.instanceId),
      ).map((card) => card.instanceId);
      expect(added).toEqual(
        first === "dataOnly"
          ? [s.inst("dataOnly").instanceId, s.inst("bothCategories").instanceId]
          : [s.inst("bothCategories").instanceId],
      );
      expect(s.state.players[0]!.deck.map((card) => card.instanceId)).toContain(s.inst("nonMatch").instanceId);
      expect(s.state.players[0]!.deck.some((card) => card.instanceId === s.inst("dataOnly").instanceId)).toBe(
        first === "bothCategories",
      );
      expect(s.state.memory).toBe(3);
    } finally {
      s.engine.applyIntent(0, { type: "surrender" });
      await loop;
    }
  },
);
