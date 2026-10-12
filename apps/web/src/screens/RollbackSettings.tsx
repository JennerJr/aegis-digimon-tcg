import { useId } from "react";
import { useTranslation } from "@/i18n/useTranslation";
import "@/screens/matchTimerSettings.css";

export function RollbackSettings({ enabled, onChange }: { enabled: boolean; onChange: (enabled: boolean) => void }) {
  const { t } = useTranslation();
  const id = useId();
  return (
    <div className="lobby-timer-settings">
      <div className="lobby-timer-settings__header">
        <span id={`${id}-label`} className="lobby-timer-settings__label">
          {t("rollback.allow")}
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-labelledby={`${id}-label`}
          aria-describedby={`${id}-hint`}
          className="lobby-timer-switch"
          onClick={() => onChange(!enabled)}
        >
          <span />
        </button>
      </div>
      <p id={`${id}-hint`} className="lobby-timer-settings__hint">
        {t("rollback.optionHint")}
      </p>
    </div>
  );
}
