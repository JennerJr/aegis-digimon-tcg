import fixtureSakuyamonMaidOptionTiming from "../../api/src/engine/scenarios/sakuyamon-maid-option-timing.fixture";
import { writeFile } from "node:fs/promises";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { RED_DECK } from "../../api/dist/engine/testDecks.js";
import { startBrowserServer } from "./server";
import type {} from "./harness";

class SakuyamonScenario {
  constructor(readonly page: Page) {}

  async open(speed: "normal" | "slow") {
    await this.page.addInitScript(
      ({ deck, speed: effectSpeed }) => {
        localStorage.setItem("aegis:locale", "en");
        localStorage.setItem("aegis.effect-speed", effectSpeed);
        localStorage.setItem("aegis.action-confirmation.enabled", "false");
        window.browserTestOptions = {
          displayName: "Sakuyamon regression",
          seed: 1,
          deck,
          devScenario: "local-fixture",
        };
        document.addEventListener("DOMContentLoaded", () => document.documentElement.classList.add("dark"));
      },
      { deck: RED_DECK, speed },
    );
    await this.page.goto("/e2e/harness.html");
    await this.page.getByRole("button", { name: /^end breeding$/i }).click();
    await this.idle();
  }

  async hand(name: string) {
    const card = this.page.getByTestId("hand").getByRole("button", { name: `Select ${name}`, exact: true });
    await card.focus();
    await card.press("Enter");
  }

  async idle(timeout = 8_000) {
    await expect(this.page.getByRole("button", { name: /^end turn$/i })).toBeEnabled();
    await expect.poll(() => this.page.evaluate(() => window.browserTestPresentation().idle), { timeout }).toBe(true);
  }

  async activate(card: string) {
    const prompt = this.page.getByRole("dialog", { name: `${card} · effect`, exact: true });
    await expect(prompt.getByRole("heading", { name: "Use this effect?", exact: true })).toBeVisible();
    await prompt.getByRole("button", { name: "Yes, activate", exact: true }).click();
  }

  snapshot() {
    return this.page.evaluate(() => window.browserTestSnapshot());
  }

  async evidence(info: TestInfo) {
    const evidence = await this.page.evaluate(() => ({
      ...window.browserTestPresentation(),
      snapshot: window.browserTestSnapshot(),
    }));
    const path = info.outputPath("presentation-timings.json");
    await writeFile(path, JSON.stringify(evidence, null, 2));
    await info.attach("presentation-timings", { path, contentType: "application/json" });
  }
}

for (const speed of ["normal", "slow"] as const) {
  test(`Yellow Scramble used by Taomon completes Sakuyamon's scenario without animation timeouts (${speed})`, async ({
    page,
  }, info) => {
    const server = await startBrowserServer({ holdBotAllTurns: false });
    server.useFixture(fixtureSakuyamonMaidOptionTiming);
    const scenario = new SakuyamonScenario(page);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    try {
      await scenario.open(speed);
      await scenario.hand("Taomon");
      await page.getByRole("button", { name: "Digivolve", exact: true }).click();
      await page
        .getByRole("group", { name: "Your Digimon", exact: true })
        .getByRole("button", { name: "Kyubimon", exact: true })
        .click();
      await scenario.activate("Taomon");
      const endSelection = page.getByRole("button", { name: /^end selection$/i });
      await expect(endSelection).toBeVisible();
      const scramble = page.getByTestId("hand").getByRole("button", { name: "Pick Yellow Scramble", exact: true });
      await scramble.focus();
      await scramble.press("Enter");
      await endSelection.click();
      // Taomon must hand off to the Option decision without waiting for the
      // Option dock, which stays open until that decision is answered.
      await expect
        .poll(() =>
          page.evaluate(() => {
            const settled = window
              .browserTestPresentation()
              .steps.find((step) => step.id.startsWith("effect-unit-resettle-") && step.phase === "finished");
            return settled?.durationMs;
          }),
        )
        .toBeLessThan(speed === "slow" ? 3_000 : 2_000);
      await scenario.activate("Yellow Scramble");

      // Observe the complete automatic evolution and draw before answering later
      // triggers. Keeping the routed Option open here used to hit its 45 s ceiling.
      const resolutionStarted = Date.now();
      const ordering = page
        .getByRole("dialog")
        .filter({ has: page.getByRole("heading", { name: "Order pending effects", exact: true }) });
      await expect(ordering).toBeVisible({ timeout: 8_000 });
      await expect
        .poll(
          () =>
            page.evaluate(() => {
              const presentation = window.browserTestPresentation();
              return presentation.steps.some(
                (step) => step.id.startsWith("option-dock-hold-") && step.phase === "finished",
              );
            }),
          { timeout: 8_000 },
        )
        .toBe(true);
      expect(Date.now() - resolutionStarted).toBeLessThan(speed === "slow" ? 8_000 : 6_000);

      const evolved = await scenario.snapshot();
      expect(evolved.memory).toBe(6);
      expect(
        evolved.players[0]!.battleArea.map((card: { topCard: { cardId: string } }) => card.topCard.cardId),
      ).toEqual(["ST22-06", "LM-029"]);
      expect(evolved.players[1]!.battleArea).toHaveLength(2);
      expect(evolved.players[1]!.securityCount).toBe(5);
      expect(JSON.parse(evolved.pendingDecision!.payloadJson).triggerTimings).not.toContain("AllTurns");
      await ordering.getByRole("button", { name: "Select all, top to bottom", exact: true }).click();
      await ordering.getByRole("button", { name: "Resolve in this order", exact: true }).click();
      await page
        .getByRole("dialog", { name: "Sakuyamon: Maid Mode · effect", exact: true })
        .getByRole("button", { name: "No, decline", exact: true })
        .click();
      await expect(page.getByRole("button", { name: "Confirm targets", exact: true })).toBeVisible();
      await page
        .getByRole("group", { name: "Opponent's Digimon", exact: true })
        .getByRole("button", { name: "Agumon", exact: true })
        .click();
      await page.getByRole("button", { name: "Confirm targets", exact: true }).click();
      await scenario.idle();

      await scenario.hand("Blade of the True");
      await page.getByRole("button", { name: "Play Option", exact: true }).click();
      await scenario.activate("Sakuyamon: Maid Mode");
      await scenario.idle();
      const final = await scenario.snapshot();
      expect(final.memory).toBe(4);
      expect(final.players[0]!.hand).toHaveLength(5);
      expect(final.players[0]!.deckCount).toBe(43);
      expect(final.players[1]!.battleArea.map((card: { topCard: { cardId: string } }) => card.topCard.cardId)).toEqual([
        "BT1-009",
      ]);
      expect(final.players[1]!.securityCount).toBe(5);
      const presentation = await page.evaluate(() => window.browserTestPresentation());
      expect(presentation.visible?.players[1].battleArea.map((card) => card.topCard.cardId)).toEqual(["BT1-009"]);
      expect(presentation.visible?.memory.value).toBe(4);
      const agumonId = evolved.players[1]!.battleArea.find((card) => card.topCard.cardId === "BT1-010")!.topCard
        .instanceId;
      expect(
        presentation.events.some(
          (event) => event.kind === "cardsMoved" && event.to === "security" && event.instanceIds.includes(agumonId),
        ),
      ).toBe(true);
      expect(presentation.pending).toBe(0);
      expect(presentation.gateExpiries).toEqual([]);
      expect(presentation.steps.filter((step) => step.failed || step.cancelled)).toEqual([]);
      expect(
        presentation.steps
          .filter((step) => step.phase === "started")
          .map((step) => step.id)
          .sort(),
      ).toEqual(
        presentation.steps
          .filter((step) => step.phase === "finished")
          .map((step) => step.id)
          .sort(),
      );
      expect(presentation.counters).toEqual({
        boardBudgetHits: 0,
        decisionBudgetHits: 0,
        decisionStallHits: 0,
        skips: 0,
        manualAdvances: 0,
      });
      const draws = presentation.steps.filter(
        (step) => step.id.startsWith("draw-presentation-") && step.phase === "finished",
      );
      expect(draws).toHaveLength(4);
      for (const draw of draws) expect(draw.durationMs).toBeLessThan(5_000);
      expect(errors).toEqual([]);
    } finally {
      try {
        if (!page.isClosed()) await scenario.evidence(info);
      } finally {
        try {
          await page.close();
        } finally {
          await server.close();
        }
      }
    }
  });
}
