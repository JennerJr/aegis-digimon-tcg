import { describe, expect, it } from "vitest";
import { Phase } from "@aegis/shared/schema/enums";
import "#api/cards/index";
import { setupScenario } from "#api/engine/testkit/scenario";
import { settle } from "#api/engine/testkit/harness";
import { observe } from "#api/engine/testkit/observe";
import fixture from "#api/engine/scenarios/takato-places-source-and-trash-materials.fixture";

describe("Takato places its own source and the named trash materials", () => {
  it("offers only the activating Takato and trash Digimon for the material order", async () => {
    const s = setupScenario(fixture, { autoOrderCards: false });
    const loop = s.engine.startTurnLoop();
    try {
      await settle(() => s.state.phase === Phase.Breeding);
      expect(s.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
      await settle(() => s.state.phase === Phase.Main);
      const source = s.perm("sourceTakato");
      const effect = observe(s.engine).activatableEffects(source)[0]!;
      expect(
        s.engine.applyIntent(0, {
          type: "activateEffect",
          sourceInstanceId: source.topCard.instanceId,
          effectKey: effect.effectKey,
        }),
      ).toEqual({ ok: true });
      await settle(() => s.state.pendingDecision !== undefined);
      const order = s.decisions.at(-1)!.req;
      expect(order.kind).toBe("orderCards");
      const materials = [
        s.inst("trashWarGrowlmon").instanceId,
        s.inst("sourceTakato").instanceId,
        s.inst("trashGrowlmon").instanceId,
      ];
      expect(order.options?.candidateInstanceIds?.toSorted()).toEqual(materials.toSorted());
      expect(
        s.engine.applyIntent(0, {
          type: "respondDecision",
          decisionId: order.decisionId,
          response: { kind: "orderCards", order: [materials[0]!, s.inst("otherTakato").instanceId, materials[2]!] },
        }),
      ).toMatchObject({ ok: false });
      expect(s.perm("guilmon").stack).toHaveLength(0);
      expect(
        s.engine.applyIntent(0, {
          type: "respondDecision",
          decisionId: order.decisionId,
          response: { kind: "orderCards", order: materials },
        }),
      ).toEqual({ ok: true });
      await settle(() => s.state.pendingDecision?.kind === "optional");
      expect(
        s.engine.applyIntent(0, {
          type: "respondDecision",
          decisionId: s.state.pendingDecision!.decisionId,
          response: { kind: "optional", accept: false },
        }),
      ).toEqual({ ok: true });
      await settle(() => s.state.pendingDecision === undefined);
      expect(s.perm("guilmon").stack.map((card) => card.instanceId)).toEqual(materials);
      expect(s.perm("guilmon").topCard.cardId).toBe("BT12-007");
      expect(s.state.players[0]!.battleArea.some((permanent) => permanent.permanentId === source.permanentId)).toBe(
        false,
      );
      expect(s.state.players[0]!.trash.map((card) => card.instanceId)).toEqual([s.inst("trashTakato").instanceId]);
      expect(s.perm("otherTakato").topCard.cardId).toBe("BT12-089");
      expect(s.perm("fieldGrowlmon").topCard.cardId).toBe("BT12-010");
      expect(s.perm("fieldWarGrowlmon").topCard.cardId).toBe("BT12-016");
      expect(s.state.memory).toBe(10);
    } finally {
      s.engine.applyIntent(0, { type: "surrender" });
      await loop;
    }
  });
});
