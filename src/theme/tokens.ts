/**
 * Design-token system for Beacon.
 *
 * Light-mode default follows Piepenbrock et al. (2013) — positive-polarity
 * displays reduce error rates for sustained monitoring tasks.
 *
 * All text-on-background pairs meet WCAG 2.2 AA (≥4.5:1) or AAA (≥7:1).
 * Semantic status colours follow MIL-STD-1472H §5.2.3.4 conventions
 * (green = operational, amber = caution, red = critical).
 */

export type ThemeMode = "light" | "dark" | "auto";

export const STORAGE_KEY = "beacon:theme";

export const lightTokens: Record<string, string> = {
    "--color-bg": "#F5F7FA",
    "--color-bg-raised": "#FFFFFF",
    "--color-bg-inset": "#EEF1F6",
    "--color-bg-overlay": "rgba(255,255,255,0.92)",

    "--color-border": "#D1D5DB",
    "--color-border-subtle": "#E5E7EB",

    "--color-text": "#1E293B",
    "--color-text-secondary": "#475569",
    "--color-text-muted": "#64748B",

    "--color-primary": "#0D7377",
    "--color-primary-hover": "#0A5C5F",
    "--color-primary-text": "#FFFFFF",
    "--color-primary-ghost": "rgba(13,115,119,0.08)",

    "--color-success": "#16A34A",
    "--color-success-bg": "rgba(22,163,74,0.10)",
    "--color-success-border": "rgba(22,163,74,0.35)",
    "--color-success-text": "#15803D",

    "--color-warning": "#D97706",
    "--color-warning-bg": "rgba(217,119,6,0.10)",
    "--color-warning-border": "rgba(217,119,6,0.35)",
    "--color-warning-text": "#B45309",

    "--color-danger": "#DC2626",
    "--color-danger-bg": "rgba(220,38,38,0.10)",
    "--color-danger-border": "rgba(220,38,38,0.35)",
    "--color-danger-text": "#B91C1C",

    "--color-focus-ring": "#2563EB",

    "--color-accent-dot": "#0D9488",

    "--color-canvas-bg": "#0F172A",

    "--shadow-sm": "0 1px 2px rgba(0,0,0,0.05)",
    "--shadow-md": "0 4px 12px rgba(0,0,0,0.08)",
    "--shadow-lg": "0 10px 30px rgba(0,0,0,0.10)",

    "--color-drone-pill": "rgba(13,115,119,0.08)",
    "--color-drone-pill-border": "rgba(13,115,119,0.30)",
    "--color-drone-pill-active": "rgba(217,119,6,0.14)",
    "--color-drone-pill-active-border": "rgba(217,119,6,0.50)",
};

export const darkTokens: Record<string, string> = {
    "--color-bg": "#0B1324",
    "--color-bg-raised": "#162032",
    "--color-bg-inset": "#0F172A",
    "--color-bg-overlay": "rgba(15,23,42,0.92)",

    "--color-border": "rgba(255,255,255,0.10)",
    "--color-border-subtle": "rgba(255,255,255,0.06)",

    "--color-text": "#E2E8F0",
    "--color-text-secondary": "#CBD5E1",
    "--color-text-muted": "#94A3B8",

    "--color-primary": "#2DD4BF",
    "--color-primary-hover": "#5EEAD4",
    "--color-primary-text": "#0B1324",
    "--color-primary-ghost": "rgba(45,212,191,0.10)",

    "--color-success": "#4ADE80",
    "--color-success-bg": "rgba(74,222,128,0.12)",
    "--color-success-border": "rgba(74,222,128,0.35)",
    "--color-success-text": "#BBF7D0",

    "--color-warning": "#FBBF24",
    "--color-warning-bg": "rgba(251,191,36,0.12)",
    "--color-warning-border": "rgba(251,191,36,0.35)",
    "--color-warning-text": "#FDE68A",

    "--color-danger": "#F87171",
    "--color-danger-bg": "rgba(248,113,113,0.12)",
    "--color-danger-border": "rgba(248,113,113,0.35)",
    "--color-danger-text": "#FECDD3",

    "--color-focus-ring": "#60A5FA",

    "--color-accent-dot": "#2DD4BF",

    "--color-canvas-bg": "#0F172A",

    "--shadow-sm": "0 1px 3px rgba(0,0,0,0.25)",
    "--shadow-md": "0 4px 16px rgba(0,0,0,0.35)",
    "--shadow-lg": "0 12px 40px rgba(0,0,0,0.45)",

    "--color-drone-pill": "rgba(59,130,246,0.08)",
    "--color-drone-pill-border": "rgba(59,130,246,0.35)",
    "--color-drone-pill-active": "rgba(234,179,8,0.16)",
    "--color-drone-pill-active-border": "rgba(234,179,8,0.65)",
};
