import type { RoadmapStage } from "#shared/feedback/RoadmapStage";

export type RoadmapCopy = Record<"en" | "pt-BR" | "es", string>;
export type RoadmapEntry = {
  id: string;
  stage: RoadmapStage;
  title: RoadmapCopy;
  description: RoadmapCopy;
  discordUrls: string[];
  websiteRequests: number;
};
export type CommunityRoadmap = { reviewedAt: string; items: RoadmapEntry[] };
