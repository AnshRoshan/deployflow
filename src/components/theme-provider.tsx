"use client";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { Moon, Sun } from "lucide-react";

export type Theme = "light" | "dark" | "system";
type Resolved = "light" | "dark";
type ThemeContextType = {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  resolvedTheme: Resolved;
  toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeContextType | null>(null);
const KEY = "df_theme";

function systemTheme(): Resolved {
  return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}
function resolve(theme: Theme): Resolved { return theme === "system" ? systemTheme() : theme; }
function apply(theme: Theme) {
  if (typeof document === "undefined") return;
  const resolved = resolve(theme);
  document.documentElement.setAttribute("data-theme", resolved);
  document.documentElement.classList.toggle("dark", resolved === "dark");
  document.documentElement.style.colorScheme = resolved;
}

// Runs before React hydrates so the first paint already has the right palette.
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem('${KEY}')||'system';var d=t==='dark'||(t==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.setAttribute('data-theme',d?'dark':'light');document.documentElement.classList.toggle('dark',d);document.documentElement.style.colorScheme=d?'dark':'light';}catch(e){document.documentElement.setAttribute('data-theme','light');}})();`;

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("system");
  const [resolvedTheme, setResolvedTheme] = useState<Resolved>("light");

  useEffect(() => {
    const stored = localStorage.getItem(KEY) as Theme | null;
    const initial = stored && ["light", "dark", "system"].includes(stored) ? stored : "system";
    setThemeState(initial);
    setResolvedTheme(resolve(initial));
    apply(initial);
  }, []);

  useEffect(() => {
    if (theme !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => { const next = media.matches ? "dark" : "light"; setResolvedTheme(next); apply("system"); };
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [theme]);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    setResolvedTheme(resolve(next));
    apply(next);
    try { localStorage.setItem(KEY, next); } catch { /* storage can be blocked in iframes */ }
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(resolve(theme) === "dark" ? "light" : "dark");
  }, [setTheme, theme]);

  return <ThemeContext.Provider value={{ theme, setTheme, resolvedTheme, toggleTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used within a ThemeProvider");
  return context;
}

export function ThemeToggle({ className = "" }: { className?: string }) {
  const { resolvedTheme, toggleTheme } = useTheme();
  return (
    <button
      type="button"
      className={`icon-button theme-toggle ${className}`}
      onClick={toggleTheme}
      aria-label={resolvedTheme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
      title={resolvedTheme === "dark" ? "Light mode" : "Dark mode"}
    >
      <Moon size={16} className="icon-moon" />
      <Sun size={16} className="icon-sun" />
    </button>
  );
}
