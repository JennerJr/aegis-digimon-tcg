import { test, expect } from "@e2e/scenario-page";
import { stubCardArtwork } from "@e2e/card-artwork";
import fixture from "@api-fixtures/bot-selects-distinct-evolution-sources.fixture";

test.beforeEach(async ({ page }) => stubCardArtwork(page));

test("the bot finishes Chaosdramon's distinct-card placement without waiting for decision expiry", async ({
  scenario,
}) => {
  const refs = await scenario.openFixture(fixture);
  await expect
    .poll(
      async () => {
        const state = await scenario.snapshot();
        return state.players[1]!.battleArea.some(
          ({ topCard }) => topCard.instanceId === refs.instanceId("chaosdramon"),
        );
      },
      { timeout: 15000 },
    )
    .toBe(true);
  await expect
    .poll(
      async () => {
        const state = await scenario.snapshot();
        const chaosdramon = state.players[1]!.battleArea.find(
          ({ permanentId }) => permanentId === refs.permanentId("base"),
        );
        return chaosdramon?.stack.length === 4 && !state.pendingDecision;
      },
      { timeout: 10000 },
    )
    .toBe(true);
  await scenario.idle();
  const after = await scenario.snapshot();
  const chaosdramon = after.players[1]!.battleArea.find(({ permanentId }) => permanentId === refs.permanentId("base"))!;
  expect(
    chaosdramon.stack
      .slice(0, 3)
      .map(({ cardId }) => cardId)
      .sort(),
  ).toEqual(["BT1-021", "BT2-060", "BT2-061"]);
  expect(after.players[1]!.trash.map(({ cardId }) => cardId)).toEqual(["BT1-021", "BT1-021"]);
  const target = after.players[0]!.battleArea.find(({ permanentId }) => permanentId === refs.permanentId("target"))!;
  expect(target.topCard.cardId).toBe("BT1-009");
  expect(target.stack).toHaveLength(0);
  await scenario.healthy();
});
