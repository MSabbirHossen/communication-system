import { describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AuthFailure } from "../matrix/errors";
import { controllerIn, renderApp, testSession } from "../test/session";

describe("login and registration screens", () => {
  it("Welcome links to register and login; a signed-in user is sent to chats", async () => {
    renderApp("/", await controllerIn("signed_out"));
    expect(screen.getByRole("link", { name: "Create account" })).toHaveAttribute(
      "href",
      "/register",
    );
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login");
    renderApp("/", await controllerIn("ready"));
    await waitFor(() =>
      expect(screen.getByRole("navigation", { name: "Primary" })).toBeInTheDocument(),
    );
  });

  it("protected routes redirect to login when signed out", async () => {
    renderApp("/chats", await controllerIn("signed_out"));
    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeInTheDocument();
  });

  it("validates fields inline before calling the server", async () => {
    const c = await controllerIn("signed_out");
    const spy = vi.spyOn(c, "signIn");
    renderApp("/login", c);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Username"), "Alice Upper");
    await user.type(screen.getByLabelText("Password"), "short");
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(screen.getAllByRole("alert").map((a) => a.textContent)).toEqual([
      "Use lowercase letters, digits and . _ = - / + only.",
      "Use at least 8 characters.",
    ]);
    expect(spy).not.toHaveBeenCalled();
  });

  it("shows a password toggle and a generic error on bad credentials", async () => {
    const c = await controllerIn("signed_out", {
      login: vi.fn(async () => {
        throw new AuthFailure({ code: "invalid_credentials" });
      }),
    });
    renderApp("/login", c);
    const user = userEvent.setup();
    const pw = screen.getByLabelText("Password");
    expect(pw).toHaveAttribute("type", "password");
    await user.click(screen.getByRole("button", { name: "Show password" }));
    expect(pw).toHaveAttribute("type", "text");
    await user.type(screen.getByLabelText("Username"), "alice");
    await user.type(pw, "wrong-password-value");
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Sign-in failed. Check your username and password.",
    );
    expect(document.body.textContent).not.toContain("wrong-password-value");
  });

  it("shows retry-after seconds when rate limited", async () => {
    const c = await controllerIn("signed_out", {
      register: vi.fn(async () => {
        throw new AuthFailure({ code: "rate_limited", retryAfterMs: 4200 });
      }),
    });
    renderApp("/register", c);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Username"), "alice");
    await user.type(screen.getByLabelText("Password"), "correct horse battery");
    await user.click(screen.getByRole("button", { name: "Create account" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Try again in 5 seconds.");
  });

  it("navigates to chats after a successful sign-in", async () => {
    const c = await controllerIn("signed_out");
    renderApp("/login", c);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Username"), "alice");
    await user.type(screen.getByLabelText("Password"), "correct horse battery");
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(() =>
      expect(screen.getByRole("navigation", { name: "Primary" })).toBeInTheDocument(),
    );
    expect(c.getSnapshot().session).toEqual(testSession);
  });

  it("Settings shows the account and signs out to the welcome screen", async () => {
    const c = await controllerIn("ready");
    renderApp("/settings", c);
    expect(await screen.findByText("@alice:localhost")).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: "Sign out of this device" }));
    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeInTheDocument();
  });
});
