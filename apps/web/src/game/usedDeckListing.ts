import type { UsedDeck } from "@aegis/shared/decks/UsedDeck";
import { colorKey } from "@/design/theme";
import { getCardDefinition } from "@aegis/shared/cards/registry";
import type { DeckListing } from "@/game/decks";

export function usedDeckListing({ snapshot }: { snapshot: UsedDeck }): DeckListing {
  return {
    id: snapshot.deckId ?? "used-deck",
    name: snapshot.deckName,
    color: colorKey(getCardDefinition(snapshot.mainDeck[0] ?? "")?.colors[0]),
    blurb: snapshot.community?.author.displayName ?? "",
    mainDeck: [...snapshot.mainDeck],
    eggDeck: [...snapshot.eggDeck],
    mainDeckArts: snapshot.mainDeckArts?.slice(),
    eggDeckArts: snapshot.eggDeckArts?.slice(),
    format: snapshot.format,
    community: snapshot.community ? structuredClone(snapshot.community) : undefined,
  };
}
