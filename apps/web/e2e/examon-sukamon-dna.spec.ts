import fixtureSukamonDnaMaterials from "../../api/src/engine/scenarios/sukamon-dna-materials.fixture";
import fixtureSukamonDnaControl from "../../api/src/engine/scenarios/sukamon-dna-control.fixture";
import { test, expect, type ScenarioPage } from "./scenario-page";
import { GamePage } from "./game-page";

test.use({ holdBotAfterTurn: 6 });

type Snapshot = Awaited<ReturnType<ScenarioPage["snapshot"]>>;

// The opponent's whole turn (phase banners, bot action delays) can outlast the
// 10 s window resolveUntil allows for each step, so wait for the turn handoff or
// for our own decision first.
async function awaitHumanTurn(scenario: ScenarioPage, done: (state: Snapshot) => boolean) {
  await expect
    .poll(
      async () => {
        const state = await scenario.snapshot();
        if (done(state)) return true;
        const pending = state.pendingDecision;
        return !!pending && (await scenario.presentation()).decisions.some((d) => d.decisionId === pending.decisionId);
      },
      { timeout: 60_000 },
    )
    .toBe(true);
  await scenario.resolveUntil(done, (decision) => ({
    accept: false,
    decisionBudgetMs: decision.sourceCardId === "EX13-021" ? 10_000 : undefined,
  }));
}

for (const transformed of [true, false]) {
  test(`Examon DNA uses current material colors (Wingdramon transformed=${transformed})`, async ({
    scenario,
    page,
  }) => {
    test.setTimeout(150_000);
    await scenario.openFixture(transformed ? fixtureSukamonDnaMaterials : fixtureSukamonDnaControl);
    await awaitHumanTurn(scenario, (s) => s.turnSeat === 0 && s.phase === "Breeding" && !s.pendingDecision);
    await page.getByRole("button", { name: /^end breeding$/i }).click();
    await scenario.resolveUntil((s) => s.turnSeat === 0 && s.phase === "Main" && !s.pendingDecision);
    const initial = await scenario.snapshot();
    const examon = initial.players[0]!.hand.find((c) => c.cardId === "EX13-045")!;
    expect(examon.dnaDigivolveRoutes).toHaveLength(transformed ? 0 : 1);
    if (transformed) {
      // KingSukamon (BT11-043) rewrote Wingdramon into a white 3000 DP [Sukamon].
      // Examon's printed "Green Lv.6 + Blue Lv.6" needs a blue material; Q2080 makes
      // the original color white, so the color slot can no longer be filled.
      const material = initial.players[0]!.battleArea.find((p) => p.topCard.cardId === "EX13-021")!;
      expect(material.currentDP).toBe(3000);
      expect(material.originalColorsOverride).toEqual(["White"]);
      expect(material.originalNameOverride).toBe("Sukamon");
      await scenario.hand("Examon");
      await expect(page.getByRole("button", { name: "DNA Digivolve", exact: true })).toHaveCount(0);
      await page.getByRole("button", { name: "Close", exact: true }).click();
      await page.getByRole("button", { name: /^end turn$/i }).click();
      // Dracomon's inherited [End of Your Turn] DNA must not merge the white material either.
      await awaitHumanTurn(
        scenario,
        (s) => s.turnSeat === 0 && s.turnCount === 5 && s.phase === "Breeding" && !s.pendingDecision,
      );
      await page.getByRole("button", { name: /^end breeding$/i }).click();
      await scenario.resolveUntil((s) => s.phase === "Main" && !s.pendingDecision);
      const after = await scenario.snapshot();
      expect(after.players[0]!.battleArea.map((p) => p.topCard.cardId)).toEqual(["EX13-021", "EX13-044"]);
      // The rewrite lasted only until the end of the reporter's opponent's turn.
      const restored = after.players[0]!.battleArea.find((p) => p.topCard.cardId === "EX13-021")!;
      expect(restored.originalColorsOverride ?? []).toEqual([]);
      expect(after.players[0]!.hand.find((c) => c.cardId === "EX13-045")!.dnaDigivolveRoutes).toHaveLength(1);
      expect(
        (await scenario.presentation()).events.filter((e) => e.kind === "digivolved" && e.cardId === "EX13-045"),
      ).toHaveLength(0);
    }
    {
      const before = await scenario.snapshot();
      await expect(page.getByRole("button", { name: /^end turn$/i })).toBeEnabled();
      await new GamePage(page).dragCardTo(/^Examon$/i, page.locator('[data-drop="battle-you"]'));
      const dna = page.getByRole("region", { name: /DNA Digivolution available/i });
      await expect(dna).toBeVisible();
      for (const material of before.players[0]!.battleArea) {
        const card = page.locator(`[data-id="${material.permanentId}"][role="button"]`);
        if (!(await card.locator(".game-permanent__material-order").count())) {
          await card.focus();
          await card.press("Enter");
        }
        await expect(card.locator(".game-permanent__material-order")).toBeVisible();
      }
      await expect(dna.getByRole("status").filter({ hasText: "Cost: 0" })).toBeVisible();
      await dna.getByRole("button", { name: "DNA Digivolve", exact: true }).click();
      await scenario.resolveUntil(
        (s) =>
          s.players[0]!.battleArea.some((p) => p.topCard.cardId === "EX13-045") &&
          !s.pendingDecision &&
          !s.combatWindow,
        (decision) => ({
          accept: false,
          decisionBudgetMs:
            decision.sourceCardId === "EX13-045" || decision.sourceCardId === "EX13-021" ? 10_000 : undefined,
        }),
      );
      const final = await scenario.snapshot();
      const result = final.players[0]!.battleArea.find((p) => p.topCard.cardId === "EX13-045")!;
      // CR 8-2-2-2: the left-hand Green Lv.6 (Breakdramon) goes on top; stack is bottom-first.
      expect(result.stack.map((c) => c.cardId)).toEqual(["EX13-008", "EX13-021", "EX13-044"]);
      expect(final.players[0]!.battleArea).toHaveLength(1);
      expect(final.players[0]!.hand.some((c) => c.instanceId === examon.instanceId)).toBe(false);
    }
    await scenario.healthy();
  });
}
