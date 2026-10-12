import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

const compiled: CompiledCard = {
  effects: [
    {
      trigger: "Static",
      actions: [],
      keywords: [
        {
          keyword: "Jamming",
          raw: "＜Jamming＞",
        },
      ],
    },
    {
      trigger: "OnPlay",
      actions: [
        {
          kind: "ModifyDP",
          target: {
            filter: {
              controller: "opponent",
              kind: ["Digimon"],
            },
            count: 1,
          },
          amount: -2000,
          duration: "forTheTurn",
          optional: true,
          cost: {
            kind: "trash",
            target: {
              filter: {
                zone: "hand",
                controller: "mine",
              },
              count: 3,
              upTo: true,
            },
            raw: "By trashing up to 3 cards from your hand",
          },
          scaling: {
            per: 1,
            usePaidCount: true,
            unit: "cards",
          },
        },
        {
          effectTextPart: "Then, return 1 of their Digimon with 5000 DP or less to the bottom of the deck.",
          kind: "Return",
          target: {
            filter: {
              controller: "opponent",
              kind: ["Digimon"],
              dp: {
                op: "lte",
                value: 5000,
              },
            },
            count: 1,
          },
          to: "deckBottom",
        },
      ],
    },
    {
      trigger: "WhenDigivolving",
      actions: [
        {
          kind: "ModifyDP",
          target: {
            filter: {
              controller: "opponent",
              kind: ["Digimon"],
            },
            count: 1,
          },
          amount: -2000,
          duration: "forTheTurn",
          optional: true,
          cost: {
            kind: "trash",
            target: {
              filter: {
                zone: "hand",
                controller: "mine",
              },
              count: 3,
              upTo: true,
            },
            raw: "By trashing up to 3 cards from your hand",
          },
          scaling: {
            per: 1,
            usePaidCount: true,
            unit: "cards",
          },
        },
        {
          effectTextPart: "Then, return 1 of their Digimon with 5000 DP or less to the bottom of the deck.",
          kind: "Return",
          target: {
            filter: {
              controller: "opponent",
              kind: ["Digimon"],
              dp: {
                op: "lte",
                value: 5000,
              },
            },
            count: 1,
          },
          to: "deckBottom",
        },
      ],
    },
    {
      trigger: "AllTurns",
      actions: [
        {
          kind: "SubTrigger",
          event: "whenSuspended",
          sourceFilter: { isSelfRef: true },
          actions: [
            {
              kind: "Unsuspend",
              target: {
                filter: {
                  isSelfRef: true,
                },
                count: 1,
                isSelf: true,
              },
              optional: true,
              cost: {
                kind: "return",
                target: {
                  filter: {
                    zone: "trash",
                    controller: "mine",
                    nameOrTrait: [
                      {
                        tokens: ["Jellymon"],
                        match: "text",
                      },
                      {
                        tokens: ["DS"],
                        match: "trait",
                      },
                    ],
                  },
                  count: 3,
                },
                raw: "by returning 3 cards with [Jellymon] in their texts or the [DS] trait from your trash to the bottom of the deck",
              },
              abortOnDecline: true,
            },
          ],
        },
      ],
      isInherited: true,
      frequency: "OncePerTurn",
    },
  ],
  coverage: "full",
  residual: [],
  digivolutionRequirement: [
    {
      level: 4,
      texts: ["Jellymon"],
      cost: 3,
      isAlternate: true,
    },
    {
      traits: ["DS"],
      cost: 3,
      isAlternate: true,
      level: 4,
    },
  ],
};

registerIrCard("EX12-030", compiled);
