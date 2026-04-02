import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import "./lib/analytics";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { ParticipantProvider } from "./contexts/ParticipantContext";
import { EventProvider } from "./contexts/EventContext";
import { WebSocketProvider } from "./contexts/WebSocketContext";
import AppRouter from "./router";

ReactDOM.createRoot(document.getElementById("root")!).render(
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
