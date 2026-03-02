import { createContext, useContext } from "react";
import { type ThemeMode } from "@/theme";

export interface ThemeContextValue {
  mode: ThemeMode;
  toggle: () => void;
  setMode: (mode: ThemeMode) => void;
  isDark: boolean;
}

export const ThemeContext = createContext<ThemeContextValue>({
  mode: "light",
  toggle: () => { },
  setMode: () => { },
  isDark: false,
});

export function useTheme() {
  return useContext(ThemeContext);
}
