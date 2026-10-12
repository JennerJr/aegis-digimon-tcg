import fixture from "../../api/src/engine/scenarios/paildramon-source-count-suspension.fixture";
import { test, expect } from "./scenario-page";
import { GamePage } from "./game-page";

for (const dna of [false, true]) {
  test(`Paildramon suspends only eligible source counts with DNA=${dna}`, async ({ scenario, page }) => {
    const own = fixture.board[0]!;
    const board = dna
      ? fixture
      : {
          ...fixture,
          board: {
            ...fixture.board,
            0: { ...own, battleArea: [{ card: "BT1-037", as: "blue", under: ["BT1-030"] }] },
          },
        };
    const refs = await scenario.openFixture(board);
    await scenario.resolveUntil((state) => state.turnSeat === 0 && state.phase === "Main" && !state.pendingDecision);
    if (dna) {
      await new GamePage(page).dragCardTo(/^Paildramon$/i, page.locator('[data-drop="battle-you"]'));
      const prompt = page.getByRole("region", { name: /DNA Digivolution available/i });
      await prompt.waitFor({ state: "visible" });
      for (const alias of ["blue", "green"]) {
        const material = page.locator(`[data-drop="perm-you"][data-id="${refs.permanentId(alias)}"]`);
        if (!(await material.locator(".game-permanent__material-order").count())) await material.click();
      }
      await prompt.getByRole("button", { name: "DNA Digivolve", exact: true }).click();
    } else await scenario.evolve("Paildramon", refs.permanentId("blue"));
    await scenario.resolveUntil(
      (state) =>
        !state.pendingDecision &&
        state.players[0]!.battleArea.some((perm) => perm.topCard.instanceId === refs.instanceId("paildramon")),
    );
    const state = await scenario.snapshot();
    const enemy = state.players[1]!.battleArea;
    expect(enemy.find((perm) => perm.permanentId === refs.permanentId("noSources"))!.isSuspended).toBe(true);
    expect(enemy.find((perm) => perm.permanentId === refs.permanentId("twoSources"))!.isSuspended).toBe(true);
    expect(enemy.find((perm) => perm.permanentId === refs.permanentId("threeSources"))!.isSuspended).toBe(dna);
    expect(enemy.find((perm) => perm.permanentId === refs.permanentId("fourSources"))!.isSuspended).toBe(false);
    expect(state.memory).toBe(dna ? 6 : 2);
    await scenario.healthy();
  });
}
