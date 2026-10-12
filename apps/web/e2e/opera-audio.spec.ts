import { expect, test } from "@playwright/test";
import { AUDIO_CUES, MUSIC_URL } from "../src/design/audioBank";

test.use({
  userAgent: "Mozilla/5.0 (Linux; Android 13; Tablet) AppleWebKit/537.36 Chrome/122.0.0.0 Safari/537.36 OPR/80.0.0.0",
  hasTouch: true,
  viewport: { width: 1024, height: 768 },
});

type AudioProbe = { players: HTMLAudioElement[]; contexts: number };
type ProbeWindow = typeof window & { operaAudioProbe: AudioProbe };

test("Opera tablet compatibility plays the actual music and finite cues through native media", async ({ page }) => {
  await page.addInitScript(() => {
    const probe: AudioProbe = { players: [], contexts: 0 };
    (window as ProbeWindow).operaAudioProbe = probe;
    const NativeAudio = window.Audio;
    window.Audio = function (src?: string) {
      const player = new NativeAudio(src);
      probe.players.push(player);
      return player;
    } as unknown as typeof Audio;
    window.AudioContext = class extends AudioContext {
      constructor(options?: AudioContextOptions) {
        super(options);
        probe.contexts++;
      }
    };
    localStorage.setItem("aegis.music.enabled", "true");
    localStorage.setItem("aegis.sound.enabled", "true");
  });
  await page.goto("/dev/audio-preview/");
  await expect(page.getByRole("button", { name: "Start game mix", exact: true })).toBeVisible();
  expect(await page.evaluate(() => (window as ProbeWindow).operaAudioProbe.contexts)).toBe(0);
  await page.getByRole("button", { name: "Start game mix", exact: true }).tap();
  await expect
    .poll(() =>
      page.evaluate((musicUrl) => {
        const music = (window as ProbeWindow).operaAudioProbe.players.find(
          (player) => player.src === new URL(musicUrl, window.location.href).href,
        );
        return !!music && !music.paused && music.currentTime > 0 && music.loop && music.volume > 0;
      }, MUSIC_URL),
    )
    .toBe(true);

  await page.getByRole("button", { name: "Draw", exact: true }).tap();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const effect = (window as ProbeWindow).operaAudioProbe.players.find((player) => player.src.startsWith("blob:"));
        return effect?.ended;
      }),
    )
    .toBe(true);
  const clip = await page.evaluate(() => {
    const effect = (window as ProbeWindow).operaAudioProbe.players.find((player) => player.src.startsWith("blob:"))!;
    return { duration: effect.duration, loop: effect.loop, time: effect.currentTime };
  });
  expect(clip.duration).toBeCloseTo(AUDIO_CUES.draw!.duration, 4);
  expect(clip.time).toBeCloseTo(clip.duration, 4);
  expect(clip.loop).toBe(false);
  expect(await page.evaluate(() => (window as ProbeWindow).operaAudioProbe.contexts)).toBe(0);

  await page.getByRole("button", { name: "Stop all", exact: true }).click();
  expect(
    await page.evaluate(() => (window as ProbeWindow).operaAudioProbe.players.every((player) => player.paused)),
  ).toBe(true);
});
