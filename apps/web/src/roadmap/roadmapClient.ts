import type { RoadmapDraft, RoadmapItem, RoadmapItemDetail } from "@aegis/shared/roadmap/roadmapTypes";
import { AccountApiError, accountApi, request } from "@/account/client";

export const roadmapClient = {
  list: (signal?: AbortSignal) =>
    request<{ items: RoadmapItem[] }>("/community/roadmap", { signal, cache: "no-store" }).then((page) => page.items),
  detail: (id: number, signal?: AbortSignal) =>
    request<RoadmapItemDetail>(`/community/roadmap/${id}`, { signal, cache: "no-store" }),
  support: ({ id, supported }: { id: number; supported: boolean }) =>
    request<RoadmapItemDetail>(`/community/roadmap/${id}/support`, {
      method: "PUT",
      body: JSON.stringify({ supported }),
    }),
  forFeedback: (feedbackId: number, signal?: AbortSignal) =>
    request<{ item: RoadmapItemDetail | null }>(`/account/admin/feedback/${feedbackId}/roadmap`, {
      signal,
      cache: "no-store",
    }).then((result) => result.item),
  create: ({ draft, sourceFeedbackId }: { draft: RoadmapDraft; sourceFeedbackId?: number }) =>
    request<RoadmapItemDetail>("/account/admin/roadmap", {
      method: "POST",
      body: JSON.stringify({ ...draft, sourceFeedbackId }),
    }),
  update: ({ id, draft }: { id: number; draft: RoadmapDraft }) =>
    request<RoadmapItemDetail>(`/account/admin/roadmap/${id}`, { method: "PUT", body: JSON.stringify(draft) }),
  remove: async (id: number) => {
    const response = await fetch(`${accountApi.base}/account/admin/roadmap/${id}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      throw new AccountApiError(response.status, body.error);
    }
  },
};
