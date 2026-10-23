import { createBrowserRouter, createMemoryRouter, type RouteObject } from "react-router";
import { AppShell } from "./shell/AppShell";
import { NotFoundScreen, RouteErrorScreen, SettingsScreen, WelcomeScreen } from "./screens";
import { LoginScreen, PrivacyScreen, RegisterScreen } from "./screens/auth";
import { ChatsScreen, NoConversationSelected } from "./screens/Chats";
import { ConversationScreen } from "./screens/Conversation";
import { ConversationDetailsScreen } from "./screens/ConversationDetails";
import { NewConversationScreen } from "./screens/NewConversation";
import { DevicesSecurityScreen } from "./screens/DevicesSecurity";
import { SecureDeviceSetupScreen } from "./screens/SecureDeviceSetup";
import { VerifyDeviceScreen, VerifyUserScreen } from "./screens/VerifyDevice";
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
              { path: "new", element: <NewConversationScreen /> },
              { path: ":roomId", element: <ConversationScreen /> },
              { path: ":roomId/details", element: <ConversationDetailsScreen /> },
              { path: ":roomId/verify", element: <VerifyUserScreen /> },
            ],
          },
          { path: "/people", element: <NewConversationScreen /> },
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
