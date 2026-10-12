import fixture from "../../api/src/engine/scenarios/apollomon-end-turn-play.fixture";
import { test, expect } from "./scenario-page";

for (const applied of [false, true]) {
  test(`Imperialdramon's prohibition gates Cosmic Area's Apollomon play applied=${applied}`, async ({ scenario }) => {
    const board = {
      ...fixture,
      board: {
        ...fixture.board,
        1: applied
          ? fixture.board[1]
          : { ...fixture.board[1], battleArea: [{ card: "BT20-020", as: "imperial" }], hand: [] },
      },
      presentation: {
        holdBotAfterTurn: 5,
        opponent: {
          endBreeding: true,
          fallbackMain: "end" as const,
          main: applied ? [{ kind: "digivolve" as const, card: "BT20-020", base: "BT16-028" }] : [],
        },
      },
    };
    const refs = await scenario.openFixture(board, "normal", "none");
    await expect(scenario.page.getByRole("button", { name: /^end breeding$/i })).toBeEnabled({ timeout: 30000 });
    await scenario.page.getByRole("button", { name: /^end breeding$/i }).click();
    await expect
      .poll(async () => {
        const state = await scenario.snapshot();
        return state.turnSeat === 0 && state.phase === "Main" && !state.pendingDecision;
      })
      .toBe(true);
    await scenario.play("Kari Kamiya", "Tamer");
    await expect.poll(async () => (await scenario.snapshot()).memory).toBe(1);
    await scenario.idle();
    await scenario.play("Holy Wave", "Option");
    await scenario.resolveUntil(
      (state) => state.turnSeat === 1 && !state.pendingDecision,
      (decision) => {
        if (
          decision.options.selectionContext === "attackSource" ||
          (decision.kind === "optional" && /attack/i.test(decision.promptText))
        )
          return { accept: false };
        if (decision.kind === "selectCards")
          return { instanceId: refs.instanceId(decision.sourceCardId === "BT25-094" ? "apollomon" : "cosmic") };
        return {};
      },
    );
    const state = await scenario.snapshot();
    expect(state.players[0]!.battleArea.some((perm) => perm.topCard.instanceId === refs.instanceId("apollomon"))).toBe(
      !applied,
    );
    expect(state.players[0]!.hand.some((card) => card.instanceId === refs.instanceId("apollomon"))).toBe(applied);
    await scenario.healthy();
  });
}
