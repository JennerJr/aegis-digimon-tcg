import type { ScenarioFixture } from "#api/engine/scenario/types";

const fixture: ScenarioFixture = {
  name: "zero-dp-watcher-checkpoint",
  board: {
    0: {
      hand: [{ card: "BT26-032", as: "arts-option" }],
      battleArea: [
        { card: "BT25-059", as: "ceresmon" },
        { card: "BT1-009", as: "suspended-ally", suspended: true },
        { card: "BT1-009", as: "other-suspended-ally", suspended: true },
      ],
      deck: Array(8).fill("BT1-009"),
      security: 5,
    },
    1: {
      battleArea: [{ card: "EX13-044", as: "breakdramon", under: ["EX13-021"] }],
      deck: Array(8).fill("BT1-009"),
      security: 5,
    },
  },
  memory: 10,
  turnSeat: 0,
  turnCount: 2,
  isFirstPlayersFirstTurn: false,
};

export default fixture;
