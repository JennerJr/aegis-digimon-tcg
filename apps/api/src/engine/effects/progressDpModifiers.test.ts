import { describe, expect, it } from "vitest";
import { EffectDuration } from "@aegis/shared";
import { setupEngine } from "#api/engine/testkit/harness";
import { ModifierLedger } from "#api/engine/effects/modifiers";
import "#api/cards/BT24/BT24-018";

describe("Progress DP modifier suppression", () => {
  it.each(["targeted", "playerWide", "baseOverride"] as const)(
    "suppresses opposing %s modifiers only during the attack",
    async (mode) => {
      const s = setupEngine({ 0: { battleArea: [{ card: "BT24-018", as: "target" }] } });
      await s.ready();
      const target = s.perm("target");
      let attackerId: string | undefined = target.permanentId;
      const ledger = new ModifierLedger();
      ledger.bindContinuous(s.engine.continuous, () => attackerId);
      const provenance = { sourceSeat: 1 as const, sourceKinds: ["Digimon"] };
      const duration = EffectDuration.UntilOpponentTurnEnd;
      if (mode === "targeted") ledger.addDpModifier(s.state, target.permanentId, -3000, duration, provenance);
      if (mode === "playerWide") ledger.addPlayerDpModifier(s.state, 0, -3000, duration, provenance);
      if (mode === "baseOverride") ledger.addBaseDpOverride(s.state, target.permanentId, 3000, duration, provenance);
      ledger.recomputeDP(s.state, target.permanentId);
      expect(target.currentDP).toBe(target.baseDP);
      ledger.addDpModifier(s.state, target.permanentId, 1000, duration, { sourceSeat: 0, sourceKinds: ["Digimon"] });
      expect(target.currentDP).toBe(target.baseDP + 1000);
      attackerId = undefined;
      ledger.recomputeDP(s.state, target.permanentId);
      expect(target.currentDP).toBe((mode === "baseOverride" ? 3000 : target.baseDP - 3000) + 1000);
    },
  );
});
