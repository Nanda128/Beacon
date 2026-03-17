import type React from "react";
import {createContext, useCallback, useContext, useEffect, useMemo, useState} from "react";
import {darkTokens, lightTokens, STORAGE_KEY, type ThemeMode} from "./tokens";

type ThemeContextValue = {
    mode: ThemeMode;
    resolved: "light" | "dark";
    setMode: (mode: ThemeMode) => void;
};

const ThemeContext = createContext<ThemeContextValue>({
    mode: "auto",
    resolved: "light",
    setMode: () => {
    },
});

export const useTheme = () => useContext(ThemeContext);

function resolveMode(mode: ThemeMode): "light" | "dark" {
    if (mode !== "auto") return mode;
    if (typeof window === "undefined") return "light";
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTokens(resolved: "light" | "dark") {
    const root = document.documentElement;
    const tokens = resolved === "dark" ? darkTokens : lightTokens;
    Object.entries(tokens).forEach(([key, value]) => {
        root.style.setProperty(key, value);
    });
    root.setAttribute("data-theme", resolved);
    root.style.colorScheme = resolved;
}

export function ThemeProvider({children}: { children: React.ReactNode }) {
    const [mode, setModeState] = useState<ThemeMode>(() => {
        if (typeof window === "undefined") return "auto";
        const stored = localStorage.getItem(STORAGE_KEY) as ThemeMode | null;
        return stored === "light" || stored === "dark" || stored === "auto" ? stored : "auto";
    });

    const resolved = useMemo(() => resolveMode(mode), [mode]);

    const setMode = useCallback((next: ThemeMode) => {
        setModeState(next);
        localStorage.setItem(STORAGE_KEY, next);
    }, []);

    useEffect(() => {
        applyTokens(resolved);
    }, [resolved]);

    useEffect(() => {
        if (mode !== "auto") return;
        const mql = window.matchMedia("(prefers-color-scheme: dark)");
        const handler = () => applyTokens(resolveMode("auto"));
        mql.addEventListener("change", handler);
        return () => mql.removeEventListener("change", handler);
    }, [mode]);

    return (
        <ThemeContext.Provider value={{mode, resolved, setMode}}>
            {children}
        </ThemeContext.Provider>
    );
}

