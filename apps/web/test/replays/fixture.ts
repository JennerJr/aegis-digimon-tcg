import { ArraySchema } from "@colyseus/schema";
import { CardInstance, GameState, Permanent, PlayerState, Phase } from "@aegis/shared";
import { ReplayRecording } from "../../../api/src/replays/recording.js";
import { projectReplay } from "../../../api/src/replays/recording.js";

export function replayFixture() {
  const game = new GameState();
  game.phase = Phase.Main;
  game.players = new ArraySchema(
    ...([0, 1] as const).map((seat) =>
      Object.assign(new PlayerState(), {
        seat,
        displayName: seat === 0 ? "Agumon Player" : "Gabumon Player",
        sessionId: `session-${seat}`,
      }),
    ),
  );
  const card = Object.assign(new CardInstance(), {
    instanceId: "hand-0",
    cardId: "BT1-010",
    artId: "BT1-010",
    ownerSeat: 0,
  });
  game.players[0]!.hand.push(card);
  game.players[0]!.handCount = 1;
  const recording = new ReplayRecording(1000);
  for (let index = 0; index < 4; index++) {
    game.stateVersion = index + 1;
    game.turnCount = Math.floor(index / 2) + 1;
    game.turnSeat = index < 2 ? 0 : 1;
    game.memory = index;
    if (index === 1) {
      game.players[0]!.hand.splice(0, 1);
      game.players[0]!.handCount = 0;
      game.players[0]!.battleArea.push(
        Object.assign(new Permanent(), {
          permanentId: "agumon",
          topCard: card,
          controllerSeat: 0,
          currentDP: 2000,
          baseDP: 2000,
        }),
      );
    }
    if (index === 3) {
      game.gameOver = true;
      game.winnerSeat = 0;
    }
    recording.capture(
      game,
      [
        {
          ...(index === 0
            ? { kind: "matchStarted" as const, firstSeat: 0 as const }
            : index === 1
              ? { kind: "cardPlayed" as const, seat: 0 as const, cardId: card.cardId, permanentId: "agumon" }
              : index === 2
                ? { kind: "phaseChanged" as const, phase: Phase.Main, turnSeat: 1 as const, turnCount: 2 }
                : {
                    kind: "gameOver" as const,
                    result: { outcome: "win" as const, winnerSeat: 0 as const },
                    reason: "surrender" as const,
                  }),
          seq: index + 1,
          batch: `batch-${index}`,
          stateVersion: index + 1,
        },
      ],
      1000 + index * 1000,
    );
  }
  return projectReplay(recording.complete("casual", 4000)!, 0);
}

/** A draw must finish its hand-arrival animation before the next frame is allowed to run. */
export function drawReplayFixture() {
  const replay = replayFixture();
  const card = structuredClone(replay.frames[0]!.state.players[0]!.hand[0]!);
  card.instanceId = "drawn-card";
  card.cardId = "BT1-011";
  card.artId = "BT1-011";
  for (const frame of replay.frames.slice(1)) {
    frame.state.players[0]!.hand.push(card);
    frame.state.players[0]!.handCount = 1;
  }
  replay.frames[1]!.events.push({
    kind: "cardsMoved",
    seat: 0,
    from: "deck",
    to: "hand",
    handAddition: "draw",
    instanceIds: [card.instanceId],
    seq: 10,
    batch: "batch-1",
    stateVersion: 2,
  });
  return replay;
}

export function securityReplayFixture() {
  const replay = replayFixture();
  const attacker = structuredClone(replay.frames[1]!.state.players[0]!.battleArea[0]!);
  for (const frame of replay.frames) {
    frame.state.players[0]!.hand = [] as never;
    frame.state.players[0]!.handCount = 0;
  }
  for (const frame of replay.frames.slice(0, 2)) {
    frame.state.players[0]!.battleArea = [structuredClone(attacker)] as never;
    frame.state.players[1]!.securityCount = 1;
    frame.state.players[1]!.securityView = [
      { instanceId: "security-card", cardId: "", artId: "", faceUp: false },
    ] as never;
  }
  replay.frames[1]!.state.players[0]!.battleArea[0]!.isSuspended = true;
  replay.frames[1]!.events = [
    {
      kind: "attackDeclared",
      seat: 0,
      attackerPermanentId: "agumon",
      attackerCardId: "BT1-010",
      target: { kind: "player" },
      seq: 2,
      batch: "attack",
      stateVersion: 2,
    },
  ];
  const security = Object.assign(structuredClone(attacker.topCard), {
    instanceId: "security-card",
    ownerSeat: 1 as const,
    cardId: "BT1-026",
    artId: "BT1-026",
  });
  for (const frame of replay.frames.slice(2)) {
    frame.state.players[0]!.battleArea = [] as never;
    frame.state.players[0]!.trash.push(structuredClone(attacker.topCard));
    frame.state.players[1]!.trash.push(structuredClone(security));
    frame.state.players[1]!.securityCount = 0;
    frame.state.players[1]!.securityView = [] as never;
  }
  const batch = { batch: "security", stateVersion: 3 };
  replay.frames[2]!.events = [
    {
      ...batch,
      seq: 3,
      kind: "securityRevealed",
      seat: 1,
      revealedCardId: "BT1-026",
      attackerPermanentId: "agumon",
      isDigimon: true,
      hasSecurityEffect: false,
      attackerDP: 2000,
      securityCardDP: 5000,
      securityCountBefore: 1,
    },
    {
      ...batch,
      seq: 4,
      kind: "securityChecked",
      seat: 1,
      revealedCardId: "BT1-026",
      resolution: "battle",
      battle: { attackerDP: 2000, securityCardDP: 5000, attackerDeleted: true, securityDigimonDeleted: false },
    },
    {
      ...batch,
      seq: 5,
      kind: "cardsMoved",
      seat: 0,
      from: "battleArea",
      to: "trash",
      instanceIds: [attacker.topCard.instanceId],
      cardIds: ["BT1-010"],
      battleDeletion: true,
      deletedPermanents: [
        { permanentId: "agumon", instanceId: attacker.topCard.instanceId, cardId: "BT1-010", seat: 0 },
      ],
    },
    {
      ...batch,
      seq: 6,
      kind: "combatResolved",
      seat: 0,
      attackerPermanentId: "agumon",
      deletedPermanentIds: ["agumon"],
    },
    { ...batch, seq: 7, kind: "attackEnded", seat: 0, attackerPermanentId: "agumon" },
  ];
  return replay;
}
