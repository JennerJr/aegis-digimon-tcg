import { expect, type Locator } from "@playwright/test";

export async function exposedCardPoint({ target, touch = false }: { target: Locator; touch?: boolean }) {
  await target.scrollIntoViewIfNeeded();
  const point = await target.evaluate((element, touch) => {
    const cardArt = element.querySelector(".game-card-enter > [data-state]");
    const art = cardArt ?? element;
    const bounds = art.getBoundingClientRect();
    const interaction = element.getBoundingClientRect();
    const positions = touch
      ? [
          [0.9, 0.1],
          [0.5, 0.5],
          [0.25, 0.75],
          [0.85, 0.35],
          [0.25, 0.25],
        ]
      : [
          [0.5, 0.5],
          [0.25, 0.75],
          [0.85, 0.35],
          [0.25, 0.25],
          [0.9, 0.1],
        ];
    for (const [x, y] of positions) {
      const candidate = { x: bounds.left + bounds.width * x!, y: bounds.top + bounds.height * y! };
      if (
        !touch &&
        (candidate.x < interaction.left ||
          candidate.x > interaction.right ||
          candidate.y < interaction.top ||
          candidate.y > interaction.bottom)
      )
        continue;
      const hit = document.elementFromPoint(candidate.x, candidate.y);
      if (hit && art.contains(hit) && (!cardArt || !hit.closest("[data-badge-hint], button"))) return candidate;
    }
    return null;
  }, touch);
  expect(point, "the card exposes an unobstructed pointer target").not.toBeNull();
  return point!;
}
