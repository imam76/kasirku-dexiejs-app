// ThemeProvider.tsx
// Context + hook untuk switch light/dark theme di seluruh app

import { useState, useEffect, type ReactNode } from "react";
import { ConfigProvider, App } from "antd";
import { lightTheme, darkTheme, type ThemeMode } from "@/theme";
import { ThemeContext } from "@/hooks/useTheme";

// ── Provider ─────────────────────────────────────────────────
interface ThemeProviderProps {
  children: ReactNode;
  defaultMode?: ThemeMode;
  storageKey?: string; // localStorage key untuk persist
}

function ThemeProviderComponent({
  children,
  defaultMode = "light",
  storageKey = "kasir-theme-mode",
}: ThemeProviderProps) {
  const [mode, setModeState] = useState<ThemeMode>(() => {
    // Ambil dari localStorage kalau ada
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem(storageKey) as ThemeMode | null;
      if (saved === "light" || saved === "dark") return saved;
    }
    return defaultMode;
  });

  // Sync ke <html> class untuk custom CSS kalau dibutuhkan
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", mode);
    localStorage.setItem(storageKey, mode);
  }, [mode, storageKey]);

  const toggle = () => setModeState((prev) => (prev === "light" ? "dark" : "light"));
  const setMode = (m: ThemeMode) => setModeState(m);

  return (
    <ThemeContext.Provider value={{ mode, toggle, setMode, isDark: mode === "dark" }}>
      <ConfigProvider theme={mode === "dark" ? darkTheme : lightTheme}>
        <App>
          {children}
        </App>
      </ConfigProvider>
    </ThemeContext.Provider>
  );
}

export const ThemeProvider = ThemeProviderComponent;
