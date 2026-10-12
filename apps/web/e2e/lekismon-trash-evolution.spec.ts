import fixture from "../../api/src/engine/scenarios/lekismon-trash-evolution.fixture";
import { test, expect } from "./scenario-page";

for (const inTrash of [false, true]) {
  test(`Lekismon needs a Crescemon in trash after Flaremon evolves inTrash=${inTrash}`, async ({ scenario }) => {
    const own = fixture.board[0]!;
    const board = inTrash
      ? {
          ...fixture,
          board: {
            ...fixture.board,
            0: {
              ...own,
              hand: [{ card: "BT25-017", as: "flaremon" }],
              trash: ["BT24-100", { card: "BT25-026", as: "crescemon" }],
            },
          },
        }
      : fixture;
    const refs = await scenario.openFixture(board);
    await scenario.evolve("Flaremon", refs.permanentId("redEvolution"));
    await scenario.resolveUntil(
      (state) =>
        !state.pendingDecision &&
        state.players[0]!.battleArea.find((perm) => perm.permanentId === refs.permanentId("redEvolution"))!.topCard
          .cardId === "BT25-017" &&
        state.players[0]!.battleArea.find((perm) => perm.permanentId === refs.permanentId("lekismon"))!.topCard
          .cardId === (inTrash ? "BT25-026" : "BT25-024"),
      (decision) =>
        decision.sourceCardId === "BT25-017"
          ? { accept: false }
          : decision.kind === "selectCards"
            ? { instanceId: refs.instanceId("crescemon") }
            : {},
    );
    expect((await scenario.snapshot()).memory).toBe(inTrash ? 1 : 3);
    await scenario.healthy();
  });
}
