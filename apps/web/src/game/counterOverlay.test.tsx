// @vitest-environment jsdom
import {
  ANIMATION_SPEED_CHANNEL,
  CardInstance,
  CombatWindow,
  GameState,
  PlayerState,
  Permanent,
  Phase,
} from "@aegis/shared";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useState, type ComponentProps } from "react";
import { I18nProvider } from "../i18n";
import { CounterOverlay } from "./overlay/combat/CounterOverlay";
import { BlockOverlay } from "./overlay/combat/BlockOverlay";
import { AllianceOverlay } from "./overlay/combat/AllianceOverlay";
import { EvoCostChoiceOverlay } from "./overlay/choice/EvoCostChoiceOverlay";
import { GameScreen } from "./GameScreen";
import type { AegisRoom } from "../net/client";

function CounterHarness(
  props: Omit<ComponentProps<typeof CounterOverlay>, "selectedInstanceId" | "onSelectInstance" | "handInstanceIds"> & {
    handInstanceIds?: string[];
  },
) {
  const [selectedInstanceId, onSelectInstance] = useState<string>();
  const sources = [...new Set(props.eligibleCounters.map((choice) => choice.instanceId))];
  return (
    <>
      {sources.map((instanceId) => (
        <button key={instanceId} type="button" onClick={() => onSelectInstance(instanceId)}>
          {`pick ${instanceId}`}
        </button>
      ))}
      <CounterOverlay
        {...props}
        handInstanceIds={props.handInstanceIds ?? ["ace"]}
        selectedInstanceId={selectedInstanceId}
        onSelectInstance={onSelectInstance}
      />
    </>
  );
}

/** While a source is being picked in the hand or on the board, the rail is a region, not a dialog. */
function counterPickingRail() {
  const rail = screen.getByRole("region", { name: "Counter timing" });
  expect(rail.getAttribute("data-prompt-surface")).toBe("left");
  return within(rail);
}

function counterDialog() {
  const dialog = screen.getByRole("dialog", { name: "Counter timing" });
  expect(dialog.getAttribute("data-prompt-surface")).toBe("left");
  return within(dialog);
}

/** Stands in for tapping the card in the hand or on the board, where sources are picked. */
function pickSource(instanceId: string) {
  fireEvent.click(screen.getByRole("button", { name: `pick ${instanceId}` }));
}

function chooseHandAce() {
  pickSource("ace");
}

afterEach(cleanup);

function renderCombatGame(kind: "alliance" | "block" | "counter" = "alliance", mustBlock = false) {
  localStorage.clear();
  const state = new GameState();
  state.phase = Phase.Main;
  state.turnSeat = 0;
  for (const seat of [0, 1] as const) {
    const player = new PlayerState();
    player.seat = seat;
    player.sessionId = `session-${seat}`;
    state.players.push(player);
  }
  for (const [permanentId, cardId] of [
    ["attacker", "ST1-07"],
    ["ally", "ST1-09"],
    ["ineligible", "BT1-024"],
  ]) {
    const permanent = new Permanent();
    permanent.permanentId = permanentId!;
    permanent.controllerSeat = 0;
    permanent.topCard = new CardInstance();
    permanent.topCard.instanceId = `${permanentId}-top`;
    permanent.topCard.cardId = cardId!;
    permanent.baseDP = permanent.currentDP = 6000;
    state.players[0]!.battleArea.push(permanent);
  }
  state.combatWindow = new CombatWindow();
  state.combatWindow.kind = kind;
  state.combatWindow.mustBlock = mustBlock;
  state.combatWindow.attackerPermanentId = "attacker";
  state.combatWindow.seat = 0;
  state.combatWindow.permanentId = "attacker";
  state.combatWindow.eligiblePermanentIds.push("ally");
  state.combatWindow.eligibleCountersJson = JSON.stringify([
    { instanceId: "ally-top", effectKey: "first", description: "First counter" },
    { instanceId: "ineligible-top", effectKey: "second", description: "Second counter" },
  ]);
  const send = vi.fn<(type: string, payload: unknown) => void>();
  const room = {
    state,
    connection: { isOpen: true },
    send: (type: string, payload: unknown) => (type === ANIMATION_SPEED_CHANNEL ? undefined : send(type, payload)),
    onMessage: () => () => {},
  } as unknown as AegisRoom;
  const view = render(
    <I18nProvider>
      <GameScreen
        joinOptions={{ displayName: "You", deck: { mainDeck: [], eggDeck: [] } }}
        identityColor="Red"
        onExit={() => undefined}
        demoConnection={{
          room,
          status: "connected",
          state,
          events: [],
          batches: [],
          decision: undefined,
          acknowledgeDecision: () => undefined,
          error: undefined,
          sessionId: "session-0",
          roomCode: "",
        }}
      />
    </I18nProvider>,
  );
  const permanent = (id: string) =>
    view.container.querySelector<HTMLElement>(`[data-drop="perm-you"][data-id="${id}"]`)!;
  return { send, permanent };
}

it("selects only server-offered Alliance allies on the field", () => {
  const { send, permanent } = renderCombatGame();
  expect(screen.queryByRole("dialog", { name: "Alliance window" })).toBeNull();
  expect(screen.getByRole("region", { name: "Alliance window" })).toBeTruthy();
  fireEvent.click(permanent("ally"));
  fireEvent.click(screen.getByRole("button", { name: /Use Alliance/i }));
  expect(send).toHaveBeenCalledWith("respondAlliance", { allyPermanentId: "ally", rollbackRevision: 0 });
  expect(send).toHaveBeenCalledTimes(1);
});

it("passes Alliance without choosing a Digimon", () => {
  const { send } = renderCombatGame();
  fireEvent.click(screen.getByRole("button", { name: "Pass" }));
  expect(send).toHaveBeenCalledWith("respondAlliance", { allyPermanentId: undefined, rollbackRevision: 0 });
});

it("returns focus from board inspection to the unanswered evolution-cost choice", () => {
  const confirm = vi.fn<() => void>();
  const cancel = vi.fn<() => void>();
  render(
    <I18nProvider>
      <EvoCostChoiceOverlay
        evolvingCardId="ST1-07"
        baseCardId="BT1-010"
        memory={3}
        options={[{ type: "normal", label: "Red Lv.3", cost: 3 }]}
        onConfirm={confirm}
        onCancel={cancel}
      />
    </I18nProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "View board" }));
  expect(document.activeElement).toBe(screen.getByRole("button", { name: "Return to decision" }));
  fireEvent.click(screen.getByRole("button", { name: "Return to decision" }));
  expect(document.activeElement).toBe(screen.getByRole("button", { name: "Red Lv.3 · 3 memory, from 3 to 0" }));
  expect(confirm).not.toHaveBeenCalled();
  expect(cancel).not.toHaveBeenCalled();
});
it("shows blocker artwork and statistics, and preserves mandatory blocking", () => {
  const block = vi.fn<(permanentId: string) => void>();
  const decline = vi.fn<() => void>();
  const props = {
    attackerCardId: "ST1-03",
    blockers: [{ permanentId: "blocker", cardId: "ST1-07", currentDP: 6000, sourceCount: 2 }],
    onBlock: block,
    onDecline: decline,
  };
  const view = render(
    <I18nProvider>
      <BlockOverlay {...props} />
    </I18nProvider>,
  );
  expect(screen.queryByText(/is attacking/)).toBeNull();
  expect(screen.getAllByRole("img")).toHaveLength(2);
  fireEvent.click(screen.getByRole("button", { name: /6,000 DP/ }));
  expect(block).toHaveBeenCalledWith("blocker");
  const buttons = screen.getAllByRole("button");
  fireEvent.click(buttons[1]!);
  expect(decline).toHaveBeenCalledOnce();
  view.rerender(
    <I18nProvider>
      <BlockOverlay {...props} mustBlock />
    </I18nProvider>,
  );
  expect(screen.getAllByRole("button")).toHaveLength(2);
  block.mockClear();
  decline.mockClear();
  fireEvent.click(screen.getByRole("button", { name: "View board" }));
  expect(screen.queryByRole("dialog")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Return to decision" }));
  expect(screen.getByRole("dialog", { name: "Block window" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: /Take the attack/ })).toBeNull();
  expect(block).not.toHaveBeenCalled();
  expect(decline).not.toHaveBeenCalled();
});
it("picks a hand Counter in the hand and then its exact Blast target in the central dialog", () => {
  const activate = vi.fn<(instanceId: string, effectKey: string) => void>();
  const pass = vi.fn<() => void>();
  render(
    <I18nProvider>
      <CounterHarness
        eligibleCounters={[
          { instanceId: "ace", effectKey: "blast-digivolve:one", description: "Blast Digivolve" },
          { instanceId: "ace", effectKey: "blast-digivolve:two", description: "Blast Digivolve" },
          { instanceId: "other", effectKey: "blast-digivolve:one", description: "Blast Digivolve" },
        ]}
        handInstanceIds={["ace", "other"]}
        getCardId={(id) => (id === "ace" ? "EX10-023" : id === "two" ? "ST1-09" : "ST1-07")}
        onActivate={activate}
        onPass={pass}
      />
    </I18nProvider>,
  );
  const picking = counterPickingRail();
  expect(picking.getByText("Tap a card in your hand to use its [Counter].")).toBeTruthy();
  expect(picking.queryAllByRole("img")).toHaveLength(0);
  expect(picking.queryByRole("button", { name: /Quartzmon|Greymon/ })).toBeNull();
  chooseHandAce();
  expect(activate).not.toHaveBeenCalled();
  fireEvent.click(counterDialog().getByRole("button", { name: /MetalGreymon Blast Digivolve/ }));
  expect(activate).toHaveBeenCalledWith("ace", "blast-digivolve:two");
  fireEvent.click(counterDialog().getByRole("button", { name: "Pass Counter" }));
  expect(pass).toHaveBeenCalledOnce();
});

it("offers a lone Blast host as a central button reachable on a phone", () => {
  const activate = vi.fn<(instanceId: string, effectKey: string) => void>();
  render(
    <I18nProvider>
      <CounterHarness
        eligibleCounters={[{ instanceId: "ace", effectKey: "blast-digivolve:one", description: "Blast Digivolve" }]}
        getCardId={(id) => (id === "ace" ? "EX10-023" : "ST1-07")}
        onActivate={activate}
        onPass={() => undefined}
      />
    </I18nProvider>,
  );
  chooseHandAce();
  fireEvent.click(counterDialog().getByRole("button", { name: /Greymon Blast Digivolve/ }));
  expect(activate).toHaveBeenCalledWith("ace", "blast-digivolve:one");
});

it("keeps same-name Blast hosts and DNA routes distinct while deduplicating identical hand partners", () => {
  const activate = vi.fn<(instanceId: string, effectKey: string) => void>();
  const route = (host: string, partner: string) => `blast-dna-digivolve:${JSON.stringify([host, "ace", partner])}`;
  render(
    <I18nProvider>
      <CounterHarness
        eligibleCounters={[
          { instanceId: "ace", effectKey: route("ready", "partner-one"), description: "Blast DNA" },
          { instanceId: "ace", effectKey: route("ready", "partner-two"), description: "Blast DNA" },
          { instanceId: "ace", effectKey: route("resting", "partner-one"), description: "Blast DNA" },
        ]}
        getCardId={(id) => (id === "ace" ? "EX10-023" : id.startsWith("partner") ? "ST1-09" : "ST1-07")}
        onActivate={activate}
        onPass={() => undefined}
      />
    </I18nProvider>,
  );
  chooseHandAce();
  const hosts = counterDialog().getAllByRole("button", { name: /Greymon Blast DNA/ });
  expect(hosts).toHaveLength(2);
  expect(hosts[0]!.textContent).toContain("1 / 2");
  expect(hosts[1]!.textContent).toContain("2 / 2");
  fireEvent.click(hosts[1]!);
  expect(activate).toHaveBeenCalledWith("ace", route("resting", "partner-one"));
});

it("keeps distinct non-Blast counter effects reachable in the central dialog", () => {
  const activate = vi.fn<(instanceId: string, effectKey: string) => void>();
  render(
    <I18nProvider>
      <CounterHarness
        handInstanceIds={[]}
        eligibleCounters={[
          { instanceId: "source", effectKey: "first", description: "First counter" },
          { instanceId: "source", effectKey: "second", description: "Second counter" },
        ]}
        getCardId={() => "ST1-03"}
        onActivate={activate}
        onPass={() => undefined}
      />
    </I18nProvider>,
  );
  fireEvent.click(counterDialog().getByRole("button", { name: /First counter/ }));
  expect(activate).toHaveBeenCalledWith("source", "first");
  fireEvent.click(counterDialog().getByRole("button", { name: /Second counter/ }));
  expect(activate).toHaveBeenCalledWith("source", "second");
});

it("asks a lone field counter as a left yes/no prompt", () => {
  const activate = vi.fn<(instanceId: string, effectKey: string) => void>();
  const pass = vi.fn<() => void>();
  render(
    <I18nProvider>
      <CounterHarness
        handInstanceIds={[]}
        eligibleCounters={[
          {
            instanceId: "kentaurosmon",
            effectKey: "EX13-036/counter",
            description: "Place 1 of each player's Digimon",
          },
        ]}
        getCardId={() => "EX13-036"}
        onActivate={activate}
        onPass={pass}
      />
    </I18nProvider>,
  );
  const rail = screen.getByRole("dialog", { name: "Counter timing" });
  expect(rail.getAttribute("data-prompt-surface")).toBe("left");
  expect(within(rail).getByRole("img", { name: "Kentaurosmon" })).toBeTruthy();
  expect(within(rail).queryByText(/Place 1 of each player's Digimon/)).toBeNull();
  fireEvent.click(within(rail).getByRole("button", { name: "Activate" }));
  expect(activate).toHaveBeenCalledWith("kentaurosmon", "EX13-036/counter");
  fireEvent.click(within(rail).getByRole("button", { name: "Pass Counter" }));
  expect(pass).toHaveBeenCalledOnce();
});

it("picks between identical field counters on the board and cancels back without passing", () => {
  const activate = vi.fn<(instanceId: string, effectKey: string) => void>();
  const pass = vi.fn<() => void>();
  render(
    <I18nProvider>
      <CounterHarness
        handInstanceIds={[]}
        eligibleCounters={[
          { instanceId: "first-top", effectKey: "EX13-036/counter", description: "Kentaurosmon counter" },
          { instanceId: "second-top", effectKey: "EX13-036/counter", description: "Kentaurosmon counter" },
        ]}
        getCardId={() => "EX13-036"}
        fieldPermanentOf={(id) => id.replace("-top", "")}
        onActivate={activate}
        onPass={pass}
      />
    </I18nProvider>,
  );
  expect(counterPickingRail().queryAllByRole("img")).toHaveLength(0);
  pickSource("second-top");
  expect(activate).not.toHaveBeenCalled();
  const rail = within(screen.getByRole("dialog", { name: "Counter timing" }));
  fireEvent.click(rail.getByRole("button", { name: "Cancel" }));
  expect(pass).not.toHaveBeenCalled();
  pickSource("first-top");
  fireEvent.click(screen.getByRole("button", { name: "Activate" }));
  expect(activate).toHaveBeenCalledWith("first-top", "EX13-036/counter");
});

it.each([false, true])("uses server-authorized blockers on the field and preserves Collision (%s)", (mustBlock) => {
  const { send, permanent } = renderCombatGame("block", mustBlock);
  expect(screen.queryByRole("dialog", { name: "Block window" })).toBeNull();
  const rail = screen.getByRole("region", { name: "Block window" });
  const decline = within(rail).queryByRole("button", { name: /take the attack/i });
  expect(Boolean(decline)).toBe(!mustBlock);
  expect(within(rail).queryByRole("button", { name: /MetalGreymon/ })).toBeNull();
  fireEvent.click(permanent("ally"));
  expect(send).toHaveBeenCalledWith("declareBlock", { blockerPermanentId: "ally", rollbackRevision: 0 });
});

it("routes a field Counter picked on the board to the exact GameScreen intent", () => {
  const { send, permanent } = renderCombatGame("counter");
  expect(counterPickingRail().queryByRole("button", { name: /MetalTyrannomon/ })).toBeNull();
  fireEvent.click(permanent("ineligible"));
  expect(send).not.toHaveBeenCalled();
  expect(screen.getByRole("dialog", { name: "Counter timing" }).getAttribute("data-prompt-surface")).toBe("left");
  fireEvent.click(screen.getByRole("button", { name: "Activate" }));
  expect(send).toHaveBeenCalledWith("respondCounter", {
    sourceInstanceId: "ineligible-top",
    effectKey: "second",
    rollbackRevision: 0,
  });
});

it("puts the lone take-attack action on the left when no server-authorized blocker remains", () => {
  const decline = vi.fn<() => void>();
  render(
    <I18nProvider>
      <BlockOverlay blockers={[]} mustBlock onBlock={vi.fn<(id: string) => void>()} onDecline={decline} />
    </I18nProvider>,
  );
  const dialog = screen.getByRole("dialog", { name: "Block window" });
  expect(dialog.getAttribute("data-prompt-surface")).toBe("left");
  fireEvent.click(within(dialog).getByRole("button", { name: /take the attack/i }));
  expect(decline).toHaveBeenCalledOnce();
});

it("passes an empty Alliance window once without rendering a modal", () => {
  const pass = vi.fn<() => void>();
  const view = render(
    <I18nProvider>
      <AllianceOverlay allies={[]} onPass={pass} />
    </I18nProvider>,
  );
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(screen.queryByRole("region")).toBeNull();
  expect(pass).toHaveBeenCalledOnce();
  view.rerender(
    <I18nProvider>
      <AllianceOverlay allies={[]} onPass={pass} />
    </I18nProvider>,
  );
  expect(pass).toHaveBeenCalledOnce();
});

it("keeps the lone Counter pass action on the left when no legal route remains", () => {
  const pass = vi.fn<() => void>();
  const activate = vi.fn<(instanceId: string, effectKey: string) => void>();
  render(
    <I18nProvider>
      <CounterHarness eligibleCounters={[]} getCardId={() => undefined} onActivate={activate} onPass={pass} />
    </I18nProvider>,
  );
  expect(screen.queryByRole("region", { name: "Counter timing" })).toBeNull();
  const rail = screen.getByRole("dialog", { name: "Counter timing" });
  expect(rail.getAttribute("data-prompt-surface")).toBe("left");
  fireEvent.click(within(rail).getByRole("button", { name: "Pass Counter" }));
  expect(pass).toHaveBeenCalledOnce();
  expect(activate).not.toHaveBeenCalled();
});
