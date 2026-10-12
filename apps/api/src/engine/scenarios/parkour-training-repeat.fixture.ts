import type { ScenarioFixture } from "#api/engine/scenario/types";

const fixture: ScenarioFixture = {
  name: "parkour-training-repeat",
  memory: 6,
  turnSeat: 0,
  turnCount: 3,
  isFirstPlayersFirstTurn: false,
  board: {
    0: {
      hand: [
        { card: "LM-058", as: "firstTraining" },
        { card: "LM-058", as: "secondTraining" },
      ],
      deck: Array.from({ length: 16 }, (_, index) => ({ card: "BT1-010", as: `ownDraw${index}` })),
      security: 3,
    },
    1: {
      deck: Array.from({ length: 16 }, (_, index) => ({ card: "BT1-010", as: `opponentDraw${index}` })),
      security: 3,
    },
  },
};

export default fixture;
