import type { ScenarioFixture } from "#api/engine/scenario/types";

const fixture: ScenarioFixture = {
  name: "apollomon-end-turn-play",
  memory: 6,
  turnSeat: 1,
  turnCount: 2,
  isFirstPlayersFirstTurn: false,
  board: {
    0: {
      eggDeck: ["BT1-003"],
      battleArea: [{ card: "BT24-085", as: "danKanan" }],
      hand: [
        { card: "BT2-087", as: "initialPayment" },
        { card: "BT1-107", as: "memoryPayment" },
        { card: "BT25-094", as: "cosmic" },
        { card: "BT25-018", as: "apollomon" },
      ],
      deck: Array.from({ length: 16 }, () => "BT1-010"),
      security: ["BT1-010", "BT1-010", "BT1-010"],
    },
    1: {
      battleArea: [{ card: "BT16-028", as: "imperial" }],
      hand: [{ card: "BT20-020", as: "fighter" }],
      deck: Array.from({ length: 16 }, () => "BT1-010"),
      security: 5,
    },
  },
};

export default fixture;
