import type React from "react";
import {useCallback, useEffect, useMemo, useRef, useState} from "react";
import {createPortal} from "react-dom";
import {useNavigate} from "react-router-dom";
import {AppShell} from "../components/layout/AppShell";
import {PageTransition} from "../components/layout/PageTransition";
import MaritimeCanvas2D from "../components/MaritimeCanvas2D";
import {useMission} from "../context/MissionContext";
import Badge from "../components/ui/Badge";
import Field, {ControlGrid} from "../components/ui/Field";
import {anomalyTypeLabels} from "../config/anomalies";
import {droneModels, batteryWarningThresholds} from "../config/constants";
import {computeVoronoiCells} from "../components/canvas/voronoi";
import {planCoveragePaths} from "../domain/coverage/planner";
import {computeSwarmAdjustments} from "../domain/swarm/behaviour";
import {
    createCommDegradationAlert,
    generateAlertsFromTick,
    getCommAlertBand,
    type CommAlertBand
} from "../domain/alerts/generator";
import {
    computeCommsState,
    shouldDropPacket,
    enqueueMessage,
    drainQueue,
    signalQualityColor,
    signalQualityLabel
} from "../domain/comms/channel";
import {commsThresholds} from "../config/comms";
import type {QueuedMessage, OfflineBuffer} from "../domain/types/comms";
import type {Alert} from "../domain/types/alert";
import {useAlertAudio} from "../hooks/useAlertAudio";
import AlertPanel from "../components/AlertPanel";
import MetricsDashboard from "../components/MetricsDashboard";
import type {DetectionLogEntry, AnomalyInstance, Vec2} from "../domain/types/environment";
import type {MissionMetricsSession} from "../domain/types/metrics";
import {
    createMissionMetricsSession,
    recordAlertAcknowledgements,
    recordAlertsRaised,
    recordAnomalyOpportunities,
    recordDetectionLogEntries,
    recordManualCommand,
    recordPacketDispatch,
    sampleMissionMetrics,
} from "../domain/metrics/collector";
import {
    downloadMissionMetricsEventsCSV,
    downloadMissionMetricsJSON,
    downloadMissionMetricsSummaryCSV,
    downloadMissionMetricsTimelineCSV,
} from "../utils/metricsExport";
import {logError} from "../utils/errorLogging";
import {
    computeEnvironmentalBatteryDrainMultiplier,
    computeEnvironmentalFalsePositiveMultiplier,
    computeEnvironmentalSensorMultiplier,
    computeWindAdjustedSpeedKts,
} from "../domain/environment/effects";

const commAlertBandRank: Record<CommAlertBand, number> = {
    healthy: 0,
    degraded: 1,
    poor: 2,
    critical: 3,
    lost: 4,
};

const playbackSpeeds = [1, 2, 4, 8, 16] as const;

/**
 * Simulation Page: real-time mission execution view.
 *
 * Keeps cognitive load localised to monitoring tasks
 * (Wickens et al., 2015 - proximity compatibility principle).
 * The detection log uses aria-live="polite" for screen reader awareness.
 */
export default function SimulationPage() {
    const navigate = useNavigate();
    const mission = useMission();
    const {
        scenario: scenarioHook,
        drones, setDrones,
        selectedDroneIds,
        droneSelection,
        hub,
        sensorSettings,
        sensorsEnabled, setSensorsEnabled,
        showSensorRanges, setShowSensorRanges,
        voronoiEnabled, setVoronoiEnabled,
        voronoiCells, setVoronoiCells,
        coveragePlans, setCoveragePlans,
        coverageActive, setCoverageActive,
        coverageOverlap, setCoverageOverlap,
        detectionLog, appendLog,
        alerts, appendAlerts, acknowledgeAlert, acknowledgeAllAlerts,
        alertAudioEnabled, setAlertAudioEnabled, unacknowledgedAlertCount,
        manualInterventionEnabled, setManualInterventionEnabled,
        fogOfWarEnabled, setFogOfWarEnabled,
        commsConfig, setCommsConfig,
        swarmEnabledGlobal, swarmParamsRef, batteryWarningStateRef,
        clampToBounds, computeReturnMinutes, computeEmergencyReserve, detectionProbability,
        spawnPoints, selectedSpawnPointId, setSelectedSpawnPointId,
        selectedDroneModelId, setSelectedDroneModelId,
        handleSpawnDrone, setPhase,
        finalizeMission,
    } = mission;

    const {
        scenario, message, error, setMessage,
        handleToggleAnomaly: rawHandleToggleAnomaly,
        sectorMeta, updateAnomalies,
    } = scenarioHook;

    const {select, add, toggle, clear} = droneSelection;
    const lastFrameRef = useRef<number | null>(null);
    const simNowRef = useRef(Date.now());
    const lastSensorTickSimRef = useRef<number | null>(null);
    const scenarioRef = useRef(scenario);
    const dronesRef = useRef(drones);
    const alertsRef = useRef(alerts);
    const manualInterventionEnabledRef = useRef(manualInterventionEnabled);
    const [metrics, setMetrics] = useState<MissionMetricsSession>(() => createMissionMetricsSession(scenario));
    const [metricsCollectionEnabled, setMetricsCollectionEnabled] = useState(true);
    const [isPaused, setIsPaused] = useState(false);
    const [simulationSpeed, setSimulationSpeed] = useState<number>(1);
    const isPausedRef = useRef(false);
    const simulationSpeedRef = useRef(1);
    const isTerminatingRef = useRef(false);
    const metricsCollectionEnabledRef = useRef(true);
    const {playForAlerts} = useAlertAudio(alertAudioEnabled);

    useEffect(() => {
        scenarioRef.current = scenario;
    }, [scenario]);
    useEffect(() => {
        dronesRef.current = drones;
    }, [drones]);
    useEffect(() => {
        alertsRef.current = alerts;
    }, [alerts]);
    useEffect(() => {
        manualInterventionEnabledRef.current = manualInterventionEnabled;
    }, [manualInterventionEnabled]);
    useEffect(() => {
        isPausedRef.current = isPaused;
        if (isPaused) {
            lastFrameRef.current = null;
        }
    }, [isPaused]);
    useEffect(() => {
        simulationSpeedRef.current = simulationSpeed;
    }, [simulationSpeed]);
    useEffect(() => {
        isTerminatingRef.current = false;
        return () => {
            isTerminatingRef.current = true;
        };
    }, []);
    const updateMetricsCollectionEnabled = useCallback((enabled: boolean) => {
        metricsCollectionEnabledRef.current = enabled;
        setMetricsCollectionEnabled(enabled);
    }, []);
    useEffect(() => {
        setMetrics(createMissionMetricsSession(scenario));
        updateMetricsCollectionEnabled(true);
        isTerminatingRef.current = false;
        simNowRef.current = Date.now();
        lastFrameRef.current = null;
        lastSensorTickSimRef.current = null;
        setIsPaused(false);
        setSimulationSpeed(1);
    }, [scenario.name, scenario.seed, scenario.sector.createdAt, updateMetricsCollectionEnabled]);

    const appendLogWithMetrics = useCallback((entries: DetectionLogEntry[]) => {
        if (entries.length === 0) return;
        appendLog(entries);
        if (!metricsCollectionEnabledRef.current) return;
        setMetrics((prev) => recordDetectionLogEntries(prev, scenarioRef.current, entries));
    }, [appendLog]);

    const appendAlertsWithMetrics = useCallback((newAlerts: Alert[]) => {
        if (newAlerts.length === 0) return;
        appendAlerts(newAlerts);
        if (!metricsCollectionEnabledRef.current) return;
        const nextUnackCount = alertsRef.current.filter((alert) => !alert.acknowledged).length
            + newAlerts.filter((alert) => !alert.acknowledged).length;
        setMetrics((prev) => recordAlertsRaised(prev, scenarioRef.current, newAlerts, nextUnackCount));
    }, [appendAlerts]);

    const recordManualMetric = useCallback((label: string, value?: number, type?: "manual-command" | "coverage-command") => {
        if (!metricsCollectionEnabledRef.current) return;
        const timestamp = Date.now();
        setMetrics((prev) => recordManualCommand(prev, scenarioRef.current, {timestamp, label, value, type}));
    }, []);

    const handleToggleAnomaly = useCallback((id: string) => {
        const item = scenarioRef.current.anomalies.items.find((anomaly) => anomaly.id === id);
        rawHandleToggleAnomaly(id);
        if (item?.type !== "false-positive") {
            recordManualMetric(`${item?.detected ? "Unmarked" : "Manually confirmed"} anomaly ${id}.`);
        }
    }, [rawHandleToggleAnomaly, recordManualMetric]);

    const handleAcknowledgeAlert = useCallback((id: string) => {
        const alert = alerts.find((entry) => entry.id === id && !entry.acknowledged);
        acknowledgeAlert(id);
        if (!alert || !metricsCollectionEnabledRef.current) return;
        const acknowledgedAt = Date.now();
        setMetrics((prev) => recordAlertAcknowledgements(prev, scenarioRef.current, [{
            id: alert.id,
            message: alert.message,
            timestamp: alert.timestamp,
            severity: alert.severity,
            droneId: alert.droneId,
            anomalyId: alert.anomalyId,
        }], acknowledgedAt));
    }, [acknowledgeAlert, alerts]);

    const handleAcknowledgeAllAlerts = useCallback(() => {
        const pending = alerts.filter((alert) => !alert.acknowledged);
        acknowledgeAllAlerts();
        if (pending.length === 0 || !metricsCollectionEnabledRef.current) return;
        const acknowledgedAt = Date.now();
        setMetrics((prev) => recordAlertAcknowledgements(
            prev,
            scenarioRef.current,
            pending.map((alert) => ({
                id: alert.id,
                message: alert.message,
                timestamp: alert.timestamp,
                severity: alert.severity,
                droneId: alert.droneId,
                anomalyId: alert.anomalyId,
            })),
            acknowledgedAt,
        ));
    }, [acknowledgeAllAlerts, alerts]);

    const handleExportMetricsJSON = useCallback(() => downloadMissionMetricsJSON(metrics), [metrics]);
    const handleExportMetricsSummaryCSV = useCallback(() => downloadMissionMetricsSummaryCSV(metrics), [metrics]);
    const handleExportMetricsTimelineCSV = useCallback(() => downloadMissionMetricsTimelineCSV(metrics), [metrics]);
    const handleExportMetricsEventsCSV = useCallback(() => downloadMissionMetricsEventsCSV(metrics), [metrics]);

    const lastFalseNegativeRef = useRef<Record<string, number>>({});

    const commsQueueRef = useRef<QueuedMessage<DetectionLogEntry>[]>([]);
    const offlineBufferRef = useRef<Record<string, OfflineBuffer>>({});
    const prevConnectedRef = useRef<Record<string, boolean>>({});
    const prevCommAlertBandRef = useRef<Record<string, CommAlertBand>>({});
    const logEntrySequenceRef = useRef(0);
    const commsConfigRef = useRef(commsConfig);
    useEffect(() => {
        commsConfigRef.current = commsConfig;
    }, [commsConfig]);

    const createLogEntryId = (prefix: string, now: number, droneId?: string, entityId?: string) => {
        logEntrySequenceRef.current += 1;
        return [prefix, droneId ?? "system", entityId ?? "none", now, logEntrySequenceRef.current].join("-");
    };

    useEffect(() => {
        if (!commsConfig.enabled) {
            prevCommAlertBandRef.current = {};
            return;
        }
        const activeDroneIds = new Set(drones.map((d) => d.id));
        Object.keys(prevCommAlertBandRef.current).forEach((droneId) => {
            if (!activeDroneIds.has(droneId)) delete prevCommAlertBandRef.current[droneId];
        });
    }, [commsConfig.enabled, drones]);

    const [drawerOpen, setDrawerOpen] = useState(() => typeof window !== "undefined" ? window.innerWidth >= 960 : true);
    const [mapControlsOpen, setMapControlsOpen] = useState(false);
    const toggleDrawer = () => setDrawerOpen((prev) => !prev);
    const toggleMapControls = () => setMapControlsOpen((prev) => !prev);
    const handleTogglePause = () => {
        setIsPaused((prev) => !prev);
    };
    const handleFastForward = () => {
        setSimulationSpeed((prev) => {
            const idx = playbackSpeeds.indexOf(prev as (typeof playbackSpeeds)[number]);
            const nextSpeed = playbackSpeeds[(idx + 1) % playbackSpeeds.length];
            setMessage(`Simulation speed: ${nextSpeed}x`);
            return nextSpeed;
        });
    };

    const [scanValidationActive, setScanValidationActive] = useState(false);
    const [activeCoverageDroneIds, setActiveCoverageDroneIds] = useState<string[]>([]);

    const isHubWaypoint = useCallback((point?: Vec2) => point
        ? Math.hypot(point.x - hub.position.x, point.y - hub.position.y) < 1
        : false, [hub.position.x, hub.position.y]);

    const queueWithHubReturn = useCallback((queue: Vec2[]) => {
        const finalWaypoint = queue[queue.length - 1];
        return isHubWaypoint(finalWaypoint) ? queue : [...queue, hub.position];
    }, [hub.position, isHubWaypoint]);

    const handleRTBImmediate = () => {
        const ids = selectedDroneIds.length > 0 ? selectedDroneIds : drones.map((d) => d.id);
        if (ids.length === 0) return;
        const now = Date.now();
        setDrones((prev) => prev.map((drone) => {
            if (!ids.includes(drone.id)) return drone;
            return {...drone, targetPosition: hub.position, waypoints: [], status: "returning", lastUpdate: now};
        }));
        recordManualMetric(`Issued immediate RTB to ${ids.length} drone(s).`, ids.length);
        setMessage(`RTB immediately for ${ids.length} drone${ids.length === 1 ? "" : "s"}.`);
    };

    const handleRTBAfterCompletion = () => {
        const ids = selectedDroneIds.length > 0 ? selectedDroneIds : drones.map((d) => d.id);
        if (ids.length === 0) return;
        const now = Date.now();
        setDrones((prev) => prev.map((drone) => {
            if (!ids.includes(drone.id)) return drone;
            const existing = drone.targetPosition ? [drone.targetPosition, ...drone.waypoints] : [...drone.waypoints];
            const queue = queueWithHubReturn(existing);
            const [next, ...rest] = queue;
            return {
                ...drone,
                targetPosition: next,
                waypoints: rest,
                status: drone.status === "returning" ? "returning" : "enroute",
                lastUpdate: now
            };
        }));
        recordManualMetric(`Queued RTB after completion for ${ids.length} drone(s).`, ids.length);
        setMessage(`RTB after completion queued for ${ids.length} drone${ids.length === 1 ? "" : "s"}.`);
    };

    const interactionLocked = coverageActive && !manualInterventionEnabled;

    const handleSetWaypoint = (point: Vec2, append = false) => {
        if (interactionLocked) return;
        if (selectedDroneIds.length === 0) return;
        const clampedPoint = clampToBounds(point);
        setDrones((prev) => prev.map((drone) => {
            if (!selectedDroneIds.includes(drone.id)) return drone;
            const queue = drone.waypoints ?? [];
            if (append) {
                const updatedQueue = [...queue, clampedPoint];
                if (drone.targetPosition) return {...drone, waypoints: updatedQueue, lastUpdate: Date.now()};
                const [nextTarget, ...rest] = updatedQueue;
                return {
                    ...drone,
                    targetPosition: nextTarget,
                    waypoints: rest,
                    status: "enroute",
                    lastUpdate: Date.now()
                };
            }
            return {...drone, targetPosition: clampedPoint, waypoints: [], status: "enroute", lastUpdate: Date.now()};
        }));
        recordManualMetric(`${append ? "Queued" : "Assigned"} waypoint for ${selectedDroneIds.length} drone(s).`, selectedDroneIds.length);
    };

    const handleDronePositionChange = (id: string, position: Vec2) => {
        if (interactionLocked) return;
        setDrones((prev) => prev.map((drone) => drone.id === id ? {
            ...drone,
            position: clampToBounds(position),
            targetPosition: undefined,
            status: "idle",
            lastUpdate: Date.now()
        } : drone));
        recordManualMetric(`Repositioned ${id}.`, 1);
    };

    const handleDroneSpeedChange = (id: string, speedKts: number) => {
        setDrones((prev) => prev.map((drone) => drone.id === id ? {
            ...drone,
            speedKts,
            lastUpdate: Date.now()
        } : drone));
    };

    const handleSelectDroneFromList = (id: string, event: React.MouseEvent<HTMLButtonElement>) => {
        event.preventDefault();
        event.stopPropagation();
        if (event.ctrlKey || event.metaKey) toggle([id]);
        else if (event.shiftKey) add([id]);
        else select([id]);
    };

    const handleToggleDroneCheckbox = (id: string, checked: boolean) => {
        if (checked) add([id]);
        else {
            droneSelection.setSelectedIds((prev) => prev.filter((sid) => sid !== id));
        }
    };

    const selectedIdsRef = useRef(selectedDroneIds);
    useEffect(() => {
        selectedIdsRef.current = selectedDroneIds;
    }, [selectedDroneIds]);

    const handleDeleteSelected = useCallback(() => {
        const ids = selectedIdsRef.current;
        if (ids.length === 0) return;
        const currentDrones = dronesRef.current;
        const count = ids.length;
        const names = currentDrones
            .filter((d) => ids.includes(d.id))
            .map((d) => d.callsign)
            .join(", ");
        setDrones((prev) => prev.filter((d) => !ids.includes(d.id)));
        ids.forEach((id) => {
            delete batteryWarningStateRef.current[id];
        });
        clear();
        recordManualMetric(`Removed ${count} drone(s) from the mission.`, count);
        setMessage(`Removed ${count} drone${count === 1 ? "" : "s"}: ${names}`);
    }, [setDrones, batteryWarningStateRef, clear, setMessage, recordManualMetric]);

    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            const tag = (e.target as HTMLElement)?.tagName;
            if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
            if (e.key === "Delete" || e.key === "Backspace") {
                e.preventDefault();
                handleDeleteSelected();
            }
        };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, [handleDeleteSelected]);

    const coverageSourceCount = useMemo(() => {
        if (selectedDroneIds.length > 0) return drones.filter((d) => selectedDroneIds.includes(d.id)).length;
        return drones.length;
    }, [drones, selectedDroneIds]);

    const totalBufferedScanCount = useMemo(
        () => drones.reduce((sum, d) => sum + (d.comms?.offlineBufferSize ?? 0), 0),
        [drones],
    );

    const sweepSpacingMeters = useMemo(() => {
        const raw = sensorSettings.rangeMeters * (1 - coverageOverlap);
        return Math.max(5, Math.round(raw * 100) / 100);
    }, [coverageOverlap, sensorSettings.rangeMeters]);

    const environmentEffects = useMemo(() => {
        const conditions = scenario.sector.conditions;
        const sensorMultiplier = computeEnvironmentalSensorMultiplier(conditions);
        const batteryDrainMultiplier = computeEnvironmentalBatteryDrainMultiplier(conditions);
        const airborne = drones.filter((drone) => drone.status !== "landed" && drone.speedKts > 0);

        const windDeltaPct = airborne.length === 0
            ? 0
            : airborne.reduce((sum, drone) => {
            const {effectiveSpeedKts} = computeWindAdjustedSpeedKts(drone.speedKts, drone.headingDeg, conditions);
            const baseSpeed = Math.max(0.1, drone.speedKts);
            return sum + ((effectiveSpeedKts / baseSpeed) - 1) * 100;
        }, 0) / airborne.length;

        const windState = airborne.length === 0
            ? "No active drones"
            : windDeltaPct >= 1
                ? "Assist"
                : windDeltaPct <= -1
                    ? "Headwind"
                    : "Neutral";

        return {
            sensorPct: sensorMultiplier * 100,
            batteryPct: batteryDrainMultiplier * 100,
            windDeltaPct,
            windState,
        };
    }, [drones, scenario.sector.conditions]);

    const recomputeVoronoi = useCallback(() => {
        const cells = computeVoronoiCells(drones, scenario.sector.bounds, selectedDroneIds);
        setVoronoiCells(cells);
        return cells;
    }, [drones, scenario.sector.bounds, selectedDroneIds, setVoronoiCells]);

    const handleRunVoronoi = () => {
        if (coverageSourceCount < 2) {
            setVoronoiEnabled(false);
            setVoronoiCells([]);
            setMessage("Voronoi coverage needs at least two drones within the sector.");
            return;
        }
        setVoronoiEnabled(true);
        const cells = recomputeVoronoi();
        recordManualMetric(`Computed Voronoi coverage for ${coverageSourceCount} drone(s).`, coverageSourceCount, "coverage-command");
        if (cells.length === 0) setMessage("Unable to generate Voronoi cells for the current drone layout.");
        else setMessage(`Computed coverage for ${coverageSourceCount} drone${coverageSourceCount === 1 ? "" : "s"}.`);
    };

    const handleClearVoronoi = () => {
        setVoronoiEnabled(false);
        setVoronoiCells([]);
        setCoveragePlans([]);
        setCoverageActive(false);
        setActiveCoverageDroneIds([]);
        recordManualMetric("Cleared coverage overlay.", undefined, "coverage-command");
    };

    const computeCoveragePlansFromCells = useCallback((cells: ReturnType<typeof computeVoronoiCells>) => {
        return planCoveragePaths(cells, sweepSpacingMeters, coverageOverlap);
    }, [coverageOverlap, sweepSpacingMeters]);

    useEffect(() => {
        if (!coverageActive || !voronoiEnabled) return;
        const plans = computeCoveragePlansFromCells(voronoiCells);
        setCoveragePlans(plans);
    }, [computeCoveragePlansFromCells, coverageActive, voronoiCells, voronoiEnabled, setCoveragePlans]);

    const handleStartCoverage = () => {
        const cells = voronoiEnabled ? voronoiCells : recomputeVoronoi();
        if (cells.length < 2) {
            setMessage("Need at least two Voronoi cells to start coverage.");
            setCoverageActive(false);
            setCoveragePlans([]);
            setActiveCoverageDroneIds([]);
            return;
        }
        const plans = computeCoveragePlansFromCells(cells);
        if (plans.length === 0) {
            setMessage("No coverage paths could be generated.");
            setCoveragePlans([]);
            setCoverageActive(false);
            setActiveCoverageDroneIds([]);
            return;
        }
        const participantIds = plans.map((plan) => plan.droneId);
        if (!metricsCollectionEnabledRef.current) {
            setMetrics(createMissionMetricsSession(scenarioRef.current));
        }
        updateMetricsCollectionEnabled(true);
        setVoronoiEnabled(true);
        setVoronoiCells(cells);
        setCoveragePlans(plans);
        setCoverageActive(true);
        setActiveCoverageDroneIds(participantIds);
        setDrawerOpen(false);
        setManualInterventionEnabled(false);
        const now = Date.now();
        setDrones((prev) => prev.map((drone) => {
            const plan = plans.find((p) => p.droneId === drone.id);
            if (!plan || plan.waypoints.length === 0) return drone;
            const [nextTarget, ...rest] = queueWithHubReturn(plan.waypoints);
            return {
                ...drone,
                targetPosition: nextTarget,
                waypoints: rest,
                status: "search",
                lastUpdate: now,
                coveragePlan: plan
            };
        }));
        recordManualMetric(`Started autonomous coverage for ${participantIds.length} drone(s).`, participantIds.length, "coverage-command");
        setMessage(`Starting coverage with spacing ${sweepSpacingMeters} m and ${Math.round(coverageOverlap * 100)}% overlap. Drones will return to the hub after their sweeps.`);
    };

    useEffect(() => {
        if (!coverageActive) return;

        const participants = activeCoverageDroneIds
            .map((id) => drones.find((drone) => drone.id === id))
            .filter((drone): drone is typeof drones[number] => Boolean(drone));

        if (participants.length === 0) {
            setCoverageActive(false);
            setManualInterventionEnabled(false);
            setActiveCoverageDroneIds([]);
            return;
        }

        const allReturnedToHub = participants.every((drone) =>
            isHubWaypoint(drone.position) && !drone.targetPosition && drone.waypoints.length === 0,
        );

        if (!allReturnedToHub) return;

        if (metricsCollectionEnabledRef.current) {
            const now = Date.now();
            const currentAlerts = alertsRef.current;
            setMetrics((prev) => sampleMissionMetrics(prev, {
                now,
                scenario: scenarioRef.current,
                drones: dronesRef.current,
                unacknowledgedAlerts: currentAlerts.filter((alert) => !alert.acknowledged).length,
                criticalAlertCount: currentAlerts.filter((alert) => !alert.acknowledged && alert.severity === "critical").length,
                manualInterventionEnabled: manualInterventionEnabledRef.current,
                sensorRangeMeters: sensorSettings.rangeMeters,
            }));
            updateMetricsCollectionEnabled(false);
        }

        setCoverageActive(false);
        setManualInterventionEnabled(false);
        setActiveCoverageDroneIds([]);
        setMessage("Coverage complete, all drones RtB.");
    }, [activeCoverageDroneIds, coverageActive, drones, isHubWaypoint, sensorSettings.rangeMeters, setCoverageActive, setManualInterventionEnabled, setMessage, updateMetricsCollectionEnabled]);

    useEffect(() => {
        if (!metricsCollectionEnabled) return;
        const interval = window.setInterval(() => {
            if (!metricsCollectionEnabledRef.current || isPausedRef.current || isTerminatingRef.current) return;
            const now = simNowRef.current;
            const currentAlerts = alertsRef.current;
            setMetrics((prev) => sampleMissionMetrics(prev, {
                now,
                scenario: scenarioRef.current,
                drones: dronesRef.current,
                unacknowledgedAlerts: currentAlerts.filter((alert) => !alert.acknowledged).length,
                criticalAlertCount: currentAlerts.filter((alert) => !alert.acknowledged && alert.severity === "critical").length,
                manualInterventionEnabled: manualInterventionEnabledRef.current,
                sensorRangeMeters: sensorSettings.rangeMeters,
            }));
        }, 1000);

        return () => window.clearInterval(interval);
    }, [metricsCollectionEnabled, sensorSettings.rangeMeters]);

    useEffect(() => {
        isTerminatingRef.current = false;
        let raf: number;
        const step = (timestamp: number) => {
            try {
                if (isTerminatingRef.current) return;
                if (lastFrameRef.current === null) lastFrameRef.current = timestamp;
                const elapsedMs = timestamp - lastFrameRef.current;
                lastFrameRef.current = timestamp;
                if (isPausedRef.current) {
                    return;
                }
                const simulatedElapsedMs = elapsedMs * simulationSpeedRef.current;
                const dtSeconds = simulatedElapsedMs / 1000;
                const events: DetectionLogEntry[] = [];
                const commTransitionAlerts: Alert[] = [];
                const now = simNowRef.current + simulatedElapsedMs;
                simNowRef.current = now;
                const bounds = scenario.sector.bounds;
                const swarmParams = swarmParamsRef.current;
                const baseDrones = dronesRef.current;
                const cc = commsConfigRef.current;
                const envConditions = scenarioRef.current.sector.conditions;
                const batteryDrainMultiplier = computeEnvironmentalBatteryDrainMultiplier(envConditions);
                const swarmAdjustments = swarmEnabledGlobal ? computeSwarmAdjustments(baseDrones, swarmParams, bounds, dtSeconds) : {};

                if (cc.enabled) {
                    const {delivered, remaining} = drainQueue(commsQueueRef.current, now);
                    commsQueueRef.current = remaining;
                    if (delivered.length > 0) {
                        const deliveredEntries = delivered.map((m) => m.payload);
                        appendLogWithMetrics(deliveredEntries);
                        if (metricsCollectionEnabledRef.current) {
                            setMetrics((prev) => recordPacketDispatch(prev, scenarioRef.current, {
                                timestamp: now,
                                delivered: deliveredEntries.length,
                            }));
                        }
                        setMessage(deliveredEntries[0].message);
                        const newAlerts = generateAlertsFromTick({
                            drones: dronesRef.current,
                            hub: hub.position,
                            existingAlerts: alertsRef.current,
                            newLogEntries: deliveredEntries,
                            now,
                        });
                        if (newAlerts.length > 0) {
                            appendAlertsWithMetrics(newAlerts);
                            playForAlerts(newAlerts);
                        }
                    }

                    for (const drone of baseDrones) {
                        const wasConnected = prevConnectedRef.current[drone.id] ?? true;
                        const currentComms = drone.comms;
                        const isNowConnected = currentComms ? currentComms.connected : true;

                        if (!wasConnected && isNowConnected) {
                            const buffer = offlineBufferRef.current[drone.id];
                            if (buffer && (buffer.events.length > 0 || Object.keys(buffer.anomalyUpdates).length > 0)) {
                                const anomalyUpdates = buffer.anomalyUpdates;
                                if (Object.keys(anomalyUpdates).length > 0) {
                                    const currentScenario = scenarioRef.current;
                                    updateAnomalies((prevItems) => {
                                        let items = prevItems ?? currentScenario.anomalies.items;
                                        let changed = false;
                                        for (const [anomalyId, update] of Object.entries(anomalyUpdates)) {
                                            const idx = items.findIndex((a) => a.id === anomalyId);
                                            if (idx < 0) continue;
                                            const item = items[idx];
                                            const newCertainty = Math.min(1, (item.scanCertainty ?? 0) + update.totalCertaintyGain);
                                            const newDetected = item.detected || update.detected;
                                            if (newCertainty > (item.scanCertainty ?? 0) + 0.001 || newDetected !== item.detected) {
                                                if (!changed) {
                                                    items = [...items];
                                                    changed = true;
                                                }
                                                items[idx] = {
                                                    ...item,
                                                    scanCertainty: newCertainty,
                                                    detected: newDetected
                                                };
                                            }
                                        }
                                        return items;
                                    });
                                }

                                if (buffer.events.length > 0) {
                                    const latency = drone.comms?.latencyMs ?? cc.baseLatencyMs;
                                    const reconnectMsg: DetectionLogEntry = {
                                        id: createLogEntryId("reconnect", now, drone.id),
                                        timestamp: now,
                                        kind: "detected",
                                        droneId: drone.id,
                                        position: drone.position,
                                        message: `${drone.callsign} reconnected - delivering ${buffer.events.length} buffered scan result${buffer.events.length === 1 ? "" : "s"}.`,
                                    };
                                    const allEvents = [reconnectMsg, ...buffer.events];
                                    let queuedCount = 0;
                                    let deliveredCount = 0;
                                    for (const evt of allEvents) {
                                        if (latency > 5) {
                                            commsQueueRef.current = enqueueMessage(
                                                commsQueueRef.current, evt.id, evt, latency, now, drone.id,
                                            );
                                            queuedCount += 1;
                                        } else {
                                            appendLogWithMetrics([evt]);
                                            deliveredCount += 1;
                                        }
                                    }
                                    if (metricsCollectionEnabledRef.current) {
                                        setMetrics((prev) => recordPacketDispatch(prev, scenarioRef.current, {
                                            timestamp: now,
                                            attempted: allEvents.length,
                                            queued: queuedCount,
                                            delivered: deliveredCount,
                                            queuedLatencyTotalMs: queuedCount * latency,
                                        }));
                                    }
                                    setMessage(reconnectMsg.message);
                                    const newAlerts = generateAlertsFromTick({
                                        drones: dronesRef.current,
                                        hub: hub.position,
                                        existingAlerts: alertsRef.current,
                                        newLogEntries: allEvents,
                                        now,
                                    });
                                    if (newAlerts.length > 0) {
                                        appendAlertsWithMetrics(newAlerts);
                                        playForAlerts(newAlerts);
                                    }
                                }

                                offlineBufferRef.current[drone.id] = {events: [], anomalyUpdates: {}};
                            }
                        }

                        prevConnectedRef.current[drone.id] = isNowConnected;
                    }
                }

                setDrones((prev) => prev.map((drone) => {
                    const bufferSize = offlineBufferRef.current[drone.id]
                        ? offlineBufferRef.current[drone.id].events.length + Object.keys(offlineBufferRef.current[drone.id].anomalyUpdates).length
                        : 0;
                    const comms = cc.enabled
                        ? computeCommsState(drone.position, hub.position, cc, now, commsQueueRef.current.filter((m) => m.droneId === drone.id).length, bufferSize)
                        : undefined;
                    const nextCommAlertBand = cc.enabled
                        ? getCommAlertBand({...drone, comms}, hub.position)
                        : "healthy";
                    const prevCommAlertBand = prevCommAlertBandRef.current[drone.id] ?? "healthy";
                    if (nextCommAlertBand !== "healthy" && commAlertBandRank[nextCommAlertBand] > commAlertBandRank[prevCommAlertBand]) {
                        const commAlert = createCommDegradationAlert({...drone, comms}, hub.position, now);
                        if (commAlert) commTransitionAlerts.push(commAlert);
                    }
                    prevCommAlertBandRef.current[drone.id] = nextCommAlertBand;

                    const commsSwarmDisabled = comms && comms.signalQuality < commsThresholds.swarmDisabledQuality;
                    const swarmAdj = (!drone.swarmEnabled && drone.swarmEnabled !== undefined) || drone.avoidanceOverride || commsSwarmDisabled ? undefined : swarmAdjustments[drone.id];
                    const queue = drone.waypoints ?? [];
                    let target = drone.targetPosition;
                    let remainingQueue = queue;
                    if (!target && remainingQueue.length > 0) {
                        const [nextTarget, ...rest] = remainingQueue;
                        target = nextTarget;
                        remainingQueue = rest;
                    }
                    const activeWaypoint = target ?? remainingQueue[0];
                    const drainMinutes = (dtSeconds / 60) * batteryDrainMultiplier;
                    const stillFlying = drone.status !== "landed";
                    const batteryMinutesRemaining = Math.max(0, drone.batteryMinutesRemaining - (stillFlying ? drainMinutes : 0));
                    const batteryPct = Math.max(0, Math.min(100, (batteryMinutesRemaining / drone.batteryLifeMinutes) * 100));
                    const returnMinutesRequired = computeReturnMinutes(drone);
                    const emergencyReserveMinutes = computeEmergencyReserve(drone);
                    const needsReturn = stillFlying && batteryMinutesRemaining <= emergencyReserveMinutes;
                    const statusBase = needsReturn ? "returning" : drone.status;

                    const warningState = batteryWarningStateRef.current[drone.id] ?? {
                        thresholds: new Set<number>(),
                        emergency: false
                    };
                    batteryWarningStateRef.current[drone.id] = warningState;

                    if (stillFlying && activeWaypoint) {
                        batteryWarningThresholds.forEach((threshold) => {
                            if (!warningState.thresholds.has(threshold) && batteryPct <= threshold) {
                                warningState.thresholds.add(threshold);
                                const waypointLabel = `${Math.round(activeWaypoint.x)},${Math.round(activeWaypoint.y)}`;
                                const isCritical = threshold <= 5;
                                events.push({
                                    id: createLogEntryId(`battery-${threshold}`, now, drone.id),
                                    timestamp: now,
                                    kind: isCritical ? "battery-emergency" : "battery-warning",
                                    droneId: drone.id,
                                    position: drone.position,
                                    batteryPct,
                                    batteryMinutesRemaining,
                                    returnMinutesRequired,
                                    message: isCritical
                                        ? `${drone.callsign} battery CRITICAL ${Math.round(batteryPct)}% - ${batteryMinutesRemaining.toFixed(1)} min remaining near (${waypointLabel}).`
                                        : `${drone.callsign} battery ${Math.round(batteryPct)}% near waypoint (${waypointLabel}).`
                                });
                            }
                        });
                    }

                    if (stillFlying && needsReturn && !warningState.emergency) {
                        warningState.emergency = true;
                        events.push({
                            id: createLogEntryId("battery-emergency", now, drone.id),
                            timestamp: now,
                            kind: "battery-emergency",
                            droneId: drone.id,
                            position: drone.position,
                            batteryPct,
                            batteryMinutesRemaining,
                            returnMinutesRequired,
                            message: `${drone.callsign} battery critical (${batteryMinutesRemaining.toFixed(1)} min left; needs ${emergencyReserveMinutes.toFixed(1)} min to reach hub). Returning to base.`
                        });
                    }

                    if (needsReturn) {
                        target = hub.position;
                        remainingQueue = [];
                    }

                    if (!target) {
                        if (remainingQueue !== queue || batteryMinutesRemaining !== drone.batteryMinutesRemaining || batteryPct !== drone.batteryPct || statusBase !== drone.status || returnMinutesRequired !== drone.returnMinutesRequired || emergencyReserveMinutes !== drone.emergencyReserveMinutes || comms !== drone.comms) {
                            return {
                                ...drone,
                                waypoints: remainingQueue,
                                batteryMinutesRemaining,
                                batteryPct,
                                status: statusBase === "landed" ? "landed" : statusBase,
                                returnMinutesRequired,
                                emergencyReserveMinutes,
                                comms,
                                lastUpdate: now
                            };
                        }
                        return drone;
                    }

                    const dx = target.x - drone.position.x;
                    const dy = target.y - drone.position.y;
                    const distance = Math.hypot(dx, dy);
                    const enrouteStatus = needsReturn || (isHubWaypoint(target) && remainingQueue.length === 0) ? "returning" : "enroute";
                    let headingDeg = distance > 0.001 ? (Math.atan2(dy, dx) * 180) / Math.PI : drone.headingDeg;
                    if (swarmAdj && Number.isFinite(swarmAdj.headingDeltaDeg)) {
                        headingDeg += swarmAdj.headingDeltaDeg;
                        if (headingDeg > 180) headingDeg -= 360;
                        if (headingDeg <= -180) headingDeg += 360;
                    }
                    const {effectiveSpeedKts} = computeWindAdjustedSpeedKts(drone.speedKts, headingDeg, envConditions);
                    const speedMs = effectiveSpeedKts * 0.514444;
                    if (speedMs <= 0) return {
                        ...drone,
                        batteryMinutesRemaining,
                        batteryPct,
                        status: statusBase,
                        returnMinutesRequired,
                        emergencyReserveMinutes,
                        comms,
                    };
                    const dirX = Math.cos((headingDeg * Math.PI) / 180);
                    const dirY = Math.sin((headingDeg * Math.PI) / 180);
                    const maxStep = speedMs * dtSeconds;
                    const nextPos = clampToBounds({
                        x: drone.position.x + dirX * maxStep,
                        y: drone.position.y + dirY * maxStep
                    });
                    const reached = maxStep >= distance || Math.hypot(target.x - nextPos.x, target.y - nextPos.y) < 0.1;
                    if (reached) {
                        if (remainingQueue.length > 0) {
                            const [nextTarget, ...rest] = remainingQueue;
                            const nextStatus = needsReturn || (isHubWaypoint(nextTarget) && rest.length === 0) ? "returning" : "enroute";
                            return {
                                ...drone,
                                position: clampToBounds(target),
                                headingDeg,
                                targetPosition: nextTarget,
                                waypoints: rest,
                                status: nextStatus,
                                batteryMinutesRemaining,
                                batteryPct,
                                returnMinutesRequired,
                                emergencyReserveMinutes,
                                comms,
                                lastUpdate: now
                            };
                        }
                        const atHub = isHubWaypoint(target);
                        return {
                            ...drone,
                            position: clampToBounds(target),
                            headingDeg,
                            targetPosition: undefined,
                            waypoints: [],
                            status: atHub ? "landed" : "idle",
                            batteryMinutesRemaining,
                            batteryPct,
                            returnMinutesRequired,
                            emergencyReserveMinutes,
                            comms,
                            lastUpdate: now
                        };
                    }
                    return {
                        ...drone,
                        position: nextPos,
                        headingDeg,
                        status: enrouteStatus,
                        targetPosition: target,
                        waypoints: remainingQueue,
                        batteryMinutesRemaining,
                        batteryPct,
                        returnMinutesRequired,
                        emergencyReserveMinutes,
                        comms,
                        lastUpdate: now
                    };
                }));
                if (events.length > 0) {
                    appendLogWithMetrics(events);
                    setMessage(events[0].message);
                    const newAlerts = generateAlertsFromTick({
                        drones: dronesRef.current,
                        hub: hub.position,
                        existingAlerts: alertsRef.current,
                        newLogEntries: events,
                        now,
                    });
                    if (newAlerts.length > 0) {
                        appendAlertsWithMetrics(newAlerts);
                        playForAlerts(newAlerts);
                    }
                }
                if (commTransitionAlerts.length > 0) {
                    appendAlertsWithMetrics(commTransitionAlerts);
                    playForAlerts(commTransitionAlerts);
                }
            } catch (err) {
                logError(err, {
                    severity: "fatal",
                    origin: "simulation.raf-step",
                    context: {
                        timestamp,
                        droneCount: dronesRef.current.length,
                        anomalyCount: scenarioRef.current.anomalies.items.length,
                    },
                });
            } finally {
                if (!isTerminatingRef.current) {
                    raf = requestAnimationFrame(step);
                }
            }
        };
        raf = requestAnimationFrame(step);
        return () => {
            isTerminatingRef.current = true;
            cancelAnimationFrame(raf);
            lastFrameRef.current = null;
        };
    }, [appendAlertsWithMetrics, appendLogWithMetrics, playForAlerts, clampToBounds, computeEmergencyReserve, computeReturnMinutes, hub.position.x, hub.position.y, setMessage, scenario.sector.bounds, swarmEnabledGlobal]);

    useEffect(() => {
        if (!sensorsEnabled) return;
        const interval = window.setInterval(() => {
            try {
                if (isPausedRef.current || isTerminatingRef.current) return;
                const now = simNowRef.current;
                const previousSensorTick = lastSensorTickSimRef.current ?? now;
                const elapsedSensorSimMs = Math.max(0, now - previousSensorTick);
                lastSensorTickSimRef.current = now;
                const currentScenario = scenarioRef.current;
                const currentDrones = dronesRef.current;
                const cc = commsConfigRef.current;
                if (!currentScenario || currentDrones.length === 0) return;
                const environmentalSensorMultiplier = computeEnvironmentalSensorMultiplier(currentScenario.sector.conditions);
                const environmentalFalsePositiveMultiplier = computeEnvironmentalFalsePositiveMultiplier(currentScenario.sector.conditions);
                let updatedItems = currentScenario.anomalies.items;
                let changed = false;
                const events: DetectionLogEntry[] = [];
                const range = Math.max(10, sensorSettings.rangeMeters);
                const opportunityAnomalyIds = new Set<string>();
                currentDrones.forEach((drone) => {
                    const sensorMultiplier = (cc.enabled && drone.comms && drone.comms.signalQuality < commsThresholds.reducedSensorQuality)
                        ? 0.5
                        : 1.0;

                    const isDisconnected = cc.enabled && drone.comms && !drone.comms.connected;

                    currentScenario.anomalies.items.forEach((anomaly, idx) => {
                        const dx = anomaly.position.x - drone.position.x;
                        const dy = anomaly.position.y - drone.position.y;
                        const distance = Math.hypot(dx, dy);
                        if (distance > range) return;
                        if (anomaly.type !== "false-positive") opportunityAnomalyIds.add(anomaly.id);
                        const rawConfidence = detectionProbability(distance);
                        const confidence = Math.min(1, Math.max(0, rawConfidence * sensorMultiplier * environmentalSensorMultiplier));

                        if (isDisconnected) {
                            if (!offlineBufferRef.current[drone.id]) {
                                offlineBufferRef.current[drone.id] = {events: [], anomalyUpdates: {}};
                            }
                            const buffer = offlineBufferRef.current[drone.id];

                            const certaintyGain = confidence * 0.08;
                            if (certaintyGain > 0.001) {
                                const existing = buffer.anomalyUpdates[anomaly.id];
                                if (existing) {
                                    existing.totalCertaintyGain += certaintyGain;
                                } else {
                                    buffer.anomalyUpdates[anomaly.id] = {
                                        anomalyId: anomaly.id,
                                        totalCertaintyGain: certaintyGain,
                                        detected: false,
                                    };
                                }
                            }

                            const roll = Math.random();
                            if (roll <= confidence && !anomaly.detected) {
                                const existing = buffer.anomalyUpdates[anomaly.id];
                                if (existing) {
                                    existing.detected = true;
                                } else {
                                    buffer.anomalyUpdates[anomaly.id] = {
                                        anomalyId: anomaly.id,
                                        totalCertaintyGain: 0,
                                        detected: true,
                                    };
                                }
                                buffer.events.push({
                                    id: createLogEntryId("hit", now, drone.id, anomaly.id),
                                    timestamp: now,
                                    kind: "detected",
                                    droneId: drone.id,
                                    anomalyId: anomaly.id,
                                    anomalyType: anomaly.type,
                                    position: anomaly.position,
                                    confidence,
                                    message: `${drone.callsign} detected ${anomalyTypeLabels[anomaly.type]} (buffered offline)`
                                });
                            } else if (roll > confidence && !anomaly.detected) {
                                const missKey = `${drone.id}-${anomaly.id}`;
                                const lastMiss = lastFalseNegativeRef.current[missKey] ?? 0;
                                if (now - lastMiss > sensorSettings.checkIntervalMs * 2) {
                                    lastFalseNegativeRef.current[missKey] = now;
                                    buffer.events.push({
                                        id: createLogEntryId("miss", now, drone.id, anomaly.id),
                                        timestamp: now,
                                        kind: "false-negative",
                                        droneId: drone.id,
                                        anomalyId: anomaly.id,
                                        anomalyType: anomaly.type,
                                        position: anomaly.position,
                                        confidence,
                                        message: `${drone.callsign} missed ${anomalyTypeLabels[anomaly.type]} (${Math.round(confidence * 100)}% expected, buffered offline)`
                                    });
                                }
                            }
                            return;
                        }

                        const prevCertainty = (updatedItems === currentScenario.anomalies.items ? anomaly : updatedItems[idx]).scanCertainty ?? 0;
                        const certaintyGain = confidence * 0.08;
                        const newCertainty = Math.min(1, prevCertainty + certaintyGain);
                        if (newCertainty > prevCertainty + 0.001) {
                            if (!changed) updatedItems = [...updatedItems];
                            updatedItems[idx] = {...updatedItems[idx], scanCertainty: newCertainty};
                            changed = true;
                        }

                        const roll = Math.random();
                        if (roll <= confidence) {
                            if (!anomaly.detected) {
                                if (!changed) updatedItems = [...updatedItems];
                                updatedItems[idx] = {...anomaly, detected: true};
                                changed = true;
                                events.push({
                                    id: createLogEntryId("hit", now, drone.id, anomaly.id),
                                    timestamp: now,
                                    kind: "detected",
                                    droneId: drone.id,
                                    anomalyId: anomaly.id,
                                    anomalyType: anomaly.type,
                                    position: anomaly.position,
                                    confidence,
                                    message: `${drone.callsign} detected ${anomalyTypeLabels[anomaly.type]}`
                                });
                            }
                        } else if (!anomaly.detected) {
                            const missKey = `${drone.id}-${anomaly.id}`;
                            const lastMiss = lastFalseNegativeRef.current[missKey] ?? 0;
                            if (now - lastMiss > sensorSettings.checkIntervalMs * 2) {
                                lastFalseNegativeRef.current[missKey] = now;
                                events.push({
                                    id: createLogEntryId("miss", now, drone.id, anomaly.id),
                                    timestamp: now,
                                    kind: "false-negative",
                                    droneId: drone.id,
                                    anomalyId: anomaly.id,
                                    anomalyType: anomaly.type,
                                    position: anomaly.position,
                                    confidence,
                                    message: `${drone.callsign} missed ${anomalyTypeLabels[anomaly.type]} (${Math.round(confidence * 100)}% expected)`
                                });
                            }
                        }
                    });

                    if (!isDisconnected) {
                        const falsePositiveChance = sensorSettings.falsePositiveRatePerMinute
                            * (elapsedSensorSimMs / 60000)
                            * environmentalFalsePositiveMultiplier;
                        if (Math.random() < falsePositiveChance) {
                            const angle = Math.random() * Math.PI * 2;
                            const radius = Math.random() * range * 0.9;
                            const position = clampToBounds({
                                x: drone.position.x + Math.cos(angle) * radius,
                                y: drone.position.y + Math.sin(angle) * radius
                            });
                            const id = `fp-${Math.random().toString(36).slice(2, 8)}-${now}`;
                            const falsePositive: AnomalyInstance = {
                                id,
                                type: "false-positive",
                                position,
                                detected: true,
                                detectionRadiusMeters: currentScenario.anomalies.config["false-positive"].detectionRadiusMeters,
                                note: `False positive from ${drone.callsign}`
                            };
                            updatedItems = [...updatedItems, falsePositive];
                            changed = true;
                            events.push({
                                id: createLogEntryId("fp-log", now, drone.id, id),
                                timestamp: now,
                                kind: "false-positive",
                                droneId: drone.id,
                                anomalyId: id,
                                anomalyType: "false-positive",
                                position,
                                message: `${drone.callsign} reported possible contact (false positive)`
                            });
                        }
                    }
                });
                if (changed) updateAnomalies(() => updatedItems);
                if (metricsCollectionEnabledRef.current && opportunityAnomalyIds.size > 0) {
                    setMetrics((prev) => recordAnomalyOpportunities(prev, [...opportunityAnomalyIds], now));
                }

                if (cc.enabled && events.length > 0) {
                    const immediateEvents: DetectionLogEntry[] = [];
                    let attemptedCount = 0;
                    let droppedCount = 0;
                    let queuedCount = 0;
                    let queuedLatencyTotalMs = 0;
                    events.forEach((evt) => {
                        attemptedCount += 1;
                        const drone = currentDrones.find((d) => d.id === evt.droneId);
                        const lossRate = drone?.comms?.packetLossRate ?? cc.basePacketLossPct;
                        const latency = drone?.comms?.latencyMs ?? cc.baseLatencyMs;

                        if (shouldDropPacket(lossRate, Math.random())) {
                            droppedCount += 1;
                            return;
                        }

                        if (latency > 5) {
                            commsQueueRef.current = enqueueMessage(
                                commsQueueRef.current,
                                evt.id,
                                evt,
                                latency,
                                now,
                                evt.droneId ?? "unknown",
                            );
                            queuedCount += 1;
                            queuedLatencyTotalMs += latency;
                        } else {
                            immediateEvents.push(evt);
                        }
                    });
                    if (metricsCollectionEnabledRef.current) {
                        setMetrics((prev) => recordPacketDispatch(prev, scenarioRef.current, {
                            timestamp: now,
                            attempted: attemptedCount,
                            dropped: droppedCount,
                            queued: queuedCount,
                            delivered: immediateEvents.length,
                            queuedLatencyTotalMs,
                        }));
                    }

                    if (immediateEvents.length > 0) {
                        appendLogWithMetrics(immediateEvents);
                        setMessage(immediateEvents[0].message);
                        const newAlerts = generateAlertsFromTick({
                            drones: dronesRef.current,
                            hub: hub.position,
                            existingAlerts: alertsRef.current,
                            newLogEntries: immediateEvents,
                            now,
                        });
                        if (newAlerts.length > 0) {
                            appendAlertsWithMetrics(newAlerts);
                            playForAlerts(newAlerts);
                        }
                    }
                } else if (events.length > 0) {
                    appendLogWithMetrics(events);
                    setMessage(events[0].message);
                    const newAlerts = generateAlertsFromTick({
                        drones: dronesRef.current,
                        hub: hub.position,
                        existingAlerts: alertsRef.current,
                        newLogEntries: events,
                        now,
                    });
                    if (newAlerts.length > 0) {
                        appendAlertsWithMetrics(newAlerts);
                        playForAlerts(newAlerts);
                    }
                }
            } catch (err) {
                logError(err, {
                    severity: "fatal",
                    origin: "simulation.sensor-tick",
                    context: {
                        checkIntervalMs: sensorSettings.checkIntervalMs,
                        droneCount: dronesRef.current.length,
                        anomalyCount: scenarioRef.current.anomalies.items.length,
                    },
                });
            }
        }, sensorSettings.checkIntervalMs);
        return () => window.clearInterval(interval);
    }, [appendAlertsWithMetrics, appendLogWithMetrics, playForAlerts, clampToBounds, detectionProbability, sensorSettings.checkIntervalMs, sensorSettings.falsePositiveRatePerMinute, sensorSettings.rangeMeters, sensorsEnabled, setMessage, updateAnomalies]);

    const handleBackToSetup = () => {
        isTerminatingRef.current = true;
        isPausedRef.current = true;
        setIsPaused(true);
        setPhase("setup");
        navigate("/setup");
    };

    const handleEndMission = useCallback(() => {
        isTerminatingRef.current = true;
        isPausedRef.current = true;
        setIsPaused(true);
        const now = simNowRef.current;
        const endedAt = Date.now();
        const currentAlerts = alertsRef.current;
        const finalized = sampleMissionMetrics(metrics, {
            now,
            scenario: scenarioRef.current,
            drones: dronesRef.current,
            unacknowledgedAlerts: currentAlerts.filter((alert) => !alert.acknowledged).length,
            criticalAlertCount: currentAlerts.filter((alert) => !alert.acknowledged && alert.severity === "critical").length,
            manualInterventionEnabled: manualInterventionEnabledRef.current,
            sensorRangeMeters: sensorSettings.rangeMeters,
        });
        setMetrics(finalized);
        updateMetricsCollectionEnabled(false);
        setCoverageActive(false);
        setManualInterventionEnabled(false);
        finalizeMission({metrics: finalized, endedAt, endReason: "manual-end"});
        setPhase("debrief");
        navigate("/mission-end");
    }, [finalizeMission, metrics, navigate, sensorSettings.rangeMeters, setCoverageActive, setManualInterventionEnabled, setPhase, updateMetricsCollectionEnabled]);

    const canvasMetricsProps = {
        coverageHeatmap: metrics.coverage,
        metricsSummary: metrics.summary,
    } as unknown as Record<string, unknown>;

    return (
        <AppShell subtitle="Active Mission">
            <PageTransition>
                <div className="simulation-container content-with-drawer">
                    <nav className="setup-nav" aria-label="Mission navigation">
                        <button className="btn ghost btn-sm" onClick={handleBackToSetup}>← Back to Setup</button>
                        <div className="sim-status-bar" role="status" aria-live="polite"
                             data-tutorial-id="sim-status-bar">
                            <span><strong>Drones</strong> {drones.length}</span>
                            <span><strong>Detected</strong> {scenario.anomalies.items.filter((a) => a.detected).length}/{scenario.anomalies.items.length}</span>
                            <span><strong>Sea state</strong> {sectorMeta.conditions.seaState}</span>
                            <span><strong>Wind</strong> {sectorMeta.conditions.windKts} kts @{sectorMeta.conditions.windDirectionDeg ?? 0}deg</span>
                            <span><strong>Visibility</strong> {sectorMeta.conditions.visibilityKm} km</span>
                            <span><strong>Playback</strong> {isPaused ? "Paused" : `${simulationSpeed}x`}</span>
                            {commsConfig.enabled && drones.some((d) => d.comms) && (() => {
                                const connected = drones.filter((d) => d.comms?.connected).length;
                                const total = drones.filter((d) => d.comms).length;
                                const avgQ = total > 0 ? drones.filter((d) => d.comms).reduce((s, d) => s + d.comms!.signalQuality, 0) / total : 1;
                                const color = signalQualityColor(avgQ);
                                return (
                                    <span style={{display: "inline-flex", alignItems: "center", gap: 4}}>
                                        <span style={{
                                            width: 8,
                                            height: 8,
                                            borderRadius: "50%",
                                            background: color,
                                            display: "inline-block"
                                        }}/>
                                        <strong>Comms</strong> {connected}/{total}
                                    </span>
                                );
                            })()}
                            {unacknowledgedAlertCount > 0 && (
                                <span className="status-alert-badge"
                                      aria-label={`${unacknowledgedAlertCount} unacknowledged alerts`}>
                                    <strong>Alerts</strong> {unacknowledgedAlertCount}
                                </span>
                            )}
                        </div>
                    </nav>

                    <div className="viewer-row">
                        <MetricsDashboard
                            metrics={metrics}
                            onExportJSON={handleExportMetricsJSON}
                            onExportSummaryCSV={handleExportMetricsSummaryCSV}
                            onExportTimelineCSV={handleExportMetricsTimelineCSV}
                            onExportEventsCSV={handleExportMetricsEventsCSV}
                        />

                        <div className="sim-map-overlay-host" data-tutorial-id="sim-map-canvas">
                            <MaritimeCanvas2D
                                gridSpacing={200}
                                scenario={scenario}
                                onToggleAnomaly={handleToggleAnomaly}
                                drones={drones}
                                selectedDroneIds={selectedDroneIds}
                                onSelectDrones={select}
                                onAddDronesToSelection={add}
                                onToggleDroneSelection={toggle}
                                onClearDroneSelection={clear}
                                onMoveDrone={interactionLocked ? undefined : handleDronePositionChange}
                                onSetWaypoint={interactionLocked ? undefined : handleSetWaypoint}
                                showSensorRange={sensorsEnabled && showSensorRanges}
                                sensorRangeMeters={sensorSettings.rangeMeters}
                                voronoiCells={voronoiEnabled ? voronoiCells : []}
                                coveragePlans={coveragePlans}
                                fogOfWarEnabled={fogOfWarEnabled}
                                scanValidationActive={scanValidationActive}
                                alerts={alerts}
                                {...canvasMetricsProps}
                            />
                            <div
                                className={`sim-map-controls-overlay ${mapControlsOpen ? "open" : "closed"}`}
                                role="group"
                                aria-label="Mission playback controls"
                            >
                                <button
                                    className="btn btn-sm sim-map-controls-toggle"
                                    onClick={toggleMapControls}
                                    aria-expanded={mapControlsOpen}
                                    aria-controls="sim-map-controls-panel"
                                >
                                    Controls {mapControlsOpen ? "▲" : "▼"}
                                </button>
                                <div className="sim-map-controls-panel" id="sim-map-controls-panel">
                                    <button className="btn ghost btn-sm"
                                            onClick={handleTogglePause}>{isPaused ? "Play" : "Pause"}</button>
                                    <button className="btn ghost btn-sm" onClick={handleFastForward}>Fast-Forward
                                        ({simulationSpeed}x)
                                    </button>
                                    <button className="btn btn-sm" onClick={handleEndMission}>End Mission</button>
                                </div>
                            </div>
                        </div>

                        <div className="sim-side-panels">
                            <AlertPanel
                                alerts={alerts}
                                onAcknowledge={handleAcknowledgeAlert}
                                onAcknowledgeAll={handleAcknowledgeAllAlerts}
                            />

                            <div className="panel-card" role="status" aria-live="polite"
                                 aria-label="Environment effects">
                                <div className="badge" style={{marginBottom: 8}}>
                                    <span className="badge-dot" aria-hidden="true"/> Environment Effects
                                </div>
                                <div className="log-meta" style={{marginBottom: 6}}>Live environmental impact on mission
                                    performance
                                </div>
                                <div style={{display: "grid", gap: 4, fontSize: 12}}>
                                    <div><strong>Sensor efficiency</strong> {environmentEffects.sensorPct.toFixed(0)}%
                                    </div>
                                    <div><strong>Battery drain</strong> {environmentEffects.batteryPct.toFixed(0)}%
                                    </div>
                                    <div>
                                        <strong>Wind
                                            ({environmentEffects.windState})</strong> {environmentEffects.windDeltaPct >= 0 ? "+" : ""}
                                        {environmentEffects.windDeltaPct.toFixed(1)}%
                                    </div>
                                </div>
                            </div>

                            <div className="panel-card detection-log-panel" aria-labelledby="detection-log-heading"
                                 data-tutorial-id="sim-detection-log">
                                <div className="badge" style={{marginBottom: 8}} id="detection-log-heading">
                                    <span className="badge-dot" aria-hidden="true"/> Detection Log
                                </div>
                                <div className="log-meta">Newest first · max {sensorSettings.logLimit}</div>
                                <div className="log-scroll" role="log" aria-live="polite" aria-relevant="additions">
                                    {detectionLog.length === 0 && <div className="log-empty">No detections yet.</div>}
                                    {detectionLog.map((entry) => (
                                        <div key={entry.id}
                                             className={`callout callout-log ${entry.kind === "battery-emergency" ? "danger" : entry.kind === "battery-warning" ? "warning" : ""}`}>
                                            <div className="log-entry-msg">{entry.message}</div>
                                            <div className="log-entry-meta">
                                                {new Date(entry.timestamp).toLocaleTimeString()} · {entry.kind}
                                                {entry.droneId ? ` · ${entry.droneId}` : ""}
                                                {entry.anomalyType ? ` · ${entry.anomalyType}` : ""}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {createPortal(
                    <div className={`scenario-drawer ${drawerOpen ? "open" : "closed"}`}>
                        <div className="drawer-surface">
                            <button className="drawer-handle" onClick={toggleDrawer} aria-expanded={drawerOpen}
                                    data-tutorial-id="sim-mission-controls"
                                    aria-controls="sim-drawer-body">
                                <span style={{fontWeight: 700}}>Mission Controls</span>
                                <span className="drawer-hint">{drawerOpen ? "Hide" : "Show"}</span>
                                <span className="drawer-chevron" aria-hidden="true">{drawerOpen ? "▼" : "▲"}</span>
                            </button>
                            <div className="drawer-body" id="sim-drawer-body">
                                <div className="panel-card drawer-panel">
                                    <div className="drawer-commands">
                                        <Badge style={{marginBottom: 8}}>Drone Commands</Badge>
                                        <ControlGrid>
                                            <Field label="Spawn point">
                                                <select className="field-input" value={selectedSpawnPointId}
                                                        onChange={(e) => setSelectedSpawnPointId(e.target.value)}>
                                                    {spawnPoints.map((point) => (
                                                        <option key={point.id}
                                                                value={point.id}>{point.label}</option>))}
                                                </select>
                                            </Field>
                                            <Field label="Drone model">
                                                <select className="field-input" value={selectedDroneModelId}
                                                        onChange={(e) => setSelectedDroneModelId(e.target.value)}>
                                                    {droneModels.map((model) => (
                                                        <option key={model.id}
                                                                value={model.id}>{model.label}</option>))}
                                                </select>
                                            </Field>
                                            <Field label=" " className="field" as="div">
                                                <div style={{
                                                    display: "flex",
                                                    gap: 8,
                                                    alignItems: "flex-end",
                                                    flexWrap: "wrap"
                                                }}>
                                                    <button className="btn" onClick={() => {
                                                        handleSpawnDrone();
                                                        recordManualMetric("Spawned a drone into the mission.", 1);
                                                    }}>Spawn Drone
                                                    </button>
                                                    <button className="btn ghost"
                                                            onClick={() => select(drones.map((d) => d.id))}>Select All
                                                    </button>
                                                    <button className="btn ghost" onClick={clear}>Deselect All</button>
                                                    <button
                                                        className="btn ghost btn-delete"
                                                        onClick={handleDeleteSelected}
                                                        disabled={selectedDroneIds.length === 0}
                                                        aria-label="Delete selected drones"
                                                    >
                                                        Delete Selected
                                                    </button>
                                                </div>
                                                <div className="field-hint" style={{marginTop: 6}}>
                                                    Use checkboxes to multi-select · Click pill to select one ·
                                                    Press <kbd
                                                    className="kbd">Delete</kbd> to remove selected
                                                </div>
                                            </Field>
                                            <Field label="Return to Base">
                                                <div style={{
                                                    display: "flex",
                                                    gap: 8,
                                                    flexWrap: "wrap",
                                                    alignItems: "center"
                                                }}>
                                                    <button className="btn" onClick={handleRTBImmediate}>RTB Immediately
                                                    </button>
                                                    <button className="btn ghost" onClick={handleRTBAfterCompletion}>RTB
                                                        After Completion
                                                    </button>
                                                    <span
                                                        className="field-hint">Applies to {selectedDroneIds.length > 0 ? "selected" : "all"} drones.</span>
                                                </div>
                                            </Field>
                                        </ControlGrid>
                                    </div>

                                    {drones.length > 0 && (
                                        <div className="drawer-drone-list-section">
                                            <Badge style={{marginBottom: 6}}>Active Drones ({drones.length})</Badge>
                                            <div className="drawer-drone-scroll" role="list" aria-label="Active drones">
                                                {drones.map((drone) => {
                                                    const isSelected = selectedDroneIds.includes(drone.id);
                                                    const effectiveSpeed = computeWindAdjustedSpeedKts(
                                                        drone.speedKts,
                                                        drone.headingDeg,
                                                        scenario.sector.conditions,
                                                    ).effectiveSpeedKts;
                                                    return (
                                                        <div key={drone.id} className="drone-pill-row" role="listitem">
                                                            <input
                                                                type="checkbox"
                                                                className="drone-select-checkbox"
                                                                checked={isSelected}
                                                                onChange={(e) => handleToggleDroneCheckbox(drone.id, e.target.checked)}
                                                                aria-label={`Select ${drone.callsign}`}
                                                                title={`Toggle selection for ${drone.callsign}`}
                                                            />
                                                            <button
                                                                className={`drone-pill${isSelected ? " active" : ""}`}
                                                                onClick={(event) => handleSelectDroneFromList(drone.id, event)}
                                                                aria-pressed={isSelected}
                                                                style={{flex: 1}}
                                                            >
                                                                <span>{drone.callsign}</span>
                                                                <span className="drone-meta">{drone.status}</span>
                                                                <span
                                                                    className="drone-meta">· {Math.round(drone.batteryPct)}%</span>
                                                                <span
                                                                    className="drone-meta">· {drone.batteryMinutesRemaining.toFixed(1)} min left</span>
                                                                <span
                                                                    className="drone-meta">· Hub {drone.returnMinutesRequired.toFixed(1)} min</span>
                                                                <span
                                                                    className="drone-meta">· Emergency at {drone.emergencyReserveMinutes.toFixed(1)} min</span>
                                                                {drone.comms && (
                                                                    <span className="drone-meta"
                                                                          title={`Signal: ${signalQualityLabel(drone.comms.signalQuality)} · Latency: ${Math.round(drone.comms.latencyMs)} ms · Loss: ${(drone.comms.packetLossRate * 100).toFixed(1)}% · ${(drone.comms.distanceFromHub / 1000).toFixed(1)} km${drone.comms.offlineBufferSize > 0 ? ` · ${drone.comms.offlineBufferSize} buffered` : ""}`}
                                                                          style={{
                                                                              display: "inline-flex",
                                                                              alignItems: "center",
                                                                              gap: 3
                                                                          }}>
                                                                    · <span style={{
                                                                        width: 7,
                                                                        height: 7,
                                                                        borderRadius: "50%",
                                                                        background: signalQualityColor(drone.comms.signalQuality),
                                                                        display: "inline-block",
                                                                        flexShrink: 0,
                                                                    }}/>
                                                                        {signalQualityLabel(drone.comms.signalQuality)}
                                                                        {!drone.comms.connected && " (LOST)"}
                                                                        {drone.comms.offlineBufferSize > 0 && (
                                                                            <span style={{
                                                                                color: "var(--color-warning)",
                                                                                fontWeight: 600
                                                                            }}>
                                                                            {" "}· {drone.comms.offlineBufferSize} buffered
                                                                        </span>
                                                                        )}
                                                                </span>
                                                                )}
                                                            </button>
                                                            <div style={{
                                                                display: "flex",
                                                                flexDirection: "column",
                                                                gap: 4,
                                                                alignItems: "flex-end"
                                                            }}>
                                                                <label className="speed-label">
                                                                    <span className="drone-meta">Speed</span>
                                                                    <input type="number" min={0} step={1}
                                                                           value={drone.speedKts}
                                                                           aria-label={`Speed for ${drone.callsign}`}
                                                                           onChange={(e) => handleDroneSpeedChange(drone.id, Math.max(0, Number(e.target.value)))}
                                                                           style={{width: 70}}/>
                                                                    <span className="drone-meta">kts</span>
                                                                </label>
                                                                <span
                                                                    className="drone-meta">Ground {effectiveSpeed.toFixed(1)} kts</span>
                                                                <label style={{
                                                                    display: "flex",
                                                                    alignItems: "center",
                                                                    gap: 4,
                                                                    fontSize: 11
                                                                }}>
                                                                    <input type="checkbox"
                                                                           checked={!!drone.avoidanceOverride}
                                                                           onChange={(e) => {
                                                                               const checked = e.target.checked;
                                                                               setDrones((prev) => prev.map((d) => d.id === drone.id ? {
                                                                                   ...d,
                                                                                   avoidanceOverride: checked
                                                                               } : d));
                                                                               recordManualMetric(`${checked ? "Enabled" : "Disabled"} avoidance override for ${drone.callsign}.`, 1);
                                                                           }}/>
                                                                    <span
                                                                        className="drone-meta">Override avoidance</span>
                                                                </label>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}

                                    <Badge style={{marginTop: 16, marginBottom: 8}}>Sensors</Badge>
                                    <ControlGrid>
                                        <Field label="Sensors enabled">
                                            <label style={{display: "flex", alignItems: "center", gap: 8}}>
                                                <input type="checkbox" checked={sensorsEnabled}
                                                       onChange={(e) => setSensorsEnabled(e.target.checked)}/>
                                                <span>Run detection loop</span>
                                            </label>
                                        </Field>
                                        <Field label="Show ranges">
                                            <label style={{display: "flex", alignItems: "center", gap: 8}}>
                                                <input type="checkbox" checked={showSensorRanges}
                                                       onChange={(e) => setShowSensorRanges(e.target.checked)}/>
                                                <span>Draw sensor radius</span>
                                            </label>
                                        </Field>
                                        <Field label="Alert audio">
                                            <label style={{display: "flex", alignItems: "center", gap: 8}}>
                                                <input type="checkbox" checked={alertAudioEnabled}
                                                       onChange={(e) => setAlertAudioEnabled(e.target.checked)}/>
                                                <span>Play EICAS tones</span>
                                            </label>
                                            <div className="field-hint" style={{marginTop: 4}}>
                                                Critical = triple beep · High = double beep
                                            </div>
                                        </Field>
                                    </ControlGrid>

                                    <Badge style={{marginTop: 16, marginBottom: 8}}>Coverage</Badge>
                                    <ControlGrid>
                                        <Field label="Voronoi coverage">
                                            <div style={{
                                                display: "flex",
                                                gap: 8,
                                                flexWrap: "wrap",
                                                alignItems: "center"
                                            }}>
                                                <button className="btn" onClick={handleRunVoronoi}
                                                        data-tutorial-id="sim-run-coverage">Run Coverage
                                                </button>
                                                <button className="btn ghost" onClick={handleClearVoronoi}
                                                        disabled={!voronoiEnabled || voronoiCells.length === 0}>Clear
                                                    Overlay
                                                </button>
                                                <span
                                                    className="field-hint">Uses {coverageSourceCount} drone{coverageSourceCount === 1 ? "" : "s"} ({selectedDroneIds.length > 0 ? "selected" : "all"}).</span>
                                            </div>
                                        </Field>
                                        <Field label="Sweep overlap (%)">
                                            <div style={{
                                                display: "flex",
                                                gap: 8,
                                                alignItems: "center",
                                                flexWrap: "wrap"
                                            }}>
                                                <input className="field-input" type="number" min={10} max={20} step={1}
                                                       value={Math.round(coverageOverlap * 100)}
                                                       onChange={(e) => setCoverageOverlap(Math.min(0.2, Math.max(0.1, Number(e.target.value) / 100)))}
                                                       style={{width: 90}}/>
                                                <span className="field-hint">Spacing {sweepSpacingMeters} m</span>
                                            </div>
                                        </Field>
                                        <Field label="Lawnmower">
                                            <div style={{
                                                display: "flex",
                                                gap: 8,
                                                flexWrap: "wrap",
                                                alignItems: "center"
                                            }}>
                                                <button className="btn" onClick={handleStartCoverage}
                                                        data-tutorial-id="sim-start-coverage">Start Coverage
                                                </button>
                                                <span className="field-hint">Generates boustrophedon sweeps.</span>
                                            </div>
                                        </Field>
                                    </ControlGrid>

                                    <Badge style={{marginTop: 16, marginBottom: 8}}>Autonomy</Badge>
                                    <ControlGrid>
                                        <Field label="Manual intervention">
                                            <label style={{display: "flex", alignItems: "center", gap: 8}}>
                                                <input
                                                    type="checkbox"
                                                    checked={manualInterventionEnabled}
                                                    onChange={(e) => {
                                                        setManualInterventionEnabled(e.target.checked);
                                                        recordManualMetric(`${e.target.checked ? "Enabled" : "Disabled"} manual intervention mode.`, undefined, "coverage-command");
                                                    }}
                                                    disabled={!coverageActive}
                                                />
                                                <span>Allow drone repositioning &amp; waypoints</span>
                                            </label>
                                            <div className="field-hint" style={{marginTop: 4}}>
                                                {coverageActive
                                                    ? manualInterventionEnabled
                                                        ? "Manual control enabled. Select drones and click to assign waypoints."
                                                        : "Drones are following autonomous coverage paths."
                                                    : "Start coverage first to toggle manual intervention."}
                                            </div>
                                        </Field>
                                        <Field label="Fog of war">
                                            <label style={{display: "flex", alignItems: "center", gap: 8}}>
                                                <input
                                                    type="checkbox"
                                                    checked={fogOfWarEnabled}
                                                    onChange={(e) => {
                                                        setFogOfWarEnabled(e.target.checked);
                                                        if (!e.target.checked) setScanValidationActive(false);
                                                    }}
                                                />
                                                <span>Hide anomalies until scanned</span>
                                            </label>
                                            <div className="field-hint" style={{marginTop: 4}}>
                                                Anomalies are revealed progressively as drones scan nearby, with visual
                                                certainty levels.
                                            </div>
                                        </Field>
                                        <Field label="Scan validation">
                                            <div style={{
                                                display: "flex",
                                                gap: 8,
                                                flexWrap: "wrap",
                                                alignItems: "center"
                                            }}>
                                                <button
                                                    className={`btn${scanValidationActive ? " ghost" : ""}`}
                                                    onClick={() => setScanValidationActive((prev) => !prev)}
                                                    disabled={!fogOfWarEnabled}
                                                >
                                                    {scanValidationActive ? "Hide Validation" : "Validate Scans"}
                                                </button>
                                                {!fogOfWarEnabled && (
                                                    <span className="field-hint">Enable Fog of War first.</span>
                                                )}
                                            </div>
                                            {scanValidationActive && (() => {
                                                const realItems = scenario.anomalies.items.filter((a) => a.type !== "false-positive");
                                                const detectedCount = realItems.filter((a) => a.detected).length;
                                                const missedCount = realItems.length - detectedCount;
                                                const allFound = missedCount === 0;
                                                return (
                                                    <div
                                                        className={`callout ${allFound ? "success" : "danger"}`}
                                                        role="status"
                                                        aria-live="polite"
                                                        style={{marginTop: 8}}
                                                    >
                                                        <strong>{detectedCount}/{realItems.length}</strong> anomalies
                                                        detected
                                                        {missedCount > 0
                                                            ? ` · ${missedCount} missed, they are highlighted on the map with pulsing red markers.`
                                                            : " all anomalies found! ✓"}
                                                    </div>
                                                );
                                            })()}
                                        </Field>
                                    </ControlGrid>

                                    <Badge style={{marginTop: 16, marginBottom: 8}}>Communications</Badge>
                                    <ControlGrid>
                                        <Field label="Comms degradation">
                                            <label style={{display: "flex", alignItems: "center", gap: 8}}>
                                                <input
                                                    type="checkbox"
                                                    checked={commsConfig.enabled}
                                                    onChange={(e) => setCommsConfig((prev) => ({
                                                        ...prev,
                                                        enabled: e.target.checked
                                                    }))}
                                                />
                                                <span>Simulate comm degradation</span>
                                            </label>
                                            <div className="field-hint" style={{marginTop: 4}}>
                                                Models distance-based signal decay, packet loss, and latency per
                                                Zulkifley et al. (2021).
                                            </div>
                                        </Field>
                                        <Field label="Base latency (ms)">
                                            <div style={{display: "flex", gap: 8, alignItems: "center"}}>
                                                <input
                                                    className="field-input" type="number" min={0} max={200} step={1}
                                                    value={commsConfig.baseLatencyMs}
                                                    disabled={!commsConfig.enabled}
                                                    onChange={(e) => setCommsConfig((prev) => ({
                                                        ...prev,
                                                        baseLatencyMs: Math.max(0, Number(e.target.value))
                                                    }))}
                                                    style={{width: 80}}
                                                />
                                                <span className="field-hint">C2 spec: &lt; 50 ms</span>
                                            </div>
                                        </Field>
                                        <Field label="Max latency (ms)">
                                            <div style={{display: "flex", gap: 8, alignItems: "center"}}>
                                                <input
                                                    className="field-input" type="number" min={0} max={500} step={1}
                                                    value={commsConfig.maxLatencyMs}
                                                    disabled={!commsConfig.enabled}
                                                    onChange={(e) => setCommsConfig((prev) => ({
                                                        ...prev,
                                                        maxLatencyMs: Math.max(0, Number(e.target.value))
                                                    }))}
                                                    style={{width: 80}}
                                                />
                                                <span className="field-hint">Measured: up to 94 ms</span>
                                            </div>
                                        </Field>
                                        <Field label="Packet loss (%)">
                                            <div style={{display: "flex", gap: 8, alignItems: "center"}}>
                                                <input
                                                    className="field-input" type="number" min={0} max={50} step={0.1}
                                                    value={Math.round(commsConfig.maxPacketLossPct * 1000) / 10}
                                                    disabled={!commsConfig.enabled}
                                                    onChange={(e) => setCommsConfig((prev) => ({
                                                        ...prev,
                                                        maxPacketLossPct: Math.min(0.5, Math.max(0, Number(e.target.value) / 100))
                                                    }))}
                                                    style={{width: 80}}
                                                />
                                                <span className="field-hint">Max at full degradation</span>
                                            </div>
                                        </Field>
                                        <Field label="Degradation start (m)">
                                            <div style={{display: "flex", gap: 8, alignItems: "center"}}>
                                                <input
                                                    className="field-input" type="number" min={100} max={10000}
                                                    step={100}
                                                    value={commsConfig.degradationStartMeters}
                                                    disabled={!commsConfig.enabled}
                                                    onChange={(e) => setCommsConfig((prev) => ({
                                                        ...prev,
                                                        degradationStartMeters: Math.max(100, Number(e.target.value))
                                                    }))}
                                                    style={{width: 90}}
                                                />
                                                <span className="field-hint">Distance from hub</span>
                                            </div>
                                        </Field>
                                        <Field label="Degradation full (m)">
                                            <div style={{display: "flex", gap: 8, alignItems: "center"}}>
                                                <input
                                                    className="field-input" type="number" min={500} max={20000}
                                                    step={100}
                                                    value={commsConfig.degradationFullMeters}
                                                    disabled={!commsConfig.enabled}
                                                    onChange={(e) => setCommsConfig((prev) => ({
                                                        ...prev,
                                                        degradationFullMeters: Math.max(500, Number(e.target.value))
                                                    }))}
                                                    style={{width: 90}}
                                                />
                                                <span className="field-hint">Max degradation distance</span>
                                            </div>
                                        </Field>
                                        <Field label="Intermittent cycle (s)">
                                            <div style={{display: "flex", gap: 8, alignItems: "center"}}>
                                                <input
                                                    className="field-input" type="number" min={0} max={120} step={1}
                                                    value={commsConfig.intermittentCycleSec}
                                                    disabled={!commsConfig.enabled}
                                                    onChange={(e) => setCommsConfig((prev) => ({
                                                        ...prev,
                                                        intermittentCycleSec: Math.max(0, Number(e.target.value))
                                                    }))}
                                                    style={{width: 80}}
                                                />
                                                <span className="field-hint">0 = disabled</span>
                                            </div>
                                        </Field>
                                        <Field label="Intermittent depth">
                                            <div style={{display: "flex", gap: 8, alignItems: "center"}}>
                                                <input
                                                    className="field-input" type="number" min={0} max={100} step={5}
                                                    value={Math.round(commsConfig.intermittentDepth * 100)}
                                                    disabled={!commsConfig.enabled}
                                                    onChange={(e) => setCommsConfig((prev) => ({
                                                        ...prev,
                                                        intermittentDepth: Math.min(1, Math.max(0, Number(e.target.value) / 100))
                                                    }))}
                                                    style={{width: 80}}
                                                />
                                                <span className="field-hint">% signal drop at trough</span>
                                            </div>
                                        </Field>
                                    </ControlGrid>
                                    {commsConfig.enabled && drones.some((d) => d.comms) && (
                                        <div className="callout" role="status" style={{marginTop: 8}}>
                                            <strong>Comms status:</strong>{" "}
                                            {drones.filter((d) => d.comms?.connected).length}/{drones.length} connected
                                            {" · "}
                                            Queue: {commsQueueRef.current.length} pending
                                            {" · "}
                                            Buffered: {totalBufferedScanCount}
                                            {drones.some((d) => d.comms && d.comms.signalQuality < commsThresholds.reducedSensorQuality) && (
                                                <span
                                                    style={{color: "var(--color-warning)"}}>{" · "}Sensors degraded on {drones.filter((d) => d.comms && d.comms.signalQuality < commsThresholds.reducedSensorQuality).length} drone(s)</span>
                                            )}
                                            {drones.some((d) => d.comms && d.comms.signalQuality < commsThresholds.swarmDisabledQuality) && (
                                                <span
                                                    style={{color: "var(--color-danger)"}}>{" · "}Swarm disabled on {drones.filter((d) => d.comms && d.comms.signalQuality < commsThresholds.swarmDisabledQuality).length} drone(s)</span>
                                            )}
                                        </div>
                                    )}

                                    <div className="meta-row" style={{marginTop: 12}}>
                                        <div><strong>Sector</strong> {sectorMeta.bounds.widthMeters / 1000} km
                                            × {sectorMeta.bounds.heightMeters / 1000} km
                                        </div>
                                        <div><strong>Hub</strong> x: {hub.position.x.toFixed(0)} m |
                                            y: {hub.position.y.toFixed(0)} m
                                        </div>
                                    </div>
                                    {message &&
                                        <div className="callout success" role="status"
                                             aria-live="polite">{message}</div>}
                                    {error &&
                                        <div className="callout danger" role="alert"
                                             aria-live="assertive">{error}</div>}
                                </div>
                            </div>
                        </div>
                    </div>,
                    document.body
                )}
            </PageTransition>
        </AppShell>
    );
}















