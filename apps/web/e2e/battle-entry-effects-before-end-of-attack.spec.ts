import { test, expect } from "@e2e/scenario-page";
import { stubCardArtwork } from "@e2e/card-artwork";
import fixture from "@api-fixtures/battle-entry-effects-before-end-of-attack.fixture";

test.beforeEach(async ({ page }) => stubCardArtwork(page));

test("Lunamon finishes its source-played On Play before Grademon evolves at End of Attack", async ({ scenario }) => {
  const refs = await scenario.openFixture(fixture);
  await scenario.resolveUntil((state) => state.phase === "Main" && !state.pendingDecision);
  await scenario.play("Ryudamon", "Digimon");
  await scenario.resolveUntil(
    (state) =>
      !state.pendingDecision &&
      !state.combatWindow &&
      state.players[0]!.battleArea.find((permanent) => permanent.permanentId === refs.permanentId("grademon"))?.topCard
        .cardId === "BT20-018",
    (decision) => {
      if (decision.kind === "optional" && decision.sourceCardId === "EX13-057") return { decisionBudgetMs: 12_000 };
      if (decision.options.selectionContext === "attackSource") return { instanceId: refs.permanentId("grademon") };
      if (decision.kind === "chooseTargets") return { instanceId: refs.permanentId("blocker") };
      if (decision.kind === "selectCards" && decision.sourceCardId === "EX13-057")
        return { instanceId: refs.instanceId("ouryumon") };
      return {};
    },
  );
  await expect
    .poll(async () => (await scenario.presentation()).events.some((event) => event.kind === "attackEnded"))
    .toBe(true);
  const events = (await scenario.presentation()).events;
  const lunamonResolved = events.findIndex(
    (event) => event.kind === "effectResolved" && event.sourceCardId === "BT25-022",
  );
  const endOfAttack = events.findIndex(
    (event) => event.kind === "effectTriggered" && event.sourceCardId === "EX13-057",
  );
  expect(lunamonResolved).toBeGreaterThan(-1);
  expect(endOfAttack).toBeGreaterThan(lunamonResolved);
  expect(events).toContainEqual(
    expect.objectContaining({ kind: "blocked", blockerPermanentId: refs.permanentId("blocker") }),
  );
  expect(events).toContainEqual(expect.objectContaining({ kind: "cardPlayed", cardId: "BT25-022" }));
  const after = await scenario.snapshot();
  expect(
    after.players[1]!.battleArea.some((permanent) => permanent.topCard.instanceId === refs.instanceId("lunamon")),
  ).toBe(true);
  expect(after.players[1]!.handCount).toBe(2);
  expect(after.pendingDecision).toBeUndefined();
  expect(after.combatWindow).toBeUndefined();
  expect(after.memory).toBe(4);
  await scenario.healthy();
});
