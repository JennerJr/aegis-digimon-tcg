import { CardKind } from "@aegis/shared/schema/enums";
import type { DecisionRequest, ServerEvent } from "@aegis/shared/protocol/events";
import type { Intent } from "@aegis/shared/protocol/intents";
import { enumerateMainPhaseCandidates, digivolveCost, type Candidate } from "#api/bot/candidates";
import { appraiseBlock, bodyValue, scoreCandidate, shouldPayBarrier } from "#api/bot/evaluate";
import { DEFAULT_BOT_PROFILE, type BotProfile } from "#api/bot/profiles";
import { createBotRandom, type BotRandom } from "#api/bot/rng";
import { isDigimonCard, type BotUnit, type BotView } from "#api/bot/view";

/**
 * The decision surface `BotPlayer` drives.
 *
 * `BotPlayer` owns the asynchronous plumbing — think delay, main-phase loop, routing
 * engine callbacks — and owns none of the judgement. Everything that decides WHAT to do
 * lives behind this interface, which is why the baseline heuristic policy can still be
 * instantiated unchanged for the benchmark to play against.
 */
export interface BotPolicy<Result extends Intent | Promise<Intent> = Intent> {
  readonly name: string;
  /** Broadcast events only; private decisions enter through answerDecision. */
  observeEvent?(event: ServerEvent): void;
  /** Called at the start of each of the bot's own turns so per-turn state can reset. */
  onTurnStart(): void;
  chooseBreedingAction(view: BotView, signal?: AbortSignal): Result;
  /** The single best action right now, or `endPhase` when passing beats everything. */
  chooseMainAction(view: BotView, signal?: AbortSignal): Result;
  chooseBlockResponse(view: BotView, context: BlockContext, signal?: AbortSignal): Result;
  chooseCounterResponse(view: BotView, context: CounterContext, signal?: AbortSignal): Result;
  chooseAllianceResponse(view: BotView, context: AllianceContext, signal?: AbortSignal): Result;
  chooseEvadeResponse(view: BotView, permanentId: string, signal?: AbortSignal): Result;
  chooseBarrierResponse(view: BotView, permanentId: string, signal?: AbortSignal): Result;
  answerDecision(view: BotView | undefined, request: DecisionRequest, signal?: AbortSignal): Result;
  /** The engine refused this intent; do not offer it again this turn. */
  noteRejected(intent: Intent): void;
  /** An asynchronous engine failure; its event may not identify the responsible seat. */
  onEngineRejection?(event: Extract<ServerEvent, { kind: "actionRejected" }>): void;
}

export interface BlockContext {
  attackerPermanentId: string;
  eligibleBlockerIds: readonly string[];
  mustBlock: boolean;
  /** False when the declared attack targets one of our Digimon rather than us. */
  targetsPlayer: boolean;
  /** Current public attack target, including any pre-block redirection. */
  targetPermanentId?: string;
}

export type CounterContext = Extract<ServerEvent, { kind: "counterWindowOpened" }>;
export type AllianceContext = Extract<ServerEvent, { kind: "alliancePrompt" }>;

export interface EvaluationPolicyOptions {
  profile?: BotProfile;
  seed?: number;
}

/**
 * The evaluation-driven policy: enumerate every legal action, score each one with the
 * shared evaluation function under this profile's weights, play the best.
 *
 * Personality lives entirely in `profile.weights`. There is deliberately no branch on
 * profile name anywhere in this file.
 */
export function createEvaluationPolicy(options: EvaluationPolicyOptions = {}): BotPolicy {
  const profile = options.profile ?? DEFAULT_BOT_PROFILE;
  const random: BotRandom = createBotRandom(options.seed ?? 0x5eed);
  const rejectedThisTurn = new Set<string>();
  const attemptedThisTurn = new Set<string>();

  /**
   * Tie-break jitter. Small enough never to reorder candidates that differ meaningfully,
   * large enough to stop the bot replaying the same line whenever scores are level.
   */
  const jitter = (): number => random.next() * 0.01;

  function bestCandidate(view: BotView): Candidate {
    const candidates = enumerateMainPhaseCandidates(view);
    let best: Candidate | undefined;
    let bestScore = Number.NEGATIVE_INFINITY;
    for (const candidate of candidates) {
      if (rejectedThisTurn.has(candidate.key)) continue;
      // An activated ability that stays offered after firing would otherwise loop.
      if (candidate.kind === "activateEffect" && attemptedThisTurn.has(candidate.key)) continue;
      const score = scoreCandidate(view, candidate, profile) + jitter();
      if (score > bestScore) {
        bestScore = score;
        best = candidate;
      }
    }
    if (best === undefined || bestScore <= profile.weights.actionThreshold) {
      return { kind: "endPhase", key: "endPhase", intent: { type: "endPhase" }, cost: 0 };
    }
    return best;
  }

  return {
    name: `evaluation:${profile.name}`,

    onTurnStart(): void {
      rejectedThisTurn.clear();
      attemptedThisTurn.clear();
    },

    chooseBreedingAction(view: BotView): Intent {
      const breeding = view.breeding;
      if (breeding === undefined) {
        return view.eggDeckCount > 0 ? { type: "hatchEgg" } : { type: "endPhase" };
      }
      // A Lv.2 Digi-Egg is not a Digimon yet and cannot leave the raising area.
      if (breeding.level < 3) return { type: "endPhase" };
      const readyToDeploy = breeding.level >= profile.weights.deployLevel;
      // A Digimon that can still grow where nothing can attack it should stay put; one
      // that cannot has stopped earning its slot, so move it and free the slot for an egg.
      const canStillGrow =
        !breeding.cannotDigivolve &&
        view.hand.some(
          (card) =>
            isDigimonCard(card.definition) &&
            breeding.cardId !== undefined &&
            (digivolveCost(card.cardId, breeding.cardId, {
              inBreeding: true,
              controlledUnits: view.board,
            }) ?? Number.POSITIVE_INFINITY) <= view.maxAffordable,
        );
      if (readyToDeploy || !canStillGrow) {
        return { type: "moveFromBreeding", permanentId: breeding.permanentId };
      }
      return { type: "endPhase" };
    },

    chooseMainAction(view: BotView): Intent {
      const candidate = bestCandidate(view);
      attemptedThisTurn.add(candidate.key);
      return candidate.intent;
    },

    chooseBlockResponse(view: BotView, context: BlockContext): Intent {
      if (context.mustBlock) {
        const blockerPermanentId = context.eligibleBlockerIds[0];
        return blockerPermanentId === undefined
          ? { type: "declineBlock" }
          : { type: "declareBlock", blockerPermanentId };
      }
      const attacker = view.opponentBoard.find((unit) => unit.permanentId === context.attackerPermanentId);
      const appraisal = appraiseBlock(view, attacker, context.eligibleBlockerIds, context.targetsPlayer, profile);
      if (appraisal === undefined) return { type: "declineBlock" };
      return { type: "declareBlock", blockerPermanentId: appraisal.blockerPermanentId };
    },

    chooseCounterResponse(_view: BotView, context: CounterContext): Intent {
      // A [Counter] effect costs nothing but the once-per-attack window, and the window
      // only opens when something is genuinely activatable, so always take it.
      const counter = context.eligibleCounters[0];
      if (counter === undefined) return { type: "respondCounter" };
      return {
        type: "respondCounter",
        sourceInstanceId: counter.instanceId,
        effectKey: counter.effectKey,
      };
    },

    chooseAllianceResponse(view: BotView, context: AllianceContext): Intent {
      // ＜Alliance＞ suspends an ally to add its DP to the attack. Worth it only when
      // something on the other side could actually survive or block the attack unaided.
      const contested = view.opponentBoard.some((unit) => !unit.suspended);
      const ally = context.eligibleAllyIds[0];
      if (!contested || ally === undefined) return { type: "respondAlliance" };
      return { type: "respondAlliance", allyPermanentId: ally };
    },

    chooseEvadeResponse(_view: BotView, permanentId: string): Intent {
      // ＜Evade＞ only costs suspension, which the Digimon was about to lose anyway.
      return { type: "respondEvade", permanentId, accept: true };
    },

    chooseBarrierResponse(view: BotView, permanentId: string): Intent {
      return {
        type: "respondBarrier",
        permanentId,
        accept: shouldPayBarrier(view, permanentId, profile),
      };
    },

    answerDecision(view: BotView | undefined, request: DecisionRequest): Intent {
      return answerDecisionWith(view, request, profile);
    },

    noteRejected(intent: Intent): void {
      const key = candidateKeyOf(intent);
      if (key !== undefined) rejectedThisTurn.add(key);
    },
  };
}

/** Reconstruct the enumeration key for a rejected intent so it can be blocklisted. */
function candidateKeyOf(intent: Intent): string | undefined {
  switch (intent.type) {
    case "attack":
      return intent.target.kind === "player"
        ? `attackPlayer:${intent.attackerPermanentId}`
        : `attackDigimon:${intent.attackerPermanentId}:${intent.target.permanentId}`;
    case "digivolve":
      return `digivolve:${intent.instanceId}:${intent.permanentId}`;
    case "playCard":
      // The play kind is not recoverable from the intent, so all three spellings are
      // blocklisted; an instance only ever produces one of them anyway.
      return `play:${intent.instanceId}`;
    case "activateEffect":
      return `activate:${intent.sourceInstanceId}:${intent.effectKey}`;
    default:
      return undefined;
  }
}

/**
 * Shared decision answering. Deliberately not profile-dependent beyond the cases where
 * risk appetite genuinely applies: these are effect resolutions where the printed text is
 * not available to reason over, so the safe general rule is to take the beneficial branch.
 */
export function answerDecisionWith(view: BotView | undefined, request: DecisionRequest, _profile: BotProfile): Intent {
  switch (request.kind) {
    case "mulligan":
      return { type: "mulligan", keep: shouldKeepHand(view) };

    case "optional":
      // "You may" clauses on a card you control are written to benefit you.
      return {
        type: "respondDecision",
        decisionId: request.decisionId,
        response: { kind: "optional", accept: true },
      };

    case "selectCards": {
      const instanceIds = pickInstances(view, request);
      return {
        type: "respondDecision",
        decisionId: request.decisionId,
        response: { kind: "selectCards", instanceIds },
      };
    }

    case "chooseTargets": {
      const instanceIds = pickInstances(view, request);
      return {
        type: "respondDecision",
        decisionId: request.decisionId,
        response: { kind: "chooseTargets", instanceIds },
      };
    }

    case "orderCards":
      return {
        type: "respondDecision",
        decisionId: request.decisionId,
        response: { kind: "orderCards", order: [...(request.options?.candidateInstanceIds ?? [])] },
      };

    case "orderTriggers":
      return {
        type: "respondDecision",
        decisionId: request.decisionId,
        response: { kind: "orderTriggers", order: (request.options?.triggerKeys ?? []).slice(0, 1) },
      };

    case "chooseOption":
      return {
        type: "respondDecision",
        decisionId: request.decisionId,
        response: { kind: "chooseOption", optionIndex: 0 },
      };

    default: {
      const unhandled: never = request.kind;
      throw new Error(`Unhandled bot decision kind: ${String(unhandled)}`);
    }
  }
}

/** Keep an opening hand that can actually start: at least one Lv.3 Digimon to play. */
function shouldKeepHand(view: BotView | undefined): boolean {
  if (view === undefined) return true;
  if (view.hand.length === 0) return true;
  return view.hand.some(
    (card) =>
      card.definition !== undefined &&
      card.definition.kinds.includes(CardKind.Digimon) &&
      (card.definition.level ?? 0) <= 3,
  );
}

/**
 * Order the offered candidates so the ones most likely to be the good pick come first,
 * then take exactly as many as the request demands.
 *
 * The decision protocol carries no statement of what the selection is FOR, so this
 * cannot be exact. What it can do is exploit ownership: a candidate on the opponent's
 * board is almost always something we want gone (biggest first), and a candidate we own
 * is almost always something we are being asked to give up (cheapest first).
 */
function pickInstances(view: BotView | undefined, request: DecisionRequest): string[] {
  const candidates = request.options?.candidateInstanceIds ?? [];
  const min = request.options?.min ?? 0;
  if (candidates.length === 0) return [];
  if (view === undefined) return candidates.slice(0, min);

  // A board candidate arrives as a permanent id from a targeting clause and as a card
  // instance id from a selection clause, and the request never says which. Indexing units
  // under both names is what makes the ranking below apply to either.
  const opponentUnits = indexUnits(view.opponentBoard);
  const ownUnits = indexUnits(view.breeding === undefined ? view.board : [...view.board, view.breeding]);
  const ownHand = new Map(view.hand.map((card) => [card.instanceId, card]));

  const visibleCardIds = new Map((request.options?.visibleCards ?? []).map((card) => [card.instanceId, card.cardId]));
  const selectedCardIds = new Set<string>();
  const ranked = [...candidates]
    .sort((left, right) => rank(right) - rank(left))
    .filter((instanceId) => {
      if (!request.options?.distinctCardIds) return true;
      const cardId =
        visibleCardIds.get(instanceId) ??
        ownHand.get(instanceId)?.cardId ??
        ownUnits.get(instanceId)?.cardId ??
        opponentUnits.get(instanceId)?.cardId;
      if (cardId === undefined || selectedCardIds.has(cardId)) return false;
      selectedCardIds.add(cardId);
      return true;
    });

  if (min > 0) return ranked.slice(0, min);
  // The bot already accepted this "you may" clause; its pick floor of zero only exists so a
  // human can back out.
  if (request.options?.purpose === "acceptedOptional") return ranked.slice(0, 1);
  // A cost selection IS the payment: an empty answer declines the clause and, on a clause
  // whose whole body is gated behind it, throws the card away for nothing (P-193 played
  // its ＜Delay＞ body away by skipping the trash cost). Pay it in full, spending the
  // cheapest cards we own — a card already committed to the cost is worth less than the
  // effect it buys, and a partial payment is the same as no payment.
  if (request.options?.purpose === "cost") {
    const price = request.options.max ?? 1;
    const affordable = ranked.filter((instanceId) => !opponentUnits.has(instanceId));
    // `rank` already scores cards we own negatively by level, play cost and body, so the
    // descending sort leaves the cheapest one to give up at the front of the pool.
    const pool = affordable.length > 0 ? affordable : ranked;
    return pool.length >= price ? pool.slice(0, price) : [];
  }
  // An optional selection whose only candidates sit on the opponent's board is a removal
  // or disruption clause; taking one is strictly better than declining it.
  const firstIsOpponent = ranked[0] !== undefined && opponentUnits.has(ranked[0]);
  return firstIsOpponent ? ranked.slice(0, 1) : [];

  function rank(instanceId: string): number {
    const enemy = opponentUnits.get(instanceId);
    // Suspending an already suspended Digimon is legal (Q1782) but changes nothing.
    if (enemy !== undefined && enemy.suspended && request.options?.targetFate === "suspend") {
      return 500 + bodyValue(enemy);
    }
    if (enemy !== undefined) return 1_000 + bodyValue(enemy);
    const mine = ownUnits.get(instanceId);
    if (mine !== undefined) return -bodyValue(mine);
    const inHand = ownHand.get(instanceId);
    if (inHand?.definition !== undefined) {
      return -(inHand.definition.level ?? 0) - inHand.definition.playCost / 10;
    }
    return 0;
  }
}

/** Index units under every id a decision request might name them by. */
function indexUnits(units: readonly BotUnit[]): Map<string, BotUnit> {
  const index = new Map<string, BotUnit>();
  for (const unit of units) {
    index.set(unit.permanentId, unit);
    if (unit.topCardInstanceId !== undefined) index.set(unit.topCardInstanceId, unit);
  }
  return index;
}
