import dracomonFixture from "../../api/src/engine/scenarios/dracomon-selection.fixture";
import davisFixture from "../../api/src/engine/scenarios/davis-both-colors.fixture";
import { fixtureInstanceId } from "../../api/src/engine/scenario/references";

import { test, expect } from "./scenario-page";

test.use({ holdBotAfterTurn: 1 });

for (const width of [1440, 390]) {
  for (const theme of ["light", "dark"] as const) {
    for (const card of ["davis", "dracomon"] as const) {
      test(`Feedback #65/#67: ${card} confirmation works at ${width}px in ${theme}`, async ({ scenario, page }) => {
        await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
        await page.addInitScript((dark) => localStorage.setItem("aegis:darkMode", String(dark)), theme === "dark");
        await scenario.openFixture(card === "davis" ? davisFixture : dracomonFixture);
        await scenario.resolveUntil((state) => state.phase === "Main" && !state.pendingDecision);
        expect(await page.locator("html").evaluate((element) => element.classList.contains("dark"))).toBe(
          theme === "dark",
        );
        if (process.env.AEGIS_E2E_PRODUCTION === "true") {
          await expect(page.locator("style[data-vite-dev-id]")).toHaveCount(0);
          expect(await page.locator('link[rel="stylesheet"][href*="/assets/"]').count()).toBeGreaterThan(0);
        }
        const before = await scenario.snapshot();
        await scenario.play(card === "davis" ? "Davis Motomiya" : "Dracomon", card === "davis" ? "Tamer" : "Digimon");
        let selections = 0;
        let orders = 0;
        await scenario.resolveUntil(
          (state) =>
            selections === (card === "davis" ? 2 : 1) &&
            orders === (card === "davis" ? 0 : 1) &&
            !state.pendingDecision &&
            state.players[0]!.hand.some(
              (candidate) =>
                candidate.instanceId ===
                (card === "davis"
                  ? fixtureInstanceId("davis-reveal-lighdramon-card")
                  : fixtureInstanceId("feedback65-reveal-match")),
            ),
          async (decision) => {
            if (decision.kind !== "selectCards" && decision.kind !== "orderCards") return {};
            const confirm = page.getByRole("button", {
              name: decision.kind === "orderCards" ? "Confirm order" : "Confirm targets",
              exact: true,
            });
            await expect(confirm).toBeVisible();
            await expect(confirm).toBeInViewport({ ratio: 1 });
            const panel = page.getByRole("dialog").filter({ has: confirm });
            await expect(panel).toBeVisible();
            const bounds = (await panel.boundingBox())!;
            expect(bounds.y).toBeGreaterThanOrEqual(-1);
            expect(bounds.y + bounds.height).toBeLessThanOrEqual((width === 390 ? 844 : 1000) + 1);
            if (width === 1440) {
              expect(bounds.x + bounds.width / 2).toBeCloseTo(720, 0);
              expect(bounds.y + bounds.height / 2).toBeCloseTo(500, 0);
            }
            await test.info().attach(`${card}-${decision.kind}-${selections}-${theme}-${width}`, {
              body: await page.screenshot(),
              contentType: "image/png",
            });
            if (decision.kind === "orderCards") {
              orders++;
              return {};
            }
            selections++;
            const instanceId =
              card === "davis"
                ? selections === 1
                  ? fixtureInstanceId("davis-reveal-veemon-card")
                  : fixtureInstanceId("davis-reveal-lighdramon-card")
                : fixtureInstanceId("feedback65-reveal-match");
            expect(decision.options.candidateInstanceIds).toContain(instanceId);
            return { instanceId };
          },
        );
        const after = await scenario.snapshot();
        expect(after.memory).toBe(card === "davis" ? 1 : 3);
        expect(after.phase).toBe("Main");
        expect(after.turnSeat).toBe(0);
        expect(selections).toBe(card === "davis" ? 2 : 1);
        expect(orders).toBe(card === "davis" ? 0 : 1);
        expect(after.players[0]!.deckCount).toBe(before.players[0]!.deckCount - (card === "davis" ? 2 : 1));
        expect(after.players[0]!.hand.map((candidate) => candidate.instanceId)).toEqual(
          expect.arrayContaining(
            card === "davis"
              ? [fixtureInstanceId("davis-reveal-veemon-card"), fixtureInstanceId("davis-reveal-lighdramon-card")]
              : [fixtureInstanceId("feedback65-reveal-match"), fixtureInstanceId("feedback65-reserve")],
          ),
        );
        expect(
          after.players[0]!.hand.some(
            (candidate) =>
              candidate.instanceId ===
              (card === "davis" ? fixtureInstanceId("davis-bt3-card") : fixtureInstanceId("feedback65-dracomon")),
          ),
        ).toBe(false);
        expect(
          after.players[0]!.battleArea.some(
            (permanent) =>
              permanent.topCard.instanceId ===
              (card === "davis" ? fixtureInstanceId("davis-bt3-card") : fixtureInstanceId("feedback65-dracomon")),
          ),
        ).toBe(true);
        expect(after.players[0]!.trash).toHaveLength(0);
        if (card === "dracomon") {
          const returned = (await scenario.presentation()).events.find(
            (event) =>
              event.kind === "cardsMoved" &&
              event.to === "deckBottom" &&
              event.instanceIds?.includes(fixtureInstanceId("feedback65-reveal-first")),
          );
          expect(returned?.kind === "cardsMoved" ? returned.instanceIds : undefined).toEqual([
            fixtureInstanceId("feedback65-reveal-first"),
            fixtureInstanceId("feedback65-reveal-second"),
          ]);
        }
        await scenario.healthy();
      });
    }
  }
}
