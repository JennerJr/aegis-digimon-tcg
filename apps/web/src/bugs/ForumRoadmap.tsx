import { useEffect, useState } from "react";
import { FeedbackStatus } from "@aegis/shared/feedback/FeedbackStatus";
import { FeedbackKind } from "@aegis/shared/feedback/FeedbackKind";
import { RoadmapStage } from "@aegis/shared/feedback/RoadmapStage";
import type { CommunityRoadmap } from "@aegis/shared/feedback/roadmapTypes";
import type { ForumPage, ForumFilter } from "@aegis/shared/feedback/forumTypes";
import { forumClient } from "@/bugs/forumClient";
import { CommunityHubNav } from "@/community/CommunityHubNav";
import { CommunityHubSection } from "@/community/CommunityHubSection";
import { RoadmapSuggestion } from "@/bugs/RoadmapSuggestion";
import { useTranslation } from "@/i18n/useTranslation";
import { Badge, Button, Alert } from "@/design/primitives";
import { FEEDBACK_STATUS_TONE } from "@/bugs/feedbackStatus";

const COLUMNS = [
  { stage: RoadmapStage.PLANNED.value, status: undefined, label: "forum.roadmap.planned" },
  { stage: RoadmapStage.DEVELOPMENT.value, status: FeedbackStatus.IN_PROGRESS.value, label: "forum.roadmap.doing" },
  { stage: RoadmapStage.REVIEW.value, status: FeedbackStatus.TRIAGED.value, label: "forum.roadmap.review" },
  { stage: RoadmapStage.IDEA.value, status: FeedbackStatus.NEW.value, label: "forum.roadmap.ideas" },
] as const;

type ForumRoadmapParams = {
  onSelect: (id: number) => void;
  onFilter: (filter: Partial<ForumFilter>) => void;
  onDiscussions: () => void;
  onNew: () => void;
  onDecks?: () => void;
};

export function ForumRoadmap({ onSelect, onFilter, onDiscussions, onNew, onDecks }: ForumRoadmapParams) {
  const { t } = useTranslation();
  const [data, setData] = useState<{ catalog: CommunityRoadmap; pages: (ForumPage | undefined)[] }>();
  const [failed, setFailed] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setFailed(false);
    void Promise.all([
      forumClient.roadmap({ signal: controller.signal }),
      Promise.all(
        COLUMNS.map(({ status }) =>
          status === undefined
            ? undefined
            : forumClient.list({ filter: { status, kind: FeedbackKind.IMPROVEMENT.value }, signal: controller.signal }),
        ),
      ),
    ])
      .then(([catalog, pages]) => {
        if (!controller.signal.aborted) setData({ catalog, pages });
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      });
    return () => controller.abort();
  }, [revision]);
  return (
    <section className="forum-page" aria-labelledby="forum-roadmap-title">
      <header className="forum-page-heading">
        <div>
          <p className="forum-eyebrow">{t("forum.eyebrow")}</p>
          <h1 id="forum-roadmap-title" className="aegis-page-title">
            {t("forum.roadmapTitle")}
          </h1>
          <p>{t("forum.roadmapSubtitle")}</p>
        </div>
        <Button onClick={onNew}>{t("forum.suggestImprovement")}</Button>
      </header>
      <CommunityHubNav
        section={CommunityHubSection.ROADMAP.value}
        onDecks={onDecks}
        onDiscussions={onDiscussions}
        onRoadmap={() => undefined}
      />
      <p className="forum-roadmap-note">{t("forum.roadmapNote")}</p>
      {failed ? (
        <Alert tone="warning" title={t("forum.loadError")}>
          <Button onClick={() => setRevision((value) => value + 1)}>{t("feedback.refresh")}</Button>
        </Alert>
      ) : null}
      {!failed && !data ? <p role="status">{t("common.loading")}</p> : null}
      {data ? (
        <>
          <p className="forum-roadmap-reviewed">
            {t("forum.roadmapReviewed")} <time dateTime={data.catalog.reviewedAt}>{data.catalog.reviewedAt}</time>
          </p>
          <div className="forum-roadmap-board">
            {COLUMNS.map((column, index) => {
              const suggestions = data.catalog.items.filter((entry) => entry.stage === column.stage);
              const topics = data.pages[index]?.items ?? [];
              return (
                <section
                  key={column.stage}
                  className="forum-roadmap-column"
                  aria-labelledby={`roadmap-${column.stage}`}
                >
                  <h2 id={`roadmap-${column.stage}`}>{t(column.label)}</h2>
                  <ul>
                    {suggestions.map((entry) => (
                      <li key={entry.id}>
                        <RoadmapSuggestion entry={entry} />
                      </li>
                    ))}
                    {topics.map((topic) => (
                      <li key={topic.id}>
                        <a
                          href={`/feedback/${topic.id}`}
                          onClick={(event) => {
                            if (!event.ctrlKey && !event.metaKey && !event.shiftKey && event.button === 0) {
                              event.preventDefault();
                              onSelect(topic.id);
                            }
                          }}
                        >
                          <Badge tone={FEEDBACK_STATUS_TONE[topic.status]}>{t("bugReport.kind.improvement")}</Badge>
                          <h3>{topic.summary}</h3>
                          <span>
                            {t("forum.supportCount", { count: topic.supportCount })} ·{" "}
                            {t("forum.replyCount", { count: topic.commentCount })}
                          </span>
                        </a>
                      </li>
                    ))}
                  </ul>
                  {!suggestions.length && !topics.length ? <p>{t("forum.roadmapEmpty")}</p> : null}
                  {column.status !== undefined && topics.length > 0 ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onFilter({ status: column.status, kind: FeedbackKind.IMPROVEMENT.value })}
                    >
                      {t("forum.viewAll")}
                    </Button>
                  ) : null}
                </section>
              );
            })}
          </div>
        </>
      ) : null}
    </section>
  );
}
