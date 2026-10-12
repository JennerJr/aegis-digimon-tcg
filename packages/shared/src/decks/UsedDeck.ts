import type { DeckFormat } from "#shared/deckFormat";
import type { CommunityDeckAuthor } from "#shared/decks/community";

export const USED_DECK_CHANNEL = "usedDeck";

export interface UsedDeck {
  deckId: string | null;
  deckName: string;
  mainDeck: string[];
  eggDeck: string[];
  mainDeckArts?: string[];
  eggDeckArts?: string[];
  format?: DeckFormat;
  community?: { id: string; author: CommunityDeckAuthor };
}
