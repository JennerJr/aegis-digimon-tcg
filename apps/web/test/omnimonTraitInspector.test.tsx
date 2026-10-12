// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { setupEngine, settle } from "@aegis-api/engine/testkit/harness.js";
import "@aegis-api/cards/BT20/BT20-102.js";
import { I18nProvider } from "../src/i18n";
import { saveLocale } from "@/i18n/saveLocale";
import { ArenaPermanentInspector } from "../src/game/ArenaPermanentInspector";
import { buildPermanentDetail } from "../src/game/permanentDetail";
import { Side } from "../src/game/side";
import type { Permanent } from "@aegis/shared";

beforeEach(() => localStorage.clear());
afterEach(cleanup);

function inspect(permanent: Permanent) {
  render(
    <I18nProvider>
      <ArenaPermanentInspector
        detail={buildPermanentDetail(permanent)}
        inspection={{ side: Side.Viewer, container: document.body }}
        onZoom={vi.fn<(cardId: string, artId?: string) => void>()}
        onClose={vi.fn<() => void>()}
      />
    </I18nProvider>,
  );
  return screen.getByRole("dialog").querySelector(".arena-permanent-inspector__identity")!.textContent!;
}

it.each(["en", "pt-BR"] as const)(
  "#5324: shows every printed BT20-102 trait after public digivolution (%s)",
  async (locale) => {
    saveLocale(locale);
    const s = setupEngine({
      0: {
        battleArea: [{ card: "BT5-086", as: "omnimon" }],
        hand: [{ card: "BT20-102", as: "omnimonX" }],
        deck: ["BT1-009", "BT1-009"],
      },
    });
    s.state.memory = 4;
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        instanceId: s.inst("omnimonX").instanceId,
        permanentId: s.perm("omnimon").permanentId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("omnimon").topCard.cardId === "BT20-102" && s.state.pendingDecision === undefined);
    expect(s.state.memory).toBe(2);
    expect(inspect(s.perm("omnimon"))).toContain(
      "Mega · Vaccine · Holy Warrior · X Antibody · Royal Knight · LIBERATOR",
    );
  },
);

it("#5324 sweep: shows both BT5-086 printed types without adding X Antibody", () => {
  const s = setupEngine({ 0: { battleArea: [{ card: "BT5-086", as: "omnimon" }] } });
  const identity = inspect(s.perm("omnimon"));
  expect(identity).toContain("Mega · Vaccine · Holy Warrior · Royal Knight");
  expect(identity).not.toContain("X Antibody");
  expect(identity).not.toContain("LIBERATOR");
});

it("#5324 control: a Tamer without printed traits has no invented or missing-value traits", () => {
  const s = setupEngine({ 0: { battleArea: [{ card: "BT9-092", as: "coolBoy" }] } });
  const identity = inspect(s.perm("coolBoy"));
  expect(identity).not.toContain("undefined");
  expect(identity).not.toContain(" · ");
  expect(identity).not.toContain("X Antibody");
});

it.each([
  ["BT18-102", "Mega · Hybrid · Vaccine · Shaman"],
  ["ST12-13", "Champion · Data · Virus · Puppet"],
])("#5324 sweep: keeps every printed form and attribute for %s", (cardId, printedTraits) => {
  const s = setupEngine({ 0: { battleArea: [{ card: cardId, as: "multiTrait" }] } });
  expect(inspect(s.perm("multiTrait"))).toContain(printedTraits);
});
