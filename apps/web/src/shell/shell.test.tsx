import { describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { applyTheme } from "./ThemeProvider";
import { ErrorBoundary } from "./ErrorBoundary";
import { mockViewport } from "../test/setup";
import { controllerIn, renderApp } from "../test/session";

async function renderAt(path: string) {
  return renderApp(path, await controllerIn("ready"));
}

describe("responsive shell", () => {
  it("renders a navigation rail and two panes at desktop width", async () => {
    mockViewport(true);
    await renderAt("/chats");
    expect(screen.getByRole("navigation", { name: "Primary" })).toHaveClass("nav--rail");
    expect(document.querySelector('[data-panes="2"]')).not.toBeNull();
    expect(screen.getByRole("region", { name: "Select a conversation" })).toBeInTheDocument();
  });
  it("renders bottom navigation and a single pane below the desktop breakpoint", async () => {
    mockViewport(false);
    await renderAt("/chats");
    expect(screen.getByRole("navigation", { name: "Primary" })).toHaveClass("nav--bottom");
    expect(document.querySelector('[data-panes="1"]')).not.toBeNull();
    expect(screen.queryByRole("region", { name: "Select a conversation" })).toBeNull();
  });
  it("every navigation item has an accessible name and the active one is marked", async () => {
    mockViewport(true);
    await renderAt("/people");
    for (const name of ["Chats", "People", "Settings"]) {
      expect(screen.getByRole("link", { name })).toBeInTheDocument();
    }
    expect(screen.getByRole("link", { name: "People" })).toHaveAttribute("aria-current", "page");
  });
  it("shows the not-found screen for unknown routes", async () => {
    await renderAt("/does-not-exist");
    expect(screen.getByRole("alert")).toHaveTextContent("Page not found");
  });
});

describe("offline state", () => {
  it("shows the offline banner when the browser goes offline", async () => {
    mockViewport(true);
    const online = vi.spyOn(navigator, "onLine", "get");
    online.mockReturnValue(true);
    await renderAt("/chats");
    expect(screen.queryByRole("status")).toBeNull();
    online.mockReturnValue(false);
    await act(async () => {
      window.dispatchEvent(new Event("offline"));
    });
    expect(screen.getByRole("status")).toHaveTextContent(/offline/i);
    online.mockRestore();
  });
});

describe("theme", () => {
  it("toggles data-theme on <html> and persists the preference", async () => {
    mockViewport(true);
    const user = userEvent.setup();
    await renderAt("/settings");
    expect(document.documentElement.dataset.theme).toBeUndefined();
    await user.click(screen.getByRole("radio", { name: "Dark" }));
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(window.localStorage.getItem("cs.theme")).toBe("dark");
    await user.click(screen.getByRole("radio", { name: "System" }));
    expect(document.documentElement.dataset.theme).toBeUndefined();
  });
  it("applyTheme removes the attribute for system", () => {
    applyTheme("light");
    expect(document.documentElement.dataset.theme).toBe("light");
    applyTheme("system");
    expect(document.documentElement.dataset.theme).toBeUndefined();
  });
});

describe("error boundary", () => {
  it("renders the error screen and logs without exposing the stack to the user", () => {
    const logger = { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn(), child: vi.fn() };
    const Boom = () => {
      throw new Error("render exploded");
    };
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <ErrorBoundary logger={logger as never}>
        <Boom />
      </ErrorBoundary>,
    );
    spy.mockRestore();
    expect(screen.getByRole("alert")).toHaveTextContent("Something went wrong");
    expect(screen.getByRole("alert")).not.toHaveTextContent("render exploded");
    expect(logger.error).toHaveBeenCalledWith(
      "render failed",
      expect.objectContaining({ error: expect.any(Error) }),
    );
  });
});
