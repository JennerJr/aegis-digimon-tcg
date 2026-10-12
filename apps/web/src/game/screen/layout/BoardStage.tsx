import { RollbackControls } from "@/game/RollbackControls";
/* The arena itself: the opponent's bar, the narration and the ticker, the field's three
   columns, the player's dock, and the free-floating cue layers over all of it.

   The overlays are portalled to the app's stage element when there is one, so a dialog
   is never clipped by the board's own overflow; the ghost that follows a held card goes
   to the document body for the same reason. */

import {
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { ChatBubble } from "../../chat/ChatBubble";
import { MatchChatWindow } from "../../chat/MatchChatWindow";
import type { MatchChat } from "../../chat/useMatchChat";
import { useUnreadChatCount } from "../../chat/useUnreadChatCount";
import type { ArenaBoardLook } from "../../arenaLook";
import type { HandSortMode } from "../../handSortMode";
import { createPortal } from "react-dom";
import type { GameState, Permanent, PlayerState, Seat } from "@aegis/shared";
import type { RevealedZones } from "../model/gameOutcome";
import { canAttackPlayerWith, canAttackWith, otherSeat } from "../../boardModel";
import { type LogLine } from "../../matchLog";
import { intents } from "../../../net/intents";
import { EndTurnDialog } from "./EndTurnDialog";
import { useEndTurnConfirmation } from "../hooks/useEndTurnConfirmation";
import { SurrenderDialog } from "./SurrenderDialog";
import { useTranslation } from "../../../i18n";
import { CardOpenerProvider } from "../../cardLinks";
import { OpponentSelectingPill } from "../../BoardDecisionRail";
import { opponentStatusKey } from "../../opponentStatus";
import { NarrationStack } from "../../NarrationStack";
import { AttackAnnouncementBanner } from "../../SidePanelStack";
import { TargetingSpotlight } from "../../TargetingSpotlight";
import { EffectFocus } from "../../EffectFocus";
import { trashEffectCardFromSources, type EffectActivation } from "../../effectSource";
import { BATTLE_TIMING_STYLE } from "../../timings";
import { shieldSecurityCount } from "../../securityClash";
import { turnControlState } from "../../turnControl";
import { Side } from "../../side";
import type { DragIntent, DropTarget } from "../../dragIntents";
import type { DropAttrs, HandEntry } from "../../piece";
import type { MatchCues } from "../../match/types";
import { DragKind } from "../enums";
import type { DragState, PermanentChrome, PresentedPlayer, TrackingArrowGeometry } from "../types";
import type { useArenaLayout } from "../hooks/useArenaLayout";
import type { useBoardSelection } from "../hooks/useBoardSelection";
import type { useOverlayState } from "../hooks/useOverlayState";
import type { boardActions } from "../boardActions";
import type { matchIntents } from "../matchIntents";
import type { actionGuards } from "../model/actionGuards";
import { AttackArrowLayer } from "./AttackArrowLayer";
import { FieldEffectsIndicator, readFieldEffects } from "./FieldEffectsIndicator";
import { BattleZones } from "./BattleZones";
import { BoardBurstLayer } from "./BoardBurstLayer";
import { DragGhost } from "./DragGhost";
import { FieldClashGhosts } from "./FieldClashGhosts";
import { LeftPileColumn } from "./LeftPileColumn";
import { LogTicker } from "./LogTicker";
import { DecisionMatchTimer, MatchTimer, SeriesBadge, viewerDecisionTimed } from "../../MatchTimer";
import { MemoryBand } from "./MemoryBand";
import { OpponentBar } from "./OpponentBar";
import { OpponentBattleRow } from "./OpponentBattleRow";
import { PlayerDock } from "./PlayerDock";
import { RightPileColumn } from "./RightPileColumn";
import { Sidebar } from "./Sidebar";
import { TurnBanner } from "./TurnBanner";
import { ViewerBattleRow } from "./ViewerBattleRow";
import { ViewerPiles } from "./ViewerPiles";
import { useBreedingTransferOrigins } from "../../breedingTransfer";
import { useFieldShatterOrigins } from "../../fieldShatter";

export interface BoardAnchors {
  board: RefObject<HTMLDivElement | null>;
  field: RefObject<HTMLDivElement | null>;
  permanents: RefObject<Record<string, HTMLDivElement | null>>;
  permanentCenters: RefObject<Record<string, { x: number; y: number }>>;
  permanentCardIds: RefObject<Record<string, string>>;
  viewerSecurity: RefObject<HTMLDivElement | null>;
  opponentSecurity: RefObject<HTMLDivElement | null>;
  viewerDeck: RefObject<HTMLDivElement | null>;
  opponentDeck: RefObject<HTMLDivElement | null>;
  viewerHandDock: RefObject<HTMLDivElement | null>;
  opponentHandStrip: RefObject<HTMLDivElement | null>;
}

/** The seats as the board shows them, with the counts the readouts print. */
export interface BoardSeats {
  shownViewer: PresentedPlayer;
  shownOpponent: PresentedPlayer;
  breedingViewer: PresentedPlayer;
  breedingOpponent: PresentedPlayer;
  shownHandEntries: HandEntry[];
  shownHandCount: number;
  shownOpponentHandCount: number;
  /** Both players' hidden zones, once the server reveals them after the match. */
  revealed?: RevealedZones;
}

/** What the board prints rather than acts on: the turn, the memory and the log. */
export interface BoardReadouts {
  memory: number;
  memoryPrediction: number | undefined;
  displayedTurnSeat: Seat;
  displayedTurnCount: number;
  log: LogLine[];
}

/** What the board lights, outlines or points at while a choice is open. */
export interface BoardTargeting {
  spotlight: { ids: readonly string[]; attacker: string | undefined; open: boolean };
  spotlightSubjects: Parameters<typeof TargetingSpotlight>[0]["subjects"];
  boardSize: { width: number; height: number };
  previewArrow: { from: { x: number; y: number }; to: { x: number; y: number } } | null;
  trackingArrow: TrackingArrowGeometry | null;
  attackerPermanent: Permanent | undefined;
  draggedAttackerPermanent: Permanent | undefined;
  canAttackSecurity: boolean;
  securityDecision: { selected: boolean; onToggle: () => void } | undefined;
  isBasePermanent: (perm: Permanent) => boolean;
  isDecisionCandidate: (perm: Permanent) => boolean;
}

/** The per-permanent and per-drop-area chrome both halves of the field read. */
export interface BoardChrome {
  permanentChrome: Omit<PermanentChrome, "suspendDelayMs">;
  unsuspendStagger: (index: number) => number;
  dropIntentAttrs: (target: DropTarget, id?: string) => DropAttrs;
  baseDropIntentAttrs: (permanentId: string) => DropAttrs;
  /** The class an effect resolving from a seat's trash marks the pile with. */
  trashEffectSource: (seat: Seat) => string | undefined;
}

/** The hand strip's own inputs, which the field does not share. */
export interface HandDockInputs {
  reorderDropBeforeInstanceId?: string | null;
  onMoveHandCard: (instanceId: string, direction: -1 | 1) => void;
  handSortMode: HandSortMode;
  onSortHand: (mode: HandSortMode) => void;
  effectSourceInstanceId: string | undefined;
  effectSource?: EffectActivation;
  shakeInstanceId: string | undefined;
  selection:
    | {
        selectableInstanceIds: readonly string[];
        pickedInstanceIds: readonly string[];
        onToggle: (instanceId: string) => void;
        onInspect: (instanceId: string) => void;
      }
    | undefined;
  actionBar: { selCardId?: string; hasBase: boolean; linkingCardId?: string; onCancel: () => void } | undefined;
  reserveActionBarSpace: boolean;
  onHoverChange: (instanceId: string | undefined) => void;
}

export function BoardStage({
  spectating = false,
  replayMode = false,
  onLeaveSpectator,
  state,
  shownState,
  viewer,
  opponent,
  viewerSeat,
  room,
  chat,
  look,
  layout,
  anchors,
  cues,
  seats,
  guards,
  readouts,
  targeting,
  chrome,
  handDock,
  selection,
  overlays,
  actions,
  senders,
  drag,
  breedingDock,
  overlayStack,
  stageEl,
  onStartHandDrag,
  onStartPermanentDrag,
  onInspectPermanent,
  onOpenCard,
  promptSourceCardId,
  onResetScenario,
}: {
  state: GameState;
  shownState: GameState;
  viewer: PlayerState;
  opponent: PlayerState;
  viewerSeat: Seat;
  /** The card whose effect the viewer's open decision is about. */
  promptSourceCardId?: string | undefined;
  spectating?: boolean;
  replayMode?: boolean;
  onLeaveSpectator?: () => void;
  room: Parameters<typeof intents.surrender>[0] | undefined;
  /** Absent when there is no live room to talk through, as in a demo. */
  chat?: MatchChat;
  look: ArenaBoardLook;
  layout: ReturnType<typeof useArenaLayout>;
  anchors: BoardAnchors;
  cues: MatchCues;
  seats: BoardSeats;
  guards: ReturnType<typeof actionGuards>;
  readouts: BoardReadouts;
  targeting: BoardTargeting;
  chrome: BoardChrome;
  handDock: HandDockInputs;
  selection: ReturnType<typeof useBoardSelection>;
  overlays: ReturnType<typeof useOverlayState>;
  actions: ReturnType<typeof boardActions>;
  senders: ReturnType<typeof matchIntents>;
  drag: {
    state: DragState | null;
    isPlay: boolean;
    cardId: string | undefined;
    /** What releasing here would do, or nothing while the pointer is over no drop area. */
    hoveredIntent: DragIntent | undefined;
  };
  /** The raising area, which a portrait screen puts in the field instead of the dock. */
  breedingDock: ReactNode;
  overlayStack: ReactNode;
  /** The app's stage element, when the document has one to portal the overlays into. */
  stageEl: HTMLElement | null;
  onStartHandDrag: (index: number, event: ReactPointerEvent, origin?: HTMLElement) => void;
  onStartPermanentDrag: (perm: Permanent, event: ReactPointerEvent) => void;
  onInspectPermanent: { viewer: (perm: Permanent) => void; opponent: (perm: Permanent) => void };
  onOpenCard: (cardId: string, artId?: string) => void;
  onResetScenario?: () => void;
}) {
  const { t } = useTranslation();
  useBreedingTransferOrigins(anchors.board);
  useFieldShatterOrigins(anchors.board);
  const other = otherSeat(viewerSeat);
  const [chatOpen, setChatOpen] = useState(false);
  const chatUnread = useUnreadChatCount(chat?.entries, chatOpen);
  const endTurnConfirmation = useEndTurnConfirmation({
    phase: state.phase,
    turnCount: state.turnCount,
    blocked: guards.endPhaseBlocked || !room,
    onEndPhase: () => {
      if (room) intents.endPhase(room);
    },
  });
  const endTurnDialog = endTurnConfirmation.open ? (
    <EndTurnDialog onConfirm={endTurnConfirmation.confirm} onClose={endTurnConfirmation.cancel} />
  ) : null;
  const opponentName = opponent.displayName || t("game.opponent");
  // A spectator watches from one player's seat but is not that player.
  const viewerName = spectating ? viewer.displayName || t("game.you") : t("chat.you");
  const { shownViewer, shownOpponent, breedingViewer, breedingOpponent } = seats;
  const surrenderDialog = overlays.surrenderConfirmOpen ? (
    <SurrenderDialog
      onConfirm={() => {
        overlays.setSurrenderConfirmOpen(false);
        if (room) intents.surrender(room);
      }}
      onClose={() => overlays.setSurrenderConfirmOpen(false)}
    />
  ) : null;
  const viewerPiles = (
    <ViewerPiles
      viewer={shownViewer}
      docked={layout.dockViewerPiles}
      pileWidth={layout.arenaPileWidth}
      compactPiles={layout.compactPiles}
      viewerDeckRef={anchors.viewerDeck}
      viewerDeckRiffling={cues.deckRiffles.get(`${viewerSeat}:deck`) ?? false}
      viewerTrashClassName={chrome.trashEffectSource(viewerSeat) ?? ""}
      viewerTrashEffectCard={trashEffectCardFromSources(cues.effectSources, viewerSeat, shownViewer.trash)}
      onOpenViewerTrash={shownViewer.trash.length ? () => overlays.setTrashView(Side.Viewer) : undefined}
      onOpenViewerDeck={
        seats.revealed ? () => overlays.setRevealedZoneView({ side: Side.Viewer, zone: "deck" }) : undefined
      }
    />
  );
  const resultShown = state.gameOver && !cues.resultPending;
  const opponentStatus = opponentStatusKey(state, viewerSeat);
  // An open turn reads as thinking only once the board has caught up; while the
  // opponent's last action still plays, the board itself is the feedback.
  const opponentIdle = !!state.pendingDecision || !!state.combatWindow || !cues.presenting;

  return (
    // Every surface that names a card — notices, side panels, combat prompts,
    // decision dialogs — opens it through this one blow-up.
    <CardOpenerProvider onOpenCard={onOpenCard}>
      <main
        data-spectator={spectating || undefined}
        className="game-layout aegis-arena"
        data-viewer-seat={viewerSeat}
        style={{
          height: "100%",
          display: "flex",
          background: "var(--ds-paper)",
          overflow: "clip",
          ...BATTLE_TIMING_STYLE,
          ...look.style,
        }}
      >
        <div
          className="game-board aegis-arena-surface"
          ref={anchors.board}
          data-art={look.hasArt || undefined}
          data-timer-decision={viewerDecisionTimed(state, viewerSeat) || undefined}
          style={{
            ...({
              "--arena-raising-width": `${layout.arenaRaisingWidth}px`,
              "--arena-sideline-basis-width": `${layout.arenaSidelineBasisWidth}px`,
            } as CSSProperties),
            flex: 1,
            position: "relative",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <OpponentBar
            spectating={spectating}
            spectatorCode={!state.gameOver ? state.spectatorCode : undefined}
            onResetScenario={onResetScenario}
            timer={
              (state.series?.bestOf ?? 1) > 1 ? (
                <span className="match-clock-group">
                  <SeriesBadge state={state} viewerSeat={viewerSeat} />
                  {state.matchTimer ? <MatchTimer state={state} seat={other} opponent /> : null}
                </span>
              ) : state.matchTimer ? (
                <MatchTimer state={state} seat={other} opponent />
              ) : undefined
            }
            handStripRef={anchors.opponentHandStrip}
            opponentName={opponent.displayName || t("game.opponent")}
            opponentAvatarId={opponent.avatarId}
            viewerSeat={viewerSeat}
            displayedTurnSeat={readouts.displayedTurnSeat}
            displayedTurnCount={readouts.displayedTurnCount}
            phase={shownState.phase}
            memory={readouts.memory}
            eggDeckCount={breedingOpponent.eggDeckCount}
            handCount={seats.shownOpponentHandCount}
            revealedHand={
              seats.revealed?.opponent.hand ??
              (replayMode && opponent.hand.length > 0 ? Array.from(opponent.hand) : undefined)
            }
            deckCount={shownOpponent.deckCount}
            trashCount={shownOpponent.trash.length}
            rollbackControls={
              room && !spectating ? (
                <RollbackControls
                  state={state}
                  room={room}
                  seat={viewerSeat}
                  menu={layout.portraitArena}
                  compact={layout.narrowGameLayout}
                />
              ) : undefined
            }
            portraitArena={layout.portraitArena}
            narrowGameLayout={layout.narrowGameLayout}
            skippable={cues.presenting || cues.decisionAnimationsPending}
            onOpenLog={() => overlays.setHistoryOpen(true)}
            onReportBug={() => overlays.setBugReportOpen(true)}
            onOpenArenaLook={() => overlays.setArenaLookOpen(true)}
            onToggleChat={chat ? () => setChatOpen((open) => !open) : undefined}
            chatOpen={chatOpen}
            chatUnread={chatUnread}
            onSurrender={spectating ? () => onLeaveSpectator?.() : () => overlays.setSurrenderConfirmOpen(true)}
            onSkipPresentation={() => cues.skipAnimations()}
          />

          <DecisionMatchTimer state={state} seat={viewerSeat} />
          {/* One moment at a time. The portrait phone folds both sides into a single
              centred slot; everywhere else the viewer reads the left corner and the
              opponent's moments arrive in the right one. */}
          <div className="game-board-notices">
            {opponentStatus && opponentIdle && !cues.zoneShowcase && !cues.revealShowcase ? (
              <OpponentSelectingPill status={opponentStatus} />
            ) : null}
            {!resultShown ? (
              <NarrationStack
                narration={cues.narration}
                rejection={cues.rejection}
                compact={layout.collapseNotices}
                promptSourceCardId={promptSourceCardId}
                securityDockActive={cues.securityBranch !== null || cues.optionBranch !== null}
                onAdvance={cues.advanceNarration}
                onDismissRejection={cues.dismissRejection}
                onHold={cues.holdNarration}
              />
            ) : null}
          </div>

          {cues.attackAnnouncement && !resultShown ? (
            <AttackAnnouncementBanner announcement={cues.attackAnnouncement} />
          ) : null}

          {/* Desktop replaced the sidebar with this slim ticker, kept unobtrusive at the
              board's right edge. The header's log button opens the full history sheet. */}
          {!layout.narrowGameLayout ? (
            <LogTicker
              log={readouts.log}
              viewerSeat={viewerSeat}
              displayedTurnSeat={readouts.displayedTurnSeat}
              displayedTurnCount={readouts.displayedTurnCount}
              memory={readouts.memory}
            />
          ) : null}

          {cues.turnTransition ? <TurnBanner transition={cues.turnTransition} viewerSeat={viewerSeat} /> : null}

          <EffectFocus
            sources={cues.effectSources}
            board={anchors.board}
            permanents={anchors.permanents}
            choosingTargets={targeting.spotlight.open}
          />

          <div
            className="game-field"
            ref={anchors.field}
            style={{ flex: 1, minWidth: 0, minHeight: 0, display: "flex", overflow: "hidden", position: "relative" }}
          >
            {/* The breeding step is about one slot: the field dims behind the dock,
                which keeps the raising area, the hand that digivolves into it and
                the turn control lit. Notices, panels and dialogs all sit above. */}
            {guards.breedingActionsOpen ? <div className="game-breeding-mode" aria-hidden="true" /> : null}
            {/* Outlines mark the cards the server offered without dimming the field.
                The cards underneath keep every pointer event. */}
            {targeting.spotlight.open ? (
              <TargetingSpotlight
                subjects={targeting.spotlightSubjects}
                width={targeting.boardSize.width}
                height={targeting.boardSize.height}
              />
            ) : null}
            <LeftPileColumn
              opponent={shownOpponent}
              viewer={shownViewer}
              pileWidth={layout.arenaPileWidth}
              compactPiles={layout.compactPiles}
              opponentDeckRef={anchors.opponentDeck}
              viewerSecurityRef={anchors.viewerSecurity}
              opponentDeckRiffling={cues.deckRiffles.get(`${other}:deck`) ?? false}
              opponentTrashClassName={chrome.trashEffectSource(other) ?? ""}
              opponentTrashEffectCard={trashEffectCardFromSources(cues.effectSources, other, shownOpponent.trash)}
              securityCount={
                cues.securityDealCounts.get(viewerSeat) ??
                shieldSecurityCount(shownViewer.securityCount, cues.heldSecurityCounts.get(viewerSeat))
              }
              securityBreak={cues.securityBreak}
              securityBreakMine={cues.securityBreak?.seat === viewerSeat}
              securityHit={cues.securityHitSeat === viewerSeat}
              securityLanding={cues.securityFlights.get(viewerSeat)}
              onOpenOpponentTrash={shownOpponent.trash.length ? () => overlays.setTrashView(Side.Opponent) : undefined}
              onOpenOpponentDeck={
                seats.revealed ? () => overlays.setRevealedZoneView({ side: Side.Opponent, zone: "deck" }) : undefined
              }
              onOpenViewerSecurity={shownViewer.securityCount ? () => overlays.setSecurityView(Side.Viewer) : undefined}
            />

            <FieldEffectsIndicator
              json={shownOpponent.fieldEffectsJson}
              ownField={false}
              playerNames={[shownState.players[0]?.displayName ?? "", shownState.players[1]?.displayName ?? ""]}
            />
            <FieldEffectsIndicator
              json={shownViewer.fieldEffectsJson}
              ownField
              playerNames={[shownState.players[0]?.displayName ?? "", shownState.players[1]?.displayName ?? ""]}
            />
            <BattleZones
              opponentFieldEffects={readFieldEffects(shownOpponent.fieldEffectsJson).length > 0}
              viewerFieldEffects={readFieldEffects(shownViewer.fieldEffectsJson).length > 0}
            >
              <OpponentBattleRow
                permanents={shownOpponent.battleArea}
                chrome={{
                  ...chrome.permanentChrome,
                  suspendDelayMs: chrome.unsuspendStagger,
                }}
                attackerPermanent={targeting.attackerPermanent}
                draggedAttackerPermanent={targeting.draggedAttackerPermanent}
                vortexMode={selection.vortexMode}
                dropIntentAttrs={chrome.dropIntentAttrs}
                isDecisionCandidate={targeting.isDecisionCandidate}
                onPermanentClick={actions.onOppPerm}
                onPermanentInspect={onInspectPermanent.opponent}
              />
              <MemoryBand
                phaseBanner={cues.phaseBanner}
                memory={readouts.memory}
                compact={layout.compactPiles}
                displayedPhase={cues.displayedPhase ?? shownState.phase}
                phaseSweeping={cues.unsuspendSweep !== null}
                memoryPrediction={readouts.memoryPrediction}
                turnControlState={turnControlState({ phase: state.phase, turnSeat: state.turnSeat, viewerSeat })}
                endPhaseBlocked={guards.endPhaseBlocked}
                onEndPhase={endTurnConfirmation.request}
              />
              <ViewerBattleRow
                permanents={shownViewer.battleArea}
                chrome={{
                  ...chrome.permanentChrome,
                  suspendDelayMs: chrome.unsuspendStagger,
                }}
                dragIsPlay={drag.isPlay}
                selectedAttackerPermanentId={selection.selPerm}
                isBasePermanent={targeting.isBasePermanent}
                isDecisionCandidate={targeting.isDecisionCandidate}
                draggable={(perm) =>
                  !guards.mainActionBlocked && !selection.handSel && !selection.linkSel && canAttackWith(perm)
                }
                dropIntentAttrs={chrome.dropIntentAttrs}
                baseDropIntentAttrs={chrome.baseDropIntentAttrs}
                onPermanentClick={actions.onYourPerm}
                onPermanentPointerDown={onStartPermanentDrag}
                onPermanentInspect={onInspectPermanent.viewer}
              />
            </BattleZones>

            {layout.portraitArena ? breedingDock : null}

            <RightPileColumn
              opponent={shownOpponent}
              opponentBreeding={breedingOpponent}
              viewerPiles={layout.dockViewerPiles ? null : viewerPiles}
              pileWidth={layout.arenaPileWidth}
              raisingWidth={layout.arenaRaisingWidth}
              compactPiles={layout.compactPiles}
              opponentSecurityRef={anchors.opponentSecurity}
              opponentEggDeckRiffling={cues.deckRiffles.get(`${other}:eggDeck`) ?? false}
              breedingBurst={
                breedingOpponent.breeding ? cues.permanentBursts.get(breedingOpponent.breeding.permanentId) : undefined
              }
              breedingEffectSource={
                !!breedingOpponent.breeding &&
                chrome.permanentChrome.effectSourcePermanentIds.has(breedingOpponent.breeding.permanentId)
              }
              breedingEffectLinked={
                !!breedingOpponent.breeding &&
                chrome.permanentChrome.effectLinkedPermanentIds.has(breedingOpponent.breeding.permanentId)
              }
              breedingHighlight={
                !!breedingOpponent.breeding &&
                chrome.permanentChrome.decisionHighlightPermanentId === breedingOpponent.breeding.permanentId
              }
              securityCount={
                cues.securityDealCounts.get(other) ??
                shieldSecurityCount(shownOpponent.securityCount, cues.heldSecurityCounts.get(other))
              }
              securityBreak={cues.securityBreak}
              securityBreakMine={cues.securityBreak?.seat === other}
              securityHit={cues.securityHitSeat === other}
              securityLanding={cues.securityFlights.get(other)}
              securityDrop={{ "data-drop": "opp-security", ...chrome.dropIntentAttrs("opp-security") }}
              attackable={
                targeting.securityDecision !== undefined ||
                targeting.canAttackSecurity ||
                canAttackPlayerWith(targeting.draggedAttackerPermanent, false)
              }
              selected={targeting.securityDecision?.selected}
              onOpenOpponentBreeding={
                opponent.breeding
                  ? () => actions.showCardMenu(opponent.breeding!.permanentId, Side.Opponent)
                  : undefined
              }
              onAttackSecurity={
                targeting.securityDecision
                  ? targeting.securityDecision.onToggle
                  : selection.selPerm && targeting.canAttackSecurity
                    ? () => senders.attack(selection.selPerm!, { kind: "player" }, selection.vortexMode)
                    : undefined
              }
              onOpenOpponentSecurity={
                shownOpponent.securityCount ? () => overlays.setSecurityView(Side.Opponent) : undefined
              }
              onOpenOpponentEggDeck={
                seats.revealed
                  ? () => overlays.setRevealedZoneView({ side: Side.Opponent, zone: "eggDeck" })
                  : undefined
              }
            />
          </div>

          <PlayerDock
            spectating={spectating}
            handSortMode={handDock.handSortMode}
            showRecordedHand={replayMode && seats.shownHandEntries.length > 0}
            onSortHand={handDock.onSortHand}
            onMoveHandCard={handDock.onMoveHandCard}
            reorderDropBeforeInstanceId={handDock.reorderDropBeforeInstanceId}
            timer={state.matchTimer ? <MatchTimer state={state} seat={viewerSeat} /> : undefined}
            playerName={viewer.displayName || t("game.you")}
            playerAvatarId={viewer.avatarId}
            breedingDock={!layout.portraitArena ? breedingDock : null}
            pileDock={layout.dockViewerPiles ? viewerPiles : null}
            handDockRef={anchors.viewerHandDock}
            cardWidth={layout.handCardWidth}
            minExposure={layout.handMinExposure}
            cards={seats.shownHandEntries}
            selectedInstanceId={selection.handSel ?? undefined}
            effectSourceInstanceId={handDock.effectSourceInstanceId}
            effectSource={handDock.effectSource}
            selection={handDock.selection}
            draggingInstanceId={drag.isPlay && drag.state?.kind === DragKind.Play ? drag.state.instanceId : undefined}
            shakeInstanceId={handDock.shakeInstanceId}
            actionBar={handDock.actionBar}
            reserveActionBarSpace={handDock.reserveActionBarSpace}
            eggDeckCount={breedingViewer.eggDeckCount}
            handCount={spectating ? shownViewer.handCount : seats.shownHandCount}
            deckCount={shownViewer.deckCount}
            trashCount={shownViewer.trash.length}
            startDrag={onStartHandDrag}
            selectCard={(index) => {
              const entry = seats.shownHandEntries[index];
              if (entry) {
                if (replayMode) onOpenCard(entry.cardId, entry.artId);
                else actions.selectHandCard(entry);
              }
            }}
            onHoverChange={handDock.onHoverChange}
          />

          <AttackArrowLayer preview={targeting.previewArrow} tracking={targeting.trackingArrow} />

          <FieldClashGhosts
            scene={cues.fieldClash}
            permanentRefs={anchors.permanents}
            permanentCenters={anchors.permanentCenters}
            permanentCardIds={anchors.permanentCardIds}
            combatImpactIds={cues.combatImpactIds}
          />

          <BoardBurstLayer
            deleteBursts={cues.deleteBursts}
            drawBursts={cues.drawBursts}
            drawFlights={cues.drawFlights}
          />
        </div>

        {/* Desktop plays without the sidebar — its controls moved to the header
            cluster and the end-turn orb; the log opens from the header.
            The narrow layout keeps it: there it collapses into the touch strip. */}
        {layout.narrowGameLayout && !spectating ? (
          <Sidebar
            phase={state.phase}
            turnCount={state.turnCount}
            memory={readouts.memory}
            isMyTurn={guards.isMyTurn}
            canMove={guards.breedingActionsOpen && guards.canMoveOutOfBreeding}
            hasBreeding={!!viewer.breeding}
            canHatch={guards.breedingActionsOpen && guards.canHatchEgg}
            narrow
            log={readouts.log}
            onHatchOrMove={actions.onBreeding}
            onSurrender={spectating ? () => onLeaveSpectator?.() : () => overlays.setSurrenderConfirmOpen(true)}
            onReportBug={() => overlays.setBugReportOpen(true)}
          />
        ) : null}

        {stageEl ? createPortal(overlayStack, stageEl) : overlayStack}

        {endTurnDialog && stageEl ? createPortal(endTurnDialog, stageEl) : endTurnDialog}

        {surrenderDialog && stageEl ? createPortal(surrenderDialog, stageEl) : surrenderDialog}

        {chat ? (
          <>
            <ChatBubble entry={chat.latest[other]} side="opponent" senderName={opponentName} boardRef={anchors.board} />
            <ChatBubble
              entry={chat.latest[viewerSeat]}
              side="player"
              senderName={viewerName}
              boardRef={anchors.board}
            />
            {chatOpen ? (
              <MatchChatWindow
                chat={chat}
                spectating={spectating}
                seatNames={
                  {
                    [viewerSeat]: viewer.displayName || t("game.you"),
                    [other]: opponentName,
                  } as Record<Seat, string>
                }
                onClose={() => setChatOpen(false)}
              />
            ) : null}
          </>
        ) : null}

        {drag.cardId ? (
          <DragGhost
            cardId={drag.cardId}
            artId={drag.state?.artId}
            x={drag.state!.x}
            y={drag.state!.y}
            intent={drag.hoveredIntent}
            coarsePointer={layout.coarsePointer}
          />
        ) : null}
      </main>
    </CardOpenerProvider>
  );
}
