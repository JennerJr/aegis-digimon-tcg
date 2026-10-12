import type { ScenarioFixture } from "#api/engine/scenario/types";

type Params = { simultaneousWatcher?: boolean };

export function allianceGrantOptionalAttack({ simultaneousWatcher = false }: Params = {}): ScenarioFixture {
  return {
    memory: 10,
    turnSeat: 0,
    turnCount: 0,
    isFirstPlayersFirstTurn: false,
    board: {
      0: {
        battleArea: [
          { card: "ST21-09", as: "lillymon" },
          { card: "ST21-07", as: "allianceRecipient" },
          ...(simultaneousWatcher ? [{ card: "ST21-04", as: "biyomon" }] : []),
        ],
        hand: [{ card: "ST21-10", as: "playedAdventure" }],
        deck: Array<string>(8).fill("ST1-03"),
        eggDeck: ["BT1-001"],
        security: 3,
      },
      1: { deck: Array<string>(8).fill("ST1-03"), security: ["ST1-03", "ST1-03"] },
    },
  };
}

export default allianceGrantOptionalAttack();
