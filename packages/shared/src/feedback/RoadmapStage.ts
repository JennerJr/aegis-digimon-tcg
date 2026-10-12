export const RoadmapStage = {
  IDEA: { name: "IDEA", value: "idea" },
  REVIEW: { name: "REVIEW", value: "review" },
  PLANNED: { name: "PLANNED", value: "planned" },
  DEVELOPMENT: { name: "DEVELOPMENT", value: "development" },
} as const;
export type RoadmapStage = (typeof RoadmapStage)[keyof typeof RoadmapStage]["value"];
