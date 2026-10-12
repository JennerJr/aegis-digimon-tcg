import "#api/cards/index";
import { describe, expect, it } from "vitest";
import { Phase } from "@aegis/shared/schema/enums";
import { advance } from "#api/engine/testkit/advance";
import { settle } from "#api/engine/testkit/harness";
import { setupScenario } from "#api/engine/testkit/scenario";
import fixture from "#api/engine/scenarios/assembly-preserves-unused-entry-trigger.fixture";

describe("Assembly preserves an unused entry trigger", () => {
  it.each([true, false])(
    "offers the later Chronicle attack only when the first reactivation was declined: %s",
    async (declineFirst) => {
      const declinePrompts = ["1 of your Digimon may attack"];
      if (declineFirst) declinePrompts.push("activate 1 of this Digimon's");
      const preferInstanceIds: string[] = [];
      const s = setupScenario(fixture, {
        autoAcceptOptional: true,
        autoSelectCards: true,
        autoChooseOption: true,
        declinePrompts,
        preferInstanceIds,
        preferTriggerKeys: ["EX13-060"],
      });
      const recordDecision = s.decisions.push.bind(s.decisions);
      s.decisions.push = (...entries) => {
        if (entries.some(({ req }) => req.promptText?.includes("You may play 1 [Chronicle]")))
          declinePrompts.splice(0, declinePrompts.length, "activate 1 of this Digimon's");
        const played = s.state.players[0]!.battleArea.find(
          ({ topCard }) => topCard.instanceId === s.inst("playedGrademon").instanceId,
        );
        if (played && !preferInstanceIds.includes(played.permanentId)) preferInstanceIds.push(played.permanentId);
        return recordDecision(...entries);
      };
      const loop = s.engine.runOneTurn();
      try {
        await settle(() => s.state.phase === Phase.Breeding);
        expect(s.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
        await advance(s.engine).waitForMainPhase(0);
        expect(
          s.engine.applyIntent(0, {
            type: "playCard",
            instanceId: s.inst("alphamon").instanceId,
            assembly: {
              materialInstanceIds: ["levelFive", "levelFour", "levelThree"]
                .map((alias) => s.inst(alias).instanceId)
                .sort(),
            },
          }),
        ).toEqual({ ok: true });
        await loop;
        const alphamon = s.state.players[0]!.battleArea.find(
          ({ topCard }) => topCard.instanceId === s.inst("alphamon").instanceId,
        );
        expect(alphamon?.stack.map(({ instanceId }) => instanceId).sort()).toEqual(
          ["levelFive", "levelFour", "levelThree"].map((alias) => s.inst(alias).instanceId).sort(),
        );
        expect(
          s.state.players[0]!.battleArea.some(
            ({ topCard }) => topCard.instanceId === s.inst("playedGrademon").instanceId,
          ),
        ).toBe(true);
        expect(s.events.filter((event) => event.kind === "attackDeclared")).toHaveLength(declineFirst ? 1 : 0);
        expect(s.state.players[1]!.security).toHaveLength(declineFirst ? 2 : 3);
        expect(s.state.pendingDecision).toBeUndefined();
      } finally {
        s.engine.applyIntent(0, { type: "surrender" });
        await loop;
      }
    },
  );
});
