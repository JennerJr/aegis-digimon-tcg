import type { Migration } from "../migrator.js";
import { initialSchema } from "./001-initial-schema.js";
import { tournamentProgramColumns } from "./002-tournament-program-columns.js";
import { tournamentRulesAndBanlist } from "./003-tournament-rules-and-banlist.js";
import { tournamentParticipants } from "./004-tournament-participants.js";
import { matchSeriesAndGames } from "./005-match-series-and-games.js";
import { phasesAndRounds } from "./006-phases-and-rounds.js";
import { deadlineScheduler } from "./007-deadline-scheduler.js";
import { botParticipants } from "./008-bot-participants.js";
import { topCut } from "./009-top-cut.js";
import { tournamentEvents } from "./010-tournament-events.js";
import { gameDeckSnapshots } from "./011-game-deck-snapshots.js";
import { accountAvatar } from "./012-account-avatar.js";
import { accountAdmin } from "./013-account-admin.js";
import { accountDisplayNameChange } from "./014-account-display-name-change.js";

import { deckCardArts } from "./015-deck-card-arts.js";
import { deckCoverCard } from "./016-deck-cover-card.js";
import { accountPreferences } from "./017-account-preferences.js";
import { emailDailyUsage } from "./018-email-daily-usage.js";
import { communityDecks } from "./019-community-decks.js";
import { deckSleeve } from "./020-deck-sleeve.js";
import { deckEggSleeve } from "./021-deck-egg-sleeve.js";
import { publicDeckHiddenStatus } from "./022-public-deck-hidden-status.js";
import { accountAvatarCheckedAt } from "./023-account-avatar-checked-at.js";
import { feedbackReports } from "./024-feedback-reports.js";
import { savedDeckFormat } from "./025-deck-format.js";
import { feedbackTriage } from "./026-feedback-triage.js";
import { communityDeckReports } from "./027-community-deck-reports.js";
import { resetFeedbackBaseline } from "./028-reset-feedback-baseline.js";
import { accountReplays } from "./029-account-replays.js";
import { replaySharingHistory } from "./030-replay-sharing-history.js";
import { feedbackReportReplays } from "./031-feedback-report-replays.js";
import { publicFeedbackForum } from "#api/db/migrations/033-public-feedback-forum";

import { magicLinkRequestLimits } from "#api/db/migrations/032-magic-link-request-limits";

export const migrations: readonly Migration[] = [
  initialSchema,
  tournamentProgramColumns,
  tournamentRulesAndBanlist,
  tournamentParticipants,
  matchSeriesAndGames,
  phasesAndRounds,
  deadlineScheduler,
  botParticipants,
  topCut,
  tournamentEvents,
  gameDeckSnapshots,
  accountAvatar,
  accountAdmin,
  accountDisplayNameChange,
  deckCardArts,
  deckCoverCard,
  accountPreferences,
  emailDailyUsage,
  communityDecks,
  deckSleeve,
  deckEggSleeve,
  publicDeckHiddenStatus,
  accountAvatarCheckedAt,
  feedbackReports,
  savedDeckFormat,
  feedbackTriage,
  communityDeckReports,
  resetFeedbackBaseline,
  accountReplays,
  replaySharingHistory,
  feedbackReportReplays,
  magicLinkRequestLimits,
  publicFeedbackForum,
];
