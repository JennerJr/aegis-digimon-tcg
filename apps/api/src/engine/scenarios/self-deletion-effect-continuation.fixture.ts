import type { ScenarioFixture } from "#api/engine/scenario/types";

type Params = { onlyDualTarget: boolean };

export default function selfDeletionEffectContinuation({ onlyDualTarget }: Params): ScenarioFixture {
  return {
    memory: 3,
    turnSeat: 0,
    turnCount: 0,
    isFirstPlayersFirstTurn: false,
    board: {
      0: {
        battleArea: [{ card: "EX13-059", as: "bigMamemon" }],
        deck: ["ST1-03", { card: "BT6-063", as: "revealedMamemon" }, "ST1-03", "ST1-03", "ST1-03", "ST1-03"],
        eggDeck: ["BT1-001"],
        security: 3,
      },
      1: {
        battleArea: [
          { card: "BT26-056", as: "dualTarget", under: ["BT24-021"] },
          ...(onlyDualTarget ? [] : [{ card: "ST1-03", as: "eligibleTarget" }]),
        ],
        deck: Array<string>(8).fill("ST1-03"),
        eggDeck: ["BT1-001"],
        security: 3,
      },
    },
    presentation: { holdBotAfterTurn: 1 },
  };
}
