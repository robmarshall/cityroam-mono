import React from "react";
import ReactDOM from "react-dom/client";
import { initSentry, sentryRootOptions } from "./lib/sentry";
import "./index.css";
import "./i18n";
import "./lib/analytics";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { ParticipantProvider } from "./contexts/ParticipantContext";
import { EventProvider } from "./contexts/EventContext";
import { WebSocketProvider } from "./contexts/WebSocketContext";
import AppRouter from "./router";

initSentry();

ReactDOM.createRoot(document.getElementById("root")!, sentryRootOptions()).render(
  <React.StrictMode>
    <ErrorBoundary>
      <ParticipantProvider>
        <EventProvider>
          <WebSocketProvider>
            <AppRouter />
          </WebSocketProvider>
        </EventProvider>
      </ParticipantProvider>
    </ErrorBoundary>
  </React.StrictMode>,
);
