import fixtureSukamonOpponentCost from "../../api/src/engine/scenarios/sukamon-opponent-cost.fixture";
import { fixtureInstanceId } from "../../api/src/engine/scenario/references";
import { test, expect } from "./scenario-page";

test.use({ holdBotAfterTurn: 4 });

test("/ Q7288: Sukamon's inherited cost selects the opposing Sukamon", async ({ scenario, page }) => {
  await scenario.openFixture(fixtureSukamonOpponentCost);
  await scenario.resolveUntil((s) => s.phase === "Main" && !s.pendingDecision);
  await page.getByRole("button", { name: /^end turn$/i }).click();
  await expect.poll(async () => (await scenario.snapshot()).pendingDecision?.seat, { timeout: 60_000 }).toBe(0);
  await scenario.resolveUntil(
    (s) =>
      s.players[1]!.trash.some((c) => c.instanceId === fixtureInstanceId("report-gaia-card")) && !s.pendingDecision,
    (d) => (d.kind === "chooseTargets" || d.kind === "selectCards" ? { cardId: "BT3-060" } : {}),
  );
  const final = await scenario.snapshot();
  expect(final.players[0]!.battleArea[0]!.topCard.cardId).toBe("EX13-015");
  expect(final.players[0]!.battleArea[0]!.stack.map((c) => c.cardId)).toEqual(["EX13-028"]);
  expect(final.players[1]!.trash.some((c) => c.cardId === "BT3-060")).toBe(true);
  const events = (await scenario.presentation()).events;
  expect(events.some((e) => e.kind === "actionRejected")).toBe(false);
  await scenario.healthy();
});
