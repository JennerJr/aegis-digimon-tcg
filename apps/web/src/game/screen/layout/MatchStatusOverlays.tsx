/* What the viewer opens for themselves — the match log, a card blown up, the bug
   report — and the two the match opens over them: an opponent who dropped, and the
   result once the game is over. */

import { BugReportDialog } from "../../../bugs/BugReportDialog";
import { PlayLogSidebar } from "../../PlayLogSidebar";
import { CardZoomOverlay, GameOverOverlay, OpponentDroppedOverlay } from "../../overlay";
import type { SeriesResultProps } from "../../overlay/match/GameOverOverlay";
import type { LogLine } from "../../matchLog";
import type { GameOverOutcome } from "../../gameOverSplash";
import type { ArenaDeckColors } from "../../../design/arenaPalette";
import { ArenaLookDialog } from "./ArenaLookDialog";
import type { ReplaySaveProps } from "../../../replays/ReplaySavePrompt";

export function MatchStatusOverlays({
  log,
  historyOpen,
  zoomCardId,
  zoomArtId,
  bugReportOpen,
  arenaLook,
  matchLogId,
  signedIn,
  accountId,
  opponentDropped,
  gameOver,
  onCloseHistory,
  onOpenCard,
  onCloseZoom,
  onCloseBugReport,
  onMenu,
  onRematch,
  onLeaveDropped,
  returnsToRoom,
}: {
  log: readonly LogLine[];
  historyOpen: boolean;
  zoomCardId: string | null;
  zoomArtId: string | undefined;
  bugReportOpen: boolean;
  /** The board look settings, while the viewer has them open. */
  arenaLook?: { deckColors: ArenaDeckColors; onClose: () => void };
  matchLogId: string;
  /** Only shapes what the report dialog says about follow-up questions. */
  signedIn: boolean;
  accountId?: string;
  /** The opponent's socket is gone and the match has not ended, so the board waits. */
  opponentDropped: boolean;
  /** The result and its stats, or nothing while the match is still running. */
  gameOver:
    | (ReplaySaveProps & {
        spectatorResult?: string;
        onDownloadReplay?: () => void;
        onViewUsedDeck?: () => void;
        replayStatus?: "preparing" | "unavailable";
        result: GameOverOutcome;
        reason: string;
        stats: { value: number; label: string }[];
        cardsRevealed: boolean;
        series?: SeriesResultProps;
      })
    | undefined;
  onCloseHistory: () => void;
  onOpenCard: (cardId: string) => void;
  onCloseZoom: () => void;
  onCloseBugReport: () => void;
  onMenu: () => void;
  onRematch: () => void;
  /** Asks to leave the match while the opponent is gone; leaving counts as a surrender. */
  onLeaveDropped: () => void;
  returnsToRoom?: boolean;
}) {
  return (
    <>
      {historyOpen ? <PlayLogSidebar log={log} onClose={onCloseHistory} onOpenCard={onOpenCard} /> : null}

      {zoomCardId ? <CardZoomOverlay cardId={zoomCardId} artId={zoomArtId} onClose={onCloseZoom} /> : null}

      {bugReportOpen ? (
        <BugReportDialog accountId={accountId} signedIn={signedIn} matchLogId={matchLogId} onClose={onCloseBugReport} />
      ) : null}

      {arenaLook ? <ArenaLookDialog deckColors={arenaLook.deckColors} onClose={arenaLook.onClose} /> : null}

      {opponentDropped ? <OpponentDroppedOverlay onLeave={onLeaveDropped} /> : null}

      {gameOver ? (
        <GameOverOverlay
          spectatorResult={gameOver.spectatorResult}
          onViewUsedDeck={gameOver.onViewUsedDeck}
          onDownloadReplay={gameOver.onDownloadReplay}
          replayFile={gameOver.replayFile}
          replayStatus={gameOver.replayStatus}
          signedIn={signedIn}
          result={gameOver.result}
          reason={gameOver.reason}
          stats={gameOver.stats}
          cardsRevealed={gameOver.cardsRevealed}
          onMenu={onMenu}
          onRematch={onRematch}
          returnsToRoom={returnsToRoom}
          series={gameOver.series}
        />
      ) : null}
    </>
  );
}
