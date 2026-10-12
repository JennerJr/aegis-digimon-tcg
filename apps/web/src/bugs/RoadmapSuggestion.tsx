import type { RoadmapEntry } from "@aegis/shared/feedback/roadmapTypes";
import { useTranslation } from "@/i18n/useTranslation";

type RoadmapSuggestionParams = { entry: RoadmapEntry };

export function RoadmapSuggestion({ entry }: RoadmapSuggestionParams) {
  const { t, locale } = useTranslation();
  const language = locale === "pt-BR" || locale === "es" ? locale : "en";
  const title = entry.title[language];
  return (
    <article className="forum-roadmap-suggestion">
      <h3>{title}</h3>
      <p>{entry.description[language]}</p>
      <div className="forum-roadmap-sources">
        {entry.websiteRequests > 0 ? <span>{t("forum.websiteFeedback")}</span> : null}
        {entry.discordUrls.map((url, index) => (
          <a
            key={url}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`${t("forum.discordSuggestion")} ${index + 1}: ${title}`}
          >
            {t("forum.discordSuggestion")}
            {entry.discordUrls.length > 1 ? ` ${index + 1}` : ""}
          </a>
        ))}
      </div>
    </article>
  );
}
