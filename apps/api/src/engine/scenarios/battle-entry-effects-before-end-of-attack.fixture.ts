import type { ScenarioFixture } from "#api/engine/scenario/types";

const fixture: ScenarioFixture = {
  memory: 10,
  turnSeat: 0,
  turnCount: 0,
  isFirstPlayersFirstTurn: false,
  board: {
    0: {
      battleArea: [
        { card: "EX13-060", as: "alphamon" },
        { card: "EX13-057", as: "grademon" },
      ],
      hand: [
        { card: "BT20-010", as: "playedChronicle" },
        { card: "BT20-018", as: "ouryumon" },
      ],
      deck: Array<string>(8).fill("ST1-03"),
      eggDeck: ["BT1-001"],
      security: 3,
    },
    1: {
      battleArea: [
        {
          card: "BT24-041",
          as: "blocker",
          under: [
            { card: "BT25-022", as: "lunamon" },
            { card: "BT24-037", as: "silphymon" },
          ],
        },
      ],
      deck: [
        { card: "BT24-043", as: "revealedIliad" },
        { card: "BT24-031", as: "revealedTs" },
        "ST1-03",
        "ST1-03",
        "ST1-03",
        "ST1-03",
      ],
      security: 3,
    },
  },
  presentation: { opponent: { blockerCard: "BT24-041" } },
};

export default fixture;
