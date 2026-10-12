import { openFixturePage } from "./scenario-page";
import fixtureP240ArcturusmonOrderedPlacement from "../../api/src/engine/scenarios/p240-arcturusmon-ordered-placement.fixture";
import { test, expect } from "@playwright/test";
import { answerActivation, ScenarioPage } from "./scenario-page";
import { startBrowserServer } from "./server";

for (const width of [1440, 390]) {
  test(`P-240 separates Then and keeps its physical source clear during confirmation at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    const server = await startBrowserServer();
    const evidence = new ScenarioPage(page);
    try {
      await page.addInitScript(() => {
        localStorage.setItem("aegis:locale", "en");
        localStorage.setItem("aegis.action-confirmation.enabled", "false");
      });
      await openFixturePage(page, fixtureP240ArcturusmonOrderedPlacement);
      await page.getByRole("button", { name: /^end breeding$/i }).click();
      await expect(page.getByRole("button", { name: /^end turn$/i })).toBeEnabled();
      const card = page.getByTestId("hand").getByRole("button", { name: "Select Arcturusmon", exact: true });
      await card.focus();
      await card.press("Enter");
      await page.getByRole("button", { name: /^Play Digimon$/i }).click();
      await page.getByRole("button", { name: "3 cards", exact: true }).click();
      const prompt = page.getByRole("dialog", { name: "Arcturusmon · effect", exact: true });
      await expect(prompt).toBeVisible();
      await expect(prompt.locator(".decision-overlay__effect-step")).toHaveText(/^Then, by placing 2 cards/);
      await expect(prompt.locator(".decision-overlay__effect-text")).toContainText("De-Digivolve 3");
      const source = page
        .locator('[data-drop="perm-you"]')
        .filter({ has: page.getByRole("img", { name: "Arcturusmon", exact: true }) });
      await expect(source).toHaveClass(/game-permanent--effect-linked/);
      // The phone sheet spans the screen width by design; "View board" or the drag handle reveal the source there.
      if (width === 1440) {
        const sourceBox = (await source.boundingBox())!;
        const promptBox = (await prompt.boundingBox())!;
        expect(promptBox.x + promptBox.width <= sourceBox.x || promptBox.y >= sourceBox.y + sourceBox.height).toBe(
          true,
        );
      }
      await answerActivation(page, false);
      await expect(prompt).toBeHidden();
      await expect(source).not.toHaveClass(/game-permanent--effect-linked/);
    } finally {
      await evidence.evidence(test.info());
      await page.close();
      await server.close();
    }
  });
}
