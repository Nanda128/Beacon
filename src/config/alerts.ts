/**
 * Alert system configuration.
 *
 * Colour mapping follows EICAS / MIL-STD-1472H conventions:
 *   WARNING  (critical) is red
 *   CAUTION  (high)     is amber
 *   ADVISORY (medium)   is cyan
 *   STATUS   (low)      is green
 */

import type {AlertSeverity, AlertCategory} from "../domain/types/alert";

export type AlertSeverityStyle = {
    color: string;
    fill: string;
    border: string;
    pulseMs: number;
    label: string;
};

export const alertSeverityStyles: Record<AlertSeverity, AlertSeverityStyle> = {
    critical: {
        color: "#ef4444",
        fill: "rgba(239,68,68,0.25)",
        border: "rgba(239,68,68,0.6)",
        pulseMs: 400,
        label: "WARNING"
    },
    high: {
        color: "#f59e0b",
        fill: "rgba(245,158,11,0.20)",
        border: "rgba(245,158,11,0.5)",
        pulseMs: 700,
        label: "CAUTION"
    },
    medium: {
        color: "#38bdf8",
        fill: "rgba(56,189,248,0.15)",
        border: "rgba(56,189,248,0.4)",
        pulseMs: 1200,
        label: "ADVISORY"
    },
    low: {color: "#22c55e", fill: "rgba(34,197,94,0.12)", border: "rgba(34,197,94,0.35)", pulseMs: 0, label: "STATUS"},
};

export const alertCategoryLabels: Record<AlertCategory, string> = {
    "anomaly-detected": "Anomaly Detected",
    "low-battery": "Low Battery",
    "comm-degradation": "Comm Degradation",
    "drone-malfunction": "Drone Malfunction",
    "area-completion": "Area Complete",
};

export const alertAudioConfig = {
    critical: {frequency: 1200, duration: 0.25, repeat: 3, gap: 0.12},
    high: {frequency: 800, duration: 0.20, repeat: 2, gap: 0.15},
};

export const alertDeduplicationWindowMs = 5_000;

export const commDegradationDistanceMeters = 3_000;

export const alertLogLimit = 300;

