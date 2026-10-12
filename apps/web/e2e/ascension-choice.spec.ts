import fixture from "../../api/src/engine/scenarios/ascension-choice.fixture";
import { test, expect } from "./scenario-page";

for (const card of ["BT25-034", "BT25-040"]) {
  for (const accept of [false, true]) {
    test(`${card} can activate or decline Ascension after battle deletion accept=${accept}`, async ({ scenario }) => {
      const own = fixture.board[0]!;
      const under = card === "BT25-040" ? [{ card: "BT1-051", as: "digivolutionCard" }] : [];
      const board = {
        ...fixture,
        board: {
          ...fixture.board,
          0: { ...own, battleArea: [{ card, as: "angel", top: { card, as: "ascendingCard" }, under }] },
        },
      };
      const refs = await scenario.openFixture(board);
      await scenario.attack(refs.permanentId("angel"));
      await scenario.resolveUntil(
        (state) =>
          !state.pendingDecision &&
          !state.combatWindow &&
          !state.players[0]!.battleArea.some((perm) => perm.permanentId === refs.permanentId("angel")),
        (decision) =>
          /Barrier/i.test(decision.promptText)
            ? { accept: false }
            : { accept, instanceId: refs.instanceId("ascendingCard") },
      );
      const state = await scenario.snapshot();
      expect(state.players[0]!.securityCount).toBe(accept ? 4 : 3);
      expect(state.players[0]!.trash.some((entry) => entry.instanceId === refs.instanceId("ascendingCard"))).toBe(
        !accept,
      );
      expect(state.players[0]!.trash.map((entry) => entry.instanceId)).toEqual(
        expect.arrayContaining(under.map((entry) => refs.instanceId(entry.as))),
      );
      await scenario.healthy();
    });
  }
}
