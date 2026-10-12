import "#api/cards/index";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { Phase } from "@aegis/shared/schema/enums";
import type { ServerEvent } from "@aegis/shared/protocol/events";
import { advance } from "#api/engine/testkit/advance";
import { settle } from "#api/engine/testkit/harness";
import { setupScenario } from "#api/engine/testkit/scenario";
import { runReplay } from "#api/replays/inputs/run";
import type { ReplayRecord } from "#api/replays/inputs/types";
import fixture from "#api/engine/scenarios/self-deletion-effect-continuation.fixture";

describe("Self-deletion cost preserves the resolving effect", () => {
  it.each([true, false])(
    "pays the cost and resolves On Deletion with only DUAL targets: %s",
    async (onlyDualTarget) => {
      const s = setupScenario(fixture({ onlyDualTarget }), {
        autoAcceptOptional: true,
        autoSelectCards: true,
        autoChooseOption: true,
      });
      const loop = s.engine.runOneTurn();
      try {
        await settle(() => s.state.phase === Phase.Breeding);
        expect(s.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
        await advance(s.engine).waitForMainPhase(0);
        expect(s.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
        await loop;
        expect(s.state.pendingDecision).toBeUndefined();
        expect(s.state.players[0]!.battleArea.map(({ topCard }) => topCard.instanceId)).toEqual([
          s.inst("revealedMamemon").instanceId,
        ]);
        expect(s.state.players[0]!.trash.map(({ cardId }) => cardId)).toContain("EX13-059");
        expect(s.state.players[1]!.battleArea.map(({ permanentId }) => permanentId)).toEqual([
          s.perm("dualTarget").permanentId,
        ]);
        expect(s.state.players[1]!.trash.map(({ cardId }) => cardId)).toEqual(onlyDualTarget ? [] : ["ST1-03"]);
        const deletion = s.events.findIndex(
          (event) => event.kind === "cardsMoved" && event.deletedPermanents?.some(({ cardId }) => cardId === "ST1-03"),
        );
        const onDeletion = s.events.findIndex(
          (event) =>
            event.kind === "effectTriggered" &&
            event.sourceCardId === "EX13-059" &&
            event.timing === "OnDestroyedAnyone",
        );
        expect(deletion >= 0).toBe(!onlyDualTarget);
        expect(onDeletion).toBeGreaterThan(deletion);
      } finally {
        s.engine.applyIntent(0, { type: "surrender" });
        await loop;
      }
    },
  );

  it("reproduces the reported self-deletion with a DUAL Digimon as the only opponent Digimon", async () => {
    const record = JSON.parse(
      readFileSync(new URL("./self-deletion-effect-continuation.replay.json", import.meta.url), "utf8"),
    ) as ReplayRecord;
    const events: ServerEvent[] = [];
    const replay = await runReplay(record, { untilInput: 52, onBatch: (_state, batch) => events.push(...batch) });
    try {
      expect(replay.divergences).toEqual([]);
      expect(replay.state.players[0]!.battleArea.map(({ topCard }) => topCard.cardId)).toEqual([
        "BT24-098",
        "BT26-056",
      ]);
      const pending = replay.state.pendingDecision!;
      expect(pending.kind).toBe("optional");
      expect(
        await replay.applyIntent(1, {
          type: "respondDecision",
          decisionId: pending.decisionId,
          response: { kind: "optional", accept: true },
        }),
      ).toEqual({ ok: true });
      expect(replay.state.players[1]!.battleArea.some(({ topCard }) => topCard.instanceId === "s1-37")).toBe(false);
      expect(replay.state.players[0]!.battleArea.some(({ topCard }) => topCard.cardId === "BT26-056")).toBe(true);
      expect(replay.state.pendingDecision?.kind).toBe("orderTriggers");
      const options = JSON.parse(replay.state.pendingDecision!.payloadJson) as { triggerCardIds: string[] };
      expect(options.triggerCardIds).toContain("EX13-059");
      expect(events).toContainEqual(
        expect.objectContaining({ kind: "effectResolved", sourceCardId: "EX13-059", timing: "OnEndTurn" }),
      );
    } finally {
      await replay.applyIntent(1, { type: "surrender" });
    }
  });
});
