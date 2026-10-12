import type { ScenarioFixture } from "#api/engine/scenario/types";

const fixture: ScenarioFixture = {
  name: "rebootmon-link-overflow",
  memory: 6,
  turnSeat: 0,
  turnCount: 2,
  isFirstPlayersFirstTurn: false,
  board: {
    0: {
      eggDeck: ["BT25-004"],
      battleArea: [
        {
          card: "BT25-060",
          as: "reboot",
          suspended: true,
          linked: [
            { card: "BT25-072", as: "oldLink" },
            { card: "BT26-063", as: "otherLink" },
          ],
        },
      ],
      hand: [{ card: "BT21-073", as: "newLink" }],
      deck: Array.from({ length: 16 }, () => "BT1-010"),
      security: 3,
    },
    1: {
      battleArea: [{ card: "EX3-024", as: "forcedAttackSource" }],
      deck: Array.from({ length: 16 }, () => "BT1-010"),
      security: 5,
    },
  },
};

export default fixture;
