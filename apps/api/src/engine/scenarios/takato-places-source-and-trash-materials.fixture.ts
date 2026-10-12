import type { ScenarioFixture } from "#api/engine/scenario/types";

const fixture: ScenarioFixture = {
  memory: 10,
  turnSeat: 0,
  turnCount: 0,
  isFirstPlayersFirstTurn: false,
  board: {
    0: {
      battleArea: [
        { card: "BT12-089", as: "sourceTakato" },
        { card: "BT12-089", as: "otherTakato" },
        { card: "BT12-007", as: "guilmon" },
        { card: "BT12-010", as: "fieldGrowlmon" },
        { card: "BT12-016", as: "fieldWarGrowlmon" },
      ],
      trash: [
        { card: "BT12-089", as: "trashTakato" },
        { card: "BT12-010", as: "trashGrowlmon" },
        { card: "BT12-016", as: "trashWarGrowlmon" },
      ],
      hand: [{ card: "BT12-018", as: "gallantmon" }],
      deck: Array<string>(8).fill("ST1-03"),
      eggDeck: ["BT1-001"],
      security: 3,
    },
    1: { deck: Array<string>(8).fill("ST1-03"), security: 3 },
  },
};

export default fixture;
