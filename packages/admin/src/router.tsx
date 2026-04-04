import { lazy, Suspense } from "react";
import {
  createBrowserRouter,
  Navigate,
  RouterProvider,
} from "react-router-dom";
import { useAuth } from "./contexts/AuthContext";
import AdminLayout from "./components/AdminLayout";

const LoginPage = lazy(() => import("./pages/LoginPage"));
const DashboardPage = lazy(() => import("./pages/DashboardPage"));
const EventsListPage = lazy(() => import("./pages/EventsListPage"));
const EventDetailPage = lazy(() => import("./pages/EventDetailPage"));
const RouteFamiliesPage = lazy(() => import("./pages/RouteFamiliesPage"));
const RouteFamilyDetailPage = lazy(
  () => import("./pages/RouteFamilyDetailPage"),
);
const RouteEditorPage = lazy(() => import("./pages/RouteEditorPage"));
const MessageBanksPage = lazy(() => import("./pages/MessageBanksPage"));

function SuspenseWrapper({ children }: { children: React.ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="flex h-full items-center justify-center">
          Loading...
        </div>
      }
    >
      {children}
    </Suspense>
  );
}

function ProtectedLayout() {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  return <AdminLayout />;
}

export const router = createBrowserRouter(
  [
    {
      path: "login",
      element: (
        <SuspenseWrapper>
          <LoginPage />
        </SuspenseWrapper>
      ),
    },
    {
      element: <ProtectedLayout />,
      children: [
        {
          index: true,
          element: <Navigate to="/dashboard" replace />,
        },
        {
          path: "dashboard",
          element: (
            <SuspenseWrapper>
              <DashboardPage />
            </SuspenseWrapper>
          ),
        },
        {
          path: "events",
          element: (
            <SuspenseWrapper>
              <EventsListPage />
            </SuspenseWrapper>
          ),
        },
        {
          path: "events/:id",
          element: (
            <SuspenseWrapper>
              <EventDetailPage />
            </SuspenseWrapper>
          ),
        },
        {
          path: "routes",
          element: (
            <SuspenseWrapper>
              <RouteFamiliesPage />
            </SuspenseWrapper>
          ),
        },
        {
          path: "routes/families/:familyId",
          element: (
            <SuspenseWrapper>
              <RouteFamilyDetailPage />
            </SuspenseWrapper>
          ),
        },
        {
          path: "routes/new",
          element: (
            <SuspenseWrapper>
              <RouteEditorPage />
            </SuspenseWrapper>
          ),
        },
        {
          path: "routes/:id",
          element: (
            <SuspenseWrapper>
              <RouteEditorPage />
            </SuspenseWrapper>
          ),
        },
        {
          path: "message-banks",
          element: (
            <SuspenseWrapper>
              <MessageBanksPage />
            </SuspenseWrapper>
          ),
        },
      ],
    },
    {
      path: "*",
      element: <Navigate to="/dashboard" replace />,
    },
  ],
);

export default function AppRouter() {
  return <RouterProvider router={router} />;
}
