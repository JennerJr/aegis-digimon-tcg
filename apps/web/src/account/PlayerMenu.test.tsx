// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { I18nProvider } from "../i18n";
import { PlayerMenu } from "./PlayerMenu";
const player = { name: "Tai", color: "Blue", shards: 0 };
afterEach(cleanup);
function open(overrides: Partial<Parameters<typeof PlayerMenu>[0]> = {}) {
  const props = { player, signedIn: false, onClose: vi.fn(), onNav: vi.fn(), onProfile: vi.fn(), ...overrides };
  render(
    <I18nProvider>
      <PlayerMenu {...props} />
    </I18nProvider>,
  );
  return props;
}
it("offers navigation without a dialog or an embedded avatar catalog", () => {
  const props = open();
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(screen.getByRole("link", { name: "My profile" }).getAttribute("href")).toBe("/profile");
  expect(screen.queryByRole("link", { name: "Customize" })).toBeNull();
  expect(screen.queryByRole("link", { name: "Replays" })).toBeNull();
  expect(screen.queryByRole("searchbox")).toBeNull();
  fireEvent.click(screen.getByRole("link", { name: "My profile" }));
  expect(props.onProfile).toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
  expect(props.onNav).toHaveBeenCalledWith("login");
});
it("keeps replays on the profile and preserves sign out", () => {
  const onSignOut = vi.fn();
  open({ signedIn: true, onSignOut });
  expect(screen.queryByRole("link", { name: "Replays" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
  expect(onSignOut).toHaveBeenCalled();
});
it("dismisses on Escape and returns focus to its trigger", () => {
  const anchor = document.createElement("button");
  document.body.append(anchor);
  const props = open({ anchor });
  fireEvent.keyDown(document, { key: "Escape" });
  expect(props.onClose).toHaveBeenCalled();
  expect(document.activeElement).toBe(anchor);
  anchor.remove();
});
it("dismisses outside without blocking the page", () => {
  const props = open();
  fireEvent.pointerDown(document.body);
  expect(props.onClose).toHaveBeenCalled();
});

it("opens the community hub without a legacy feedback inbox shortcut", () => {
  const props = open({ signedIn: true });
  expect(screen.queryByRole("button", { name: "Player feedback" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Community hub" }));
  expect(props.onNav).toHaveBeenCalledWith("myFeedback");
  expect(props.onClose).toHaveBeenCalled();
});
