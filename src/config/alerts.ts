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
        color: "var(--color-danger)",
        fill: "var(--color-danger-bg)",
        border: "var(--color-danger-border)",
        pulseMs: 400,
        label: "WARNING"
    },
    high: {
        color: "var(--color-warning)",
        fill: "var(--color-warning-bg)",
        border: "var(--color-warning-border)",
        pulseMs: 700,
        label: "CAUTION"
    },
    medium: {
        color: "var(--color-primary)",
        fill: "var(--color-primary-ghost)",
        border: "var(--color-border-subtle)",
        pulseMs: 1200,
        label: "ADVISORY"
    },
    low: {color: "var(--color-success)", fill: "var(--color-success-bg)", border: "var(--color-success-border)", pulseMs: 0, label: "STATUS"},
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

