import { accountApi } from "@/account/client";
import { BugReportApiError, type BugReportDraft } from "@/bugs/client";
import type { CommunityRoadmap } from "@aegis/shared/feedback/roadmapTypes";
import type {
  ForumCommentPage,
  ForumComment,
  ForumFilter,
  ForumPage,
  ForumTopicDetail,
  ForumPostDraft,
} from "@aegis/shared/feedback/forumTypes";

async function request<T>({ path, init = {} }: { path: string; init?: RequestInit }): Promise<T> {
  const response = await fetch(`${accountApi.base}/feedback${path}`, {
    credentials: "include",
    cache: "no-store",
    ...init,
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    throw new BugReportApiError(response.status, body.error);
  }
  return response.json() as Promise<T>;
}
function json({ method, body }: { method: string; body: unknown }): RequestInit {
  return { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}
type RoadmapRequestParams = { signal?: AbortSignal };

export const forumClient = {
  roadmap({ signal }: RoadmapRequestParams = {}): Promise<CommunityRoadmap> {
    return request({ path: "/roadmap", init: { signal } });
  },
  list({
    filter = {},
    signal,
    hidden = false,
  }: { filter?: Partial<ForumFilter>; signal?: AbortSignal; hidden?: boolean } = {}): Promise<ForumPage> {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(filter))
      if (value !== undefined && value !== "") query.set(key === "search" ? "q" : key, String(value));
    if (hidden) query.set("hidden", "1");
    return request({ path: `/topics?${query}`, init: { signal } });
  },
  detail({ id, signal }: { id: number; signal?: AbortSignal }): Promise<ForumTopicDetail> {
    return request({ path: `/topics/${id}`, init: { signal } });
  },
  create(draft: BugReportDraft & { imageIds: string[] }): Promise<{ id: number }> {
    return request({
      path: "/topics",
      init: json({
        method: "POST",
        body: {
          ...draft,
          clientRevision: import.meta.env.VITE_AEGIS_REVISION ?? "development",
          userAgent: navigator.userAgent,
        },
      }),
    });
  },
  comment({ id, draft }: { id: number; draft: ForumPostDraft }): Promise<ForumComment> {
    return request({ path: `/topics/${id}/comments`, init: json({ method: "POST", body: draft }) });
  },
  comments({ id, after }: { id: number; after: number }): Promise<ForumCommentPage> {
    return request({ path: `/topics/${id}/comments?after=${after}` });
  },
  member({ id, change }: { id: number; change: { supported?: boolean; following?: boolean } }): Promise<{ ok: true }> {
    return request({ path: `/topics/${id}/member`, init: json({ method: "PUT", body: change }) });
  },
  imageUrl(id: string): string {
    return `${accountApi.base}/feedback/images/${id}`;
  },
  flag({ id, commentId, reason }: { id: number; commentId: number | null; reason: string }): Promise<{ ok: true }> {
    return request({ path: `/topics/${id}/flags`, init: json({ method: "POST", body: { commentId, reason } }) });
  },
  flags(id: number): Promise<{ id: number; commentId: number | null; reason: string }[]> {
    return request({ path: `/topics/${id}/flags` });
  },
  moderate({
    id,
    commentId,
    hidden,
  }: {
    id: number;
    commentId: number | null;
    hidden: boolean;
  }): Promise<{ ok: true }> {
    return request({ path: `/topics/${id}/moderation`, init: json({ method: "PATCH", body: { commentId, hidden } }) });
  },
};
