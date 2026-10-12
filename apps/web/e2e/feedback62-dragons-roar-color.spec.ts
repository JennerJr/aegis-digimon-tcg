import prepared0 from "../../api/src/engine/scenarios/dragons-roar-normal-colors.fixture";
import prepared1 from "../../api/src/engine/scenarios/dragons-roar-breeding.fixture";
import { fixtureVariant, fixtureInstanceId, fixturePermanentId } from "../../api/src/engine/scenario/references";

import { test, expect } from "./scenario-page";

const preparedFixtures = { "dragons-roar-normal-colors": prepared0, "dragons-roar-breeding": prepared1 };

test.use({ holdBotAfterTurn: 1 });

for (const mode of ["keep", "move", "normal-colors"] as const) {
  test(`Feedback #62: Dragon's Roar ${mode} respects breeding trait and ordinary color boundaries`, async ({
    scenario,
  }) => {
    const normalColors = mode === "normal-colors";
    await scenario.openFixture(
      fixtureVariant(preparedFixtures, normalColors ? "dragons-roar-normal-colors" : "dragons-roar-breeding"),
      "normal",
      mode === "move" ? "move" : "end",
    );
    await scenario.resolveUntil((state) => state.phase === "Main" && !state.pendingDecision);
    const before = await scenario.snapshot();
    const owner = before.players[0]!;
    const roar = owner.hand.find((card) => card.instanceId === fixtureInstanceId("feedback62-roar"))!;
    expect(roar.playableFromHand).toBe(mode !== "keep");
    expect(before.memory).toBe(6);

    if (mode === "keep") {
      await scenario.hand("Dragon's Roar");
      const dialog = scenario.page.getByRole("dialog", { name: "Dragon's Roar", exact: true });
      await expect(dialog).toBeVisible();
      await expect(scenario.page.getByRole("button", { name: "Play Option", exact: true })).toHaveCount(0);
      await dialog.getByRole("button", { name: "Close", exact: true }).click();
      const after = await scenario.snapshot();
      expect(after.memory).toBe(6);
      expect(after.phase).toBe("Main");
      expect(after.players[0]!.hand.map((card) => card.instanceId)).toEqual(owner.hand.map((card) => card.instanceId));
      expect(after.players[0]!.security.map((card) => card.instanceId)).toEqual([
        fixtureInstanceId("feedback62-security-top"),
        fixtureInstanceId("feedback62-security-bottom"),
      ]);
      expect(after.players[0]!.trash).toHaveLength(0);
      expect(after.players[0]!.breeding?.topCard.instanceId).toBe(fixtureInstanceId("dev-field-0-feedback62-source"));
      expect(
        after.players[1]!.battleArea.find(
          (permanent) => permanent.permanentId === fixturePermanentId("dev-perm-1-feedback62-target"),
        )!.currentDP,
      ).toBe(12000);
    } else {
      await scenario.play("Dragon's Roar", "Option");
      await scenario.resolveUntil(
        (state) =>
          !state.pendingDecision &&
          !state.players[0]!.hand.some((card) => card.instanceId === fixtureInstanceId("feedback62-roar")) &&
          state.players[1]!.battleArea.some(
            (permanent) =>
              permanent.permanentId === fixturePermanentId("dev-perm-1-feedback62-target") &&
              permanent.currentDP === 6000,
          ),
        (decision) => ({
          accept: true,
          instanceId: decision.options.candidateInstanceIds?.includes(
            fixturePermanentId("dev-perm-1-feedback62-target"),
          )
            ? fixturePermanentId("dev-perm-1-feedback62-target")
            : undefined,
        }),
      );
      const after = await scenario.snapshot();
      expect(after.memory).toBe(1);
      expect(after.phase).toBe("Main");
      expect(after.turnSeat).toBe(0);
      expect(after.players[0]!.deckCount).toBe(owner.deckCount);
      expect(after.players[0]!.hand.map((card) => card.instanceId)).toEqual(
        owner.hand
          .filter((card) => card.instanceId !== fixtureInstanceId("feedback62-roar"))
          .map((card) => card.instanceId),
      );
      expect(after.players[0]!.security.map((card) => card.instanceId)).toEqual([
        fixtureInstanceId("feedback62-security-bottom"),
        fixtureInstanceId("feedback62-roar"),
      ]);
      expect(after.players[0]!.trash.map((card) => card.instanceId)).toEqual([
        fixtureInstanceId("feedback62-security-top"),
      ]);
      if (normalColors) {
        expect(after.players[0]!.breeding?.topCard.instanceId).toBe(fixtureInstanceId("dev-field-0-feedback62-source"));
      } else {
        expect(after.players[0]!.breeding).toBeFalsy();
        expect(
          after.players[0]!.battleArea.some(
            (permanent) => permanent.permanentId === fixturePermanentId("dev-perm-0-feedback62-source"),
          ),
        ).toBe(true);
      }
    }
    await scenario.healthy();
  });
}
