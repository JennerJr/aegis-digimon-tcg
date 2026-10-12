import { openFixturePage } from "./scenario-page";
import fixtureP240ArcturusmonOrderedPlacement from "../../api/src/engine/scenarios/p240-arcturusmon-ordered-placement.fixture";
import fixtureDrasilOptionalEffectPresets from "../../api/src/engine/scenarios/drasil-optional-effect-presets.fixture";
import fixtureCounterNoEligible from "../../api/src/engine/scenarios/counter-no-eligible.fixture";
import fixtureMobileBlastCounterTap from "../../api/src/engine/scenarios/mobile-blast-counter-tap.fixture";
import fixtureNezhamonCounterBlock from "../../api/src/engine/scenarios/nezhamon-counter-block.fixture";
import { fixturePermanentId } from "../../api/src/engine/scenario/references";
import { expect, type Locator, type Page } from "@playwright/test";
import { answerActivation, test } from "./scenario-page";
import { startBrowserServer } from "./server";

/**
 * User follow-up to `followup-stale-activation-label-specs.md`, questions 1 to 3:
 * 1. A pending activation prompt must not block the notice band; the board stays locked.
 * 2. On phones the activation prompt must not cover the card whose effect asks.
 * 3. No Counter window without a usable counter, and a Counter prompt never covers the hand.
 */

const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1440, height: 1000 };

type Box = { x: number; y: number; width: number; height: number };
const overlaps = (a: Box, b: Box) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

/** What a tap at the centre of `target` would land on, as seen by the page. */
function hitsItself(target: Locator) {
  return target.evaluate((element) => {
    const box = element.getBoundingClientRect();
    const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
    return hit !== null && element.contains(hit);
  });
}

function activationPrompt(page: Page) {
  return page.getByRole("dialog").filter({ has: page.getByRole("button", { name: "Yes, activate", exact: true }) });
}

for (const viewport of [PHONE, DESKTOP]) {
  test.describe(`pending activation prompts at ${viewport.width}px`, () => {
    test.use({ viewport });

    test("the notice can be opened by tapping while the board stays locked", async ({ scenario }) => {
      const { page } = scenario;
      await scenario.openFixture(fixtureDrasilOptionalEffectPresets);
      await scenario.play("Dracmon", "Digimon");
      await page.getByRole("button", { name: "Select all, top to bottom", exact: true }).click();
      await page.getByRole("button", { name: "Resolve in this order", exact: true }).click();
      await answerActivation(page, true);
      const activation = activationPrompt(page);
      await expect(activation).toBeVisible();
      const accepted = page.locator("[data-narration-id]").filter({ hasText: "King Drasil" });
      if (viewport === PHONE) {
        const peek = page.locator(".narration-peek");
        await expect(peek).toBeVisible();
        expect(await hitsItself(peek), "the notice band must take a tap over the prompt's backdrop").toBe(true);
        await peek.click();
      }
      await expect(accepted).toBeVisible();
      await expect
        .poll(() => hitsItself(accepted.first()), { message: "the opened notice must be readable and tappable" })
        .toBe(true);

      // On phones the board under the prompt's backdrop still takes no input.
      const endTurn = page.getByRole("button", { name: /^End turn$/i });
      if (viewport === PHONE && (await endTurn.count())) expect(await hitsItself(endTurn)).toBe(false);
      await expect(activation).toBeVisible();

      if (viewport === PHONE) {
        await activation.getByRole("button", { name: /^view board$/i }).click();
        const back = page.getByRole("button", { name: "Return to decision", exact: true });
        await expect(back).toBeVisible();
        const peek = page.locator(".narration-peek");
        if (await peek.count()) {
          expect(overlaps((await back.boundingBox())!, (await peek.boundingBox())!)).toBe(false);
          expect(await hitsItself(peek)).toBe(true);
        }
        await back.click();
      }
      await answerActivation(page, true);
      await expect(activation).toHaveCount(0);
      await scenario.healthy();
    });
  });
}

for (const viewport of [PHONE, { width: 360, height: 780 }, DESKTOP]) {
  test(`the activation prompt leaves its source card visible at ${viewport.width}px (P-240)`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const server = await startBrowserServer();
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
      const source = page
        .locator('[data-drop="perm-you"]')
        .filter({ has: page.getByRole("img", { name: "Arcturusmon", exact: true }) });
      await expect(source).toHaveClass(/game-permanent--effect-linked/);
      await expect.poll(async () => overlaps((await source.boundingBox())!, (await prompt.boundingBox())!)).toBe(false);
      for (const name of ["Yes, activate", "No, decline"]) {
        await expect(prompt.getByRole("button", { name, exact: true })).toBeInViewport({ ratio: 1 });
      }
      await answerActivation(page, false);
      await expect(prompt).toBeHidden();
    } finally {
      await server.close();
    }
  });
}

function counterPrompt(page: Page) {
  return page.locator(".board-prompt--counter");
}

/** On phones the hand dock must stay uncovered by the Counter prompt. */
async function expectHandClear(page: Page, prompt: Locator) {
  const hand = (await page.locator(".game-hand-dock").boundingBox())!;
  await expect
    .poll(async () => (await prompt.boundingBox())!.y + (await prompt.boundingBox())!.height)
    .toBeLessThanOrEqual(hand.y + 1);
}

for (const viewport of [PHONE, DESKTOP]) {
  test.describe(`Counter timing at ${viewport.width}px`, () => {
    test.use({ viewport });

    test("no Counter window opens when nothing can be used", async ({ scenario }) => {
      const { page } = scenario;
      await scenario.openFixture(fixtureCounterNoEligible, "normal", "none");
      await expect.poll(async () => (await scenario.snapshot()).combatWindow?.kind).toBe("block");
      expect((await scenario.presentation()).events.some((event) => event.kind === "counterWindowOpened")).toBe(false);
      await expect(counterPrompt(page)).toHaveCount(0);
    });

    test("a usable Blast Digivolve card still opens the Counter window above the hand", async ({ scenario }) => {
      const { page } = scenario;
      await scenario.openFixture(fixtureMobileBlastCounterTap, "normal", "none");
      const prompt = counterPrompt(page);
      await expect(prompt).toBeVisible();
      await expect.poll(async () => (await scenario.snapshot()).combatWindow?.kind).toBe("counter");
      if (viewport === PHONE) await expectHandClear(page, prompt);
      await prompt.getByRole("button", { name: "Pass Counter", exact: true }).click();
      await expect(prompt).toHaveCount(0);
    });
  });

  test.describe(`Counter from a field card at ${viewport.width}px`, () => {
    test.use({
      viewport,
      holdBotAfterTurn: 3,
      botMainIntents: [
        [
          { type: "attack", attackerPermanentId: fixturePermanentId("opponent-nezhamon"), target: { kind: "player" } },
          { type: "endPhase" },
        ],
        { scope: "test" },
      ],
    });

    test("the Counter prompt leaves the locked hand visible", async ({ scenario }) => {
      const { page } = scenario;
      await scenario.openFixture(fixtureNezhamonCounterBlock);
      await scenario.resolveUntil((s) => s.phase === "Main" && !s.pendingDecision);
      await page.getByRole("button", { name: /^End turn$/i }).click();
      await expect.poll(async () => (await scenario.snapshot()).pendingDecision?.seat).toBe(0);
      await answerActivation(page, false);
      const prompt = counterPrompt(page);
      await expect(prompt).toBeVisible();
      await expect(prompt).toContainText("Takutoumon");
      if (viewport === PHONE) {
        await expectHandClear(page, prompt);
        const source = page.locator(`[data-drop="perm-you"][data-id="${fixturePermanentId("own-takutoumon")}"]`);
        await expect
          .poll(async () => overlaps((await source.boundingBox())!, (await prompt.boundingBox())!))
          .toBe(false);
      }
      await prompt.getByRole("button", { name: "Pass Counter", exact: true }).click();
      await expect(prompt).toHaveCount(0);
    });
  });
}
