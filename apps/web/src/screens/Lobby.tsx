import { communityApi } from "@/community/client";
import { communityDeckListing } from "@/community/communityDeckListing";
/* Lobby / matchmaking. Pick a deck and enter the queue. "Quick Match" waits for a
   second human client; "Practice vs AI" seats a bot automatically server-side;
   "Private Match" creates or joins a code-locked room. A sticky bar keeps the
   chosen deck and the button that starts the chosen mode in reach while the
   player scrolls the deck picker. */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  allCards,
  MATCH_TIMER_REFILL_SECONDS,
  type MatchBestOf,
  type MatchTimerOptions,
  formatPairViolations,
  formatCopyLimit,
  deckFormat,
  formatIsUnlimited,
  type DeckFormat,
  getCardDefinition,
  isBetaOnlyCard,
  sharedCardNumberGroups,
  deckLegality,
} from "@aegis/shared";
import {
  Alert,
  Button,
  Dialog,
  Eyebrow,
  Field,
  IconButton,
  type PlayerIdentity,
  type Screen,
} from "../design/primitives";
import { CoverThumb } from "../design/cards";
import { Panel } from "../design/surfaces";
import { Icons, type IconComponent } from "../design/icons";
import { FAMOUS_DECKS, FAMOUS_DECK_GROUPS, displayCoverCard, selectableDecks, type DeckListing } from "../game/decks";
import { useTranslation, type Translate } from "../i18n";
import { RankedStart } from "../account/RankedStart";
import { RANKED_ENABLED } from "../features";
import { DeckColorDots, DeckPicker } from "./DeckPicker";
import { FamousDeckListDialog } from "./FamousDeckListDialog";
import { DeckFormatSelector, deckFormatLabel } from "./DeckFormatSelector";
import { MatchFormatSettings } from "./MatchFormatSettings";
import { RollbackSettings } from "@/screens/RollbackSettings";
import { MatchTimerSettings } from "./MatchTimerSettings";
import { loadMatchFormatPreference, saveMatchFormatPreference } from "./matchFormatPreference";
import "./lobby.css";
import { lookupPrivateRoom } from "../net/client";
import { SpectatorPanel } from "./SpectatorPanel";

/** The private room a finished match returns to. Its host reopens it under the same code. */
export interface PrivateRoom {
  code: string;
  host: boolean;
  unlimited?: boolean;
  format?: DeckFormat;
}

export type StartMode =
  | "casual"
  | "unlimited"
  | "ranked"
  | "beta"
  | "bot"
  | "private_host"
  | "private_guest"
  | "spectator";
export type RandomDeckPool = "mine" | "famous" | "all";

export function deckHasBetaCards(deck: DeckListing): boolean {
  return [...deck.mainDeck, ...deck.eggDeck].some((id) => {
    const card = getCardDefinition(id);
    return card !== undefined && isBetaOnlyCard(card);
  });
}

export function randomDeckPool(
  personalDecks: readonly DeckListing[],
  scope: RandomDeckPool,
  betaAllowed = false,
  unlimited = false,
  format?: DeckFormat,
): DeckListing[] {
  const candidates =
    scope === "mine" ? personalDecks : scope === "famous" ? FAMOUS_DECKS : selectableDecks(personalDecks);
  const eligible = candidates.filter(
    (deck) => deckLegality(deck, { unlimited, format }).legal && (betaAllowed || !deckHasBetaCards(deck)),
  );
  return [...new Map(eligible.map((deck) => [deck.id, deck])).values()];
}

export function randomDeckId(decks: readonly DeckListing[], random = Math.random): string | undefined {
  if (decks.length === 0) return undefined;
  return decks[Math.floor(random() * decks.length)]?.id;
}

interface Mode {
  key: string;
  title: string;
  desc: string;
  icon: IconComponent;
  meta: string;
  available: boolean;
}

/** The one button that starts the chosen mode; it lives in the sticky deck bar. */
interface LaunchAction {
  label: string;
  shortLabel: string;
  /** Matches only other beta decks: flagged with a tag so the label, and the bar's layout, stay put. */
  beta?: boolean;
  icon: IconComponent;
  disabled: boolean;
  onClick: () => void;
}

const ACTIVE_DECK_CARD_GAP = 12;

/* Scrolls only the lobby's own scroller: `scrollIntoView` would also move every
   scrollable ancestor, and the app stage around the lobby is one. The card is
   centred in the part the sticky deck bar (measured where it sticks, since it
   may not be stuck yet) and the bottom nav padding leave visible, top edge first
   when it does not fit. */
function scrollToActiveDeckCard() {
  const card = document.querySelector<HTMLElement>(".lobby-content .deck-list-card.is-active");
  const scroller = card?.closest<HTMLElement>(".lobby-page");
  if (!card || !scroller) return;
  const collapsedGroup = card.closest("details");
  if (collapsedGroup && !collapsedGroup.open) collapsedGroup.open = true;
  const scrollerBox = scroller.getBoundingClientRect();
  const stickyBar = scroller.querySelector<HTMLElement>(".lobby-active-strip");
  const stickyBottom = stickyBar
    ? (Number.parseFloat(getComputedStyle(stickyBar).top) || 0) + stickyBar.offsetHeight
    : 0;
  const visibleTop = scrollerBox.top + stickyBottom + ACTIVE_DECK_CARD_GAP;
  const visibleBottom = scrollerBox.bottom - (Number.parseFloat(getComputedStyle(scroller).paddingBottom) || 0);
  const cardBox = card.getBoundingClientRect();
  const centringOffset = cardBox.top + cardBox.height / 2 - (visibleTop + visibleBottom) / 2;
  scroller.scrollTop += Math.min(centringOffset, cardBox.top - visibleTop);
}

const modesFor = (t: Translate): Mode[] => [
  {
    key: "casual",
    title: t("lobby.mode.casual"),
    desc: t("lobby.mode.casualDesc"),
    icon: Icons.Swords,
    meta: t("lobby.mode.casualMeta"),
    available: true,
  },
  {
    key: "practice",
    title: t("lobby.mode.practice"),
    desc: t("lobby.mode.practiceDesc"),
    icon: Icons.Bot,
    meta: t("lobby.mode.practiceMeta"),
    available: true,
  },
  {
    key: "private",
    title: t("lobby.mode.private"),
    desc: t("lobby.mode.privateDesc"),
    icon: Icons.Link2,
    meta: t("lobby.mode.privateMeta"),
    available: true,
  },
];

export function Lobby({
  player,
  decks,
  borrowedDeck,
  onBorrowCommunityDeck,
  onOpenCommunityDeck,
  accountId,
  activeDeckId,
  onSelectDeck,
  onCopyDeck,
  onEditDeck,
  onNav,
  onStart: onStartRequested,
  invitedRoomCode,
  privateRoom,
  onLeavePrivateRoom,
  timerOptions,
  onTimerOptionsChange,
  bestOf: initialBestOf,
  onBestOfChange,
  allowRollback = false,
  onAllowRollbackChange,
}: {
  allowRollback?: boolean;
  onAllowRollbackChange?: (allow: boolean) => void;
  timerOptions?: MatchTimerOptions;
  onTimerOptionsChange?: (options: Required<MatchTimerOptions>) => void;
  bestOf?: MatchBestOf;
  onBestOfChange?: (bestOf: MatchBestOf) => void;
  player: PlayerIdentity;
  decks: DeckListing[];
  /** A community deck picked to play with; selectable like a preset but never saved. */
  borrowedDeck?: DeckListing;
  onBorrowCommunityDeck?: (id: string) => void;
  onOpenCommunityDeck?: (id: string) => void;
  /** The signed-in account, so community tiles can be liked from the picker. */
  accountId?: string;
  activeDeckId: string;
  onSelectDeck: (id: string) => void;
  onCopyDeck: (deck: DeckListing) => void;
  onEditDeck?: (deck: DeckListing) => void;
  onNav: (s: Screen) => void;
  onStart: (
    mode: StartMode,
    roomCode?: string,
    botDeckId?: string,
    betaBattleMode?: boolean,
    deckId?: string | DeckListing,
    unlimited?: boolean,
    format?: DeckFormat,
  ) => void;
  /** A code carried in by an invite link; opens the private join form with it filled in. */
  invitedRoomCode?: string;
  privateRoom?: PrivateRoom;
  onLeavePrivateRoom?: () => void;
}) {
  const { t } = useTranslation();
  const MODES = modesFor(t);
  const [timer, setTimer] = useState<Required<MatchTimerOptions>>(() => ({
    matchTimer: timerOptions?.matchTimer ?? true,
    timerStartSeconds: timerOptions?.timerStartSeconds ?? 300,
    timerRefillSeconds: MATCH_TIMER_REFILL_SECONDS,
  }));
  function changeTimer(options: Required<MatchTimerOptions>) {
    setTimer(options);
    onTimerOptionsChange?.(options);
  }
  const [bestOf, setBestOf] = useState<MatchBestOf>(() => initialBestOf ?? loadMatchFormatPreference());
  function changeBestOf(next: MatchBestOf) {
    setBestOf(next);
    saveMatchFormatPreference(next);
    onBestOfChange?.(next);
  }
  const [selectedFormat, setSelectedFormat] = useState<DeckFormat>(() =>
    privateRoom
      ? deckFormat(privateRoom.format, privateRoom.unlimited)
      : deckFormat(decks.find((deck) => deck.id === activeDeckId)?.format),
  );
  const [mode, setMode] = useState(invitedRoomCode || privateRoom ? "private" : "casual");
  const [betaConfirmation, setBetaConfirmation] = useState<"beta" | "bot" | null>(null);
  const [privateSub, setPrivateSub] = useState<"create" | "join">(invitedRoomCode ? "join" : "create");
  const [roomCodeInput, setRoomCodeInput] = useState(invitedRoomCode ?? "");
  // "" is the random pool; any other value is a famous-deck preset id the bot will play.
  const [botDeckId, setBotDeckId] = useState("");
  const [guestRules, setGuestRules] = useState<{ code: string; unlimited: boolean; format?: DeckFormat }>();
  const [guestLookupFailed, setGuestLookupFailed] = useState(false);
  const guestCode = privateRoom?.code ?? roomCodeInput;
  const privateGuest = mode === "private" && (privateRoom ? !privateRoom.host : privateSub === "join");
  useEffect(() => {
    if (!privateGuest || privateRoom) return;
    let cancelled = false;
    setGuestRules(undefined);
    setGuestLookupFailed(false);
    if (guestCode.length === 6) {
      void lookupPrivateRoom(guestCode)
        .then((rules) => {
          if (!cancelled) setGuestRules({ code: guestCode, unlimited: rules.unlimited, format: rules.format });
        })
        .catch(() => {
          if (!cancelled) setGuestLookupFailed(true);
        });
    }
    return () => {
      cancelled = true;
    };
  }, [privateGuest, privateRoom, guestCode]);
  const format: DeckFormat =
    mode === "private" && privateRoom
      ? deckFormat(privateRoom.format, privateRoom.unlimited)
      : privateGuest
        ? deckFormat(guestRules?.format, guestRules?.unlimited)
        : selectedFormat;
  const unlimited = formatIsUnlimited(format);
  function changeFormat(next: DeckFormat) {
    setSelectedFormat(next);
    const preset = FAMOUS_DECKS.find((deck) => deck.id === botDeckId);
    if (preset && !deckLegality(preset, { format: next }).legal) setBotDeckId("");
  }
  const banlistLimit = (id: string) => formatCopyLimit(id, format);
  const onStart = useCallback(
    (...args: Parameters<typeof onStartRequested>) => {
      if (args[0] === "ranked") {
        onStartRequested("ranked", args[1], args[2], args[3], args[4], false, "standard");
        return;
      }
      if (args[0] === "spectator") {
        onStartRequested(...args);
        return;
      }
      if (unlimited) {
        const startMode = args[0] === "casual" ? "unlimited" : args[0];
        if (format === "unlimited") {
          if (startMode === "unlimited" && args.length === 1) onStartRequested(startMode);
          else
            onStartRequested(startMode, args[1], args[2], args[3], args[4], startMode === "unlimited" ? args[5] : true);
        } else onStartRequested(startMode, args[1], args[2], args[3], args[4], true, format);
        return;
      }
      if (format === "standard") {
        onStartRequested(...args);
        return;
      }
      onStartRequested(args[0], args[1], args[2], args[3], args[4], args[5], format);
    },
    [onStartRequested, format, unlimited],
  );
  const randomDrawVersion = useRef(0);
  const [randomDrawing, setRandomDrawing] = useState(false);
  const [randomError, setRandomError] = useState(false);
  const [randomSelected, setRandomSelected] = useState(false);
  const [randomPoolScope, setRandomPoolScope] = useState<RandomDeckPool>("all");
  const [viewedDeck, setViewedDeck] = useState<DeckListing | null>(null);
  const [betaQueueChosen, setBetaQueueChosen] = useState(false);
  // Which modes route an unreleased-card deck into the separate beta queue.
  const betaQueueMode =
    (format === "standard" && (mode === "casual" || mode === "practice")) ||
    (format === "unlimited" && mode === "practice");
  // A private room is invite-only and both seats opt in by sharing the code, so it takes
  // an unreleased-card deck without the queue routing a public match needs.
  const betaAllowed = betaQueueMode || mode === "private";
  const userDecks = useMemo(() => {
    return decks
      .map((deck) => ({
        deck,
        legal: deckLegality(deck, { unlimited, format }).legal && (betaAllowed || !deckHasBetaCards(deck)),
      }))
      .sort((a, b) => Number(b.legal) - Number(a.legal));
  }, [decks, betaAllowed, unlimited, format]);
  const editDeck = useCallback(
    (deck: DeckListing) => {
      if (onEditDeck) {
        onEditDeck(deck);
        return;
      }
      onSelectDeck(deck.id);
      onNav("deck");
    },
    [onEditDeck, onSelectDeck, onNav],
  );
  const buildDeck = useCallback(() => onNav("deck"), [onNav]);
  const pickCommunityDeck = useCallback(
    (id: string) => {
      setRandomSelected(false);
      onBorrowCommunityDeck?.(id);
    },
    [onBorrowCommunityDeck],
  );
  const openCommunityDeck = useCallback((id: string) => onOpenCommunityDeck?.(id), [onOpenCommunityDeck]);
  const availableDecks = borrowedDeck ? [borrowedDeck, ...selectableDecks(decks)] : selectableDecks(decks);
  const active = availableDecks.find((d) => d.id === activeDeckId) ?? availableDecks[0];
  const activeCollection = FAMOUS_DECK_GROUPS.find((group) =>
    group.decks.some((deck) => deck.id === active?.id),
  )?.collection;
  const activeIsPreset = activeCollection !== undefined;
  const activeIsBorrowed = borrowedDeck !== undefined && active?.id === borrowedDeck.id;
  const vsBot = mode === "practice";
  const banViolations = useMemo(() => {
    if (!active || unlimited) return [];
    const cardIds = [...active.mainDeck, ...active.eggDeck];
    const counts = new Map<string, number>();
    for (const id of cardIds) counts.set(id, (counts.get(id) ?? 0) + 1);
    const violations = [...counts.entries()]
      .filter(([id, n]) => n > banlistLimit(id))
      .map(([id, n]) => ({ id, n, cap: banlistLimit(id) }));
    for (const [, members] of sharedCardNumberGroups(cardIds)) {
      if (members.length < 2) continue;
      const n = members.reduce((sum, id) => sum + (counts.get(id) ?? 0), 0);
      const cap = Math.min(...members.map(banlistLimit));
      if (n > cap) violations.push({ id: members.join(" + "), n, cap });
    }
    return violations;
  }, [active, unlimited, format]);
  const pairViolations = useMemo(
    () => (active && !unlimited ? formatPairViolations([...active.mainDeck, ...active.eggDeck], format) : []),
    [active, unlimited, format],
  );
  const customBotDeck =
    vsBot && botDeckId.startsWith("mine:") ? decks.find((deck) => deck.id === botDeckId.slice(5)) : undefined;
  const botPreview = vsBot
    ? (customBotDeck ?? FAMOUS_DECK_GROUPS.flatMap((group) => group.decks).find((deck) => deck.id === botDeckId))
    : undefined;
  const betaCards = useMemo(
    () =>
      active
        ? [
            ...new Set([
              ...active.mainDeck,
              ...active.eggDeck,
              ...(customBotDeck?.mainDeck ?? []),
              ...(customBotDeck?.eggDeck ?? []),
            ]),
          ].filter((id) => {
            const card = getCardDefinition(id);
            return card !== undefined && isBetaOnlyCard(card);
          })
        : [],
    [active, customBotDeck],
  );
  const betaEnabled =
    betaQueueMode &&
    ((!randomSelected && betaCards.length > 0) || (customBotDeck !== undefined && deckHasBetaCards(customBotDeck)));
  const betaPeriod = useMemo(() => allCards().some((card) => isBetaOnlyCard(card)), []);
  // While a set is in preview, a deck without its cards may still join the beta queue on request.
  const betaOptional = betaPeriod && betaQueueMode && (randomSelected || betaCards.length === 0);
  const betaOptedIn = betaOptional && betaQueueChosen;
  const deckLegal =
    !!active &&
    active.mainDeck.length === 50 &&
    active.eggDeck.length <= 5 &&
    deckLegality(active, { unlimited, format }).legal &&
    banViolations.length === 0 &&
    pairViolations.length === 0 &&
    (betaCards.length === 0 || betaAllowed);
  const randomPool = useMemo(
    () => randomDeckPool(decks, randomPoolScope, betaAllowed, unlimited, format),
    [decks, randomPoolScope, betaAllowed, unlimited, format],
  );
  const localRandomPoolLabel = t(randomPool.length === 1 ? "lobby.randomPoolOne" : "lobby.randomPool", {
    count: randomPool.length,
  });
  const randomPoolLabel = randomPoolScope === "all" ? t("lobby.randomCommunityPool") : localRandomPoolLabel;
  useEffect(() => {
    setRandomDrawing(false);
    setRandomError(false);
    return () => {
      randomDrawVersion.current += 1;
    };
  }, [mode, format, randomPoolScope, randomSelected, betaAllowed]);
  const selectionLegal =
    !randomDrawing &&
    (randomSelected ? randomPoolScope === "all" || randomPool.length > 0 : deckLegal) &&
    (!privateGuest || !!privateRoom || guestRules?.code === guestCode) &&
    (!customBotDeck || deckLegality(customBotDeck, { unlimited, format }).legal);
  const selectDeck = useCallback(
    (deckId: string) => {
      setRandomSelected(false);
      onSelectDeck(deckId);
    },
    [onSelectDeck],
  );
  const start = useCallback(
    async (startMode: StartMode, code?: string, requestedBotDeckId?: string, requestedBetaBattleMode?: boolean) => {
      if (randomSelected) {
        if (randomDrawing) return;
        const drawVersion = ++randomDrawVersion.current;
        setRandomDrawing(true);
        setRandomError(false);
        const pool = startMode === "ranked" ? randomPool.filter((deck) => !deckHasBetaCards(deck)) : randomPool;
        const drawnId = randomDeckId(pool);
        let drawn = pool.find((deck) => deck.id === drawnId);
        try {
          if (randomPoolScope === "all") {
            const result = await communityApi.randomDeck({
              format: startMode === "ranked" ? "standard" : format,
              betaAllowed: startMode !== "ranked" && betaAllowed,
            });
            if (result.deck && Math.random() * (pool.length + result.eligibleCount) < result.eligibleCount)
              drawn = communityDeckListing(result.deck);
          }
        } catch {
          if (drawVersion === randomDrawVersion.current) setRandomError(true);
          return;
        } finally {
          if (drawVersion === randomDrawVersion.current) setRandomDrawing(false);
        }
        if (drawVersion !== randomDrawVersion.current) return;
        if (!drawn) {
          setRandomError(true);
          return;
        }
        const betaBattleMode =
          betaQueueMode && (deckHasBetaCards(drawn) || (customBotDeck !== undefined && deckHasBetaCards(customBotDeck)))
            ? true
            : requestedBetaBattleMode;
        const queueMode = betaBattleMode && startMode === "casual" ? "beta" : startMode;
        onStart(
          queueMode,
          code,
          requestedBotDeckId,
          betaBattleMode,
          drawn.community ? drawn : drawn.id,
          ...(unlimited && queueMode !== "unlimited" ? ([true] as const) : []),
        );
        return;
      }
      const selectedDeckId = active?.id;
      if (!selectedDeckId) return;
      if (unlimited && startMode !== "unlimited") {
        onStart(startMode, code, requestedBotDeckId, requestedBetaBattleMode, undefined, true);
      } else if (requestedBetaBattleMode !== undefined) {
        onStart(startMode, code, requestedBotDeckId, requestedBetaBattleMode);
      } else if (requestedBotDeckId !== undefined) {
        onStart(startMode, code, requestedBotDeckId);
      } else if (code !== undefined) {
        onStart(startMode, code);
      } else {
        onStart(startMode);
      }
    },
    [
      active?.id,
      betaQueueMode,
      onStart,
      randomPool,
      randomSelected,
      customBotDeck,
      unlimited,
      randomDrawing,
      randomPoolScope,
      format,
      betaAllowed,
    ],
  );
  const launch: LaunchAction | null =
    mode === "private" && privateRoom
      ? {
          label: t(privateRoom.host ? "lobby.reopenRoom" : "lobby.rejoinRoom"),
          shortLabel: t(privateRoom.host ? "redesign.play.short.reopen" : "redesign.play.short.rejoin"),
          icon: Icons.Swords,
          disabled: !selectionLegal,
          onClick: () => start(privateRoom.host ? "private_host" : "private_guest", privateRoom.code),
        }
      : mode === "private" && privateSub === "create"
        ? {
            label: t("lobby.createRoom"),
            shortLabel: t("lobby.create"),
            icon: Icons.Link2,
            disabled: !selectionLegal,
            onClick: () => start("private_host"),
          }
        : mode === "private"
          ? {
              label: t("lobby.joinRoom"),
              shortLabel: t("lobby.join"),
              icon: Icons.LogIn,
              disabled: !selectionLegal || roomCodeInput.length < 4,
              onClick: () => start("private_guest", roomCodeInput),
            }
          : vsBot
            ? {
                label: t("lobby.playVsBot"),
                shortLabel: t("redesign.play.short.bot"),
                icon: Icons.Bot,
                disabled: !selectionLegal,
                onClick: () =>
                  betaEnabled
                    ? setBetaConfirmation("bot")
                    : start("bot", undefined, botDeckId || undefined, betaOptedIn),
              }
            : betaEnabled || betaOptedIn
              ? {
                  label: t("lobby.enterQueue"),
                  shortLabel: t("redesign.play.short.queue"),
                  beta: true,
                  icon: Icons.Swords,
                  disabled: !selectionLegal,
                  onClick: () =>
                    betaEnabled ? setBetaConfirmation("beta") : start("beta", undefined, undefined, true),
                }
              : RANKED_ENABLED && format === "standard"
                ? // RankedStart owns its ranked toggle and button, so it stays in the setup panel.
                  null
                : {
                    label: t("lobby.enterQueue"),
                    shortLabel: t("redesign.play.short.queue"),
                    icon: Icons.Swords,
                    disabled: !selectionLegal,
                    onClick: () => start(unlimited ? "unlimited" : "casual"),
                  };
  const deckStatus = deckLegal
    ? { tone: "legal", label: t("redesign.play.legal") }
    : pairViolations.length > 0 || banViolations.length > 0
      ? { tone: "banned", label: t("redesign.play.banlistIssue") }
      : { tone: "draft", label: t("redesign.play.draft") };
  const modeTitle = MODES.find((m) => m.key === mode)?.title;

  return (
    <main className="lobby-page">
      <div className="lobby-content aegis-page-sheet">
        {randomError ? <Alert tone="danger">{t("lobby.randomFailed")}</Alert> : null}
        {randomDrawing ? <p role="status">{t("lobby.randomDrawing")}</p> : null}
        <Panel as="section" className="lobby-active-strip" aria-label={t("lobby.battleDeck")}>
          {randomSelected ? (
            <div className="lobby-active-strip__jump">
              <span className="lobby-active-strip__thumb lobby-active-strip__thumb--mystery">
                <Icons.Dices size={22} />
              </span>
              <span className="lobby-active-strip__text">
                <span className="lobby-active-strip__eyebrow">{t("lobby.battleDeck")}</span>
                <span className="lobby-active-strip__name">{t("lobby.randomDeck")}</span>
                <span className="lobby-active-strip__meta">{randomPoolLabel}</span>
              </span>
            </div>
          ) : active ? (
            <button type="button" className="lobby-active-strip__jump" onClick={scrollToActiveDeckCard}>
              <span className="lobby-active-strip__thumb">
                <CoverThumb
                  key={displayCoverCard(active)}
                  coverCardId={displayCoverCard(active)}
                  sigilColor={active.color}
                  sigilSize={22}
                />
              </span>
              <span className="lobby-active-strip__text">
                <span className="lobby-active-strip__eyebrow">{t("lobby.battleDeck")}</span>
                <span className="lobby-active-strip__name">{active.name}</span>
                <span className="lobby-active-strip__meta">
                  <DeckColorDots deck={active} />
                  <span className="lobby-active-strip__counts">
                    {t("redesign.play.deckCounts", { main: active.mainDeck.length, egg: active.eggDeck.length })}
                  </span>
                  <span className="lobby-active-strip__status" data-tone={deckStatus.tone}>
                    {deckLegal ? <Icons.Check size={13} /> : null}
                    {deckStatus.label}
                  </span>
                  {bestOf === 3 && (mode === "casual" || (mode === "private" && privateSub === "create")) ? (
                    <span className="lobby-timer-summary">
                      <Icons.Trophy size={13} /> {t("lobby.format.enabled")}
                    </span>
                  ) : null}
                  {timer.matchTimer && (mode === "casual" || (mode === "private" && privateSub === "create")) ? (
                    <span className="lobby-timer-summary">
                      <Icons.Clock size={13} /> {t("lobby.timer.enabled")}
                    </span>
                  ) : null}
                  {activeIsPreset ? (
                    <span className="lobby-active-strip__source">
                      {t("lobby.presetSource", { collection: activeCollection })}
                    </span>
                  ) : activeIsBorrowed ? (
                    <span className="lobby-active-strip__source">
                      {t("community.lobbySource", { name: active.blurb })}
                    </span>
                  ) : null}
                </span>
              </span>
            </button>
          ) : (
            <div className="lobby-active-strip__jump">
              <span className="lobby-active-strip__text">
                <span className="lobby-active-strip__eyebrow">{t("lobby.battleDeck")}</span>
                <span className="lobby-active-strip__name">{t("lobby.noDeckSelected")}</span>
              </span>
            </div>
          )}
          <div className="lobby-active-strip__tools">
            {!randomSelected && active && activeIsPreset ? (
              <>
                <IconButton
                  className="lobby-deck-action"
                  variant="ghost"
                  size="sm"
                  label={t("lobby.viewList")}
                  title={t("lobby.viewList")}
                  onClick={() => setViewedDeck(active)}
                >
                  <Icons.Eye size={16} />
                </IconButton>
                <IconButton
                  className="lobby-deck-action"
                  variant="ghost"
                  size="sm"
                  label={t("lobby.copyPreset")}
                  title={t("lobby.copyPreset")}
                  onClick={() => onCopyDeck(active)}
                >
                  <Icons.Copy size={16} />
                </IconButton>
              </>
            ) : !randomSelected && active && activeIsBorrowed ? (
              <IconButton
                className="lobby-deck-action"
                variant="ghost"
                size="sm"
                label={t("lobby.copyPreset")}
                title={t("lobby.copyPreset")}
                onClick={() => onCopyDeck(active)}
              >
                <Icons.Copy size={16} />
              </IconButton>
            ) : null}
            <IconButton
              className="lobby-deck-action"
              variant="ghost"
              size="sm"
              label={t("nav.decks")}
              title={t("nav.decks")}
              onClick={() => onNav("deck")}
            >
              <Icons.FileText size={16} />
            </IconButton>
          </div>
          {!randomSelected && !active ? (
            <Button size="sm" variant="secondary" icon={Icons.Plus} onClick={() => onNav("deck")}>
              {t("lobby.buildDeck")}
            </Button>
          ) : null}
          {launch ? (
            <div className="lobby-launch">
              <Button
                icon={launch.icon}
                disabled={launch.disabled}
                aria-label={launch.beta ? t("lobby.enterBetaQueue") : launch.label}
                onClick={launch.onClick}
              >
                <span className="lobby-launch__label">{launch.label}</span>
                <span className="lobby-launch__short" aria-hidden="true">
                  {launch.shortLabel}
                </span>
              </Button>
              {launch.beta ? (
                <span className="lobby-launch__beta" aria-hidden="true">
                  {t("beta.tag")}
                </span>
              ) : null}
            </div>
          ) : null}
        </Panel>

        <header className="lobby-header">
          <Eyebrow>{t("lobby.eyebrow")}</Eyebrow>
          <div className="aegis-section-heading">
            <h1 className="aegis-section-heading__title">{t("lobby.title")}</h1>
            <span className="aegis-section-heading__rule" aria-hidden="true" />
            <SpectatorPanel onWatch={(code) => onStart("spectator", code)} />
          </div>
        </header>

        <div className="lobby-modes">
          {MODES.map((m) => {
            const sel = mode === m.key;
            const Icon = m.icon;
            return (
              <button
                type="button"
                key={m.key}
                className={`lobby-mode${sel ? " is-selected" : ""}`}
                disabled={!m.available}
                aria-pressed={sel}
                onClick={() => m.available && !sel && setMode(m.key)}
              >
                <span className="lobby-mode__icon">
                  <Icon size={20} />
                </span>
                <span className="lobby-mode__text">
                  <span className="lobby-mode__title">{m.title}</span>
                  <span className="lobby-mode__description">{m.desc}</span>
                </span>
                <span className="lobby-mode__meta">
                  <Icons.Clock size={12} />
                  {m.meta}
                </span>
                {sel ? <Icons.CircleCheck className="lobby-mode__selected-mark" size={20} /> : null}
              </button>
            );
          })}
        </div>

        <section className="lobby-setup" aria-labelledby="lobby-setup-title">
          <h2 id="lobby-setup-title" className="lobby-setup__title">
            {t("redesign.play.setupTitle")}
          </h2>
          <div className="lobby-setup__summary" aria-label={t("redesign.play.setupTitle")}>
            <span>{deckFormatLabel(format, t)}</span>
            {!privateGuest && !privateRoom ? (
              <>
                <span>
                  <Icons.Trophy size={14} />{" "}
                  {t(vsBot || bestOf === 1 ? "lobby.format.bestOf1" : "lobby.format.bestOf3")}
                </span>
                <span>
                  <Icons.Clock size={14} />{" "}
                  {t(!vsBot && timer.matchTimer ? "lobby.timer.enabled" : "redesign.play.timerOff")}
                </span>
              </>
            ) : null}
          </div>
          <div className="lobby-setup__body">
            <div className="lobby-setup__column">
              <p className="lobby-setup__notice">
                {randomSelected ? (
                  t("lobby.randomQueueNotice")
                ) : active ? (
                  <>
                    {t("lobby.queueNoticePrefix")}
                    <strong>{modeTitle}</strong>
                    {t("lobby.queueNoticeSuffix", { deck: active.name })}
                  </>
                ) : (
                  t("lobby.buildFirst")
                )}
              </p>
              {betaEnabled ? (
                <Alert className="lobby-alert" tone="warning" title={t("lobby.betaBattleMode")}>
                  {t("lobby.betaBattleHint")}
                </Alert>
              ) : null}
              {betaCards.length > 0 && !betaAllowed ? (
                <Alert className="lobby-alert" tone="warning" title={t("lobby.betaRequiredTitle")}>
                  {t("lobby.betaRequiredHint")}
                </Alert>
              ) : null}
              {active && deckLegality(active, { format }).formatViolations.length > 0 ? (
                <Alert tone="warning">
                  {t("deckFormat.violations", { count: deckLegality(active, { format }).formatViolations.length })}
                </Alert>
              ) : null}
              {banViolations.length > 0 ? (
                <Alert className="lobby-alert" tone="danger" title={t("lobby.banlistTitle")}>
                  {banViolations.map(({ id, n, cap }) => (
                    <div key={id}>{t("lobby.banlistRow", { cardId: id, count: n, cap })}</div>
                  ))}
                </Alert>
              ) : null}
              {pairViolations.length > 0 ? (
                <Alert className="lobby-alert" tone="danger" title={t("lobby.pairTitle")}>
                  {pairViolations.map(([a, b]) => (
                    <div key={`${a}-${b}`}>
                      {t("lobby.pairRow", {
                        a: getCardDefinition(a)?.nameEn ?? a,
                        b: getCardDefinition(b)?.nameEn ?? b,
                      })}
                    </div>
                  ))}
                </Alert>
              ) : null}
            </div>

            <div className="lobby-setup__column">
              {mode === "private" && (privateGuest || privateRoom) ? (
                <div>
                  <p className="lobby-timer-hint">{t("lobby.timer.guestHint")}</p>
                  <p role="status">
                    {privateRoom || guestRules?.code === guestCode
                      ? t("lobby.hostBanlist", {
                          mode: format === "standard" ? t("lobby.standardBanlist") : deckFormatLabel(format, t),
                        })
                      : t(guestLookupFailed ? "lobby.roomLookupFailed" : "lobby.roomRulesPending")}
                  </p>
                </div>
              ) : null}
              {mode === "private" && privateRoom ? (
                <PrivateRoomPanel t={t} room={privateRoom} onLeave={() => onLeavePrivateRoom?.()} />
              ) : mode === "private" ? (
                <PrivateSidebar
                  t={t}
                  sub={privateSub}
                  onSub={setPrivateSub}
                  roomCode={roomCodeInput}
                  onRoomCode={setRoomCodeInput}
                />
              ) : !vsBot && format === "standard" && !betaEnabled && !betaOptedIn && RANKED_ENABLED ? (
                <RankedStart
                  disabled={!selectionLegal}
                  actionClassName="lobby-setup__launch"
                  buttonLabel={t("lobby.enterQueue")}
                  onOpenSettings={() => onNav("settings")}
                  onStart={(isRanked) => start(isRanked ? "ranked" : "casual")}
                />
              ) : null}
            </div>
          </div>
          <details className="lobby-advanced">
            <summary>
              <Icons.Settings size={18} className="lobby-advanced__icon" />
              <span className="lobby-advanced__label">
                <strong>{t("redesign.play.advancedSettings")}</strong>
                <small>{t("redesign.play.advancedSettingsHint")}</small>
              </span>
              <Icons.ChevronDown size={18} className="lobby-advanced__chevron" />
            </summary>
            <div className="lobby-advanced__content">
              {!privateGuest || privateRoom || guestRules?.code === guestCode ? (
                <DeckFormatSelector
                  value={format}
                  onChange={changeFormat}
                  disabled={(mode === "private" && !!privateRoom) || privateGuest}
                />
              ) : null}
              <div className="lobby-setup__body">
                <div className="lobby-setup__column">
                  {mode === "casual" || vsBot || (mode === "private" && privateSub === "create" && !privateRoom) ? (
                    <div className="lobby-match-rules">
                      <RollbackSettings enabled={allowRollback} onChange={onAllowRollbackChange ?? (() => {})} />
                      {!vsBot ? (
                        <>
                          <MatchFormatSettings bestOf={bestOf} onChange={changeBestOf} />
                          <MatchTimerSettings options={timer} onChange={changeTimer} privateRoom={mode === "private"} />
                        </>
                      ) : null}
                    </div>
                  ) : null}
                </div>
                <div className="lobby-setup__column">
                  {vsBot ? (
                    <div className="lobby-bot-deck">
                      <label htmlFor="lobby-bot-deck">{t("lobby.botDeck")}</label>
                      <select
                        id="lobby-bot-deck"
                        className="lobby-bot-deck-select"
                        value={botDeckId}
                        onChange={(event) => setBotDeckId(event.target.value)}
                      >
                        <option value="">{t("lobby.botDeckRandom")}</option>
                        <optgroup label={t("lobby.filterMine")}>
                          {decks.map((deck) => (
                            <option
                              key={deck.id}
                              value={`mine:${deck.id}`}
                              disabled={!deckLegality(deck, { unlimited, format }).legal}
                            >
                              {deck.name}
                            </option>
                          ))}
                        </optgroup>
                        {FAMOUS_DECK_GROUPS.map((group) => (
                          <optgroup key={group.collection} label={group.collection}>
                            {group.decks.map((deck) => (
                              <option
                                key={deck.id}
                                value={deck.id}
                                disabled={
                                  !deckLegality(deck, { format }).legal || (!betaAllowed && deckHasBetaCards(deck))
                                }
                              >
                                {deck.name}
                              </option>
                            ))}
                          </optgroup>
                        ))}
                      </select>
                      {botPreview ? (
                        <div className="lobby-bot-preview">
                          <span className="lobby-active-strip__thumb">
                            <CoverThumb
                              coverCardId={displayCoverCard(botPreview)}
                              sigilColor={botPreview.color}
                              sigilSize={22}
                            />
                          </span>
                          <div className="lobby-bot-preview__copy">
                            <strong>{botPreview.name}</strong>
                            <small>
                              {t("redesign.play.deckCounts", {
                                main: botPreview.mainDeck.length,
                                egg: botPreview.eggDeck.length,
                              })}
                            </small>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                  {betaOptional ? (
                    <label className="lobby-beta-option">
                      <input
                        type="checkbox"
                        checked={betaQueueChosen}
                        onChange={(event) => setBetaQueueChosen(event.target.checked)}
                      />
                      <span>
                        <strong>{t("lobby.betaQueueOption")}</strong>
                        <span className="lobby-beta-option__description">
                          {t(vsBot ? "lobby.betaQueueOptionBotHint" : "lobby.betaQueueOptionHint")}
                        </span>
                      </span>
                    </label>
                  ) : null}
                  {randomSelected ? (
                    <div className="lobby-random-pool">
                      <span id="lobby-random-pool-label">{t("lobby.randomPoolLabel")}</span>
                      <div role="group" aria-labelledby="lobby-random-pool-label">
                        {(["mine", "famous", "all"] as const).map((scope) => (
                          <button
                            type="button"
                            key={scope}
                            className={randomPoolScope === scope ? "is-selected" : undefined}
                            aria-pressed={randomPoolScope === scope}
                            onClick={() => setRandomPoolScope(scope)}
                          >
                            {t(`lobby.filter${scope === "mine" ? "Mine" : scope === "famous" ? "Famous" : "All"}`)}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  {mode !== "private" ? (
                    <dl className="lobby-details">
                      {[
                        [t("lobby.format"), deckFormatLabel(format, t)],
                        [t("lobby.players"), vsBot ? t("lobby.playersBot") : t("lobby.playersHuman")],
                        [t("lobby.identity"), player.name],
                      ].map(([label, value]) => (
                        <div key={label} className="lobby-details__row">
                          <dt>{label}</dt>
                          <dd>{value}</dd>
                        </div>
                      ))}
                    </dl>
                  ) : null}
                </div>
              </div>
            </div>
          </details>
        </section>

        <DeckPicker
          ownDecks={userDecks}
          format={format}
          activeDeckId={activeDeckId}
          randomSelected={randomSelected}
          randomPoolSize={randomPoolScope === "all" ? undefined : randomPool.length}
          onSelectRandom={() => setRandomSelected(true)}
          onSelectDeck={selectDeck}
          onCopyDeck={onCopyDeck}
          onViewDeck={setViewedDeck}
          onEditDeck={editDeck}
          onBuildDeck={buildDeck}
          onPickCommunityDeck={pickCommunityDeck}
          onOpenCommunityDeck={openCommunityDeck}
          accountId={accountId}
        />
      </div>
      {viewedDeck ? (
        <FamousDeckListDialog
          deck={viewedDeck}
          collection={
            FAMOUS_DECK_GROUPS.find((group) => group.decks.some((deck) => deck.id === viewedDeck.id))?.collection ?? ""
          }
          active={!randomSelected && viewedDeck.id === active?.id}
          onUse={() => {
            selectDeck(viewedDeck.id);
            setViewedDeck(null);
          }}
          onCopy={() => {
            onCopyDeck(viewedDeck);
            setViewedDeck(null);
          }}
          onClose={() => setViewedDeck(null)}
        />
      ) : null}
      {betaConfirmation ? (
        <Dialog labelledBy="lobby-beta-confirm-title" onClose={() => setBetaConfirmation(null)}>
          <h2 id="lobby-beta-confirm-title">{t("lobby.betaConfirmTitle")}</h2>
          <p>{t("lobby.betaConfirmHint", { deck: active?.name ?? "" })}</p>
          <div className="lobby-beta-confirm-actions">
            <Button variant="secondary" onClick={() => setBetaConfirmation(null)}>
              {t("common.cancel")}
            </Button>
            <Button
              onClick={() => {
                const startMode = betaConfirmation;
                setBetaConfirmation(null);
                if (selectionLegal && betaEnabled)
                  start(startMode, undefined, startMode === "bot" ? botDeckId || undefined : undefined, true);
              }}
            >
              {t("common.confirm")}
            </Button>
          </div>
        </Dialog>
      ) : null}
    </main>
  );
}

function PrivateRoomPanel({ t, room, onLeave }: { t: Translate; room: PrivateRoom; onLeave: () => void }) {
  return (
    <div className="lobby-private">
      <p className="lobby-private-room-code">{t("lobby.privateRoomCode", { code: room.code })}</p>
      <p className="lobby-private__hint">{t(room.host ? "lobby.reopenRoomHint" : "lobby.rejoinRoomHint")}</p>
      <Button size="sm" variant="secondary" icon={Icons.LogOut} onClick={onLeave}>
        {t("lobby.leaveRoom")}
      </Button>
    </div>
  );
}

function PrivateSidebar({
  t,
  sub,
  onSub,
  roomCode,
  onRoomCode,
}: {
  t: Translate;
  sub: "create" | "join";
  onSub: (s: "create" | "join") => void;
  roomCode: string;
  onRoomCode: (c: string) => void;
}) {
  return (
    <div className="lobby-private">
      <div className="lobby-private-toggle" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={sub === "create"}
          className={sub === "create" ? "is-selected" : undefined}
          onClick={() => onSub("create")}
        >
          {t("lobby.create")}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={sub === "join"}
          className={sub === "join" ? "is-selected" : undefined}
          onClick={() => onSub("join")}
        >
          {t("lobby.join")}
        </button>
      </div>

      {sub === "create" ? (
        <p className="lobby-private__hint">{t("lobby.createHint")}</p>
      ) : (
        <>
          <p className="lobby-private__hint">{t("lobby.joinHint")}</p>
          <Field
            className="lobby-room-field"
            label={t("lobby.roomCodePlaceholder")}
            name="roomCode"
            autoComplete="off"
            spellCheck={false}
            value={roomCode}
            onChange={(e) => onRoomCode(e.target.value.toUpperCase())}
            placeholder={t("lobby.roomCodePlaceholder")}
            maxLength={6}
          />
        </>
      )}
    </div>
  );
}
