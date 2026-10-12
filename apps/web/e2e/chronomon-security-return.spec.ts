import fixtureChronomonSecurityReturn from "../../api/src/engine/scenarios/chronomon-security-return.fixture";
import { fixtureInstanceId } from "../../api/src/engine/scenario/references";
import { test, expect } from "./scenario-page";

for (const accept of [true, false]) {
  test(`${accept ? "accepting" : "refusing"} Chronomon's security return cost ${accept ? "activates Holy's inherited effect" : "preserves security and deletes Chronomon"}`, async ({
    scenario,
  }) => {
    await scenario.openFixture(fixtureChronomonSecurityReturn);
    await scenario.resolveUntil((s) => s.phase === "Main" && !s.pendingDecision);
    const before = await scenario.snapshot();
    const chronomon = before.players[0]!.battleArea.find((p) => p.topCard.cardId === "BT26-016")!;
    const target = before.players[1]!.battleArea.find((p) => p.topCard.cardId === "ST2-11")!;
    expect(chronomon.stack.map((c) => c.cardId)).toEqual(["BT26-029"]);
    let preventionChoices = 0;
    await scenario.attack(chronomon.permanentId);
    await scenario.resolveUntil(
      (s) => !s.pendingDecision && !s.combatWindow && s.players[1]!.securityCount === 1,
      (decision) => {
        if (decision.options.purpose === "optionalTarget" && decision.options.min === 0) return { accept: false };
        if (decision.kind !== "optional") return {};
        if (decision.sourceCardId === "BT26-016" && /prevent leaving/i.test(decision.promptText)) {
          preventionChoices++;
          return { accept, decisionBudgetMs: 8_000 };
        }
        return { accept: false };
      },
    );
    const final = await scenario.snapshot();
    expect(preventionChoices).toBe(1);
    expect(final.memory).toBe(before.memory);
    expect(final.turnSeat).toBe(0);
    expect(final.players[1]!.securityCount).toBe(before.players[1]!.securityCount - 1);
    expect(final.players[1]!.trash.map((c) => c.instanceId)).toContain(fixtureInstanceId("gaia-security-card"));
    expect(final.players[0]!.securityCount).toBe(before.players[0]!.securityCount - Number(accept));
    // Security payment remains face down: check public zone counts, not its identity.
    expect(final.players[0]!.deckCount).toBe(before.players[0]!.deckCount + Number(accept));
    const survivingTarget = final.players[1]!.battleArea.find((p) => p.permanentId === target.permanentId)!;
    if (accept) {
      const survivor = final.players[0]!.battleArea.find((p) => p.permanentId === chronomon.permanentId)!;
      expect(survivor.topCard.instanceId).toBe(chronomon.topCard.instanceId);
      expect(survivor.stack.map((c) => c.instanceId)).toEqual(chronomon.stack.map((c) => c.instanceId));
      expect(survivor.isSuspended).toBe(true);
      expect(final.players[0]!.trash).toHaveLength(before.players[0]!.trash.length);
      expect(survivingTarget.topCard.instanceId).toBe(target.stack[0]!.instanceId);
      expect(survivingTarget.topCard.cardId).toBe("ST2-04");
      expect(survivingTarget.stack).toHaveLength(0);
      expect(final.players[1]!.trash.map((c) => c.instanceId)).toContain(target.topCard.instanceId);
    } else {
      expect(final.players[0]!.battleArea).toHaveLength(0);
      expect(final.players[0]!.trash.map((c) => c.instanceId)).toEqual(
        expect.arrayContaining([chronomon.topCard.instanceId, ...chronomon.stack.map((c) => c.instanceId)]),
      );
      expect(survivingTarget.topCard.instanceId).toBe(target.topCard.instanceId);
      expect(survivingTarget.stack.map((c) => c.instanceId)).toEqual(target.stack.map((c) => c.instanceId));
      expect(final.players[1]!.trash.map((c) => c.instanceId)).not.toContain(target.topCard.instanceId);
    }
    await scenario.healthy();
  });
}
