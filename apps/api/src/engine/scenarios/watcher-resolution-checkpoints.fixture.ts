import type { ScenarioFixture } from "#api/engine/scenario/types";

const fixture: ScenarioFixture = {
  name: "watcher-resolution-checkpoints",
  board: {
    0: {
      hand: [
        { card: "BT25-077", as: "bacchusmon" },
        { card: "BT26-033", as: "arts-option" },
      ],
      battleArea: [{ card: "BT25-039", as: "evolution-base" }],
      deck: Array(8).fill("BT1-009"),
      security: 5,
    },
    1: {
      battleArea: [
        { card: "EX13-045", as: "examon", under: ["EX13-021"] },
        { card: "BT1-009", as: "lowest-dp" },
      ],
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
