import type { CommunityDeck } from "#shared/decks/community";

export interface CommunityRandomResult {
  deck: CommunityDeck | null;
  eligibleCount: number;
}
