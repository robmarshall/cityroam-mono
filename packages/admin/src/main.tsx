import React from "react";
import ReactDOM from "react-dom/client";
import { initSentry, sentryRootOptions } from "./lib/sentry";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { AuthProvider } from "./contexts/AuthContext";
import AppRouter from "./router";
import "./index.css";

initSentry();

ReactDOM.createRoot(document.getElementById("root")!, sentryRootOptions()).render(
  <React.StrictMode>
    <ErrorBoundary>
      <AuthProvider>
        <AppRouter />
      </AuthProvider>
    </ErrorBoundary>
  </React.StrictMode>,
);
