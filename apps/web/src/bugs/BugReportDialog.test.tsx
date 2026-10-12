// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "@/i18n/I18nProvider";
import { BugReportDialog } from "@/bugs/BugReportDialog";
import { ForumScreen } from "@/bugs/ForumScreen";
import { ForumMarkdown } from "@/bugs/ForumMarkdown";

function mockApi(status = 201) {
  const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(async (input, init) => {
    const path = new URL(String(input)).pathname;
    const body =
      path === "/feedback/images"
        ? { id: "e42249e5-ba6e-4528-b517-63bee8fbbb0f", name: "board.png", width: 10, height: 10 }
        : init?.method === "POST"
          ? { id: 7 }
          : { items: [], nextOffset: null };
    return new Response(JSON.stringify(body), {
      status: init?.method === "POST" ? status : 200,
      headers: { "Content-Type": "application/json" },
    });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}
function dialog(signedIn = true, matchLogId?: string, onClose = vi.fn<() => void>()) {
  return render(
    <I18nProvider>
      <BugReportDialog signedIn={signedIn} matchLogId={matchLogId} onClose={onClose} />
    </I18nProvider>,
  );
}
function fill() {
  fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Effect timing" } });
  fireEvent.change(screen.getByLabelText("Your report"), { target: { value: "What I did and what happened" } });
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  localStorage.clear();
});

describe("public topic composer", () => {
  it("lets guests read the forum but requires sign-in before publishing", () => {
    dialog(false);
    expect(screen.getByText("Sign in to participate")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Publish topic" })).toBeNull();
  });
  it("accepts long reports and captures match context without publishing it as a form field", async () => {
    const fetchMock = mockApi();
    dialog(true, "e42249e5-ba6e-4528-b517-63bee8fbbb0f");
    fill();
    const description = "Detailed report ".repeat(400);
    fireEvent.change(screen.getByLabelText("Your report"), { target: { value: description } });
    expect((screen.getByLabelText("Your report") as HTMLTextAreaElement).maxLength).toBe(20000);
    expect(screen.getByText("Visible to everyone. Do not include personal information.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Publish topic" }));
    await screen.findByText("Your topic has been published");
    const call = fetchMock.mock.calls.find(([, init]) => init?.method === "POST");
    expect(JSON.parse(call![1]!.body as string)).toMatchObject({
      description,
      matchId: "e42249e5-ba6e-4528-b517-63bee8fbbb0f",
      imageIds: [],
    });
    expect(screen.getByRole("link", { name: "Open topic" }).getAttribute("href")).toBe("/feedback/7");
  });
  it("keeps text after a failed submission", async () => {
    mockApi(503);
    dialog();
    fill();
    fireEvent.click(screen.getByRole("button", { name: "Publish topic" }));
    await screen.findByText("Could not save. Your text is still here; try again.");
    expect((screen.getByLabelText("Your report") as HTMLTextAreaElement).value).toBe("What I did and what happened");
  });
  it("does not dismiss drafts with Escape or backdrop clicks", () => {
    mockApi();
    const close = vi.fn<() => void>();
    dialog(true, undefined, close);
    fill();
    fireEvent.keyDown(document, { key: "Escape" });
    fireEvent.click(document.querySelector(".aegis-dialog-layer")!);
    expect(close).not.toHaveBeenCalled();
    vi.spyOn(window, "confirm").mockReturnValue(false);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(close).not.toHaveBeenCalled();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(close).toHaveBeenCalledOnce();
  });
  it("restores a match report draft for the authenticated account", async () => {
    mockApi();
    render(
      <I18nProvider>
        <BugReportDialog signedIn accountId="match-account" matchLogId="match-example" onClose={() => undefined} />
      </I18nProvider>,
    );
    fill();
    await waitFor(() =>
      expect(localStorage.getItem("aegis.forum.draft:match-account:match-example")).toContain(
        "What I did and what happened",
      ),
    );
    cleanup();
    render(
      <I18nProvider>
        <BugReportDialog signedIn accountId="match-account" matchLogId="match-example" onClose={() => undefined} />
      </I18nProvider>,
    );
    expect((screen.getByLabelText("Your report") as HTMLTextAreaElement).value).toBe("What I did and what happened");
  });
  it("publishes text without exposing image attachment controls", async () => {
    const fetchMock = mockApi();
    const { container } = dialog();
    fill();
    expect(container.querySelector('input[type="file"]')).toBeNull();
    expect(screen.queryByRole("button", { name: "Add images" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Publish topic" }));
    await screen.findByText("Your topic has been published");
    expect(fetchMock.mock.calls.some(([path]) => String(path).includes("/images"))).toBe(false);
  });
});

describe("public forum hub", () => {
  it("loads public topics for guests and opens shareable topic links", async () => {
    const selected = vi.fn<() => void>();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              items: [
                {
                  id: 9,
                  kind: "bug",
                  summary: "Effect timing",
                  authorName: "Kai",
                  status: "new",
                  createdAt: Date.now(),
                  updatedAt: Date.now(),
                  supportCount: 3,
                  commentCount: 2,
                  supported: false,
                  following: false,
                  hidden: false,
                },
              ],
              nextOffset: null,
            }),
            { status: 200 },
          ),
      ),
    );
    render(
      <I18nProvider>
        <ForumScreen
          signedIn={false}
          isAdmin={false}
          onSelect={selected}
          onNew={vi.fn<() => void>()}
          onPrivate={vi.fn<() => void>()}
          onSignIn={vi.fn<() => void>()}
          onTriage={vi.fn<() => void>()}
        />
      </I18nProvider>,
    );
    const link = await screen.findByRole("link", { name: /Effect timing/ });
    expect(link.getAttribute("href")).toBe("/feedback/9");
    fireEvent.click(link);
    expect(selected).toHaveBeenCalledWith(9);
    await waitFor(() => expect(screen.getByRole("heading", { name: "Community hub" })).toBeTruthy());
  });
  it("renders Markdown without executable HTML or remote image tracking", () => {
    const { container } = render(
      <ForumMarkdown>
        {"<script>alert(1)</script>\n\n![tracker](https://example.com/tracker)\n\n[bad](javascript:alert(1))"}
      </ForumMarkdown>,
    );
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("a")?.getAttribute("href")).not.toContain("javascript:");
  });
});
