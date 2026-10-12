import { useEffect, useState } from "react";
import type { ForumComment } from "@aegis/shared/feedback/forumTypes";
import { MAX_FORUM_BODY } from "@aegis/shared/feedback/forumLimits";
import { ForumEditor } from "@/bugs/ForumEditor";
import { forumClient } from "@/bugs/forumClient";
import { useForumDraftGuard } from "@/bugs/useForumDraftGuard";
import { Alert, Button } from "@/design/primitives";
import { useTranslation } from "@/i18n/useTranslation";

export function ForumReply({
  id,
  accountId,
  onReplied,
}: {
  id: number;
  accountId?: string;
  onReplied: (comment: ForumComment) => void;
}) {
  const { t } = useTranslation();
  const key = accountId ? `aegis.forum.reply:${accountId}:${id}` : undefined;
  const [body, setBody] = useState(() => {
    try {
      return key ? (sessionStorage.getItem(key) ?? "").slice(0, MAX_FORUM_BODY) : "";
    } catch {
      return "";
    }
  });
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  useForumDraftGuard({
    dirty: !!body.trim(),
    busy: saving,
    message: t("forum.leaveDraft"),
  });
  useEffect(() => {
    if (!key) return;
    try {
      if (body) sessionStorage.setItem(key, body);
      else sessionStorage.removeItem(key);
    } catch {}
  }, [body, key]);
  const submit = async () => {
    setSaving(true);
    setFailed(false);
    try {
      const comment = await forumClient.comment({ id: id, draft: { body, imageIds: [] } });
      setBody("");
      onReplied(comment);
    } catch {
      setFailed(true);
    } finally {
      setSaving(false);
    }
  };
  return (
    <form
      className="forum-reply"
      onSubmit={(event) => {
        event.preventDefault();
        if (!saving && body.trim()) void submit();
      }}
    >
      <ForumEditor value={body} onChange={setBody} disabled={saving} label={t("forum.replyLabel")} />
      {failed ? <Alert tone="warning" title={t("forum.saveError")} /> : null}
      <Button type="submit" disabled={saving || !body.trim()}>
        {t("forum.reply")}
      </Button>
    </form>
  );
}
