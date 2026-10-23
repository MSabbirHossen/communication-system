import { createBrowserRouter, createMemoryRouter, type RouteObject } from "react-router";
import { AppShell } from "./shell/AppShell";
import {
  ChatsScreen,
  NotFoundScreen,
  PeopleScreen,
  RouteErrorScreen,
  SettingsScreen,
  WelcomeScreen,
} from "./screens";
import { LoginScreen, PrivacyScreen, RegisterScreen } from "./screens/auth";
import { RedirectIfSignedIn, RequireSession } from "./session/SessionProvider";

export const routes: RouteObject[] = [
  {
    path: "/",
    element: (
      <RedirectIfSignedIn>
        <WelcomeScreen />
      </RedirectIfSignedIn>
    ),
    errorElement: <RouteErrorScreen />,
  },
  {
    path: "/login",
    element: (
      <RedirectIfSignedIn>
        <LoginScreen />
      </RedirectIfSignedIn>
    ),
    errorElement: <RouteErrorScreen />,
  },
  {
    path: "/register",
    element: (
      <RedirectIfSignedIn>
        <RegisterScreen />
      </RedirectIfSignedIn>
    ),
    errorElement: <RouteErrorScreen />,
  },
  { path: "/privacy", element: <PrivacyScreen />, errorElement: <RouteErrorScreen /> },
  {
    element: <RequireSession />,
    errorElement: <RouteErrorScreen />,
    children: [
      {
        element: <AppShell />,
        children: [
          { path: "/chats", element: <ChatsScreen /> },
          { path: "/people", element: <PeopleScreen /> },
          { path: "/settings", element: <SettingsScreen /> },
          { path: "*", element: <NotFoundScreen /> },
        ],
      },
    ],
  },
];

export const createAppRouter = () => createBrowserRouter(routes);
export const createTestRouter = (initialEntries: string[]) =>
  createMemoryRouter(routes, { initialEntries });
