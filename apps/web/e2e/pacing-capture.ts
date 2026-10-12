import type { Page } from "@playwright/test";
import type { LiveMotionProbe } from "../src/dev/liveMotionProbe";

interface CardPose {
  at: number;
  fieldKey: string | undefined;
  permanentId: string | undefined;
  returning: boolean;
  cardName?: string;
  memberIds: string[];
  /** The number printed by TokenInfo's DP chip in this sampled DOM pose. */
  currentDP?: number;
  painted: boolean;
  artLoaded: boolean;
  returnId?: number;
  x: number;
  y: number;
  angle: number;
}
interface AnimationTiming {
  at: number;
  lastAt: number;
  nativeMs?: number;
  endMs?: number;
  playbackRate: number;
  fieldKey: string | undefined;
  permanentId: string | undefined;
  returning: boolean;
  returnId?: number;
  properties: string[];
  duration: number | string;
  delayMs: number;
  easing: string;
}
interface Capture {
  startedAt: number;
  frame: number;
  frames: { at: number; sampledAt: number }[];
  truncated: boolean;
  poses: CardPose[];
  timings: AnimationTiming[];
  decisions: { label: string | null; openedAt: number; closedAt?: number }[];
  boards: {
    at: number;
    turnSeat: number;
    suspendedIds: string[];
    securityCounts: number[];
    handCounts: number[];
    deckCounts: number[];
    permanentIds: string[];
    permanents: { permanentId: string; cardId: string; stackCount: number; currentDP: number }[];
  }[];
  peels: { key: string; permanentId?: string; cardId?: string; firstAt: number; lastAt: number; frames: number }[];
  dpPulses: {
    permanentId?: string;
    from: number;
    to: number;
    deltaText: string;
    firstAt: number;
    lastAt: number;
    frames: number;
  }[];
  draws: {
    key: string;
    side?: string;
    instanceId?: string;
    firstAt: number;
    lastAt: number;
    cardName?: string;
    poses: { at: number; x: number; y: number; width: number; height: number; opacity: number; ageMs?: number }[];
  }[];
  handArrivals: { instanceId: string; cardId: string; firstAt: number }[];
  securityPaints: { at: number; counts: number[]; landing: boolean[]; faceUpCards: number[] }[];
  securityLandings: { side: string; key: string; firstAt: number; lastAt: number; frames: number }[];
  securityChecks: {
    key: string;
    cardName: string;
    attackerName: string;
    firstAt: number;
    lastAt: number;
    removedAt?: number;
    readyAt?: number;
    outcomeAt?: number;
    exitAt?: number;
    poses: {
      at: number;
      x: number;
      y: number;
      width: number;
      height: number;
      opacity: number;
      painted: boolean;
      artLoaded: boolean;
      attackerArtLoaded: boolean;
      revealMs?: number;
      revealEndMs?: number;
      disposalMs?: number;
      disposalEndMs?: number;
      securityCount: number;
    }[];
  }[];
  sourceFocuses: { cardId: string; permanentId?: string; firstAt: number; lastAt: number; removedAt?: number }[];
  arrivals: {
    cardId: string;
    firstAt: number;
    lastAt: number;
    removedAt?: number;
    poses: {
      at: number;
      painted: boolean;
      artLoaded: boolean;
      exitMs?: number;
      exitEndMs?: number;
      exitRate?: number;
    }[];
  }[];
  notices: { id: string; firstAt: number }[];
  phaseRibbons: { at: number; label: string; side: string | undefined }[];
  hatches: { at: number; cardId: string; permanentId: string }[];
  raising: {
    permanentId: string;
    cardId: string;
    firstAt: number;
    lastAt: number;
    removedAt?: number;
    poses: {
      at: number;
      painted: boolean;
      artLoaded: boolean;
      nativeMs?: number;
      endMs?: number;
      playbackRate?: number;
    }[];
  }[];
  breedingTransfers: {
    permanentId: string;
    cardName: string;
    firstAt: number;
    lastAt: number;
    removedAt?: number;
    poses: {
      at: number;
      x: number;
      y: number;
      painted: boolean;
      artLoaded: boolean;
      targetX?: number;
      targetY?: number;
      nativeMs?: number;
      endMs?: number;
      playbackRate?: number;
    }[];
  }[];
  phasePanels: {
    kind: "phase" | "turn";
    label: string;
    side: string;
    firstAt: number;
    lastAt: number;
    removedAt?: number;
    poses: { at: number; painted: boolean; nativeMs?: number; endMs?: number; playbackRate?: number }[];
  }[];
  arrows: {
    at: number;
    key: string;
    sweepMs?: number;
    source: string | undefined;
    target: string | undefined;
    gapPx: number;
    x: number;
    y: number;
  }[];
  returnLifecycle: {
    at: number;
    kind: "inserted" | "removed";
    returnId?: number;
    target?: string;
    connected: boolean;
    parent?: string;
  }[];
}
interface PacingWindow extends Window {
  __aegisLiveMotion: LiveMotionProbe;
  __keywordPacingCapture: Capture;
  __keywordPacingObserver?: MutationObserver;
}

/** The gesture boundary, DOM poses and native animation clocks share performance.now().
 * This is browser observation, not a server execution or network receipt timestamp. */
export async function startPacingCapture(page: Page) {
  await page.evaluate(() => {
    const globals = window as unknown as PacingWindow;
    globals["__aegisLiveMotion"].reset();
    globals["__aegisLiveMotion"].start();
    const capture: Capture = {
      startedAt: performance.now(),
      frame: 0,
      frames: [],
      truncated: false,
      poses: [],
      timings: [],
      decisions: [],
      boards: [],
      peels: [],
      dpPulses: [],
      draws: [],
      handArrivals: [],
      securityPaints: [],
      securityLandings: [],
      securityChecks: [],
      sourceFocuses: [],
      arrivals: [],
      notices: [],
      phaseRibbons: [],
      hatches: [],
      raising: [],
      breedingTransfers: [],
      phasePanels: [],
      arrows: [],
      returnLifecycle: [],
    };
    globals["__keywordPacingCapture"] = capture;
    const seen = new WeakSet<Animation>();
    const timingObservations = new WeakMap<Animation, AnimationTiming>();
    const returnIds = new WeakMap<Element, number>();
    let returnSequence = 0;
    let decision: { element: Element; observation: Capture["decisions"][number] } | undefined;
    let boardKey = "";
    const peelObservations = new WeakMap<Element, Capture["peels"][number]>();
    const dpObservations = new WeakMap<Element, Capture["dpPulses"][number]>();
    const drawObservations = new WeakMap<Element, Capture["draws"][number]>();
    const arrived = new Set<string>();
    const landingObservations = new Map<string, Capture["securityLandings"][number]>();
    let securityKey = "";
    const checkObservations = new Map<string, Capture["securityChecks"][number]>();
    const focusObservations = new Map<Element, Capture["sourceFocuses"][number]>();
    const arrivalObservations = new Map<Element, Capture["arrivals"][number]>();
    const phaseObservations = new Map<Element, Capture["phasePanels"][number]>();
    const hatched = new Set<string>();
    const raisingObservations = new Map<string, Capture["raising"][number]>();
    const transferObservations = new Map<Element, Capture["breedingTransfers"][number]>();
    const noticeIds = new Set<string>();
    let ribbonElement: Element | null = null;
    let arrowSignature = "";
    const returnId = (element: Element) => {
      if (element.getAttribute("data-testid") !== "field-group-return") return undefined;
      let id = returnIds.get(element);
      if (id === undefined) {
        id = ++returnSequence;
        returnIds.set(element, id);
      }
      return id;
    };
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        for (const [kind, nodes] of [
          ["inserted", record.addedNodes],
          ["removed", record.removedNodes],
        ] as const) {
          for (const node of nodes) {
            if (!(node instanceof HTMLElement)) continue;
            const copies = [node, ...node.querySelectorAll<HTMLElement>('[data-testid="field-group-return"]')].filter(
              (element) => element.dataset.testid === "field-group-return",
            );
            for (const copy of copies)
              capture.returnLifecycle.push({
                at: performance.now(),
                kind,
                returnId: returnId(copy),
                target: copy.dataset.returnTargetFieldKey,
                connected: copy.isConnected,
                parent: (record.target as HTMLElement).className,
              });
          }
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    globals["__keywordPacingObserver"] = observer;
    const tick = (at: number) => {
      // Native animation observations use this same rAF timestamp. DOM reads can take
      // several milliseconds; performance.now() here would misorder events in one frame.
      capture.frames.push({ at, sampledAt: performance.now() });
      const lab = (
        window as unknown as {
          __aegisEffectsLab?: () => {
            board?: {
              visible?: {
                turn: { seat: number };
                players: {
                  securityCount: number;
                  handCount: number;
                  deckCount: number;
                  battleArea: {
                    permanentId: string;
                    isSuspended: boolean;
                    currentDP: number;
                    topCard: { cardId: string };
                    stack?: unknown[];
                  }[];
                }[];
              };
            };
          };
        }
      ).__aegisEffectsLab?.();
      const visible = lab?.board?.visible;
      if (visible) {
        const sample = {
          turnSeat: visible.turn.seat,
          suspendedIds: visible.players.flatMap((player) =>
            player.battleArea.filter((card) => card.isSuspended).map((card) => card.permanentId),
          ),
          securityCounts: visible.players.map((player) => player.securityCount),
          handCounts: visible.players.map((player) => player.handCount),
          deckCounts: visible.players.map((player) => player.deckCount),
          permanentIds: visible.players.flatMap((player) => player.battleArea.map((card) => card.permanentId)),
          permanents: visible.players.flatMap((player) =>
            player.battleArea.map((card) => ({
              permanentId: card.permanentId,
              cardId: card.topCard.cardId,
              stackCount: card.stack?.length ?? 0,
              currentDP: card.currentDP,
            })),
          ),
        };
        const key = JSON.stringify(sample);
        if (key !== boardKey) {
          capture.boards.push({ at, ...sample });
          boardKey = key;
        }
      }
      const paintCache = new Map<Element, boolean>();
      const visibleStyle = (element: Element): boolean => {
        const cached = paintCache.get(element);
        if (cached !== undefined) return cached;
        const style = getComputedStyle(element);
        const result =
          style.visibility !== "hidden" &&
          style.display !== "none" &&
          Number(style.opacity) > 0.01 &&
          (!element.parentElement || visibleStyle(element.parentElement));
        paintCache.set(element, result);
        return result;
      };
      const isPainted = (element: Element): boolean => {
        const bounds = element.getBoundingClientRect();
        return (
          bounds.width > 0 &&
          bounds.height > 0 &&
          bounds.bottom > 0 &&
          bounds.right > 0 &&
          bounds.top < innerHeight &&
          bounds.left < innerWidth &&
          visibleStyle(element)
        );
      };
      for (const [element, observation] of arrivalObservations)
        if (!element.isConnected && observation.removedAt === undefined) observation.removedAt = at;
      for (const element of document.querySelectorAll<HTMLElement>('[data-testid="zone-showcase"]')) {
        const face = element.querySelector<HTMLElement>(".battle-showcase__art");
        if (!face) continue;
        let observation = arrivalObservations.get(element);
        if (!observation) {
          if (!isPainted(element)) continue;
          observation = { cardId: element.dataset.cardId!, firstAt: at, lastAt: at, poses: [] };
          arrivalObservations.set(element, observation);
          capture.arrivals.push(observation);
        }
        observation.lastAt = at;
        const image = face.querySelector<HTMLImageElement>("img[alt]");
        const exit = face
          .getAnimations()
          .find((animation) => "animationName" in animation && animation.animationName === "battle-showcase-exit");
        const end = exit?.effect?.getComputedTiming().endTime;
        observation.poses.push({
          at,
          painted: isPainted(face) && Boolean(image && isPainted(image)),
          artLoaded: Boolean(image?.complete && image.naturalWidth > 0),
          exitMs: typeof exit?.currentTime === "number" ? exit.currentTime : undefined,
          exitEndMs: typeof end === "number" && Number.isFinite(end) ? end : undefined,
          exitRate: exit?.playbackRate,
        });
      }
      const scenes = [...document.querySelectorAll<HTMLElement>('[data-testid="security-clash"][data-cause="check"]')];
      const sceneKeys = new Set(scenes.map((scene) => scene.dataset.sceneKey!));
      for (const observation of capture.securityChecks)
        if (observation.removedAt === undefined && !sceneKeys.has(observation.key)) observation.removedAt = at;
      for (const scene of scenes) {
        const face = scene.querySelector<HTMLElement>('[data-role="revealed"] .battle-clash__art');
        if (!face) continue;
        const key = scene.dataset.sceneKey!;
        let observation = checkObservations.get(key);
        if (!observation) {
          if (!isPainted(scene)) continue;
          observation = {
            key,
            cardName: face.querySelector("img[alt]")?.getAttribute("alt") ?? "",
            attackerName: scene.querySelector('[data-role="attacker"] img[alt]')?.getAttribute("alt") ?? "",
            firstAt: at,
            lastAt: at,
            poses: [],
          };
          checkObservations.set(key, observation);
          capture.securityChecks.push(observation);
        }
        observation.lastAt = at;
        if (scene.dataset.revealedReady === "true") observation.readyAt ??= at;
        if (scene.dataset.resolution !== "pending") observation.outcomeAt ??= at;
        if (scene.dataset.exiting === "true") observation.exitAt ??= at;
        const bounds = face.getBoundingClientRect();
        const clocks = face.getAnimations();
        const nativeClock = (name: string) => {
          const native = clocks.find((animation) => "animationName" in animation && animation.animationName === name);
          const end = native?.effect?.getComputedTiming().endTime;
          return {
            age: typeof native?.currentTime === "number" ? native.currentTime : undefined,
            end: typeof end === "number" && Number.isFinite(end) ? end : undefined,
          };
        };
        const reveal = nativeClock("battle-security-reveal");
        const disposal = nativeClock("battle-security-exit");
        const image = face.querySelector<HTMLImageElement>("img[alt]");
        const attackerImage = scene.querySelector<HTMLImageElement>('[data-role="attacker"] img[alt]');
        observation.poses.push({
          at,
          x: bounds.x,
          y: bounds.y,
          width: bounds.width,
          height: bounds.height,
          opacity: Number(getComputedStyle(face).opacity),
          painted: isPainted(face),
          artLoaded: !!image?.complete && image.naturalWidth > 0,
          attackerArtLoaded: !!attackerImage?.complete && attackerImage.naturalWidth > 0,
          revealMs: reveal.age,
          revealEndMs: reveal.end,
          disposalMs: disposal.age,
          disposalEndMs: disposal.end,
          securityCount: Number(
            document.querySelector(".game-security-shield--opp .game-security-shield__count")?.textContent,
          ),
        });
      }
      for (const focus of document.querySelectorAll<SVGElement>('[data-testid="effect-focus"]')) {
        if (!isPainted(focus)) continue;
        let observation = focusObservations.get(focus);
        if (
          !observation ||
          observation.cardId !== focus.dataset.sourceCardId ||
          observation.permanentId !== focus.dataset.sourcePermanentId ||
          observation.removedAt !== undefined
        ) {
          if (observation) observation.removedAt ??= at;
          observation = {
            cardId: focus.dataset.sourceCardId!,
            permanentId: focus.dataset.sourcePermanentId,
            firstAt: at,
            lastAt: at,
          };
          focusObservations.set(focus, observation);
          capture.sourceFocuses.push(observation);
        }
        observation.lastAt = at;
      }
      for (const [element, observation] of focusObservations)
        if ((!element.isConnected || !isPainted(element)) && observation.removedAt === undefined)
          observation.removedAt = at;
      // A phone folds its notices into one band that names the newest moment.
      for (const notice of document.querySelectorAll<HTMLElement>("[data-narration-id], [data-narration-peek-id]")) {
        const id = notice.dataset.narrationId ?? notice.dataset.narrationPeekId!;
        if (noticeIds.has(id) || !isPainted(notice)) continue;
        noticeIds.add(id);
        capture.notices.push({ id, firstAt: at });
      }
      for (const root of document.querySelectorAll<HTMLElement>(
        '[data-draw-presentation-key][data-draw-ready="true"]',
      )) {
        const face = root.querySelector<HTMLElement>(".game-draw-presentation__face");
        if (!face || !isPainted(face)) continue;
        let observation = drawObservations.get(root);
        if (!observation) {
          observation = {
            key: root.dataset.drawPresentationKey!,
            side: root.dataset.side,
            instanceId: root.dataset.drawInstanceId,
            firstAt: at,
            lastAt: at,
            cardName: face.querySelector("img[alt]")?.getAttribute("alt") || undefined,
            poses: [],
          };
          drawObservations.set(root, observation);
          capture.draws.push(observation);
        }
        const bounds = face.getBoundingClientRect();
        const native = face
          .getAnimations()
          .find(
            (animation) =>
              "animationName" in animation &&
              (animation.animationName === "battle-draw-presentation-viewer" ||
                animation.animationName === "battle-draw-presentation"),
          );
        observation.lastAt = at;
        observation.poses.push({
          at,
          x: bounds.x,
          y: bounds.y,
          width: bounds.width,
          height: bounds.height,
          opacity: Number(getComputedStyle(face).opacity),
          ageMs: typeof native?.currentTime === "number" ? native.currentTime : undefined,
        });
      }
      for (const card of document.querySelectorAll<HTMLElement>(".game-hand-card[data-hand-card-id]")) {
        const id = card.dataset.handInstanceId!;
        if (arrived.has(id) || !isPainted(card)) continue;
        const art = card.querySelector("[role=img]");
        if (art && !isPainted(art)) continue;
        arrived.add(id);
        capture.handArrivals.push({ instanceId: id, cardId: card.dataset.handCardId!, firstAt: at });
      }
      const shields = ["you", "opp"].map((side) =>
        document.querySelector<HTMLElement>(`.game-security-shield--${side}`),
      );
      if (shields.every((shield) => shield && isPainted(shield))) {
        const sample = {
          counts: shields.map((shield) => Number(shield!.querySelector(".game-security-shield__count")?.textContent)),
          landing: shields.map((shield) =>
            shield!
              .getAnimations()
              .some(
                (animation) => "animationName" in animation && animation.animationName === "battle-security-flight",
              ),
          ),
          faceUpCards: shields.map((shield) => shield!.querySelectorAll(".game-security-card--revealed").length),
        };
        const key = JSON.stringify(sample);
        if (key !== securityKey) {
          capture.securityPaints.push({ at, ...sample });
          securityKey = key;
        }
        for (const [index, side] of ["you", "opp"].entries()) {
          if (!sample.landing[index]) {
            landingObservations.delete(side);
            continue;
          }
          const occurrence = shields[index]!.getAttribute("data-security-landing-key") ?? "";
          let observation = landingObservations.get(side);
          if (!observation || observation.key !== occurrence) {
            observation = { side, key: occurrence, firstAt: at, lastAt: at, frames: 0 };
            landingObservations.set(side, observation);
            capture.securityLandings.push(observation);
          }
          observation.lastAt = at;
          observation.frames++;
        }
      }
      for (const peel of document.querySelectorAll<HTMLElement>(".game-stack-strip-peel")) {
        const bounds = peel.getBoundingClientRect();
        const painted = [...peel.querySelectorAll(".game-stack-strip-peel__face, .game-stack-strip-peel__rim")].some(
          (part) => Number(getComputedStyle(part).opacity) > 0.01,
        );
        if (bounds.width <= 0 || bounds.height <= 0 || Number(getComputedStyle(peel).opacity) <= 0 || !painted)
          continue;
        let observation = peelObservations.get(peel);
        if (!observation) {
          observation = {
            key: peel.dataset.stackStrip ?? "",
            permanentId: peel.dataset.permanentId,
            cardId: peel.dataset.cardId,
            firstAt: at,
            lastAt: at,
            frames: 0,
          };
          peelObservations.set(peel, observation);
          capture.peels.push(observation);
        }
        observation.lastAt = at;
        observation.frames++;
      }
      for (const pulse of document.querySelectorAll<HTMLElement>(".game-dp-pulse")) {
        const bounds = pulse.getBoundingClientRect();
        const painted = [...pulse.querySelectorAll("i, em")].some(
          (part) => Number(getComputedStyle(part).opacity) > 0.01,
        );
        if (bounds.width <= 0 || bounds.height <= 0 || !painted) continue;
        let observation = dpObservations.get(pulse);
        if (!observation) {
          observation = {
            permanentId: pulse.closest<HTMLElement>("[data-drop][data-id]")?.dataset.id,
            from: Number(pulse.dataset.dpFrom),
            to: Number(pulse.dataset.dpTo),
            deltaText: pulse.querySelector("em")?.textContent ?? "",
            firstAt: at,
            lastAt: at,
            frames: 0,
          };
          dpObservations.set(pulse, observation);
          capture.dpPulses.push(observation);
        }
        observation.lastAt = at;
        observation.frames++;
      }
      const ribbon = document.querySelector<HTMLElement>(".game-phase-banner");
      const activeRaising = new Set<string>();
      for (const slot of document.querySelectorAll<HTMLElement>(
        ".game-breeding-slot[data-permanent-id][data-card-id]",
      )) {
        const permanentId = slot.dataset.permanentId!;
        const cardId = slot.dataset.cardId!;
        const key = `${permanentId}:${cardId}`;
        activeRaising.add(key);
        let observation = raisingObservations.get(key);
        if (!observation) {
          observation = { permanentId, cardId, firstAt: at, lastAt: at, poses: [] };
          raisingObservations.set(key, observation);
          capture.raising.push(observation);
        }
        const art = slot.querySelector<HTMLImageElement>("img[alt]");
        const clock = slot
          .querySelector(".battle-burst__clock")
          ?.getAnimations()
          .find((animation) => "animationName" in animation && animation.animationName === "battle-particle-clock");
        observation.lastAt = at;
        observation.poses.push({
          at,
          painted: Boolean(art && isPainted(art)),
          artLoaded: Boolean(art?.complete && art.naturalWidth > 0),
          nativeMs: typeof clock?.currentTime === "number" ? clock.currentTime : undefined,
          endMs: clock ? Number(clock.effect?.getComputedTiming().endTime) : undefined,
          playbackRate: clock?.playbackRate,
        });
      }
      for (const [key, observation] of raisingObservations)
        if (!activeRaising.has(key) && observation.removedAt === undefined) observation.removedAt = at;
      for (const element of document.querySelectorAll<HTMLElement>("[data-breeding-transfer]")) {
        const permanentId = element.dataset.breedingTransfer!;
        const face = element.querySelector<HTMLElement>(".game-card-enter > [data-state]");
        if (!face) continue;
        let observation = transferObservations.get(element);
        if (!observation) {
          observation = { permanentId, cardName: face.getAttribute("title") ?? "", firstAt: at, lastAt: at, poses: [] };
          transferObservations.set(element, observation);
          capture.breedingTransfers.push(observation);
        }
        const image = face.querySelector<HTMLImageElement>("img[alt]");
        const clock = element.getAnimations()[0];
        const rect = face.getBoundingClientRect();
        const target = document
          .querySelector<HTMLElement>(
            `.game-battle-row .game-permanent[data-permanent-id="${permanentId}"] .game-card-enter > [data-state]`,
          )
          ?.getBoundingClientRect();
        observation.lastAt = at;
        observation.poses.push({
          at,
          x: rect.x + rect.width / 2,
          y: rect.y + rect.height / 2,
          painted: isPainted(face),
          artLoaded: Boolean(image?.complete && image.naturalWidth > 0),
          targetX: target && target.x + target.width / 2,
          targetY: target && target.y + target.height / 2,
          nativeMs: typeof clock?.currentTime === "number" ? clock.currentTime : undefined,
          endMs: clock ? Number(clock.effect?.getComputedTiming().endTime) : undefined,
          playbackRate: clock?.playbackRate,
        });
      }
      for (const [element, observation] of transferObservations)
        if (!element.isConnected && observation.removedAt === undefined) observation.removedAt = at;
      for (const slot of document.querySelectorAll<HTMLElement>('.game-breeding-slot[data-burst="hatch"]')) {
        const permanentId = slot.dataset.permanentId;
        const cardId = slot.dataset.cardId;
        const art = slot.querySelector<HTMLImageElement>("img[alt]");
        if (
          permanentId &&
          cardId &&
          !hatched.has(permanentId) &&
          art?.complete &&
          art.naturalWidth > 0 &&
          isPainted(art)
        ) {
          hatched.add(permanentId);
          capture.hatches.push({ at, permanentId, cardId });
        }
      }
      for (const element of document.querySelectorAll<HTMLElement>(".game-phase-banner, .game-turn-banner")) {
        let observation = phaseObservations.get(element);
        if (!observation) {
          observation = {
            kind: element.classList.contains("game-phase-banner") ? "phase" : "turn",
            label: element.textContent?.trim() ?? "",
            side: element.dataset.side ?? (element.classList.contains("game-turn-banner--opp") ? "opp" : "you"),
            firstAt: at,
            lastAt: at,
            poses: [],
          };
          phaseObservations.set(element, observation);
          capture.phasePanels.push(observation);
        }
        const face = element.querySelector("span") ?? element;
        const native = element
          .getAnimations({ subtree: true })
          .find(
            (animation) =>
              "animationName" in animation &&
              ["arena-phase-ribbon", "battle-banner"].includes(String(animation.animationName)),
          );
        observation.lastAt = at;
        observation.poses.push({
          at,
          painted: isPainted(face),
          nativeMs: typeof native?.currentTime === "number" ? native.currentTime : undefined,
          endMs: native ? Number(native.effect?.getComputedTiming().endTime) : undefined,
          playbackRate: native?.playbackRate,
        });
      }
      for (const [element, observation] of phaseObservations)
        if (!element.isConnected && observation.removedAt === undefined) observation.removedAt = at;
      if (ribbon !== ribbonElement) {
        if (ribbon) capture.phaseRibbons.push({ at, label: ribbon.textContent ?? "", side: ribbon.dataset.side });
        ribbonElement = ribbon;
      }
      const arrows = document.querySelectorAll<SVGSVGElement>(".game-attack-arrow--tracking.game-attack-arrow--attack");
      const endpoints = [
        ...document.querySelectorAll<HTMLElement>(
          '[data-drop="perm-you"], [data-drop="perm-opp"], .game-security-shield',
        ),
      ];
      let nextArrowSignature = "";
      for (const arrow of arrows) {
        const head = arrow.querySelector<SVGPathElement>(".game-attack-arrow__head");
        const matrix = head?.getScreenCTM();
        if (!matrix) continue;
        const point = new DOMPoint(0, 0).matrixTransform(matrix);
        const targetKeys = JSON.parse(arrow.dataset.attackTargets ?? "[]") as string[];
        const nearest = endpoints
          .filter((element) => element.dataset.id !== arrow.dataset.attackSource)
          .filter(
            (element) =>
              targetKeys.length === 0 ||
              targetKeys.includes(
                element.dataset.id ??
                  (element.classList.contains("game-security-shield--you") ? "security-you" : "security-opp"),
              ),
          )
          .map((element) => {
            const face = element.querySelector<HTMLElement>(".game-card-enter > [data-state]") ?? element;
            const rect = face.getBoundingClientRect();
            return {
              target:
                element.dataset.id ??
                (element.classList.contains("game-security-shield--you") ? "security-you" : "security-opp"),
              gapPx: Math.hypot(
                Math.max(rect.left - point.x, 0, point.x - rect.right),
                Math.max(rect.top - point.y, 0, point.y - rect.bottom),
              ),
            };
          })
          .sort((a, b) => a.gapPx - b.gapPx)[0];
        const target = nearest && nearest.gapPx <= 8 ? nearest.target : undefined;
        const key = arrow.dataset.attackKey ?? "";
        nextArrowSignature += `${key}:${target};`;
        if (nextArrowSignature !== arrowSignature) {
          const sweep = arrow
            .querySelector(".game-attack-arrow__reveal")
            ?.getAnimations()
            .find((animation) => "animationName" in animation && animation.animationName === "battle-arrow-extend");
          const delay = Number(sweep?.effect?.getTiming().delay ?? 0);
          const timeline = document.timeline?.currentTime;
          const sweepMs =
            sweep &&
            (typeof timeline === "number" && typeof sweep.startTime === "number" && sweep.playState !== "paused"
              ? (timeline - sweep.startTime) * sweep.playbackRate - delay
              : typeof sweep.currentTime === "number"
                ? sweep.currentTime - delay
                : undefined);
          capture.arrows.push({
            at,
            key,
            sweepMs: typeof sweepMs === "number" ? Math.max(0, sweepMs) : undefined,
            source: arrow.dataset.attackSource,
            target,
            gapPx: nearest?.gapPx ?? Infinity,
            x: point.x,
            y: point.y,
          });
        }
      }
      arrowSignature = nextArrowSignature;
      const dialog = document.querySelector('[role="dialog"], [data-testid="board-prompt"]');
      if (decision && decision.element !== dialog) {
        decision.observation.closedAt = at;
        decision = undefined;
      }
      if (dialog && !decision && Number(getComputedStyle(dialog).opacity) > 0) {
        const observation = { label: dialog.getAttribute("aria-label"), openedAt: at };
        capture.decisions.push(observation);
        decision = { element: dialog, observation };
      }
      for (const animation of document.getAnimations()) {
        const effect = animation.effect as KeyframeEffect | null;
        const target = effect?.target;
        if (!(target instanceof HTMLElement)) continue;
        const observation = timingObservations.get(animation);
        if (observation) {
          observation.lastAt = at;
          observation.nativeMs = typeof animation.currentTime === "number" ? animation.currentTime : undefined;
          observation.playbackRate = animation.playbackRate;
          continue;
        }
        if (seen.has(animation)) continue;
        seen.add(animation);
        const field = target.closest<HTMLElement>("[data-field-key]");
        const returning = target.dataset.testid === "field-group-return";
        if (!field && !returning) continue;
        const timing = effect!.getTiming();
        const endMs = effect!.getComputedTiming().endTime;
        const recorded: AnimationTiming = {
          at,
          lastAt: at,
          nativeMs: typeof animation.currentTime === "number" ? animation.currentTime : undefined,
          endMs: typeof endMs === "number" && Number.isFinite(endMs) ? endMs : undefined,
          playbackRate: animation.playbackRate,
          fieldKey: field?.dataset.fieldKey,
          permanentId: field?.dataset.id,
          returning,
          returnId: returnId(target),
          properties: [...new Set(effect!.getKeyframes().flatMap((frame) => Object.keys(frame)))],
          duration: typeof timing.duration === "number" ? timing.duration : String(timing.duration),
          delayMs: timing.delay ?? 0,
          easing: timing.easing ?? "linear",
        };
        timingObservations.set(animation, recorded);
        capture.timings.push(recorded);
      }
      for (const element of document.querySelectorAll<HTMLElement>(
        '[data-field-key], [data-testid="field-group-return"]',
      )) {
        const art =
          element.dataset.testid === "field-group-return"
            ? element
            : element.querySelector<HTMLElement>(".game-card-enter > [data-state]");
        if (!art) continue;
        const rect = art.getBoundingClientRect();
        const style = getComputedStyle(art);
        if (rect.width <= 0 || rect.height <= 0 || style.visibility === "hidden" || Number(style.opacity) <= 0.01)
          continue;
        const cardName = art.getAttribute("title") ?? undefined;
        const name = [...art.querySelectorAll("span")].find((span) => span.textContent?.trim() === cardName);
        const chip = name?.nextElementSibling?.textContent?.trim().match(/^(\d+(?:\.\d+)?)\s*(K)?$/i);
        const currentDP = chip ? Number(chip[1]) * (chip[2] ? 1000 : 1) : undefined;
        capture.poses.push({
          at,
          fieldKey: element.dataset.fieldKey ?? element.dataset.returnTargetFieldKey,
          permanentId: element.dataset.id,
          returning: element.dataset.testid === "field-group-return",
          returnId: returnId(element),
          cardName,
          memberIds: JSON.parse(element.dataset.fieldMemberIds ?? "[]") as string[],
          currentDP,
          painted: isPainted(art),
          artLoaded: Boolean(
            [...art.querySelectorAll<HTMLImageElement>("img[alt]")].some(
              (image) => image.complete && image.naturalWidth > 0,
            ),
          ),
          x: rect.x + rect.width / 2,
          y: rect.y + rect.height / 2,
          angle: Number.parseFloat(getComputedStyle(art).rotate) || 0,
        });
      }
      if (capture.poses.length > 12_000 || capture.timings.length > 1000) {
        capture.truncated = true;
        return;
      }
      capture.frame = requestAnimationFrame(tick);
    };
    capture.frame = requestAnimationFrame(tick);
  });
}

export async function finishPacingCapture(page: Page) {
  return page.evaluate(() => {
    const globals = window as unknown as PacingWindow;
    const capture = globals["__keywordPacingCapture"];
    cancelAnimationFrame(capture.frame);
    globals["__keywordPacingObserver"]?.disconnect();
    globals["__aegisLiveMotion"].stop();
    return { ...capture, finishedAt: performance.now(), motion: globals["__aegisLiveMotion"].read() };
  });
}
