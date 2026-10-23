import { createBrowserRouter, createMemoryRouter, type RouteObject } from "react-router";
import { AppShell } from "./shell/AppShell";
import {
  NotFoundScreen,
  PeopleScreen,
  RouteErrorScreen,
  SettingsScreen,
  WelcomeScreen,
} from "./screens";
import { LoginScreen, PrivacyScreen, RegisterScreen } from "./screens/auth";
import { ChatsScreen, NoConversationSelected } from "./screens/Chats";
import { PendingScreen } from "./screens/pending";
import { DevicesSecurityScreen } from "./screens/DevicesSecurity";
import { SecureDeviceSetupScreen } from "./screens/SecureDeviceSetup";
import { VerifyDeviceScreen } from "./screens/VerifyDevice";
import { RedirectIfSignedIn, RequireClient, RequireSession } from "./session/SessionProvider";

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
    element: <RequireClient />,
    errorElement: <RouteErrorScreen />,
    children: [{ path: "/setup", element: <SecureDeviceSetupScreen /> }],
  },
  {
    element: <RequireSession />,
    errorElement: <RouteErrorScreen />,
    children: [
      {
        element: <AppShell />,
        children: [
          {
            path: "/chats",
            element: <ChatsScreen />,
            children: [
              { index: true, element: <NoConversationSelected /> },
              { path: "new", element: <PendingScreen /> },
              { path: ":roomId", element: <PendingScreen /> },
            ],
          },
          { path: "/people", element: <PeopleScreen /> },
          { path: "/settings", element: <SettingsScreen /> },
          { path: "/settings/devices", element: <DevicesSecurityScreen /> },
          { path: "/settings/devices/verify/:deviceId", element: <VerifyDeviceScreen /> },
          { path: "*", element: <NotFoundScreen /> },
        ],
      },
    ],
  },
];

export const createAppRouter = () => createBrowserRouter(routes);
export const createTestRouter = (initialEntries: string[]) =>
  createMemoryRouter(routes, { initialEntries });
