import { describe, expect, it } from "vitest";
import type { DecisionRequest } from "@aegis/shared/protocol/events";
import { createEvaluationPolicy } from "#api/bot/policy";
import { buildBotView } from "#api/bot/view";
import { setupScenario } from "#api/engine/testkit/scenario";
import fixture from "#api/engine/scenarios/bot-selects-distinct-evolution-sources.fixture";

describe("Bot distinct card selection", () => {
  it.each([true, false])(
    "preserves ranked duplicate copies only when distinctness is not required: %s",
    (distinctCardIds) => {
      const s = setupScenario(fixture);
      const aliases = ["copyA", "copyB", "copyC", "andromon", "metalTyrannomon"];
      const request: DecisionRequest = {
        decisionId: "source-materials",
        seat: 1,
        kind: "selectCards",
        promptText: "Place digivolution cards",
        options: {
          candidateInstanceIds: aliases.map((alias) => s.inst(alias).instanceId),
          visibleCards: aliases.map((alias) => ({
            instanceId: s.inst(alias).instanceId,
            cardId: s.inst(alias).cardId,
          })),
          distinctCardIds,
          purpose: "cost",
          min: 0,
          max: 3,
        },
      };
      expect(createEvaluationPolicy().answerDecision(buildBotView(s.state, 1), request)).toEqual({
        type: "respondDecision",
        decisionId: request.decisionId,
        response: {
          kind: "selectCards",
          instanceIds: (distinctCardIds ? ["copyA", "andromon", "metalTyrannomon"] : ["copyA", "copyB", "copyC"]).map(
            (alias) => s.inst(alias).instanceId,
          ),
        },
      });
    },
  );
});
