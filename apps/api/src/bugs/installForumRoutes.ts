import express, { type Express, type Request, type Response, type NextFunction } from "express";
import sharp from "sharp";
import type { AuthSession } from "#api/accounts/AccountStore";
import type { FeedbackStore } from "#api/bugs/FeedbackStore";
import { ForumStore } from "#api/bugs/ForumStore";
import { ForumWriteError } from "#api/bugs/ForumWriteError";
import { communityRoadmap } from "#api/bugs/communityRoadmap";
import { validate } from "#api/bugs/routes";
import { captureReportReplay, type ReplayCapturer } from "#api/bugs/replayCapture";
import { parseId } from "#api/http/parseId";
import { tokenBucketLimiter } from "#api/http/rateLimit";
import { FEEDBACK_KINDS, type FeedbackKind } from "@aegis/shared/feedback/FeedbackKind";
import { FORUM_SORTS, ForumSort } from "@aegis/shared/feedback/ForumSort";
import { FORUM_SCOPES, ForumScope } from "@aegis/shared/feedback/ForumScope";
import { isFeedbackStatus } from "@aegis/shared/feedback/isFeedbackStatus";
import { MAX_FEEDBACK_SEARCH } from "@aegis/shared/feedback/limits";
import {
  MAX_FORUM_BODY,
  MAX_FORUM_IMAGES,
  MAX_FORUM_IMAGE_BYTES,
  MAX_FORUM_IMAGE_PIXELS,
  MAX_FORUM_FLAG_REASON,
} from "@aegis/shared/feedback/forumLimits";
import type { ForumFilter } from "@aegis/shared/feedback/forumTypes";

type Deps = {
  app: Express;
  forum: ForumStore;
  feedback: FeedbackStore;
  session: (req: Request) => Promise<AuthSession | undefined>;
  replayCapture?: ReplayCapturer;
};
type Handler = (req: Request, res: Response, auth?: AuthSession) => Promise<void>;
const IMAGE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function installForumRoutes({ app, forum, feedback, session, replayCapture }: Deps): void {
  app.get("/feedback/roadmap", (_req, res) => {
    res.set("Cache-Control", "no-store").json(communityRoadmap);
  });
  const writes = tokenBucketLimiter({ capacity: 10, refillMs: 60_000 });
  const uploads = tokenBucketLimiter({ capacity: 5, refillMs: 30_000 });
  const route =
    (handler: Handler, signed = false, admin = false) =>
    (req: Request, res: Response, next: NextFunction) => {
      res.set("Cache-Control", "no-store");
      void (async () => {
        const auth = await session(req);
        if (signed && !auth) {
          res.status(401).json({ error: "authentication_required" });
          return;
        }
        if (admin && !auth?.account.isAdmin) {
          res.status(403).json({ error: "admin_required" });
          return;
        }
        if (req.method !== "GET" && auth && !writes(auth.account.id)) {
          res.status(429).json({ error: "too_many_requests" });
          return;
        }
        await handler(req, res, auth);
      })().catch((error: unknown) => {
        if (error instanceof ForumWriteError)
          res
            .status(error.message === "not_found" ? 404 : error.message === "image_quota" ? 429 : 400)
            .json({ error: error.message });
        else next(error);
      });
    };

  app.get(
    "/feedback/topics",
    route(async (req, res, auth) => {
      const filter = parseFilter(req.query);
      if (!filter) {
        res.status(400).json({ error: "invalid_filter" });
        return;
      }
      if (filter.scope !== ForumScope.ALL.value && !auth) {
        res.status(401).json({ error: "authentication_required" });
        return;
      }
      res.json(
        await forum.list({
          filter,
          accountId: auth?.account.id,
          includeHidden: auth?.account.isAdmin === true && req.query.hidden === "1",
        }),
      );
    }),
  );
  app.post(
    "/feedback/topics",
    route(async (req, res, auth) => {
      const report = validate(req.body, auth!.account.displayName);
      const imageIds = images(req.body?.imageIds);
      if ("error" in report || !imageIds) {
        res.status(400).json({ error: "error" in report ? report.error : "invalid_images" });
        return;
      }
      const id = await forum.create({ report, accountId: auth!.account.id, imageIds });
      if (report.matchId && replayCapture) await captureReportReplay(feedback, replayCapture, id, report.matchId);
      res.status(201).json({ id });
    }, true),
  );
  app.get(
    "/feedback/topics/:id",
    route(async (req, res, auth) => {
      const id = parseId(req.params.id);
      const detail =
        id === undefined
          ? undefined
          : await forum.detail({ id, accountId: auth?.account.id, includeHidden: auth?.account.isAdmin === true });
      if (!detail) {
        res.status(404).json({ error: "not_found" });
        return;
      }
      res.json(detail);
    }),
  );
  app.get(
    "/feedback/topics/:id/comments",
    route(async (req, res, auth) => {
      const id = parseId(req.params.id);
      const after = req.query.after === undefined ? 0 : parseId(req.query.after);
      if (id === undefined || after === undefined) {
        res.status(400).json({ error: "invalid_cursor" });
        return;
      }
      if (!(await forum.detail({ id, includeHidden: auth?.account.isAdmin === true }))) {
        res.status(404).json({ error: "not_found" });
        return;
      }
      res.json(await forum.comments({ id, after, includeHidden: auth?.account.isAdmin === true }));
    }),
  );
  app.post(
    "/feedback/topics/:id/comments",
    route(async (req, res, auth) => {
      const id = parseId(req.params.id);
      const body = typeof req.body?.body === "string" ? req.body.body.trim() : "";
      const imageIds = images(req.body?.imageIds);
      if (id === undefined || !body || body.length > MAX_FORUM_BODY || !imageIds) {
        res.status(400).json({ error: "invalid_comment" });
        return;
      }
      const comment = await forum.comment({
        id,
        accountId: auth!.account.id,
        authorName: auth!.account.displayName,
        official: auth!.account.isAdmin,
        draft: { body, imageIds },
      });
      res.status(201).json(comment);
    }, true),
  );
  app.put(
    "/feedback/topics/:id/member",
    route(async (req, res, auth) => {
      const id = parseId(req.params.id);
      const { supported, following } = req.body ?? {};
      if (
        id === undefined ||
        (supported === undefined && following === undefined) ||
        (supported !== undefined && typeof supported !== "boolean") ||
        (following !== undefined && typeof following !== "boolean")
      ) {
        res.status(400).json({ error: "invalid_member" });
        return;
      }
      await forum.member({ id, accountId: auth!.account.id, supported, following });
      res.json({ ok: true });
    }, true),
  );
  app.post(
    "/feedback/topics/:id/flags",
    route(async (req, res, auth) => {
      const id = parseId(req.params.id);
      const commentId = req.body?.commentId == null ? null : parseId(req.body.commentId);
      const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
      if (id === undefined || commentId === undefined || !reason || reason.length > MAX_FORUM_FLAG_REASON) {
        res.status(400).json({ error: "invalid_flag" });
        return;
      }
      await forum.flag({ id, commentId, accountId: auth!.account.id, reason });
      res.status(201).json({ ok: true });
    }, true),
  );
  app.get(
    "/feedback/topics/:id/flags",
    route(
      async (req, res) => {
        const id = parseId(req.params.id);
        if (id === undefined) {
          res.status(404).json({ error: "not_found" });
          return;
        }
        res.json(await forum.flags(id));
      },
      true,
      true,
    ),
  );
  app.patch(
    "/feedback/topics/:id/moderation",
    route(
      async (req, res) => {
        const id = parseId(req.params.id);
        const commentId = req.body?.commentId == null ? null : parseId(req.body.commentId);
        if (id === undefined || commentId === undefined || typeof req.body?.hidden !== "boolean") {
          res.status(400).json({ error: "invalid_moderation" });
          return;
        }
        await forum.moderate({ id, commentId, hidden: req.body.hidden });
        res.json({ ok: true });
      },
      true,
      true,
    ),
  );

  app.post(
    "/feedback/images",
    (req, res, next) => {
      void session(req)
        .then((auth) => {
          if (!auth) {
            res.status(401).json({ error: "authentication_required" });
            return;
          }
          if (!uploads(auth.account.id)) {
            res.status(429).json({ error: "too_many_requests" });
            return;
          }
          res.locals.forumAuth = auth;
          next();
        })
        .catch(next);
    },
    express.raw({ type: ["image/png", "image/jpeg", "image/webp"], limit: MAX_FORUM_IMAGE_BYTES }),
    (req, res, next) => {
      void (async () => {
        if (!Buffer.isBuffer(req.body) || !req.body.length) {
          res.status(400).json({ error: "invalid_image" });
          return;
        }
        let converted;
        try {
          const pipeline = sharp(req.body, { limitInputPixels: MAX_FORUM_IMAGE_PIXELS });
          const metadata = await pipeline.metadata();
          if (!["png", "jpeg", "webp"].includes(metadata.format ?? "") || (metadata.pages ?? 1) > 1)
            throw new Error("invalid_image");
          converted = await pipeline
            .rotate()
            .resize({ width: 2048, height: 2048, fit: "inside", withoutEnlargement: true })
            .webp({ quality: 85 })
            .timeout({ seconds: 10 })
            .toBuffer({ resolveWithObject: true });
        } catch {
          res.status(400).json({ error: "invalid_image" });
          return;
        }
        const auth = res.locals.forumAuth as AuthSession;
        const name = typeof req.query.name === "string" ? req.query.name.slice(0, 120) : "image";
        res.status(201).json(
          await forum.upload({
            accountId: auth.account.id,
            name,
            width: converted.info.width,
            height: converted.info.height,
            bytes: converted.data,
          }),
        );
      })().catch((error: unknown) => {
        if (error instanceof ForumWriteError) res.status(429).json({ error: error.message });
        else next(error);
      });
    },
  );
  app.get(
    "/feedback/images/:id",
    route(async (req, res, auth) => {
      const id = req.params.id;
      const bytes =
        typeof id === "string" && IMAGE_ID.test(id)
          ? await forum.image({ id, accountId: auth?.account.id, isAdmin: auth?.account.isAdmin === true })
          : undefined;
      if (!bytes) {
        res.status(404).json({ error: "not_found" });
        return;
      }
      res.set("X-Content-Type-Options", "nosniff").type("image/webp").send(bytes);
    }),
  );
}

function images(value: unknown): string[] | undefined {
  if (value === undefined) return [];
  return Array.isArray(value) &&
    value.length <= MAX_FORUM_IMAGES &&
    value.every((id) => typeof id === "string" && IMAGE_ID.test(id)) &&
    new Set(value).size === value.length
    ? value
    : undefined;
}

function parseFilter(query: Request["query"]): ForumFilter | undefined {
  const sort = query.sort ?? ForumSort.RECENT.value;
  const scope = query.scope ?? ForumScope.ALL.value;
  const offset = query.offset === undefined ? 0 : Number(query.offset);
  if (
    !FORUM_SORTS.includes(sort as ForumSort) ||
    !FORUM_SCOPES.includes(scope as ForumScope) ||
    !Number.isInteger(offset) ||
    offset < 0 ||
    offset > 10_000
  )
    return undefined;
  if (query.kind !== undefined && !FEEDBACK_KINDS.includes(query.kind as FeedbackKind)) return undefined;
  if (query.status !== undefined && !isFeedbackStatus(query.status)) return undefined;
  if (query.q !== undefined && (typeof query.q !== "string" || query.q.length > MAX_FEEDBACK_SEARCH)) return undefined;
  return {
    sort: sort as ForumSort,
    scope: scope as ForumScope,
    offset,
    kind: query.kind as FeedbackKind | undefined,
    status: query.status as ForumFilter["status"],
    search: typeof query.q === "string" ? query.q.trim() : undefined,
  };
}
