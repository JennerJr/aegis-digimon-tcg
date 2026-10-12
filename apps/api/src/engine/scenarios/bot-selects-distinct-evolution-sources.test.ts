import "#api/cards/index";
import { describe, expect, it } from "vitest";
import { Phase } from "@aegis/shared/schema/enums";
import { createEvaluationPolicy } from "#api/bot/policy";
import { buildBotView } from "#api/bot/view";
import { advance } from "#api/engine/testkit/advance";
import { settle } from "#api/engine/testkit/harness";
import { setupScenario } from "#api/engine/testkit/scenario";
import fixture from "#api/engine/scenarios/bot-selects-distinct-evolution-sources.fixture";

describe("Bot selects distinct evolution sources", () => {
  it("answers Chaosdramon's real material request once with three different card numbers", async () => {
    const s = setupScenario(fixture, { autoAcceptOptional: true });
    const policy = createEvaluationPolicy();
    const loop = s.engine.runOneTurn();
    try {
      await settle(() => s.state.phase === Phase.Breeding);
      expect(s.engine.applyIntent(1, { type: "endPhase" })).toEqual({ ok: true });
      await advance(s.engine).waitForMainPhase(1);
      expect(
        s.engine.applyIntent(1, {
          type: "digivolve",
          permanentId: s.perm("base").permanentId,
          instanceId: s.inst("chaosdramon").instanceId,
        }),
      ).toEqual({ ok: true });
      await settle(() => s.state.pendingDecision?.kind === "selectCards");
      const request = s.decisions.at(-1)!.req;
      expect(request.options?.distinctCardIds).toBe(true);
      expect(request.options?.max).toBe(3);
      const response = policy.answerDecision(buildBotView(s.state, 1), request);
      expect(s.engine.applyIntent(1, response)).toEqual({ ok: true });
      await settle(
        () =>
          !s.state.pendingDecision &&
          s.events.some((event) => event.kind === "effectResolved" && event.sourceCardId === "EX3-013"),
      );
      expect(
        s
          .perm("base")
          .stack.slice(0, 3)
          .map(({ cardId }) => cardId)
          .sort(),
      ).toEqual(["BT1-021", "BT2-060", "BT2-061"]);
      expect(s.state.players[1]!.trash.map(({ cardId }) => cardId)).toEqual(["BT1-021", "BT1-021"]);
      expect(s.perm("target").topCard.cardId).toBe("BT1-009");
      expect(s.perm("target").stack).toHaveLength(0);
    } finally {
      s.engine.applyIntent(1, { type: "surrender" });
      await loop;
    }
  });
});
