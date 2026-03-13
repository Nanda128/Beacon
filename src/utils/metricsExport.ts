import type {MissionMetricsExport, MissionMetricsSession} from "../domain/types/metrics";
import {roundMetricsSession} from "../domain/metrics/collector";

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
    const summary = roundMetricsSession(session).summary;
    return [
        ["metric", "value"],
        ["sessionId", session.sessionId],
        ["scenarioName", session.scenarioName],
        ["seed", session.seed],
        ["missionDurationMs", summary.missionDurationMs],
        ["anomaliesDetected", summary.anomaliesDetected],
        ["totalRealAnomalies", summary.totalRealAnomalies],
        ["anomaliesDetectedPct", summary.anomaliesDetectedPct],
        ["weightedDetectionPct", summary.weightedDetectionPct],
        ["timeToFirstDetectionMs", summary.timeToFirstDetectionMs ?? ""],
        ["meanDetectionOpportunityLatencyMs", summary.meanDetectionOpportunityLatencyMs ?? ""],
        ["falsePositiveCount", summary.falsePositiveCount],
        ["falseNegativeCount", summary.falseNegativeCount],
        ["falseContactRate", summary.falseContactRate],
        ["avgScanCertaintyPct", summary.avgScanCertaintyPct],
        ["coveragePct", summary.coveragePct],
        ["areaCoveredSqKm", summary.areaCoveredSqKm],
        ["avgCoverageVisitsPerVisitedCell", summary.avgCoverageVisitsPerVisitedCell],
        ["alertCount", summary.alertCount],
        ["alertBurdenPerMin", summary.alertBurdenPerMin],
        ["peakUnacknowledgedAlerts", summary.peakUnacknowledgedAlerts],
        ["avgAckLatencyMs", summary.avgAckLatencyMs ?? ""],
        ["manualCommandCount", summary.manualCommandCount],
        ["manualCommandsPerMin", summary.manualCommandsPerMin],
        ["manualControlPct", summary.manualControlPct],
        ["operatorLoadIndex", summary.operatorLoadIndex],
        ["operatorLoadPeak", summary.operatorLoadPeak],
        ["commsConnectedPct", summary.commsConnectedPct],
        ["commsDisruptionPct", summary.commsDisruptionPct],
        ["packetDropPct", summary.packetDropPct],
        ["avgQueueDepth", summary.avgQueueDepth],
        ["avgLatencyMs", summary.avgLatencyMs],
        ["batteryWarningCount", summary.batteryWarningCount],
        ["batteryEmergencyCount", summary.batteryEmergencyCount],
        ["missionSuccessIndex", summary.missionSuccessIndex],
    ];
};

const rowsToCsv = (rows: unknown[][]) => rows.map((row) => row.map(escapeCsv).join(",")).join("\n");

export function createMissionMetricsExport(session: MissionMetricsSession): MissionMetricsExport {
    return {
        exportedAt: new Date().toISOString(),
        session: roundMetricsSession(session),
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

