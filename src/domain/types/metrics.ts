import type {AlertSeverity} from "./alert";
import type {DroneState} from "./drone";
import type {AnomalyType, MaritimeScenario} from "./environment";

export type OperationalMetricCategory = "effectiveness" | "coverage" | "workload" | "comms" | "autonomy";

export type OperationalMetricDefinition = {
    id: string;
    label: string;
    category: OperationalMetricCategory;
    unit: string;
    objective: string;
    rationale: string;
};

export const anomalyPriorityWeights: Record<Exclude<AnomalyType, "false-positive">, number> = {
    "person-in-water": 4,
    lifeboat: 3,
    "debris-field": 1,
};

export const operationalMetricCatalog: OperationalMetricDefinition[] = [
    {
        id: "weighted-detection-rate",
        label: "Weighted detection rate",
        category: "effectiveness",
        unit: "%",
        objective: "Maximize recovery-relevant anomaly finds, especially people in water and lifeboats.",
        rationale: "Weights high-consequence targets more heavily than low-severity debris so mission success reflects rescue value, not just count volume.",
    },
    {
        id: "detection-latency",
        label: "Detection latency from first opportunity",
        category: "effectiveness",
        unit: "ms",
        objective: "Reduce the time between a target entering sensor reach and being confirmed.",
        rationale: "Captures how efficiently the swarm converts sensing opportunity into actionable detections.",
    },
    {
        id: "coverage-efficiency",
        label: "Coverage efficiency",
        category: "coverage",
        unit: "%",
        objective: "Expand scanned area quickly without leaving search gaps.",
        rationale: "A heatmap-backed coverage percentage shows whether autonomy is using drone time productively across the sector.",
    },
    {
        id: "alert-burden",
        label: "Alert burden",
        category: "workload",
        unit: "alerts/min",
        objective: "Lower supervisory overload while preserving anomaly detection performance.",
        rationale: "High alert rates, long acknowledgment delays, and peaks in unresolved alerts are strong workload and stress proxies alongside NASA-TLX.",
    },
    {
        id: "manual-interventions",
        label: "Manual interventions",
        category: "workload",
        unit: "commands/min",
        objective: "Keep autonomy usable enough that operators intervene only when it adds mission value.",
        rationale: "Frequent waypointing, RTB overrides, deletions, or safety overrides indicate supervisory burden and trust breakdown.",
    },
    {
        id: "comms-resilience",
        label: "Communications resilience",
        category: "comms",
        unit: "%",
        objective: "Maintain connected, low-latency oversight of the swarm.",
        rationale: "Disconnected time, packet drops, queue depth, and latency capture how much comms degradation increases operator monitoring demand.",
    },
    {
        id: "autonomy-stability",
        label: "Autonomy stability",
        category: "autonomy",
        unit: "events",
        objective: "Reduce disruptive safety or battery events during autonomous search.",
        rationale: "Battery emergencies and avoidance overrides indicate control instability that can elevate user stress and degrade search tempo.",
    },
];

export type CoverageHeatmapGrid = {
    cellSizeMeters: number;
    cols: number;
    rows: number;
    totalCells: number;
    visitedCells: number;
    maxVisitCount: number;
    visits: number[];
};

export type MetricsEventType =
    | "mission-start"
    | "anomaly-detected"
    | "false-positive"
    | "false-negative"
    | "alert-raised"
    | "alert-acknowledged"
    | "manual-command"
    | "coverage-command"
    | "packet-dropped"
    | "packet-queued"
    | "packet-delivered"
    | "battery-warning"
    | "battery-emergency";

export type MissionMetricsEvent = {
    id: string;
    type: MetricsEventType;
    timestamp: number;
    elapsedMs: number;
    label: string;
    value?: number;
    droneId?: string;
    anomalyId?: string;
    severity?: AlertSeverity;
};

export type MissionMetricsTimelineSample = {
    timestamp: number;
    elapsedMs: number;
    detectedPct: number;
    weightedDetectionPct: number;
    avgScanCertaintyPct: number;
    coveragePct: number;
    connectedPct: number;
    avgSignalQualityPct: number;
    unacknowledgedAlerts: number;
    operatorLoadIndex: number;
    manualCommandsPerMin: number;
    alertBurdenPerMin: number;
    packetDropPct: number;
    avgQueueDepth: number;
    avgLatencyMs: number;
    falsePositiveCount: number;
    falseNegativeCount: number;
};

export type MissionMetricsSummary = {
    missionDurationMs: number;
    anomaliesDetected: number;
    totalRealAnomalies: number;
    anomaliesDetectedPct: number;
    weightedDetectionPct: number;
    timeToFirstDetectionMs?: number;
    meanDetectionOpportunityLatencyMs?: number;
    falsePositiveCount: number;
    falseNegativeCount: number;
    falseContactRate: number;
    avgScanCertaintyPct: number;
    coveragePct: number;
    areaCoveredSqKm: number;
    avgCoverageVisitsPerVisitedCell: number;
    alertCount: number;
    alertBurdenPerMin: number;
    peakUnacknowledgedAlerts: number;
    avgAckLatencyMs?: number;
    manualCommandCount: number;
    manualCommandsPerMin: number;
    manualControlPct: number;
    operatorLoadIndex: number;
    operatorLoadPeak: number;
    commsConnectedPct: number;
    commsDisruptionPct: number;
    packetDropPct: number;
    avgQueueDepth: number;
    avgLatencyMs: number;
    batteryWarningCount: number;
    batteryEmergencyCount: number;
    missionSuccessIndex: number;
};

export type AnomalyMetricsState = {
    anomalyId: string;
    type: Exclude<AnomalyType, "false-positive">;
    weight: number;
    firstOpportunityAt?: number;
    firstDetectedAt?: number;
};

export type MissionMetricsCounters = {
    falsePositiveCount: number;
    falseNegativeCount: number;
    alertCount: number;
    ackCount: number;
    ackLatencyTotalMs: number;
    peakUnacknowledgedAlerts: number;
    manualCommandCount: number;
    manualControlEnabledMs: number;
    packetAttempts: number;
    packetDroppedCount: number;
    packetQueuedCount: number;
    packetDeliveredCount: number;
    queueDepthTotal: number;
    queueDepthSamples: number;
    latencyTotalMs: number;
    latencySamples: number;
    connectedDroneTimeMs: number;
    disconnectedDroneTimeMs: number;
    droneObservedTimeMs: number;
    batteryWarningCount: number;
    batteryEmergencyCount: number;
    operatorLoadPeak: number;
    detectionOpportunityCount: number;
    detectionOpportunityLatencyTotalMs: number;
    timeToFirstDetectionMs?: number;
};

export type MissionMetricsSession = {
    schemaVersion: 1;
    sessionId: string;
    startedAt: number;
    updatedAt: number;
    scenarioName: string;
    seed: string;
    sectorAreaSqKm: number;
    metricCatalog: OperationalMetricDefinition[];
    totalRealAnomalies: number;
    totalWeightedAnomalyScore: number;
    coverage: CoverageHeatmapGrid;
    anomalyStates: Record<string, AnomalyMetricsState>;
    counters: MissionMetricsCounters;
    timeline: MissionMetricsTimelineSample[];
    events: MissionMetricsEvent[];
    summary: MissionMetricsSummary;
};

export type MissionMetricsExport = {
    exportedAt: string;
    session: MissionMetricsSession;
};

export type MetricsSampleInput = {
    now: number;
    scenario: MaritimeScenario;
    drones: DroneState[];
    unacknowledgedAlerts: number;
    criticalAlertCount: number;
    manualInterventionEnabled: boolean;
    sensorRangeMeters: number;
};

