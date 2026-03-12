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
import type {DetectionLogEntry, AnomalyInstance, Vec2} from "../domain/types/environment";

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
        manualInterventionEnabled, setManualInterventionEnabled,
        fogOfWarEnabled, setFogOfWarEnabled,
        swarmEnabledGlobal, swarmParamsRef, batteryWarningStateRef,
        clampToBounds, computeReturnMinutes, computeEmergencyReserve, detectionProbability,
        spawnPoints, selectedSpawnPointId, setSelectedSpawnPointId,
        selectedDroneModelId, setSelectedDroneModelId,
        handleSpawnDrone, setPhase,
    } = mission;

    const {
        scenario, message, error, setMessage,
        handleToggleAnomaly,
        sectorMeta, updateAnomalies,
    } = scenarioHook;

    const {select, add, toggle, clear} = droneSelection;
    const lastFrameRef = useRef<number | null>(null);
    const scenarioRef = useRef(scenario);
    const dronesRef = useRef(drones);

    useEffect(() => {
        scenarioRef.current = scenario;
    }, [scenario]);
    useEffect(() => {
        dronesRef.current = drones;
    }, [drones]);

    const lastFalseNegativeRef = useRef<Record<string, number>>({});

    const [drawerOpen, setDrawerOpen] = useState(() => typeof window !== "undefined" ? window.innerWidth >= 960 : true);
    const toggleDrawer = () => setDrawerOpen((prev) => !prev);

    const [scanValidationActive, setScanValidationActive] = useState(false);

    const handleRTBImmediate = () => {
        const ids = selectedDroneIds.length > 0 ? selectedDroneIds : drones.map((d) => d.id);
        if (ids.length === 0) return;
        const now = Date.now();
        setDrones((prev) => prev.map((drone) => {
            if (!ids.includes(drone.id)) return drone;
            return {...drone, targetPosition: hub.position, waypoints: [], status: "returning", lastUpdate: now};
        }));
        setMessage(`RTB immediately for ${ids.length} drone${ids.length === 1 ? "" : "s"}.`);
    };

    const handleRTBAfterCompletion = () => {
        const ids = selectedDroneIds.length > 0 ? selectedDroneIds : drones.map((d) => d.id);
        if (ids.length === 0) return;
        const now = Date.now();
        setDrones((prev) => prev.map((drone) => {
            if (!ids.includes(drone.id)) return drone;
            const existing = drone.targetPosition ? [drone.targetPosition, ...drone.waypoints] : [...drone.waypoints];
            const hasHub = existing.some((p) => Math.hypot(p.x - hub.position.x, p.y - hub.position.y) < 1);
            const queue = hasHub ? existing : [...existing, hub.position];
            if (queue.length === 0) {
                return {...drone, targetPosition: hub.position, waypoints: [], status: "returning", lastUpdate: now};
            }
            const [next, ...rest] = queue;
            return {
                ...drone,
                targetPosition: next,
                waypoints: rest,
                status: drone.status === "returning" ? "returning" : "enroute",
                lastUpdate: now
            };
        }));
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
        setMessage(`Removed ${count} drone${count === 1 ? "" : "s"}: ${names}`);
    }, [setDrones, batteryWarningStateRef, clear, setMessage]);

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

    const sweepSpacingMeters = useMemo(() => {
        const raw = sensorSettings.rangeMeters * (1 - coverageOverlap);
        return Math.max(5, Math.round(raw * 100) / 100);
    }, [coverageOverlap, sensorSettings.rangeMeters]);

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
        if (cells.length === 0) setMessage("Unable to generate Voronoi cells for the current drone layout.");
        else setMessage(`Computed coverage for ${coverageSourceCount} drone${coverageSourceCount === 1 ? "" : "s"}.`);
    };

    const handleClearVoronoi = () => {
        setVoronoiEnabled(false);
        setVoronoiCells([]);
        setCoveragePlans([]);
        setCoverageActive(false);
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
            return;
        }
        const plans = computeCoveragePlansFromCells(cells);
        if (plans.length === 0) {
            setMessage("No coverage paths could be generated.");
            setCoveragePlans([]);
            setCoverageActive(false);
            return;
        }
        setVoronoiEnabled(true);
        setVoronoiCells(cells);
        setCoveragePlans(plans);
        setCoverageActive(true);
        setDrawerOpen(false);
        setManualInterventionEnabled(false);
        const now = Date.now();
        setDrones((prev) => prev.map((drone) => {
            const plan = plans.find((p) => p.droneId === drone.id);
            if (!plan || plan.waypoints.length === 0) return drone;
            const [nextTarget, ...rest] = plan.waypoints;
            return {
                ...drone,
                targetPosition: nextTarget,
                waypoints: rest,
                status: "search",
                lastUpdate: now,
                coveragePlan: plan
            };
        }));
        setMessage(`Starting coverage with spacing ${sweepSpacingMeters} m and ${Math.round(coverageOverlap * 100)}% overlap.`);
    };

    useEffect(() => {
        let raf: number;
        const step = (timestamp: number) => {
            if (lastFrameRef.current === null) lastFrameRef.current = timestamp;
            const dtSeconds = (timestamp - lastFrameRef.current) / 1000;
            lastFrameRef.current = timestamp;
            const events: DetectionLogEntry[] = [];
            const now = Date.now();
            const bounds = scenario.sector.bounds;
            const swarmParams = swarmParamsRef.current;
            const baseDrones = dronesRef.current;
            const swarmAdjustments = swarmEnabledGlobal ? computeSwarmAdjustments(baseDrones, swarmParams, bounds, dtSeconds) : {};

            setDrones((prev) => prev.map((drone) => {
                const swarmAdj = (!drone.swarmEnabled && drone.swarmEnabled !== undefined) || drone.avoidanceOverride ? undefined : swarmAdjustments[drone.id];
                const queue = drone.waypoints ?? [];
                let target = drone.targetPosition;
                let remainingQueue = queue;
                if (!target && remainingQueue.length > 0) {
                    const [nextTarget, ...rest] = remainingQueue;
                    target = nextTarget;
                    remainingQueue = rest;
                }
                const activeWaypoint = target ?? remainingQueue[0];
                const drainMinutes = dtSeconds / 60;
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
                            events.push({
                                id: `battery-${drone.id}-${threshold}-${now}`,
                                timestamp: now,
                                kind: "battery-warning",
                                droneId: drone.id,
                                position: drone.position,
                                batteryPct,
                                batteryMinutesRemaining,
                                returnMinutesRequired,
                                message: `${drone.callsign} battery ${Math.round(batteryPct)}% near waypoint (${waypointLabel}).`
                            });
                        }
                    });
                }

                if (stillFlying && needsReturn && !warningState.emergency) {
                    warningState.emergency = true;
                    events.push({
                        id: `battery-emergency-${drone.id}-${now}`,
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
                    if (remainingQueue !== queue || batteryMinutesRemaining !== drone.batteryMinutesRemaining || batteryPct !== drone.batteryPct || statusBase !== drone.status || returnMinutesRequired !== drone.returnMinutesRequired || emergencyReserveMinutes !== drone.emergencyReserveMinutes) {
                        return {
                            ...drone,
                            waypoints: remainingQueue,
                            batteryMinutesRemaining,
                            batteryPct,
                            status: statusBase === "landed" ? "landed" : statusBase,
                            returnMinutesRequired,
                            emergencyReserveMinutes,
                            lastUpdate: now
                        };
                    }
                    return drone;
                }

                const speedMs = drone.speedKts * 0.514444;
                if (speedMs <= 0) return {
                    ...drone,
                    batteryMinutesRemaining,
                    batteryPct,
                    status: statusBase,
                    returnMinutesRequired,
                    emergencyReserveMinutes
                };
                const dx = target.x - drone.position.x;
                const dy = target.y - drone.position.y;
                const distance = Math.hypot(dx, dy);
                const enrouteStatus = needsReturn ? "returning" : "enroute";
                let headingDeg = distance > 0.001 ? (Math.atan2(dy, dx) * 180) / Math.PI : drone.headingDeg;
                if (swarmAdj && Number.isFinite(swarmAdj.headingDeltaDeg)) {
                    headingDeg += swarmAdj.headingDeltaDeg;
                    if (headingDeg > 180) headingDeg -= 360;
                    if (headingDeg <= -180) headingDeg += 360;
                }
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
                        return {
                            ...drone,
                            position: clampToBounds(target),
                            headingDeg,
                            targetPosition: nextTarget,
                            waypoints: rest,
                            status: enrouteStatus,
                            batteryMinutesRemaining,
                            batteryPct,
                            returnMinutesRequired,
                            emergencyReserveMinutes,
                            lastUpdate: now
                        };
                    }
                    const atHub = Math.hypot(target.x - hub.position.x, target.y - hub.position.y) < 1;
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
                    lastUpdate: now
                };
            }));
            if (events.length > 0) {
                appendLog(events);
                setMessage(events[0].message);
            }
            raf = requestAnimationFrame(step);
        };
        raf = requestAnimationFrame(step);
        return () => {
            cancelAnimationFrame(raf);
            lastFrameRef.current = null;
        };
    }, [appendLog, clampToBounds, computeEmergencyReserve, computeReturnMinutes, hub.position.x, hub.position.y, setMessage, scenario.sector.bounds, swarmEnabledGlobal]);

    useEffect(() => {
        if (!sensorsEnabled) return;
        const interval = window.setInterval(() => {
            const now = Date.now();
            const currentScenario = scenarioRef.current;
            const currentDrones = dronesRef.current;
            if (!currentScenario || currentDrones.length === 0) return;
            let updatedItems = currentScenario.anomalies.items;
            let changed = false;
            const events: DetectionLogEntry[] = [];
            const range = Math.max(10, sensorSettings.rangeMeters);
            currentDrones.forEach((drone) => {
                currentScenario.anomalies.items.forEach((anomaly, idx) => {
                    const dx = anomaly.position.x - drone.position.x;
                    const dy = anomaly.position.y - drone.position.y;
                    const distance = Math.hypot(dx, dy);
                    if (distance > range) return;
                    const confidence = detectionProbability(distance);

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
                                id: `hit-${anomaly.id}-${now}`,
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
                                id: `miss-${anomaly.id}-${now}`,
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
                const falsePositiveChance = sensorSettings.falsePositiveRatePerMinute * (sensorSettings.checkIntervalMs / 60000);
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
                        id: `fp-log-${id}`,
                        timestamp: now,
                        kind: "false-positive",
                        droneId: drone.id,
                        anomalyId: id,
                        anomalyType: "false-positive",
                        position,
                        message: `${drone.callsign} reported possible contact (false positive)`
                    });
                }
            });
            if (changed) updateAnomalies(() => updatedItems);
            if (events.length > 0) {
                appendLog(events);
                setMessage(events[0].message);
            }
        }, sensorSettings.checkIntervalMs);
        return () => window.clearInterval(interval);
    }, [appendLog, clampToBounds, detectionProbability, sensorSettings.checkIntervalMs, sensorSettings.falsePositiveRatePerMinute, sensorSettings.rangeMeters, sensorsEnabled, setMessage, updateAnomalies]);

    const handleBackToSetup = () => {
        setPhase("setup");
        navigate("/setup");
    };

    return (
        <AppShell subtitle="Active Mission">
            <PageTransition>
                <div className="simulation-container content-with-drawer">
                    <nav className="setup-nav" aria-label="Mission navigation">
                        <button className="btn ghost btn-sm" onClick={handleBackToSetup}>← Back to Setup</button>
                        <div className="sim-status-bar" role="status" aria-live="polite">
                            <span><strong>Drones</strong> {drones.length}</span>
                            <span><strong>Detected</strong> {scenario.anomalies.items.filter((a) => a.detected).length}/{scenario.anomalies.items.length}</span>
                            <span><strong>Sea state</strong> {sectorMeta.conditions.seaState}</span>
                        </div>
                    </nav>

                    <div className="viewer-row">
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
                        />

                        <div className="panel-card detection-log-panel" aria-labelledby="detection-log-heading">
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

                {createPortal(
                <div className={`scenario-drawer ${drawerOpen ? "open" : "closed"}`}>
                    <div className="drawer-surface">
                        <button className="drawer-handle" onClick={toggleDrawer} aria-expanded={drawerOpen}
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
                                                    <option key={point.id} value={point.id}>{point.label}</option>))}
                                            </select>
                                        </Field>
                                        <Field label="Drone model">
                                            <select className="field-input" value={selectedDroneModelId}
                                                    onChange={(e) => setSelectedDroneModelId(e.target.value)}>
                                                {droneModels.map((model) => (
                                                    <option key={model.id} value={model.id}>{model.label}</option>))}
                                            </select>
                                        </Field>
                                        <Field label=" " className="field" as="div">
                                            <div style={{
                                                display: "flex",
                                                gap: 8,
                                                alignItems: "flex-end",
                                                flexWrap: "wrap"
                                            }}>
                                                <button className="btn" onClick={handleSpawnDrone}>Spawn Drone</button>
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
                                                Use checkboxes to multi-select · Click pill to select one · Press <kbd
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
                                                                       }}/>
                                                                <span className="drone-meta">Override avoidance</span>
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
                                </ControlGrid>

                                <Badge style={{marginTop: 16, marginBottom: 8}}>Coverage</Badge>
                                <ControlGrid>
                                    <Field label="Voronoi coverage">
                                        <div style={{display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center"}}>
                                            <button className="btn" onClick={handleRunVoronoi}>Run Coverage</button>
                                            <button className="btn ghost" onClick={handleClearVoronoi}
                                                    disabled={!voronoiEnabled || voronoiCells.length === 0}>Clear
                                                Overlay
                                            </button>
                                            <span
                                                className="field-hint">Uses {coverageSourceCount} drone{coverageSourceCount === 1 ? "" : "s"} ({selectedDroneIds.length > 0 ? "selected" : "all"}).</span>
                                        </div>
                                    </Field>
                                    <Field label="Sweep overlap (%)">
                                        <div style={{display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap"}}>
                                            <input className="field-input" type="number" min={10} max={20} step={1}
                                                   value={Math.round(coverageOverlap * 100)}
                                                   onChange={(e) => setCoverageOverlap(Math.min(0.2, Math.max(0.1, Number(e.target.value) / 100)))}
                                                   style={{width: 90}}/>
                                            <span className="field-hint">Spacing {sweepSpacingMeters} m</span>
                                        </div>
                                    </Field>
                                    <Field label="Lawnmower">
                                        <div style={{display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center"}}>
                                            <button className="btn" onClick={handleStartCoverage}>Start Coverage
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
                                                onChange={(e) => setManualInterventionEnabled(e.target.checked)}
                                                disabled={!coverageActive}
                                            />
                                            <span>Allow drone repositioning &amp; waypoints</span>
                                        </label>
                                        <div className="field-hint" style={{marginTop: 4}}>
                                            {coverageActive
                                                ? manualInterventionEnabled
                                                    ? "Manual control enabled — select drones and click to assign waypoints."
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
                                        <div style={{display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center"}}>
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
                                                    <strong>{detectedCount}/{realItems.length}</strong> anomalies detected
                                                    {missedCount > 0
                                                        ? ` · ${missedCount} missed — highlighted on the map with pulsing red markers.`
                                                        : " — all anomalies found! ✓"}
                                                </div>
                                            );
                                        })()}
                                    </Field>
                                </ControlGrid>

                                <div className="meta-row" style={{marginTop: 12}}>
                                    <div><strong>Sector</strong> {sectorMeta.bounds.widthMeters / 1000} km
                                        × {sectorMeta.bounds.heightMeters / 1000} km
                                    </div>
                                    <div><strong>Hub</strong> x: {hub.position.x.toFixed(0)} m |
                                        y: {hub.position.y.toFixed(0)} m
                                    </div>
                                </div>
                                {message &&
                                    <div className="callout success" role="status" aria-live="polite">{message}</div>}
                                {error &&
                                    <div className="callout danger" role="alert" aria-live="assertive">{error}</div>}
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















