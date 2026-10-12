import { test, expect } from "@e2e/scenario-page";
import { stubCardArtwork } from "@e2e/card-artwork";
import fixture from "@api-fixtures/self-deletion-effect-continuation.fixture";

test.beforeEach(async ({ page }) => stubCardArtwork(page));

for (const onlyDualTarget of [true, false]) {
  test(`BigMamemon finishes its self-deletion effect with only DUAL targets: ${onlyDualTarget}`, async ({
    scenario,
    page,
  }) => {
    const refs = await scenario.openFixture(fixture({ onlyDualTarget }));
    await scenario.resolveUntil((state) => state.phase === "Main" && !state.pendingDecision);
    await page.getByRole("button", { name: /^end turn$/i }).click();
    await scenario.resolveUntil(
      (state) => state.turnSeat === 1 && !state.pendingDecision,
      (decision) => (decision.kind === "selectCards" ? { instanceId: refs.instanceId("revealedMamemon") } : {}),
    );
    const after = await scenario.snapshot();
    expect(after.players[0]!.battleArea.map(({ topCard }) => topCard.instanceId)).toEqual([
      refs.instanceId("revealedMamemon"),
    ]);
    expect(after.players[0]!.trash.map(({ cardId }) => cardId)).toContain("EX13-059");
    expect(after.players[1]!.battleArea.map(({ permanentId }) => permanentId)).toEqual([
      refs.permanentId("dualTarget"),
    ]);
    expect(after.players[1]!.trash.map(({ cardId }) => cardId)).toEqual(onlyDualTarget ? [] : ["ST1-03"]);
    const events = (await scenario.presentation()).events;
    expect(events).toContainEqual(expect.objectContaining({ kind: "cardPlayed", cardId: "BT6-063" }));
    if (!onlyDualTarget) {
      const deletion = events.findIndex(
        (event) => event.kind === "cardsMoved" && event.deletedPermanents?.some(({ cardId }) => cardId === "ST1-03"),
      );
      const onDeletion = events.findIndex(
        (event) =>
          event.kind === "effectTriggered" && event.sourceCardId === "EX13-059" && event.timing === "OnDestroyedAnyone",
      );
      expect(deletion).toBeGreaterThan(-1);
      expect(onDeletion).toBeGreaterThan(deletion);
    }
    await scenario.healthy();
  });
}
