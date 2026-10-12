import type { ScenarioFixture } from "#api/engine/scenario/types";

const fixture: ScenarioFixture = {
  name: "paildramon-source-count-suspension",
  memory: 6,
  turnSeat: 0,
  turnCount: 2,
  isFirstPlayersFirstTurn: false,
  board: {
    0: {
      eggDeck: ["BT1-003"],
      battleArea: [
        { card: "BT1-037", as: "blue", under: ["BT1-030"] },
        { card: "BT1-073", as: "green" },
      ],
      hand: [{ card: "BT16-025", as: "paildramon" }],
      deck: Array.from({ length: 16 }, () => "BT1-010"),
      security: 3,
    },
    1: {
      battleArea: [
        { card: "BT1-010", as: "noSources" },
        { card: "BT1-014", as: "twoSources", under: ["BT1-001", "BT1-012"] },
        { card: "BT1-020", as: "threeSources", under: ["BT1-001", "BT1-012", "BT1-014"] },
        { card: "BT1-025", as: "fourSources", under: ["BT1-001", "BT1-012", "BT1-014", "BT1-020"] },
      ],
      deck: Array.from({ length: 16 }, () => "BT1-010"),
      security: 5,
    },
  },
};

export default fixture;
