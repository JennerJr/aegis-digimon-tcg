import { FORUM_NAVIGATION_EVENT } from "@/bugs/forumNavigationEvent";
import { LocalScenarioHelp } from "./dev/LocalScenarioHelp";
import { spectatorCodeFromSearch } from "./roomInvite";
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { installAudioLifecycle } from "./design/sound";
import { Stage, TopNav, type PlayerIdentity, type Screen } from "./design/primitives";
import { AegisEmblem } from "./design/AegisLogo";
import { PixelBackdrop } from "./design/PixelBackdrop";
import { colorKey, type ColorName } from "./design/theme";
import {
  activeCollectionCards,
  copyDeckPreset,
  deckById,
  filterDeckToKnownCards,
  removeDeck,
  selectableDecks,
  upsertDeck,
  type DeckListing,
} from "./game/decks";
import type { AegisJoinOptions } from "./net/types";
import type { SeriesGameTicket } from "./net/useRoom";
import type { PrivateRoom, StartMode } from "./screens/Lobby";
import { loadMatchFormatPreference } from "./screens/matchFormatPreference";
import { Settings } from "./screens/Settings";
import { loadIdentity, saveIdentity, loadDecks, saveDecks, loadActiveDeckId, saveActiveDeckId } from "./identity";
import { accentForAvatar } from "./guest";
import { applyDarkMode, setDarkMode, useDarkMode } from "./design/darkMode";
import { setDeckEggSleeveId, setDeckSleeveId } from "./design/sleeve";
import { applyTextScale } from "./design/textScale";
import { InterfaceThemeDialog } from "./design/InterfaceThemePicker";
import { I18nProvider, useTranslation } from "./i18n";
import { accountApi, type RemoteAccount } from "./account/client";
import { communityApi } from "./community/client";
import { communityDeckListing } from "./community/communityDeckListing";
import { usePreferencesSync } from "./account/usePreferencesSync";
import { LeaveMatchDialog } from "./game/screen/layout/LeaveMatchDialog";
import { PlayerMenu } from "./account/PlayerMenu";
import { NotificationBell } from "./notifications/NotificationBell";
import { useNotificationInbox } from "./notifications/useNotificationInbox";
import { pathForRoute, routeFromPathname, type AppRoute } from "./routes";
import { roomCodeFromSearch } from "./roomInvite";
import { isUiPreviewPath } from "./prototype/routes";
import { SEQUENTIAL_PACING_ENABLED } from "./features";
import { clearReconnectSession, loadReconnectSession } from "./net/reconnectSession";
import { setRoomTicketAccount } from "./net/roomAccount";

const ProfileScreen = lazy(() => import("./account/ProfileScreen").then((m) => ({ default: m.ProfileScreen })));
const ReplaysScreen = lazy(() => import("./replays/ReplaysScreen").then((m) => ({ default: m.ReplaysScreen })));
const FeedbackScreen = lazy(() => import("./bugs/FeedbackScreen").then((m) => ({ default: m.FeedbackScreen })));
const ForumScreen = lazy(() => import("@/bugs/ForumScreen").then((m) => ({ default: m.ForumScreen })));
const PrivacyScreen = lazy(() => import("./legal/PrivacyScreen").then((m) => ({ default: m.PrivacyScreen })));
const Home = lazy(() => import("./screens/Home").then((m) => ({ default: m.Home })));
const ReleasesScreen = lazy(() => import("./releases/ReleasesScreen").then((m) => ({ default: m.ReleasesScreen })));
const Login = lazy(() => import("./screens/Login").then((m) => ({ default: m.Login })));
const Lobby = lazy(() => import("./screens/Lobby").then((m) => ({ default: m.Lobby })));
const Collection = lazy(() => import("./screens/Collection").then((m) => ({ default: m.Collection })));
const DeckBuilder = lazy(() => import("./screens/DeckBuilder").then((m) => ({ default: m.DeckBuilder })));
const CommunityScreen = lazy(() =>
  import("./screens/community/CommunityScreen").then((m) => ({ default: m.CommunityScreen })),
);
const GameScreen = lazy(() => import("./game/GameScreen").then((m) => ({ default: m.GameScreen })));
const CardEffectsDemo = lazy(() => import("./dev/CardEffectsDemo").then((m) => ({ default: m.CardEffectsDemo })));
const BoardShowcase = lazy(() => import("./dev/BoardShowcase").then((m) => ({ default: m.BoardShowcase })));
const EffectPromptGallery = lazy(() =>
  import("./dev/EffectPromptGallery").then((m) => ({ default: m.EffectPromptGallery })),
);
const MotionReference = lazy(() => import("./dev/MotionReference").then((m) => ({ default: m.MotionReference })));
const ArenaDemo = lazy(() => import("./dev/ArenaDemo").then((m) => ({ default: m.ArenaDemo })));
const BadgeLayoutLab = lazy(() => import("./dev/BadgeLayoutLab").then((m) => ({ default: m.BadgeLayoutLab })));
const UiPreview = lazy(() => import("./prototype/UiPreview").then((m) => ({ default: m.UiPreview })));
const MobileComponentsLab = lazy(() =>
  import("./dev/MobileComponentsLab").then((m) => ({ default: m.MobileComponentsLab })),
);

export function isBoardShowcasePath(pathname: string): boolean {
  return /^\/dev\/board\/?$/i.test(pathname);
}

export function isEffectsLabPath(pathname: string): boolean {
  return /^\/dev\/effects-lab\/?$/i.test(pathname);
}

export function isMobileComponentsLabPath(pathname: string): boolean {
  return /^\/dev\/mobile\/?$/i.test(pathname);
}

export function cardEffectsLabCardId(pathname: string): string | undefined {
  const match = /^\/dev\/card-effects\/([^/]+)\/?$/i.exec(pathname);
  if (!match?.[1]) return undefined;
  try {
    return decodeURIComponent(match[1]).toUpperCase();
  } catch {
    return match[1].toUpperCase();
  }
}

function ScreenFallback() {
  const { t } = useTranslation();
  return (
    <div className="aegis-screen-fallback" role="status" aria-live="polite">
      <span className="aegis-screen-fallback__mark" aria-hidden="true">
        <span className="aegis-loading-mark" />
        <AegisEmblem size={36} />
      </span>
      {t("common.loading")}
    </div>
  );
}

const NAV_SCREENS: Screen[] = [
  "home",
  "lobby",
  "deck",
  "community",
  "collection",
  "settings",
  "releases",
  "replays",
  "feedback",
  "myFeedback",
  "privacy",
];

export function withAccountAvatar(player: PlayerIdentity, account: RemoteAccount | null): PlayerIdentity {
  return {
    ...player,
    avatarId: account?.avatarId ?? null,
    avatarUrl: account?.avatarUrl ?? null,
  };
}

export function initialAppRoute({
  pathname,
  invitedRoomCode,
  hasReconnectSession,
  spectatorCode,
}: {
  pathname: string;
  invitedRoomCode: string | undefined;
  hasReconnectSession: boolean;
  spectatorCode?: string;
}): AppRoute {
  if (invitedRoomCode || spectatorCode) return { screen: "lobby" };
  const directRoute = routeFromPathname(pathname);
  if (directRoute?.screen === "game" && !hasReconnectSession) return { screen: "lobby" };
  return directRoute ?? { screen: "home" };
}

export function App() {
  useEffect(installAudioLifecycle, []);
  const pathname = window.location.pathname;
  const labCardId = cardEffectsLabCardId(pathname);
  return (
    <I18nProvider>
      <Suspense fallback={<ScreenFallback />}>
        {import.meta.env.DEV && /^\/dev\/effect-prompts\/?$/i.test(pathname) ? (
          <Stage>
            <EffectPromptGallery />
          </Stage>
        ) : import.meta.env.DEV && /^\/dev\/motion-reference\/?$/i.test(pathname) ? (
          <MotionReference />
        ) : /^\/dev\/badges\/?$/i.test(pathname) ? (
          <BadgeLayoutLab />
        ) : labCardId ? (
          <CardEffectsDemo cardId={labCardId} />
        ) : /^\/dev\/arena\/?$/i.test(pathname) ? (
          <Stage>
            <ArenaDemo />
          </Stage>
        ) : isEffectsLabPath(pathname) ? (
          <Stage>
            <LocalScenarioHelp />
          </Stage>
        ) : isBoardShowcasePath(pathname) ? (
          <BoardShowcase />
        ) : /^\/dev\/battle\/?$/i.test(pathname) ? (
          <LocalScenarioHelp />
        ) : isMobileComponentsLabPath(pathname) ? (
          <MobileComponentsLab />
        ) : isUiPreviewPath(pathname) ? (
          <UiPreview />
        ) : (
          <AppShell />
        )}
      </Suspense>
    </I18nProvider>
  );
}

function AppShell() {
  const [player, setPlayer] = useState<PlayerIdentity>(loadIdentity);
  const [decks, setDecks] = useState<DeckListing[]>(loadDecks);
  const [activeDeckId, setActiveDeckId] = useState<string>(() => loadActiveDeckId(selectableDecks(loadDecks())));
  const dark = useDarkMode();
  const setDark = setDarkMode;
  const [account, setAccount] = useState<RemoteAccount | null>();

  useEffect(() => {
    saveIdentity(player);
  }, [player]);

  useEffect(() => {
    saveDecks(decks);
  }, [decks]);

  useEffect(() => setRoomTicketAccount(!!account), [account]);

  useEffect(() => {
    void (async () => {
      const remoteAccount = await accountApi.me();
      setAccount(remoteAccount);
      setPlayer((current) => withAccountAvatar(current, remoteAccount));
      if (!remoteAccount) return;
      const remote = await accountApi.decks();
      const remoteIds = new Set(remote.map((deck) => deck.id));
      const localDecks = loadDecks();
      const localOnly = localDecks.filter((deck) => !remoteIds.has(deck.id)).slice(0, Math.max(0, 100 - remote.length));
      for (const deck of localOnly) await accountApi.saveDeck(deck);
      // Decks saved before the api stored covers come back without one; keep the local choice and backfill it.
      const localCovers = new Map(localDecks.map((deck) => [deck.id, deck.coverCardId]));
      const backfilled = remote
        .filter((deck) => !deck.coverCardId && localCovers.get(deck.id))
        .map((deck) => ({ ...deck, coverCardId: localCovers.get(deck.id) }));
      for (const deck of backfilled) await accountApi.saveDeck(deck);
      setDecks((local) => [...remote, ...backfilled].reduce((all, deck) => upsertDeck(all, deck), local));
    })().catch(() => setAccount(null));
  }, []);

  useEffect(() => {
    saveActiveDeckId(activeDeckId);
  }, [activeDeckId]);

  useEffect(applyDarkMode, []);
  useEffect(applyTextScale, []);

  const preferencesReady = usePreferencesSync({ accountId: account?.id, dark, setDark });

  const saveDeck = (deck: DeckListing, setActive: boolean) => {
    const filtered = { ...filterDeckToKnownCards(deck), updatedAt: Date.now() };
    setDecks((ds) => upsertDeck(ds, filtered));
    void accountApi
      .me()
      .then((remoteAccount) => (remoteAccount ? accountApi.saveDeck(filtered) : undefined))
      .catch(() => undefined);
    if (setActive) setActiveDeckId(deck.id);
  };

  const deleteDeck = (id: string) => {
    const remaining = removeDeck(decks, id);
    setDecks(remaining);
    if (activeDeckId === id) setActiveDeckId(selectableDecks(remaining)[0]?.id ?? "");
    void accountApi
      .me()
      .then((remoteAccount) => (remoteAccount ? accountApi.deleteDeck(id) : undefined))
      .catch(() => undefined);
  };

  const shared = {
    preferencesReady: account !== undefined && preferencesReady,
    player,
    setPlayer,
    account,
    setAccount,
    decks,
    activeDeckId,
    setActiveDeckId,
    saveDeck,
    deleteDeck,
    dark,
    setDark,
  };

  return <AegisClient {...shared} />;
}

interface ClientProps {
  preferencesReady?: boolean;
  player: PlayerIdentity;
  setPlayer: (update: (p: PlayerIdentity) => PlayerIdentity) => void;
  account?: RemoteAccount | null;
  setAccount?: (account: RemoteAccount | null) => void;
  decks: DeckListing[];
  activeDeckId: string;
  setActiveDeckId: (id: string) => void;
  saveDeck: (deck: DeckListing, setActive: boolean) => void;
  deleteDeck: (id: string) => void;
  dark: boolean;
  setDark: (v: boolean) => void;
  initialScreen?: Screen;
}

export function AegisClient({
  preferencesReady = true,
  player,
  setPlayer,
  account = null,
  setAccount,
  decks,
  activeDeckId,
  setActiveDeckId,
  saveDeck,
  deleteDeck,
  dark,
  setDark,
  initialScreen,
}: ClientProps) {
  const { t } = useTranslation();
  const effectivePlayer = useMemo<PlayerIdentity>(
    () =>
      account
        ? {
            ...player,
            name: account.displayName,
            avatarId: account.avatarId,
            avatarUrl: account.avatarUrl,
          }
        : {
            ...player,
            avatarId: player.guestAvatarId ?? null,
            avatarUrl: null,
          },
    [account, player],
  );
  const [invitedRoomCode] = useState(() => (initialScreen ? undefined : roomCodeFromSearch(window.location.search)));
  const [route, setRoute] = useState<AppRoute>(() => {
    if (initialScreen) return { screen: initialScreen };
    return initialAppRoute({
      pathname: window.location.pathname,
      invitedRoomCode,
      spectatorCode: spectatorCodeFromSearch(window.location.search),
      hasReconnectSession: loadReconnectSession() !== undefined,
    });
  });
  const [timerOptions, setTimerOptions] = useState(() => ({
    matchTimer: true,
    timerStartSeconds: 300,
    timerRefillSeconds: 60,
  }));
  const [allowRollback, setAllowRollback] = useState(false);
  const [bestOf, setBestOf] = useState(loadMatchFormatPreference);
  /** Set between the games of a best-of-three: the next GameScreen takes this seat. */
  const [seriesGame, setSeriesGame] = useState<SeriesGameTicket>();
  const [startMode, setStartMode] = useState<StartMode>("casual");
  const [editingDeck, setEditingDeck] = useState<DeckListing | null>(null);
  // A community deck picked to play with. It lives for this session only and is never saved.
  const [borrowedDeck, setBorrowedDeck] = useState<DeckListing>();
  const [roomCode, setRoomCode] = useState<string>();
  const [privateRoom, setPrivateRoom] = useState<PrivateRoom>();
  const [botDeckId, setBotDeckId] = useState<string>();
  const [unlimited, setUnlimited] = useState(false);
  const [deckFormat, setDeckFormat] = useState<import("@aegis/shared").DeckFormat>("standard");
  const [betaBattleMode, setBetaBattleMode] = useState(false);
  const [matchDeckId, setMatchDeckId] = useState<string>();
  const [matchNumber, setMatchNumber] = useState(0);
  const [playerMenuAnchor, setPlayerMenuAnchor] = useState<HTMLElement | null>(null);
  const playerMenuOpen = playerMenuAnchor !== null;
  const [replayViewing, setReplayViewing] = useState(false);
  const [themeOpen, setThemeOpen] = useState(false);
  const [leaveMatchPromptOpen, setLeaveMatchPromptOpen] = useState(false);
  const concedeMatchRef = useRef<(() => void) | undefined>(undefined);
  const setLeaveForfeitsMatch = useCallback((concede: (() => void) | undefined) => {
    concedeMatchRef.current = concede;
    if (!concede) setLeaveMatchPromptOpen(false);
  }, []);
  const screen = route.screen;
  useEffect(() => {
    if (screen !== "deck") setEditingDeck(null);
  }, [screen]);

  useEffect(() => {
    if (initialScreen) return;
    const expectedPath = pathForRoute(route);
    if (window.location.pathname !== expectedPath) window.history.replaceState(null, "", expectedPath);
  }, []);

  /* Coming back from the Discord round trip lands on /login with a session; there
     is nothing left to sign in to, so the screen hands over to home. */
  useEffect(() => {
    if (initialScreen || !account || screen !== "login") return;
    if (window.location.pathname !== pathForRoute({ screen: "home" })) {
      window.history.replaceState(null, "", pathForRoute({ screen: "home" }));
    }
    setRoute({ screen: "home" });
  }, [account, screen, initialScreen]);

  useEffect(() => {
    if (initialScreen) return;
    const onPopState = () => {
      if (!window.dispatchEvent(new Event(FORUM_NAVIGATION_EVENT, { cancelable: true }))) return;
      const nextRoute = routeFromPathname(window.location.pathname);
      const resolvedRoute: AppRoute =
        nextRoute?.screen === "game" && !loadReconnectSession()
          ? { screen: "lobby" }
          : (nextRoute ?? { screen: "home" });
      /* The browser has already moved off the match URL, so the guard restores it and asks.
         Confirming concedes in place: the result screen then offers to keep the replay. */
      if (concedeMatchRef.current && resolvedRoute.screen !== "game") {
        window.history.pushState(null, "", pathForRoute({ screen: "game" }));
        setLeaveMatchPromptOpen(true);
        return;
      }
      const resolvedPath = pathForRoute(resolvedRoute);
      if (window.location.pathname !== resolvedPath) window.history.replaceState(null, "", resolvedPath);
      setRoute(resolvedRoute);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [initialScreen]);

  const confirmLeaveMatch = () => {
    setLeaveMatchPromptOpen(false);
    concedeMatchRef.current?.();
  };

  const navigate = (nextRoute: AppRoute) => {
    if (!window.dispatchEvent(new Event(FORUM_NAVIGATION_EVENT, { cancelable: true }))) return;
    setPlayerMenuAnchor(null);
    if (!initialScreen) {
      const path = pathForRoute(nextRoute);
      if (window.location.pathname !== path) window.history.pushState(null, "", path);
    }
    setRoute(nextRoute);
  };
  const navigateScreen = (nextScreen: Screen) => navigate({ screen: nextScreen });

  const availableDecks = useMemo(
    () => (borrowedDeck ? [borrowedDeck, ...selectableDecks(decks)] : selectableDecks(decks)),
    [borrowedDeck, decks],
  );
  const matchDeck = deckById(availableDecks, matchDeckId ?? activeDeckId);
  const matchSleeveId = screen === "game" ? matchDeck?.sleeveId : undefined;
  useEffect(() => setDeckSleeveId(matchSleeveId), [matchSleeveId]);
  const matchEggSleeveId = screen === "game" ? matchDeck?.eggSleeveId : undefined;
  useEffect(() => setDeckEggSleeveId(matchEggSleeveId), [matchEggSleeveId]);
  const collectionSize = useMemo(() => activeCollectionCards().length, []);
  const identityColor: ColorName = colorKey(player.color);

  const customBotDeck =
    startMode === "bot" && botDeckId?.startsWith("mine:")
      ? decks.find((deck) => deck.id === botDeckId.slice(5))
      : undefined;
  const joinOptions = useMemo<AegisJoinOptions>(
    () => ({
      ...timerOptions,
      allowRollback,
      bestOf,
      format: deckFormat,
      displayName: effectivePlayer.name,
      avatarId: effectivePlayer.avatarId ?? undefined,
      deckId: matchDeck?.id,
      deckName: matchDeck?.name,
      community: matchDeck?.community,
      botDeck: customBotDeck
        ? {
            mainDeck: customBotDeck.mainDeck,
            eggDeck: customBotDeck.eggDeck,
            mainDeckArts: customBotDeck.mainDeckArts,
            eggDeckArts: customBotDeck.eggDeckArts,
          }
        : undefined,
      deck: {
        mainDeck: matchDeck?.mainDeck ?? [],
        eggDeck: matchDeck?.eggDeck ?? [],
        mainDeckArts: matchDeck?.mainDeckArts,
        eggDeckArts: matchDeck?.eggDeckArts,
      },
    }),
    [
      effectivePlayer.name,
      effectivePlayer.avatarId,
      matchDeck,
      timerOptions,
      bestOf,
      customBotDeck,
      deckFormat,
      allowRollback,
    ],
  );

  const showNav = NAV_SCREENS.includes(screen) && !replayViewing;
  // Kept outside the nav so the count survives a match, where the nav is hidden.
  const inbox = useNotificationInbox(account?.id);
  const openOwnFeedback = (feedbackId?: number) => navigate({ screen: "myFeedback", feedbackId });

  const refreshDiscordAvatar = async () => {
    const updated = await accountApi.refreshDiscordAvatar();
    if (account) setAccount?.({ ...account, ...updated });
  };

  return (
    <Stage>
      {screen === "game" ? null : <PixelBackdrop />}
      {showNav ? (
        <TopNav
          screen={screen}
          onNav={navigateScreen}
          player={effectivePlayer}
          signedIn={!!account}
          onOpenPlayerMenu={(anchor) => setPlayerMenuAnchor(playerMenuOpen ? null : anchor)}
          playerMenuOpen={playerMenuOpen}
          dark={dark}
          onToggleDark={setDark}
          onOpenTheme={() => setThemeOpen(true)}
          onSendFeedback={() => navigate({ screen: "myFeedback" })}
          notifications={account ? <NotificationBell inbox={inbox} onOpenFeedback={openOwnFeedback} /> : undefined}
        />
      ) : null}

      <div
        id="aegis-main"
        className={`aegis-screen-region${showNav ? " aegis-screen-region--nav" : ""}${screen === "replays" ? " aegis-screen-region--replays" : ""}${screen === "settings" && route.profile ? " aegis-screen-region--profile" : ""}`}
        tabIndex={-1}
      >
        <Suspense fallback={<ScreenFallback />}>
          {screen === "home" && (
            <Home
              collectionSize={collectionSize}
              signedIn={!!account}
              onPlay={() => navigateScreen("lobby")}
              onBuildDeck={() => navigateScreen("deck")}
              onOpenCollection={() => navigateScreen("collection")}
              onSignIn={() => navigateScreen("login")}
              onReportBug={() => navigate({ screen: "myFeedback", feedbackView: "new" })}
              onOpenReleases={() => navigateScreen("releases")}
            />
          )}

          {screen === "feedback" && (
            <FeedbackScreen
              key={account?.id ?? "guest"}
              isAdmin={account?.isAdmin === true}
              selectedId={route.feedbackId}
              onSelect={(feedbackId) => navigate({ screen: "feedback", feedbackId })}
              onOpenDeck={(communityDeckId) => navigate({ screen: "community", communityDeckId })}
            />
          )}
          {screen === "myFeedback" && (
            <ForumScreen
              key={account?.id ?? "guest"}
              signedIn={!!account}
              selectedId={route.feedbackId}
              view={route.feedbackView}
              onDecks={() => navigate({ screen: "community" })}
              onRoadmap={() => navigate({ screen: "myFeedback", feedbackView: "roadmap" })}
              accountId={account?.id}
              isAdmin={account?.isAdmin === true}
              onSelect={openOwnFeedback}
              onNew={() => navigate({ screen: "myFeedback", feedbackView: "new" })}
              onSignIn={() => navigateScreen("login")}
            />
          )}
          {screen === "login" && <Login onBack={() => navigateScreen("home")} />}

          {screen === "lobby" && (
            <Lobby
              player={effectivePlayer}
              decks={decks}
              borrowedDeck={borrowedDeck}
              onBorrowCommunityDeck={(id) => {
                void communityApi
                  .deck(id)
                  .then((deck) => {
                    const listing = communityDeckListing(deck);
                    setBorrowedDeck(listing);
                    setActiveDeckId(listing.id);
                  })
                  .catch(() => undefined);
              }}
              onOpenCommunityDeck={(id) => navigate({ screen: "community", communityDeckId: id })}
              accountId={account?.id}
              activeDeckId={activeDeckId}
              onSelectDeck={setActiveDeckId}
              onCopyDeck={(preset) => {
                const copy = copyDeckPreset(preset, decks);
                saveDeck(copy, true);
                navigateScreen("deck");
              }}
              onEditDeck={(deck) => {
                setEditingDeck(deck);
                navigateScreen("deck");
              }}
              onNav={navigateScreen}
              timerOptions={timerOptions}
              onTimerOptionsChange={setTimerOptions}
              allowRollback={allowRollback}
              onAllowRollbackChange={setAllowRollback}
              bestOf={bestOf}
              onBestOfChange={setBestOf}
              invitedRoomCode={invitedRoomCode}
              privateRoom={privateRoom}
              onLeavePrivateRoom={() => setPrivateRoom(undefined)}
              onStart={(
                mode,
                code,
                requestedBotDeckId,
                requestedBetaBattleMode,
                requestedDeckId,
                requestedUnlimited,
                requestedFormat,
              ) => {
                // A lobby start explicitly requests a new match, even if a page
                // reload left a resumable seat from the previous match in storage.
                clearReconnectSession();
                setSeriesGame(undefined);
                if (mode !== "private_host" && mode !== "private_guest") setPrivateRoom(undefined);
                setStartMode(mode);
                setRoomCode(code);
                setBotDeckId(requestedBotDeckId);
                setBetaBattleMode(requestedBetaBattleMode === true);
                setUnlimited(requestedUnlimited === true);
                setDeckFormat(
                  requestedFormat ?? (mode === "unlimited" || requestedUnlimited ? "unlimited" : "standard"),
                );
                if (typeof requestedDeckId === "object") {
                  setBorrowedDeck(structuredClone(requestedDeckId));
                  setMatchDeckId(requestedDeckId.id);
                } else setMatchDeckId(requestedDeckId);
                navigateScreen("game");
              }}
            />
          )}

          {screen === "deck" && (
            <DeckBuilder
              initialEditingDeck={editingDeck}
              decks={decks}
              activeDeckId={activeDeckId}
              onSelectDeck={setActiveDeckId}
              onSaveDeck={saveDeck}
              onDeleteDeck={deleteDeck}
              signedIn={!!account}
              onNav={(next) => {
                setEditingDeck(null);
                navigateScreen(next);
              }}
            />
          )}

          {screen === "community" && (
            <CommunityScreen
              onDiscussions={() => navigate({ screen: "myFeedback" })}
              onRoadmap={() => navigate({ screen: "myFeedback", feedbackView: "roadmap" })}
              deckId={route.communityDeckId}
              signedIn={!!account}
              accountId={account?.id}
              isAdmin={account?.isAdmin === true}
              onOpenDeck={(id) => navigate({ screen: "community", communityDeckId: id })}
              onBack={() => navigate({ screen: "community" })}
              onPlay={(deck) => {
                const listing = communityDeckListing(deck);
                setBorrowedDeck(listing);
                setActiveDeckId(listing.id);
                navigateScreen("lobby");
              }}
              onCopy={(deck) => {
                saveDeck(
                  {
                    ...copyDeckPreset(communityDeckListing(deck), decks),
                    blurb: t("community.byAuthor", { name: deck.author.displayName }),
                  },
                  false,
                );
                if (account) void communityApi.recordCopy(deck.id).catch(() => undefined);
              }}
            />
          )}

          {screen === "collection" && <Collection />}

          {screen === "replays" && route.replayId && (
            <ReplaysScreen
              key={route.replayId}
              replayId={route.replayId}
              onCloseLink={() => navigate({ screen: "settings", profile: true })}
              onViewingChange={setReplayViewing}
            />
          )}

          {screen === "releases" && <ReleasesScreen />}
          {screen === "privacy" && <PrivacyScreen />}

          {screen === "settings" && route.profile && (
            <ProfileScreen
              account={account}
              player={effectivePlayer}
              onViewingChange={setReplayViewing}
              onAccountChange={(updated) => setAccount?.({ ...account, ...updated })}
              onGuestChange={(name, avatarId) =>
                setPlayer((current) => ({
                  ...current,
                  name,
                  guestAvatarId: avatarId,
                  color: accentForAvatar(avatarId, colorKey(current.color)),
                }))
              }
              onRefreshDiscordAvatar={account?.discordLinked ? refreshDiscordAvatar : undefined}
            />
          )}
          {screen === "settings" && !route.profile && (
            <Settings player={effectivePlayer} account={account} dark={dark} onToggleDark={setDark} />
          )}

          {screen === "game" && (
            <GameScreen
              accountId={account?.id}
              onCopyUsedDeck={(deck) => saveDeck(copyDeckPreset(deck, decks), false)}
              autoHatchReady={preferencesReady}
              key={matchNumber}
              joinOptions={joinOptions}
              identityColor={identityColor}
              identityAvatarId={effectivePlayer.avatarId}
              identityAvatarUrl={effectivePlayer.avatarUrl}
              startMode={startMode}
              roomCode={roomCode}
              waitForHost={startMode === "private_guest" && privateRoom?.code === roomCode}
              botDeckId={botDeckId}
              betaBattleMode={betaBattleMode}
              unlimited={unlimited}
              seriesGame={seriesGame}
              onSeriesNext={(ticket) => {
                clearReconnectSession();
                setSeriesGame(ticket);
                setMatchNumber((current) => current + 1);
              }}
              presentationPacing={SEQUENTIAL_PACING_ENABLED ? "sequential" : "current"}
              signedIn={!!account}
              onLeaveForfeitsChange={setLeaveForfeitsMatch}
              onExit={(next) => {
                setSeriesGame(undefined);
                navigateScreen(next);
              }}
              onRematch={(privateRoomCode, roomUnlimited, roomHost, roomFormat) => {
                clearReconnectSession();
                setSeriesGame(undefined);
                if (privateRoomCode) {
                  setPrivateRoom({
                    code: privateRoomCode,
                    host: roomHost ?? startMode === "private_host",
                    unlimited: roomUnlimited,
                    format: roomFormat,
                  });
                  navigateScreen("lobby");
                  return;
                }
                setMatchNumber((current) => current + 1);
              }}
            />
          )}
        </Suspense>
      </div>

      {playerMenuOpen ? (
        <PlayerMenu
          player={effectivePlayer}
          signedIn={!!account}
          anchor={playerMenuAnchor}
          onNav={navigateScreen}
          onProfile={() => navigate({ screen: "settings", profile: true })}
          onSignOut={
            account
              ? () => {
                  void accountApi.logout().then(() => location.reload());
                }
              : undefined
          }
          onReportBug={() => navigate({ screen: "myFeedback", feedbackView: "new" })}
          onClose={() => setPlayerMenuAnchor(null)}
        />
      ) : null}

      {themeOpen ? (
        <InterfaceThemeDialog dark={dark} onToggleDark={setDark} onClose={() => setThemeOpen(false)} />
      ) : null}
      {leaveMatchPromptOpen ? (
        <LeaveMatchDialog onConfirm={confirmLeaveMatch} onClose={() => setLeaveMatchPromptOpen(false)} />
      ) : null}
    </Stage>
  );
}
