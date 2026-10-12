import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { RED_DECK, BLUE_DECK } from "../../api/dist/engine/testDecks.js";
import { joinHeadlessOpponent } from "../test/scenarioHarness/headlessOpponent";
import { startBrowserServer } from "./server";

test.use({ hasTouch: true });

interface FrameReport {
  frames: number;
  durationMs: number;
  fps: number;
  p95FrameMs: number;
  longFrames: number;
  worstFrameMs: number;
}

interface PageReport {
  navigationMs: number;
  domContentLoadedMs: number;
  domNodes: number;
  heapMb: number | null;
  horizontalOverflowPx: number;
}

declare global {
  interface Window {
    aegisFrameProbe: { start(): void; stop(): FrameReport };
  }
}

// Frame pacing is measured with requestAnimationFrame deltas because the Long
// Tasks API exists only in Chromium; the same probe runs in every engine.
async function installProbes(page: Page) {
  await page.addInitScript(() => {
    let deltas: number[] = [];
    let last = 0;
    let running = false;
    let startedAt = 0;
    const tick = (now: number) => {
      if (!running) return;
      if (last) deltas.push(now - last);
      last = now;
      requestAnimationFrame(tick);
    };
    window.aegisFrameProbe = {
      start() {
        deltas = [];
        last = 0;
        running = true;
        startedAt = performance.now();
        requestAnimationFrame(tick);
      },
      stop() {
        running = false;
        const durationMs = performance.now() - startedAt;
        const sorted = [...deltas].sort((a, b) => a - b);
        const p95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] ?? 0;
        return {
          frames: deltas.length,
          durationMs: Math.round(durationMs),
          fps: Math.round((deltas.length / durationMs) * 1000),
          p95FrameMs: Math.round(p95),
          longFrames: deltas.filter((delta) => delta > 50).length,
          worstFrameMs: Math.round(sorted.at(-1) ?? 0),
        };
      },
    };
  });
}

function collectErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => {
    // The Colyseus SDK first tries Node's WebSocket(url, { headers }) form inside a
    // try/catch; WebKit logs that rejected attempt before the browser form succeeds.
    if (/Wrong protocol for WebSocket '\[object Object\]'/.test(error.message)) return;
    errors.push(`pageerror: ${error.message}`);
  });
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const text = message.text();
    // External artwork and fonts are not served by the test harness.
    if (/Failed to load resource|ERR_NAME_NOT_RESOLVED|fonts\.g|net::ERR_/i.test(text)) return;
    errors.push(`console: ${text}`);
  });
  return errors;
}

async function pageReport(page: Page): Promise<PageReport> {
  return page.evaluate(() => {
    const navigation = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    const memory = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory;
    return {
      navigationMs: Math.round(navigation?.duration ?? 0),
      domContentLoadedMs: Math.round(navigation?.domContentLoadedEventEnd ?? 0),
      domNodes: document.getElementsByTagName("*").length,
      heapMb: memory ? Math.round(memory.usedJSHeapSize / 1048576) : null,
      horizontalOverflowPx: Math.max(0, document.documentElement.scrollWidth - window.innerWidth),
    };
  });
}

// The window has a minimum length so slow engines still yield enough frames
// to judge; it is a sampling period, not a synchronization wait.
async function measure(page: Page, action: () => Promise<void>, minimumMs = 0) {
  await page.evaluate(() => window.aegisFrameProbe.start());
  const startedAt = Date.now();
  await action();
  const remaining = minimumMs - (Date.now() - startedAt);
  if (remaining > 0) await page.evaluate((ms) => new Promise((resolve) => setTimeout(resolve, ms)), remaining);
  return page.evaluate(() => window.aegisFrameProbe.stop());
}

async function record(testInfo: TestInfo, name: string, data: object) {
  const body = JSON.stringify({ project: testInfo.project.name, surface: name, ...data });
  await testInfo.attach(`perf-${name}`, { body, contentType: "application/json" });
  console.log(`[perf] ${body}`);
}

// Budgets are for an emulated phone on a desktop host running a dev build.
// They catch freezes and runaway work, not small regressions.
function expectSmooth(frames: FrameReport) {
  expect(frames.frames).toBeGreaterThan(10);
  expect(frames.worstFrameMs).toBeLessThan(1500);
  expect(frames.longFrames / frames.frames).toBeLessThan(0.25);
}

test.beforeEach(async ({ page, browserName }) => {
  await installProbes(page);
  // Chromium alone exposes CPU throttling; 4 approximates a low-end Android phone.
  const throttle = Number(process.env.AEGIS_PERF_CPU_THROTTLE ?? 1);
  if (browserName === "chromium" && throttle > 1) {
    const session = await page.context().newCDPSession(page);
    await session.send("Emulation.setCPUThrottlingRate", { rate: throttle });
  }
  await page.addInitScript(() => localStorage.setItem("aegis:locale", "en"));
});

test("deck builder scrolls and filters smoothly", async ({ page }, testInfo) => {
  const errors = collectErrors(page);
  await page.goto("/e2e/mobile-deckbuilder.html");
  await expect(page.getByRole("button", { name: "Edit", exact: true })).toBeVisible();
  const load = await pageReport(page);
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  // Mobile WebKit rejects synthetic wheel input, so scroll the card grid's own scroller.
  const scroll = await measure(page, () =>
    page.evaluate(async () => {
      const scrollers = [...document.querySelectorAll<HTMLElement>("*")].filter(
        (element) =>
          element.scrollHeight > element.clientHeight + 200 && /auto|scroll/.test(getComputedStyle(element).overflowY),
      );
      const scroller = scrollers.sort((a, b) => b.scrollHeight - a.scrollHeight)[0] ?? document.scrollingElement!;
      for (let step = 0; step < 60; step += 1) {
        scroller.scrollBy(0, 120);
        await new Promise((resolve) => requestAnimationFrame(resolve));
      }
    }),
  );
  const after = await pageReport(page);
  await record(testInfo, "deck-builder", { load, scroll, after });
  expect(after.horizontalOverflowPx).toBe(0);
  expectSmooth(scroll);
  expect(errors).toEqual([]);
});

test("effect prompt gallery renders every prompt without overflow", async ({ page }, testInfo) => {
  const errors = collectErrors(page);
  await page.goto("/dev/effect-prompts?case=select-hand&controls=0");
  await expect(page.locator("[data-prompt-surface]")).toBeVisible();
  const load = await pageReport(page);
  await record(testInfo, "effect-prompt", { load });
  expect(load.horizontalOverflowPx).toBe(0);
  expect(errors).toEqual([]);
});

test("live match stays responsive from mulligan through the first turn", async ({ page }, testInfo) => {
  const errors = collectErrors(page);
  const server = await startBrowserServer();
  let opponent: Awaited<ReturnType<typeof joinHeadlessOpponent>> | undefined;
  try {
    await page.addInitScript(
      (options) => {
        window.browserTestOptions = options;
      },
      {
        displayName: "Mobile Perf",
        deck: { mainDeck: [...RED_DECK.mainDeck], eggDeck: [...RED_DECK.eggDeck] },
        seed: 2,
      },
    );
    await page.goto("/e2e/harness.html");
    await expect(page.getByText(/finding an opponent/i)).toBeVisible();
    const load = await pageReport(page);
    opponent = await joinHeadlessOpponent(server.directEndpoint, { displayName: "Perf Opponent", deck: BLUE_DECK });
    opponent.room.onMessage("event", () => {});
    opponent.onDecision((request) => {
      if (request.kind === "mulligan") opponent!.mulligan(true);
    });
    // The opponent passes its own phases so the protagonist reaches a Main phase.
    opponent.room.onStateChange((state) => {
      if (state.turnSeat === 1 && !state.pendingDecision && (state.phase === "Breeding" || state.phase === "Main"))
        opponent!.endPhase();
    });
    opponent.ready();
    const keep = page.getByRole("button", { name: /keep hand/i });
    await expect(keep).toBeVisible();
    const opening = await measure(
      page,
      async () => {
        await keep.tap();
        await expect(page.getByTestId("hand")).toBeVisible();
        await expect
          .poll(() => page.evaluate(() => window.browserTestSnapshot().phase), { timeout: 30_000 })
          .toMatch(/Breeding|Main/);
      },
      3000,
    );
    const board = await pageReport(page);
    const hand = page.getByTestId("hand").getByRole("img").first();
    const inspect = await measure(
      page,
      async () => {
        await hand.tap();
      },
      1000,
    );
    await page.keyboard.press("Escape");
    const endBreeding = page.getByRole("button", { name: /^end breeding$/i });
    const endTurn = page.getByRole("button", { name: /^end turn$/i });
    await expect(endBreeding.or(endTurn)).toBeVisible({ timeout: 30_000 });
    if (await endBreeding.isVisible()) await endBreeding.tap();
    await expect(endTurn).toBeEnabled({ timeout: 30_000 });
    // Lift a playable hand card over the board and back so the release cancels without an action.
    const start = (await page.locator(".game-hand-card--playable").first().boundingBox())!;
    const origin = { x: start.x + start.width / 2, y: start.y + start.height / 2 };
    const drag = await measure(
      page,
      async () => {
        await page.mouse.move(origin.x, origin.y);
        await page.mouse.down();
        for (let step = 1; step <= 40; step += 1) {
          const lift = Math.sin((step / 40) * Math.PI) * 320;
          await page.mouse.move(origin.x, origin.y - lift);
          if (step === 20) await expect(page.getByTestId("drag-ghost")).toBeVisible();
        }
        await page.mouse.up();
      },
      1000,
    );
    await record(testInfo, "live-match", { load, opening, board, inspect, drag });
    expect(board.horizontalOverflowPx).toBe(0);
    expectSmooth(opening);
    expectSmooth(drag);
    expect(errors).toEqual([]);
  } finally {
    await page.close();
    await opponent?.leave();
    await server.close();
  }
});

for (const route of [
  "/",
  "/play",
  "/decks",
  "/collection",
  "/community",
  "/tournaments",
  "/settings",
  "/whats-new",
  "/login",
  "/feedback",
]) {
  test(`product route ${route} loads without overflow or page errors`, async ({ page }, testInfo) => {
    const errors = collectErrors(page);
    await page.goto(route);
    await expect(page.locator("#aegis-main, main").first()).toBeVisible();
    await expect(page.locator(".aegis-screen-fallback")).toHaveCount(0);
    const load = await pageReport(page);
    await record(testInfo, `route${route}`, { load });
    expect(load.horizontalOverflowPx).toBe(0);
    expect(errors).toEqual([]);
  });
}
