/* Card picker for the bug-report dialog: type part of a name or a card number, pick from the
   suggestions, and the chosen cards accumulate as removable chips. */

import { useId, useMemo, useState, type KeyboardEvent } from "react";
import { allCards } from "@aegis/shared";
import { Icons } from "../design/icons";
import { useTranslation } from "../i18n";
import "@/bugs/CardAutocomplete.css";

const MAX_SUGGESTIONS = 8;

type Suggestion = { cardId: string; nameEn: string };

const CATALOG: readonly Suggestion[] = allCards().map((card) => ({ cardId: card.cardId, nameEn: card.nameEn }));

export function searchCards(query: string, selected: readonly string[]): Suggestion[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  const chosen = new Set(selected);
  const matches = CATALOG.filter(
    (card) =>
      !chosen.has(card.cardId) &&
      (card.cardId.toLowerCase().includes(needle) || card.nameEn.toLowerCase().includes(needle)),
  );
  // A card whose id or name starts with the query is what the typist is after; substring hits follow.
  const startsWith = (card: Suggestion) =>
    card.cardId.toLowerCase().startsWith(needle) || card.nameEn.toLowerCase().startsWith(needle) ? 0 : 1;
  return matches
    .sort((a, b) => startsWith(a) - startsWith(b) || a.cardId.localeCompare(b.cardId))
    .slice(0, MAX_SUGGESTIONS);
}

export function CardAutocomplete({
  selected,
  onChange,
  limit,
}: {
  selected: readonly string[];
  onChange: (cardIds: string[]) => void;
  limit: number;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [highlighted, setHighlighted] = useState(0);
  const listId = useId();
  const inputId = useId();
  const atLimit = selected.length >= limit;
  const suggestions = useMemo(() => (atLimit ? [] : searchCards(query, selected)), [atLimit, query, selected]);
  const activeIndex = Math.min(highlighted, Math.max(0, suggestions.length - 1));

  const add = (cardId: string) => {
    onChange([...selected, cardId]);
    setQuery("");
    setHighlighted(0);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (!suggestions.length) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlighted((index) => (index + 1) % suggestions.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlighted((index) => (index - 1 + suggestions.length) % suggestions.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      const picked = suggestions[activeIndex];
      if (picked) add(picked.cardId);
    }
  };

  return (
    <div className="bug-report__cards">
      <label className="aegis-field__label" htmlFor={inputId}>
        {t("bugReport.cardsLabel")}
      </label>
      <div
        className="bug-report__combobox"
        role="combobox"
        aria-expanded={suggestions.length > 0}
        aria-owns={listId}
        aria-haspopup="listbox"
      >
        <input
          id={inputId}
          className="aegis-field__control"
          type="text"
          autoComplete="off"
          value={query}
          disabled={atLimit}
          placeholder={t("bugReport.cardsPlaceholder")}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={suggestions[activeIndex] ? `${listId}-${activeIndex}` : undefined}
          onChange={(event) => {
            setQuery(event.target.value);
            setHighlighted(0);
          }}
          onKeyDown={handleKeyDown}
        />
        {suggestions.length ? (
          <div className="bug-report__suggestions" id={listId} role="listbox" aria-label={t("bugReport.cardsLabel")}>
            {suggestions.map((card, index) => (
              <button
                key={card.cardId}
                id={`${listId}-${index}`}
                type="button"
                role="option"
                aria-selected={index === activeIndex}
                className="bug-report__suggestion"
                data-active={index === activeIndex ? true : undefined}
                onMouseEnter={() => setHighlighted(index)}
                onClick={() => add(card.cardId)}
              >
                <strong>{card.nameEn}</strong>
                <span>{card.cardId}</span>
              </button>
            ))}
          </div>
        ) : null}
        {query.trim() && !suggestions.length && !atLimit ? (
          <p className="bug-report__hint" role="status">
            {t("bugReport.noResults")}
          </p>
        ) : null}
      </div>

      <p className="bug-report__hint">
        {atLimit ? t("bugReport.cardLimitReached", { limit }) : t("bugReport.cardsHint")}
      </p>

      {selected.length ? (
        <ul className="bug-report__chips">
          {selected.map((cardId) => (
            <li key={cardId}>
              <span className="bug-report__chip">
                {cardId}
                <button
                  type="button"
                  aria-label={t("bugReport.removeCard", { card: cardId })}
                  onClick={() => onChange(selected.filter((id) => id !== cardId))}
                >
                  <Icons.Ban size={12} />
                </button>
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
