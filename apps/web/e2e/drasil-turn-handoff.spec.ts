import fixtureDrasilTurnHandoff from "../../api/src/engine/scenarios/drasil-turn-handoff.fixture";
import { test, expect } from "./scenario-page";

test("King Drasil's turn start does not wait on Gallantmon's DP expiry", async ({ scenario }) => {
  test.setTimeout(120_000);
  await scenario.openFixture(fixtureDrasilTurnHandoff, "normal", "none");
  // The bot plays out its whole turn, including Gallantmon's attack and security check.
  await expect
    .poll(
      async () => {
        const state = await scenario.snapshot();
        return state.turnSeat === 0 && state.turnCount >= fixtureDrasilTurnHandoff.turnCount + 2;
      },
      { timeout: 60_000 },
    )
    .toBe(true);
  await scenario.resolveUntil(
    (s) => s.turnSeat === 0 && s.phase === "Main" && !s.pendingDecision && s.players[0]!.breeding?.stack.length === 1,
  );
  await scenario.idle();
  const final = await scenario.snapshot();
  const gallantmon = final.players[1]!.battleArea.find((p) => p.topCard.cardId === "AD1-008")!;
  expect(gallantmon.currentDP).toBe(12000);
  const probe = await scenario.presentation();
  const kinds = probe.events.map((e) => e.kind);
  expect(kinds.indexOf("turnEnded")).toBeLessThan(kinds.lastIndexOf("effectTriggered"));
  const finished = probe.steps.filter((s) => s.phase === "finished");
  // The DP pulse runs on its own track; production v1.18.0 instead held the Draw banner
  // behind it for 27 s until two gate ceilings expired (healthy() rejects any expiry).
  for (const step of finished.filter((s) => s.id.startsWith("turn-banner-") || s.id.startsWith("phase-banner-")))
    expect(step.durationMs, step.id).toBeLessThan(6_000);
  await scenario.healthy();
});
