import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import ErrorBoundary from "./components/ErrorBoundary";
import ToastHost from "./components/ToastHost";
import { AuthProvider } from "./auth/AuthProvider";
import "./index.css";
import { initSettings } from "./store/store";
import { initViewportHeight } from "./utils/viewport";

initViewportHeight();

function mount() {
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <ErrorBoundary>
        {/* AuthProvider sits inside the Router so it can navigate to the
            dashboard after OAuth redirects complete. */}
        <BrowserRouter>
          <AuthProvider>
            <ToastHost />
            <App />
          </AuthProvider>
        </BrowserRouter>
      </ErrorBoundary>
    </React.StrictMode>,
  );
}

initSettings()
  .catch((e) => console.error("Settings init failed:", e))
  .finally(mount);
