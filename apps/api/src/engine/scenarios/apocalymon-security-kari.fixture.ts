import type { ScenarioFixture } from "#api/engine/scenario/types";

const fixture: ScenarioFixture = {
  name: "apocalymon-security-kari",
  memory: 10,
  turnSeat: 0,
  turnCount: 3,
  isFirstPlayersFirstTurn: false,
  board: {
    0: {
      hand: [{ card: "EX10-061", as: "apocalymon" }],
      battleArea: [{ card: "BT4-097", as: "kari" }],
      security: [
        { card: "EX10-012", as: "metal", faceUp: true },
        { card: "BT15-031", as: "sea", faceUp: true },
        "BT1-010",
      ],
      deck: Array(12).fill("BT1-010"),
    },
    1: { deck: Array(12).fill("BT1-010"), security: 3 },
  },
};

export default fixture;
