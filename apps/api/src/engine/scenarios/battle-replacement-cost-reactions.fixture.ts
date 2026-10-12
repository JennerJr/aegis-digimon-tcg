import type { ScenarioFixture } from "#api/engine/scenario/types";

const fixture: ScenarioFixture = {
  name: "battle-replacement-cost-reactions",
  memory: 6,
  turnSeat: 0,
  turnCount: 3,
  isFirstPlayersFirstTurn: false,
  board: {
    0: {
      battleArea: [{ card: "BT22-067", as: "attacker" }],
      hand: [{ card: "BT23-047", as: "examon" }],
      deck: Array.from({ length: 12 }, () => "BT1-010"),
      security: 3,
    },
    1: {
      battleArea: [{ card: "BT25-084", as: "titamon", suspended: true }],
      hand: ["BT1-010", "BT1-010"],
      deck: Array.from({ length: 12 }, () => "BT1-010"),
      security: 3,
    },
  },
  presentation: {
    opponent: { decisions: [{ sourceCard: "BT25-084", kind: "optional", accept: true }] },
  },
};

export default fixture;
