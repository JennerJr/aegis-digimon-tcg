import type { ScenarioFixture } from "#api/engine/scenario/types";

const fixture: ScenarioFixture = {
  name: "thetismon-own-suspension",
  memory: 3,
  turnSeat: 0,
  turnCount: 3,
  isFirstPlayersFirstTurn: false,
  board: {
    0: {
      battleArea: [
        { card: "BT1-016", as: "host", under: ["EX12-030"] },
        { card: "BT1-016", as: "bystander" },
      ],
      trash: ["EX12-027", "EX12-027", "EX12-027"],
      deck: Array.from({ length: 16 }, () => "BT1-010"),
      security: 3,
    },
    1: {
      deck: Array.from({ length: 16 }, () => "BT1-010"),
      security: ["BT1-010", "BT1-010", "BT1-010", "BT1-010"],
    },
  },
};

export default fixture;
