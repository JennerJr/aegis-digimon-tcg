import { CommunityHubSection } from "@/community/CommunityHubSection";
import { useTranslation } from "@/i18n/useTranslation";
import "@/community/communityHub.css";

type CommunityHubNavParams = {
  section: CommunityHubSection;
  onDiscussions?: () => void;
  onRoadmap?: () => void;
  onDecks?: () => void;
};

export function CommunityHubNav({ section, onDiscussions, onRoadmap, onDecks }: CommunityHubNavParams) {
  const { t } = useTranslation();
  return (
    <nav className="community-hub-nav" aria-label={t("forum.hubNavigation")}>
      <button
        aria-current={section === CommunityHubSection.DISCUSSIONS.value ? "page" : undefined}
        onClick={onDiscussions ?? (() => location.assign("/feedback"))}
      >
        {t("forum.discussions")}
      </button>
      <button
        aria-current={section === CommunityHubSection.ROADMAP.value ? "page" : undefined}
        onClick={onRoadmap ?? (() => location.assign("/feedback/roadmap"))}
      >
        {t("forum.roadmap")}
      </button>
      <button
        aria-current={section === CommunityHubSection.DECKS.value ? "page" : undefined}
        onClick={onDecks ?? (() => location.assign("/community"))}
      >
        {t("community.title")}
      </button>
    </nav>
  );
}
