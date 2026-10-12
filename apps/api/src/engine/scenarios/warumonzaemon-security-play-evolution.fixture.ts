import type { ScenarioFixture } from "#api/engine/scenario/types";

const fixture: ScenarioFixture = {
  name: "warumonzaemon-security-play-evolution",
  memory: 10,
  turnSeat: 0,
  turnCount: 3,
  isFirstPlayersFirstTurn: false,
  board: {
    0: {
      battleArea: [{ card: "P-216", as: "waru" }],
      hand: [
        { card: "BT1-084", as: "evolution" },
        { card: "BT1-010", as: "reserve" },
      ],
      deck: Array(12).fill("BT1-010"),
      security: [{ card: "BT15-031", as: "master", faceUp: true }, "BT1-010", "BT1-010"],
    },
    1: {
      deck: Array(12).fill("BT1-010"),
      security: [{ card: "BT1-084", as: "battleSecurity" }, "BT1-010", "BT1-010"],
    },
  },
};

export default fixture;
