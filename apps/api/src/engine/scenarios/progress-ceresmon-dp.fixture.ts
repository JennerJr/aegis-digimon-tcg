import type { ScenarioFixture } from "#api/engine/scenario/types";

const fixture: ScenarioFixture = {
  name: "progress-ceresmon-dp",
  memory: 3,
  turnSeat: 0,
  turnCount: 3,
  isFirstPlayersFirstTurn: false,
  board: {
    0: {
      battleArea: [{ card: "BT24-018", as: "attacker" }],
      deck: Array.from({ length: 16 }, () => "BT1-010"),
      security: 3,
    },
    1: {
      battleArea: [
        { card: "BT25-059", as: "ceresmon", suspended: true },
        ...Array.from({ length: 4 }, (_, index) => ({ card: "BT1-010", as: `suspended${index}`, suspended: true })),
      ],
      deck: Array.from({ length: 16 }, () => "BT1-010"),
      security: ["BT1-010", "BT1-010", "BT1-010", "BT1-010"],
    },
  },
};

export default fixture;
