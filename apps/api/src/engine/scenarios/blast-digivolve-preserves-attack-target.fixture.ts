import type { ScenarioFixture } from "#api/engine/scenario/types";

const fixture: ScenarioFixture = {
  memory: 5,
  turnSeat: 0,
  turnCount: 0,
  isFirstPlayersFirstTurn: false,
  board: {
    0: {
      battleArea: [{ card: "ST1-03", dp: 20000, as: "attacker" }],
      deck: Array<string>(8).fill("ST1-03"),
      eggDeck: ["BT1-001"],
      security: 3,
    },
    1: {
      battleArea: [{ card: "BT6-067", suspended: true, as: "gankoomon" }],
      hand: [{ card: "BT20-021", as: "jesmonGx" }],
      deck: Array<string>(8).fill("ST1-03"),
      security: 3,
    },
  },
};

export default fixture;
