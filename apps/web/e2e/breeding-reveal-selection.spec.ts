import { openFixturePage, answerActivation } from "./scenario-page";
import fixtureDavisLargeHand from "../../api/src/engine/scenarios/davis-large-hand.fixture";
import fixtureGuilmonXReveal from "../../api/src/engine/scenarios/guilmon-x-reveal.fixture";
import fixtureKudamonMoving from "../../api/src/engine/scenarios/kudamon-moving.fixture";
import fixtureLunamonBreeding from "../../api/src/engine/scenarios/lunamon-breeding.fixture";
import fixtureTreadmillReveal from "../../api/src/engine/scenarios/treadmill-reveal.fixture";
import fixtureShadowReveal from "../../api/src/engine/scenarios/shadow-reveal.fixture";
import { test, expect } from "@playwright/test";
import { startBrowserServer } from "./server";

for (const [scenario, cardName, breeding] of [
  [fixtureLunamonBreeding, "Lunamon", true],
  [fixtureTreadmillReveal, "Treadmill Training", true],
  [fixtureShadowReveal, "Shadow Training", false],
] as const) {
  test(`${scenario.name} reveals selectable cards after breeding evolutions`, async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    const server = await startBrowserServer();
    try {
      await page.addInitScript(() => {
        localStorage.setItem("aegis:locale", "en");
        localStorage.setItem("aegis.action-confirmation.enabled", "false");
      });
      await openFixturePage(page, scenario);
      await expect(page.getByRole("button", { name: /^(End breeding|End turn)$/i })).toBeVisible();
      if (breeding) {
        await page.getByTestId("hand").getByRole("img", { name: "Lunamon", exact: true }).first().click();
        await page.getByRole("button", { name: "Digivolve", exact: true }).click();
        await page.locator('[data-drop="breeding-you"]').click();
        await expect(
          page.locator('[data-drop="breeding-you"]').getByRole("img", { name: "Lunamon", exact: true }),
        ).toBeVisible();
        if (scenario.name === "lunamon-breeding") {
          await page.getByTestId("hand").getByRole("img", { name: "Lekismon", exact: true }).click();
          await page.getByRole("button", { name: "Digivolve", exact: true }).click();
          await page.locator('[data-drop="breeding-you"]').click();
          await expect(
            page.locator('[data-drop="breeding-you"]').getByRole("img", { name: "Lekismon", exact: true }),
          ).toBeVisible();
        }
      }
      if (await page.getByRole("button", { name: /^end breeding$/i }).isVisible())
        await page.getByRole("button", { name: /^end breeding$/i }).click();
      await expect(page.getByRole("button", { name: /^end turn$/i })).toBeEnabled();
      await page.getByTestId("hand").getByRole("img", { name: cardName, exact: true }).click();
      await page.getByRole("button", { name: /^Play (Digimon|Option)$/i }).click();
      const dialog = page
        .getByRole("dialog")
        .filter({ has: page.getByRole("button", { name: "Confirm targets", exact: true }) });
      await expect(dialog).toBeVisible();
      const candidates = dialog.locator(".decision-overlay__candidate");
      await expect(candidates.first()).toBeVisible();
      await expect(candidates.first()).toBeEnabled();
      await candidates.first().click();
      await expect(dialog.getByRole("button", { name: "Confirm targets", exact: true })).toBeEnabled();
      await dialog.getByRole("button", { name: "Confirm targets", exact: true }).click();
    } finally {
      await page.close();
      await server.close();
    }
  });
}

for (const viewport of [
  { width: 320, height: 740 },
  { width: 768, height: 768 },
  { width: 1024, height: 768 },
  { width: 1440, height: 768 },
  { width: 844, height: 390 },
]) {
  test(`search/trash galleries keep clickable cards at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.addInitScript(() => localStorage.setItem("aegis:locale", "en"));
    for (const route of [
      "/dev/mobile?specimen=decision-select-cards&frame=1&locale=en",
      "/dev/effect-prompts?case=select-mixed&controls=0",
    ]) {
      await page.goto(route);
      const panel = page.getByRole("dialog");
      const target = panel.locator(".decision-overlay__candidate:not([disabled])").first();
      await expect(target).toBeVisible();
      await target.click();
      await expect(target).toHaveAttribute("aria-pressed", "true");
      await target.click();
      const lastTarget = panel.locator(".decision-overlay__candidate:not([disabled])").last();
      await lastTarget.click();
      await expect(lastTarget).toHaveAttribute("aria-pressed", "true");
      const answer = panel.getByRole("button", { name: "Confirm targets", exact: true });
      await expect(answer).toBeEnabled();
      await answer.click();
    }
  });
}

test("Davis can select Veemon from a large hand", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  const server = await startBrowserServer();
  try {
    await page.addInitScript(() => {
      localStorage.setItem("aegis:locale", "en");
      localStorage.setItem("aegis.action-confirmation.enabled", "false");
    });
    await openFixturePage(page, fixtureDavisLargeHand);
    await page.getByRole("button", { name: /^end breeding$/i }).click();
    await answerActivation(page, true);
    const selection = page.getByRole("region", { name: "Hand selection", exact: true });
    await expect(selection).toBeVisible();
    const veemon = page.getByTestId("hand").getByRole("img", { name: "Veemon", exact: true });
    await expect(veemon).toBeVisible();
    await veemon.click();
    await selection.getByRole("button", { name: /end selection/i }).click();
    await expect(
      page.locator('[data-drop="battle-you"]').getByRole("img", { name: "Veemon", exact: true }),
    ).toBeVisible();
  } finally {
    await page.close();
    await server.close();
  }
});

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
      await expect(page.getByRole("button", { name: /^end turn$/i })).toBeEnabled();
      await expect(page.getByTestId("hand").getByRole("img", { name: "RizeGreymon", exact: true })).toBeVisible();
    } finally {
      await page.close();
      await server.close();
    }
  });
}
