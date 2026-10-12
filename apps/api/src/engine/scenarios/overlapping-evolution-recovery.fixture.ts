import type { ScenarioFixture } from "#api/engine/scenario/types";

const fixture: ScenarioFixture = {
  name: "overlapping-evolution-recovery",
  memory: 6,
  turnSeat: 0,
  turnCount: 0,
  isFirstPlayersFirstTurn: false,
  board: {
    0: {
      eggDeck: ["BT14-003"],
      battleArea: [
        { card: "BT14-033", as: "angelBase", under: ["BT14-003"] },
        { card: "ST3-04", as: "secondBase" },
        { card: "P-105", as: "training", placedByEffect: true },
        { card: "BT1-087", as: "tk" },
      ],
      hand: [
        { card: "BT14-102", as: "replacement" },
        { card: "BT16-019", as: "secondEvolution" },
        { card: "BT14-037", as: "magna" },
        { card: "BT1-009", as: "reserve" },
      ],
      security: [{ card: "BT14-102", as: "securityAngel" }, "BT1-009", "BT1-009", "BT1-009", "BT1-009"],
      deck: ["BT1-009", "BT1-009", "BT1-009", { card: "BT1-010", as: "delayedDraw" }, ...Array(8).fill("BT1-009")],
    },
    1: {
      eggDeck: ["BT14-003"],
      battleArea: [
        { card: "EX4-038", as: "low", under: ["ST20-01"] },
        { card: "EX9-019", as: "high" },
      ],
      security: 5,
      deck: Array(12).fill("BT1-009"),
    },
  },
  presentation: { holdBotAfterTurn: 1 },
};

export default fixture;
