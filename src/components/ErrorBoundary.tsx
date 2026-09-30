import React from "react";

interface State {
  error: Error | null;
}

const container: React.CSSProperties = {
  minHeight: "100dvh",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: 16,
  padding: 24,
  textAlign: "center",
  fontFamily: "ui-sans-serif, system-ui, sans-serif",
  background: "#0f1115",
  color: "#e2e8f0",
};

const button: React.CSSProperties = {
  borderRadius: 12,
  padding: "10px 20px",
  fontSize: 14,
  fontWeight: 700,
  border: "none",
  cursor: "pointer",
  background: "#0ea5a4",
  color: "#fff",
};

const secondary: React.CSSProperties = {
  ...button,
  background: "#1e293b",
  color: "#cbd5e1",
};

/** Catches render/data errors and offers recovery instead of a white screen. */
export default class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    // eslint-disable-next-line no-console
    console.error("App crashed:", error);
  }

  private resetData = async () => {
    try {
      const Dexie = (await import("dexie")).default;
      await Dexie.delete("spendwise-db");
    } catch {
      /* ignore */
    }
    try {
      localStorage.removeItem("spendwise.pin");
      localStorage.removeItem("spendwise.theme");
      localStorage.removeItem("spendwise.currency");
    } catch {
      /* ignore */
    }
    location.reload();
  };

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div style={container} role="alert">
        <div style={{ fontSize: 40 }} aria-hidden>
          ⚠️
        </div>
        <h1 style={{ fontSize: 18, margin: 0 }}>Something went wrong</h1>
        <p style={{ fontSize: 13, color: "#94a3b8", maxWidth: 300, margin: 0 }}>
          {this.state.error.message || "An unexpected error occurred."}
        </p>
        <button style={button} onClick={() => location.reload()}>
          Reload app
        </button>
        <button style={secondary} onClick={() => void this.resetData()}>
          Reset app data
        </button>
        <p style={{ fontSize: 11, color: "#64748b", maxWidth: 280 }}>
          Reset deletes local expenses and settings on this device, then restarts the app.
        </p>
      </div>
    );
  }
}
