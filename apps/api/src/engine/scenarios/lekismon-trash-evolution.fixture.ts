import type { ScenarioFixture } from "#api/engine/scenario/types";

const fixture: ScenarioFixture = {
  name: "lekismon-trash-evolution",
  memory: 6,
  turnSeat: 0,
  turnCount: 2,
  isFirstPlayersFirstTurn: false,
  board: {
    0: {
      eggDeck: ["BT1-003"],
      battleArea: [
        { card: "BT25-013", as: "redEvolution" },
        { card: "BT25-024", as: "lekismon" },
      ],
      hand: [
        { card: "BT25-017", as: "flaremon" },
        { card: "BT25-026", as: "crescemon" },
      ],
      trash: ["BT24-100"],
      deck: Array.from({ length: 16 }, () => "BT1-010"),
      security: 3,
    },
    1: { deck: Array.from({ length: 16 }, () => "BT1-010"), security: 5 },
  },
};

export default fixture;
