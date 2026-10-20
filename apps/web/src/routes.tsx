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

export const routes: RouteObject[] = [
  { path: "/", element: <WelcomeScreen />, errorElement: <RouteErrorScreen /> },
  {
    element: <AppShell />,
    errorElement: <RouteErrorScreen />,
    children: [
      { path: "/chats", element: <ChatsScreen /> },
      { path: "/people", element: <PeopleScreen /> },
      { path: "/settings", element: <SettingsScreen /> },
      { path: "*", element: <NotFoundScreen /> },
    ],
  },
];

export const createAppRouter = () => createBrowserRouter(routes);
export const createTestRouter = (initialEntries: string[]) =>
  createMemoryRouter(routes, { initialEntries });
