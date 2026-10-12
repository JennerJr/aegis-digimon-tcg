import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import { Pool } from "pg";
import express from "express";
import sharp from "sharp";
import { beforeAll, afterAll, beforeEach, afterEach, describe, expect, it } from "vitest";
import { AccountStore, type AuthSession } from "#api/accounts/AccountStore";
import { FeedbackStore } from "#api/bugs/FeedbackStore";
import { ForumStore } from "#api/bugs/ForumStore";
import { installBugReportRoutes } from "#api/bugs/routes";
import { NotificationStore } from "#api/notifications/NotificationStore";
import { FeedbackStatus } from "@aegis/shared/feedback/FeedbackStatus";
import type { ForumPage, ForumTopicDetail, FeedbackImage } from "@aegis/shared/feedback/forumTypes";
import type { CommunityRoadmap } from "@aegis/shared/feedback/roadmapTypes";
import { RoadmapStage } from "@aegis/shared/feedback/RoadmapStage";

const enabled = process.env.POSTGRES_TESTS === "1";
const connection = process.env.POSTGRES_TEST_URL;
if (enabled && !connection) throw new Error("Forum tests require POSTGRES_TEST_URL for a scratch database");
const schema = `forum_test_${randomUUID().replaceAll("-", "")}`;

describe.skipIf(!enabled)("public forum persistence and access", () => {
  let adminPool: Pool;
  let accounts: AccountStore;
  let feedback: FeedbackStore;
  let forum: ForumStore;
  let pool: Pool;
  let reporter: AuthSession;
  let other: AuthSession;
  let admin: AuthSession;
  let url: string;
  let server: ReturnType<express.Express["listen"]>;
  beforeAll(async () => {
    adminPool = new Pool({ connectionString: connection });
    await adminPool.query(`CREATE SCHEMA ${schema}`);
    pool = new Pool({ connectionString: connection, options: `-c search_path=${schema}`, max: 8 });
    accounts = new AccountStore(pool);
    feedback = new FeedbackStore(accounts);
    forum = new ForumStore(accounts);
    reporter = await identity("reporter", "Kai");
    other = await identity("other", "Mika");
    admin = await identity("admin", "Team");
    await pool.query("UPDATE accounts SET is_admin=true WHERE id=$1", [admin.account.id]);
    admin.account.isAdmin = true;
  });
  beforeEach(async () => {
    await pool.query("TRUNCATE feedback_reports, notifications RESTART IDENTITY CASCADE");
    const app = express();
    app.use(express.json());
    const sessions: Record<string, AuthSession> = { reporter, other, admin };
    installBugReportRoutes({ app, store: feedback, forum, session: async (req) => sessions[req.headers.cookie ?? ""] });
    server = app.listen(0);
    await new Promise((resolve) => server.once("listening", resolve));
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterEach(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
      server.closeAllConnections();
    });
  });
  afterAll(async () => {
    if (accounts) await accounts.close();
    if (adminPool) {
      await adminPool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      await adminPool.end();
    }
  });
  async function identity(subject: string, name: string): Promise<AuthSession> {
    const account = await accounts.accountForIdentity("discord", subject, name);
    const session = await accounts.issueSession(account);
    return { ...session, account };
  }
  function call(method: string, path: string, cookie?: string, body?: unknown) {
    return fetch(url + path, {
      method,
      headers: { ...(cookie ? { Cookie: cookie } : {}), ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
  }
  async function topic(extra: Record<string, unknown> = {}) {
    const response = await call("POST", "/feedback/topics", "reporter", {
      summary: "Effect timing",
      description: "Details\n".repeat(700),
      kind: "bug",
      cardIds: [],
      ...extra,
    });
    expect(response.status).toBe(201);
    return ((await response.json()) as { id: number }).id;
  }
  async function detail(id: number, cookie?: string): Promise<ForumTopicDetail> {
    const response = await call("GET", `/feedback/topics/${id}`, cookie);
    expect(response.status).toBe(200);
    return response.json() as Promise<ForumTopicDetail>;
  }
  async function upload(cookie = "reporter"): Promise<FeedbackImage> {
    const bytes = await sharp({ create: { width: 10, height: 10, channels: 3, background: "#ff00ff" } })
      .png()
      .toBuffer();
    const response = await fetch(url + "/feedback/images?name=board.png", {
      method: "POST",
      headers: { Cookie: cookie, "Content-Type": "image/png" },
      body: bytes,
    });
    expect(response.status).toBe(201);
    return response.json() as Promise<FeedbackImage>;
  }
  it("publishes pending roadmap summaries without exposing private report records", async () => {
    const privateTitle = "Confidential roadmap request";
    await call("POST", "/bug-reports", "reporter", {
      summary: privateTitle,
      description: "Private account details",
      kind: "improvement",
    });
    const response = await call("GET", "/feedback/roadmap");
    expect(response.status).toBe(200);
    const roadmap = (await response.json()) as CommunityRoadmap;
    expect(roadmap.items.find((entry) => entry.id === "ranked-leaderboard")?.stage).toBe(RoadmapStage.PLANNED.value);
    expect(roadmap.items.some((entry) => entry.id === "friends" && entry.websiteRequests > 0)).toBe(true);
    expect(new Set(roadmap.items.map((entry) => entry.id)).size).toBe(roadmap.items.length);
    for (const entry of roadmap.items) {
      expect(Object.keys(entry).sort()).toEqual([
        "description",
        "discordUrls",
        "id",
        "stage",
        "title",
        "websiteRequests",
      ]);
      expect(Object.values(RoadmapStage).map((stage) => stage.value)).toContain(entry.stage);
      for (const sourceUrl of entry.discordUrls)
        expect(sourceUrl).toMatch(/^https:\/\/discord\.com\/channels\/\d+\/\d+$/);
      expect(Object.values(entry.title).every(Boolean)).toBe(true);
      expect(Object.values(entry.description).every(Boolean)).toBe(true);
    }
    expect(JSON.stringify(roadmap)).not.toContain(privateTitle);
    expect(JSON.stringify(roadmap)).not.toContain("Private account details");
    expect(roadmap.items.map((entry) => entry.id)).not.toContain("replay-playback");
  });
  it("keeps legacy reports private and projects only public-safe fields", async () => {
    const legacy = await call("POST", "/bug-reports", "reporter", {
      summary: "Private",
      description: "Old report",
      userAgent: "private browser",
    });
    expect(legacy.status).toBe(201);
    const id = await topic({
      userAgent: "private-browser",
      matchId: "d42249e5-ba6e-4528-b517-63bee8fbbb0f",
      opponentDeck: "hidden deck",
    });
    await pool.query("UPDATE feedback_reports SET internal_note='secret-note' WHERE id=$1", [id]);
    const page = (await (await call("GET", "/feedback/topics")).json()) as ForumPage;
    expect(page.items.map((item) => item.id)).toEqual([id]);
    const publicDetail = await detail(id);
    expect(publicDetail.description.length).toBeGreaterThan(4000);
    expect(JSON.stringify(publicDetail)).not.toMatch(
      /secret-note|private-browser|hidden deck|matchId|reporter_account_id/,
    );
    expect((await call("GET", "/feedback/topics/1")).status).toBe(404);
  });
  it("requires authentication and refuses forged official replies and unsupported filters", async () => {
    const id = await topic();
    expect((await call("POST", "/feedback/topics", undefined, { summary: "x", description: "x" })).status).toBe(401);
    expect((await call("POST", `/feedback/topics/${id}/comments`, undefined, { body: "x" })).status).toBe(401);
    expect(
      (
        await call("POST", `/feedback/topics/${id}/comments`, "other", {
          body: "Same issue",
          official: true,
          authorName: "Fake team",
        })
      ).status,
    ).toBe(201);
    const result = await detail(id);
    expect(result.comments[0]).toMatchObject({ authorName: "Mika", official: false, body: "Same issue" });
    expect((await call("GET", "/feedback/topics?scope=mine")).status).toBe(401);
    expect((await call("GET", "/feedback/topics?sort=constructor")).status).toBe(400);
    expect((await call("GET", "/feedback/topics?kind=constructor")).status).toBe(400);
    expect(
      (await call("POST", "/feedback/topics", "reporter", { summary: "large", description: "x".repeat(20001) })).status,
    ).toBe(400);
  });
  it("stores sanitized images and binds attachments atomically to their owner", async () => {
    const image = await upload();
    expect((await call("GET", `/feedback/images/${image.id}`)).status).toBe(404);
    expect((await call("GET", `/feedback/images/${image.id}`, "reporter")).headers.get("content-type")).toContain(
      "image/webp",
    );
    const failed = await call("POST", "/feedback/topics", "other", {
      summary: "Stolen",
      description: "x",
      imageIds: [image.id],
    });
    expect(failed.status).toBe(400);
    expect((await pool.query("SELECT id FROM feedback_reports")).rows).toHaveLength(0);
    const id = await topic({ imageIds: [image.id] });
    expect((await detail(id)).images[0]!.id).toBe(image.id);
    const response = await call("GET", `/feedback/images/${image.id}`);
    expect(response.status).toBe(200);
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(
      (
        await call("POST", "/feedback/topics", "reporter", {
          summary: "Reused",
          description: "x",
          imageIds: [image.id],
        })
      ).status,
    ).toBe(400);
    expect((await pool.query("SELECT id FROM feedback_reports")).rows).toHaveLength(1);
    const invalid = await fetch(url + "/feedback/images", {
      method: "POST",
      headers: { Cookie: "reporter", "Content-Type": "image/png" },
      body: "<svg><script>bad()</script></svg>",
    });
    expect(invalid.status).toBe(400);
  });
  it("handles concurrent support idempotently and pages replies in chronological order", async () => {
    const id = await topic();
    await Promise.all(
      Array.from({ length: 6 }, () => forum.member({ id, accountId: other.account.id, supported: true })),
    );
    expect(await detail(id, "other")).toMatchObject({ supportCount: 1, supported: true });
    for (let n = 0; n < 23; n++)
      await forum.comment({
        id,
        accountId: other.account.id,
        authorName: "Mika",
        official: false,
        draft: { body: `Reply ${n}`, imageIds: [] },
      });
    const first = await detail(id);
    expect(first.commentCount).toBe(23);
    expect(first.comments).toHaveLength(20);
    const next = (await (await call("GET", `/feedback/topics/${id}/comments?after=${first.nextAfter}`)).json()) as {
      items: { body: string }[];
      nextAfter: number | null;
    };
    expect(next.items.map((item) => item.body)).toEqual(["Reply 20", "Reply 21", "Reply 22"]);
    expect(next.nextAfter).toBeNull();
  });
  it("notifies followers on public replies and triage updates, and respects unfollow", async () => {
    const id = await topic();
    await forum.member({ id, accountId: other.account.id, following: true });
    await forum.comment({
      id,
      accountId: admin.account.id,
      authorName: "Team",
      official: true,
      draft: { body: "Investigating", imageIds: [] },
    });
    const inbox = new NotificationStore(accounts);
    expect((await inbox.list(other.account.id)).items[0]!.payload.replyExcerpt).toBe("Investigating");
    await feedback.triage(id, admin.account.id, {
      revision: 0,
      status: FeedbackStatus.IN_PROGRESS.value,
      finalReply: "",
      internalNote: "secret",
      duplicateOfId: null,
    });
    expect((await inbox.list(other.account.id)).items[0]!.payload.status).toBe("in_progress");
    await forum.member({ id, accountId: other.account.id, following: false });
    const previous = (await inbox.list(other.account.id)).items[0]!.id;
    await forum.comment({
      id,
      accountId: admin.account.id,
      authorName: "Team",
      official: true,
      draft: { body: "Update", imageIds: [] },
    });
    expect((await inbox.list(other.account.id)).items[0]!.id).toBe(previous);
    const followed = (await (await call("GET", "/feedback/topics?scope=following", "other")).json()) as ForumPage;
    expect(followed.items).toEqual([]);
  });
  it("restricts moderation to admins and removes hidden topics, replies and images from public access", async () => {
    const image = await upload();
    const id = await topic({ imageIds: [image.id] });
    await call("POST", `/feedback/topics/${id}/comments`, "other", { body: "Reply" });
    const commentId = (await detail(id)).comments[0]!.id;
    expect((await call("PATCH", `/feedback/topics/${id}/moderation`, "other", { hidden: true })).status).toBe(403);
    expect((await call("POST", `/feedback/topics/${id}/flags`, "other", { reason: "spam", commentId })).status).toBe(
      201,
    );
    expect((await call("GET", `/feedback/topics/${id}/flags`, "other")).status).toBe(403);
    expect((await call("GET", `/feedback/topics/${id}/flags`, "admin")).status).toBe(200);
    await call("PATCH", `/feedback/topics/${id}/moderation`, "admin", { hidden: true, commentId });
    expect((await detail(id)).comments).toHaveLength(0);
    expect((await detail(id, "admin")).comments[0]!.hidden).toBe(true);
    await call("PATCH", `/feedback/topics/${id}/moderation`, "admin", { hidden: true });
    expect((await call("GET", `/feedback/topics/${id}`)).status).toBe(404);
    expect((await call("GET", `/feedback/images/${image.id}`)).status).toBe(404);
    expect((await call("POST", `/feedback/topics/${id}/comments`, "other", { body: "Hidden reply" })).status).toBe(404);
    expect((await detail(id, "admin")).hidden).toBe(true);
  });
  it("filters public content and never exposes private duplicate targets", async () => {
    const id = await topic();
    const privateId = await feedback.save(
      { kind: "bug", summary: "private", description: "private", cardIds: [] },
      reporter.account.id,
      false,
    );
    await feedback.triage(id, admin.account.id, {
      revision: 0,
      status: FeedbackStatus.DUPLICATE.value,
      finalReply: "Duplicate",
      internalNote: "",
      duplicateOfId: privateId,
    });
    expect((await detail(id)).duplicateOfId).toBeNull();
    expect(
      ((await (await call("GET", "/feedback/topics?q=Effect&kind=bug&status=duplicate")).json()) as ForumPage).items,
    ).toHaveLength(1);
    expect(((await (await call("GET", "/feedback/topics?q=%25")).json()) as ForumPage).items).toHaveLength(0);
  });
  it("keeps open triage drafts private and treats them as unanswered", async () => {
    const id = await topic();
    await forum.member({ id, accountId: other.account.id, following: true });
    await feedback.triage(id, admin.account.id, {
      revision: 0,
      status: FeedbackStatus.TRIAGED.value,
      finalReply: "Unpublished draft",
      internalNote: "secret",
      duplicateOfId: null,
    });
    expect((await detail(id)).finalReply).toBeNull();
    const inbox = await new NotificationStore(accounts).list(other.account.id);
    expect(inbox.items[0]!.payload.replyExcerpt).toBeNull();
    const unanswered = (await (await call("GET", "/feedback/topics?sort=unanswered")).json()) as ForumPage;
    expect(unanswered.items.map((item) => item.id)).toEqual([id]);
    const before = (await detail(id)).updatedAt;
    await feedback.triage(id, admin.account.id, {
      revision: 1,
      status: FeedbackStatus.TRIAGED.value,
      finalReply: "Another unpublished draft",
      internalNote: "",
      duplicateOfId: null,
    });
    expect((await detail(id)).updatedAt).toBe(before);
    expect((await new NotificationStore(accounts).list(other.account.id)).items[0]!.id).toBe(inbox.items[0]!.id);
  });
  it("respects the public author's unfollow and announces reopening to remaining followers", async () => {
    const id = await topic();
    await forum.member({ id, accountId: reporter.account.id, following: false });
    await forum.member({ id, accountId: other.account.id, following: true });
    await feedback.triage(id, admin.account.id, {
      revision: 0,
      status: FeedbackStatus.RESOLVED.value,
      finalReply: "Fixed",
      internalNote: "",
      duplicateOfId: null,
    });
    const inbox = new NotificationStore(accounts);
    expect((await inbox.list(reporter.account.id)).items).toHaveLength(0);
    const closed = await detail(id);
    await feedback.reopen(reporter.account.id, id, "The issue persists", closed.updatedAt + 1000);
    expect((await detail(id)).updatedAt).toBe(closed.updatedAt + 1000);
    expect((await inbox.list(other.account.id)).items[0]!.payload).toMatchObject({
      status: "triaged",
      replyExcerpt: "The issue persists",
    });
  });
  it("does not multiply members and replies when aggregating a populated topic", async () => {
    const id = await topic();
    await pool.query(
      "INSERT INTO feedback_comments (feedback_id, author_name, body, created_at) SELECT $1, 'Player', 'Reply', 1 FROM generate_series(1,1000)",
      [id],
    );
    await pool.query("ANALYZE feedback_comments");
    const result = await detail(id);
    expect(result.commentCount).toBe(1000);
    const plan = await pool.query(
      "EXPLAIN (ANALYZE, FORMAT JSON) SELECT f.id, (SELECT count(*) FROM feedback_members m WHERE m.feedback_id=f.id AND m.supported=true), (SELECT count(*) FROM feedback_comments c WHERE c.feedback_id=f.id AND c.hidden=false) FROM feedback_reports f WHERE f.id=$1",
      [id],
    );
    expect(plan.rows[0]["QUERY PLAN"][0].Plan["Actual Rows"]).toBe(1);
    expect(plan.rows[0]["QUERY PLAN"][0]["Execution Time"]).toBeLessThan(1000);
  });
});
