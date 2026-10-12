import { ForumReply } from "@/bugs/ForumReply";
import { ForumCommentPost } from "@/bugs/ForumCommentPost";
import { useEffect, useState } from "react";
import { ArrowLeft, Bell, ThumbsUp, Share2, Flag } from "lucide-react";
import { FeedbackKind } from "@aegis/shared/feedback/FeedbackKind";
import { MAX_FORUM_FLAG_REASON } from "@aegis/shared/feedback/forumLimits";
import type { ForumComment, ForumTopicDetail } from "@aegis/shared/feedback/forumTypes";
import { forumClient } from "@/bugs/forumClient";
import { ForumMarkdown } from "@/bugs/ForumMarkdown";
import { ForumImages } from "@/bugs/ForumImages";
import { MyFeedbackScreen } from "@/bugs/MyFeedbackScreen";
import { BugReportApiError } from "@/bugs/client";
import { FEEDBACK_STATUS_TONE } from "@/bugs/feedbackStatus";
import { Button, Badge, Alert } from "@/design/primitives";
import { relativeTime } from "@/i18n/relativeTime";
import { useTranslation } from "@/i18n/useTranslation";

export function ForumTopicView({
  id,
  signedIn,
  accountId,
  isAdmin,
  onBack,
  onSelect,
  onSignIn,
  onNew,
}: {
  id: number;
  signedIn: boolean;
  accountId?: string;
  isAdmin: boolean;
  onBack: () => void;
  onSelect: (id: number) => void;
  onSignIn: () => void;
  onNew: () => void;
}) {
  const { t, locale } = useTranslation();
  const [topic, setTopic] = useState<ForumTopicDetail>();
  const [failed, setFailed] = useState(false);
  const [missing, setMissing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [posted, setPosted] = useState<ForumComment[]>([]);
  const [flagTarget, setFlagTarget] = useState<number | null | undefined>();
  const [reason, setReason] = useState("");
  const [notice, setNotice] = useState("");
  const [flags, setFlags] = useState<{ id: number; commentId: number | null; reason: string }[]>([]);
  useEffect(() => {
    const controller = new AbortController();
    void forumClient
      .detail({ id: id, signal: controller.signal })
      .then(setTopic)
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        if (error instanceof BugReportApiError && error.status === 404) setMissing(true);
        else setFailed(true);
      });
    if (isAdmin)
      void forumClient
        .flags(id)
        .then(setFlags)
        .catch(() => setFailed(true));
    return () => controller.abort();
  }, [id, isAdmin]);
  const refresh = async () => {
    const updated = await forumClient.detail({ id: id });
    const lastLoaded = topic?.comments.at(-1)?.id ?? 0;
    while (updated.nextAfter !== null && (updated.comments.at(-1)?.id ?? 0) < lastLoaded) {
      const page = await forumClient.comments({ id: id, after: updated.nextAfter });
      updated.comments.push(...page.items);
      updated.nextAfter = page.nextAfter;
    }
    setTopic(updated);
  };
  const run = async (work: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true);
    setFailed(false);
    setNotice("");
    try {
      await work();
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };
  const member = (change: { supported?: boolean; following?: boolean }) => {
    if (!signedIn) {
      onSignIn();
      return;
    }
    void run(async () => {
      await forumClient.member({ id: id, change: change });
      await refresh();
    });
  };
  const moderate = (commentId: number | null, hidden: boolean) =>
    void run(async () => {
      await forumClient.moderate({ id: id, commentId: commentId, hidden: hidden });
      if (commentId !== null)
        setPosted((current) => current.map((comment) => (comment.id === commentId ? { ...comment, hidden } : comment)));
      await refresh();
    });
  const flag = (target: number | null) => {
    if (!signedIn) {
      onSignIn();
      return;
    }
    setFlagTarget(target);
    setReason("");
  };
  const share = () =>
    void run(async () => {
      await navigator.clipboard.writeText(new URL(`/feedback/${id}`, location.origin).href);
      setNotice(t("forum.linkCopied"));
    });
  if (missing)
    return (
      <div className="forum-page">
        <Button variant="ghost" onClick={onBack}>
          {t("forum.back")}
        </Button>
        {signedIn ? (
          <MyFeedbackScreen signedIn focusId={id} onSignIn={onSignIn} onSendFeedback={onNew} />
        ) : (
          <Alert tone="info" title={t("forum.missing")}>
            <Button onClick={onSignIn}>{t("nav.signIn")}</Button>
          </Alert>
        )}
      </div>
    );
  if (!topic)
    return (
      <div className="forum-page">
        <Button variant="ghost" onClick={onBack}>
          {t("forum.back")}
        </Button>
        {failed ? (
          <Alert tone="warning" title={t("forum.loadError")}>
            <Button onClick={() => void run(refresh)}>{t("feedback.refresh")}</Button>
          </Alert>
        ) : (
          <p role="status">{t("common.loading")}</p>
        )}
      </div>
    );
  return (
    <section className="forum-page forum-discussion" aria-labelledby="forum-topic-title">
      <header className="forum-page-heading">
        <Button variant="ghost" icon={ArrowLeft} onClick={onBack}>
          {t("forum.back")}
        </Button>
        <h1 id="forum-topic-title" className="aegis-page-title">
          {topic.summary}
        </h1>
        <div className="forum-row__meta">
          <Badge>{t(`bugReport.kind.${topic.kind}`)}</Badge>
          <Badge tone={FEEDBACK_STATUS_TONE[topic.status]}>{t(`feedback.status.${topic.status}`)}</Badge>
          {topic.hidden ? <Badge tone="danger">{t("forum.hidden")}</Badge> : null}
        </div>
      </header>
      {failed ? <Alert tone="warning" title={t("forum.saveError")} /> : null}
      {notice ? (
        <p role="status" className="forum-notice">
          {notice}
        </p>
      ) : null}
      <div className="forum-discussion-layout">
        <div className="forum-thread">
          <article className="forum-post">
            <header>
              <span className="forum-avatar" aria-hidden="true">
                {(topic.authorName ?? "?").slice(0, 2).toUpperCase()}
              </span>
              <strong>{topic.authorName ?? t("feedback.anonymous")}</strong>
              <time dateTime={new Date(topic.createdAt).toISOString()}>
                {relativeTime({ at: topic.createdAt, locale })}
              </time>
            </header>
            <ForumMarkdown>{topic.description}</ForumMarkdown>
            <ForumImages images={topic.images} />
            {topic.cardIds.length ? <p className="forum-card-ids">{topic.cardIds.join(" · ")}</p> : null}
            <footer className="forum-post-actions">
              <Button
                variant="secondary"
                size="sm"
                icon={ThumbsUp}
                aria-pressed={topic.supported}
                disabled={busy || topic.hidden}
                onClick={() => member({ supported: !topic.supported })}
              >
                {t(topic.kind === FeedbackKind.BUG.value ? "forum.alsoHappens" : "forum.support")} ·{" "}
                {topic.supportCount}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                icon={Bell}
                aria-pressed={topic.following}
                disabled={busy || topic.hidden}
                onClick={() => member({ following: !topic.following })}
              >
                {t(topic.following ? "forum.following" : "forum.follow")}
              </Button>
              <Button variant="ghost" size="sm" icon={Share2} disabled={busy} onClick={share}>
                {t("forum.share")}
              </Button>
              <Button variant="ghost" size="sm" icon={Flag} disabled={busy || topic.hidden} onClick={() => flag(null)}>
                {t("forum.report")}
              </Button>
            </footer>
          </article>
          {topic.finalReply ? (
            <article className="forum-post forum-post--official">
              <header>
                <strong>{t("forum.team")}</strong>
                <Badge>{t("forum.official")}</Badge>
              </header>
              <ForumMarkdown>{topic.finalReply}</ForumMarkdown>
            </article>
          ) : null}
          {topic.duplicateOfId !== null ? (
            <p className="forum-duplicate">
              <Button variant="secondary" onClick={() => onSelect(topic.duplicateOfId!)}>
                {t("feedback.triage.openOriginal", { id: topic.duplicateOfId })}
              </Button>
            </p>
          ) : null}
          <h2 className="forum-replies-title">{t("forum.discussion")}</h2>
          {topic.comments.map((comment) => (
            <ForumCommentPost
              key={comment.id}
              comment={comment}
              disabled={busy || topic.hidden}
              isAdmin={isAdmin}
              onFlag={() => flag(comment.id)}
              onModerate={() => moderate(comment.id, !comment.hidden)}
            />
          ))}
          {topic.nextAfter !== null ? (
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  const page = await forumClient.comments({ id: id, after: topic.nextAfter! });
                  setTopic((current) =>
                    current
                      ? { ...current, comments: [...current.comments, ...page.items], nextAfter: page.nextAfter }
                      : current,
                  );
                })
              }
            >
              {t("forum.moreReplies")}
            </Button>
          ) : null}
          {posted
            .filter((comment) => !topic.comments.some((loaded) => loaded.id === comment.id))
            .map((comment) => (
              <ForumCommentPost
                key={comment.id}
                comment={comment}
                disabled={busy || topic.hidden}
                isAdmin={isAdmin}
                onFlag={() => flag(comment.id)}
                onModerate={() => moderate(comment.id, !comment.hidden)}
              />
            ))}
          {flagTarget !== undefined ? (
            <form
              className="forum-flag"
              onSubmit={(event) => {
                event.preventDefault();
                if (!reason.trim() || busy) return;
                void run(async () => {
                  await forumClient.flag({ id: id, commentId: flagTarget, reason: reason });
                  setFlagTarget(undefined);
                  setNotice(t("forum.reported"));
                });
              }}
            >
              <h3>{t("forum.report")}</h3>
              <label className="forum-field">
                {t("forum.reportReason")}
                <textarea
                  value={reason}
                  maxLength={MAX_FORUM_FLAG_REASON}
                  required
                  rows={3}
                  onChange={(event) => setReason(event.target.value)}
                />
              </label>
              <div className="forum-flag-actions">
                <Button type="submit" disabled={busy || !reason.trim()}>
                  {t("forum.sendReport")}
                </Button>
                <Button type="button" variant="ghost" onClick={() => setFlagTarget(undefined)}>
                  {t("common.cancel")}
                </Button>
              </div>
            </form>
          ) : null}
          {!topic.hidden ? (
            signedIn ? (
              <ForumReply
                id={id}
                accountId={accountId}
                onReplied={(comment) => {
                  setPosted((current) => [...current, comment]);
                  setTopic((current) => (current ? { ...current, commentCount: current.commentCount + 1 } : current));
                  setNotice(t("forum.replied"));
                }}
              />
            ) : (
              <Alert tone="info" title={t("forum.signInTitle")}>
                <Button onClick={onSignIn}>{t("nav.signIn")}</Button>
              </Alert>
            )
          ) : null}
        </div>
        <aside className="forum-topic-context">
          <h2>{t("forum.topicStatus")}</h2>
          <Badge tone={FEEDBACK_STATUS_TONE[topic.status]}>{t(`feedback.status.${topic.status}`)}</Badge>
          <ol className="forum-timeline">
            {topic.history.map((event, index) => (
              <li key={index}>
                <strong>{t(`feedback.status.${event.to}`)}</strong>
                <time dateTime={new Date(event.at).toISOString()}>{relativeTime({ at: event.at, locale })}</time>
                {event.comment ? <p>{event.comment}</p> : null}
              </li>
            ))}
          </ol>
          {isAdmin ? (
            <div className="forum-moderation">
              <Button variant="ghost" disabled={busy} onClick={() => moderate(null, !topic.hidden)}>
                {t(topic.hidden ? "forum.restore" : "forum.hide")}
              </Button>
              {flags.length ? (
                <div>
                  <h3>{t("forum.flags")}</h3>
                  {flags.map((item) => (
                    <p key={item.id}>
                      {item.commentId === null ? t("forum.topic") : t("forum.commentNumber", { id: item.commentId })}:{" "}
                      {item.reason}
                    </p>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </aside>
      </div>
    </section>
  );
}
