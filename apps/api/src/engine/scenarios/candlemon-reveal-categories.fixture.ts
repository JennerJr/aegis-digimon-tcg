import type { ScenarioFixture } from "#api/engine/scenario/types";

const fixture: ScenarioFixture = {
  name: "candlemon-reveal-categories",
  memory: 6,
  turnSeat: 0,
  turnCount: 2,
  isFirstPlayersFirstTurn: false,
  board: {
    0: {
      eggDeck: ["BT1-003"],
      hand: [{ card: "BT18-030", as: "candlemon" }],
      deck: [
        "BT1-010",
        { card: "BT4-104", as: "nonMatch" },
        { card: "BT19-036", as: "bothCategories" },
        { card: "BT23-035", as: "dataOnly" },
        ...Array.from({ length: 12 }, () => "BT1-010"),
      ],
      security: 3,
    },
    1: { deck: Array.from({ length: 16 }, () => "BT1-010"), security: 5 },
  },
};

export default fixture;
