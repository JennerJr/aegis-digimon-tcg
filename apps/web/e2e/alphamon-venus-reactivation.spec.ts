import fixture from "../../api/src/engine/scenarios/alphamon-venus-reactivation.fixture";
import { test, expect } from "./scenario-page";

test.use({ holdBotAfterTurn: 5 });

for (const applied of [false, true]) {
  test(`Venusmon gates Alphamon reactivation with Security Attack applied=${applied}`, async ({ scenario }) => {
    const board = {
      ...fixture,
      board: {
        ...fixture.board,
        1: applied
          ? fixture.board[1]
          : { ...fixture.board[1], battleArea: [{ card: "BT10-042", as: "venus" }], hand: [] },
      },
      presentation: {
        opponent: {
          endBreeding: true,
          fallbackMain: "end" as const,
          main: applied ? [{ kind: "digivolve" as const, card: "BT10-042", base: "BT1-061" }] : [],
        },
      },
    };
    const refs = await scenario.openFixture(board, "normal", "none");
    await expect
      .poll(
        async () => {
          const state = await scenario.snapshot();
          return state.turnSeat === 0 && state.phase === "Main" && !state.pendingDecision;
        },
        { timeout: 30000 },
      )
      .toBe(true);
    await scenario.idle();
    await scenario.play("Ryudamon", "Digimon");
    let reactivationPrompts = 0;
    await scenario.resolveUntil(
      (state) =>
        !state.pendingDecision &&
        !state.combatWindow &&
        state.players[0]!.battleArea.some(
          (permanent) => permanent.topCard.instanceId === refs.instanceId("chronicle"),
        ) &&
        state.players[0]!.battleArea.find((permanent) => permanent.permanentId === refs.permanentId("alphamon"))!
          .isSuspended &&
        state.players[1]!.battleArea.find((permanent) => permanent.permanentId === refs.permanentId("venus"))!
          .currentDP === (applied ? 12000 : 4000),
      (decision) => {
        if (decision.kind === "optional" && decision.promptText.includes("Then, you may activate 1 of this Digimon"))
          reactivationPrompts++;
        return {};
      },
    );
    expect(reactivationPrompts).toBe(applied ? 0 : 1);
    expect(
      (await scenario.presentation()).events.some(
        (event) =>
          event.kind === "effectTriggered" && event.sourceCardId === "EX13-060" && event.timing === "WhenDigivolving",
      ),
    ).toBe(!applied);
    await scenario.healthy();
  });
}
