export const CommunityHubSection = {
  DISCUSSIONS: { name: "DISCUSSIONS", value: "discussions" },
  ROADMAP: { name: "ROADMAP", value: "roadmap" },
  DECKS: { name: "DECKS", value: "decks" },
} as const;
export type CommunityHubSection = (typeof CommunityHubSection)[keyof typeof CommunityHubSection]["value"];
