import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { ServerEvent } from "@aegis/shared/protocol/events";
import { runReplay } from "#api/replays/inputs/run";
import type { ReplayRecord } from "#api/replays/inputs/types";
import { Phase } from "@aegis/shared/schema/enums";
import { setupScenario } from "#api/engine/testkit/scenario";
import { settle } from "#api/engine/testkit/harness";
import { observe } from "#api/engine/testkit/observe";
import fixture from "#api/engine/scenarios/blast-digivolve-preserves-attack-target.fixture";

const record = JSON.parse(
  readFileSync(new URL("./blast-digivolve-preserves-attack-target.replay.json", import.meta.url), "utf8"),
) as ReplayRecord;

describe("Blast Digivolve preserves the attacked Digimon", () => {
  it("preserves Gankoomon's permanent identity in the shared browser fixture", async () => {
    const s = setupScenario(fixture, { autoDeclineOptional: true });
    const loop = s.engine.startTurnLoop();
    try {
      await settle(() => s.state.phase === Phase.Breeding);
      expect(s.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
      await settle(() => s.state.phase === Phase.Main);
      const defenderId = s.perm("gankoomon").permanentId;
      expect(
        s.engine.applyIntent(0, {
          type: "attack",
          attackerPermanentId: s.perm("attacker").permanentId,
          target: { kind: "permanent", permanentId: defenderId },
        }),
      ).toEqual({ ok: true });
      await settle(() => s.events.some((event) => event.kind === "counterWindowOpened"));
      const counter = s.events.find((event) => event.kind === "counterWindowOpened");
      if (counter?.kind !== "counterWindowOpened") throw new Error("Expected the Counter window");
      const route = counter.eligibleCounters.find((entry) => entry.instanceId === s.inst("jesmonGx").instanceId)!;
      expect(route.effectKey).toBe(`blast-digivolve:${defenderId}`);
      expect(
        s.engine.applyIntent(1, {
          type: "respondCounter",
          sourceInstanceId: route.instanceId,
          effectKey: route.effectKey,
        }),
      ).toEqual({ ok: true });
      await settle(() => !observe(s.engine).isAttacking() && !s.state.pendingDecision);
      expect(s.events).toContainEqual(
        expect.objectContaining({ kind: "digivolved", permanentId: defenderId, cardId: "BT20-021", mechanic: "blast" }),
      );
      expect(s.events).toContainEqual(
        expect.objectContaining({ kind: "battleCompared", defenderPermanentId: defenderId }),
      );
      expect(s.state.players[1]!.battleArea).toHaveLength(0);
      expect(s.state.players[1]!.trash.map((card) => card.instanceId)).toEqual(
        expect.arrayContaining([s.inst("jesmonGx").instanceId, s.inst("gankoomon").instanceId]),
      );
      expect(s.state.players[1]!.security).toHaveLength(3);
    } finally {
      s.engine.applyIntent(0, { type: "surrender" });
      await loop;
    }
  });

  it("preserves the recorded attack target after the corrected Takato material flow", async () => {
    const events: ServerEvent[] = [];
    const replay = await runReplay(record, { untilInput: 82, onBatch: (_state, batch) => events.push(...batch) });
    try {
      expect(replay.divergences).toEqual([]);
      expect(replay.pendingRequest).toMatchObject({
        kind: "selectCards",
        sourceCardId: "BT12-089",
        options: { candidateInstanceIds: ["s0-12", "s0-11"] },
      });
      for (const next of record.inputs.slice(83, 94)) {
        if (next.kind !== "intent" || next.intent.type !== "respondDecision")
          throw new Error("Expected the recorded post-Takato decisions");
        const pending = replay.state.pendingDecision!;
        expect(pending.kind).toBe(next.intent.response.kind);
        expect(await replay.applyIntent(next.seat, { ...next.intent, decisionId: pending.decisionId })).toEqual({
          ok: true,
        });
      }
      const input = record.inputs[94]!;
      if (input.kind !== "intent" || input.intent.type !== "respondCounter" || !input.intent.effectKey)
        throw new Error("Expected the recorded Blast Digivolve Counter");
      const defenderId = input.intent.effectKey.split(":").at(-1)!;
      const jesmonGxId = input.intent.sourceInstanceId;
      const player = replay.state.players[input.seat]!;
      const original = player.battleArea.find((permanent) => permanent.permanentId === defenderId)!;
      expect(original.topCard.cardId).toBe("EX13-061");
      const gankoomonId = original.topCard.instanceId;
      const originalAttack = events.findLast((event) => event.kind === "attackDeclared");
      expect(originalAttack).toMatchObject({ target: { kind: "permanent", permanentId: defenderId } });
      expect(await replay.applyIntent(input.seat, input.intent)).toEqual({ ok: true });
      const evolved = player.battleArea.find((permanent) => permanent.permanentId === defenderId)!;
      expect(evolved.topCard.cardId).toBe("BT20-021");
      expect(evolved.topCard.instanceId).toBe(jesmonGxId);
      expect(evolved.stack.some((card) => card.instanceId === gankoomonId)).toBe(true);
      const beforeBattle = events.length;
      for (const next of record.inputs.slice(95)) {
        if (next.kind !== "intent" || next.intent.type !== "respondDecision")
          throw new Error("Expected the recorded placement decisions");
        const pending = replay.state.pendingDecision!;
        expect(pending.kind).toBe(next.intent.response.kind);
        expect(await replay.applyIntent(next.seat, { ...next.intent, decisionId: pending.decisionId })).toEqual({
          ok: true,
        });
      }
      const resolvedEvents = events.slice(beforeBattle);
      expect(resolvedEvents).toContainEqual(
        expect.objectContaining({ kind: "battleCompared", defenderPermanentId: defenderId }),
      );
      expect(resolvedEvents).toContainEqual(
        expect.objectContaining({ kind: "combatResolved", deletedPermanentIds: [defenderId] }),
      );
      expect(player.battleArea.some((permanent) => permanent.permanentId === defenderId)).toBe(false);
      expect(player.trash.some((card) => card.instanceId === jesmonGxId)).toBe(true);
      expect(replay.state.pendingDecision).toBeUndefined();
    } finally {
      await replay.applyIntent(replay.state.turnSeat as 0 | 1, { type: "surrender" });
    }
  });
});
