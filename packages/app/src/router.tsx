import { lazy, Suspense } from "react";
import {
  createBrowserRouter,
  Navigate,
  RouterProvider,
} from "react-router-dom";

const EntryPage = lazy(() => import("./pages/EntryPage"));
const JoinPage = lazy(() => import("./pages/JoinPage"));
const LobbyPage = lazy(() => import("./pages/LobbyPage"));
const ChatPage = lazy(() => import("./pages/ChatPage"));
const CompletePage = lazy(() => import("./pages/CompletePage"));

function SuspenseWrapper({ children }: { children: React.ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-svh items-center justify-center bg-white">
          <p className="text-system-text">Loading...</p>
        </div>
      }
    >
      {children}
    </Suspense>
  );
}

export const router = createBrowserRouter(
  [
    {
      path: "/",
      element: (
        <SuspenseWrapper>
          <EntryPage />
        </SuspenseWrapper>
      ),
    },
    {
      path: "event/:code",
      element: (
        <SuspenseWrapper>
          <JoinPage />
        </SuspenseWrapper>
      ),
    },
    {
      path: "event/:code/lobby",
      element: (
        <SuspenseWrapper>
          <LobbyPage />
        </SuspenseWrapper>
      ),
    },
    {
      path: "event/:code/play",
      element: (
        <SuspenseWrapper>
          <ChatPage />
        </SuspenseWrapper>
      ),
    },
    {
      path: "event/:code/complete",
      element: (
        <SuspenseWrapper>
          <CompletePage />
        </SuspenseWrapper>
      ),
    },
    {
      path: "*",
      element: <Navigate to="/" replace />,
    },
  ],
  { basename: "/app" },
);

export default function AppRouter() {
  return <RouterProvider router={router} />;
}
