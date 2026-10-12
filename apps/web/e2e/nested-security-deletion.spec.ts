import fixture from "../../api/src/engine/scenarios/nested-security-deletion.fixture";
import { test, expect } from "./scenario-page";

for (const variant of [
  { width: 390, speed: "normal" },
  { width: 1440, speed: "normal" },
  { width: 390, speed: "slow" },
  { width: 1440, speed: "slow" },
] as const) {
  const { width, speed } = variant;
  test(`security removal resolves Imperialdramon's nested deletion without presentation expiry at width=${width} speed=${speed}`, async ({
    scenario,
    page,
  }) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    await page.addInitScript((dark) => localStorage.setItem("aegis:darkMode", String(dark)), width === 390);
    const refs = await scenario.openFixture(fixture, speed, "none");
    await expect(page.getByRole("button", { name: /^end breeding$/i })).toBeEnabled({ timeout: 30000 });
    await page.getByRole("button", { name: /^end breeding$/i }).click();
    await scenario.resolveUntil((state) => state.turnSeat === 0 && state.phase === "Main" && !state.pendingDecision);
    await scenario.play("Muchomon", "Digimon");
    await expect.poll(async () => (await scenario.snapshot()).memory).toBe(1);
    await scenario.idle();
    await scenario.play("DarkTyrannomon", "Digimon");
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
    expect(state.players[0]!.trash.map((card) => card.instanceId)).toContain(refs.instanceId("memoryPayment"));
    expect(state.players[0]!.battleArea.some((p) => p.topCard.instanceId === refs.instanceId("memoryPayment"))).toBe(
      false,
    );
    expect(state.players[0]!.hand.map((card) => card.instanceId)).toContain(refs.instanceId("apollomon"));
    expect(state.players[1]!.securityCount).toBe(5);
    await scenario.healthy();
  });
}
