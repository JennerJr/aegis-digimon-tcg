import fixtureParkourSequential from "../../api/src/engine/scenarios/parkour-sequential.fixture";
import { fixtureInstanceId } from "../../api/src/engine/scenario/references";
import { test, expect } from "./scenario-page";

test("a placed Parkour ends the waiver; a blue/green Tamer permits the second copy", async ({ scenario }) => {
  await scenario.openFixture(fixtureParkourSequential, "normal", "none");
  await scenario.resolveUntil((s) => s.phase === "Main" && !s.pendingDecision);
  // Equivalent starting copies need explicit instance selectors to keep the sequential proof deterministic.
  const first = scenario.page.locator(`[data-hand-instance-id="${fixtureInstanceId("first-card")}"]`);
  await first.focus();
  await first.press("Enter");
  await scenario.page.getByRole("button", { name: "Play Option", exact: true }).click();
  await scenario.resolveUntil(
    (s) =>
      s.players[0]!.battleArea.some((p) => p.topCard.instanceId === fixtureInstanceId("first-card")) &&
      !s.pendingDecision,
    () => ({ instanceId: fixtureInstanceId("deck-1-card") }),
  );
  expect((await scenario.snapshot()).memory).toBe(6);
  await scenario.healthy();
  await scenario.hand("Parkour Training");
  await expect(scenario.page.getByRole("dialog", { name: "Parkour Training", exact: true })).toBeVisible();
  await expect(scenario.page.getByRole("button", { name: "Play Option", exact: true })).toHaveCount(0);
  await scenario.page
    .getByRole("dialog", { name: "Parkour Training", exact: true })
    .getByRole("button", { name: "Close", exact: true })
    .click();
  expect(
    (await scenario.snapshot()).players[0]!.hand.some((c) => c.instanceId === fixtureInstanceId("second-card")),
  ).toBe(true);
  await scenario.play("Davis Motomiya & Ken Ichijoji", "Tamer");
  await scenario.resolveUntil(
    (s) => s.players[0]!.battleArea.some((p) => p.topCard.cardId === "BT16-085") && !s.pendingDecision,
  );
  expect((await scenario.snapshot()).memory).toBe(2);
  await scenario.play("Parkour Training", "Option");
  await scenario.resolveUntil(
    (s) =>
      s.players[0]!.battleArea.some((p) => p.topCard.instanceId === fixtureInstanceId("second-card")) &&
      !s.pendingDecision,
    () => ({ instanceId: fixtureInstanceId("deck-3-card") }),
  );
  const state = await scenario.snapshot();
  expect(state.memory).toBe(0);
  expect(state.turnSeat).toBe(0);
  expect(state.players[0]!.battleArea.map((p) => p.topCard.cardId)).toEqual(["LM-058", "BT16-085", "LM-058"]);
  expect(state.players[0]!.hand.map((c) => c.instanceId)).toEqual([
    fixtureInstanceId("deck-0-card"),
    fixtureInstanceId("deck-3-card"),
  ]);
  expect(state.players[0]!.trash).toHaveLength(0);
  await scenario.healthy();
});
