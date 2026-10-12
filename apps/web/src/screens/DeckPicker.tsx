import { deckLegality } from "@aegis/shared";
/* Unified battle-deck picker for the lobby. One search box, one collection
   filter and one segmented owner filter cover both the player's own decks and
   the famous presets, so a query like "Jupitermon" finds a preset even when its
   collection group is collapsed. */

import { memo, useMemo, useState } from "react";
import { getCardDefinition } from "@aegis/shared";
import { Button, Field, IconButton } from "../design/primitives";
import { SectionHeading } from "../design/surfaces";
import { Icons } from "../design/icons";
import { COLORS, colorKey, type ColorName } from "../design/theme";
import { FAMOUS_DECK_GROUPS, type DeckListing, type FamousDeckListingGroup } from "../game/decks";
import { useTranslation } from "../i18n";
import { DeckListCard } from "./DeckListCard";
import { LobbyCommunityDecks } from "./community/LobbyCommunityDecks";
import "./deckPicker.css";

export type DeckFilter = "all" | "mine" | "famous" | "community";

export interface OwnDeckEntry {
  deck: DeckListing;
  legal: boolean;
}

const ALL_COLLECTIONS = "";

const colorCache = new WeakMap<DeckListing, ColorName[]>();

/** The deck's two most common card colors, most common first. */
export function deckColors(deck: DeckListing): ColorName[] {
  const cached = colorCache.get(deck);
  if (cached) return cached;
  const counts = new Map<ColorName, number>();
  for (const cardId of deck.mainDeck) {
    for (const color of getCardDefinition(cardId)?.colors ?? []) {
      const key = colorKey(color);
      if (key !== "Neutral") counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  const colors = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([color]) => color);
  const result = colors.length > 0 ? colors : [deck.color];
  colorCache.set(deck, result);
  return result;
}

export function DeckColorDots({ deck, className }: { deck: DeckListing; className?: string }) {
  return (
    <span className={`deck-color-dots${className ? ` ${className}` : ""}`} aria-hidden="true">
      {deckColors(deck).map((color) => (
        <span key={color} className="deck-color-dots__dot" style={{ background: COLORS[color].base }} />
      ))}
    </span>
  );
}

function matchesQuery(deck: DeckListing, query: string, collection?: string): boolean {
  if (query === "") return true;
  const haystack = [deck.name, deck.color, deck.blurb, collection ?? ""].join(" ").toLocaleLowerCase();
  return haystack.includes(query);
}

function SetCover({ collection }: { collection: string }) {
  const [missing, setMissing] = useState(false);
  if (missing) return <span className="deck-picker__set-fallback">{collection.slice(0, 2)}</span>;
  return (
    <img
      className="deck-picker__set"
      src={`/sets/${collection}.jpg`}
      alt=""
      aria-hidden="true"
      onError={() => setMissing(true)}
    />
  );
}

function DeckPickerView({
  ownDecks,
  format,
  activeDeckId,
  randomSelected,
  randomPoolSize,
  onSelectRandom,
  onSelectDeck,
  onCopyDeck,
  onViewDeck,
  onEditDeck,
  onBuildDeck,
  onPickCommunityDeck,
  onOpenCommunityDeck,
  accountId,
}: {
  ownDecks: OwnDeckEntry[];
  format?: import("@aegis/shared").DeckFormat;
  activeDeckId: string;
  randomSelected: boolean;
  randomPoolSize: number | undefined;
  onSelectRandom: () => void;
  onSelectDeck: (id: string) => void;
  onCopyDeck: (deck: DeckListing) => void;
  onViewDeck: (deck: DeckListing) => void;
  onEditDeck: (deck: DeckListing) => void;
  onBuildDeck: () => void;
  onPickCommunityDeck: (id: string) => void;
  onOpenCommunityDeck: (id: string) => void;
  accountId: string | undefined;
}) {
  const { t } = useTranslation();
  const deckCount = (count: number) => t(count === 1 ? "lobby.deckCountOne" : "lobby.deckCount", { count });
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<DeckFilter>("all");
  const [collection, setCollection] = useState(ALL_COLLECTIONS);
  const [ownDecksOpen, setOwnDecksOpen] = useState(true);
  const [openCollections, setOpenCollections] = useState<ReadonlySet<string>>(
    () => new Set(FAMOUS_DECK_GROUPS.slice(0, 1).map((group) => group.collection)),
  );
  const query = search.trim().toLocaleLowerCase();
  const searching = query !== "";
  // The collection filter only narrows famous presets, so "Mine" and "Community" ignore it.
  const collectionApplies = filter !== "mine" && filter !== "community";
  const collectionChosen = collectionApplies && collection !== ALL_COLLECTIONS;

  const visibleOwnDecks = useMemo(() => ownDecks.filter(({ deck }) => matchesQuery(deck, query)), [ownDecks, query]);
  const visibleGroups = useMemo<FamousDeckListingGroup[]>(
    () =>
      FAMOUS_DECK_GROUPS.filter((group) => collection === ALL_COLLECTIONS || group.collection === collection)
        .map((group) => ({
          collection: group.collection,
          decks: group.decks.filter((deck) => matchesQuery(deck, query, group.collection)),
        }))
        .filter((group) => group.decks.length > 0),
    [collection, query],
  );
  const famousTotal = FAMOUS_DECK_GROUPS.reduce((sum, group) => sum + group.decks.length, 0);
  const visibleFamousCount = visibleGroups.reduce((sum, group) => sum + group.decks.length, 0);
  // A chosen collection narrows the list to that collection's presets alone.
  const showCommunity = filter === "community";
  const showOwn = filter !== "famous" && !showCommunity && !collectionChosen;
  const showFamous = filter !== "mine" && !showCommunity;
  const visibleCount = (showOwn ? visibleOwnDecks.length : 0) + (showFamous ? visibleFamousCount : 0);

  // Community decks live on the server and grow every day, so their filter carries no count.
  const filters: { key: DeckFilter; label: string; count?: number }[] = [
    { key: "all", label: t("lobby.filterAll"), count: ownDecks.length + famousTotal },
    { key: "mine", label: t("lobby.filterMine"), count: ownDecks.length },
    { key: "famous", label: t("lobby.filterFamous"), count: famousTotal },
    { key: "community", label: t("community.lobbyFilter") },
  ];

  return (
    <section className="deck-picker" aria-labelledby="deck-picker-title">
      <header className="deck-picker__header">
        <SectionHeading id="deck-picker-title" title={t("lobby.pickDeck")} />
        <div className="deck-picker__intro">
          <p>{t("lobby.pickDeckHint")}</p>
          <Button
            className="deck-picker__random-action"
            variant={randomSelected ? "primary" : "secondary"}
            icon={randomSelected ? Icons.Check : Icons.Dices}
            disabled={randomPoolSize === 0}
            aria-pressed={randomSelected}
            onClick={onSelectRandom}
          >
            {t(randomSelected ? "lobby.randomSelected" : "lobby.randomAction")}
          </Button>
        </div>
      </header>

      <div className="deck-picker__toolbar">
        <label className="deck-picker__collection-filter">
          <span className="aegis-sr-only">{t("redesign.play.collection")}</span>
          <select
            value={collection}
            disabled={!collectionApplies}
            onChange={(event) => setCollection(event.target.value)}
          >
            <option value={ALL_COLLECTIONS}>{t("redesign.play.allCollections")}</option>
            {FAMOUS_DECK_GROUPS.map((group) => (
              <option key={group.collection} value={group.collection}>
                {t("redesign.play.collectionOption", { collection: group.collection, count: group.decks.length })}
              </option>
            ))}
          </select>
          <Icons.ChevronDown className="deck-picker__select-chevron" size={16} />
        </label>
        <Field
          className="deck-picker__search"
          label={t("lobby.searchDecks")}
          name="deckSearch"
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t("lobby.searchDecksPlaceholder")}
        />
        <div className="deck-picker__filters" role="group" aria-label={t("lobby.filterLabel")}>
          {filters.map((option) => (
            <button
              type="button"
              key={option.key}
              className={filter === option.key ? "is-selected" : undefined}
              aria-pressed={filter === option.key}
              onClick={() => setFilter(option.key)}
            >
              {option.label}
              {option.count === undefined ? null : <span className="deck-picker__filter-count">{option.count}</span>}
            </button>
          ))}
        </div>
        {showCommunity ? null : (
          <span className="deck-picker__result-count" role="status">
            {deckCount(visibleCount)}
          </span>
        )}
      </div>

      {showCommunity ? (
        <LobbyCommunityDecks
          search={search.trim()}
          activeDeckId={randomSelected ? "" : activeDeckId}
          onPick={onPickCommunityDeck}
          onOpen={onOpenCommunityDeck}
          accountId={accountId}
        />
      ) : null}

      {showOwn ? (
        <section className="deck-picker__group deck-picker__own" aria-label={t("lobby.yourDecks")}>
          <details open={searching || ownDecksOpen}>
            <summary
              className="deck-picker__summary"
              onClick={(event) => {
                event.preventDefault();
                setOwnDecksOpen((current) => !current);
              }}
            >
              <h3 className="deck-picker__group-title">{t("lobby.yourDecks")}</h3>
              <span className="deck-picker__collection-count">{ownDecks.length}</span>
              <Icons.ChevronDown className="deck-picker__chevron" size={16} />
            </summary>
            {ownDecks.length === 0 ? (
              <p className="deck-picker__empty">
                {t("lobby.noDecks")}{" "}
                <button type="button" className="aegis-text-action" onClick={onBuildDeck}>
                  {t("lobby.noDecksLink")}
                </button>
                .
              </p>
            ) : visibleOwnDecks.length === 0 ? (
              <p className="deck-picker__empty">{t("lobby.noSearchResults")}</p>
            ) : (
              <div className="lobby-decks">
                {visibleOwnDecks.map(({ deck, legal }) => (
                  <DeckListCard
                    format={format}
                    key={deck.id}
                    deck={deck}
                    active={!randomSelected && deck.id === activeDeckId}
                    disabled={!legal}
                    onSelect={() => onSelectDeck(deck.id)}
                    actions={
                      <>
                        <DeckColorDots deck={deck} />
                        <IconButton
                          size="sm"
                          variant="secondary"
                          label={t("common.edit")}
                          title={t("common.edit")}
                          onClick={() => onEditDeck(deck)}
                        >
                          <Icons.FileText size={16} />
                        </IconButton>
                      </>
                    }
                  />
                ))}
              </div>
            )}
          </details>
        </section>
      ) : null}

      {showFamous ? (
        <section className="deck-picker__group" aria-labelledby="deck-picker-famous-title">
          <div className="deck-picker__group-heading">
            <h3 className="deck-picker__famous-title" id="deck-picker-famous-title">
              {t("lobby.famousDecks")}
            </h3>
            <p>{t("lobby.famousDecksDesc")}</p>
          </div>
          {visibleGroups.length === 0 ? <p className="deck-picker__empty">{t("lobby.noSearchResults")}</p> : null}
          {visibleGroups.map((group) => {
            const headingId = `famous-${group.collection.toLowerCase()}`;
            const open = searching || collectionChosen || openCollections.has(group.collection);
            return (
              <section className="deck-picker__collection" aria-labelledby={headingId} key={group.collection}>
                <details open={open}>
                  <summary
                    className="deck-picker__summary"
                    onClick={(event) => {
                      event.preventDefault();
                      setOpenCollections((current) => {
                        const next = new Set(current);
                        if (next.has(group.collection)) next.delete(group.collection);
                        else next.add(group.collection);
                        return next;
                      });
                    }}
                  >
                    <SetCover collection={group.collection} />
                    <h4 id={headingId} className="deck-picker__group-title">
                      {group.collection}
                    </h4>
                    <span className="deck-picker__collection-count">{group.decks.length}</span>
                    <Icons.ChevronDown className="deck-picker__chevron" size={16} />
                  </summary>
                  {/* Closed groups skip their cards: the picker holds every preset. */}
                  {open ? (
                    <div className="lobby-decks">
                      {group.decks.map((deck) => {
                        const active = !randomSelected && deck.id === activeDeckId;
                        return (
                          <DeckListCard
                            format={format}
                            key={deck.id}
                            deck={deck}
                            active={active}
                            disabled={!deckLegality(deck, { format }).legal}
                            onSelect={() => onSelectDeck(deck.id)}
                            actions={
                              <>
                                <DeckColorDots deck={deck} />
                                {active ? (
                                  <IconButton
                                    size="sm"
                                    variant="secondary"
                                    label={t("lobby.copyPreset")}
                                    title={t("lobby.copyPreset")}
                                    onClick={() => onCopyDeck(deck)}
                                  >
                                    <Icons.Copy size={16} />
                                  </IconButton>
                                ) : (
                                  <IconButton
                                    size="sm"
                                    variant="secondary"
                                    label={t("lobby.useDeck")}
                                    title={t("lobby.useDeck")}
                                    onClick={() => onSelectDeck(deck.id)}
                                  >
                                    <Icons.Swords size={16} />
                                  </IconButton>
                                )}
                                <IconButton
                                  size="sm"
                                  variant="secondary"
                                  label={t("lobby.viewList")}
                                  title={t("lobby.viewList")}
                                  onClick={() => onViewDeck(deck)}
                                >
                                  <Icons.Eye size={16} />
                                </IconButton>
                              </>
                            }
                          />
                        );
                      })}
                    </div>
                  ) : null}
                </details>
              </section>
            );
          })}
        </section>
      ) : null}
    </section>
  );
}

/* Memoized: the lobby re-renders on every mode or dialog change, and this list
   holds every famous preset. */
export const DeckPicker = memo(DeckPickerView);
