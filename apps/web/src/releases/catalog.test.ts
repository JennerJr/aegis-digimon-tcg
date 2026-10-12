import { describe, expect, it } from "vitest";
import { allReleases, currentRelease, displayVersion, issueUrl, parseCatalog } from "@/releases/catalog";
import { LOCALES } from "@/i18n/locales";
import { translator } from "@/i18n/translator";
import type { TranslationKey } from "@/i18n/translationTypes";
import messages from "@/releases/messages.json";

describe("release catalog", () => {
  it("exposes the latest beta as the current release", () => {
    expect(currentRelease().version).toBe("1.25.0-beta");
    expect(displayVersion(currentRelease().version)).toBe("v1.25.0-BETA");
    expect(allReleases()).toHaveLength(58);
  });

  it.each(LOCALES)("resolves every release message through the %s translator", (locale) => {
    const t = translator(locale);
    for (const release of allReleases()) {
      const keys = [
        release.summaryKey,
        ...release.features.map((item) => item.textKey),
        ...release.fixes.map((item) => item.textKey),
      ];
      for (const key of keys) {
        const message: Record<string, string> = messages[key as keyof typeof messages];
        // Italian release notes start at v1.19.0; older ones keep their English text.
        expect(t(key as TranslationKey)).toBe(message[locale] ?? message.en);
      }
    }
  });

  it("translates the v1.19.0 notes into Italian", () => {
    expect(translator("it")("releases.1.19.0-beta.feature.hatch" as TranslationKey)).toBe(
      messages["releases.1.19.0-beta.feature.hatch"].it,
    );
  });

  it("builds public GitHub issue links", () => {
    expect(issueUrl(4894)).toMatch(/issues\/4894$/);
  });

  it("rejects malformed bundled release data", () => {
    expect(() =>
      parseCatalog([
        {
          version: "wrong",
          releasedAt: "2026-09-21",
          summaryKey: "releases.invalid.summary",
          features: [],
          fixes: [],
        },
      ]),
    ).toThrow("Invalid release version");
  });

  it("rejects malformed items and release ordering", () => {
    const release = {
      version: "1.0.1-beta",
      releasedAt: "2026-09-21",
      summaryKey: "releases.test.summary",
      features: [],
      fixes: [{ textKey: "releases.test.fix", issue: 0 }],
    };
    expect(() => parseCatalog([release])).toThrow("Invalid release issue");
    expect(() =>
      parseCatalog([
        { ...release, fixes: [] },
        { ...release, version: "1.1.0-beta", fixes: [] },
      ]),
    ).toThrow("Releases must be newest first");
  });
});
