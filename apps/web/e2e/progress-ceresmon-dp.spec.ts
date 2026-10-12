import fixture from "../../api/src/engine/scenarios/progress-ceresmon-dp.fixture";
import { test, expect } from "./scenario-page";

for (const [card, checks] of [
  ["BT24-018", 1],
  ["BT1-016", 0],
] as const) {
  test(`${card} completes ${checks} security checks against Ceresmon`, async ({ scenario }) => {
    const board = {
      ...fixture,
      board: { ...fixture.board, 0: { ...fixture.board[0], battleArea: [{ card, as: "attacker" }] } },
    };
    const refs = await scenario.openFixture(board, "normal", "none");
    await scenario.resolveUntil((state) => state.phase === "Main" && !state.pendingDecision);
    await scenario.attack(refs.permanentId("attacker"));
    await scenario.resolveUntil(
      (state) =>
        !state.pendingDecision &&
        !state.combatWindow &&
        (checks === 1
          ? state.players[1]!.securityCount === 3
          : !state.players[0]!.battleArea.some((permanent) => permanent.permanentId === refs.permanentId("attacker"))),
      () => ({ accept: false }),
    );
    const after = await scenario.snapshot();
    expect(after.players[1]!.securityCount).toBe(4 - checks);
    expect(
      (await scenario.presentation()).events.some(
        (event) => event.kind === "effectTriggered" && event.sourceCardId === "BT25-059",
      ),
    ).toBe(true);
    await scenario.healthy();
  });
}
