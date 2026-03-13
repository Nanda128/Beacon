import type {Alert, AlertSeverity} from "../types/alert";
import type {DroneState} from "../types/drone";
import type {MaritimeScenario, SectorBounds} from "../types/environment";
import {
    anomalyPriorityWeights,
    type CoverageHeatmapGrid,
    type MetricsSampleInput,
    type MissionMetricsEvent,
    type MissionMetricsSession,
    type MissionMetricsSummary,
    operationalMetricCatalog,
} from "../types/metrics";

type RealAnomaly = MaritimeScenario["anomalies"]["items"][number] & {
    type: keyof typeof anomalyPriorityWeights;
};

const coverageCellSizeMeters = 250;
const maxTimelineSamples = 240;
const maxMetricEvents = 200;

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const round2 = (value: number) => Math.round(value * 100) / 100;

const average = (values: number[]) => values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;

const buildCoverageGrid = (scenario: MaritimeScenario): CoverageHeatmapGrid => {
    const {widthMeters, heightMeters} = scenario.sector.bounds;
    const cols = Math.max(1, Math.ceil(widthMeters / coverageCellSizeMeters));
    const rows = Math.max(1, Math.ceil(heightMeters / coverageCellSizeMeters));
    const totalCells = cols * rows;
    return {
        cellSizeMeters: coverageCellSizeMeters,
        cols,
        rows,
        totalCells,
        visitedCells: 0,
        maxVisitCount: 0,
        visits: Array.from({length: totalCells}, () => 0),
    };
};

const buildInitialSummary = (scenario: MaritimeScenario): MissionMetricsSummary => ({
    missionDurationMs: 0,
    anomaliesDetected: 0,
    totalRealAnomalies: scenario.anomalies.items.filter((item) => item.type !== "false-positive").length,
    anomaliesDetectedPct: 0,
    weightedDetectionPct: 0,
    falsePositiveCount: 0,
    falseNegativeCount: 0,
    falseContactRate: 0,
    avgScanCertaintyPct: 0,
    coveragePct: 0,
    areaCoveredSqKm: 0,
    avgCoverageVisitsPerVisitedCell: 0,
    alertCount: 0,
    alertBurdenPerMin: 0,
    peakUnacknowledgedAlerts: 0,
    manualCommandCount: 0,
    manualCommandsPerMin: 0,
    manualControlPct: 0,
    operatorLoadIndex: 0,
    operatorLoadPeak: 0,
    commsConnectedPct: 100,
    commsDisruptionPct: 0,
    packetDropPct: 0,
    avgQueueDepth: 0,
    avgLatencyMs: 0,
    batteryWarningCount: 0,
    batteryEmergencyCount: 0,
    missionSuccessIndex: 0,
});

const createMetricEvent = (
    session: MissionMetricsSession,
    type: MissionMetricsEvent["type"],
    timestamp: number,
    label: string,
    options: Partial<Omit<MissionMetricsEvent, "id" | "type" | "timestamp" | "elapsedMs" | "label">> = {},
): MissionMetricsEvent => ({
    id: `${type}-${timestamp}-${session.events.length + 1}`,
    type,
    timestamp,
    elapsedMs: Math.max(0, timestamp - session.startedAt),
    label,
    ...options,
});

const appendEvent = (session: MissionMetricsSession, event: MissionMetricsEvent): MissionMetricsSession => ({
    ...session,
    updatedAt: Math.max(session.updatedAt, event.timestamp),
    events: [event, ...session.events].slice(0, maxMetricEvents),
});

const isRealAnomaly = (item: MaritimeScenario["anomalies"]["items"][number]): item is RealAnomaly => item.type !== "false-positive";

const getRealAnomalies = (scenario: MaritimeScenario) => scenario.anomalies.items.filter(isRealAnomaly);

const getDetectedStats = (scenario: MaritimeScenario) => {
    const realItems = getRealAnomalies(scenario);
    const detectedItems = realItems.filter((item) => item.detected);
    const weightedDetected = detectedItems.reduce((sum, item) => sum + anomalyPriorityWeights[item.type], 0);
    const weightedTotal = realItems.reduce((sum, item) => sum + anomalyPriorityWeights[item.type], 0);
    return {
        detectedCount: detectedItems.length,
        totalCount: realItems.length,
        weightedDetected,
        weightedTotal,
        avgCertaintyPct: realItems.length > 0
            ? average(realItems.map((item) => (item.scanCertainty ?? 0) * 100))
            : 0,
    };
};

const markCoverageVisited = (
    coverage: CoverageHeatmapGrid,
    bounds: SectorBounds,
    drones: DroneState[],
    sensorRangeMeters: number,
): CoverageHeatmapGrid => {
    if (drones.length === 0 || sensorRangeMeters <= 0 || coverage.totalCells === 0) return coverage;

    const {origin} = bounds;
    const {cellSizeMeters, cols, rows} = coverage;
    let visits = coverage.visits;
    let changed = false;
    let visitedCells = coverage.visitedCells;
    let maxVisitCount = coverage.maxVisitCount;

    drones.forEach((drone) => {
        const minCol = Math.max(0, Math.floor((drone.position.x - sensorRangeMeters - origin.x) / cellSizeMeters));
        const maxCol = Math.min(cols - 1, Math.floor((drone.position.x + sensorRangeMeters - origin.x) / cellSizeMeters));
        const minRow = Math.max(0, Math.floor((drone.position.y - sensorRangeMeters - origin.y) / cellSizeMeters));
        const maxRow = Math.min(rows - 1, Math.floor((drone.position.y + sensorRangeMeters - origin.y) / cellSizeMeters));

        for (let row = minRow; row <= maxRow; row += 1) {
            for (let col = minCol; col <= maxCol; col += 1) {
                const centerX = origin.x + col * cellSizeMeters + cellSizeMeters / 2;
                const centerY = origin.y + row * cellSizeMeters + cellSizeMeters / 2;
                if (Math.hypot(centerX - drone.position.x, centerY - drone.position.y) > sensorRangeMeters) continue;
                if (!changed) {
                    visits = [...coverage.visits];
                    changed = true;
                }
                const index = row * cols + col;
                const nextVisitCount = visits[index] + 1;
                if (visits[index] === 0) visitedCells += 1;
                visits[index] = nextVisitCount;
                if (nextVisitCount > maxVisitCount) maxVisitCount = nextVisitCount;
            }
        }
    });

    if (!changed) return coverage;
    return {
        ...coverage,
        visits,
        visitedCells,
        maxVisitCount,
    };
};

const computeOperatorLoadIndex = (input: {
    unacknowledgedAlerts: number;
    criticalAlertCount: number;
    alertBurdenPerMin: number;
    avgAckLatencyMs?: number;
    manualCommandsPerMin: number;
    connectedPct: number;
    batteryEmergencyCount: number;
}) => {
    const unresolvedPressure = clamp01(input.unacknowledgedAlerts / 6);
    const criticalPressure = clamp01(input.criticalAlertCount / 3);
    const alertRatePressure = clamp01(input.alertBurdenPerMin / 12);
    const ackPressure = clamp01((input.avgAckLatencyMs ?? 0) / 60000);
    const manualPressure = clamp01(input.manualCommandsPerMin / 10);
    const commsPressure = clamp01((100 - input.connectedPct) / 100);
    const safetyPressure = clamp01(input.batteryEmergencyCount / 3);

    return Math.round(clamp01(
        unresolvedPressure * 0.22 +
        criticalPressure * 0.14 +
        alertRatePressure * 0.14 +
        ackPressure * 0.12 +
        manualPressure * 0.15 +
        commsPressure * 0.13 +
        safetyPressure * 0.10,
    ) * 100);
};

const buildSummary = (
    session: MissionMetricsSession,
    scenario: MaritimeScenario,
    latest: {
        now: number;
        connectedPct: number;
        operatorLoadIndex: number;
        avgQueueDepth: number;
        avgLatencyMs: number;
        avgScanCertaintyPct: number;
    },
): MissionMetricsSummary => {
    const durationMs = Math.max(0, latest.now - session.startedAt);
    const durationMinutes = durationMs > 0 ? durationMs / 60000 : 0;
    const {detectedCount, totalCount, weightedDetected, weightedTotal} = getDetectedStats(scenario);
    const coveragePct = session.coverage.totalCells > 0 ? (session.coverage.visitedCells / session.coverage.totalCells) * 100 : 0;
    const totalCoverageVisits = session.coverage.visits.reduce((sum, value) => sum + value, 0);
    const avgCoverageVisitsPerVisitedCell = session.coverage.visitedCells > 0
        ? totalCoverageVisits / session.coverage.visitedCells
        : 0;
    const alertBurdenPerMin = durationMinutes > 0 ? session.counters.alertCount / durationMinutes : 0;
    const manualCommandsPerMin = durationMinutes > 0 ? session.counters.manualCommandCount / durationMinutes : 0;
    const avgAckLatencyMs = session.counters.ackCount > 0 ? session.counters.ackLatencyTotalMs / session.counters.ackCount : undefined;
    const packetDropPct = session.counters.packetAttempts > 0
        ? (session.counters.packetDroppedCount / session.counters.packetAttempts) * 100
        : 0;
    const commsConnectedPct = session.counters.droneObservedTimeMs > 0
        ? (session.counters.connectedDroneTimeMs / session.counters.droneObservedTimeMs) * 100
        : 100;
    const falseContactRate = detectedCount + session.counters.falsePositiveCount > 0
        ? session.counters.falsePositiveCount / (detectedCount + session.counters.falsePositiveCount)
        : 0;
    const missionSuccessIndex = Math.round(clamp01(
        (weightedTotal > 0 ? weightedDetected / weightedTotal : 0) * 0.55 +
        (coveragePct / 100) * 0.20 +
        (1 - falseContactRate) * 0.10 +
        (1 - latest.operatorLoadIndex / 100) * 0.15,
    ) * 100);

    return {
        missionDurationMs: durationMs,
        anomaliesDetected: detectedCount,
        totalRealAnomalies: totalCount,
        anomaliesDetectedPct: totalCount > 0 ? (detectedCount / totalCount) * 100 : 0,
        weightedDetectionPct: weightedTotal > 0 ? (weightedDetected / weightedTotal) * 100 : 0,
        timeToFirstDetectionMs: session.counters.timeToFirstDetectionMs,
        meanDetectionOpportunityLatencyMs: session.counters.detectionOpportunityCount > 0
            ? session.counters.detectionOpportunityLatencyTotalMs / session.counters.detectionOpportunityCount
            : undefined,
        falsePositiveCount: session.counters.falsePositiveCount,
        falseNegativeCount: session.counters.falseNegativeCount,
        falseContactRate,
        avgScanCertaintyPct: latest.avgScanCertaintyPct,
        coveragePct,
        areaCoveredSqKm: (session.coverage.visitedCells * Math.pow(session.coverage.cellSizeMeters, 2)) / 1_000_000,
        avgCoverageVisitsPerVisitedCell,
        alertCount: session.counters.alertCount,
        alertBurdenPerMin,
        peakUnacknowledgedAlerts: session.counters.peakUnacknowledgedAlerts,
        avgAckLatencyMs,
        manualCommandCount: session.counters.manualCommandCount,
        manualCommandsPerMin,
        manualControlPct: durationMs > 0 ? (session.counters.manualControlEnabledMs / durationMs) * 100 : 0,
        operatorLoadIndex: latest.operatorLoadIndex,
        operatorLoadPeak: session.counters.operatorLoadPeak,
        commsConnectedPct,
        commsDisruptionPct: 100 - commsConnectedPct,
        packetDropPct,
        avgQueueDepth: session.counters.queueDepthSamples > 0 ? session.counters.queueDepthTotal / session.counters.queueDepthSamples : latest.avgQueueDepth,
        avgLatencyMs: session.counters.latencySamples > 0 ? session.counters.latencyTotalMs / session.counters.latencySamples : latest.avgLatencyMs,
        batteryWarningCount: session.counters.batteryWarningCount,
        batteryEmergencyCount: session.counters.batteryEmergencyCount,
        missionSuccessIndex,
    };
};

export function createMissionMetricsSession(scenario: MaritimeScenario, startedAt = Date.now()): MissionMetricsSession {
    const anomalyStates = getRealAnomalies(scenario).reduce<MissionMetricsSession["anomalyStates"]>((acc, item) => {
        acc[item.id] = {
            anomalyId: item.id,
            type: item.type,
            weight: anomalyPriorityWeights[item.type],
        };
        return acc;
    }, {});

    const totalWeightedAnomalyScore = Object.values(anomalyStates).reduce((sum, item) => sum + item.weight, 0);

    const session: MissionMetricsSession = {
        schemaVersion: 1,
        sessionId: `${scenario.seed}-${startedAt}`,
        startedAt,
        updatedAt: startedAt,
        scenarioName: scenario.name,
        seed: scenario.seed,
        sectorAreaSqKm: (scenario.sector.bounds.widthMeters * scenario.sector.bounds.heightMeters) / 1_000_000,
        metricCatalog: operationalMetricCatalog,
        totalRealAnomalies: Object.keys(anomalyStates).length,
        totalWeightedAnomalyScore,
        coverage: buildCoverageGrid(scenario),
        anomalyStates,
        counters: {
            falsePositiveCount: 0,
            falseNegativeCount: 0,
            alertCount: 0,
            ackCount: 0,
            ackLatencyTotalMs: 0,
            peakUnacknowledgedAlerts: 0,
            manualCommandCount: 0,
            manualControlEnabledMs: 0,
            packetAttempts: 0,
            packetDroppedCount: 0,
            packetQueuedCount: 0,
            packetDeliveredCount: 0,
            queueDepthTotal: 0,
            queueDepthSamples: 0,
            latencyTotalMs: 0,
            latencySamples: 0,
            connectedDroneTimeMs: 0,
            disconnectedDroneTimeMs: 0,
            droneObservedTimeMs: 0,
            batteryWarningCount: 0,
            batteryEmergencyCount: 0,
            operatorLoadPeak: 0,
            detectionOpportunityCount: 0,
            detectionOpportunityLatencyTotalMs: 0,
        },
        timeline: [],
        events: [],
        summary: buildInitialSummary(scenario),
    };

    return appendEvent(session, createMetricEvent(session, "mission-start", startedAt, `Mission metrics session started for ${scenario.name}.`));
}

export function recordAnomalyOpportunities(session: MissionMetricsSession, anomalyIds: string[], timestamp: number): MissionMetricsSession {
    if (anomalyIds.length === 0) return session;
    let changed = false;
    const anomalyStates = {...session.anomalyStates};
    anomalyIds.forEach((anomalyId) => {
        const state = anomalyStates[anomalyId];
        if (!state || state.firstOpportunityAt !== undefined) return;
        anomalyStates[anomalyId] = {...state, firstOpportunityAt: timestamp};
        changed = true;
    });
    return changed ? {...session, anomalyStates, updatedAt: Math.max(session.updatedAt, timestamp)} : session;
}

export function recordDetectionLogEntries(session: MissionMetricsSession, scenario: MaritimeScenario, entries: Array<{
    id: string;
    timestamp: number;
    kind: "detected" | "false-negative" | "false-positive" | "battery-warning" | "battery-emergency";
    droneId?: string;
    anomalyId?: string;
    anomalyType?: string;
    message: string;
}>): MissionMetricsSession {
    if (entries.length === 0) return session;

    let nextSession = session;
    let counters = session.counters;
    let anomalyStates = session.anomalyStates;
    let anomalyStateChanged = false;
    let counterChanged = false;

    for (const entry of entries) {
        if (entry.kind === "detected" && entry.anomalyId && anomalyStates[entry.anomalyId]) {
            const state = anomalyStates[entry.anomalyId];
            if (!state.firstDetectedAt) {
                if (!anomalyStateChanged) anomalyStates = {...anomalyStates};
                anomalyStates[entry.anomalyId] = {...state, firstDetectedAt: entry.timestamp};
                anomalyStateChanged = true;
                if (!counterChanged) counters = {...counters};
                if (counters.timeToFirstDetectionMs === undefined) {
                    counters.timeToFirstDetectionMs = Math.max(0, entry.timestamp - session.startedAt);
                }
                if (state.firstOpportunityAt !== undefined) {
                    counters.detectionOpportunityCount += 1;
                    counters.detectionOpportunityLatencyTotalMs += Math.max(0, entry.timestamp - state.firstOpportunityAt);
                }
                counterChanged = true;
                nextSession = appendEvent(
                    {...nextSession, anomalyStates, counters},
                    createMetricEvent(nextSession, "anomaly-detected", entry.timestamp, entry.message, {
                        droneId: entry.droneId,
                        anomalyId: entry.anomalyId,
                    }),
                );
            }
        }

        if (entry.kind === "false-positive") {
            if (!counterChanged) counters = {...counters};
            counters.falsePositiveCount += 1;
            counterChanged = true;
            nextSession = appendEvent(nextSession, createMetricEvent(nextSession, "false-positive", entry.timestamp, entry.message, {
                droneId: entry.droneId,
                anomalyId: entry.anomalyId,
            }));
        }

        if (entry.kind === "false-negative") {
            if (!counterChanged) counters = {...counters};
            counters.falseNegativeCount += 1;
            counterChanged = true;
            nextSession = appendEvent(nextSession, createMetricEvent(nextSession, "false-negative", entry.timestamp, entry.message, {
                droneId: entry.droneId,
                anomalyId: entry.anomalyId,
            }));
        }

        if (entry.kind === "battery-warning") {
            if (!counterChanged) counters = {...counters};
            counters.batteryWarningCount += 1;
            counterChanged = true;
            nextSession = appendEvent(nextSession, createMetricEvent(nextSession, "battery-warning", entry.timestamp, entry.message, {
                droneId: entry.droneId,
            }));
        }

        if (entry.kind === "battery-emergency") {
            if (!counterChanged) counters = {...counters};
            counters.batteryEmergencyCount += 1;
            counterChanged = true;
            nextSession = appendEvent(nextSession, createMetricEvent(nextSession, "battery-emergency", entry.timestamp, entry.message, {
                droneId: entry.droneId,
            }));
        }
    }

    const latestTimestamp = Math.max(...entries.map((entry) => entry.timestamp));
    const baseSession = anomalyStateChanged || counterChanged
        ? {...nextSession, anomalyStates, counters, updatedAt: Math.max(nextSession.updatedAt, latestTimestamp)}
        : nextSession;

    return {
        ...baseSession,
        summary: buildSummary(baseSession, scenario, {
            now: latestTimestamp,
            connectedPct: baseSession.summary.commsConnectedPct,
            operatorLoadIndex: baseSession.summary.operatorLoadIndex,
            avgQueueDepth: baseSession.summary.avgQueueDepth,
            avgLatencyMs: baseSession.summary.avgLatencyMs,
            avgScanCertaintyPct: baseSession.summary.avgScanCertaintyPct,
        }),
    };
}

export function recordAlertsRaised(session: MissionMetricsSession, scenario: MaritimeScenario, alerts: Alert[], unacknowledgedAfterRaise: number): MissionMetricsSession {
    if (alerts.length === 0) return session;
    const latestTimestamp = Math.max(...alerts.map((alert) => alert.timestamp));
    const counters = {
        ...session.counters,
        alertCount: session.counters.alertCount + alerts.length,
        peakUnacknowledgedAlerts: Math.max(session.counters.peakUnacknowledgedAlerts, unacknowledgedAfterRaise),
    };

    let nextSession: MissionMetricsSession = {
        ...session,
        counters,
        updatedAt: Math.max(session.updatedAt, latestTimestamp)
    };
    alerts.forEach((alert) => {
        nextSession = appendEvent(nextSession, createMetricEvent(nextSession, "alert-raised", alert.timestamp, alert.message, {
            droneId: alert.droneId,
            anomalyId: alert.anomalyId,
            severity: alert.severity,
        }));
    });

    return {
        ...nextSession,
        summary: buildSummary(nextSession, scenario, {
            now: latestTimestamp,
            connectedPct: nextSession.summary.commsConnectedPct,
            operatorLoadIndex: nextSession.summary.operatorLoadIndex,
            avgQueueDepth: nextSession.summary.avgQueueDepth,
            avgLatencyMs: nextSession.summary.avgLatencyMs,
            avgScanCertaintyPct: nextSession.summary.avgScanCertaintyPct,
        }),
    };
}

export function recordAlertAcknowledgements(
    session: MissionMetricsSession,
    scenario: MaritimeScenario,
    acknowledgedAlerts: Array<{
        id: string;
        message: string;
        timestamp: number;
        severity: AlertSeverity;
        droneId?: string;
        anomalyId?: string
    }>,
    acknowledgedAt: number,
): MissionMetricsSession {
    if (acknowledgedAlerts.length === 0) return session;
    let nextSession: MissionMetricsSession = {
        ...session,
        counters: {...session.counters},
        updatedAt: Math.max(session.updatedAt, acknowledgedAt),
    };
    acknowledgedAlerts.forEach((alert) => {
        nextSession.counters.ackCount += 1;
        nextSession.counters.ackLatencyTotalMs += Math.max(0, acknowledgedAt - alert.timestamp);
        nextSession = appendEvent(nextSession, createMetricEvent(nextSession, "alert-acknowledged", acknowledgedAt, `Acknowledged: ${alert.message}`, {
            droneId: alert.droneId,
            anomalyId: alert.anomalyId,
            severity: alert.severity,
            value: Math.max(0, acknowledgedAt - alert.timestamp),
        }));
    });

    return {
        ...nextSession,
        summary: buildSummary(nextSession, scenario, {
            now: acknowledgedAt,
            connectedPct: nextSession.summary.commsConnectedPct,
            operatorLoadIndex: nextSession.summary.operatorLoadIndex,
            avgQueueDepth: nextSession.summary.avgQueueDepth,
            avgLatencyMs: nextSession.summary.avgLatencyMs,
            avgScanCertaintyPct: nextSession.summary.avgScanCertaintyPct,
        }),
    };
}

export function recordManualCommand(
    session: MissionMetricsSession,
    scenario: MaritimeScenario,
    command: {
        timestamp: number;
        label: string;
        value?: number;
        droneId?: string;
        type?: "manual-command" | "coverage-command";
    },
): MissionMetricsSession {
    const counters = {
        ...session.counters,
        manualCommandCount: session.counters.manualCommandCount + 1,
    };
    const nextSession = appendEvent(
        {...session, counters, updatedAt: Math.max(session.updatedAt, command.timestamp)},
        createMetricEvent(session, command.type ?? "manual-command", command.timestamp, command.label, {
            droneId: command.droneId,
            value: command.value,
        }),
    );
    return {
        ...nextSession,
        summary: buildSummary(nextSession, scenario, {
            now: command.timestamp,
            connectedPct: nextSession.summary.commsConnectedPct,
            operatorLoadIndex: nextSession.summary.operatorLoadIndex,
            avgQueueDepth: nextSession.summary.avgQueueDepth,
            avgLatencyMs: nextSession.summary.avgLatencyMs,
            avgScanCertaintyPct: nextSession.summary.avgScanCertaintyPct,
        }),
    };
}

export function recordPacketDispatch(
    session: MissionMetricsSession,
    scenario: MaritimeScenario,
    dispatch: {
        timestamp: number;
        attempted?: number;
        dropped?: number;
        queued?: number;
        delivered?: number;
        queuedLatencyTotalMs?: number;
        label?: string;
    },
): MissionMetricsSession {
    const counters = {
        ...session.counters,
        packetAttempts: session.counters.packetAttempts + (dispatch.attempted ?? 0),
        packetDroppedCount: session.counters.packetDroppedCount + (dispatch.dropped ?? 0),
        packetQueuedCount: session.counters.packetQueuedCount + (dispatch.queued ?? 0),
        packetDeliveredCount: session.counters.packetDeliveredCount + (dispatch.delivered ?? 0),
        latencyTotalMs: session.counters.latencyTotalMs + (dispatch.queuedLatencyTotalMs ?? 0),
        latencySamples: session.counters.latencySamples + ((dispatch.queued ?? 0) > 0 ? dispatch.queued ?? 0 : 0),
    };

    let nextSession: MissionMetricsSession = {
        ...session,
        counters,
        updatedAt: Math.max(session.updatedAt, dispatch.timestamp)
    };
    if ((dispatch.dropped ?? 0) > 0) {
        nextSession = appendEvent(nextSession, createMetricEvent(nextSession, "packet-dropped", dispatch.timestamp, dispatch.label ?? `Dropped ${dispatch.dropped} communication event(s).`, {
            value: dispatch.dropped,
        }));
    }
    if ((dispatch.queued ?? 0) > 0) {
        nextSession = appendEvent(nextSession, createMetricEvent(nextSession, "packet-queued", dispatch.timestamp, `Queued ${dispatch.queued} communication event(s).`, {
            value: dispatch.queued,
        }));
    }
    if ((dispatch.delivered ?? 0) > 0) {
        nextSession = appendEvent(nextSession, createMetricEvent(nextSession, "packet-delivered", dispatch.timestamp, `Delivered ${dispatch.delivered} communication event(s).`, {
            value: dispatch.delivered,
        }));
    }

    return {
        ...nextSession,
        summary: buildSummary(nextSession, scenario, {
            now: dispatch.timestamp,
            connectedPct: nextSession.summary.commsConnectedPct,
            operatorLoadIndex: nextSession.summary.operatorLoadIndex,
            avgQueueDepth: nextSession.summary.avgQueueDepth,
            avgLatencyMs: nextSession.summary.avgLatencyMs,
            avgScanCertaintyPct: nextSession.summary.avgScanCertaintyPct,
        }),
    };
}

export function sampleMissionMetrics(session: MissionMetricsSession, input: MetricsSampleInput): MissionMetricsSession {
    const elapsedMs = Math.max(0, input.now - session.startedAt);
    const durationMinutes = elapsedMs > 0 ? elapsedMs / 60000 : 0;
    const sampledCoverage = markCoverageVisited(session.coverage, input.scenario.sector.bounds, input.drones, input.sensorRangeMeters);
    const commsDrones = input.drones.filter((drone) => drone.comms);
    const connectedPctCurrent = commsDrones.length > 0
        ? (commsDrones.filter((drone) => drone.comms!.connected).length / commsDrones.length) * 100
        : (input.drones.length > 0 ? 100 : 0);
    const avgSignalQualityPct = commsDrones.length > 0
        ? average(commsDrones.map((drone) => drone.comms!.signalQuality * 100))
        : (input.drones.length > 0 ? 100 : 0);
    const avgQueueDepth = commsDrones.length > 0
        ? average(commsDrones.map((drone) => drone.comms!.queueDepth + drone.comms!.offlineBufferSize))
        : 0;
    const avgLatencyMs = commsDrones.length > 0
        ? average(commsDrones.map((drone) => drone.comms!.latencyMs))
        : 0;
    const {
        detectedCount,
        totalCount,
        weightedDetected,
        weightedTotal,
        avgCertaintyPct
    } = getDetectedStats(input.scenario);
    const coveragePct = sampledCoverage.totalCells > 0 ? (sampledCoverage.visitedCells / sampledCoverage.totalCells) * 100 : 0;
    const alertBurdenPerMin = durationMinutes > 0 ? session.counters.alertCount / durationMinutes : 0;
    const manualCommandsPerMin = durationMinutes > 0 ? session.counters.manualCommandCount / durationMinutes : 0;
    const avgAckLatencyMs = session.counters.ackCount > 0 ? session.counters.ackLatencyTotalMs / session.counters.ackCount : undefined;
    const packetDropPct = session.counters.packetAttempts > 0
        ? (session.counters.packetDroppedCount / session.counters.packetAttempts) * 100
        : 0;
    const operatorLoadIndex = computeOperatorLoadIndex({
        unacknowledgedAlerts: input.unacknowledgedAlerts,
        criticalAlertCount: input.criticalAlertCount,
        alertBurdenPerMin,
        avgAckLatencyMs,
        manualCommandsPerMin,
        connectedPct: connectedPctCurrent,
        batteryEmergencyCount: session.counters.batteryEmergencyCount,
    });

    const sample = {
        timestamp: input.now,
        elapsedMs,
        detectedPct: totalCount > 0 ? (detectedCount / totalCount) * 100 : 0,
        weightedDetectionPct: weightedTotal > 0 ? (weightedDetected / weightedTotal) * 100 : 0,
        avgScanCertaintyPct: avgCertaintyPct,
        coveragePct,
        connectedPct: connectedPctCurrent,
        avgSignalQualityPct,
        unacknowledgedAlerts: input.unacknowledgedAlerts,
        operatorLoadIndex,
        manualCommandsPerMin,
        alertBurdenPerMin,
        packetDropPct,
        avgQueueDepth,
        avgLatencyMs,
        falsePositiveCount: session.counters.falsePositiveCount,
        falseNegativeCount: session.counters.falseNegativeCount,
    };

    const dtMs = Math.max(0, input.now - session.updatedAt);
    const connectedDroneCount = commsDrones.length > 0
        ? commsDrones.filter((drone) => drone.comms!.connected).length
        : input.drones.length;
    const observedDroneCount = commsDrones.length > 0 ? commsDrones.length : input.drones.length;
    const counters = {
        ...session.counters,
        manualControlEnabledMs: session.counters.manualControlEnabledMs + (input.manualInterventionEnabled ? dtMs : 0),
        queueDepthTotal: session.counters.queueDepthTotal + avgQueueDepth,
        queueDepthSamples: session.counters.queueDepthSamples + 1,
        latencyTotalMs: session.counters.latencyTotalMs + avgLatencyMs,
        latencySamples: session.counters.latencySamples + 1,
        connectedDroneTimeMs: session.counters.connectedDroneTimeMs + connectedDroneCount * dtMs,
        disconnectedDroneTimeMs: session.counters.disconnectedDroneTimeMs + Math.max(0, observedDroneCount - connectedDroneCount) * dtMs,
        droneObservedTimeMs: session.counters.droneObservedTimeMs + observedDroneCount * dtMs,
        peakUnacknowledgedAlerts: Math.max(session.counters.peakUnacknowledgedAlerts, input.unacknowledgedAlerts),
        operatorLoadPeak: Math.max(session.counters.operatorLoadPeak, operatorLoadIndex),
    };

    return {
        ...session,
        updatedAt: input.now,
        coverage: sampledCoverage,
        counters,
        timeline: [...session.timeline, sample].slice(-maxTimelineSamples),
        summary: buildSummary({...session, coverage: sampledCoverage, counters}, input.scenario, {
            now: input.now,
            connectedPct: connectedPctCurrent,
            operatorLoadIndex,
            avgQueueDepth,
            avgLatencyMs,
            avgScanCertaintyPct: avgCertaintyPct,
        }),
    };
}

export function roundMetricsSession(session: MissionMetricsSession): MissionMetricsSession {
    return {
        ...session,
        summary: {
            ...session.summary,
            anomaliesDetectedPct: round2(session.summary.anomaliesDetectedPct),
            weightedDetectionPct: round2(session.summary.weightedDetectionPct),
            falseContactRate: round2(session.summary.falseContactRate),
            avgScanCertaintyPct: round2(session.summary.avgScanCertaintyPct),
            coveragePct: round2(session.summary.coveragePct),
            areaCoveredSqKm: round2(session.summary.areaCoveredSqKm),
            avgCoverageVisitsPerVisitedCell: round2(session.summary.avgCoverageVisitsPerVisitedCell),
            alertBurdenPerMin: round2(session.summary.alertBurdenPerMin),
            manualCommandsPerMin: round2(session.summary.manualCommandsPerMin),
            manualControlPct: round2(session.summary.manualControlPct),
            commsConnectedPct: round2(session.summary.commsConnectedPct),
            commsDisruptionPct: round2(session.summary.commsDisruptionPct),
            packetDropPct: round2(session.summary.packetDropPct),
            avgQueueDepth: round2(session.summary.avgQueueDepth),
            avgLatencyMs: round2(session.summary.avgLatencyMs),
        },
        timeline: session.timeline.map((sample) => ({
            ...sample,
            detectedPct: round2(sample.detectedPct),
            weightedDetectionPct: round2(sample.weightedDetectionPct),
            avgScanCertaintyPct: round2(sample.avgScanCertaintyPct),
            coveragePct: round2(sample.coveragePct),
            connectedPct: round2(sample.connectedPct),
            avgSignalQualityPct: round2(sample.avgSignalQualityPct),
            operatorLoadIndex: round2(sample.operatorLoadIndex),
            manualCommandsPerMin: round2(sample.manualCommandsPerMin),
            alertBurdenPerMin: round2(sample.alertBurdenPerMin),
            packetDropPct: round2(sample.packetDropPct),
            avgQueueDepth: round2(sample.avgQueueDepth),
            avgLatencyMs: round2(sample.avgLatencyMs),
        })),
    };
}



