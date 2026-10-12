import { useTranslation } from "@/i18n/useTranslation";

export function ForumHubNav({
  roadmap = false,
  onDiscussions,
  onRoadmap,
}: {
  roadmap?: boolean;
  onDiscussions: () => void;
  onRoadmap: () => void;
}) {
  const { t } = useTranslation();
  return (
    <nav className="forum-hub-nav" aria-label={t("forum.hubNavigation")}>
      <button aria-current={!roadmap ? "page" : undefined} onClick={onDiscussions}>
        {t("forum.discussions")}
      </button>
      <button aria-current={roadmap ? "page" : undefined} onClick={onRoadmap}>
        {t("forum.roadmap")}
      </button>
    </nav>
  );
}
