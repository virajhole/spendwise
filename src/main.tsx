import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import ErrorBoundary from "./components/ErrorBoundary";
import ToastHost from "./components/ToastHost";
import { AuthProvider } from "./auth/AuthProvider";
import "./index.css";
import { initSettings } from "./store/store";

function mount() {
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <ErrorBoundary>
        <AuthProvider>
          <BrowserRouter>
            <ToastHost />
            <App />
          </BrowserRouter>
        </AuthProvider>
      </ErrorBoundary>
    </React.StrictMode>,
  );
}

initSettings()
  .catch((e) => console.error("Settings init failed:", e))
  .finally(mount);
