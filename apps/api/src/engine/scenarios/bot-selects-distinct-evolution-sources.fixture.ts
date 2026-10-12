import type { ScenarioFixture } from "#api/engine/scenario/types";

const fixture: ScenarioFixture = {
  memory: 6,
  turnSeat: 1,
  turnCount: 0,
  isFirstPlayersFirstTurn: false,
  board: {
    0: {
      battleArea: [{ card: "BT1-024", as: "target", under: ["BT1-009", "BT1-019", "BT1-021"] }],
      deck: Array<string>(8).fill("ST1-03"),
      eggDeck: ["BT1-001"],
      security: 3,
    },
    1: {
      battleArea: [{ card: "BT1-021", as: "base" }],
      hand: [{ card: "EX3-013", as: "chaosdramon" }],
      trash: [
        { card: "BT1-021", as: "copyA" },
        { card: "BT1-021", as: "copyB" },
        { card: "BT1-021", as: "copyC" },
        { card: "BT2-060", as: "andromon" },
        { card: "BT2-061", as: "metalTyrannomon" },
      ],
      deck: Array<string>(8).fill("ST1-03"),
      eggDeck: ["BT1-001"],
      security: 3,
    },
  },
  presentation: {
    opponent: {
      endBreeding: true,
      main: [{ kind: "digivolve", card: "EX3-013", base: "BT1-021" }],
      fallbackMain: "end",
    },
    holdBotAfterTurn: 2,
  },
};

export default fixture;
