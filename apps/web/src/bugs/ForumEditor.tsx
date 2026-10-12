import { useId, useRef, useState } from "react";
import { Bold, Italic, List, Heading2 } from "lucide-react";
import { MAX_FORUM_BODY } from "@aegis/shared/feedback/forumLimits";
import { ForumMarkdown } from "@/bugs/ForumMarkdown";
import { useTranslation } from "@/i18n/useTranslation";

type ForumEditorParams = {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  label: string;
};
type FormatParams = { before: string; after?: string };

export function ForumEditor({ value, onChange, disabled = false, label }: ForumEditorParams) {
  const { t } = useTranslation();
  const id = useId();
  const textarea = useRef<HTMLTextAreaElement>(null);
  const [preview, setPreview] = useState(false);
  function format({ before, after = "" }: FormatParams) {
    const control = textarea.current;
    if (!control) return;
    const start = control.selectionStart,
      end = control.selectionEnd;
    const result = value.slice(0, start) + before + value.slice(start, end) + after + value.slice(end);
    if (result.length > MAX_FORUM_BODY) return;
    onChange(result);
    requestAnimationFrame(() => {
      control.focus();
      control.setSelectionRange(start + before.length, end + before.length);
    });
  }
  return (
    <div className="forum-editor">
      <label htmlFor={id}>{label}</label>
      <div className="forum-editor__tabs" role="group" aria-label={t("forum.editorMode")}>
        <button type="button" aria-pressed={!preview} onClick={() => setPreview(false)}>
          {t("forum.write")}
        </button>
        <button type="button" aria-pressed={preview} onClick={() => setPreview(true)}>
          {t("forum.preview")}
        </button>
      </div>
      <div className="forum-editor__toolbar" role="group" aria-label={t("forum.formatting")}>
        {[
          { Icon: Bold, name: t("forum.bold"), before: "**", after: "**" },
          { Icon: Italic, name: t("forum.italic"), before: "*", after: "*" },
          { Icon: Heading2, name: t("forum.heading"), before: "\n## " },
          { Icon: List, name: t("forum.list"), before: "\n1. " },
        ].map(({ Icon, name, before, after }) => (
          <button
            key={name}
            type="button"
            aria-label={name}
            title={name}
            disabled={preview || disabled}
            onClick={() => format({ before, after })}
          >
            <Icon size={18} />
          </button>
        ))}
      </div>
      {preview ? (
        <div className="forum-editor__preview" role="region" aria-label={t("forum.preview")}>
          <ForumMarkdown>{value || t("forum.emptyPreview")}</ForumMarkdown>
        </div>
      ) : (
        <textarea
          ref={textarea}
          id={id}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          maxLength={MAX_FORUM_BODY}
          disabled={disabled}
          rows={12}
        />
      )}
      <p className="forum-editor__count">
        {value.length.toLocaleString()} / {MAX_FORUM_BODY.toLocaleString()}
      </p>
    </div>
  );
}
