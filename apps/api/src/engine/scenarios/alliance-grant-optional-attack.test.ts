import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { Phase } from "@aegis/shared/schema/enums";
import type { DecisionResponse } from "@aegis/shared/protocol/intents";
import "#api/cards/index";
import { setupScenario } from "#api/engine/testkit/scenario";
import { settle } from "#api/engine/testkit/harness";
import { observe } from "#api/engine/testkit/observe";
import { allianceGrantOptionalAttack } from "#api/engine/scenarios/alliance-grant-optional-attack.fixture";
import { runReplay } from "#api/replays/inputs/run";
import type { ReplayRecord } from "#api/replays/inputs/types";

const record = JSON.parse(
  readFileSync(new URL("./alliance-grant-optional-attack.replay.json", import.meta.url), "utf8"),
) as ReplayRecord;

describe("Alliance grant with an independently optional attack", () => {
  it.each([
    { simultaneousWatcher: false, presetActivation: false },
    { simultaneousWatcher: true, presetActivation: false },
    { simultaneousWatcher: true, presetActivation: true },
  ])(
    "retains Alliance after declining attacks with simultaneous watcher $simultaneousWatcher and activation preset $presetActivation",
    async ({ simultaneousWatcher, presetActivation }) => {
      const s = setupScenario(allianceGrantOptionalAttack({ simultaneousWatcher }), { autoOrderTriggers: false });
      const loop = s.engine.startTurnLoop();
      let attackChoices = 0;
      try {
        await settle(() => s.state.phase === Phase.Breeding);
        expect(s.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
        await settle(() => s.state.phase === Phase.Main);
        expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("playedAdventure").instanceId })).toEqual(
          { ok: true },
        );
        const expectedAttackChoices = simultaneousWatcher ? 2 : 1;
        while (attackChoices < expectedAttackChoices) {
          await settle(() => s.state.pendingDecision !== undefined);
          const decision = s.decisions.at(-1)!.req;
          expect(["orderTriggers", "chooseTargets", "optional"]).toContain(decision.kind);
          expect(decision.options?.selectionContext === "attackSource").toBe(decision.kind === "optional");
          let response: DecisionResponse;
          if (decision.kind === "orderTriggers") {
            const order = decision.options!.triggerKeys!;
            response = {
              kind: "orderTriggers",
              order,
              ...(presetActivation ? { optionalAnswers: Object.fromEntries(order.map((key) => [key, true])) } : {}),
            };
          } else if (decision.kind === "chooseTargets") {
            response = { kind: "chooseTargets", instanceIds: [s.perm("allianceRecipient").permanentId] };
          } else {
            attackChoices += 1;
            response = { kind: "optional", accept: false };
          }
          expect(
            s.engine.applyIntent(0, { type: "respondDecision", decisionId: decision.decisionId, response }),
          ).toEqual({ ok: true });
          await settle(() => s.state.pendingDecision?.decisionId !== decision.decisionId);
        }
        await settle(() => s.state.pendingDecision === undefined);
        expect(observe(s.engine).hasKeyword(s.perm("allianceRecipient"), "Alliance")).toBe(true);
        expect(s.events.some((event) => event.kind === "attackDeclared")).toBe(false);
        expect(s.state.players[0]!.battleArea.every((permanent) => !permanent.isSuspended)).toBe(true);
        expect(s.state.players[1]!.security).toHaveLength(2);
        expect(s.state.memory).toBe(7);
        expect(s.state.phase).toBe(Phase.Main);
      } finally {
        s.engine.applyIntent(0, { type: "surrender" });
        await loop;
      }
    },
  );

  it("offers attack refusal after granting Alliance in the recorded resolution plan", async () => {
    const replay = await runReplay(record, { untilInput: 43 });
    try {
      expect(replay.divergences).toEqual([]);
      expect(replay.applied).toBe(43);
      expect(replay.pendingRequest).toMatchObject({
        kind: "optional",
        sourceCardId: "BT21-078",
        options: { selectionContext: "attackSource" },
      });
      expect(
        await replay.applyIntent(0, {
          type: "respondDecision",
          decisionId: replay.state.pendingDecision!.decisionId,
          response: { kind: "optional", accept: true },
        }),
      ).toEqual({ ok: true });
      for (const input of record.inputs.slice(43)) {
        if (input.kind !== "intent") throw new Error("Expected the recorded match intents");
        let intent = input.intent;
        const expectedDecisionKind = intent.type === "respondDecision" ? intent.response.kind : undefined;
        expect(replay.state.pendingDecision?.kind).toBe(expectedDecisionKind);
        if (intent.type === "respondDecision") {
          const pending = replay.state.pendingDecision!;
          intent = { ...intent, decisionId: pending.decisionId };
        }
        expect(await replay.applyIntent(input.seat, intent)).toEqual({ ok: true });
      }
      expect(replay.state.pendingDecision).toMatchObject({ kind: "optional", promptText: expect.any(String) });
      expect(JSON.parse(replay.state.pendingDecision!.payloadJson)).toMatchObject({
        selectionContext: "attackSource",
        effectKey: expect.stringContaining("ST21-09"),
      });
      expect(replay.state.turnCount).toBe(9);
      expect(replay.state.memory).toBe(7);
      const attacker = replay.state.players[0]!.battleArea.find((permanent) => permanent.permanentId === "perm-1")!;
      expect(observe(replay.engine).hasKeyword(attacker, "Alliance")).toBe(true);
      expect(
        await replay.applyIntent(0, {
          type: "respondDecision",
          decisionId: replay.state.pendingDecision!.decisionId,
          response: { kind: "optional", accept: false },
        }),
      ).toEqual({ ok: true });
      expect(observe(replay.engine).isAttacking()).toBe(false);
      expect(attacker.isSuspended).toBe(false);
      expect(replay.state.players[1]!.security).toHaveLength(2);
      expect(observe(replay.engine).hasKeyword(attacker, "Alliance")).toBe(true);
    } finally {
      await replay.applyIntent(0, { type: "surrender" });
    }
  });
});
