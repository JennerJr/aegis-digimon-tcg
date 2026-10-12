import waruFixture from "../../api/src/engine/scenarios/warumonzaemon-declined-play.fixture";
import kariFixture from "../../api/src/engine/scenarios/apocalymon-security-kari.fixture";
import { test, expect } from "./scenario-page";

test.use({ holdBotAfterTurn: 1 });

test("declining WaruMonzaemon's free play keeps it alive at turn end", async ({ scenario, page }) => {
  const refs = await scenario.openFixture(waruFixture, "normal", "none");
  await scenario.resolveUntil((state) => state.phase === "Main" && !state.pendingDecision);
  await scenario.play("WaruMonzaemon", "Digimon");
  await scenario.resolveUntil(
    (state) =>
      !state.pendingDecision &&
      state.players[0]!.battleArea.some((p) => p.topCard.instanceId === refs.instanceId("waru")),
    () => ({ accept: false, instanceIds: [] }),
  );
  await page.getByRole("button", { name: /^end turn$/i }).click();
  await scenario.resolveUntil((state) => state.turnSeat === 1 && !state.pendingDecision);
  const after = await scenario.snapshot();
  expect(after.players[0]!.battleArea.some((p) => p.topCard.instanceId === refs.instanceId("waru"))).toBe(true);
  expect(after.players[0]!.hand.some((card) => card.instanceId === refs.instanceId("master"))).toBe(true);
  await scenario.healthy();
});

test("security cards placed under Apocalymon allow Kari's memory reaction", async ({ scenario }) => {
  const refs = await scenario.openFixture(kariFixture, "normal", "none");
  await scenario.resolveUntil((state) => state.phase === "Main" && !state.pendingDecision);
  await scenario.play("Apocalymon", "Digimon");
  await scenario.resolveUntil(
    (state) =>
      !state.pendingDecision &&
      state.players[0]!.battleArea.some((p) => p.topCard.instanceId === refs.instanceId("apocalymon")),
    (decision) => {
      if (decision.kind === "selectCards" && decision.sourceCardId === "EX10-061") {
        const offered = decision.options.candidateInstanceIds ?? [];
        return { instanceId: offered.find((id) => id === refs.instanceId("metal") || id === refs.instanceId("sea")) };
      }
      return { accept: true };
    },
  );
  const after = await scenario.snapshot();
  expect(after.players[0]!.battleArea.find((p) => p.permanentId === refs.permanentId("kari"))!.isSuspended).toBe(true);
  expect(
    (await scenario.presentation()).events.some(
      (event) => event.kind === "effectTriggered" && event.sourceCardId === "BT4-097",
    ),
  ).toBe(true);
  await scenario.healthy();
});
