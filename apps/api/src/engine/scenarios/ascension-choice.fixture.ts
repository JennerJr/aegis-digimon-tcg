import type { ScenarioFixture } from "#api/engine/scenario/types";

const fixture: ScenarioFixture = {
  name: "ascension-choice",
  memory: 6,
  turnSeat: 0,
  turnCount: 2,
  isFirstPlayersFirstTurn: false,
  board: {
    0: {
      eggDeck: ["BT1-003"],
      battleArea: [{ card: "BT25-034", as: "angel", top: { card: "BT25-034", as: "ascendingCard" } }],
      hand: ["BT1-013"],
      deck: Array.from({ length: 16 }, () => "BT1-010"),
      security: 3,
    },
    1: { deck: Array.from({ length: 16 }, () => "BT1-010"), security: ["BT1-082"] },
  },
};

export default fixture;
