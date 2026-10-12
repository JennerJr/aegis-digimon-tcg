import type { ScenarioFixture } from "#api/engine/scenario/types";

const fixture: ScenarioFixture = {
  memory: 3,
  turnSeat: 0,
  turnCount: 0,
  isFirstPlayersFirstTurn: false,
  board: {
    0: {
      battleArea: [{ card: "EX13-060", as: "alphamon" }],
      hand: [{ card: "EX13-057", as: "grademon" }],
      deck: Array<string>(8).fill("ST1-03"),
      eggDeck: ["BT1-001"],
      security: 3,
    },
    1: {
      deck: Array<string>(8).fill("ST1-03"),
      eggDeck: ["BT1-001"],
      security: ["ST1-03", "ST1-03", "ST1-03"],
    },
  },
  presentation: { holdBotAfterTurn: 1 },
};

export default fixture;
