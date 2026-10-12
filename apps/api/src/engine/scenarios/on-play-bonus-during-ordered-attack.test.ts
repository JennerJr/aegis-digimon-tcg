import { readFileSync } from "node:fs";
import { runReplay } from "#api/replays/inputs/run";
import type { ReplayRecord } from "#api/replays/inputs/types";
import type { ServerEvent } from "@aegis/shared/protocol/events";
import "#api/cards/index";
import { describe, expect, it } from "vitest";
import { Phase } from "@aegis/shared/schema/enums";
import { advance } from "#api/engine/testkit/advance";
import { settle } from "#api/engine/testkit/harness";
import { setupScenario } from "#api/engine/testkit/scenario";
import fixture from "#api/engine/scenarios/on-play-bonus-during-ordered-attack.fixture";

describe("On Play bonus during an ordered attack", () => {
  it("reproduces the recorded On Play before attack without granting the conditional bonus", async () => {
    const record = JSON.parse(
      readFileSync(new URL("./on-play-bonus-during-ordered-attack.replay.json", import.meta.url), "utf8"),
    ) as ReplayRecord;
    const events: ServerEvent[] = [];
    const replay = await runReplay(record, { onBatch: (_state, batch) => events.push(...batch) });
    try {
      expect(replay.divergences).toEqual([]);
      const grademon = replay.state.players[0]!.battleArea.find(
        (permanent) => permanent.topCard.instanceId === "s0-28",
      );
      expect(grademon?.currentDP).toBe(7000);
      expect(grademon?.immuneToOpponentDigimonEffects).toBe(false);
      const onPlay = events.findIndex(
        (event) => event.kind === "effectTriggered" && event.sourceInstanceId === "s0-28" && event.timing === "OnPlay",
      );
      const attack = events.findIndex(
        (event) => event.kind === "attackDeclared" && event.attackerPermanentId === grademon?.permanentId,
      );
      expect(onPlay).toBeGreaterThan(-1);
      expect(attack).toBeGreaterThan(onPlay);
    } finally {
      await replay.applyIntent(1, { type: "surrender" });
    }
  });
  it.each([
    { first: "EX13-060", expectedDP: 12000, protected: true },
    { first: "EX13-057", expectedDP: 7000, protected: false },
  ])(
    "resolves $first first and checks the attack condition at activation",
    async ({ first, expectedDP, protected: immune }) => {
      const preferInstanceIds: string[] = [];
      const s = setupScenario(fixture, {
        autoAcceptOptional: true,
        autoSelectCards: true,
        autoChooseOption: true,
        preferTriggerKeys: [first],
        preferInstanceIds,
        declinePrompts: ["activate 1 of this Digimon's", "This Digimon may digivolve"],
      });
      const recordDecision = s.decisions.push.bind(s.decisions);
      s.decisions.push = (...entries) => {
        const grademon = s.state.players[0]!.battleArea.find(({ topCard }) => topCard.cardId === "EX13-057");
        if (grademon && !preferInstanceIds.includes(grademon.permanentId)) preferInstanceIds.push(grademon.permanentId);
        return recordDecision(...entries);
      };
      const loop = s.engine.runOneTurn();
      try {
        await settle(() => s.state.phase === Phase.Breeding);
        expect(s.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
        await advance(s.engine).waitForMainPhase(0);
        expect(s.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
        await loop;
        await settle(() => !s.state.pendingDecision && !s.state.combatWindow);
        const grademon = s.state.players[0]!.battleArea.find(({ topCard }) => topCard.cardId === "EX13-057");
        expect(grademon).toBeDefined();
        expect(grademon!.currentDP).toBe(expectedDP);
        expect(grademon!.immuneToOpponentDigimonEffects).toBe(immune);
        expect(s.state.players[1]!.security).toHaveLength(2);
        const attackIndex = s.events.findIndex((event) => event.kind === "attackDeclared");
        const onPlayIndex = s.events.findIndex(
          (event) => event.kind === "effectTriggered" && event.sourceCardId === "EX13-057" && event.timing === "OnPlay",
        );
        expect(attackIndex).toBeGreaterThan(-1);
        expect(onPlayIndex).toBeGreaterThan(-1);
        expect(onPlayIndex > attackIndex).toBe(immune);
        expect(s.state.phase).toBe(Phase.End);
      } finally {
        s.engine.applyIntent(0, { type: "surrender" });
        await loop;
      }
    },
  );
});
