import { expect, test, type Page } from "@playwright/test";

test.use({ video: "on" });

const topic = {
  id: 7,
  kind: "bug",
  summary: "Effect timing after digivolution",
  authorName: "Kai",
  createdAt: 1791700000000,
  updatedAt: 1791700000000,
  status: "triaged",
  supportCount: 12,
  commentCount: 1,
  supported: false,
  following: false,
  hidden: false,
  description:
    "## What happened\n\nThe effect did not activate.\n\n## How to reproduce\n\n1. Start a match.\n2. Digivolve.",
  cardIds: ["BT1-010"],
  images: [],
  finalReply: null,
  duplicateOfId: null,
  history: [{ from: null, to: "new", at: 1791700000000, byReporter: false, comment: null }],
  comments: [
    {
      id: 1,
      authorName: "Aegis team",
      official: true,
      body: "We are investigating the effect timing.",
      createdAt: 1791700000000,
      images: [],
      hidden: false,
    },
  ],
  nextAfter: null,
};

class PublicForumPage {
  constructor(readonly page: Page) {}
  async open({
    signedIn = false,
    path = "/feedback",
    failPublication = false,
    isAdmin = false,
  }: { signedIn?: boolean; path?: string; failPublication?: boolean; isAdmin?: boolean } = {}) {
    const current = structuredClone(topic);
    const submissions: Record<string, unknown>[] = [];
    await this.page.route("http://127.0.0.1:2569/**", async (route) => {
      const requestPath = new URL(route.request().url()).pathname;
      const method = route.request().method();
      let body: unknown = {};
      if (requestPath === "/auth/me") {
        if (!signedIn) {
          await route.fulfill({ status: 401, json: { error: "authentication_required" } });
          return;
        }
        body = { id: "forum-fixture", displayName: "Kai", isAdmin, avatarUrl: null, avatarId: null };
      } else if (requestPath === "/account/decks") body = [];
      else if (requestPath === "/community/decks") body = { decks: [], hasMore: false };
      else if (requestPath === "/feedback/roadmap")
        body = {
          reviewedAt: "2026-10-12",
          items: [
            {
              id: "ranked-leaderboard",
              stage: "planned",
              title: { en: "Ranked / Leaderboard", "pt-BR": "Ranked / Leaderboard", es: "Ranked / Leaderboard" },
              description: {
                en: "Enable ranked matches when reliability is ready.",
                "pt-BR": "Liberar partidas ranqueadas quando estiverem estáveis.",
                es: "Habilitar partidas clasificatorias cuando sean estables.",
              },
              discordUrls: ["https://discord.com/channels/1525646227608178798/1556079380667830374"],
              websiteRequests: 1,
            },
            {
              id: "friends",
              stage: "idea",
              title: {
                en: "Friends and match invitations",
                "pt-BR": "Amigos e convites para partidas",
                es: "Amigos e invitaciones a partidas",
              },
              description: {
                en: "Find players, add friends and invite them to play.",
                "pt-BR": "Buscar jogadores e convidar amigos para jogar.",
                es: "Buscar jugadores e invitar amigos a jugar.",
              },
              discordUrls: [],
              websiteRequests: 1,
            },
          ],
        };
      else if (requestPath === "/feedback/topics" && method === "GET") {
        const query = new URL(route.request().url()).searchParams;
        const status = query.get("status");
        const kind = query.get("kind");
        const variants = [
          current,
          { ...current, id: 8, kind: "improvement", status: "new", summary: "Save collection filters" },
          { ...current, id: 9, kind: "improvement", status: "in_progress", summary: "Improve mobile effects" },
          { ...current, id: 10, kind: "improvement", status: "resolved", summary: "Completed layout fix" },
        ];
        body = {
          items: status
            ? variants.filter((item) => item.status === status && (!kind || item.kind === kind))
            : [current],
          nextOffset: null,
        };
      } else if (requestPath === "/feedback/topics" && method === "POST") {
        submissions.push(route.request().postDataJSON());
        if (failPublication) {
          await route.fulfill({ status: 503, json: { error: "reports_unavailable" } });
          return;
        }
        body = { id: 7 };
      } else if (requestPath === "/feedback/topics/7") body = current;
      else if (requestPath === "/feedback/topics/7/member") {
        Object.assign(current, route.request().postDataJSON());
        current.supportCount = current.supported ? 13 : 12;
        body = { ok: true };
      } else if (requestPath === "/feedback/topics/7/comments") {
        const draft = route.request().postDataJSON() as { body: string };
        current.comments.push({
          id: 2,
          authorName: "Kai",
          official: false,
          body: draft.body,
          createdAt: Date.now(),
          images: [],
          hidden: false,
        });
        body = current.comments.at(-1);
      } else if (requestPath === "/feedback/images" && method === "POST") {
        body = { id: "e42249e5-ba6e-4528-b517-63bee8fbbb0f", name: "board.png", width: 1, height: 1 };
      } else if (requestPath.startsWith("/feedback/images/")) {
        await route.fulfill({
          contentType: "image/png",
          body: Buffer.from(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==",
            "base64",
          ),
        });
        return;
      }
      await route.fulfill({ json: body });
    });
    await this.page.goto(path);
    return submissions;
  }
  async openTopic() {
    await this.page.getByRole("link", { name: /Effect timing after digivolution/ }).click();
    await expect(this.page.getByRole("heading", { name: topic.summary, exact: true })).toBeVisible();
  }
  async fillReport() {
    await this.page.getByLabel("Title", { exact: true }).fill("A detailed effect timing report");
    await this.page
      .getByLabel("Your report", { exact: true })
      .fill(
        "## What happened\n\nThe effect did not activate.\n\n## What I expected\n\nThe card effect should resolve.",
      );
  }
}

for (const width of [320, 768, 1440]) {
  for (const dark of [false, true]) {
    test(`public forum and discussion fit ${width}px in ${dark ? "dark" : "light"} mode`, async ({ page }, info) => {
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.setViewportSize({ width, height: 900 });
      const forum = new PublicForumPage(page);
      await forum.open();
      await page.evaluate((darkMode) => document.documentElement.classList.toggle("dark", darkMode), dark);
      await expect(page.getByRole("heading", { name: "Community hub", exact: true })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
      await page.screenshot({ path: info.outputPath("forum.png"), fullPage: true });
      await forum.openTopic();
      await expect(page.getByText("Official response", { exact: true })).toBeVisible();
      await expect(page.getByText("Sign in to participate", { exact: true })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
      await page.screenshot({ path: info.outputPath("discussion.png"), fullPage: true });
      expect(errors).toEqual([]);
    });
  }
}

test.describe("public forum participation", () => {
  test("signed-in players publish text, support, follow and reply to public topics", async ({ page }) => {
    const forum = new PublicForumPage(page);
    const submissions = await forum.open({ signedIn: true });
    await page.getByRole("button", { name: "New topic", exact: true }).click();
    await expect(page).toHaveURL(/\/feedback\/new$/);
    await forum.fillReport();
    await page.getByRole("button", { name: "Preview", exact: true }).click();
    await expect(
      page.getByRole("region", { name: "Preview" }).getByRole("heading", { name: "What happened" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Write", exact: true }).click();
    await expect(page.locator('input[type="file"]')).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Add images" })).toHaveCount(0);
    await page.getByRole("button", { name: "Publish topic", exact: true }).click();
    await expect(page).toHaveURL(/\/feedback\/7$/);
    expect(submissions).toHaveLength(1);
    expect(submissions[0]!.imageIds).toEqual([]);
    await page.getByRole("button", { name: "Also happens to me · 12" }).click();
    await expect(page.getByRole("button", { name: "Also happens to me · 13" })).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: "Follow", exact: true }).click();
    await expect(page.getByRole("button", { name: "Following", exact: true })).toHaveAttribute("aria-pressed", "true");
    await page.getByLabel("Add details").fill("I reproduced this issue with another card.");
    await page.getByRole("button", { name: "Reply", exact: true }).click();
    await expect(page.getByText("I reproduced this issue with another card.", { exact: true })).toBeVisible();
  });
});

test("composer preserves drafts on navigation and failed publication", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  const forum = new PublicForumPage(page);
  await forum.open({ signedIn: true, path: "/feedback/new", failPublication: true });
  await forum.fillReport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  await page.getByRole("button", { name: "Publish topic", exact: true }).click();
  await expect(page.getByText("Could not save. Your text is still here; try again.")).toBeVisible();
  await expect(page.getByLabel("Title", { exact: true })).toHaveValue("A detailed effect timing report");
  await page.reload();
  await expect(page.getByLabel("Title", { exact: true })).toHaveValue("A detailed effect timing report");
});

for (const width of [320, 1440]) {
  for (const dark of [false, true]) {
    test(`roadmap shows pending improvements without releases at ${width}px in ${dark ? "dark" : "light"} mode`, async ({
      page,
    }, info) => {
      await page.setViewportSize({ width, height: 900 });
      const forum = new PublicForumPage(page);
      await forum.open();
      await page.getByRole("button", { name: "Roadmap", exact: true }).click();
      await page.evaluate((darkMode) => document.documentElement.classList.toggle("dark", darkMode), dark);
      await expect(page).toHaveURL(/\/feedback\/roadmap$/);
      await expect(page.getByRole("heading", { name: "Community roadmap", exact: true })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Ranked / Leaderboard", exact: true })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Planned", exact: true })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Friends and match invitations", exact: true })).toBeVisible();
      await expect(page.getByRole("link", { name: /Save collection filters/ })).toBeVisible();
      await expect(page.getByRole("link", { name: /Improve mobile effects/ })).toBeVisible();
      await expect(page.getByRole("link", { name: /Completed layout fix/ })).toHaveCount(0);
      await expect(page.getByRole("link", { name: /Effect timing after digivolution/ })).toHaveCount(0);
      await expect(page.getByRole("heading", { name: "Already available in Aegis" })).toHaveCount(0);
      await expect(page.getByRole("button", { name: /What's new|All release notes/ })).toHaveCount(0);
      await expect(page.getByRole("link", { name: /Discord suggestion 1: Ranked/ })).toHaveAttribute(
        "href",
        "https://discord.com/channels/1525646227608178798/1556079380667830374",
      );
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
      await page.screenshot({ path: info.outputPath("roadmap.png"), fullPage: true });
    });
  }
}

test("long discussions keep loaded pages and display new replies immediately", async ({ page }) => {
  const forum = new PublicForumPage(page);
  await forum.open({ signedIn: true });
  const comments = Array.from({ length: 21 }, (_, index) => ({
    id: index + 1,
    authorName: "Player",
    official: false,
    body: `Chronological reply ${index + 1}`,
    createdAt: topic.createdAt,
    images: [],
    hidden: false,
  }));
  const detail = { ...structuredClone(topic), comments: comments.slice(0, 20), nextAfter: 20, commentCount: 21 };
  await page.route("**/feedback/topics/7", (route) => route.fulfill({ json: detail }));
  await page.route("**/feedback/topics/7/comments*", async (route) => {
    if (route.request().method() === "POST") {
      const body = route.request().postDataJSON().body as string;
      const comment = { ...comments[0]!, id: 22, body };
      comments.push(comment);
      await route.fulfill({ json: comment });
    } else await route.fulfill({ json: { items: comments.slice(20), nextAfter: null } });
  });
  await page.route("**/feedback/topics/7/member", async (route) => {
    Object.assign(detail, route.request().postDataJSON());
    await route.fulfill({ json: { ok: true } });
  });
  await forum.openTopic();
  await page.getByLabel("Add details").fill("New reply beyond the first page");
  await page.getByRole("button", { name: "Reply", exact: true }).click();
  await expect(page.getByText("New reply beyond the first page", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "More replies", exact: true }).click();
  await expect(page.getByText("Chronological reply 21", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Also happens to me · 12" }).click();
  await expect(page.getByRole("button", { name: "Also happens to me · 12" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("Chronological reply 21", { exact: true })).toBeVisible();
});

test("moderation reconciles replies published beyond loaded pages", async ({ page }) => {
  const forum = new PublicForumPage(page);
  await forum.open({ signedIn: true, isAdmin: true });
  await expect(page.getByRole("button", { name: "Team triage", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Previous private reports", exact: true })).toHaveCount(0);
  const firstPage = Array.from({ length: 20 }, (_, index) => ({
    id: index + 1,
    authorName: "Player",
    official: false,
    body: `Earlier reply ${index + 1}`,
    createdAt: topic.createdAt,
    images: [],
    hidden: false,
  }));
  const posted = {
    id: 30,
    authorName: "Team",
    official: true,
    body: "Newest official reply",
    createdAt: topic.createdAt,
    images: [],
    hidden: false,
  };
  await page.route("**/feedback/topics/7", (route) =>
    route.fulfill({ json: { ...topic, comments: firstPage, nextAfter: 20 } }),
  );
  await page.route("**/feedback/topics/7/flags", (route) => route.fulfill({ json: [] }));
  await page.route("**/feedback/topics/7/comments", (route) => route.fulfill({ json: posted }));
  await page.route("**/feedback/topics/7/moderation", async (route) => {
    posted.hidden = route.request().postDataJSON().hidden as boolean;
    await route.fulfill({ json: { ok: true } });
  });
  await forum.openTopic();
  await page.getByLabel("Add details").fill(posted.body);
  await page.getByRole("button", { name: "Reply", exact: true }).click();
  const reply = page.getByRole("article").filter({ hasText: "Newest official reply" });
  await reply.getByRole("button", { name: "Hide content" }).click();
  await expect(reply.getByText("Hidden", { exact: true })).toBeVisible();
  await expect(reply.getByRole("button", { name: "Restore content" })).toBeVisible();
});

for (const width of [320, 1440]) {
  test(`ordinary scrolling reaches the publication controls at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await new PublicForumPage(page).open({ signedIn: true, path: "/feedback/new" });
    const editor = page.getByRole("region", { name: "Tell us what happened", exact: true });
    const bounds = await editor.evaluate((element) => ({
      overflow: getComputedStyle(element).overflowY,
      height: element.clientHeight,
      content: element.scrollHeight,
    }));
    expect(bounds.overflow).toBe("auto");
    expect(bounds.content).toBeGreaterThan(bounds.height);
    await editor.hover();
    await page.mouse.wheel(0, 3000);
    await expect.poll(() => editor.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
    const publish = page.getByRole("button", { name: "Publish topic", exact: true });
    await expect(publish).toBeInViewport();
    const button = await publish.boundingBox();
    expect(button!.y + button!.height).toBeLessThanOrEqual(width < 960 ? 832 : 900);
  });
}

for (const { width, dark } of [
  { width: 320, dark: false },
  { width: 320, dark: true },
  { width: 1440, dark: false },
  { width: 1440, dark: true },
]) {
  test(`community decks share navigation with discussions and roadmap at ${width}px in ${dark ? "dark" : "light"} mode`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 900 });
    const forum = new PublicForumPage(page);
    await forum.open({ signedIn: true });
    await page.evaluate((darkMode) => document.documentElement.classList.toggle("dark", darkMode), dark);
    const hub = page.getByRole("navigation", { name: "Community hub", exact: true });
    await expect(hub.getByRole("button").first()).toHaveText("Community decks");
    const discussionHeader = await page.locator(".forum-page-heading").boundingBox();
    await hub.getByRole("button", { name: "Community decks", exact: true }).click();
    await expect(page).toHaveURL(/\/community$/);
    await expect(page.getByRole("heading", { name: "Community hub", exact: true })).toBeVisible();
    const deckHeader = await page.locator(".forum-page-heading").boundingBox();
    expect(deckHeader?.x).toBe(discussionHeader?.x);
    expect(deckHeader?.width).toBe(discussionHeader?.width);
    await page.screenshot({ path: info.outputPath("community-decks-aligned.png"), fullPage: true });
    await expect(hub.getByRole("button", { name: "Community decks", exact: true })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(page.getByRole("searchbox", { name: "Search decks or players" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    await hub.getByRole("button", { name: "Roadmap", exact: true }).click();
    await expect(page).toHaveURL(/\/feedback\/roadmap$/);
    await expect(page.getByRole("heading", { name: "Ranked / Leaderboard", exact: true })).toBeVisible();
    await hub.getByRole("button", { name: "Discussions", exact: true }).click();
    await expect(page).toHaveURL(/\/feedback$/);
    await page.getByRole("button", { name: "New topic", exact: true }).click();
    await expect(page.locator('input[type="file"]')).toHaveCount(0);
  });
}

for (const { width, dark } of [
  { width: 320, dark: false },
  { width: 320, dark: true },
  { width: 1440, dark: false },
  { width: 1440, dark: true },
]) {
  test(`card suggestions form an aligned selectable list at ${width}px in ${dark ? "dark" : "light"} mode`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 1000 });
    const forum = new PublicForumPage(page);
    await forum.open({ signedIn: true, path: "/feedback/new" });
    await expect(page.getByText("Cards and match context (optional)", { exact: true })).toBeVisible();
    await page.evaluate((darkMode) => document.documentElement.classList.toggle("dark", darkMode), dark);
    await page.getByText("Cards and match context (optional)", { exact: true }).click();
    const input = page.getByRole("textbox", { name: "Cards involved", exact: true });
    await input.fill("agu");
    const list = page.getByRole("listbox", { name: "Cards involved", exact: true });
    const option = page.getByRole("option", { name: /Agumon.*BT1-010/ });
    await expect(list).toBeVisible();
    const inputBox = await input.boundingBox();
    const listBox = await list.boundingBox();
    expect(listBox!.width).toBeCloseTo(inputBox!.width, 0);
    expect(await option.evaluate((element) => getComputedStyle(element).display)).toBe("flex");
    const nameBox = await option.locator("strong").boundingBox();
    const codeBox = await option.locator("span").boundingBox();
    expect(codeBox!.x - nameBox!.x - nameBox!.width).toBeGreaterThanOrEqual(7);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: info.outputPath("card-suggestions.png"), fullPage: true });
    await option.click();
    await expect(page.getByRole("button", { name: "Remove BT1-010", exact: true })).toBeVisible();
    await expect(list).toHaveCount(0);
    await page.getByRole("button", { name: "Remove BT1-010", exact: true }).click();
    await input.fill("BT1-011");
    await input.press("Enter");
    await expect(page.getByRole("button", { name: "Remove BT1-011", exact: true })).toBeVisible();
    await expect(page).toHaveURL(/\/feedback\/new$/);
  });
}
