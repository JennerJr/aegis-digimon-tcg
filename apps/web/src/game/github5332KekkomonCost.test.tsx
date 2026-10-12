// @vitest-environment jsdom
import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { type DecisionRequest, type DecisionResponse } from "@aegis/shared";
import { afterEach, expect, it, vi } from "vitest";
import { I18nProvider } from "../i18n";
import { createArenaDemoState } from "../dev/ArenaDemo";
import { buildInstanceIndex } from "./decisionModel";
import { decisionViewFor } from "./screen/model/decisionView";
import { decisionAllowsPick, nextDecisionPicks } from "./screen/model/decisionPicks";
import { DecisionPrompts } from "./screen/layout/DecisionPrompts";
import { intents } from "../net/intents";

afterEach(cleanup);

// Exact semantic dec-32 payload from the attributed Oracle match; no concealed identity is exposed.
const request: DecisionRequest = {
  decisionId: "dec-32",
  seat: 0,
  kind: "selectCards",
  promptText: "Kekkomon",
  sourceCardId: "ST23-01",
  sourceInstanceId: "s0-52",
  sourcePermanentId: "perm-8",
  options: {
    candidateInstanceIds: ["s0-29", "s0-28"],
    visibleInstanceIds: ["s0-29", "s0-28"],
    visibleCards: [
      { instanceId: "s0-29", cardId: "ST23-13" },
      { instanceId: "s0-28", cardId: "BT25-090" },
    ],
    min: 1,
    max: 1,
    timing: "WhenAttacking",
    isInherited: true,
    purpose: "cost",
    effectText:
      "[When Attacking] [Once Per Turn] By trashing the bottom face-down card from under any of your Tamers, this Digimon may digivolve into a [Glowing Dawn] trait Digimon card in the hand with the cost reduced by 2.",
  },
};

it.each([390, 1024])("#5332 cost picker maps Tamer tops and dispatches payment at width %s", (width) => {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
  const state = createArenaDemoState();
  const permanents = [...state.players].flatMap((player) => [...player.battleArea]);
  const source = permanents[0]!;
  source.permanentId = "perm-8";
  source.topCard.cardId = "ST23-06";
  source.topCard.instanceId = "gecko-top";
  source.isSuspended = true;
  for (const [index, id, cardId] of [
    [1, "s0-29", "ST23-13"],
    [2, "s0-28", "BT25-090"],
  ] as const) {
    const tamer = permanents[index]!;
    tamer.topCard.instanceId = id;
    tamer.topCard.cardId = cardId;
    tamer.isSuspended = true;
  }
  const view = decisionViewFor({
    decision: request,
    decisionAnimationsPending: false,
    decisionAsDialog: true,
    viewerSeat: 0,
    events: [],
    state,
    instanceIndex: buildInstanceIndex(state, 0),
    permanents,
    breedingPermanents: [],
    handInstanceIds: [...state.players[0]!.hand].map((card) => card.instanceId),
  });
  expect(view.answerOnBoard).toBe(true);
  expect(view.decisionHighlightPermanentId).toBe("perm-8");
  expect(view.decisionVisible.map(({ instanceId, cardId, zone }) => ({ instanceId, cardId, zone }))).toEqual([
    { instanceId: "s0-29", cardId: "ST23-13", zone: "battle" },
    { instanceId: "s0-28", cardId: "BT25-090", zone: "battle" },
  ]);
  const send = vi.fn<(type: string, payload: unknown) => void>();
  const room = { state, send, connection: { isOpen: true } } as unknown as Parameters<
    typeof intents.respondDecision
  >[0];
  function Picker() {
    const [picks, setPicks] = useState<string[]>([]);
    const allows = (instanceId: string) => decisionAllowsPick({ ...view, instanceId, picks });
    const toggle = (instanceId: string) => {
      if (allows(instanceId))
        setPicks((current) => nextDecisionPicks({ picks: current, instanceId, max: view.decisionMax }));
    };
    return (
      <>
        {/* Physical-card event adapter uses top instance first, matching GameScreen. */}
        {permanents.slice(0, 3).map((perm) => {
          const id = [perm.topCard.instanceId, perm.permanentId].find((candidate) =>
            view.decisionSelectable.has(candidate),
          );
          return (
            <button key={perm.permanentId} disabled={!id || !allows(id)} onClick={() => id && toggle(id)}>
              {perm.topCard.instanceId}
            </button>
          );
        })}
        <DecisionPrompts
          decision={request}
          answerOnBoard={view.answerOnBoard}
          permanents={permanents}
          sourceCardId={view.decisionSourceCardId}
          candidates={view.decisionVisible}
          allowsPick={allows}
          picks={picks}
          min={view.decisionMin}
          max={view.decisionMax}
          triggerDetails={[]}
          opponentSecurityCount={2}
          onTogglePick={toggle}
          onRespond={(response: DecisionResponse) => intents.respondDecision(room, request.decisionId, response)}
          onOpenDialog={() => {}}
        />
      </>
    );
  }
  render(
    <I18nProvider>
      <Picker />
    </I18nProvider>,
  );
  expect((screen.getByRole("button", { name: "gecko-top" }) as HTMLButtonElement).disabled).toBe(true);
  expect((screen.getByRole("button", { name: "Confirm targets" }) as HTMLButtonElement).disabled).toBe(true);
  for (const id of ["s0-29", "s0-28"]) {
    fireEvent.click(screen.getByRole("button", { name: id }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm targets" }));
    expect(send).toHaveBeenLastCalledWith("respondDecision", {
      rollbackRevision: 0,
      decisionId: "dec-32",
      response: { kind: "selectCards", instanceIds: [id] },
    });
  }
});
