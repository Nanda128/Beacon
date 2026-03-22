import type {MissionMetricsSession, MissionMetricsSummary} from "../domain/types/metrics";

export type DashboardSummaryMetricView = {
    id: string;
    label: string;
    value: number | null;
    displayValue: string;
};

const formatPercent = (value: number, digits = 1) => `${value.toFixed(digits)}%`;
const formatPerMinute = (value: number) => `${value.toFixed(2)}/min`;

const formatDuration = (ms?: number) => {
    if (ms == null || !Number.isFinite(ms)) return "N/A";
    if (ms < 1000) return `${Math.round(ms)} ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)} s`;
    return `${(ms / 60000).toFixed(1)} min`;
};

export function buildDashboardSummaryMetrics(summary: MissionMetricsSummary): DashboardSummaryMetricView[] {
    const falseContacts = summary.falsePositiveCount + summary.falseNegativeCount;
    const batterySafetyEvents = summary.batteryWarningCount + summary.batteryEmergencyCount;

    return [
        {
            id: "detection-rate",
            label: "Detection rate",
            value: summary.anomaliesDetectedPct,
            displayValue: formatPercent(summary.anomaliesDetectedPct),
        },
        {
            id: "time-to-first-detection",
            label: "Time to first detection",
            value: summary.timeToFirstDetectionMs ?? null,
            displayValue: formatDuration(summary.timeToFirstDetectionMs),
        },
        {
            id: "coverage",
            label: "Coverage",
            value: summary.coveragePct,
            displayValue: formatPercent(summary.coveragePct),
        },
        {
            id: "alerts-per-minute",
            label: "Alerts per minute",
            value: summary.alertBurdenPerMin,
            displayValue: formatPerMinute(summary.alertBurdenPerMin),
        },
        {
            id: "manual-commands-per-minute",
            label: "Manual commands per minute",
            value: summary.manualCommandsPerMin,
            displayValue: formatPerMinute(summary.manualCommandsPerMin),
        },
        {
            id: "comms-uptime",
            label: "Comms uptime",
            value: summary.commsConnectedPct,
            displayValue: formatPercent(summary.commsConnectedPct),
        },
        {
            id: "false-contacts",
            label: "False contacts",
            value: falseContacts,
            displayValue: String(falseContacts),
        },
        {
            id: "battery-safety-events",
            label: "Battery safety events",
            value: batterySafetyEvents,
            displayValue: String(batterySafetyEvents),
        },
    ];
}

export function getDashboardSummaryFromSession(session: MissionMetricsSession): DashboardSummaryMetricView[] {
    return buildDashboardSummaryMetrics(session.summary);
}


