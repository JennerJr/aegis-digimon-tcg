import type { ScenarioFixture } from "#api/engine/scenario/types";

const fixture: ScenarioFixture = {
  memory: 3,
  turnSeat: 0,
  turnCount: 0,
  isFirstPlayersFirstTurn: false,
  board: {
    0: {
      hand: [
        { card: "EX13-060", as: "alphamon" },
        { card: "EX13-057", as: "playedGrademon" },
      ],
      trash: [
        { card: "EX13-057", as: "levelFive" },
        { card: "EX13-055", as: "levelFour" },
        { card: "EX13-049", as: "levelThree" },
      ],
      deck: Array<string>(8).fill("ST1-03"),
      eggDeck: ["BT1-001"],
      security: 3,
    },
    1: { deck: Array<string>(8).fill("ST1-03"), eggDeck: ["BT1-001"], security: ["ST1-03", "ST1-03", "ST1-03"] },
  },
  presentation: { holdBotAfterTurn: 1 },
};

export default fixture;
