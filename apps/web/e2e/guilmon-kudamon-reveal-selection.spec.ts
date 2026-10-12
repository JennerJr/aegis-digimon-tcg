import { openFixturePage } from "./scenario-page";
import fixtureGuilmonXReveal from "../../api/src/engine/scenarios/guilmon-x-reveal.fixture";
import fixtureKudamonMoving from "../../api/src/engine/scenarios/kudamon-moving.fixture";
import { test, expect } from "@playwright/test";
import { startBrowserServer } from "./server";

for (const viewport of [
  { width: 1366, height: 768 },
  { width: 390, height: 844 },
]) {
  test(`Guilmon X resolves both reveal selections at ${viewport.width}px`, async ({ page }) => {
    const server = await startBrowserServer();
    try {
      await page.setViewportSize(viewport);
      await page.addInitScript(() => {
        localStorage.setItem("aegis:locale", "en");
        localStorage.setItem("aegis.action-confirmation.enabled", "false");
      });
      await openFixturePage(page, fixtureGuilmonXReveal);
      await page.getByRole("button", { name: /^end breeding$/i }).click();
      await expect(page.getByRole("button", { name: /^end turn$/i })).toBeEnabled();
      const card = page.getByTestId("hand").getByRole("button", { name: "Select Guilmon (X Antibody)", exact: true });
      await card.focus();
      await card.press("Enter");
      await page.getByRole("button", { name: "Play Digimon", exact: true }).click();
      const panel = page
        .getByRole("dialog")
        .filter({ has: page.getByRole("button", { name: "Confirm targets", exact: true }) });
      for (const name of ["Growlmon", "X Antibody"]) {
        const candidate = panel
          .locator(".decision-overlay__candidate:not([disabled])")
          .filter({ has: page.getByRole("img", { name, exact: true }) });
        await expect(candidate).toBeVisible();
        await candidate.click();
        await panel.getByRole("button", { name: "Confirm targets", exact: true }).click();
      }
      await expect(panel).not.toBeVisible();
      await expect(page.getByRole("button", { name: /^end turn$/i })).toBeEnabled();
      await expect(page.getByTestId("hand").getByRole("img", { name: "Growlmon", exact: true })).toBeVisible();
      await expect(page.getByTestId("hand").getByRole("img", { name: "X Antibody", exact: true })).toBeVisible();
    } finally {
      await page.close();
      await server.close();
    }
  });
}

for (const viewport of [
  { width: 1366, height: 768 },
  { width: 390, height: 844 },
]) {
  test(`Kudamon moving reveal works without a Tamer at ${viewport.width}px`, async ({ page }) => {
    const server = await startBrowserServer();
    try {
      await page.setViewportSize(viewport);
      await page.addInitScript(() => {
        localStorage.setItem("aegis:locale", "en");
        localStorage.setItem("aegis.action-confirmation.enabled", "false");
      });
      await openFixturePage(page, fixtureKudamonMoving);
      await expect(page.getByRole("button", { name: /^end breeding$/i })).toBeEnabled();
      await page.locator('[data-drop="breeding-you"]').click();
      const panel = page
        .getByRole("dialog")
        .filter({ has: page.getByRole("button", { name: "Confirm targets", exact: true }) });
      await expect(panel).toBeVisible();
      await panel.locator(".decision-overlay__candidate:not([disabled])").first().click();
      await panel.getByRole("button", { name: "Confirm targets", exact: true }).click();
      await expect(panel).not.toBeVisible();
      await page.getByRole("button", { name: "Confirm order", exact: true }).click();
      // Moving spends the breeding action; its effects finish before Main opens.
      await expect(page.getByRole("button", { name: /^end turn$/i })).toBeEnabled();
      await expect(page.getByTestId("hand").getByRole("img", { name: "RizeGreymon", exact: true })).toBeVisible();
    } finally {
      await page.close();
      await server.close();
    }
  });
}
