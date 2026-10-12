/* Selectable starter decks for the lobby. These mirror the api's own legal-shaped
   test decks (apps/api/src/engine/testDecks.ts) by card id — the web package may
   not import @aegis/api, so the lists are restated here. Both are 50 main + 5 egg,
   built from real BT1 cards so a joined match can actually be dealt and played. */

import {
  allCards,
  resolveCardArt,
  famousDeckGroups,
  getCardDefinition,
  type CardDefinition,
  type DeckFormat,
  formatCopyLimit,
  isDeckFormat,
  type FamousDeck,
} from "@aegis/shared";
import { colorKey, kindOf, type ColorName } from "../design/theme";
import type { Translate, TranslationKey } from "../i18n";

interface CardEntry {
  cardId: string;
  count: number;
}

function expand(entries: readonly CardEntry[]): string[] {
  const cards: string[] = [];
  for (const { cardId, count } of entries) {
    for (let copy = 0; copy < count; copy += 1) cards.push(cardId);
  }
  return cards;
}

const RED_MAIN: readonly CardEntry[] = [
  { cardId: "BT1-009", count: 4 },
  { cardId: "BT1-010", count: 4 },
  { cardId: "BT1-011", count: 4 },
  { cardId: "BT1-012", count: 4 },
  { cardId: "BT1-013", count: 4 },
  { cardId: "BT1-014", count: 4 },
  { cardId: "BT1-015", count: 4 },
  { cardId: "BT1-016", count: 4 },
  { cardId: "BT1-020", count: 4 },
  { cardId: "BT1-021", count: 4 },
  { cardId: "BT1-025", count: 2 },
  { cardId: "BT1-017", count: 3 },
  { cardId: "BT1-085", count: 4 },
  { cardId: "BT1-090", count: 1 },
];
const RED_EGGS: readonly CardEntry[] = [
  { cardId: "BT1-001", count: 3 },
  { cardId: "BT1-002", count: 2 },
];

const BLUE_MAIN: readonly CardEntry[] = [
  { cardId: "BT1-027", count: 4 },
  { cardId: "BT1-028", count: 4 },
  { cardId: "BT1-029", count: 4 },
  { cardId: "BT1-030", count: 4 },
  { cardId: "BT1-031", count: 4 },
  { cardId: "BT1-032", count: 4 },
  { cardId: "BT1-033", count: 4 },
  { cardId: "BT1-034", count: 4 },
  { cardId: "BT1-038", count: 4 },
  { cardId: "BT1-039", count: 4 },
  { cardId: "BT1-043", count: 2 },
  { cardId: "BT1-086", count: 4 },
  { cardId: "BT1-096", count: 4 },
];
const BLUE_EGGS: readonly CardEntry[] = [
  { cardId: "BT1-003", count: 3 },
  { cardId: "BT1-004", count: 2 },
];

export interface DeckListing {
  id: string;
  name: string;
  color: ColorName;
  blurb: string;
  mainDeck: string[];
  eggDeck: string[];
  mainDeckArts?: string[];
  eggDeckArts?: string[];
  coverCardId?: string;
  /** Epoch milliseconds of the last save; absent on decks saved before it was recorded. */
  updatedAt?: number;
  /** This deck's card sleeve; absent means the global sleeve from Settings. */
  sleeveId?: string;
  /** This deck's Digi-Egg sleeve; absent means the global egg sleeve from Settings. */
  eggSleeveId?: string;
  format?: DeckFormat;
  community?: import("@aegis/shared/decks/UsedDeck").UsedDeck["community"];
}

export interface FamousDeckListingGroup {
  collection: string;
  decks: readonly DeckListing[];
}

function exceedsStandardCopyLimits(cards: readonly string[]): boolean {
  const counts = new Map<string, number>();
  for (const cardId of cards) counts.set(cardId, (counts.get(cardId) ?? 0) + 1);
  return [...counts].some(([cardId, count]) => count > formatCopyLimit(cardId, "standard"));
}

/** A preset that later restrictions made illegal stays playable under its anchor set's historical rules. */
function famousDeckFormat(deck: FamousDeck): DeckFormat | undefined {
  const cards = [...deck.decklist.mainDeck, ...deck.decklist.eggDeck];
  if (!exceedsStandardCopyLimits(cards) || !isDeckFormat(deck.anchorProduct)) return undefined;
  return deck.anchorProduct;
}

function famousDeckListing(deck: FamousDeck): DeckListing {
  const format = famousDeckFormat(deck);
  const coverCardId = [...deck.decklist.mainDeck]
    .reverse()
    .find((cardId) => getCardDefinition(cardId)?.level !== undefined);
  return {
    id: deck.deckId,
    name: deck.archetype,
    color: colorKey(deck.colors[0]) as ColorName,
    blurb: `${deck.archetype} · ${deck.block}`,
    mainDeck: [...deck.decklist.mainDeck],
    eggDeck: [...deck.decklist.eggDeck],
    coverCardId,
    ...(format ? { format } : {}),
  };
}

/** Immutable presets available under the operational card-pool cutoff. */
export const FAMOUS_DECK_GROUPS: readonly FamousDeckListingGroup[] = Object.freeze(
  famousDeckGroups().map((group) =>
    Object.freeze({ collection: group.collection, decks: Object.freeze(group.decks.map(famousDeckListing)) }),
  ),
);

export const FAMOUS_DECKS: readonly DeckListing[] = Object.freeze(FAMOUS_DECK_GROUPS.flatMap((group) => group.decks));

/** Personal decks followed by the immutable presets available for selection. */
export function selectableDecks(personalDecks: readonly DeckListing[]): DeckListing[] {
  return [...personalDecks, ...FAMOUS_DECKS];
}

/** Creates an editable personal copy without mutating or shadowing the preset. */
export function copyDeckPreset(preset: DeckListing, personalDecks: readonly DeckListing[]): DeckListing {
  const baseId = `copy-${preset.id}`;
  let id = baseId;
  let copy = 2;
  while (personalDecks.some((deck) => deck.id === id)) {
    id = `${baseId}-${copy}`;
    copy += 1;
  }
  return {
    ...preset,
    id,
    name: `${preset.name} (copy)`,
    mainDeck: [...preset.mainDeck],
    eggDeck: [...preset.eggDeck],
    mainDeckArts: preset.mainDeckArts?.slice(),
    eggDeckArts: preset.eggDeckArts?.slice(),
  };
}

/** Deckable cards only — drop synthetic tokens and zero-copy entries. */
export function isDeckable(def: CardDefinition): boolean {
  return !def.isToken && def.maxCountInDeck > 0;
}

/** The cards a player can actually browse and build with. */
export function activeCollectionCards(): CardDefinition[] {
  return allCards().filter(isDeckable);
}

/** Drops ids the card registry no longer knows, so stale storage cannot break a deck. */
export function filterDeckToKnownCards(deck: DeckListing): DeckListing {
  const isKnown = (cardId: string): boolean => getCardDefinition(cardId) !== undefined;
  const mainIndices = deck.mainDeck.flatMap((id, i) => (isKnown(id) ? [i] : []));
  const eggIndices = deck.eggDeck.flatMap((id, i) => (isKnown(id) ? [i] : []));
  const mainDeck = mainIndices.map((i) => deck.mainDeck[i]!);
  const eggDeck = eggIndices.map((i) => deck.eggDeck[i]!);
  const mainDeckArts =
    deck.mainDeckArts && mainIndices.map((i) => resolveCardArt(deck.mainDeck[i]!, deck.mainDeckArts?.[i]).artId);
  const eggDeckArts =
    deck.eggDeckArts && eggIndices.map((i) => resolveCardArt(deck.eggDeck[i]!, deck.eggDeckArts?.[i]).artId);
  const coverCardId = deck.coverCardId && isKnown(deck.coverCardId) ? deck.coverCardId : undefined;
  return { ...deck, mainDeck, eggDeck, mainDeckArts, eggDeckArts, coverCardId };
}

/** Picks a random unique card from the main deck to use as the deck cover. */
export function randomCoverCard(mainDeck: readonly string[]): string | undefined {
  const unique = [...new Set(mainDeck)];
  if (unique.length === 0) return undefined;
  return unique[Math.floor(Math.random() * unique.length)];
}

/**
 * Returns the card to display as the deck cover. Uses the explicit choice when
 * set, otherwise falls back to the last unique card in the main deck (which by
 * insertion order is typically the highest-cost card in a sorted list).
 */
export function displayCoverCard(deck: DeckListing): string | undefined {
  if (deck.coverCardId) return deck.coverCardId;
  return [...new Set(deck.mainDeck)].at(-1);
}

export const STARTER_IDS: ReadonlySet<string> = new Set(["scarlet-roar", "tidewatch"]);

export const DECKS: DeckListing[] = [
  {
    id: "scarlet-roar",
    name: "Scarlet Roar",
    color: "Red",
    blurb: "deck.blurbStarterRed",
    mainDeck: expand(RED_MAIN),
    eggDeck: expand(RED_EGGS),
  },
  {
    id: "tidewatch",
    name: "Tidewatch",
    color: "Blue",
    blurb: "deck.blurbStarterBlue",
    mainDeck: expand(BLUE_MAIN),
    eggDeck: expand(BLUE_EGGS),
  },
];

/* Blurbs are persisted with decks, so older saves still carry the literal pt-BR
   sentences these keys replaced. Both spellings resolve to the same translation;
   anything else (famous-deck "archetype · block" lines) passes through as-is. */
const BLURB_KEYS: Record<string, TranslationKey> = {
  "deck.blurbSaved": "deck.blurbSaved",
  "deck.blurbStarterRed": "deck.blurbStarterRed",
  "deck.blurbStarterBlue": "deck.blurbStarterBlue",
  "deck.blurbNew": "deck.blurbNew",
  "Salvo na sua conta": "deck.blurbSaved",
  "Agressivo vermelho de BT1 — ocupe a mesa e avance na segurança com Greymon e WarGreymon.": "deck.blurbStarterRed",
  "Controle azul de BT1 — faça trocas eficientes e prepare a chegada de SaberLeomon.": "deck.blurbStarterBlue",
  "Um deck novo, pronto para você montar.": "deck.blurbNew",
};

export function deckBlurbLabel(t: Translate, blurb: string): string {
  const key = BLURB_KEYS[blurb];
  return key ? t(key) : blurb;
}

export function deckById(decks: readonly DeckListing[], id: string): DeckListing | undefined {
  return decks.find((d) => d.id === id) ?? decks[0];
}

/** The most common (non-neutral) color across a card list — a deck's accent. */
export function dominantColor(cardIds: readonly string[], fallback: ColorName = "Blue"): ColorName {
  const tally = new Map<ColorName, number>();
  for (const id of cardIds) {
    const def = getCardDefinition(id);
    if (!def) continue;
    for (const col of def.colors) {
      const key = colorKey(col);
      if (key === "Neutral") continue;
      tally.set(key, (tally.get(key) ?? 0) + 1);
    }
  }
  let best = fallback;
  let bestCount = 0;
  for (const [key, count] of tally) {
    if (count > bestCount) {
      best = key;
      bestCount = count;
    }
  }
  return best;
}

/** Insert or replace a deck by id, preserving order. */
export function upsertDeck(decks: readonly DeckListing[], deck: DeckListing): DeckListing[] {
  const index = decks.findIndex((d) => d.id === deck.id);
  if (index === -1) return [...decks, deck];
  const next = decks.slice();
  next[index] = deck;
  return next;
}

/** Drop a deck by id, preserving order. */
export function removeDeck(decks: readonly DeckListing[], id: string): DeckListing[] {
  return decks.filter((d) => d.id !== id);
}

/** A fresh, empty deck with an id unique among `existing`. */
export function createBlankDeck(
  existing: readonly DeckListing[],
  color: ColorName = "Blue",
  name = "Novo deck",
): DeckListing {
  let n = existing.length + 1;
  while (existing.some((d) => d.id === `custom-${n}`)) n += 1;
  return {
    id: `custom-${n}`,
    name,
    color,
    blurb: "deck.blurbNew",
    mainDeck: [],
    eggDeck: [],
  };
}

/** A short cost-curve summary (count of cards per play cost bucket) for the lobby. */
export function deckCurve(deck: DeckListing): { cost: number; count: number }[] {
  const buckets = new Map<number, number>();
  for (const cardId of deck.mainDeck) {
    const def = getCardDefinition(cardId);
    const cost = def && def.playCost >= 0 ? Math.min(def.playCost, 7) : 0;
    buckets.set(cost, (buckets.get(cost) ?? 0) + 1);
  }
  return [...buckets.entries()].sort((a, b) => a[0] - b[0]).map(([cost, count]) => ({ cost, count }));
}

/** Convenience: the palette key for a deck (always a valid ColorName). */
export function deckColorKey(deck: DeckListing): ColorName {
  return colorKey(deck.color);
}

export interface DeckParseResult {
  mainDeck: string[];
  eggDeck: string[];
  /** Per-copy artwork, aligned with `mainDeck`; alternate-art ids such as BT1-010_P1 keep their art. */
  mainDeckArts: string[];
  /** Per-copy artwork, aligned with `eggDeck`. */
  eggDeckArts: string[];
  skipped: number;
  /** Cards trimmed because the deck or egg deck was already full. */
  trimmed: number;
}

const IMPORT_MAIN_LIMIT = 50;
const IMPORT_EGG_LIMIT = 5;

interface ImportEntry {
  code: string;
  count: number;
}

/** A card number such as BT1-009, ST24-04, P-001 or EX13-076, with an optional _P1 alternate-art suffix. */
const CARD_CODE = /\b([A-Z]{1,3}\d{0,2}-\d{2,3})(?:_P\d+)?\b/gi;
const COPY_COUNT = /^x?(\d{1,2})x?$/i;
/** The header element Tabletop Simulator codes start with, e.g. "Exported from digimonmeta.com". */
const EXPORT_HEADER = /^exported from\b/i;

/** Uppercases a code and drops leading zeros from the set number, so ST01-01 matches ST1-01. */
function normalizeCode(code: string): string {
  return code.toUpperCase().replace(/^([A-Z]+)0+(\d)/, "$1$2");
}

/**
 * A Tabletop Simulator code: a JSON array with one card number per copy, used by
 * Digimon Meta, DigimonCard.io, digimoncard.app, digimoncard.dev and older DCGO.
 * Undefined when the text is not such an array. The quoted strings are read
 * directly rather than through JSON.parse, so a code that lost its closing
 * bracket in a copy and paste still imports.
 */
function tabletopEntries(text: string): ImportEntry[] | undefined {
  if (!text.startsWith("[")) return undefined;
  const items = [...text.matchAll(/"([^"]*)"/g)].map((match) => match[1]!.trim());
  if (items.length === 0) return undefined;
  return items.filter((item) => !EXPORT_HEADER.test(item)).map((code) => ({ code, count: 1 }));
}

/** The copy count on a line: a leading count, else a trailing one, else 1. Accepts 4, 4x and x4. */
function lineCount(tokens: readonly string[]): number {
  const counts = tokens.flatMap((token) => {
    const match = COPY_COUNT.exec(token);
    return match ? [Number(match[1])] : [];
  });
  if (counts.length === 0) return 1;
  const first = COPY_COUNT.exec(tokens[0]!);
  return first ? Number(first[1]) : counts.at(-1)!;
}

/**
 * Text deck lists, one card per line, in any column order:
 *   4 Agumon BT1-009                (DigimonCard.io, digimoncard.app, DCGO)
 *   4 Agumon (DCG) (BT1-009)        (Untap)
 *   BT1-009 Agumon 4                (digimoncard.app custom order)
 * Comment lines (// or #) and lines without a card number, such as section headers, are ignored.
 */
function textEntries(text: string): ImportEntry[] {
  const entries: ImportEntry[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("//") || line.startsWith("#")) continue;
    const codes = [...line.matchAll(CARD_CODE)];
    const code = codes.at(-1);
    if (!code) continue;
    const tokens = line.replace(code[0], " ").split(/\s+/).filter(Boolean);
    const count = lineCount(tokens);
    if (count < 1) continue;
    entries.push({ code: code[0], count });
  }
  return entries;
}

/**
 * Parses a pasted deck list: a text list or a Tabletop Simulator JSON code.
 * Digi-Eggs go to the egg deck by card type, since no common export marks them.
 * Unknown card numbers are counted in `skipped`; copies are capped to the
 * banlist-aware per-card limit across the whole list. Main deck is capped at 50,
 * egg deck at 5.
 */
export function parseDeckList(text: string, format: DeckFormat = "standard"): DeckParseResult {
  const trimmedText = text.trim();
  const entries = tabletopEntries(trimmedText) ?? textEntries(trimmedText);
  const mainDeck: string[] = [];
  const eggDeck: string[] = [];
  const mainDeckArts: string[] = [];
  const eggDeckArts: string[] = [];
  const copies = new Map<string, number>();
  let skipped = 0;
  let trimmed = 0;
  for (const { code, count } of entries) {
    const artCode = normalizeCode(code);
    const cardId = artCode.replace(/_P\d+$/, "");
    const def = getCardDefinition(cardId);
    if (!def) {
      skipped += 1;
      continue;
    }
    const artId = resolveCardArt(cardId, artCode).artId;
    const cap = Math.min(def.maxCountInDeck, formatCopyLimit(cardId, format));
    const isEgg = kindOf(def) === "DigiEgg";
    const [target, targetArts, targetLimit] = isEgg
      ? [eggDeck, eggDeckArts, IMPORT_EGG_LIMIT]
      : [mainDeck, mainDeckArts, IMPORT_MAIN_LIMIT];
    const allowed = Math.min(count, Math.max(0, cap - (copies.get(cardId) ?? 0)));
    for (let i = 0; i < allowed; i += 1) {
      if (target.length >= targetLimit) {
        trimmed += 1;
        break;
      }
      target.push(cardId);
      targetArts.push(artId);
      copies.set(cardId, (copies.get(cardId) ?? 0) + 1);
    }
  }
  return { mainDeck, eggDeck, mainDeckArts, eggDeckArts, skipped, trimmed };
}

/**
 * Serializes a deck to the DigimonCard.io text format.
 * Egg cards appear before main-deck cards, each group sorted by card ID.
 */
export function serializeDeckList(deck: DeckListing): string {
  const countMap = new Map<string, number>();
  for (const id of [...deck.eggDeck, ...deck.mainDeck]) {
    countMap.set(id, (countMap.get(id) ?? 0) + 1);
  }
  const lines = ["// DigimonCard.io Deck List"];
  const eggIds = [...new Set(deck.eggDeck)].sort();
  const mainIds = [...new Set(deck.mainDeck)].sort();
  for (const cardId of [...eggIds, ...mainIds]) {
    const def = getCardDefinition(cardId);
    const name = def?.nameEn ?? cardId;
    lines.push(`${countMap.get(cardId)} ${name} ${cardId}`);
  }
  return lines.join("\n");
}

/** Artwork of the first matching copy, so covers follow the saved deck. */
export function displayCoverArt(deck: DeckListing): string | undefined {
  const id = displayCoverCard(deck);
  if (!id) return undefined;
  const index = deck.mainDeck.indexOf(id);
  return index >= 0 ? deck.mainDeckArts?.[index] : deck.eggDeckArts?.[deck.eggDeck.indexOf(id)];
}
