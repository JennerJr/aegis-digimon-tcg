import fixtureRaidImmuneAtratusmon from "../../api/src/engine/scenarios/raid-immune-atratusmon.fixture";
import { fixturePermanentId } from "../../api/src/engine/scenario/references";
import { test, expect } from "./scenario-page";

test.use({ holdBotAfterTurn: 4 });

test("Raid targets an immune Atratusmon and finishes battle without security checks", async ({ scenario }) => {
  await scenario.openFixture(fixtureRaidImmuneAtratusmon);
  await expect.poll(async () => (await scenario.snapshot()).turnSeat, { timeout: 60_000 }).toBe(0);
  await scenario.page.getByRole("button", { name: /^end breeding$/i }).click();
  await scenario.resolveUntil((s) => s.turnSeat === 0 && s.phase === "Main" && !s.pendingDecision);
  const before = await scenario.snapshot();
  const atratus = before.players[1]!.battleArea.find((p) => p.topCard.cardId === "ST23-09")!;
  expect(atratus.immuneToOpponentDigimonEffects).toBe(true);
  expect(atratus.isSuspended).toBe(false);
  await scenario.attack(fixturePermanentId("own-new-report-jupiter"));
  await scenario.resolveUntil(
    (s) => !s.pendingDecision && !s.combatWindow && s.players[1]!.battleArea.length === 0,
    (d) => ({ accept: !/Engage|Alliance/i.test(d.promptText), cardId: "ST23-09" }),
  );
  const probe = await scenario.presentation();
  expect(
    probe.events.some(
      (e) =>
        e.kind === "attackDeclared" &&
        e.redirected &&
        e.target.kind === "permanent" &&
        e.target.permanentId === atratus.permanentId,
    ),
  ).toBe(true);
  expect((await scenario.snapshot()).players[1]!.securityCount).toBe(5);
  expect((await scenario.snapshot()).players[0]!.battleArea[0]!.topCard.cardId).toBe("BT26-033");
  expect(probe.events.filter((e) => e.kind === "securityChecked")).toHaveLength(0);
  await scenario.healthy();
});
