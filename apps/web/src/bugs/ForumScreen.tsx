import { ForumRoadmap } from "@/bugs/ForumRoadmap";
import { CommunityHubNav } from "@/community/CommunityHubNav";
import { CommunityHubSection } from "@/community/CommunityHubSection";
import { useEffect, useState } from "react";
import { Search, Plus, MessageSquare, Bug, Lightbulb, Bookmark, User, ArrowRight } from "lucide-react";
import { FeedbackKind, FEEDBACK_KINDS } from "@aegis/shared/feedback/FeedbackKind";
import { ForumScope } from "@aegis/shared/feedback/ForumScope";
import { ForumSort, FORUM_SORTS } from "@aegis/shared/feedback/ForumSort";
import { FEEDBACK_STATUSES, type FeedbackStatus } from "@aegis/shared/feedback/FeedbackStatus";
import { MAX_FEEDBACK_SEARCH } from "@aegis/shared/feedback/limits";
import type { ForumFilter, ForumPage } from "@aegis/shared/feedback/forumTypes";
import { forumClient } from "@/bugs/forumClient";
import { ForumTopicView } from "@/bugs/ForumTopicView";
import { ForumComposer } from "@/bugs/ForumComposer";
import { MyFeedbackScreen } from "@/bugs/MyFeedbackScreen";
import { FEEDBACK_STATUS_TONE } from "@/bugs/feedbackStatus";
import { Button, Badge, Alert } from "@/design/primitives";
import { relativeTime } from "@/i18n/relativeTime";
import { useTranslation } from "@/i18n/useTranslation";
import "@/bugs/forum.css";

const KIND_ICONS = {
  [FeedbackKind.BUG.value]: Bug,
  [FeedbackKind.IMPROVEMENT.value]: Lightbulb,
  [FeedbackKind.OTHER.value]: MessageSquare,
};

export function ForumScreen({
  signedIn,
  accountId,
  isAdmin,
  selectedId,
  view,
  onSelect,
  onNew,
  onPrivate,
  onSignIn,
  onTriage,
  onDecks = () => location.assign("/community"),
  onRoadmap = () => location.assign("/feedback/roadmap"),
}: {
  signedIn: boolean;
  accountId?: string;
  isAdmin: boolean;
  selectedId?: number;
  view?: "new" | "private" | "roadmap";
  onSelect: (id?: number) => void;
  onNew: () => void;
  onPrivate: () => void;
  onSignIn: () => void;
  onTriage: (id?: number) => void;
  onRoadmap?: () => void;
  onDecks?: () => void;
}) {
  const { t, locale } = useTranslation();
  const [filter, setFilter] = useState<Partial<ForumFilter>>({});
  const [search, setSearch] = useState("");
  const [page, setPage] = useState<ForumPage>();
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [revision, setRevision] = useState(0);
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(
      () => setFilter((current) => ({ ...current, search: search.trim() || undefined })),
      300,
    );
    return () => window.clearTimeout(timer);
  }, [search]);
  useEffect(() => {
    setOffset(0);
    setPage(undefined);
  }, [filter, hidden, revision]);
  useEffect(() => {
    if (selectedId !== undefined || view) return;
    const controller = new AbortController();
    setLoading(true);
    setFailed(false);
    void forumClient
      .list({ filter: { ...filter, offset }, signal: controller.signal, hidden: hidden })
      .then((result) => {
        if (controller.signal.aborted) return;
        setPage((current) =>
          offset === 0
            ? result
            : {
                ...result,
                items: [...(current?.items ?? []), ...result.items].filter(
                  (item, index, items) => items.findIndex((candidate) => candidate.id === item.id) === index,
                ),
              },
        );
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [filter, offset, hidden, revision, selectedId, view]);
  if (view === "roadmap")
    return (
      <ForumRoadmap
        onSelect={onSelect}
        onFilter={(next) => {
          setOffset(0);
          setFilter(next);
          setSearch("");
          onSelect();
        }}
        onDiscussions={() => onSelect()}
        onNew={onNew}
        onDecks={onDecks}
      />
    );
  if (view === "new")
    return (
      <ForumComposer
        signedIn={signedIn}
        accountId={accountId}
        onCancel={() => onSelect()}
        onPublished={onSelect}
        onSignIn={onSignIn}
      />
    );
  if (view === "private")
    return (
      <div className="forum-page">
        <Button variant="ghost" onClick={() => onSelect()}>
          {t("forum.back")}
        </Button>
        <MyFeedbackScreen signedIn={signedIn} onSignIn={onSignIn} onSendFeedback={onNew} />
      </div>
    );
  if (selectedId !== undefined)
    return (
      <ForumTopicView
        key={selectedId}
        id={selectedId}
        accountId={accountId}
        signedIn={signedIn}
        isAdmin={isAdmin}
        onBack={() => onSelect()}
        onSelect={onSelect}
        onSignIn={onSignIn}
        onNew={onNew}
        onTriage={() => onTriage(selectedId)}
      />
    );
  const scope = filter.scope ?? ForumScope.ALL.value;
  const change = (next: Partial<ForumFilter>) => {
    setOffset(0);
    setFilter((current) => ({ ...current, ...next }));
  };
  return (
    <section className="forum-page" aria-labelledby="forum-title">
      <header className="forum-page-heading">
        <div>
          <p className="forum-eyebrow">{t("forum.eyebrow")}</p>
          <h1 id="forum-title" className="aegis-page-title">
            {t("forum.title")}
          </h1>
          <p>{t("forum.subtitle")}</p>
        </div>
        <Button icon={Plus} onClick={onNew}>
          {t("forum.newTopic")}
        </Button>
      </header>
      <CommunityHubNav
        section={CommunityHubSection.DISCUSSIONS.value}
        onDecks={onDecks}
        onDiscussions={() => onSelect()}
        onRoadmap={onRoadmap}
      />
      <div className="forum-layout">
        <nav className="forum-sidebar" aria-label={t("forum.categories")}>
          <button
            aria-current={filter.kind === undefined && scope === ForumScope.ALL.value ? "page" : undefined}
            onClick={() => change({ kind: undefined, scope: ForumScope.ALL.value })}
          >
            <MessageSquare size={18} />
            {t("forum.allTopics")}
          </button>
          {FEEDBACK_KINDS.map((kind) => {
            const Icon = KIND_ICONS[kind];
            return (
              <button
                key={kind}
                aria-current={filter.kind === kind ? "page" : undefined}
                onClick={() => change({ kind, scope: ForumScope.ALL.value })}
              >
                <Icon size={18} />
                {t(`bugReport.kind.${kind}`)}
              </button>
            );
          })}
          <div className="forum-sidebar__personal">
            {[
              { scope: ForumScope.MINE.value, Icon: User, label: t("forum.myTopics") },
              { scope: ForumScope.FOLLOWING.value, Icon: Bookmark, label: t("forum.following") },
            ].map(({ scope: nextScope, Icon, label }) => (
              <button
                key={nextScope}
                aria-current={scope === nextScope ? "page" : undefined}
                onClick={() => (signedIn ? change({ scope: nextScope, kind: undefined }) : onSignIn())}
              >
                <Icon size={18} />
                {label}
              </button>
            ))}
            <button onClick={onPrivate}>{t("forum.privateReports")}</button>
          </div>
          {isAdmin ? (
            <button onClick={() => onTriage()}>
              {t("forum.triage")}
              <ArrowRight size={16} />
            </button>
          ) : null}
        </nav>
        <div className="forum-topic-list">
          <label className="forum-search">
            <Search size={18} />
            <span className="aegis-sr-only">{t("forum.search")}</span>
            <input
              type="search"
              value={search}
              maxLength={MAX_FEEDBACK_SEARCH}
              placeholder={t("forum.search")}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <div className="forum-list-controls">
            <div className="forum-sort" role="group" aria-label={t("forum.sort")}>
              {FORUM_SORTS.map((sort) => (
                <button
                  key={sort}
                  aria-pressed={(filter.sort ?? ForumSort.RECENT.value) === sort}
                  onClick={() => change({ sort })}
                >
                  {t(`forum.sort.${sort}`)}
                </button>
              ))}
            </div>
            <label className="forum-status">
              <span className="aegis-sr-only">{t("feedback.triage.statusFilter")}</span>
              <select
                value={filter.status ?? ""}
                onChange={(event) =>
                  change({ status: event.target.value ? (event.target.value as FeedbackStatus) : undefined })
                }
              >
                <option value="">{t("forum.allStatuses")}</option>
                {FEEDBACK_STATUSES.map((status) => (
                  <option value={status} key={status}>
                    {t(`feedback.status.${status}`)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {isAdmin ? (
            <label className="forum-hidden-toggle">
              <input type="checkbox" checked={hidden} onChange={(event) => setHidden(event.target.checked)} />
              {t("forum.showHidden")}
            </label>
          ) : null}
          <details className="forum-pinned">
            <summary>{t("forum.goodReport")}</summary>
            <p>{t("forum.beforePosting")}</p>
            <p>{t("forum.publicNote")}</p>
          </details>
          {loading && !page ? <p role="status">{t("common.loading")}</p> : null}
          {failed ? (
            <Alert tone="warning" title={t("forum.loadError")}>
              <Button variant="secondary" onClick={() => setRevision((value) => value + 1)}>
                {t("feedback.refresh")}
              </Button>
            </Alert>
          ) : null}
          {!loading && !failed && page?.items.length === 0 ? (
            <div className="forum-empty">
              <MessageSquare size={32} />
              <h2>{t("forum.empty")}</h2>
              <p>{t("forum.emptyCopy")}</p>
              <Button variant="secondary" onClick={onNew}>
                {t("forum.newTopic")}
              </Button>
            </div>
          ) : null}
          {page?.items.length ? (
            <ul className="forum-rows" aria-busy={loading}>
              {page.items.map((topic) => (
                <li key={topic.id}>
                  <a
                    className="forum-row"
                    href={`/feedback/${topic.id}`}
                    onClick={(event) => {
                      if (!event.ctrlKey && !event.metaKey && !event.shiftKey && event.button === 0) {
                        event.preventDefault();
                        onSelect(topic.id);
                      }
                    }}
                  >
                    <span className="forum-avatar" aria-hidden="true">
                      {(topic.authorName ?? "?").slice(0, 2).toUpperCase()}
                    </span>
                    <div className="forum-row__body">
                      <h2>{topic.summary}</h2>
                      <div className="forum-row__meta">
                        <span>{t(`bugReport.kind.${topic.kind}`)}</span>
                        <Badge tone={FEEDBACK_STATUS_TONE[topic.status]}>{t(`feedback.status.${topic.status}`)}</Badge>
                        {topic.hidden ? <Badge tone="danger">{t("forum.hidden")}</Badge> : null}
                        <span>{topic.authorName ?? t("feedback.anonymous")}</span>
                      </div>
                    </div>
                    <div className="forum-row__activity">
                      <span>
                        {t("forum.supportCount", { count: topic.supportCount })} ·{" "}
                        {t("forum.replyCount", { count: topic.commentCount })}
                      </span>
                      <time dateTime={new Date(topic.updatedAt).toISOString()}>
                        {relativeTime({ at: topic.updatedAt, locale })}
                      </time>
                    </div>
                  </a>
                </li>
              ))}
            </ul>
          ) : null}
          {page?.nextOffset !== null && page?.nextOffset !== undefined ? (
            <Button variant="secondary" disabled={loading} onClick={() => setOffset(page.nextOffset!)}>
              {t("forum.moreTopics")}
            </Button>
          ) : null}
        </div>
      </div>
    </section>
  );
}
