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
    calculation: string;
};

export const anomalyPriorityWeights: Record<Exclude<AnomalyType, "false-positive">, number> = {
    "person-in-water": 4,
    lifeboat: 3,
    "debris-field": 1,
};

export const operationalMetricCatalog: OperationalMetricDefinition[] = [
    {
        id: "detection-rate",
        label: "Detection rate",
        category: "effectiveness",
        unit: "%",
        objective: "Find as many real anomalies as possible during the mission.",
        rationale: "A simple hit-rate is easy to explain and compare between missions without weighting assumptions.",
        calculation: "(Detected real anomalies / Total real anomalies in scenario) x 100.",
    },
    {
        id: "time-to-first-detection",
        label: "Time to first detection",
        category: "effectiveness",
        unit: "ms",
        objective: "Start producing useful detections as early as possible.",
        rationale: "Early first contact is easy for operators to interpret as mission responsiveness.",
        calculation: "Timestamp of first real-anomaly detection - mission start timestamp.",
    },
    {
        id: "coverage",
        label: "Coverage",
        category: "coverage",
        unit: "%",
        objective: "Scan as much of the sector as possible.",
        rationale: "Coverage percentage directly shows search breadth and is straightforward to audit from the heatmap grid.",
        calculation: "(Visited coverage-grid cells / Total coverage-grid cells) x 100, where a cell is visited when any drone sensor footprint intersects it.",
    },
    {
        id: "alerts-per-minute",
        label: "Alerts per minute",
        category: "workload",
        unit: "alerts/min",
        objective: "Keep alert traffic manageable for one operator.",
        rationale: "Alert rate is a transparent workload signal and avoids opaque workload scoring formulas.",
        calculation: "Total alerts raised / mission duration in minutes.",
    },
    {
        id: "manual-commands-per-minute",
        label: "Manual commands per minute",
        category: "workload",
        unit: "commands/min",
        objective: "Keep autonomy usable enough that operators intervene only when it adds mission value.",
        rationale: "This shows how often the operator had to step in, which is easy to explain as autonomy reliance.",
        calculation: "Total manual-command events divided by mission duration in minutes.",
    },
    {
        id: "comms-uptime",
        label: "Comms uptime",
        category: "comms",
        unit: "%",
        objective: "Keep drones connected to the operator station for most of the mission.",
        rationale: "Connected-time percentage is intuitive and comparable regardless of drone count.",
        calculation: "(Connected drone-observation time / Total drone-observation time) x 100.",
    },
    {
        id: "false-contacts",
        label: "False contacts",
        category: "effectiveness",
        unit: "count",
        objective: "Minimize incorrect detections and missed real targets.",
        rationale: "Raw false-positive and false-negative counts are simple to verify from mission logs.",
        calculation: "False contacts = false positives + false negatives.",
    },
    {
        id: "battery-safety-events",
        label: "Battery safety events",
        category: "autonomy",
        unit: "events",
        objective: "Avoid low-battery situations that disrupt search flow.",
        rationale: "Warning and emergency event counts clearly show whether endurance planning stayed within safe bounds.",
        calculation: "Battery safety events = battery warnings + battery emergencies.",
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

export type DashboardSummaryMetric = {
    id: string;
    label: string;
    value: number | null;
    displayValue: string;
};

export type MissionMetricsExport = {
    exportedAt: string;
    session: MissionMetricsSession;
    dashboardSummary: DashboardSummaryMetric[];
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

