import type { ScenarioFixture } from "#api/engine/scenario/types";

const fixture: ScenarioFixture = {
  name: "warumonzaemon-declined-play",
  memory: 10,
  turnSeat: 0,
  turnCount: 3,
  isFirstPlayersFirstTurn: false,
  board: {
    0: {
      hand: [
        { card: "P-216", as: "waru" },
        { card: "BT15-031", as: "master" },
      ],
      deck: Array.from({ length: 12 }, (_, index) => ({ card: "BT1-010", as: `ownDraw${index}` })),
      security: 3,
    },
    1: { deck: Array(12).fill("BT1-010"), security: 3 },
  },
};

export default fixture;
