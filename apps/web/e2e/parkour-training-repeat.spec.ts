import fixture from "../../api/src/engine/scenarios/parkour-training-repeat.fixture";
import { test, expect } from "./scenario-page";

for (const sources of [false, true]) {
  test(`second Parkour Training obeys color requirements with sources=${sources}`, async ({ scenario, page }) => {
    await page.setViewportSize(sources ? { width: 1440, height: 1000 } : { width: 390, height: 844 });
    const refs = await scenario.openFixture(
      {
        ...fixture,
        board: {
          ...fixture.board,
          0: {
            ...fixture.board[0],
            battleArea: sources
              ? [
                  { card: "BT1-028", as: "blueSource" },
                  { card: "BT1-064", as: "greenSource" },
                ]
              : [],
          },
        },
      },
      "normal",
      "none",
    );
    await scenario.resolveUntil((state) => state.phase === "Main" && !state.pendingDecision);
    const training = page
      .getByTestId("hand")
      .getByRole("button", { name: "Select Parkour Training", exact: true })
      .first();
    await training.focus();
    await training.press("Enter");
    await page.getByRole("button", { name: "Play Option", exact: true }).click();
    await scenario.resolveUntil(
      (state) => state.players[0]!.battleArea.some((p) => p.topCard.cardId === "LM-058") && !state.pendingDecision,
    );
    const state = await scenario.snapshot();
    expect(state.memory).toBe(4);
    const remaining = state.players[0]!.hand.find((card) => card.cardId === "LM-058")!;
    expect([refs.instanceId("firstTraining"), refs.instanceId("secondTraining")]).toContain(remaining.instanceId);
    expect(remaining.playableFromHand).toBe(sources);
    await scenario.hand("Parkour Training");
    const play = page.getByRole("button", { name: "Play Option", exact: true });
    if (sources) {
      await play.click();
      await scenario.resolveUntil(
        (current) =>
          current.players[0]!.battleArea.filter((p) => p.topCard.cardId === "LM-058").length === 2 &&
          !current.pendingDecision,
      );
      expect((await scenario.snapshot()).memory).toBe(2);
    } else {
      await expect(play).toBeHidden();
    }
    await scenario.healthy();
  });
}
