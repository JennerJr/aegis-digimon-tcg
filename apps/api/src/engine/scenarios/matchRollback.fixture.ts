import type { ScenarioFixture } from "#api/engine/scenario/types";

const matchRollbackFixture: ScenarioFixture = {
  memory: 10,
  turnSeat: 0,
  turnCount: 0,
  isFirstPlayersFirstTurn: true,
  board: {
    0: {
      hand: [
        { card: "BT1-009", as: "rookie" },
        { card: "BT1-010", as: "searcher" },
      ],
      deck: ["BT1-086", "BT1-009", "BT1-012", "BT1-013", "BT1-014", "BT1-015", "BT1-009"],
      eggDeck: ["BT1-001"],
      security: ["BT1-009", "BT1-012"],
      battleArea: [{ card: "BT1-019", as: "host", suspended: true }],
    },
    1: { deck: ["BT1-009", "BT1-012", "BT1-013"], eggDeck: ["BT1-001"], security: ["BT1-019"] },
  },
};

export default matchRollbackFixture;
