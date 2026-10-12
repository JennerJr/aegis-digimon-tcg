import { describe, expect, it } from "vitest";
import { setupScenario } from "#api/engine/testkit/scenario";
import { advance } from "#api/engine/testkit/advance";
import { settle } from "#api/engine/testkit/harness";
import fixture from "#api/engine/scenarios/thetismon-own-suspension.fixture";
import "#api/cards/EX12/EX12-030";

describe("Thetismon inherited suspension identity", () => {
  it("ignores another Digimon's attack and preserves its return cost for its own attack", async () => {
    const s = setupScenario(fixture, { autoAcceptOptional: true, autoSelectCards: true });
    const loop = s.engine.startTurnLoop();
    try {
      await advance(s.engine).waitForMainPhase(0);
      for (const [alias, securityLeft, trashLeft, suspended] of [
        ["bystander", 3, 3, true],
        ["host", 2, 0, false],
      ] as const) {
        expect(
          s.engine.applyIntent(0, {
            type: "attack",
            attackerPermanentId: s.perm(alias).permanentId,
            target: { kind: "player" },
          }),
        ).toEqual({ ok: true });
        await settle(
          () =>
            s.events.filter((event) => event.kind === "attackEnded").length === 4 - securityLeft &&
            !s.state.pendingDecision,
        );
        expect(s.state.players[0]!.trash).toHaveLength(trashLeft);
        expect(s.perm(alias).isSuspended).toBe(suspended);
      }
      expect(
        s.events.filter((event) => event.kind === "effectTriggered" && event.sourceCardId === "EX12-030"),
      ).toHaveLength(1);
    } finally {
      s.engine.applyIntent(0, { type: "surrender" });
      await loop;
    }
  });
});
