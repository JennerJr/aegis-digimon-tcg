import type { Express, NextFunction, Request, Response } from "express";
import type { AuthSession } from "#api/accounts/AccountStore";
import { parseId } from "#api/http/parseId";
import { tokenBucketLimiter } from "#api/http/rateLimit";
import type { RoadmapStore } from "#api/roadmap/RoadmapStore";
import { validateRoadmapDraft } from "#api/roadmap/validateRoadmapDraft";

type RoadmapRouteDeps = {
  app: Express;
  store: RoadmapStore;
  session: (req: Request) => Promise<AuthSession | undefined>;
};

type Access = "public" | "signedIn" | "admin";
type Handler = (req: Request, res: Response, auth: AuthSession | undefined) => Promise<void>;

export function installRoadmapRoutes({ app, store, session }: RoadmapRouteDeps): void {
  const limitSupport = tokenBucketLimiter({ capacity: 30, refillMs: 60_000 });
  const route =
    (access: Access, handler: Handler) =>
    (req: Request, res: Response, next: NextFunction): void => {
      res.set("Cache-Control", "no-store");
      void (async () => {
        const auth = await session(req);
        if (access !== "public" && !auth) {
          res.status(401).json({ error: "authentication_required" });
          return;
        }
        if (access === "admin" && !auth?.account.isAdmin) {
          res.status(403).json({ error: "admin_required" });
          return;
        }
        await handler(req, res, auth);
      })().catch(next);
    };

  app.get(
    ["/community/roadmap", "/roadmap"],
    route("public", async (_req, res, auth) => {
      res.json({ items: await store.list(auth?.account.id) });
    }),
  );

  app.get(
    ["/community/roadmap/:id", "/roadmap/:id"],
    route("public", async (req, res, auth) => {
      const id = parseId(req.params.id);
      const item = id === undefined ? undefined : await store.detail({ id, accountId: auth?.account.id });
      if (!item) {
        res.status(404).json({ error: "not_found" });
        return;
      }
      res.json(item);
    }),
  );

  app.put(
    ["/community/roadmap/:id/support", "/roadmap/:id/support"],
    route("signedIn", async (req, res, auth) => {
      const id = parseId(req.params.id);
      const supported = req.body?.supported;
      if (id === undefined || typeof supported !== "boolean") {
        res.status(400).json({ error: "invalid_support" });
        return;
      }
      if (!limitSupport(auth!.account.id)) {
        res.status(429).json({ error: "too_many_requests" });
        return;
      }
      if (!(await store.support({ id, accountId: auth!.account.id, supported }))) {
        res.status(404).json({ error: "not_found" });
        return;
      }
      res.json((await store.detail({ id, accountId: auth!.account.id }))!);
    }),
  );

  app.post(
    ["/admin/roadmap", "/account/admin/roadmap"],
    route("admin", async (req, res) => {
      const draft = validateRoadmapDraft(req.body);
      if ("error" in draft) {
        res.status(400).json({ error: draft.error });
        return;
      }
      const rawSource = req.body?.sourceFeedbackId;
      const sourceFeedbackId = rawSource === undefined || rawSource === null ? undefined : parseId(rawSource);
      if (rawSource !== undefined && rawSource !== null && sourceFeedbackId === undefined) {
        res.status(400).json({ error: "invalid_source" });
        return;
      }
      const created = await store.create({ draft, sourceFeedbackId });
      if (created === "source_not_found") {
        res.status(404).json({ error: "source_not_found" });
        return;
      }
      if (created === "already_published") {
        res.status(409).json({ error: "already_published" });
        return;
      }
      res.status(201).json(created);
    }),
  );

  app.get(
    ["/admin/feedback/:id/roadmap", "/account/admin/feedback/:id/roadmap"],
    route("admin", async (req, res) => {
      const id = parseId(req.params.id);
      if (id === undefined) {
        res.status(400).json({ error: "invalid_id" });
        return;
      }
      res.json({ item: (await store.itemForFeedback(id)) ?? null });
    }),
  );

  app.put(
    ["/admin/roadmap/:id", "/account/admin/roadmap/:id"],
    route("admin", async (req, res) => {
      const id = parseId(req.params.id);
      const draft = validateRoadmapDraft(req.body);
      if (id === undefined) {
        res.status(404).json({ error: "not_found" });
        return;
      }
      if ("error" in draft) {
        res.status(400).json({ error: draft.error });
        return;
      }
      const updated = await store.update({ id, draft });
      if (!updated) {
        res.status(404).json({ error: "not_found" });
        return;
      }
      res.json(updated);
    }),
  );

  app.delete(
    ["/admin/roadmap/:id", "/account/admin/roadmap/:id"],
    route("admin", async (req, res) => {
      const id = parseId(req.params.id);
      if (id === undefined || !(await store.remove(id))) {
        res.status(404).json({ error: "not_found" });
        return;
      }
      res.status(204).end();
    }),
  );
}
