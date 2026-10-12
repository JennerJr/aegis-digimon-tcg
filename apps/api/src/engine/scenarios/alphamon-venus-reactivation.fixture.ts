import type { ScenarioFixture } from "#api/engine/scenario/types";

const fixture: ScenarioFixture = {
  name: "alphamon-venus-reactivation",
  memory: 6,
  turnSeat: 1,
  turnCount: 3,
  isFirstPlayersFirstTurn: false,
  board: {
    0: {
      battleArea: [{ card: "EX13-060", as: "alphamon" }],
      hand: [{ card: "BT20-010", as: "chronicle" }],
      deck: Array.from({ length: 16 }, () => "BT1-010"),
      security: 3,
    },
    1: {
      battleArea: [{ card: "BT1-061", as: "venus" }],
      hand: [{ card: "BT10-042", as: "venusCard" }],
      deck: Array.from({ length: 16 }, () => "BT1-010"),
      security: ["BT1-010", "BT1-010", "BT1-010", "BT1-010"],
    },
  },
};

export default fixture;
