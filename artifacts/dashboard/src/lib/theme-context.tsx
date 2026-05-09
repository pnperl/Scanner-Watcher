import { createContext, useContext, useEffect, useState } from "react";

export const themeOptions = [
  { value: "theme-bloomberg", label: "Bloomberg" },
  { value: "theme-emerald", label: "Emerald" },
  { value: "theme-amber", label: "Amber" },
  { value: "theme-cobalt", label: "Cobalt" },
] as const;

export type Theme = typeof themeOptions[number]["value"];

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.classList.remove(...themeOptions.map((o) => o.value));
  root.classList.add(theme);
}

interface ThemeContextValue {
  theme: Theme;
  setTheme: (t: Theme) => void;
  themeLabel: string;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => {
    const saved = localStorage.getItem("chartink-theme") as Theme | null;
    return saved && themeOptions.some((o) => o.value === saved) ? saved : "theme-bloomberg";
  });

  useEffect(() => {
    applyTheme(theme);
    localStorage.setItem("chartink-theme", theme);
  }, [theme]);

  const themeLabel = themeOptions.find((o) => o.value === theme)?.label ?? "Bloomberg";

  return (
    <ThemeContext.Provider value={{ theme, setTheme: setThemeState, themeLabel }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
