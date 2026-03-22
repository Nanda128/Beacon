import type {MissionMetricsSession} from "../domain/types/metrics";
import {roundMetricsSession} from "../domain/metrics/collector";
import type {NasaTlxAssessment} from "../domain/types/tlx";
import {getDashboardSummaryFromSession} from "./dashboardMetrics";

const escapeCsv = (value: unknown) => {
    const stringValue = value == null ? "" : String(value);
    if (/[,"\n]/.test(stringValue)) {
        return `"${stringValue.replace(/"/g, '""')}"`;
    }
    return stringValue;
};

const downloadBlob = (content: string, filename: string, mimeType: string) => {
    const blob = new Blob([content], {type: mimeType});
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
};

const summaryRows = (session: MissionMetricsSession) => {
    const roundedSession = roundMetricsSession(session);
    const dashboardSummary = getDashboardSummaryFromSession(roundedSession);
    return [
        ["metricId", "metric", "value", "displayValue"],
        ...dashboardSummary.map((metric) => [metric.id, metric.label, metric.value ?? "", metric.displayValue]),
    ];
};

const rowsToCsv = (rows: unknown[][]) => rows.map((row) => row.map(escapeCsv).join(",")).join("\n");

export function createMissionMetricsExport(session: MissionMetricsSession) {
    const roundedSession = roundMetricsSession(session);
    return {
        exportedAt: new Date().toISOString(),
        session: roundedSession,
        dashboardSummary: getDashboardSummaryFromSession(roundedSession),
    };
}

export type CombinedDebriefExport = {
    exportedAt: string;
    mission: ReturnType<typeof createMissionMetricsExport>;
    nasaTlx?: NasaTlxAssessment;
};

export function createCombinedDebriefExport(session: MissionMetricsSession, nasaTlx?: NasaTlxAssessment): CombinedDebriefExport {
    return {
        exportedAt: new Date().toISOString(),
        mission: createMissionMetricsExport(session),
        nasaTlx,
    };
}

export function downloadMissionMetricsJSON(session: MissionMetricsSession) {
    const exportPayload = createMissionMetricsExport(session);
    downloadBlob(
        JSON.stringify(exportPayload, null, 2),
        `metrics-${session.scenarioName.replace(/\s+/g, "-").toLowerCase()}-${session.sessionId}.json`,
        "application/json",
    );
}

export function downloadMissionMetricsSummaryCSV(session: MissionMetricsSession) {
    downloadBlob(
        rowsToCsv(summaryRows(session)),
        `metrics-summary-${session.sessionId}.csv`,
        "text/csv;charset=utf-8",
    );
}

export function downloadMissionMetricsTimelineCSV(session: MissionMetricsSession) {
    const timeline = roundMetricsSession(session).timeline;
    const rows: unknown[][] = [[
        "timestamp",
        "elapsedMs",
        "detectedPct",
        "weightedDetectionPct",
        "avgScanCertaintyPct",
        "coveragePct",
        "connectedPct",
        "avgSignalQualityPct",
        "unacknowledgedAlerts",
        "operatorLoadIndex",
        "manualCommandsPerMin",
        "alertBurdenPerMin",
        "packetDropPct",
        "avgQueueDepth",
        "avgLatencyMs",
        "falsePositiveCount",
        "falseNegativeCount",
    ]];

    timeline.forEach((sample) => {
        rows.push([
            sample.timestamp,
            sample.elapsedMs,
            sample.detectedPct,
            sample.weightedDetectionPct,
            sample.avgScanCertaintyPct,
            sample.coveragePct,
            sample.connectedPct,
            sample.avgSignalQualityPct,
            sample.unacknowledgedAlerts,
            sample.operatorLoadIndex,
            sample.manualCommandsPerMin,
            sample.alertBurdenPerMin,
            sample.packetDropPct,
            sample.avgQueueDepth,
            sample.avgLatencyMs,
            sample.falsePositiveCount,
            sample.falseNegativeCount,
        ]);
    });

    downloadBlob(rowsToCsv(rows), `metrics-timeline-${session.sessionId}.csv`, "text/csv;charset=utf-8");
}

export function downloadMissionMetricsEventsCSV(session: MissionMetricsSession) {
    const events = roundMetricsSession(session).events;
    const rows: unknown[][] = [[
        "timestamp",
        "elapsedMs",
        "type",
        "label",
        "value",
        "droneId",
        "anomalyId",
        "severity",
    ]];

    [...events].reverse().forEach((event) => {
        rows.push([
            event.timestamp,
            event.elapsedMs,
            event.type,
            event.label,
            event.value ?? "",
            event.droneId ?? "",
            event.anomalyId ?? "",
            event.severity ?? "",
        ]);
    });

    downloadBlob(rowsToCsv(rows), `metrics-events-${session.sessionId}.csv`, "text/csv;charset=utf-8");
}

export function downloadCombinedDebriefJSON(session: MissionMetricsSession, nasaTlx?: NasaTlxAssessment) {
    const payload = createCombinedDebriefExport(session, nasaTlx);
    downloadBlob(
        JSON.stringify(payload, null, 2),
        `debrief-report-${session.sessionId}.json`,
        "application/json",
    );
}

export function downloadCombinedDebriefCSV(session: MissionMetricsSession, nasaTlx?: NasaTlxAssessment) {
    const rows: unknown[][] = [["section", "metricId", "metric", "value", "displayValue"]];

    rows.push(["mission-info", "session-id", "Session ID", session.sessionId, session.sessionId]);
    rows.push(["mission-info", "scenario-name", "Scenario", session.scenarioName, session.scenarioName]);
    rows.push(["mission-info", "seed", "Seed", session.seed, session.seed]);

    summaryRows(session).slice(1).forEach(([metricId, metric, value, displayValue]) => {
        rows.push(["mission-metric", metricId, metric, value, displayValue]);
    });

    if (!nasaTlx) {
        rows.push(["nasa-tlx", "status", "Status", "skipped", "skipped"]);
    } else {
        rows.push(["nasa-tlx", "status", "Status", "completed", "completed"]);
        rows.push(["nasa-tlx", "mode", "Mode", nasaTlx.mode, nasaTlx.mode]);
        rows.push(["nasa-tlx", "completed-at", "Completed at", new Date(nasaTlx.completedAt).toISOString(), new Date(nasaTlx.completedAt).toISOString()]);
        rows.push(["nasa-tlx", "weighted-score", "Weighted score", nasaTlx.result.weightedScore, nasaTlx.result.weightedScore]);
        rows.push(["nasa-tlx", "weighted-band", "Weighted band", nasaTlx.result.band, nasaTlx.result.band]);
        rows.push(["nasa-tlx", "pair-count", "Pair count", nasaTlx.result.pairCount, nasaTlx.result.pairCount]);

        nasaTlx.result.dimensions.forEach((dimension) => {
            rows.push(["nasa-tlx-dimension", dimension.id, dimension.label, dimension.value, dimension.value]);
        });

        nasaTlx.result.weights.forEach((weight) => {
            rows.push(["nasa-tlx-weight", weight.id, weight.id, weight.weight, weight.weight]);
        });
    }

    downloadBlob(rowsToCsv(rows), `debrief-report-${session.sessionId}.csv`, "text/csv;charset=utf-8");
}

