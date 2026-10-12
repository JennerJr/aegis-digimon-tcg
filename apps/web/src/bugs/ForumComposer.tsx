import { useForumDraftGuard } from "@/bugs/useForumDraftGuard";
import { useEffect, useId, useState } from "react";
import { Bug, Lightbulb, MessageSquare, ArrowLeft } from "lucide-react";
import { FeedbackKind, FEEDBACK_KINDS } from "@aegis/shared/feedback/FeedbackKind";
import type { ForumTopic } from "@aegis/shared/feedback/forumTypes";
import { MAX_FORUM_BODY, FORUM_PENDING_IMAGE_RETENTION_MS } from "@aegis/shared/feedback/forumLimits";
import { MAX_BUG_REPORT_SUMMARY, MAX_BUG_REPORT_CARDS, MAX_BUG_REPORT_OPPONENT_DECK } from "@/bugs/client";
import { forumClient } from "@/bugs/forumClient";
import { ForumEditor } from "@/bugs/ForumEditor";
import { CardAutocomplete } from "@/bugs/CardAutocomplete";
import { Button, Alert } from "@/design/primitives";
import { useTranslation } from "@/i18n/useTranslation";
import "@/bugs/forum.css";

type Draft = { kind: FeedbackKind; summary: string; description: string; cardIds: string[]; opponentDeck: string };
const EMPTY: Draft = { kind: FeedbackKind.BUG.value, summary: "", description: "", cardIds: [], opponentDeck: "" };
const KIND_ICONS = {
  [FeedbackKind.BUG.value]: Bug,
  [FeedbackKind.IMPROVEMENT.value]: Lightbulb,
  [FeedbackKind.OTHER.value]: MessageSquare,
};

export function ForumComposer({
  signedIn,
  accountId,
  matchLogId,
  onCancel,
  onPublished,
  onSignIn,
}: {
  signedIn: boolean;
  accountId?: string;
  matchLogId?: string;
  onCancel: () => void;
  onPublished: (id: number) => void;
  onSignIn: () => void;
}) {
  const { t } = useTranslation();
  const id = useId();
  const draftKey = accountId ? `aegis.forum.draft:${accountId}:${matchLogId ?? "general"}` : undefined;
  const [draft, setDraft] = useState<Draft>(() => restore(draftKey));
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const [draftSaved, setDraftSaved] = useState(false);
  const [similar, setSimilar] = useState<ForumTopic[]>([]);
  const [filed, setFiled] = useState<number>();
  const dirty = !!(draft.summary.trim() || draft.description.trim() || draft.cardIds.length);
  const bypassNavigationGuard = useForumDraftGuard({
    dirty: dirty && filed === undefined,
    busy: saving,
    message: t("forum.leaveDraft"),
  });
  useEffect(() => {
    if (!draftKey || filed !== undefined) return;
    try {
      localStorage.setItem(draftKey, JSON.stringify({ ...draft, savedAt: Date.now() }));
      setDraftSaved(true);
    } catch {
      setDraftSaved(false);
    }
  }, [draft, draftKey, filed]);
  useEffect(() => {
    if (!dirty || filed !== undefined) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, filed]);
  useEffect(() => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      const search = draft.summary.trim().slice(0, 80);
      if (search.length < 4) {
        setSimilar([]);
        return;
      }
      void forumClient
        .list({ filter: { search }, signal: controller.signal })
        .then((page) => {
          if (!controller.signal.aborted) setSimilar(page.items.slice(0, 3));
        })
        .catch(() => {
          if (!controller.signal.aborted) setSimilar([]);
        });
    }, 300);
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [draft.summary]);
  const submit = async () => {
    setSaving(true);
    setFailed(false);
    try {
      const result = await forumClient.create({
        ...draft,
        cardIds: draft.kind === FeedbackKind.BUG.value ? draft.cardIds : [],
        opponentDeck: draft.kind === FeedbackKind.BUG.value ? draft.opponentDeck : undefined,
        matchId: matchLogId,
        imageIds: [],
      });
      bypassNavigationGuard.current = true;
      setFiled(result.id);
      try {
        if (draftKey) localStorage.removeItem(draftKey);
      } catch {}
      onPublished(result.id);
    } catch {
      setFailed(true);
    } finally {
      setSaving(false);
    }
  };
  const cancel = () => {
    if (saving) return;
    if (!dirty || filed !== undefined || window.confirm(t("forum.leaveDraft"))) {
      bypassNavigationGuard.current = true;
      onCancel();
    }
  };
  return (
    <section className="forum-composer" aria-labelledby={id}>
      <header className="forum-page-heading">
        <Button variant="ghost" size="sm" icon={ArrowLeft} onClick={cancel} disabled={saving}>
          {t("forum.back")}
        </Button>
        <h1 id={id} className="aegis-page-title">
          {t("forum.newTitle")}
        </h1>
        <p>{t("forum.newSubtitle")}</p>
      </header>
      {!signedIn ? (
        <Alert tone="info" title={t("forum.signInTitle")}>
          <p>{t("forum.signInCopy")}</p>
          <Button onClick={onSignIn}>{t("nav.signIn")}</Button>
        </Alert>
      ) : filed !== undefined ? (
        <Alert tone="success" title={t("forum.published")}>
          <a href={`/feedback/${filed}`} target="_blank" rel="noopener noreferrer">
            {t("forum.openTopic")}
          </a>
        </Alert>
      ) : (
        <div className="forum-compose-layout">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (!saving && draft.summary.trim() && draft.description.trim()) void submit();
            }}
          >
            <fieldset className="forum-kind">
              <legend>{t("bugReport.kindLabel")}</legend>
              {FEEDBACK_KINDS.map((kind) => {
                const Icon = KIND_ICONS[kind];
                return (
                  <label key={kind}>
                    <input
                      type="radio"
                      name={`${id}-kind`}
                      value={kind}
                      checked={draft.kind === kind}
                      disabled={saving}
                      onChange={() => setDraft((current) => ({ ...current, kind }))}
                    />
                    <Icon size={18} />
                    {t(`bugReport.kind.${kind}`)}
                  </label>
                );
              })}
            </fieldset>
            <label className="forum-field">
              {t("bugReport.summaryLabel")}
              <input
                value={draft.summary}
                maxLength={MAX_BUG_REPORT_SUMMARY}
                disabled={saving}
                required
                onChange={(event) => setDraft((current) => ({ ...current, summary: event.target.value }))}
                placeholder={t(`bugReport.summaryPlaceholder.${draft.kind}`)}
              />
            </label>
            {similar.length ? (
              <aside className="forum-similar">
                <strong>{t("forum.similar")}</strong>
                {similar.map((topic) => (
                  <a key={topic.id} href={`/feedback/${topic.id}`} target="_blank" rel="noopener noreferrer">
                    {topic.summary}
                  </a>
                ))}
              </aside>
            ) : null}
            <ForumEditor
              value={draft.description}
              onChange={(description) => setDraft((current) => ({ ...current, description }))}
              disabled={saving}
              label={t("forum.body")}
            />
            {draft.kind === FeedbackKind.BUG.value ? (
              <details className="forum-context">
                <summary>{t("forum.context")}</summary>
                <CardAutocomplete
                  selected={draft.cardIds}
                  onChange={(cardIds) => setDraft((current) => ({ ...current, cardIds }))}
                  limit={MAX_BUG_REPORT_CARDS}
                />
                <label className="forum-field">
                  {t("bugReport.opponentDeckLabel")}
                  <input
                    value={draft.opponentDeck}
                    maxLength={MAX_BUG_REPORT_OPPONENT_DECK}
                    disabled={saving}
                    onChange={(event) => setDraft((current) => ({ ...current, opponentDeck: event.target.value }))}
                  />
                </label>
                {matchLogId ? <p>{t("forum.matchAttached")}</p> : null}
              </details>
            ) : null}
            {failed ? <Alert tone="danger" title={t("forum.saveError")} /> : null}
            <p className="forum-public-note">{t("forum.publicNote")}</p>
            <footer className="forum-compose-actions">
              <span role="status">{draftSaved && dirty ? t("forum.draftSaved") : ""}</span>
              <Button variant="ghost" type="button" onClick={cancel} disabled={saving}>
                {t("common.cancel")}
              </Button>
              <Button type="submit" disabled={saving || !draft.summary.trim() || !draft.description.trim()}>
                {saving ? t("bugReport.submitting") : t("forum.publish")}
              </Button>
            </footer>
          </form>
          <aside className="forum-guidance">
            <h2>{t("forum.goodReport")}</h2>
            <ol>
              <li>{t("forum.whatYouDid")}</li>
              <li>{t("forum.whatExpected")}</li>
              <li>{t("forum.whatHappened")}</li>
              <li>{t("forum.matchContext")}</li>
            </ol>
            <p>{t("forum.beforePosting")}</p>
          </aside>
        </div>
      )}
    </section>
  );
}

function restore(key?: string): Draft {
  if (!key) return { ...EMPTY };
  try {
    const data = JSON.parse(localStorage.getItem(key) ?? "null") as (Partial<Draft> & { savedAt?: number }) | null;
    if (
      !data ||
      typeof data.savedAt !== "number" ||
      data.savedAt < Date.now() - FORUM_PENDING_IMAGE_RETENTION_MS ||
      !FEEDBACK_KINDS.includes(data.kind as FeedbackKind) ||
      typeof data.summary !== "string" ||
      typeof data.description !== "string" ||
      typeof data.opponentDeck !== "string" ||
      !Array.isArray(data.cardIds) ||
      !data.cardIds.every((card) => typeof card === "string")
    )
      return { ...EMPTY };
    return {
      kind: data.kind as FeedbackKind,
      summary: data.summary.slice(0, MAX_BUG_REPORT_SUMMARY),
      description: data.description.slice(0, MAX_FORUM_BODY),
      opponentDeck: data.opponentDeck.slice(0, MAX_BUG_REPORT_OPPONENT_DECK),
      cardIds: data.cardIds.slice(0, MAX_BUG_REPORT_CARDS),
    };
  } catch {
    return { ...EMPTY };
  }
}
