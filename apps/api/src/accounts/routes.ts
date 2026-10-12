import { ForumStore } from "#api/bugs/ForumStore";
import { isDeckFormat, type DeckFormat } from "@aegis/shared";
import { randomBytes } from "node:crypto";
import { ReplayLibrary } from "../replays/ReplayLibrary.js";
import { installReplayRoutes } from "../replays/routes.js";
import {
  latestReleasedProductLabel,
  isAvatarChoice,
  MATCH_MODES,
  MATCH_OPPONENT_SEARCH_MAX,
  MATCH_PAGE_SIZE,
  MATCH_RESULTS,
  MAX_MATCH_PAGE_SIZE,
  type BanlistPolicy,
  type MatchHistoryFilter,
  type MatchHistoryPage,
  type CreateTournamentInput,
  type SeriesScoreView,
  type TournamentSummary,
  type TournamentView,
} from "@aegis/shared";
import type { Express, NextFunction, Request, Response } from "express";
import {
  defaultBanlistPolicy,
  LEGACY_DEFAULT_PRESET_ID,
  validateCreateTournament,
} from "../tournaments/rules/index.js";
import {
  ParticipantStore,
  WindowOrderError,
  type ParticipantFailure,
  type TournamentWindows,
} from "../tournaments/participants/index.js";
import { matchClockContext, SeriesStore, type SeriesFailure } from "../tournaments/series/index.js";
import { seriesDurationFor } from "../tournaments/rules/clocks.js";
import { SwissProgram } from "../tournaments/swiss/index.js";
import { BotSeatingStore } from "../tournaments/bots/index.js";
import { EliminationStore } from "../tournaments/elimination/index.js";
import { ArbitrationService, installArbitrationRoutes } from "../tournaments/arbitration/index.js";
import { FeedbackStore } from "../bugs/FeedbackStore.js";
import { installBugReportRoutes } from "#api/bugs/routes";
import { ReplayCapturer } from "#api/bugs/replayCapture";
import type { IssueTracker } from "#api/bugs/GitHubIssueTracker";
import { NotificationStore } from "../notifications/NotificationStore.js";
import { installNotificationRoutes } from "../notifications/routes.js";
import { CommunityDeckStore } from "../community/CommunityDeckStore.js";
import type { DeckReportTracker } from "../community/deckReports.js";
import { installCommunityDeckRoutes } from "../community/routes.js";
import { DeckReportStore } from "../community/DeckReportStore.js";
import { openEliminationEvent } from "../tournaments/lifecycle/openEliminationEvent.js";
import { TopCutProgram } from "../tournaments/topcut/index.js";
import { tokenBucketLimiter, type TokenBucketOptions } from "../http/rateLimit.js";
import { EmailQuotaExceededError, type Mailer } from "../email/mailer.js";
import { TOURNAMENT_RULES_PRESETS, type TournamentRulesPreset } from "../tournaments/rules/index.js";
import { type DiscordAvatarSource, discordAvatarUrl, refreshDiscordAvatarNow } from "./discordAvatars.js";
import {
  AccountStore,
  DeckLimitError,
  DisplayNameTakenError,
  InvalidDisplayNameError,
  MAX_SAVED_DECKS,
  type AccountPreferences,
  type AuthSession,
  type Tournament,
} from "./AccountStore.js";

const SESSION_COOKIE = "aegis_session";
const DISPLAY_NAME_RATE_LIMIT: TokenBucketOptions = { capacity: 10, refillMs: 3_000 };
const DISCORD_AVATAR_REFRESH_RATE_LIMIT: TokenBucketOptions = { capacity: 5, refillMs: 1_000 };

// Rejections that are the caller asking for something that does not exist, rather than a conflict
// with the tournament's current state.
const NOT_FOUND_FAILURES: readonly ParticipantFailure[] = ["tournament_not_found", "deck_not_found"];
// Same split for the series module: what does not exist is a 404, what the caller has no standing
// to ask for is a 403, and everything else is a conflict with the confrontation's current state.
const SERIES_NOT_FOUND_FAILURES: readonly SeriesFailure[] = ["match_not_found", "series_not_found", "game_not_found"];
const WINDOW_KEYS = [
  "registrationClosesAt",
  "checkInOpensAt",
  "checkInClosesAt",
] as const satisfies readonly (keyof TournamentWindows)[];

export function installAccountRoutes(
  app: Express,
  store: AccountStore,
  participants: ParticipantStore = new ParticipantStore(store),
  series: SeriesStore = new SeriesStore(store),
  swiss: SwissProgram = new SwissProgram(store, series),
  elimination: EliminationStore = new EliminationStore(store),
  botSeating: BotSeatingStore = new BotSeatingStore(store),
  topCut: TopCutProgram = new TopCutProgram(store, elimination),
  arbitration: ArbitrationService = new ArbitrationService(store, participants, series, swiss, elimination),
  bugTracker?: IssueTracker,
  mailer?: Mailer,
  deckReports?: DeckReportTracker,
  discordAvatars?: DiscordAvatarSource,
  replays: ReplayLibrary = new ReplayLibrary(store),
): void {
  const sessionFromRequest = (req: Request) => store.session(cookie(req, SESSION_COOKIE));
  installReplayRoutes({ app, library: replays, session: sessionFromRequest });
  // The organizer's override surface, in its own module. See src/tournaments/arbitration.
  installArbitrationRoutes({
    app,
    accounts: store,
    arbitration,
    session: sessionFromRequest,
  });
  // Feedback is stored locally, with an optional copy in GitHub. A report filed from a match also
  // keeps a private copy of the match's input record (see bugs/replayCapture).
  installBugReportRoutes({
    app,
    store: new FeedbackStore(store),
    forum: new ForumStore(store),
    tracker: bugTracker,
    session: sessionFromRequest,
    replayCapture: ReplayCapturer.fromEnvironment(),
  });
  // The signed-in player's inbox; feedback triage is its first producer. See src/notifications.
  installNotificationRoutes({ app, store: new NotificationStore(store), session: sessionFromRequest });
  // Public decks, likes and copies. See src/community.
  installCommunityDeckRoutes({
    app,
    store: new CommunityDeckStore(store),
    session: sessionFromRequest,
    reportStore: new DeckReportStore(store),
    reports: deckReports,
  });
  const get = (path: string, handler: AsyncHandler) => app.get(path, asyncRoute(handler));
  const post = (path: string, handler: AsyncHandler) => app.post(path, asyncRoute(handler));
  const put = (path: string, handler: AsyncHandler) => app.put(path, asyncRoute(handler));
  const del = (path: string, handler: AsyncHandler) => app.delete(path, asyncRoute(handler));
  const limitDisplayNameChange = tokenBucketLimiter(DISPLAY_NAME_RATE_LIMIT);
  get("/auth/me", async (req, res) => {
    const account = (await store.session(cookie(req, SESSION_COOKIE)))?.account;
    res.json(account ? { ...account, discordLinked: Boolean(await store.discordUserId(account.id)) } : null);
  });
  // Every replica shares one Discord bot bucket of about 30 requests per window.
  const limitDiscordAvatarRefresh = tokenBucketLimiter(DISCORD_AVATAR_REFRESH_RATE_LIMIT);
  post("/account/avatar/discord", async (req, res) => {
    const session = await requireSession(req, res, store);
    if (!session) return;
    if (!discordAvatars) {
      res.status(503).json({ error: "discord_unavailable" });
      return;
    }
    if (!limitDiscordAvatarRefresh("global")) {
      res.status(429).json({ error: "too_many_requests" });
      return;
    }
    const result = await refreshDiscordAvatarNow(store, discordAvatars, session.account.id);
    if (result.status === "refreshed") {
      res.json({ ...((await store.account(session.account.id)) ?? session.account), discordLinked: true });
      return;
    }
    const failures = { not_discord: 404, cooldown: 429, rate_limited: 429, failed: 502 } as const;
    res.status(failures[result.status]).json({ error: result.status });
  });
  post("/auth/logout", async (req, res) => {
    await store.revokeSession(cookie(req, SESSION_COOKIE));
    expire(res, SESSION_COOKIE);
    res.sendStatus(204);
  });
  post("/auth/room-ticket", async (req, res) => {
    const session = await requireSession(req, res, store);
    if (session) res.json({ ticket: await store.createRoomTicket(session.account.id) });
  });

  post("/auth/magic-link", async (req, res) => {
    const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
    if (email.length <= 254 && email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      if (!(await store.allowMagicLinkRequest({ ip: req.ip ?? "unknown", email }))) {
        res.status(429).json({ error: "too_many_requests" });
        return;
      }
      const { token } = await store.createMagicLink(email);
      try {
        await mailer?.({
          to: email,
          subject: "Sign in to Aegis",
          html: `<p><a href="${process.env.AEGIS_API_URL ?? "http://localhost:2567"}/auth/magic-link/consume?token=${token}">Sign in to Aegis</a></p>`,
        });
      } catch (error) {
        // The daily limit is global, so reporting it does not disclose anything about this address.
        if (error instanceof EmailQuotaExceededError) {
          res.status(429).json({ error: "email_daily_limit" });
          return;
        }
      }
    }
    res.status(202).json({ ok: true }); // deliberately does not disclose account existence or delivery status
  });
  get("/auth/magic-link/consume", async (req, res) => {
    const token = typeof req.query.token === "string" ? req.query.token : "";
    const account = await store.consumeMagicLink(token);
    if (!account) {
      res.status(400).json({ error: "invalid or expired sign-in link" });
      return;
    }
    setSession(res, await store.issueSession(account));
    res.redirect(process.env.AEGIS_WEB_URL ?? "/");
  });

  get("/auth/discord", (_req, res) => {
    const clientId = process.env.DISCORD_CLIENT_ID;
    const redirectUri = process.env.DISCORD_REDIRECT_URI;
    if (!clientId || !redirectUri) {
      res.status(503).json({ error: "Discord login is not configured" });
      return;
    }
    const state = randomBytes(24).toString("base64url");
    setCookie(res, "aegis_oauth_state", state, 600);
    const url = new URL("https://discord.com/oauth2/authorize");
    url.search = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "identify",
      state,
    }).toString();
    res.redirect(url.toString());
  });
  get("/auth/discord/callback", async (req, res) => {
    const code = typeof req.query.code === "string" ? req.query.code : "";
    const state = req.query.state;
    const expectedState = cookie(req, "aegis_oauth_state");
    if (!code || typeof state !== "string" || !state || !expectedState || state !== expectedState) {
      res.status(400).json({ error: "invalid OAuth state" });
      return;
    }
    expire(res, "aegis_oauth_state");
    try {
      const token = await discordToken(code);
      const user = await discordUser(token);
      const account = await store.accountForIdentity(
        "discord",
        user.id,
        user.global_name ?? user.username,
        discordAvatarUrl(user.id, user.avatar),
      );
      setSession(res, await store.issueSession(account));
      res.redirect(process.env.AEGIS_WEB_URL ?? "/");
    } catch {
      res.status(502).json({ error: "Discord sign-in failed" });
    }
  });

  get("/account/decks", async (req, res) => {
    const session = await requireSession(req, res, store);
    if (session) res.json(await store.decks(session.account.id));
  });
  put("/account/decks{/:id}", async (req, res) => {
    const session = await requireSession(req, res, store);
    if (!session) return;
    const { name, mainDeck, eggDeck, mainDeckArts, eggDeckArts, coverCardId, sleeveId, eggSleeveId, format } =
      req.body as {
        name?: unknown;
        mainDeck?: unknown;
        eggDeck?: unknown;
        mainDeckArts?: unknown;
        eggDeckArts?: unknown;
        coverCardId?: unknown;
        sleeveId?: unknown;
        eggSleeveId?: unknown;
        format?: unknown;
      };
    if (
      (format !== undefined && !isDeckFormat(format)) ||
      typeof name !== "string" ||
      !Array.isArray(mainDeck) ||
      !Array.isArray(eggDeck) ||
      !mainDeck.every((v) => typeof v === "string") ||
      !eggDeck.every((v) => typeof v === "string") ||
      (mainDeckArts !== undefined &&
        (!Array.isArray(mainDeckArts) ||
          mainDeckArts.length !== mainDeck.length ||
          !mainDeckArts.every((v) => typeof v === "string"))) ||
      (eggDeckArts !== undefined &&
        (!Array.isArray(eggDeckArts) ||
          eggDeckArts.length !== eggDeck.length ||
          !eggDeckArts.every((v) => typeof v === "string"))) ||
      (coverCardId !== undefined && coverCardId !== null && typeof coverCardId !== "string") ||
      (sleeveId !== undefined && sleeveId !== null && !isSleeveId(sleeveId)) ||
      (eggSleeveId !== undefined && eggSleeveId !== null && !isSleeveId(eggSleeveId))
    ) {
      res.status(400).json({ error: "invalid deck" });
      return;
    }
    try {
      res.json(
        await store.saveDeck(session.account.id, {
          id: req.params.id!,
          name,
          mainDeck,
          eggDeck,
          mainDeckArts: mainDeckArts as string[] | undefined,
          eggDeckArts: eggDeckArts as string[] | undefined,
          coverCardId: (coverCardId as string | null | undefined) ?? undefined,
          sleeveId: (sleeveId as string | null | undefined) ?? undefined,
          eggSleeveId: (eggSleeveId as string | null | undefined) ?? undefined,
          format: format as DeckFormat | undefined,
        }),
      );
    } catch (error) {
      if (error instanceof DeckLimitError) {
        res.status(409).json({ error: "deck limit reached", limit: MAX_SAVED_DECKS });
        return;
      }
      throw error;
    }
  });
  del("/account/decks/:id", async (req, res) => {
    const session = await requireSession(req, res, store);
    if (session) res.sendStatus((await store.deleteDeck(session.account.id, req.params.id!)) ? 204 : 404);
  });
  get("/account/profile", async (req, res) => {
    const session = await requireSession(req, res, store);
    if (session) {
      res.setHeader("Cache-Control", "private, no-store");
      res.json({ account: session.account, ...(await store.profile(session.account.id)) });
    }
  });
  get("/account/matches", async (req, res) => {
    const session = await requireSession(req, res, store);
    if (!session) return;
    const query = parseMatchHistoryQuery(req.query);
    if (!query) {
      res.status(400).json({ error: "invalid_query" });
      return;
    }
    const { matches, total, winRate } = await store.matchHistory(session.account.id, query);
    const saved = await replays.forMatches(
      session.account.id,
      matches.map((match) => match.id),
    );
    res.setHeader("Cache-Control", "private, no-store");
    res.json({
      matches: matches.map((match) => ({ ...match, replay: saved.find((item) => item.matchId === match.id) ?? null })),
      total,
      winRate,
      page: query.page,
      limit: query.limit,
      sharing: replays.sharing,
    } satisfies MatchHistoryPage);
  });
  put("/account/profile", async (req, res) => {
    const session = await requireSession(req, res, store);
    if (!session) return;
    const { displayName, avatarId } = req.body ?? {};
    if (typeof displayName !== "string") {
      res.status(400).json({ error: "invalid_display_name" });
      return;
    }
    if (!isAvatarChoice(avatarId)) {
      res.status(400).json({ error: "invalid avatar" });
      return;
    }
    if (displayName !== session.account.displayName && !limitDisplayNameChange(session.account.id)) {
      res.status(429).json({ error: "too_many_requests" });
      return;
    }
    try {
      res.json(await store.updateProfile(session.account.id, { displayName, avatarId }));
    } catch (error) {
      if (error instanceof InvalidDisplayNameError) res.status(400).json({ error: "invalid_display_name" });
      else if (error instanceof DisplayNameTakenError) res.status(409).json({ error: "display_name_taken" });
      else throw error;
    }
  });
  put("/account/profile/avatar", async (req, res) => {
    const session = await requireSession(req, res, store);
    if (!session) return;
    const avatarId = (req.body as { avatarId?: unknown }).avatarId;
    if (!isAvatarChoice(avatarId)) {
      res.status(400).json({ error: "invalid avatar" });
      return;
    }
    res.json(await store.updateAvatar(session.account.id, avatarId));
  });
  get("/account/preferences", async (req, res) => {
    const session = await requireSession(req, res, store);
    if (session) res.json(await store.preferences(session.account.id));
  });
  put("/account/preferences", async (req, res) => {
    const session = await requireSession(req, res, store);
    if (!session) return;
    const changes = parsePreferences(req.body);
    if (!changes) {
      res.status(400).json({ error: "invalid preferences" });
      return;
    }
    res.json(await store.updatePreferences(session.account.id, changes));
  });
  put("/account/profile/display-name", async (req, res) => {
    const session = await requireSession(req, res, store);
    if (!session) return;
    if (!limitDisplayNameChange(session.account.id)) {
      res.status(429).json({ error: "too_many_requests" });
      return;
    }
    const displayName = (req.body as { displayName?: unknown }).displayName;
    if (typeof displayName !== "string") {
      res.status(400).json({ error: "invalid_display_name" });
      return;
    }
    try {
      res.json(await store.updateDisplayName(session.account.id, displayName));
    } catch (error) {
      if (error instanceof InvalidDisplayNameError) {
        res.status(400).json({ error: "invalid_display_name" });
        return;
      }
      if (error instanceof DisplayNameTakenError) {
        res.status(409).json({ error: "display_name_taken" });
        return;
      }
      throw error;
    }
  });

  get("/tournaments", async (_req, res) => res.json((await store.tournaments()).map(toTournamentSummary)));
  // Registered before `/tournaments/:id`, or the parameterised route would answer it with a 404 for
  // a tournament named "presets".
  get("/tournaments/presets", async (_req, res) => res.json(TOURNAMENT_RULES_PRESETS.map(toPresetView)));
  get("/tournaments/:id", async (req, res) => {
    const id = req.params.id!;
    const tournament = await store.tournament(id);
    if (!tournament) {
      res.sendStatus(404);
      return;
    }
    // `satisfies` rather than a cast: the shared `TournamentView` is the contract the web client
    // compiles against, so a field renamed there must fail here rather than at runtime.
    const payload = {
      ...toTournamentSummary(tournament),
      rules: tournament.rules,
      banlistCards: tournament.banlistCards,
      participants: await participants.participantViews(id),
      phases: await swiss.phaseViews(id),
      // The FROZEN standings once the cut has been drawn from them, the live Swiss projection
      // before that. Re-projecting after the freeze would publish an order the Top Cut's own
      // results had already moved — and the frozen order is what the cut was made from.
      standings: (await topCut.frozenStandings(id)) ?? (await swiss.standings(id)),
      windows: await participants.windows(id),
      // The client renders every deadline against this, never against its own clock: a browser
      // minutes ahead of the server would otherwise show a round as expired while it is still live.
      serverNow: Date.now(),
      // The legacy bracket's flat views. Kept alongside `phases` until the web client reads phases.
      matches: await store.tournamentMatches(id),
      series: await series.scoreViews(id),
    } satisfies TournamentView & TournamentDetailExtras;
    res.json(payload);
  });
  post("/tournaments", async (req, res) => {
    const session = await requireSession(req, res, store);
    if (!session) return;
    if (!session.account.isAdmin) {
      res.status(403).json({ error: "admin_required" });
      return;
    }
    const parsed = parseCreateTournament(req.body as Record<string, unknown>);
    if (!parsed) {
      res.status(400).json({ error: "invalid tournament" });
      return;
    }
    const validated = validateCreateTournament(parsed.input, Date.now());
    if (!validated.ok) {
      res.status(400).json({ error: "invalid tournament", reasons: validated.errors });
      return;
    }
    const { input, preset, rules, banlistCards } = validated.value;
    const tournament = await store.createTournament(session.account.id, {
      name: input.name,
      block: parsed.block,
      startsAt: input.startsAt,
      maxPlayers: input.maxPlayers,
      structure: input.structure,
      bestOf: input.bestOf,
      topCutEnabled: input.topCut,
      allowBots: input.allowBots,
      rulesetPreset: preset.id,
      rules,
      banlistPolicy: input.banlist,
      banlistCards,
    });
    res
      .status(201)
      .json({ ...toTournamentSummary(tournament), rules: tournament.rules, banlistCards: tournament.banlistCards });
  });
  // Legacy casual registration. Kept as-is rather than redirected: it writes the
  // `tournament_registrations` row the single-elimination bracket still seeds from, and it asks
  // for no deck. Competitive entry is POST /tournaments/:id/participants; the two coexist until
  // the bracket moves onto participants in a later slice.
  post("/tournaments/:id/register", async (req, res) => {
    const session = await requireSession(req, res, store);
    if (session) res.sendStatus((await store.registerTournament(req.params.id!, session.account.id)) ? 204 : 409);
  });

  post("/tournaments/:id/participants", async (req, res) => {
    const session = await requireSession(req, res, store);
    if (!session) return;
    const { savedDeckId } = req.body as { savedDeckId?: unknown };
    if (typeof savedDeckId !== "string" || !savedDeckId) {
      res.status(400).json({ error: "savedDeckId is required" });
      return;
    }
    const result = await participants.register({
      tournamentId: req.params.id!,
      accountId: session.account.id,
      savedDeckId,
    });
    if (!result.ok) {
      sendParticipantFailure(res, result.reason, result.violations);
      return;
    }
    res.status(201).json(result.value);
  });
  post("/tournaments/:id/check-in", async (req, res) => {
    const session = await requireSession(req, res, store);
    if (!session) return;
    const result = await participants.checkIn({ tournamentId: req.params.id!, accountId: session.account.id });
    if (!result.ok) {
      sendParticipantFailure(res, result.reason);
      return;
    }
    res.json(result.value);
  });
  post("/tournaments/:id/drop", async (req, res) => {
    const session = await requireSession(req, res, store);
    if (!session) return;
    const result = await participants.drop({ tournamentId: req.params.id!, accountId: session.account.id });
    if (!result.ok) {
      sendParticipantFailure(res, result.reason);
      return;
    }
    res.json(result.value);
  });

  // Organizer-only schedule control. The deadline scheduler will drive the same two operations
  // once it exists; until then this is how a window is set and how a field is frozen at all.
  post("/tournaments/:id/windows", async (req, res) => {
    const session = await requireSession(req, res, store);
    if (!session) return;
    if (!(await participants.isOrganizer(req.params.id!, session.account.id))) {
      res.sendStatus(403);
      return;
    }
    const windows: Partial<TournamentWindows> = {};
    for (const key of WINDOW_KEYS) {
      const value = (req.body as Record<string, unknown>)[key];
      if (value === undefined) continue;
      if (value !== null && !Number.isFinite(value)) {
        res.status(400).json({ error: `${key} must be a timestamp or null` });
        return;
      }
      windows[key] = value === null ? null : Number(value);
    }
    try {
      if (!(await participants.setWindows(req.params.id!, windows))) {
        res.sendStatus(404);
        return;
      }
      res.json(await participants.windows(req.params.id!));
    } catch (error) {
      if (error instanceof WindowOrderError) {
        res.status(400).json({ error: error.message });
        return;
      }
      throw error;
    }
  });
  post("/tournaments/:id/close-check-in", async (req, res) => {
    const session = await requireSession(req, res, store);
    if (!session) return;
    if (!(await participants.isOrganizer(req.params.id!, session.account.id))) {
      res.sendStatus(403);
      return;
    }
    // Closing check-in starts the event, and WHICH start that is depends on the structure. Both
    // branches are idempotent, so a retried request neither re-freezes a field nor redraws a
    // bracket, and neither branch can run the other's format: the dispatch here is the only place
    // that decides, and each callee re-checks the structure for itself.
    const tournament = await store.tournament(req.params.id!);
    if (!tournament) {
      res.sendStatus(404);
      return;
    }
    if (tournament.structure === "single_elimination") {
      const opened = await openEliminationEvent({
        tournamentId: req.params.id!,
        participants,
        bots: botSeating,
        elimination,
      });
      // A cancellation is not a failure of the request — it is the correct outcome for a field that
      // never reached the minimum — but it is emphatically not a running event either, so it
      // answers 409 with the state the organizer must now see.
      if (opened.kind === "cancel") {
        res.status(409).json({ status: "cancelled", error: opened.reason });
        return;
      }
      if (opened.kind === "failed") {
        res.status(409).json({ error: opened.reason });
        return;
      }
      res.json({
        participants: await participants.participantViews(req.params.id!),
        bracket: opened.bracket,
        botsSeated: opened.botsSeated,
      });
      return;
    }
    const result = await participants.closeCheckIn({ tournamentId: req.params.id! });
    if (!result.ok) {
      sendParticipantFailure(res, result.reason);
      return;
    }
    // Closing check-in IS the start of a Swiss event (implementation plan, "Criação e formação
    // volátil" step 6): the confirmed field is what freezes the round count and the Top Cut size,
    // and round 1 is published from it in the same breath. Idempotent, and a no-op for any other
    // structure, so a retried request cannot re-freeze or double-publish.
    const program = await swiss.startTournamentProgram(req.params.id!);
    // The field is frozen either way — that write committed — but a Swiss event whose round 1 did
    // not publish has NOT started, and answering 200 would tell the organizer it had.
    res.status(program.ok ? 200 : 409).json({
      participants: result.value,
      phase: program.ok ? program.value : null,
      error: program.ok ? undefined : program.reason,
    });
  });
  // The organizer's undo for an event that has not started. Deliberately unavailable from the
  // moment it starts: from then on the tournament is a record other players appear in.
  del("/tournaments/:id", async (req, res) => {
    const session = await requireSession(req, res, store);
    if (!session) return;
    const outcome = await store.deleteTournament(req.params.id!, session.account.id, session.account.isAdmin);
    if (outcome === "deleted") {
      res.sendStatus(204);
      return;
    }
    if (outcome === "not_found") {
      res.sendStatus(404);
      return;
    }
    if (outcome === "forbidden") {
      res.sendStatus(403);
      return;
    }
    res.status(409).json({ error: "tournament_already_started" });
  });
  // The manual nudge. The deadline worker will call the same sweep on every tick once it exists;
  // until then — and whenever an operator needs to unstick an event without waiting for one — this
  // is how a tournament that lost its round-close notification gets moving again. Idempotent, so
  // pressing it twice is harmless.
  post("/tournaments/:id/sweep", async (req, res) => {
    const session = await requireSession(req, res, store);
    if (!session) return;
    if (!(await participants.isOrganizer(req.params.id!, session.account.id))) {
      res.sendStatus(403);
      return;
    }
    // Both passes, in the order the deadline worker runs them: closing the last Swiss round is what
    // parks the phase for the cut, so sweeping the cut afterwards finishes the job in one request.
    const advanced = await swiss.sweepOpenTournaments();
    res.json({ advanced: advanced + (await topCut.sweepFrozenSwissPhases()) });
  });

  post("/tournaments/:id/start", async (req, res) => {
    const session = await requireSession(req, res, store);
    if (session) res.sendStatus((await store.startTournament(req.params.id!, session.account.id)) ? 204 : 409);
  });
  // The BO3 confrontation. Presence starts the shared clock; the authorization is what lets a
  // client create or enter the room for the next game. Neither endpoint advances anything — the
  // series module owns the score and the deadline, and the room only plays one game.
  post("/tournaments/:id/matches/:matchId/present", async (req, res) => {
    const session = await requireSession(req, res, store);
    if (!session) return;
    const tournament = await store.tournament(req.params.id!);
    if (!tournament) {
      res.sendStatus(404);
      return;
    }
    const result = await series.markPresent({
      // Both ids matter: the ruleset below is read from THIS tournament, so the match has to be
      // one of its own. Without it, any event's ruleset could be applied to any match.
      tournamentId: req.params.id!,
      matchId: req.params.matchId!,
      accountId: session.account.id,
      winsRequired: tournament.rules?.match.winsRequired ?? (tournament.bestOf === 3 ? 2 : 1),
      seriesDurationMs: await seriesDurationMs(store, tournament, req.params.matchId!),
    });
    if (!result.ok) {
      sendSeriesFailure(res, result.reason);
      return;
    }
    res.json(withoutParticipantIds(result.value));
  });
  post("/series/:id/authorize-game", async (req, res) => {
    const session = await requireSession(req, res, store);
    if (!session) return;
    const result = await series.authorizeNextGame({ seriesId: req.params.id!, accountId: session.account.id });
    if (!result.ok) {
      sendSeriesFailure(res, result.reason);
      return;
    }
    res.json(withoutParticipantIds(result.value));
  });

  post("/tournaments/:id/matches/:matchId/ticket", async (req, res) => {
    const session = await requireSession(req, res, store);
    if (!session) return;
    const ticket = await store.createTournamentMatchTicket(session.account.id, req.params.id!, req.params.matchId!);
    if (!ticket) {
      res.sendStatus(403);
      return;
    }
    res.json({ ticket, tournamentMatchId: req.params.matchId! });
  });
}

/**
 * What the detail response carries BEYOND the shared `TournamentView`: the legacy bracket's flat
 * match/series arrays the current web client still reads, the schedule windows, and the pre-program
 * columns. Declared so `satisfies` can check the shared half strictly while still allowing these.
 */
type TournamentDetailExtras = {
  block: string;
  createdBy: string;
  winnerAccountId: string | null;
  registrations: number;
  windows: TournamentWindows | undefined;
  matches: unknown[];
  series: SeriesScoreView[];
};

/**
 * The wire shape of a tournament. `status` is translated into the shared vocabulary — the table
 * still stores the pre-program `in_progress` — while `block`, `createdBy` and `winnerAccountId`
 * remain alongside it for the existing bracket client.
 */
function toTournamentSummary(
  tournament: Tournament,
): TournamentSummary & Pick<Tournament, "block" | "createdBy" | "winnerAccountId"> & { registrations: number } {
  return {
    id: tournament.id,
    name: tournament.name,
    status: tournament.status === "in_progress" ? "running" : tournament.status,
    structure: tournament.structure,
    topCutEnabled: tournament.topCutEnabled,
    topCutSize: tournament.topCutSize,
    bestOf: tournament.bestOf,
    allowBots: tournament.allowBots,
    rulesetPreset: tournament.rulesetPreset,
    rulesetVersion: tournament.rulesetVersion,
    startsAt: tournament.startsAt,
    maxPlayers: tournament.maxPlayers,
    registeredCount: tournament.registrations,
    banlistPolicy: tournament.banlistPolicy,
    block: tournament.block,
    createdBy: tournament.createdBy,
    winnerAccountId: tournament.winnerAccountId,
    // Deprecated alias for `registeredCount`. Remove once the web client reads the shared contract.
    registrations: tournament.registrations,
  };
}

/**
 * What the creation form needs to build itself: which structures, best-ofs and toggles each ruleset
 * admits, and the clocks it would impose. Derived from the presets module rather than duplicated in
 * the client, so a preset added or reclocked here reaches the form without a front-end release.
 *
 * `durations` is keyed by best-of and carries only the options the preset actually offers, so a
 * form cannot render a clock for a best-of the preset would reject.
 */
function toPresetView(preset: TournamentRulesPreset) {
  return {
    id: preset.id,
    name: preset.label,
    origin: preset.origin,
    structures: preset.structures,
    bestOfOptions: preset.bestOfOptions,
    supportsTopCut: preset.supportsTopCut,
    supportsBots: preset.supportsBots,
    supportsUnrestrictedBanlist: preset.supportsUnrestrictedBanlist,
    durations: Object.fromEntries(preset.bestOfOptions.map((bestOf) => [bestOf, preset.clocks[bestOf]])),
    attendance: preset.attendance,
  };
}

/**
 * Shape-checks the request body into a `CreateTournamentInput`; the ruleset itself is judged by
 * `validateCreateTournament`, which owns the reason codes. Everything past `name`/`startsAt`/
 * `maxPlayers` is optional so the pre-program payload still creates the event it always created: a
 * single-elimination best-of-one lightning cup with no Top Cut, no bots and no banlist enforcement.
 * `block` is not part of the shared contract and defaults to the current card-pool label.
 */
function parseCreateTournament(
  body: Record<string, unknown>,
): { input: CreateTournamentInput; block: string } | undefined {
  const { name, block, startsAt, maxPlayers, structure, topCut, bestOf, allowBots, rulesetPreset, banlist } = body;
  if (typeof name !== "string" || !Number.isFinite(startsAt) || !Number.isInteger(maxPlayers)) return undefined;
  if (structure !== undefined && structure !== "swiss" && structure !== "single_elimination") return undefined;
  if (bestOf !== undefined && bestOf !== 1 && bestOf !== 3) return undefined;
  const preset = typeof rulesetPreset === "string" ? rulesetPreset : LEGACY_DEFAULT_PRESET_ID;
  const policy = banlist === undefined ? defaultBanlistPolicy(preset) : parseBanlistPolicy(banlist);
  if (!policy) return undefined;
  return {
    input: {
      name,
      structure: structure ?? "single_elimination",
      topCut: topCut === true,
      bestOf: bestOf ?? 1,
      startsAt: Number(startsAt),
      maxPlayers: Number(maxPlayers),
      allowBots: allowBots === true,
      rulesetPreset: preset,
      banlist: policy,
    },
    block: typeof block === "string" && block.trim() ? block.trim() : latestReleasedProductLabel(),
  };
}

function parseBanlistPolicy(value: unknown): BanlistPolicy | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const { mode, setId } = value as { mode?: unknown; setId?: unknown };
  if (mode === "none" || mode === "current") return { mode };
  if (mode === "as_of_set" && typeof setId === "string") return { mode, setId };
  return undefined;
}

const MAX_PREFERENCE_LENGTH = 64;

/** The web client owns the sleeve catalog, so a deck's sleeve is checked only for shape. */
function isSleeveId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= MAX_PREFERENCE_LENGTH;
}

/**
 * Accepts a partial set of known keys. The web client owns the valid locale, sleeve and
 * sort ids, and clamps the deck panel share to its own layout limits.
 */
const MAX_MATCH_PAGE = 1000;
/** Absent fields take their defaults; anything present must be exactly one well-formed value. */
function parseMatchHistoryQuery(
  query: Request["query"],
): ({ page: number; limit: number } & MatchHistoryFilter) | undefined {
  const page = positiveInteger(query.page, 1);
  const limit = positiveInteger(query.limit, MATCH_PAGE_SIZE);
  if (page === undefined || page > MAX_MATCH_PAGE || limit === undefined || limit > MAX_MATCH_PAGE_SIZE)
    return undefined;
  const { result, mode, opponent } = query;
  if (result !== undefined && !(MATCH_RESULTS as readonly unknown[]).includes(result)) return undefined;
  if (mode !== undefined && !(MATCH_MODES as readonly unknown[]).includes(mode)) return undefined;
  if (opponent !== undefined && typeof opponent !== "string") return undefined;
  const search = opponent?.trim();
  if (search && search.length > MATCH_OPPONENT_SEARCH_MAX) return undefined;
  return {
    page,
    limit,
    ...(result ? { result: result as MatchHistoryFilter["result"] } : {}),
    ...(mode ? { mode: mode as MatchHistoryFilter["mode"] } : {}),
    ...(search ? { opponent: search } : {}),
  };
}
function positiveInteger(value: unknown, fallback: number): number | undefined {
  if (value === undefined) return fallback;
  if (typeof value !== "string" || !/^[1-9]\d{0,5}$/.test(value)) return undefined;
  return Number(value);
}
function parsePreferences(value: unknown): AccountPreferences | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  const { autoHatch, darkMode, locale, sleeve, eggSleeve, deckShare, deckView, deckSort, ...unknownKeys } =
    value as Record<string, unknown>;
  if (Object.keys(unknownKeys).length > 0) return undefined;
  const isShortText = (text: unknown) => typeof text === "string" && text.length <= MAX_PREFERENCE_LENGTH;
  if (autoHatch !== undefined && typeof autoHatch !== "boolean") return undefined;
  if (darkMode !== undefined && typeof darkMode !== "boolean") return undefined;
  if (locale !== undefined && !isShortText(locale)) return undefined;
  if (sleeve !== undefined && !isShortText(sleeve)) return undefined;
  if (eggSleeve !== undefined && !isShortText(eggSleeve)) return undefined;
  if (deckShare !== undefined && !(typeof deckShare === "number" && deckShare > 0 && deckShare < 1)) return undefined;
  if (deckView !== undefined && deckView !== "grid" && deckView !== "list") return undefined;
  if (deckSort !== undefined && !isShortText(deckSort)) return undefined;
  return {
    ...(autoHatch !== undefined && { autoHatch }),
    ...(darkMode !== undefined && { darkMode }),
    ...(locale !== undefined && { locale: locale as string }),
    ...(sleeve !== undefined && { sleeve: sleeve as string }),
    ...(eggSleeve !== undefined && { eggSleeve: eggSleeve as string }),
    ...(deckShare !== undefined && { deckShare: deckShare as number }),
    ...(deckView !== undefined && { deckView: deckView as "grid" | "list" }),
    ...(deckSort !== undefined && { deckSort: deckSort as string }),
  };
}

/**
 * Drops `participantIds` on the way out.
 *
 * It is an INTERNAL identity: a bot's participant id is the only credential its seat has, and the
 * server-issued authorization keyed to it is the one thing that must never be derivable from a
 * request. Nothing a client renders needs it — participants reach the wire as `ParticipantView`,
 * and a confrontation's seats reach it as accounts — so the safe shape is the one that never sends
 * it rather than one that trusts every future response builder to remember.
 */
function withoutParticipantIds<T extends { participantIds?: unknown; series?: unknown }>(
  value: T,
): Omit<T, "participantIds"> {
  const { participantIds: _dropped, ...rest } = value;
  const nested = rest as { series?: { participantIds?: unknown } };
  if (nested.series && typeof nested.series === "object") {
    const { participantIds: _also, ...series } = nested.series;
    return { ...rest, series } as Omit<T, "participantIds">;
  }
  return rest as Omit<T, "participantIds">;
}

/**
 * How long the confrontation's shared clock runs, from the tournament's frozen ruleset and the
 * PHASE the match belongs to: a Swiss round runs the Swiss clock, a Top Cut match the cut clock,
 * and the deciding match the final's — which the official preset leaves `null`, meaning untimed.
 *
 * Read per match rather than per event, because one Swiss event holds both: its Swiss rounds and
 * its Top Cut are the same tournament under two different clocks.
 */
async function seriesDurationMs(store: AccountStore, tournament: Tournament, matchId: string): Promise<number | null> {
  const context = await matchClockContext(store.pool, matchId);
  return seriesDurationFor(
    tournament.rules,
    context ?? { phaseKind: null, isFinal: false, structure: tournament.structure },
  );
}

function sendSeriesFailure(res: Response, reason: SeriesFailure): void {
  const status = SERIES_NOT_FOUND_FAILURES.includes(reason) ? 404 : reason === "not_a_participant" ? 403 : 409;
  res.status(status).json({ error: reason });
}

function sendParticipantFailure(res: Response, reason: ParticipantFailure, violations?: unknown): void {
  res
    .status(NOT_FOUND_FAILURES.includes(reason) ? 404 : 409)
    .json(violations ? { error: reason, violations } : { error: reason });
}

// Express 5 types params as string | string[]; arrays only come from *wildcard segments, which these routes do not use.
type RouteRequest = Request<Record<string, string>>;
type AsyncHandler = (req: RouteRequest, res: Response) => unknown | Promise<unknown>;
function asyncRoute(handler: AsyncHandler) {
  return (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(handler(req as RouteRequest, res)).catch(next);
  };
}

async function requireSession(req: Request, res: Response, store: AccountStore): Promise<AuthSession | undefined> {
  const session = await store.session(cookie(req, SESSION_COOKIE));
  if (!session) res.sendStatus(401);
  return session;
}
function cookie(req: Request, key: string): string | undefined {
  return req.headers.cookie
    ?.split(";")
    .map((part) => part.trim().split("="))
    .find(([name]) => name === key)?.[1];
}
function setSession(res: Response, session: AuthSession): void {
  setCookie(res, SESSION_COOKIE, session.id, Math.max(1, Math.floor((session.expiresAt - Date.now()) / 1000)));
}
function setCookie(res: Response, key: string, value: string, maxAge: number): void {
  res.append(
    "Set-Cookie",
    `${key}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${process.env.NODE_ENV === "production" ? "; Secure" : ""}`,
  );
}
function expire(res: Response, key: string): void {
  setCookie(res, key, "", 0);
}
async function discordToken(code: string): Promise<string> {
  const body = new URLSearchParams({
    client_id: required("DISCORD_CLIENT_ID"),
    client_secret: required("DISCORD_CLIENT_SECRET"),
    grant_type: "authorization_code",
    code,
    redirect_uri: required("DISCORD_REDIRECT_URI"),
  });
  const response = await fetch("https://discord.com/api/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = (await response.json()) as { access_token?: string };
  if (!response.ok || !json.access_token) throw new Error("token exchange failed");
  return json.access_token;
}
async function discordUser(
  token: string,
): Promise<{ id: string; username: string; global_name?: string; avatar?: string }> {
  const response = await fetch("https://discord.com/api/users/@me", { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) throw new Error("user request failed");
  return response.json() as Promise<{ id: string; username: string; global_name?: string; avatar?: string }>;
}
function required(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`${key} is not configured`);
  return value;
}
