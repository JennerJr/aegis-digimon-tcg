import fixture from "../../api/src/engine/scenarios/overlapping-evolution-recovery.fixture";
import { test, expect } from "./scenario-page";

for (const width of [390, 1440]) {
  for (const speed of ["normal", "slow"] as const) {
    test(`successive evolutions finish recovery and target selection at width=${width} speed=${speed}`, async ({
      scenario,
      page,
    }) => {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
      await page.addInitScript((dark) => localStorage.setItem("aegis:darkMode", String(dark)), width === 390);
      const refs = await scenario.openFixture(fixture, speed);
      await scenario.resolveUntil(
        (state) =>
          !state.pendingDecision &&
          state.phase === "Main" &&
          state.memory === 7 &&
          state.players[0]!.battleArea.some((p) => p.topCard.instanceId === refs.instanceId("securityAngel")),
        (decision) => ({
          instanceId: decision.options.candidateInstanceIds?.includes(refs.instanceId("securityAngel"))
            ? refs.instanceId("securityAngel")
            : refs.instanceId("replacement"),
        }),
      );
      await scenario.evolve("Angemon", refs.permanentId("secondBase"), true);
      await scenario.hand("MagnaAngemon");
      await expect
        .poll(async () =>
          (await scenario.snapshot()).players[0]!.battleArea.some(
            (p) => p.topCard.instanceId === refs.instanceId("secondEvolution"),
          ),
        )
        .toBe(true);
      const before = await scenario.presentation();
      expect(before.pending).toBeGreaterThan(0);
      await page.getByRole("button", { name: "Digivolve", exact: true }).click();
      await page.locator(`[data-drop="perm-you"][data-id="${refs.permanentId("angelBase")}"]`).click();
      await scenario.resolveUntil(
        (state) =>
          !state.pendingDecision &&
          state.players[0]!.securityCount === 6 &&
          state.players[0]!.battleArea.some((p) => p.topCard.instanceId === refs.instanceId("magna")),
        () => ({ instanceId: refs.permanentId("high") }),
      );
      const state = await scenario.snapshot();
      expect(state.players[1]!.battleArea.find((p) => p.permanentId === refs.permanentId("high"))!.currentDP).toBe(
        2000,
      );
      expect(state.memory).toBe(2);
      await scenario.healthy();
      const presentation = await scenario.presentation();
      const second = presentation.events.find((event) => event.kind === "digivolved" && event.cardId === "BT16-019");
      expect(second).toBeDefined();
    });
  }
}
