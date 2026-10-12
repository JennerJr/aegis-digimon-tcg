import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { ServerEvent } from "@aegis/shared/protocol/events";
import { runReplay } from "#api/replays/inputs/run";
import type { ReplayRecord } from "#api/replays/inputs/types";
import { Phase } from "@aegis/shared/schema/enums";
import { setupScenario } from "#api/engine/testkit/scenario";
import { settle } from "#api/engine/testkit/harness";
import { observe } from "#api/engine/testkit/observe";
import fixture from "#api/engine/scenarios/battle-entry-effects-before-end-of-attack.fixture";

const record = JSON.parse(
  readFileSync(new URL("./battle-entry-effects-before-end-of-attack.replay.json", import.meta.url), "utf8"),
) as ReplayRecord;

describe("Battle entry effects resolve before End of Attack", () => {
  it("settles the source-played Lunamon before ending Alphamon's ordered attack", async () => {
    const preferred: string[] = [];
    const s = setupScenario(fixture, {
      autoAcceptOptional: true,
      autoSelectCards: true,
      autoChooseOption: true,
      preferInstanceIds: preferred,
    });
    preferred.push(s.perm("grademon").permanentId, s.inst("lunamon").instanceId);
    const loop = s.engine.startTurnLoop();
    try {
      await settle(() => s.state.phase === Phase.Breeding);
      expect(s.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
      await settle(() => s.state.phase === Phase.Main);
      expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("playedChronicle").instanceId })).toEqual({
        ok: true,
      });
      await settle(() => observe(s.engine).blockingSeat() === 1);
      expect(
        s.engine.applyIntent(1, { type: "declareBlock", blockerPermanentId: s.perm("blocker").permanentId }),
      ).toEqual({ ok: true });
      await settle(() => s.events.some((event) => event.kind === "attackEnded") && !s.state.pendingDecision);
      const lunamonResolved = s.events.findIndex(
        (event) => event.kind === "effectResolved" && event.sourceCardId === "BT25-022",
      );
      const endOfAttack = s.events.findIndex(
        (event) => event.kind === "effectTriggered" && event.sourceCardId === "EX13-057",
      );
      expect(lunamonResolved).toBeGreaterThan(-1);
      expect(endOfAttack).toBeGreaterThan(lunamonResolved);
      expect(s.perm("grademon").topCard.cardId).toBe("BT20-018");
      expect(
        s.state.players[1]!.battleArea.some(
          (permanent) => permanent.topCard.instanceId === s.inst("lunamon").instanceId,
        ),
      ).toBe(true);
      expect(s.state.players[1]!.hand.map((card) => card.instanceId)).toEqual(
        expect.arrayContaining([s.inst("revealedIliad").instanceId, s.inst("revealedTs").instanceId]),
      );
    } finally {
      s.engine.applyIntent(0, { type: "surrender" });
      await loop;
    }
  });

  it("activates the Lunamon played from sources before Grademon's End of Attack in the recorded match", async () => {
    const events: ServerEvent[] = [];
    const replay = await runReplay(record, { untilInput: 88, onBatch: (_state, batch) => events.push(...batch) });
    try {
      expect(replay.divergences).toEqual([]);
      const input = record.inputs[88]!;
      if (
        input.kind !== "intent" ||
        input.intent.type !== "respondDecision" ||
        input.intent.response.kind !== "selectCards"
      )
        throw new Error("Expected the recorded source-card selection");
      const playedId = input.intent.response.instanceIds[0]!;
      expect(
        [...replay.state.players[input.seat]!.battleArea]
          .flatMap((permanent) => [...permanent.stack])
          .find((card) => card.instanceId === playedId)?.cardId,
      ).toBe("BT25-022");
      const beforePlay = events.length;
      expect(await replay.applyIntent(input.seat, input.intent)).toEqual({ ok: true });
      const emitted = events.slice(beforePlay);
      expect(replay.state.pendingDecision).toMatchObject({
        promptText: "Lunamon",
        kind: "selectCards",
        seat: input.seat,
      });
      expect(JSON.parse(replay.state.pendingDecision!.payloadJson)).toMatchObject({
        timing: "OnPlay",
        effectKey: expect.stringMatching(/^BT25-022\//),
      });
      expect(emitted).toContainEqual(expect.objectContaining({ kind: "effectTriggered", sourceCardId: "BT25-022" }));
      expect(
        emitted.filter((event) => event.kind === "effectTriggered" && event.sourceCardId === "EX13-057"),
      ).toHaveLength(0);
      expect(emitted.some((event) => event.kind === "attackEnded")).toBe(false);
    } finally {
      await replay.applyIntent(replay.state.turnSeat as 0 | 1, { type: "surrender" });
    }
  });
});
