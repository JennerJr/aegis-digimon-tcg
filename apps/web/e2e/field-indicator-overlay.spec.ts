import { openFixturePage } from "./scenario-page";
import { startBrowserServer } from "./server";
import fixtureBt13RoyalPurgeDelayRush from "../../api/src/engine/scenarios/bt13-royal-purge-delay-rush.fixture";
import { expect, test, type Locator, type Page } from "@playwright/test";

let server: Awaited<ReturnType<typeof startBrowserServer>>;

test.beforeEach(async () => {
  server = await startBrowserServer();
});

test.afterEach(async ({ page }) => {
  await page.close();
  await server.close();
});

function resolutionPlan(page: Page) {
  return page.locator('.decision-overlay--resolution-plan[role="dialog"]').filter({
    has: page.getByRole("heading", { name: "Order pending effects", exact: true, includeHidden: true }),
  });
}

async function openFixture(page: Page) {
  await page.addInitScript(() => localStorage.setItem("aegis:locale", "en"));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await openFixturePage(page, fixtureBt13RoyalPurgeDelayRush);
  // This fixture automatically passes breeding and settles Drasil's mandatory
  // Start of Main effect; no fabricated response or optional acceptance is needed.
  await expect(page.getByRole("button", { name: /^End turn$/i })).toBeEnabled();
  await page.getByRole("button", { name: "Royal Knights of the Purge", exact: true }).click();
  await page.getByRole("button", { name: /^Activate effect: \[Main\][\s\S]*Delay/ }).click();
  // The only legal Omnimon is selected by the engine. Its real cost interruption
  // offers Drasil's optional reduction before the two independent Cool Boy effects.
  await page.getByRole("button", { name: /^Yes, activate$/i }).click();
  await expect(resolutionPlan(page)).toBeVisible();
}

async function hitProbe(dialog: Locator) {
  return dialog.evaluate((panel) => {
    function rect(element: Element) {
      const bounds = element.getBoundingClientRect();
      return { left: bounds.left, top: bounds.top, right: bounds.right, bottom: bounds.bottom };
    }
    function visibleRect(element: Element) {
      const bounds = rect(element);
      bounds.left = Math.max(bounds.left, 0);
      bounds.right = Math.min(bounds.right, innerWidth);
      bounds.top = Math.max(bounds.top, 0);
      bounds.bottom = Math.min(bounds.bottom, innerHeight);
      for (let parent = element.parentElement; parent; parent = parent.parentElement) {
        const style = getComputedStyle(parent);
        const clip = rect(parent);
        if (/(hidden|clip|scroll|auto)/.test(style.overflowX)) {
          bounds.left = Math.max(bounds.left, clip.left);
          bounds.right = Math.min(bounds.right, clip.right);
        }
        if (/(hidden|clip|scroll|auto)/.test(style.overflowY)) {
          bounds.top = Math.max(bounds.top, clip.top);
          bounds.bottom = Math.min(bounds.bottom, clip.bottom);
        }
      }
      return bounds;
    }
    function contexts(element: Element) {
      const entries = [];
      for (let node: Element | null = element; node; node = node.parentElement) {
        const style = getComputedStyle(node);
        entries.push({
          id: node.id,
          className: node.className,
          position: style.position,
          zIndex: style.zIndex,
          transform: style.transform,
        });
      }
      return entries;
    }
    const chrome = [
      ...document.querySelectorAll(
        ".game-field-effects > summary, .game-field-effects[open] > .game-field-effects__list",
      ),
    ];
    const controls = [
      ...panel.querySelectorAll(
        ".trigger-chooser__option, .trigger-chooser__preset button, .trigger-chooser__footer button",
      ),
    ];
    const probes = controls.flatMap((control) => {
      const bounds = visibleRect(control);
      if (bounds.right <= bounds.left || bounds.bottom <= bounds.top) return [];
      const points = [{ kind: "center", x: (bounds.left + bounds.right) / 2, y: (bounds.top + bounds.bottom) / 2 }];
      for (const element of chrome) {
        const overlay = rect(element);
        const left = Math.max(bounds.left, overlay.left),
          right = Math.min(bounds.right, overlay.right);
        const top = Math.max(bounds.top, overlay.top),
          bottom = Math.min(bounds.bottom, overlay.bottom);
        if (right > left && bottom > top)
          points.push({ kind: "intersection", x: (left + right) / 2, y: (top + bottom) / 2 });
      }
      return points.map((point) => {
        const hit = document.elementFromPoint(point.x, point.y);
        return {
          ...point,
          label: control.getAttribute("aria-label") || control.textContent,
          controlOwnsHit: hit !== null && control.contains(hit),
          fieldOwnsHit: !!hit?.closest(".game-field-effects"),
          hitClass: hit?.className,
        };
      });
    });
    return {
      viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio },
      media: { coarse: matchMedia("(pointer: coarse)").matches, hover: matchMedia("(hover: hover)").matches },
      indicators: [...document.querySelectorAll<HTMLDetailsElement>(".game-field-effects")].map((node) => ({
        open: node.open,
        rect: rect(node),
        contexts: contexts(node),
      })),
      dialog: { rect: rect(panel), contexts: contexts(panel) },
      probes,
      pass: probes.length > 0 && probes.every((point) => point.controlOwnsHit),
    };
  });
}

for (const hasTouch of [false, true]) {
  test.describe(hasTouch ? "touch pointer" : "fine pointer", () => {
    test.use({ hasTouch });
    for (const viewport of [
      { width: 390, height: 844 },
      { width: 844, height: 390 },
      { width: 768, height: 1024 },
      { width: 1440, height: 1000 },
    ]) {
      test(`field chrome cannot intercept decisions at ${viewport.width}x${viewport.height}`, async ({
        page,
      }, testInfo) => {
        await page.setViewportSize(viewport);
        await page.emulateMedia({ reducedMotion: "reduce" });
        await openFixture(page);
        await page.setViewportSize(viewport);
        const dialog = resolutionPlan(page);
        const own = page.locator(".game-field-effects--own");
        const summary = own.locator("summary");
        const presets = dialog.locator(".trigger-chooser__preset");
        await expect(presets).toHaveCount(2);

        if (viewport.width === 844 && viewport.height === 390) {
          await dialog.getByRole("button", { name: /^View board$/i }).click();
          await expect(dialog).toBeHidden();
          const fit = await page.locator(".game-field").evaluate((field) => {
            const row = field.querySelector(".game-battle-row--you")!;
            const bounds = row.getBoundingClientRect();
            const visible = field.getBoundingClientRect();
            const top = bounds.bottom - 30;
            return {
              viewport: { width: innerWidth, height: innerHeight },
              row: bounds.toJSON(),
              field: visible.toJSON(),
              top,
              fits: top >= visible.top && top + 44 <= visible.bottom,
            };
          });
          await testInfo.attach("short-landscape-existing-no-fit", {
            body: JSON.stringify(fit, null, 2),
            contentType: "application/json",
          });
          // Existing anchoring deliberately suppresses chrome that cannot fit.
          // This checks absence at landscape, not an exposed overlay there.
          expect(fit.fits).toBe(false);
          await expect(own).toHaveCount(0);
          await page.getByRole("button", { name: /^Return to decision$/i }).click();
          expect((await hitProbe(dialog)).pass).toBe(true);
          await expect(presets.getByRole("button", { name: "Ask", exact: true }).first()).toHaveAttribute(
            "aria-pressed",
            "true",
          );
          // Preserve the same pending choices when folding back to a fitting view.
          await page.setViewportSize({ width: 390, height: 844 });
        }

        for (const open of [false, true]) {
          await dialog.getByRole("button", { name: /^View board$/i }).click();
          await expect(dialog).toBeHidden();
          await expect(summary).toBeVisible();
          await expect(summary).toHaveAccessibleName("Your field: Can't digivolve");
          if (open) {
            await summary.click();
            await expect(own).toHaveAttribute("open", "");
            await expect(own.getByText("While active", { exact: true })).toBeVisible();
          }
          // Real keyboard activation preserves the open explanation while the
          // decision returns, without synthetic state or clicking covered chrome.
          const back = page.getByRole("button", { name: /^Return to decision$/i });
          await back.focus();
          await back.press("Enter");
          await expect(dialog).toBeVisible();
          expect(await own.evaluate((element) => (element as HTMLDetailsElement).open)).toBe(open);
          const proof = await hitProbe(dialog);
          await testInfo.attach(open ? "open-field-geometry" : "closed-field-geometry", {
            body: JSON.stringify(proof, null, 2),
            contentType: "application/json",
          });
          expect(proof.probes.length).toBeGreaterThan(0);
          // The live RED at 390x844 overlaps the first presets and second row.
          if (open && proof.viewport.width === 390)
            expect(proof.probes.some((point) => point.kind === "intersection")).toBe(true);
          expect(proof.pass, JSON.stringify(proof.probes)).toBe(true);
        }

        const firstYes = presets.nth(0).getByRole("button", { name: "Yes", exact: true });
        if (hasTouch) await firstYes.tap();
        else await firstYes.click();
        await expect(firstYes).toHaveAttribute("aria-pressed", "true");
        await expect(presets.nth(0).getByRole("button", { name: "Ask", exact: true })).toHaveAttribute(
          "aria-pressed",
          "false",
        );
        await expect(presets.nth(1).getByRole("button", { name: "Ask", exact: true })).toHaveAttribute(
          "aria-pressed",
          "true",
        );
        await expect(dialog.locator(".trigger-chooser__option[aria-pressed=true]")).toHaveCount(0);

        // Explanations remain keyboard accessible, dismiss without stealing focus,
        // and an outside pointer closes the explanation while a decision is pending.
        await dialog.getByRole("button", { name: /^View board$/i }).click();
        await summary.focus();
        await summary.press("Enter");
        await expect(own).toHaveAttribute("open", "");
        await summary.press("Escape");
        await expect(own).not.toHaveAttribute("open", "");
        await expect(summary).toBeFocused();
        await summary.press("Enter");
        await page
          .getByRole("img", { name: /^Memory:/ })
          .locator(".game-memory-coin--marker")
          .click();
        await expect(own).not.toHaveAttribute("open", "");
        await page.getByRole("button", { name: /^Return to decision$/i }).click();
        await expect(firstYes).toHaveAttribute("aria-pressed", "true");

        const secondNo = presets.nth(1).getByRole("button", { name: "No", exact: true });
        await secondNo.scrollIntoViewIfNeeded();
        if (hasTouch) await secondNo.tap();
        else await secondNo.click();
        await expect(secondNo).toHaveAttribute("aria-pressed", "true");
        await expect(firstYes).toHaveAttribute("aria-pressed", "true");
        expect((await hitProbe(dialog)).pass).toBe(true);

        // Folding/resizing while the same decision is pending must keep the
        // indicator's viewport anchor and modal hit targets in their owners.
        await page.setViewportSize({ width: viewport.width === 768 ? 390 : 768, height: 1024 });
        await expect.poll(async () => (await hitProbe(dialog)).pass).toBe(true);
        await dialog.getByRole("button", { name: /^Resolve in this order$/i }).click();
        await expect(dialog).toBeHidden();
        await expect(summary).toBeVisible();
        await summary.click();
        await expect(own.getByText("While active", { exact: true })).toBeVisible();
      });
    }
  });
}
