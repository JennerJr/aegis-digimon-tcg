import { fixtureVariant } from "../../api/src/engine/scenario/references";
import type { ScenarioFixture } from "../../api/src/engine/scenario/types";
import { openFixturePage } from "./scenario-page";

import fixtureOpenBugsMarcusAttack from "../../api/src/engine/scenarios/marcus-attack.fixture";
import fixtureEx2TakatoBlitzOrder from "../../api/src/engine/scenarios/ex2-takato-blitz-order.fixture";
import fixtureEndOfTurnLabel from "../../api/src/engine/scenarios/end-of-turn-label.fixture";
import fixtureBurstOwnTamer from "../../api/src/engine/scenarios/burst-own-tamer.fixture";
import fixtureLordknightmonInspector from "../../api/src/engine/scenarios/lordknightmon-inspector.fixture";
import fixtureCardImages from "../../api/src/engine/scenarios/card-images.fixture";
import fixtureBrowserTranslation from "../../api/src/engine/scenarios/browser-translation.fixture";
import fixtureAssemblyWithDna from "../../api/src/engine/scenarios/assembly-with-dna.fixture";
import fixtureDoubleAlliance from "../../api/src/engine/scenarios/double-alliance.fixture";
import fixtureInfernoDivideImmunity from "../../api/src/engine/scenarios/inferno-divide-immunity.fixture";
import fixtureFlyBulletImmunity from "../../api/src/engine/scenarios/fly-bullet-immunity.fixture";
import fixtureImageTraining from "../../api/src/engine/scenarios/image-training.fixture";
import fixtureBreathingTraining from "../../api/src/engine/scenarios/breathing-training.fixture";
import fixtureAsunaEvolution from "../../api/src/engine/scenarios/asuna-evolution.fixture";
import fixturePagumonEvolution from "../../api/src/engine/scenarios/pagumon-evolution.fixture";
import fixtureHeavyMetalBreeding from "../../api/src/engine/scenarios/heavy-metal-breeding.fixture";
import fixtureGammamonBreeding from "../../api/src/engine/scenarios/gammamon-breeding.fixture";
import fixtureParadiseLostBreeding from "../../api/src/engine/scenarios/paradise-lost-breeding.fixture";
import fixtureShineBurstMarcus from "../../api/src/engine/scenarios/shine-burst-marcus.fixture";
import fixtureGomamonVikemonSearch from "../../api/src/engine/scenarios/gomamon-vikemon-search.fixture";
import fixtureHandTrashSelection from "../../api/src/engine/scenarios/hand-trash-selection.fixture";
import fixtureAgumonSearch from "../../api/src/engine/scenarios/agumon-search.fixture";
import fixtureGabumonSearch from "../../api/src/engine/scenarios/gabumon-search.fixture";
import fixtureDigitalGateCoolBoy from "../../api/src/engine/scenarios/digital-gate-cool-boy.fixture";
import fixtureDnaMaterialPairs from "../../api/src/engine/scenarios/dna-material-pairs.fixture";
import fixtureCyberEngage from "../../api/src/engine/scenarios/cyber-engage.fixture";
import { fixturePermanentId } from "../../api/src/engine/scenario/references";
import { test, expect, type Page } from "@playwright/test";
import { answerActivation } from "./scenario-page";
import { startBrowserServer } from "./server";

class ArenaPage {
  constructor(readonly page: Page) {}
  async open(scenario: ScenarioFixture) {
    await this.page.addInitScript(() => {
      localStorage.setItem("aegis:locale", "en");
      localStorage.setItem("aegis.skip-end-turn-confirmation", "true");
    });
    await openFixturePage(this.page, scenario);

    await expect(this.page.getByRole("button", { name: /^end breeding$/i })).toBeVisible();
  }
}

test("Marcus opens attack actions and attacks while treated as a Digimon", async ({ page }) => {
  const server = await startBrowserServer();
  try {
    await page.addInitScript(() => localStorage.setItem("aegis.action-confirmation.enabled", "false"));
    await new ArenaPage(page).open(fixtureOpenBugsMarcusAttack);
    await page.getByRole("button", { name: /^end breeding$/i }).click();
    await answerActivation(page, false);
    await expect(page.getByRole("button", { name: /^end turn$/i })).toBeEnabled();
    const marcus = page.locator(`[data-drop="perm-you"][data-id="${fixturePermanentId("own-open-bugs-marcus")}"]`);
    await marcus.click();
    await page.getByRole("button", { name: "Attack", exact: true }).click();
    await page.getByRole("button", { name: /^Opponent security/ }).click();
    await expect(page.getByRole("button", { name: /^Opponent security · 4$/ })).toBeVisible();
  } finally {
    await page.close();
    await server.close();
  }
});

test("selects Takato's granted Blitz before Gallantmon's printed effect", async ({ page }) => {
  const server = await startBrowserServer();
  try {
    await page.addInitScript(() => localStorage.setItem("aegis.action-confirmation.enabled", "false"));
    await new ArenaPage(page).open(fixtureEx2TakatoBlitzOrder);
    await page.getByRole("button", { name: /^end breeding$/i }).click();
    await expect(page.getByRole("button", { name: /^end turn$/i })).toBeEnabled();
    await page.getByTestId("hand").getByRole("img", { name: "Gallantmon", exact: true }).click();
    await page.getByRole("button", { name: "Digivolve", exact: true }).click();
    await page
      .locator(`[data-drop="perm-you"][data-id="${fixturePermanentId("own-takato-blitz-wargrowlmon")}"]`)
      .click();
    const blitz = page.getByRole("button").filter({ hasText: "＜Blitz＞" });
    await expect(blitz).toHaveCount(1);
    await expect(blitz).not.toContainText("12000 DP");
    await blitz.click();
    await page.getByRole("button", { name: /^resolve next effect$/i }).click();
    await expect(page.getByText("Activate Blitz?", { exact: true })).toBeVisible();
    await answerActivation(page, true);
    const attacker = page.locator(
      `[data-drop="perm-you"][data-id="${fixturePermanentId("own-takato-blitz-wargrowlmon")}"]`,
    );
    await attacker.click();
    await page.getByRole("button", { name: "Attack", exact: true }).click();
    await page.getByRole("button", { name: /^Opponent security/ }).click();
    const printed = page.getByRole("button").filter({ hasText: "12000 DP or higher" });
    await expect(printed).toHaveCount(1);
    await printed.click();
    await page.getByRole("button", { name: "Resolve next effect", exact: true }).click();
    await expect(page.getByText("Activate Blitz?", { exact: true })).not.toBeVisible();
    // Sequential effect and security playback can settle after the 20-second presentation budget.
    await expect(page.getByRole("button", { name: /^Opponent security · 3$/ })).toBeVisible({ timeout: 45000 });
  } finally {
    await page.close();
    await server.close();
  }
});

test("shows four phases and a turn-pass control in the repeated end-turn scenario", async ({ page }) => {
  const server = await startBrowserServer();
  try {
    await new ArenaPage(page).open(fixtureEndOfTurnLabel);
    const phases = page.getByTestId("turn-phases");
    await expect(phases.getByRole("listitem", { includeHidden: true })).toHaveText([
      "Active",
      "Draw",
      "Breeding",
      "Main",
    ]);
    await page.getByRole("button", { name: /^end breeding$/i }).click();
    await expect(page.getByRole("button", { name: /^end turn$/i })).toBeEnabled();
    await expect(page.getByTestId("hand").getByRole("img", { name: "Monodramon", exact: true })).toHaveCount(2);
    await expect(page.getByRole("button", { name: /^end phase$/i })).toHaveCount(0);
    await page.getByRole("button", { name: /^end turn$/i }).click();
    await page.getByRole("button", { name: /^\[End of Your Turn\], WarGrowlmon,/ }).click();
    await page.getByRole("button", { name: /^resolve next effect$/i }).click();
    const activation = page.getByRole("dialog", { name: "WarGrowlmon · effect", exact: true });
    await expect(activation).toContainText("Engage");
    await expect(activation).toContainText("at the end of this turn, this Digimon may attack.");
    await expect(activation).not.toContainText("Delete 1 of your opponent's Digimon");
  } finally {
    await page.close();
    await server.close();
  }
});

test("Burst Mode hides the unpaid cost 0 route and displays its Option Main text", async ({ page }) => {
  const server = await startBrowserServer();
  try {
    await page.addInitScript(() => localStorage.setItem("aegis.action-confirmation.enabled", "false"));
    await new ArenaPage(page).open(fixtureBurstOwnTamer);
    await page.getByRole("button", { name: /^end breeding$/i }).click();
    await expect(page.getByRole("button", { name: /^end turn$/i })).toBeEnabled();
    await page.getByTestId("hand").getByRole("img", { name: "ShineGreymon: Burst Mode", exact: true }).click();
    await page.getByRole("button", { name: "Digivolve", exact: true }).click();
    await page.locator(`[data-drop="perm-you"][data-id="${fixturePermanentId("burst-own-tamer-0-field-0")}"]`).click();
    // The optional Tamer play is answered in its up-to-one hand selection, with no separate activation prompt.
    const selection = page.getByRole("region", { name: "Hand selection", exact: true });
    await expect(selection.getByRole("button", { name: /^no selection$/i })).toBeVisible();
    await expect(page.getByRole("dialog", { name: "Digivolve cost", exact: true })).not.toBeVisible();
    await expect(page.getByRole("dialog", { name: "ShineGreymon: Burst Mode · effect", exact: true })).toHaveCount(0);
    await expect(selection).toContainText("[Main]");
    await expect(selection).toContainText("-15000 DP");
    await expect(selection).toContainText("Tamer card from your hand");
    await expect(selection).not.toContainText("Activate 1 [Main] effect");
    await selection.getByRole("button", { name: /^no selection$/i }).click();
    await expect(selection).not.toBeVisible();
    await expect(page.getByRole("button", { name: /^end turn$/i })).toBeEnabled();
  } finally {
    await page.close();
    await server.close();
  }
});

test("LordKnightmon's hand inspector shows the corrected printed Main and Security text", async ({ page }) => {
  const server = await startBrowserServer();
  try {
    await new ArenaPage(page).open(fixtureLordknightmonInspector);
    await page
      .locator(".game-hand-card")
      .filter({ has: page.getByRole("img", { name: "LordKnightmon", exact: true }) })
      .click();
    const inspector = page.getByRole("dialog", { name: "LordKnightmon", exact: true });
    await expect(inspector).toBeVisible();
    await expect(inspector.locator('[data-role="top"]')).toContainText(
      "if you have a Digimon with [Knightmon] or [Lucemon] in its name, reduce the play cost by 5",
    );
    await expect(inspector.locator('[data-role="top"]')).toContainText("[All Turns] [Once Per Turn]");
    await expect(inspector.locator('[data-role="top"]')).not.toContainText("4 or more cards");
    await expect(inspector.locator('[data-role="printed-security"]')).toContainText("[Security]");
    await expect(inspector.locator('[data-role="printed-security"]')).toContainText("play cost of 3 or less");
    await inspector.getByRole("button", { name: "Close", exact: true }).click();
    await expect(inspector).not.toBeVisible();
  } finally {
    await page.close();
    await server.close();
  }
});

test("renders arena card art when every mirror request fails", async ({ page }) => {
  const server = await startBrowserServer();
  const officialRequests: string[] = [];
  try {
    await page.route("**/assets/card-images/**", (route) => route.abort("failed"));
    await page.route("https://world.digimoncard.com/images/cardlist/card/**", (route) => {
      officialRequests.push(route.request().url());
      return route.fulfill({
        contentType: "image/png",
        body: Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGP4/x8AAwAB//wl3FEAAAAASUVORK5CYII=",
          "base64",
        ),
      });
    });
    await new ArenaPage(page).open(fixtureCardImages);
    await expect.poll(() => officialRequests.some((url) => url.endsWith("BT1-010.png"))).toBe(true);
    await expect
      .poll(() =>
        page
          .getByRole("img", { name: "Agumon", exact: true })
          .evaluateAll((images) =>
            images.some(
              (image) =>
                image instanceof HTMLImageElement &&
                image.complete &&
                image.naturalWidth > 0 &&
                image.src.startsWith("https://world.digimoncard.com/"),
            ),
          ),
      )
      .toBe(true);
  } finally {
    await page.close();
    await server.close();
  }
});

test("changing phases and reloading the fixture survives translated Text nodes", async ({ page }) => {
  const server = await startBrowserServer();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    await new ArenaPage(page).open(fixtureBrowserTranslation);
    await page.evaluate(() => {
      const root = document.getElementById("root")!;
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      const texts: Text[] = [];
      while (walker.nextNode()) {
        const text = walker.currentNode as Text;
        if (text.textContent?.trim() && !text.parentElement?.closest("script, style")) texts.push(text);
      }
      for (const text of texts) {
        const parent = text.parentNode!;
        const translated = document.createElement("font");
        translated.style.verticalAlign = "inherit";
        translated.textContent = `ES: ${text.nodeValue}`;
        parent.insertBefore(translated, text);
        parent.removeChild(text);
      }
    });
    await page.getByRole("button", { name: /end breeding/i }).click();
    await expect(page.getByRole("button", { name: /end turn/i })).toBeEnabled();
    await page.reload();
    await expect(page.getByRole("button", { name: /end breeding/i })).toBeVisible();
    expect(errors).toEqual([]);
  } finally {
    await page.close();
    await server.close();
  }
});

test("ordinary Play offers Assembly while DNA materials remain on the field", async ({ page }) => {
  const server = await startBrowserServer();
  try {
    await page.addInitScript(() => localStorage.setItem("aegis.action-confirmation.enabled", "false"));
    await new ArenaPage(page).open(fixtureAssemblyWithDna);
    await page.getByRole("button", { name: /^end breeding$/i }).click();
    await page.getByTestId("hand").getByRole("img", { name: "Omnimon", exact: true }).click();
    await page.getByRole("button", { name: /^Play Digimon$/i }).click();
    const assembly = page.getByRole("dialog", { name: "＜Assembly＞ Omnimon", exact: true });
    await expect(assembly).toBeVisible();
    await expect(page.getByText(/DNA Digivolution available/i)).not.toBeVisible();
    for (const name of ["WarGreymon", "MetalGarurumon", "Agumon", "Gabumon"])
      await assembly.getByRole("button", { name: new RegExp(`^${name}.*Trash`, "i") }).click();
    await expect(assembly.getByRole("button", { name: /Assembly.*4/i })).toBeEnabled();
  } finally {
    await page.close();
    await server.close();
  }
});

test("the second Alliance stays selectable after answering the first", async ({ page }) => {
  const server = await startBrowserServer();
  try {
    await page.addInitScript(() => localStorage.setItem("aegis.action-confirmation.enabled", "false"));
    await new ArenaPage(page).open(fixtureDoubleAlliance);
    await page.getByRole("button", { name: /^end breeding$/i }).click();
    await page.getByTestId("hand").getByRole("img", { name: "Jesmon", exact: true }).click();
    await page.getByRole("button", { name: "Digivolve", exact: true }).click();
    await page.locator(`[data-drop="perm-you"][data-id="${fixturePermanentId("double-alliance-0-field-0")}"]`).click();
    await page
      .getByRole("dialog", { name: "Digivolve cost", exact: true })
      .getByRole("button", { name: /^SaviorHuckmon.*3 memory/ })
      .click();
    await page.getByRole("button", { name: /^(Don't use|No, decline)$/i }).click();
    await expect(page.getByRole("button", { name: /^end turn$/i })).toBeEnabled();
    await page.locator(`[data-drop="perm-you"][data-id="${fixturePermanentId("double-alliance-0-field-0")}"]`).click();
    await page.getByRole("button", { name: "Attack", exact: true }).click();
    const security = page.locator('[data-drop="opp-security"]');
    await expect(security).toHaveClass(/game-security-shield--glow/);
    await security.click();
    // "No to all" would also preset both Alliance entries to No; decline only the token play.
    await page
      .getByRole("list", { name: "Order pending effects", exact: true })
      .getByRole("listitem")
      .filter({ hasText: "Atho, René & Por" })
      .getByRole("button", { name: "No", exact: true })
      .click();
    await page.getByRole("button", { name: "Select all, top to bottom", exact: true }).click();
    await page
      .locator(".trigger-chooser__footer")
      .getByRole("button", { name: /resolve/i })
      .click();
    const alliance = page.getByRole("region", { name: "Alliance window", exact: true });
    await expect(alliance).toBeVisible();
    await page.locator(`[data-drop="perm-you"][data-id="${fixturePermanentId("double-alliance-0-field-1")}"]`).click();
    await page.getByRole("button", { name: "Use Alliance", exact: true }).click();
    await expect(alliance).toBeVisible();
    await page.locator(`[data-drop="perm-you"][data-id="${fixturePermanentId("double-alliance-0-field-2")}"]`).click();
    await page.getByRole("button", { name: "Use Alliance", exact: true }).click();
    await expect(alliance).not.toBeVisible();
  } finally {
    await page.close();
    await server.close();
  }
});

for (const scenario of [
  fixtureInfernoDivideImmunity,
  fixtureFlyBulletImmunity,
  fixtureImageTraining,
  fixtureBreathingTraining,
  fixtureAsunaEvolution,
  fixturePagumonEvolution,
  fixtureHeavyMetalBreeding,
  fixtureGammamonBreeding,
  fixtureParadiseLostBreeding,
]) {
  test(`Fixture board joins and renders: ${scenario.name}`, async ({ page }) => {
    const server = await startBrowserServer();
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    try {
      await new ArenaPage(page).open(scenario);
      await page.getByRole("button", { name: /^end breeding$/i }).click();
      // Asuna may offer her printed start-of-main optional cost before Main opens.
      if (scenario === fixtureAsunaEvolution) await answerActivation(page, false);
      await expect(page.getByRole("button", { name: /^end turn$/i })).toBeEnabled();
      expect(errors).toEqual([]);
    } finally {
      await page.close();
      await server.close();
    }
  });
}

test("Image Training displays both discounted routes and pays zero for the alternate", async ({ page }) => {
  const server = await startBrowserServer();
  try {
    await page.addInitScript(() => localStorage.setItem("aegis.action-confirmation.enabled", "false"));
    await new ArenaPage(page).open(fixtureImageTraining);
    await page.getByRole("button", { name: /^end breeding$/i }).click();
    await page.locator(`[data-drop="perm-you"][data-id="${fixturePermanentId("image-training-0-field-0")}"]`).click();
    await page.getByRole("button", { name: /^Activate effect:/ }).click();
    await page
      .getByRole("dialog", { name: "Image Training · effect", exact: true })
      .getByRole("button", { name: "Yes, activate", exact: true })
      .click();
    const choice = page.getByRole("dialog", { name: "Digivolve", exact: true });
    await expect(choice.getByRole("button", { name: "Printed requirement, pays 1 memory", exact: true })).toBeVisible();
    await choice.getByRole("button", { name: "Alternate requirement, pays 0 memory", exact: true }).click();
    await expect(page.getByRole("button", { name: /^end turn$/i })).toBeEnabled();
    await expect(
      page
        .locator(`[data-drop="perm-you"][data-id="${fixturePermanentId("image-training-0-field-1")}"]`)
        .getByRole("img", { name: "BlackGatomon", exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("img", { name: "Memory: +5", exact: true })).toBeVisible();
  } finally {
    await page.close();
    await server.close();
  }
});

test("Burst Digivolution with ST24 Marcus pays zero through the UI", async ({ page }) => {
  const server = await startBrowserServer();
  try {
    await page.addInitScript(() => localStorage.setItem("aegis.action-confirmation.enabled", "false"));
    await new ArenaPage(page).open(fixtureShineBurstMarcus);
    await page.getByRole("button", { name: /^end breeding$/i }).click();
    await answerActivation(page, false);
    await expect(page.getByRole("button", { name: /^end turn$/i })).toBeEnabled();
    await page.getByTestId("hand").getByRole("img", { name: "ShineGreymon: Burst Mode", exact: true }).click();
    await page.getByRole("button", { name: "Digivolve", exact: true }).click();
    await page
      .locator(`[data-drop="perm-you"][data-id="${fixturePermanentId("shine-burst-marcus-0-field-0")}"]`)
      .click();
    const costs = page.getByRole("dialog", { name: "Digivolve cost", exact: true });
    await expect(costs).toBeVisible();
    await costs.getByRole("button").filter({ hasText: /0/ }).click();
    await expect(
      page.getByTestId("hand").getByRole("img", { name: "Marcus Damon & Thomas H. Norstein", exact: true }),
    ).toBeVisible();
    await expect(
      page
        .locator(`[data-drop="perm-you"][data-id="${fixturePermanentId("shine-burst-marcus-0-field-0")}"]`)
        .getByRole("img", { name: "ShineGreymon: Burst Mode", exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("img", { name: "Memory: +8", exact: true })).toBeVisible();
  } finally {
    await page.close();
    await server.close();
  }
});

test("Gomamon offers LM Vikemon in its search", async ({ page }) => {
  const server = await startBrowserServer();
  try {
    await page.addInitScript(() => localStorage.setItem("aegis.action-confirmation.enabled", "false"));
    await new ArenaPage(page).open(fixtureGomamonVikemonSearch);
    await page.getByRole("button", { name: /^end breeding$/i }).click();
    await expect(page.getByRole("button", { name: /^end turn$/i })).toBeEnabled();
    await page.getByTestId("hand").getByRole("img", { name: "Gomamon", exact: true }).click();
    await page.getByRole("button", { name: "Play Digimon", exact: true }).click();
    const search = page.getByRole("dialog", { name: "Gomamon · effect", exact: true });
    await expect(search).toContainText("[DS]");
    await search.getByRole("button", { name: "Gomamon", exact: true }).click();
    await search.getByRole("button", { name: "Confirm targets", exact: true }).click();
    await expect(search).toContainText("[Sea Beast]/[Plesiosaur]");
    await expect(search).toBeVisible();
    await search.getByRole("button", { name: "Vikemon", exact: true }).click();
    await search.getByRole("button", { name: "Confirm targets", exact: true }).click();
    await expect(page.getByTestId("hand").getByRole("img", { name: "Vikemon", exact: true })).toBeVisible();
  } finally {
    await page.close();
    await server.close();
  }
});

test("mandatory hand trash can be selected and confirmed on the board", async ({ page }) => {
  const server = await startBrowserServer();
  try {
    await page.addInitScript(() => {
      localStorage.setItem("aegis.action-confirmation.enabled", "false");
      localStorage.setItem("aegis.pile-counts", "shown");
    });
    await new ArenaPage(page).open(fixtureHandTrashSelection);
    await page.getByRole("button", { name: /^end breeding$/i }).click();
    await expect(page.getByRole("button", { name: /^end turn$/i })).toBeEnabled();
    await page.getByTestId("hand").getByRole("img", { name: "HeavyMetaldramon", exact: true }).click();
    await page.getByRole("button", { name: "Digivolve", exact: true }).click();
    await page
      .locator(`[data-drop="perm-you"][data-id="${fixturePermanentId("hand-trash-selection-0-field-0")}"]`)
      .click();
    const selection = page.getByRole("region", { name: "Hand selection", exact: true });
    await expect(selection).toBeVisible();
    const cards = page.getByTestId("hand").locator(".game-hand-card");
    await cards.nth(0).click();
    await cards.nth(1).click();
    await selection.getByRole("button", { name: /end selection/i }).click();
    await expect(selection).not.toBeVisible();
    await expect(page.getByRole("button", { name: /^end turn$/i })).toBeEnabled();
    await expect(page.getByRole("button", { name: "Trash: 2 discarded cards", exact: true })).toBeVisible();
  } finally {
    await page.close();
    await server.close();
  }
});

for (const [scenario, name] of [
  [fixtureAgumonSearch, "Agumon"],
  [fixtureGabumonSearch, "Gabumon"],
] as const) {
  test(`${name} permits taking the only matching version instead of placing it under`, async ({ page }) => {
    const server = await startBrowserServer();
    try {
      await page.addInitScript(() => localStorage.setItem("aegis.action-confirmation.enabled", "false"));
      await new ArenaPage(page).open(scenario);
      await page.getByRole("button", { name: /^end breeding$/i }).click();
      await expect(page.getByRole("button", { name: /^end turn$/i })).toBeEnabled();
      await page.getByTestId("hand").getByRole("img", { name, exact: true }).click();
      await page.getByRole("button", { name: "Play Digimon", exact: true }).click();
      const search = page.getByRole("dialog", { name: `${name} · effect`, exact: true });
      const wanted = search.getByRole("button", { name, exact: true });
      await expect(wanted).toBeEnabled();
      await wanted.click();
      await search.getByRole("button", { name: "Confirm targets", exact: true }).click();
      await page.getByRole("button", { name: "Confirm order", exact: true }).click();
      await expect(page.getByTestId("hand").getByRole("img", { name, exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: /^end turn$/i })).toBeEnabled();
      await expect(page.getByRole("img", { name: "Memory: +5", exact: true })).toBeVisible();
    } finally {
      await page.close();
      await server.close();
    }
  });
}

test("Digital Gate Open offers Cool Boy for zero using Mother D-Reaper", async ({ page }) => {
  const server = await startBrowserServer();
  try {
    await page.addInitScript(() => localStorage.setItem("aegis.action-confirmation.enabled", "false"));
    await new ArenaPage(page).open(fixtureDigitalGateCoolBoy);
    await page.getByRole("button", { name: /^end breeding$/i }).click();
    await page
      .locator(`[data-drop="perm-you"][data-id="${fixturePermanentId("digital-gate-cool-boy-0-field-0")}"]`)
      .click();
    await page.getByRole("button", { name: /^Activate effect:/ }).click();
    await page
      .getByRole("dialog", { name: "Digital Gate Open · effect", exact: true })
      .getByRole("button", { name: "Yes, activate", exact: true })
      .click();
    await expect(page.getByRole("button", { name: /^end turn$/i })).toBeEnabled();
    await expect(
      page.locator('[data-drop="perm-you"]').getByRole("img", { name: "Cool Boy", exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("img", { name: "Memory: +8", exact: true })).toBeVisible();
  } finally {
    await page.close();
    await server.close();
  }
});

for (const width of [1440, 390]) {
  test(`compact field DNA selection preserves the chosen physical pair at width ${width}`, async ({ page }) => {
    const server = await startBrowserServer();
    try {
      await page.setViewportSize({ width, height: 1000 });
      await page.addInitScript(() => localStorage.setItem("aegis.action-confirmation.enabled", "false"));
      await new ArenaPage(page).open(fixtureDnaMaterialPairs);
      await page.getByRole("button", { name: /^end breeding$/i }).click();
      await expect(page.getByRole("button", { name: /^end turn$/i })).toBeEnabled();
      await page.getByTestId("hand").getByRole("img", { name: "Mastemon", exact: true }).click();
      await page.getByRole("button", { name: "Digivolve", exact: true }).click();
      const field = (index: number) =>
        page.locator(
          `[data-drop="perm-you"][data-id="${fixtureVariant({ "0": fixturePermanentId("dna-material-pairs-0-field-0"), "1": fixturePermanentId("dna-material-pairs-0-field-1"), "2": fixturePermanentId("dna-material-pairs-0-field-2") }, index)}"]`,
        );
      await field(0).click();
      const rail = page.getByRole("region", { name: /DNA Digivolution available/i });
      const confirm = rail.getByRole("button", { name: "DNA Digivolve", exact: true });
      await expect(confirm).toBeDisabled();
      await expect(field(0).getByLabel("DNA material 1", { exact: true })).toBeVisible();
      await expect(rail.getByRole("button", { name: "View board", exact: true })).toBeVisible();
      await expect(rail.locator("img")).toHaveCount(0);
      await field(2).click();
      await expect(confirm).toBeEnabled();
      await expect(field(0).getByLabel("DNA material 1", { exact: true })).toBeVisible();
      await expect(field(2).getByLabel("DNA material 2", { exact: true })).toBeVisible();
      await expect(field(1)).toBeVisible();
      await field(2).click();
      await expect(confirm).toBeDisabled();
      await field(1).click();
      await expect(confirm).toBeEnabled();
      await field(1).click();
      await field(2).click();
      const bounds = await confirm.boundingBox();
      expect(bounds).not.toBeNull();
      expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(1000);
      const cancel = (await rail.getByRole("button", { name: "Cancel", exact: true }).boundingBox())!;
      expect(bounds!.x).toBeGreaterThanOrEqual(cancel.x + cancel.width);
      await confirm.click();
      await expect(
        page.locator('[data-drop="perm-you"]').getByRole("img", { name: "Mastemon", exact: true }),
      ).toBeVisible();
      await expect(field(1).getByRole("img", { name: "LadyDevimon", exact: true })).toBeVisible();
      await expect(field(2)).toHaveCount(0);
    } finally {
      await page.close();
      await server.close();
    }
  });
}

for (const accept of [false, true]) {
  test(`Cyber Engage opens one declinable hand selection (accept ${accept})`, async ({ page }) => {
    const server = await startBrowserServer();
    try {
      await page.addInitScript(() => localStorage.setItem("aegis.action-confirmation.enabled", "false"));
      await new ArenaPage(page).open(fixtureCyberEngage);
      await page.getByRole("button", { name: /^end breeding$/i }).click();
      await expect(page.getByRole("button", { name: /^end turn$/i })).toBeEnabled();
      await page.locator(`[data-drop="perm-you"][data-id="${fixturePermanentId("cyber-engage-0-field-0")}"]`).click();
      await page.getByRole("button", { name: /^Activate effect:/ }).click();
      const choice = page.getByRole("region", { name: "Hand selection", exact: true });
      await expect(choice).toBeVisible();
      await expect(page.getByRole("button", { name: "Yes, activate", exact: true })).toHaveCount(0);
      if (accept) {
        await page.getByTestId("hand").getByRole("img", { name: "Roleplaymon", exact: true }).click();
        await choice.getByRole("button", { name: "End Selection", exact: true }).click();
        await expect(
          page.locator('[data-drop="perm-you"]').getByRole("img", { name: "Roleplaymon", exact: true }),
        ).toBeVisible();
        await expect(page.getByRole("img", { name: "Memory: 0", exact: true })).toBeVisible();
      } else {
        await choice.getByRole("button", { name: "No Selection", exact: true }).click();
        await expect(choice).toHaveCount(0);
        await expect(page.getByTestId("hand").getByRole("img", { name: "Roleplaymon", exact: true })).toBeVisible();
        await expect(page.getByRole("img", { name: "Memory: +1", exact: true })).toBeVisible();
      }
    } finally {
      await page.close();
      await server.close();
    }
  });
}
