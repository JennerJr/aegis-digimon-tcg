import fixtureBlastDnaDecision from "../../api/src/engine/scenarios/blast-dna-decision.fixture";
import { fixtureInstanceId } from "../../api/src/engine/scenario/references";
import { test, expect } from "./scenario-page";

test.use({ holdBotAfterTurn: 4 });

for (const skipReturn of [false, true]) {
  test(`Omnimon ACE hands Counter off to its target decision (skip return: ${skipReturn})`, async ({
    scenario,
    page,
  }) => {
    await scenario.openFixture(fixtureBlastDnaDecision);
    await scenario.resolveUntil((s) => s.phase === "Main" && !s.pendingDecision);
    await page.getByRole("button", { name: /^end turn$/i }).click();
    await scenario.resolveUntil(
      (s) => s.turnSeat === 1 && !s.pendingDecision,
      () => ({ accept: false }),
    );
    const counter = page.getByRole("region", { name: "Counter timing", exact: true });
    await expect(counter).toBeVisible();
    const before = await scenario.snapshot();
    const routes = JSON.parse(before.combatWindow!.eligibleCountersJson) as { instanceId: string; effectKey: string }[];
    expect(routes).toHaveLength(3);
    const route = routes.find((c) => c.effectKey.includes(JSON.stringify(fixtureInstanceId("metal-a-card"))))!;
    const ace = page.locator(`[data-hand-instance-id="${route.instanceId}"]`);
    await ace.focus();
    await ace.press("Enter");
    await page
      .getByRole("button", { name: /WarGreymon.*Blast DNA.*MetalGarurumon/ })
      .first()
      .click();
    await expect(counter).toBeHidden();
    await scenario.resolveUntil(
      (s) => s.players[1]!.battleArea.length === 0 && !s.pendingDecision && !s.combatWindow,
      () => ({ accept: !skipReturn }),
    );
    const final = await scenario.snapshot();
    const result = final.players[0]!.battleArea.find((p) => p.topCard.cardId === "BT17-078")!;
    expect(result).toBeDefined();
    expect(result.stack.map((c) => c.instanceId)).toContain(fixtureInstanceId("metal-a-card"));
    expect(final.players[0]!.hand.some((c) => c.instanceId === fixtureInstanceId("metal-a-card"))).toBe(false);
    expect(final.players[0]!.hand.some((c) => c.instanceId === fixtureInstanceId("metal-b-card"))).toBe(true);
    const probe = await scenario.presentation();
    expect(probe.events.filter((e) => e.kind === "counterResolved")).toEqual([
      expect.objectContaining({ activated: true }),
    ]);
    expect(probe.events.filter((e) => e.kind === "securityChecked")).toHaveLength(0);
    await scenario.healthy();
  });
}
