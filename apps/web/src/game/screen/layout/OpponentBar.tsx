import { SpectatorInvite } from "./SpectatorInvite";
/* The bar across the top of the board: the opponent's counters, the fan of card
   backs that stands for their hand, and the match-level controls.

   Where those controls live is the only thing that varies. A portrait phone folds
   them into one menu, a narrow layout spells them out as icon buttons because the
   sidebar footer is out of reach mid-match, and the desktop — which dropped the
   sidebar — carries them as the reference client's circular header buttons. */

import type { CSSProperties, ReactNode, RefObject } from "react";
import type { FinalRevealCard, Phase, Seat } from "@aegis/shared";
import { useTranslation } from "../../../i18n";
import { Icons } from "../../../design/icons";
import { CardBack } from "../../../design/cards";
import { CardArt } from "../../overlay/CardArt";
import { printedCardName } from "../../overlay/printedCardName";
import { useCardOpener } from "../../cardLinks";
import { ArenaCounters } from "../../ArenaCounters";
import { useEnterAnimation } from "../../animations";
import { Side } from "../../side";
import { PlayerLine } from "./PlayerLine";
import { useFullscreen } from "../hooks/useFullscreen";
import { useHeldFlag } from "../hooks/useHeldFlag";

const OPPONENT_NAME_MAX_LENGTH = 12;
/** Animation batches arrive with short gaps; the skip button outlasts them instead of blinking. */
export const SKIP_BUTTON_HOLD_MS = 700;
const CHAT_UNREAD_SHOWN_MAX = 9;

function ChatUnreadBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="game-chat-unread" aria-hidden="true" data-testid="chat-unread">
      {count > CHAT_UNREAD_SHOWN_MAX ? `${CHAT_UNREAD_SHOWN_MAX}+` : count}
    </span>
  );
}

export function OpponentBar({
  rollbackControls,
  spectating = false,
  spectatorCode,
  timer,
  handStripRef,
  opponentName,
  opponentAvatarId,
  viewerSeat,
  displayedTurnSeat,
  displayedTurnCount,
  phase,
  memory,
  eggDeckCount,
  handCount,
  revealedHand,
  deckCount,
  trashCount,
  portraitArena,
  narrowGameLayout,
  skippable,
  onOpenLog,
  onReportBug,
  onOpenArenaLook,
  onToggleChat,
  chatOpen = false,
  chatUnread = 0,
  onSurrender,
  onSkipPresentation,
  onResetScenario,
}: {
  rollbackControls?: ReactNode;
  spectating?: boolean;
  spectatorCode?: string;
  timer?: ReactNode;
  handStripRef: RefObject<HTMLDivElement | null>;
  opponentName: string;
  opponentAvatarId: string;
  viewerSeat: Seat;
  displayedTurnSeat: Seat;
  displayedTurnCount: number;
  phase: Phase;
  memory: number;
  eggDeckCount: number;
  handCount: number;
  /** The hand face up, once the server reveals it after the match. */
  revealedHand?: readonly FinalRevealCard[];
  deckCount: number;
  trashCount: number;
  portraitArena: boolean;
  narrowGameLayout: boolean;
  /** There is something to fast-forward, so the desktop offers the skip button. */
  skippable: boolean;
  onOpenLog: () => void;
  onReportBug: () => void;
  onOpenArenaLook: () => void;
  /** Absent when there is no live room to chat through. */
  onToggleChat?: () => void;
  chatOpen?: boolean;
  /** Messages from others since the chat window was last open. */
  chatUnread?: number;
  onSurrender: () => void;
  onSkipPresentation: () => void;
  onResetScenario?: () => void;
}) {
  const { t } = useTranslation();
  const fullscreen = useFullscreen();
  const fullscreenLabel = fullscreen.active ? t("game.fullscreen.exit") : t("game.fullscreen.enter");
  const FullscreenIcon = fullscreen.active ? Icons.Minimize : Icons.Maximize;
  const chatLabel = chatUnread > 0 ? t("chat.openUnread", { count: chatUnread }) : t("chat.open");
  const openCard = useCardOpener();
  const skipShown = useHeldFlag(skippable, SKIP_BUTTON_HOLD_MS);
  const fanned = revealedHand?.length ?? Math.max(0, handCount);
  const entering = useEnterAnimation(Array.from({ length: fanned }, (_, index) => String(index)));
  return (
    <header
      className="game-opponent-bar"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "12px 26px",
        borderBottom: "1px solid var(--ds-line)",
        background: "var(--ds-sheet)",
      }}
    >
      <ArenaCounters side={Side.Opponent} eggs={eggDeckCount} hand={handCount} deck={deckCount} trash={trashCount} />
      <PlayerLine
        name={opponentName}
        avatarId={opponentAvatarId}
        side="opponent"
        maxLength={OPPONENT_NAME_MAX_LENGTH}
        timer={timer}
        playing={displayedTurnSeat !== viewerSeat}
      />
      <div
        className="game-opponent-hand"
        ref={handStripRef}
        role={revealedHand ? "group" : "img"}
        aria-label={t("game.handCount", { count: handCount })}
        title={t("game.counter.hand", { count: handCount })}
        data-testid="opponent-hand"
        data-hand-count={handCount}
        style={
          {
            display: "flex",
            alignItems: "center",
            gap: 7,
            "--arena-opponent-hand-count": Math.max(1, fanned),
          } as CSSProperties
        }
      >
        {Array.from({ length: fanned }).map((_, i) => (
          <div
            key={i}
            data-opponent-hand-slot={i}
            className={entering.has(String(i)) ? "game-opponent-hand-card--arriving" : undefined}
            aria-hidden={!revealedHand}
            style={
              {
                marginLeft: i ? -22 : 0,
                "--arena-opponent-position": fanned < 2 ? 0.5 : i / (fanned - 1),
              } as CSSProperties
            }
          >
            {revealedHand?.[i] ? (
              <button
                type="button"
                className="game-opponent-hand__reveal"
                aria-label={printedCardName(revealedHand[i].cardId)}
                onClick={() => openCard?.(revealedHand[i]!.cardId, revealedHand[i]!.artId)}
              >
                <CardArt cardId={revealedHand[i].cardId} artId={revealedHand[i].artId} width={30} />
              </button>
            ) : (
              <CardBack width={30} useSelectedSleeve={false} />
            )}
          </div>
        ))}
        <span
          style={{
            fontFamily: "var(--ds-font-mono)",
            fontSize: 12,
            color: "var(--ds-text-3)",
            marginLeft: 8,
          }}
        >
          {t("game.handCount", { count: handCount })}
        </span>
      </div>
      <div className="game-mobile-turn">
        <strong>
          {spectating
            ? t("spectator.watching")
            : displayedTurnSeat === viewerSeat
              ? t("game.yourTurn")
              : t("game.opponentsTurn")}{" "}
          · {displayedTurnCount}
        </strong>
        <span>
          {t(`game.phase.${phase}` as const)} · {memory > 0 ? "+" : ""}
          {memory}
        </span>
      </div>
      {portraitArena ? (
        <details
          className="game-mobile-menu"
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.currentTarget.open = false;
              event.currentTarget.querySelector("summary")?.focus();
            }
          }}
          onClick={(event) => {
            if (event.target instanceof Element && event.target.closest("button")) event.currentTarget.open = false;
          }}
        >
          <summary aria-label={t("mobile.board.matchMenu")}>
            <Icons.MoreVertical size={20} />
            <ChatUnreadBadge count={chatUnread} />
          </summary>
          <div className="game-mobile-menu__actions">
            {rollbackControls}
            {spectatorCode ? <SpectatorInvite code={spectatorCode} variant="menu" /> : null}
            {onResetScenario ? (
              <button type="button" onClick={onResetScenario}>
                ↻ Reset battle
              </button>
            ) : null}
            <button type="button" onClick={onOpenLog}>
              <Icons.ScrollText size={18} /> {t("game.matchLog")}
            </button>
            {onToggleChat ? (
              <button type="button" onClick={onToggleChat}>
                <Icons.MessageSquare size={18} /> {chatLabel}
              </button>
            ) : null}
            {fullscreen.supported ? (
              <button type="button" onClick={fullscreen.toggle}>
                <FullscreenIcon size={18} /> {fullscreenLabel}
              </button>
            ) : null}
            <button type="button" onClick={onReportBug}>
              <Icons.Megaphone size={18} /> {t("bugReport.button")}
            </button>
            <button type="button" onClick={onOpenArenaLook}>
              <Icons.Settings size={18} /> {t("redesign.arena.look.open")}
            </button>
            <button type="button" onClick={onSurrender}>
              <Icons.LogOut size={18} /> {t(spectating ? "spectator.leave" : "game.surrender")}
            </button>
          </div>
        </details>
      ) : narrowGameLayout ? (
        <>
          {rollbackControls}
          {spectatorCode ? <SpectatorInvite code={spectatorCode} variant="mobile" /> : null}
          <button
            type="button"
            className="game-mobile-log"
            onClick={onOpenLog}
            aria-label={t("game.matchLog")}
            data-testid="log-strip"
          >
            <Icons.ScrollText size={16} />
          </button>
          {onToggleChat ? (
            <button
              type="button"
              className="game-mobile-log game-mobile-chat"
              onClick={onToggleChat}
              aria-label={chatLabel}
              aria-pressed={chatOpen}
            >
              <Icons.MessageSquare size={16} />
              <ChatUnreadBadge count={chatUnread} />
            </button>
          ) : null}
          <button className="game-mobile-bug" onClick={onReportBug} aria-label={t("bugReport.button")}>
            <Icons.Megaphone size={16} />
          </button>
          <button className="game-mobile-look" onClick={onOpenArenaLook} aria-label={t("redesign.arena.look.open")}>
            <Icons.Settings size={16} />
          </button>
          {fullscreen.supported ? (
            <button className="game-mobile-fullscreen" onClick={fullscreen.toggle} aria-label={fullscreenLabel}>
              <FullscreenIcon size={16} />
            </button>
          ) : null}
          <button
            className="game-mobile-surrender"
            onClick={onResetScenario ?? onSurrender}
            aria-label={onResetScenario ? "Reset battle" : t(spectating ? "spectator.leave" : "game.surrender")}
          >
            {onResetScenario ? "↻" : <Icons.LogOut size={16} />}
          </button>
        </>
      ) : (
        <div className="game-topbar-actions">
          {rollbackControls}
          {spectatorCode ? <SpectatorInvite code={spectatorCode} /> : null}
          {onResetScenario ? (
            <button
              type="button"
              className="game-topbar-button"
              onClick={onResetScenario}
              aria-label="Reset battle"
              title="Reset battle"
            >
              ↻
            </button>
          ) : null}
          <button className="game-topbar-button" onClick={onOpenLog} aria-label={t("game.matchLog")}>
            <Icons.ScrollText size={17} />
          </button>
          <button className="game-topbar-button" onClick={onReportBug} aria-label={t("bugReport.button")}>
            <Icons.Megaphone size={17} />
          </button>
          {onToggleChat ? (
            <button
              className="game-topbar-button"
              onClick={onToggleChat}
              aria-label={chatLabel}
              aria-pressed={chatOpen}
              title={chatLabel}
            >
              <Icons.MessageSquare size={17} />
              <ChatUnreadBadge count={chatUnread} />
            </button>
          ) : null}
          {fullscreen.supported ? (
            <button
              className="game-topbar-button"
              onClick={fullscreen.toggle}
              aria-label={fullscreenLabel}
              title={fullscreenLabel}
            >
              <FullscreenIcon size={17} />
            </button>
          ) : null}
          {/* The slot is always there so the buttons around it never move; the button
              only shows while there is something to skip. The phone has no equivalent
              — a tap anywhere on the board already advances the narration. Space and
              Enter come free with the native button; the match has no global keys. */}
          <button
            className="game-topbar-button game-topbar-button--skip"
            onClick={onSkipPresentation}
            aria-label={t("game.skipPresentation")}
            title={skipShown ? t("game.skipPresentation") : undefined}
            aria-hidden={!skipShown}
            disabled={!skipShown}
            tabIndex={skipShown ? undefined : -1}
            data-skippable={skipShown}
            data-testid="skip-presentation"
          >
            <Icons.FastForward size={17} />
          </button>
          <button
            className="game-topbar-button game-topbar-button--look"
            onClick={onOpenArenaLook}
            aria-label={t("redesign.arena.look.open")}
            title={t("redesign.arena.look.open")}
          >
            <Icons.Settings size={17} />
          </button>
          <button
            className="game-topbar-button game-topbar-button--danger"
            onClick={onSurrender}
            aria-label={t(spectating ? "spectator.leave" : "game.surrender")}
          >
            <Icons.LogOut size={17} />
          </button>
        </div>
      )}
    </header>
  );
}
