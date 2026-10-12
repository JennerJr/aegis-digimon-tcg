import type { ScenarioFixture } from "../../api/src/engine/scenario/types";
import { openFixturePage } from "./scenario-page";

import { fixtureVariant } from "../../api/src/engine/scenario/references";
import fixtureTsunomonJupitermon from "../../api/src/engine/scenarios/tsunomon-jupitermon.fixture";
import fixtureTsunomonJupitermonZero from "../../api/src/engine/scenarios/tsunomon-jupitermon-zero.fixture";
import fixturePatamonZero from "../../api/src/engine/scenarios/patamon-zero.fixture";
import fixturePatamonOne from "../../api/src/engine/scenarios/patamon-one.fixture";
import fixturePatamonMultiple from "../../api/src/engine/scenarios/patamon-multiple.fixture";
import fixtureMococomonOncePerTurn from "../../api/src/engine/scenarios/mococomon-once-per-turn.fixture";
import fixtureAsuna from "../../api/src/engine/scenarios/asuna.fixture";
import fixtureImageTrainingLm056Bt25083 from "../../api/src/engine/scenarios/image-training-lm-056-bt25-083.fixture";
import fixtureBreathingTrainingLm062Bt25083 from "../../api/src/engine/scenarios/breathing-training-lm-062-bt25-083.fixture";
import fixturePagumon from "../../api/src/engine/scenarios/pagumon.fixture";
import fixtureFlyBulletHand from "../../api/src/engine/scenarios/fly-bullet-hand.fixture";
import fixtureFlyBulletSources from "../../api/src/engine/scenarios/fly-bullet-sources.fixture";
import fixtureDigilabBreeding from "../../api/src/engine/scenarios/digilab-breeding.fixture";
import fixtureCerberusmonAlphamon from "../../api/src/engine/scenarios/cerberusmon-alphamon.fixture";
import fixtureJesmonGankoomonImmunity from "../../api/src/engine/scenarios/jesmon-gankoomon-immunity.fixture";
import fixtureExamonBt23PartitionChoice from "../../api/src/engine/scenarios/examon-bt23-partition-choice.fixture";
import { test, expect, type Page } from "@playwright/test";
import { answerActivation } from "./scenario-page";
import { startBrowserServer } from "./server";

class DiscordFollowupArena {
  constructor(readonly page: Page) {}

  async open(scenario: ScenarioFixture, beforeMain?: () => Promise<void>) {
    await this.page.addInitScript(() => {
      localStorage.setItem("aegis:locale", "en");
      localStorage.setItem("aegis.action-confirmation.enabled", "false");
      localStorage.setItem("aegis.skip-end-turn-confirmation", "true");
    });
    // Card art is cosmetic; keep this regression independent of external mirrors.
    await this.page.route("**/assets/card-images/**", (route) =>
      route.fulfill({
        contentType: "image/png",
        body: Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGP4/x8AAwAB//wl3FEAAAAASUVORK5CYII=",
          "base64",
        ),
      }),
    );
    await openFixturePage(this.page, scenario);

    await this.page.getByRole("button", { name: /^end breeding$/i }).click();
    if (scenario.name === fixtureAsuna.name) await answerActivation(this.page, false);
    await beforeMain?.();
    await expect(this.page.getByRole("button", { name: /^end turn$/i })).toBeEnabled();
  }
}

for (const scenario of [
  fixtureMococomonOncePerTurn,
  fixtureAsuna,
  fixtureImageTrainingLm056Bt25083,
  fixtureBreathingTrainingLm062Bt25083,
  fixturePagumon,
  fixtureFlyBulletHand,
  fixtureFlyBulletSources,
  fixtureDigilabBreeding,
] as const) {
  test(`${scenario.name} opens the configured board and reaches Main`, async ({ page }) => {
    const server = await startBrowserServer();
    try {
      await new DiscordFollowupArena(page).open(scenario);
      await expect
        .poll(() =>
          page.evaluate(() =>
            window.browserTestSnapshot().players[0]!.battleArea.map((permanent) => permanent.topCard.cardId),
          ),
        )
        .toEqual(
          (scenario.board[0]?.battleArea ?? []).map((permanent) =>
            typeof permanent === "string" ? permanent : permanent.card,
          ),
        );
      if (scenario.name!.endsWith("digilab-breeding")) {
        await page.getByTestId("hand").getByRole("img", { name: "DigiLab", exact: true }).click();
        await expect(page.getByRole("button", { name: "Play Option", exact: true })).toBeEnabled();
        await page.getByRole("button", { name: "Play Option", exact: true }).click();
        await expect(
          page
            .locator('[data-drop="perm-you"]')
            .filter({ has: page.getByRole("img", { name: "DigiLab", exact: true }) }),
        ).toHaveCount(1);
        await expect(page.getByRole("button", { name: /^end turn$/i })).toBeEnabled();
      }
    } finally {
      await page.close();
      await server.close();
    }
  });
}

for (const [suffix, memory] of [
  ["", 5],
  ["-zero", 8],
] as const) {
  test(`Tsunomon charges the variable cost minus 1${suffix}`, async ({ page }) => {
    const server = await startBrowserServer();
    try {
      await new DiscordFollowupArena(page).open(
        fixtureVariant({ "": fixtureTsunomonJupitermon, "-zero": fixtureTsunomonJupitermonZero }, suffix),
      );
      const attacker = page
        .locator('[data-drop="perm-you"]')
        .filter({ has: page.getByRole("img", { name: "Ikkakumon", exact: true }) });
      await attacker.click();
      await page.getByRole("button", { name: "Attack", exact: true }).click();
      await page.locator('[data-drop="opp-security"]').click();
      await answerActivation(page, true, "add your top security card to the hand");
      await answerActivation(page, true);
      await expect(
        page.locator('[data-drop="perm-you"]').getByRole("img", { name: "Jupitermon", exact: true }),
      ).toBeVisible();
      await expect(page.getByRole("button", { name: /^end turn$/i })).toBeEnabled();
      await expect(page.locator(".game-memory-gauge")).toHaveAttribute("aria-label", `Memory: +${memory}`);
    } finally {
      await page.close();
      await server.close();
    }
  });
}

for (const suffix of ["zero", "one", "multiple"]) {
  test(`${suffix} targets share one private search and evolution modal`, async ({ page }) => {
    const server = await startBrowserServer();
    try {
      await new DiscordFollowupArena(page).open(
        fixtureVariant({ zero: fixturePatamonZero, one: fixturePatamonOne, multiple: fixturePatamonMultiple }, suffix),
        async () => {
          const inspection = page.getByRole("dialog");
          await expect(inspection).toHaveCount(1);
          await expect(inspection.locator(".decision-overlay__candidate")).toHaveCount(3);
          await expect(inspection.locator(".decision-overlay__candidate:enabled")).toHaveCount(
            suffix === "zero" ? 0 : suffix === "one" ? 1 : 2,
          );
          await inspection.getByRole("button", { name: "None", exact: true }).click();
          await expect(inspection).toHaveCount(0);
        },
      );
      await expect(
        page.locator('[data-drop="perm-you"]').filter({ has: page.getByRole("img", { name: "Patamon", exact: true }) }),
      ).toHaveCount(1);
      await expect.poll(() => page.evaluate(() => window.browserTestSnapshot().players[0]!.security.length)).toBe(3);
    } finally {
      await page.close();
      await server.close();
    }
  });
}

for (const suffix of ["one", "multiple"]) {
  test(`${suffix} targets evolve from the single search modal`, async ({ page }) => {
    const server = await startBrowserServer();
    try {
      await new DiscordFollowupArena(page).open(
        fixtureVariant({ zero: fixturePatamonZero, one: fixturePatamonOne, multiple: fixturePatamonMultiple }, suffix),
        async () => {
          const selection = page.getByRole("dialog");
          await expect(selection).toHaveCount(1);
          const choices = selection.getByRole("button", { name: /^Unimon/ });
          await expect(choices).toHaveCount(suffix === "one" ? 1 : 2);
          // Duplicate Unimon cards are separate physical choices; deliberately pick the last copy.
          await choices.last().click();
          await selection.getByRole("button", { name: "Confirm targets", exact: true }).click();
          await answerActivation(page, false);
        },
      );
      await expect(
        page.locator('[data-drop="perm-you"]').getByRole("img", { name: "Unimon", exact: true }),
      ).toBeVisible();
      await expect(page.locator(".game-memory-gauge")).toHaveAttribute("aria-label", "Memory: +5");
    } finally {
      await page.close();
      await server.close();
    }
  });
}

test("Inferno Divide affects Alphamon after real Grademon protection", async ({ page }) => {
  const server = await startBrowserServer();
  try {
    await new DiscordFollowupArena(page).open(fixtureCerberusmonAlphamon);
    const ownDigimon = page.locator('[data-drop="perm-you"]');
    await ownDigimon.click();
    await page.getByRole("button", { name: "Attack", exact: true }).click();
    await page.locator('[data-drop="opp-security"]').click();
    await page.getByRole("button", { name: "Select all, top to bottom", exact: true }).click();
    await page
      .locator(".trigger-chooser__footer")
      .getByRole("button", { name: /resolve/i })
      .click();
    await answerActivation(page, true);
    await page.getByRole("button", { name: "Alternate requirement, pays 3 memory", exact: true }).click();
    await answerActivation(page, true);
    await page.getByRole("button", { name: "Alternate requirement, pays 4 memory", exact: true }).click();
    await expect(ownDigimon.getByRole("img", { name: "Alphamon", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /^end turn$/i })).toBeEnabled();
    await page.getByRole("button", { name: /^end turn$/i }).click();
    await expect(ownDigimon.getByRole("img", { name: "Dorumon", exact: true })).toBeVisible({ timeout: 30000 });
    await expect(ownDigimon.getByRole("img", { name: "Alphamon", exact: true })).toHaveCount(0);
  } finally {
    await page.close();
    await server.close();
  }
});

test("Jesmon attacks at negative memory after gaining Gankoomon X immunity", async ({ page }) => {
  const server = await startBrowserServer();
  try {
    await new DiscordFollowupArena(page).open(fixtureJesmonGankoomonImmunity);
    await page.getByRole("button", { name: /^end turn$/i }).click();
    await expect(page.getByRole("button", { name: /^end breeding$/i })).toBeEnabled({ timeout: 30000 });
    await page.getByRole("button", { name: /^end breeding$/i }).click();
    await expect(page.getByRole("button", { name: /^end turn$/i })).toBeEnabled();
    await expect(
      page.locator('[data-drop="perm-opp"]').getByRole("img", { name: "Wingdramon", exact: true }),
    ).toBeVisible();
    await expect(page.locator(".game-memory-gauge")).toHaveAttribute("aria-label", "Memory: +3");
    await page.getByTestId("hand").getByRole("img", { name: "Gankoomon", exact: true }).click();
    await page.getByRole("button", { name: "Play Digimon", exact: true }).click();
    await page.getByRole("button", { name: "Select all, top to bottom", exact: true }).click();
    await page.getByRole("button", { name: "Yes to all", exact: true }).click();
    await page
      .locator(".trigger-chooser__footer")
      .getByRole("button", { name: /resolve/i })
      .click();
    const baseChoice = page.getByRole("region", { name: "Confirm targets", exact: true });
    await expect(baseChoice).toBeVisible();
    await page.locator('[data-drop="perm-you"]').getByRole("img", { name: "Gankoomon", exact: true }).click();
    await baseChoice.getByRole("button", { name: "Confirm targets", exact: true }).click();
    await page.getByRole("button", { name: "Pick Gankoomon (X Antibody)", exact: true }).click();
    await page
      .getByRole("region", { name: "Hand selection", exact: true })
      .getByRole("button", { name: "End Selection", exact: true })
      .click();
    await expect(
      page.locator('[data-drop="perm-you"]').getByRole("img", { name: "Gankoomon (X Antibody)", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "2 cards", exact: true }).click();
    // The only legal attack target is preselected by the ordinary board selection UI.
    await page.getByRole("button", { name: "Attack", exact: true }).click();
    await expect(page.locator(".game-memory-gauge")).toHaveAttribute("aria-label", "Memory: -5");
    // Jesmon's optional When Attacking play and Alliance are independent of its watcher attack.
    // "No to all" presets Alliance to No as well, so no Alliance window opens.
    await page.getByRole("button", { name: "Select all, top to bottom", exact: true }).click();
    await page.getByRole("button", { name: "No to all", exact: true }).click();
    await page
      .locator(".trigger-chooser__footer")
      .getByRole("button", { name: /resolve/i })
      .click();
    await expect(page.getByRole("button", { name: /^end breeding$/i })).toBeEnabled({ timeout: 30000 });
    await expect(page.locator('[data-drop="opp-security"]')).toHaveAttribute("aria-label", "Opponent security · 2");
  } finally {
    await page.close();
    await server.close();
  }
});

for (const accepted of [true, false]) {
  test(`Examon BT23 Partition previews both sources and waits for explicit choice; accepted=${accepted}`, async ({
    page,
  }) => {
    const server = await startBrowserServer({ holdBotAllTurns: false });
    try {
      await new DiscordFollowupArena(page).open(fixtureExamonBt23PartitionChoice);
      await page.getByRole("button", { name: /^end turn$/i }).click();
      const partition = page.getByRole("dialog");
      await expect(partition.getByRole("heading", { name: "Do you want to activate Partition?" })).toBeVisible({
        timeout: 40_000,
      });
      await expect(partition.getByRole("img", { name: "Groundramon", exact: true })).toBeVisible();
      await expect(partition.getByRole("img", { name: "Wingdramon", exact: true })).toBeVisible();
      await expect(partition.getByRole("button", { name: "Confirm targets", exact: true })).toHaveCount(0);
      // Exercise the old response interval without waiting in real time or submitting a choice.
      await page.clock.install();
      await page.clock.runFor(2200);
      await expect(partition.getByRole("heading", { name: "Do you want to activate Partition?" })).toBeVisible();
      await partition.getByRole("button", { name: accepted ? "Yes, activate" : "No, decline", exact: true }).click();
      await expect(partition).toHaveCount(0);
      const own = page.locator('[data-drop="perm-you"]');
      await expect(own.getByRole("img", { name: "Groundramon", exact: true })).toHaveCount(accepted ? 1 : 0);
      await expect(own.getByRole("img", { name: "Wingdramon", exact: true })).toHaveCount(accepted ? 1 : 0);
      await expect(own.getByRole("img", { name: "Examon", exact: true })).toHaveCount(0);
    } finally {
      await page.close();
      await server.close();
    }
  });
}
