import { CommunityHubNav } from "@/community/CommunityHubNav";
import { CommunityHubSection } from "@/community/CommunityHubSection";
import "@/bugs/forum.css";
import { useEffect, useState } from "react";
import { CardColor, type CommunityDeckSummary, type CommunityPeriod, type CommunitySort } from "@aegis/shared";
import { communityApi } from "../../community/client";
import { communityTileListing } from "../../community/communityDeckListing";
import { Button, ColorDot, IconButton } from "../../design/primitives";
import { Icons } from "../../design/icons";
import { useTranslation, type TranslationKey } from "../../i18n";
import { DeckListCard } from "../DeckListCard";
import { LikeButton } from "./LikeButton";

const SEARCH_DELAY_MS = 300;
const COLORS = Object.values(CardColor).filter((color) => color !== CardColor.None);
const SORTS: { key: CommunitySort; label: TranslationKey }[] = [
  { key: "top", label: "community.sortTop" },
  { key: "new", label: "community.sortNew" },
];
const PERIODS: { key: CommunityPeriod; label: TranslationKey }[] = [
  { key: "week", label: "community.periodWeek" },
  { key: "month", label: "community.periodMonth" },
  { key: "all", label: "community.periodAll" },
];

type Results =
  | { status: "loading" }
  | { status: "failed" }
  | { status: "ready"; decks: CommunityDeckSummary[]; hasMore: boolean; page: number; loadingMore: boolean };

export function CommunityBrowse({
  signedIn,
  accountId,
  onOpenDeck,
  onPlay,
  onCopy,
  onDiscussions,
  onRoadmap,
}: {
  signedIn: boolean;
  accountId: string | undefined;
  onOpenDeck: (id: string) => void;
  onPlay: (id: string) => void;
  onCopy: (id: string) => void;
  onDiscussions?: () => void;
  onRoadmap?: () => void;
}) {
  const { t } = useTranslation();
  const [sort, setSort] = useState<CommunitySort>("top");
  const [period, setPeriod] = useState<CommunityPeriod>("week");
  const [colors, setColors] = useState<string[]>([]);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<Results>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput), SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    let current = true;
    setResults({ status: "loading" });
    communityApi
      .browse({ sort, period, colors, search, page: 0 })
      .then((page) => {
        if (current) setResults({ status: "ready", ...page, page: 0, loadingMore: false });
      })
      .catch(() => {
        if (current) setResults({ status: "failed" });
      });
    return () => {
      current = false;
    };
  }, [sort, period, colors, search, attempt]);

  const loadMore = async () => {
    if (results.status !== "ready" || results.loadingMore) return;
    const page = results.page + 1;
    setResults({ ...results, loadingMore: true });
    try {
      const next = await communityApi.browse({ sort, period, colors, search, page });
      setResults({
        status: "ready",
        decks: [...results.decks, ...next.decks],
        hasMore: next.hasMore,
        page,
        loadingMore: false,
      });
    } catch {
      setResults({ ...results, loadingMore: false });
    }
  };

  const toggleColor = (color: string) =>
    setColors((current) => (current.includes(color) ? current.filter((c) => c !== color) : [...current, color]));

  return (
    <section className="forum-page community-decks-hub" aria-labelledby="community-hub-title">
      <header className="forum-page-heading">
        <div>
          <p className="forum-eyebrow">{t("forum.eyebrow")}</p>
          <h1 id="community-hub-title" className="aegis-page-title">
            {t("forum.title")}
          </h1>
          <p>{t("forum.subtitle")}</p>
        </div>
      </header>
      <CommunityHubNav section={CommunityHubSection.DECKS.value} onDiscussions={onDiscussions} onRoadmap={onRoadmap} />
      <div className="forum-topic-list community-decks-content">
        <label className="community-search">
          <Icons.Search size={16} />
          <span className="aegis-sr-only">{t("community.search")}</span>
          <input
            type="search"
            value={searchInput}
            placeholder={t("community.search")}
            maxLength={60}
            onChange={(event) => setSearchInput(event.target.value)}
          />
        </label>
        <div className="community-toolbar">
          <div className="community-segmented" role="group" aria-label={t("community.sortLabel")}>
            {SORTS.map((option) => (
              <button
                key={option.key}
                type="button"
                className={sort === option.key ? "is-selected" : undefined}
                aria-pressed={sort === option.key}
                onClick={() => setSort(option.key)}
              >
                {t(option.label)}
              </button>
            ))}
          </div>
          {sort === "top" ? (
            <div className="community-segmented" role="group" aria-label={t("community.periodLabel")}>
              {PERIODS.map((option) => (
                <button
                  key={option.key}
                  type="button"
                  className={period === option.key ? "is-selected" : undefined}
                  aria-pressed={period === option.key}
                  onClick={() => setPeriod(option.key)}
                >
                  {t(option.label)}
                </button>
              ))}
            </div>
          ) : null}
          <div className="community-colors" role="group" aria-label={t("community.colorsLabel")}>
            {COLORS.map((color) => (
              <button
                key={color}
                type="button"
                className={colors.includes(color) ? "is-selected" : undefined}
                aria-pressed={colors.includes(color)}
                onClick={() => toggleColor(color)}
              >
                <ColorDot color={color} size={10} />
                {color}
              </button>
            ))}
          </div>
        </div>

        <section className="community-results" aria-busy={results.status === "loading"}>
          {results.status === "loading" ? (
            <p className="community-empty" role="status">
              {t("common.loading")}
            </p>
          ) : results.status === "failed" ? (
            <div className="community-empty" role="alert">
              <p>{t("community.loadError")}</p>
              <Button size="sm" variant="secondary" onClick={() => setAttempt((n) => n + 1)}>
                {t("community.retry")}
              </Button>
            </div>
          ) : results.decks.length === 0 ? (
            <div className="community-empty" role="status">
              <p>{t("community.empty")}</p>
              <p>{t("community.emptyHint")}</p>
            </div>
          ) : (
            <>
              <div className="community-grid">
                {results.decks.map((deck) => (
                  <DeckListCard
                    key={deck.id}
                    deck={communityTileListing(deck)}
                    active={false}
                    onSelect={() => onOpenDeck(deck.id)}
                    subtitle={t("community.byAuthor", { name: deck.author.displayName })}
                    actions={
                      <>
                        <span className="community-tile__colors" aria-hidden="true">
                          {deck.colors.map((color) => (
                            <ColorDot key={color} color={color} size={10} />
                          ))}
                        </span>
                        {deck.legal ? null : <span className="community-tile__illegal">{t("community.notLegal")}</span>}
                        <LikeButton
                          key={`${deck.id}:${deck.likeCount}:${deck.likedByMe}`}
                          deck={deck}
                          signedIn={signedIn}
                          ownDeck={deck.author.id === accountId}
                        />
                        <span className="community-tile__spacer" />
                        <IconButton
                          size="sm"
                          variant="secondary"
                          label={t("community.copy")}
                          title={t("community.copy")}
                          onClick={() => onCopy(deck.id)}
                        >
                          <Icons.Copy size={16} />
                        </IconButton>
                        <IconButton
                          size="sm"
                          label={t("common.play")}
                          title={t("common.play")}
                          disabled={!deck.legal}
                          onClick={() => onPlay(deck.id)}
                        >
                          <Icons.Swords size={16} />
                        </IconButton>
                      </>
                    }
                  />
                ))}
              </div>
              {results.hasMore ? (
                <div className="community-more">
                  <Button variant="secondary" disabled={results.loadingMore} onClick={loadMore}>
                    {results.loadingMore ? t("common.loading") : t("community.loadMore")}
                  </Button>
                </div>
              ) : null}
            </>
          )}
        </section>
      </div>
    </section>
  );
}
