import React, {useCallback, useEffect, useMemo, useRef, useState} from "react";
import MaritimeCanvas2D from "./components/MaritimeCanvas2D";
import {anomalyTypeLabels, anomalyTypeOrder} from "./config/anomalies";
import type {AnomalyInstance, DetectionLogEntry, SensorConfig, Vec2} from "./domain/types/environment";
import {createDroneId, type DroneState, type SpawnPoint} from "./domain/types/drone";
import {
    droneModels,
    lastModelStorageKey,
    droneHubReturnReserveMinutes,
    batteryWarningThresholds,
    batteryEmergencyBufferMinutes
} from "./config/constants";
import {defaultSensorConfig} from "./config/sensors";
import {scenarioPresets} from "./data/scenarios";
import {useScenario} from "./hooks/useScenario";
import {useDroneSelection} from "./hooks/useDroneSelection";
import Badge from "./components/ui/Badge";
import Field, {ControlGrid, FieldInline} from "./components/ui/Field";
import ButtonRow from "./components/ui/ButtonRow";
import "./index.css";
import {droneHubFromBounds} from "./domain/environment/generator";
import {planCoveragePaths, type CoveragePlan} from "./domain/coverage/planner";
import {computeVoronoiCells, type VoronoiCell} from "./components/canvas/voronoi";

export default function App() {
    const [drones, setDrones] = useState<DroneState[]>([]);
    const {selectedIds: selectedDroneIds, select, add, toggle, clear} = useDroneSelection();
    const resetDrones = useCallback(() => {
        setDrones([]);
        batteryWarningStateRef.current = {};
        clear();
    }, [clear]);

    const handleRTBImmediate = () => {
        const ids = selectedDroneIds.length > 0 ? selectedDroneIds : drones.map((d) => d.id);
        if (ids.length === 0) return;
        const now = Date.now();
        setDrones((prev) => prev.map((drone) => {
            if (!ids.includes(drone.id)) return drone;
            return {
                ...drone,
                targetPosition: hub.position,
                waypoints: [],
                status: "returning",
                lastUpdate: now,
            };
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
                return {
                    ...drone,
                    targetPosition: hub.position,
                    waypoints: [],
                    status: "returning",
                    lastUpdate: now,
                };
            }
            const [next, ...rest] = queue;
            return {
                ...drone,
                targetPosition: next,
                waypoints: rest,
                status: drone.status === "returning" ? "returning" : "enroute",
                lastUpdate: now,
            };
        }));
        setMessage(`RTB after completion queued for ${ids.length} drone${ids.length === 1 ? "" : "s"}.`);
    };

    const {
        seed,
        widthKm,
        heightKm,
        scenario,
        anomalyConfig,
        selectedPreset,
        message,
        error,
        setSeed,
        setWidthKm,
        setHeightKm,
        setMessage,
        sectorMeta,
        handleGenerate,
        handleRandomSeed,
        applyPreset,
        loadScenarioFile,
        handleAnomalyConfigChange,
        handleToggleAnomaly,
        downloadScenarioJSON,
        updateAnomalies,
    } = useScenario({onScenarioReset: resetDrones});
    const lastFrameRef = useRef<number | null>(null);
    const spawnPoints = useMemo<SpawnPoint[]>(() => {
        const {origin, widthMeters, heightMeters} = scenario.sector.bounds;
        const margin = Math.max(Math.min(widthMeters, heightMeters) * 0.05, 50);
        const hub = droneHubFromBounds(scenario.sector.bounds);
        return [
            {id: "center", label: "Center (Drone Hub)", position: hub.position},
            {
                id: "northwest",
                label: "Northwest",
                position: {x: origin.x + margin, y: origin.y + heightMeters - margin}
            },
            {
                id: "northeast",
                label: "Northeast",
                position: {x: origin.x + widthMeters - margin, y: origin.y + heightMeters - margin}
            },
            {id: "southwest", label: "Southwest", position: {x: origin.x + margin, y: origin.y + margin}},
            {id: "southeast", label: "Southeast", position: {x: origin.x + widthMeters - margin, y: origin.y + margin}},
        ];
    }, [scenario.sector.bounds]);
    const hub = useMemo(() => droneHubFromBounds(scenario.sector.bounds), [scenario.sector.bounds]);
    const [selectedSpawnPointId, setSelectedSpawnPointId] = useState("center");
    const [selectedDroneModelId, setSelectedDroneModelId] = useState("mavic3");
    const [sensorSettings, setSensorSettings] = useState<SensorConfig>({...defaultSensorConfig});
    const [sensorsEnabled, setSensorsEnabled] = useState(true);
    const [showSensorRanges, setShowSensorRanges] = useState(true);
    const [voronoiEnabled, setVoronoiEnabled] = useState(false);
    const [voronoiCells, setVoronoiCells] = useState<VoronoiCell[]>([]);
    const [coveragePlans, setCoveragePlans] = useState<CoveragePlan[]>([]);
    const [coverageActive, setCoverageActive] = useState(false);
    const [coverageOverlap, setCoverageOverlap] = useState(0.15); // 15% overlap default
    const [detectionLog, setDetectionLog] = useState<DetectionLogEntry[]>([]);
    const [drawerOpen, setDrawerOpen] = useState(() => typeof window !== "undefined" ? window.innerWidth >= 960 : true);
    const scenarioRef = useRef(scenario);
    const dronesRef = useRef<DroneState[]>([]);
    const lastFalseNegativeRef = useRef<Record<string, number>>({});
    const batteryWarningStateRef = useRef<Record<string, { thresholds: Set<number>; emergency: boolean }>>({});

    useEffect(() => {
        const stored = localStorage.getItem(lastModelStorageKey);
        if (!stored) return;
        const found = droneModels.find((m) => m.id === stored);
        if (found) setSelectedDroneModelId(found.id);
    }, []);

    useEffect(() => {
        scenarioRef.current = scenario;
    }, [scenario]);

    useEffect(() => {
        dronesRef.current = drones;
    }, [drones]);

    useEffect(() => {
        localStorage.setItem(lastModelStorageKey, selectedDroneModelId);
    }, [selectedDroneModelId]);

    const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;
        await loadScenarioFile(file);
        event.target.value = "";
    };

    const handleSetWaypoint = (point: Vec2, append = false) => {
        if (selectedDroneIds.length === 0) return;
        const clampedPoint = clampToBounds(point);
        setDrones((prev) => prev.map((drone) => {
            if (!selectedDroneIds.includes(drone.id)) return drone;
            const queue = drone.waypoints ?? [];
            if (append) {
                const updatedQueue = [...queue, clampedPoint];
                if (drone.targetPosition) {
                    return {...drone, waypoints: updatedQueue, lastUpdate: Date.now()};
                }
                const [nextTarget, ...rest] = updatedQueue;
                return {
                    ...drone,
                    targetPosition: nextTarget,
                    waypoints: rest,
                    status: "enroute",
                    lastUpdate: Date.now()
                };
            }
            return {
                ...drone,
                targetPosition: clampedPoint,
                waypoints: [],
                status: "enroute",
                lastUpdate: Date.now()
            };
        }));
    };

    const handleSpawnDrone = () => {
        const spawn = spawnPoints.find((p) => p.id === selectedSpawnPointId) ?? spawnPoints[0];
        if (!spawn) return;
        const model = droneModels.find((m) => m.id === selectedDroneModelId) ?? droneModels[0];
        const newDrone: DroneState = {
            id: createDroneId(seed),
            callsign: `DR-${(drones.length + 1).toString().padStart(2, "0")}`,
            position: clampToBounds(spawn.position),
            headingDeg: 0,
            status: "idle",
            speedKts: model.speedKts,
            batteryPct: 100,
            batteryLifeMinutes: model.batteryLifeMinutes,
            batteryMinutesRemaining: model.batteryLifeMinutes,
            homePosition: hub.position,
            lastUpdate: Date.now(),
            waypoints: [],
            returnMinutesRequired: 0,
            emergencyReserveMinutes: 0,
        };
        const returnMinutesRequired = computeReturnMinutes(newDrone);
        const emergencyReserveMinutes = computeEmergencyReserve(newDrone);
        const hydrated = {...newDrone, returnMinutesRequired, emergencyReserveMinutes};
        batteryWarningStateRef.current[hydrated.id] = {thresholds: new Set(), emergency: false};
        setDrones((prev) => [...prev, hydrated]);
        select([hydrated.id]);
        setMessage(`Spawned ${model.label.split(" (")[0]} as ${hydrated.callsign} at ${spawn.label}`);
    };

    const handleSelectDroneFromList = (id: string, event: React.MouseEvent<HTMLButtonElement>) => {
        if (event.ctrlKey || event.metaKey) {
            toggle([id]);
        } else if (event.shiftKey) {
            add([id]);
        } else {
            select([id]);
        }
    };

    const handleDronePositionChange = (id: string, position: Vec2) => {
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
            lastUpdate: Date.now(),
        } : drone));
    };

    const clampToBounds = useCallback((pos: Vec2) => {
        const {origin, widthMeters, heightMeters} = scenario.sector.bounds;
        return {
            x: Math.min(Math.max(pos.x, origin.x), origin.x + widthMeters),
            y: Math.min(Math.max(pos.y, origin.y), origin.y + heightMeters),
        };
    }, [scenario.sector.bounds]);

    const computeReturnMinutes = useCallback((drone: DroneState) => {
        const speedMs = Math.max(0, drone.speedKts) * 0.514444;
        if (speedMs <= 0.0001) return Number.POSITIVE_INFINITY;
        const dx = drone.position.x - drone.homePosition.x;
        const dy = drone.position.y - drone.homePosition.y;
        return Math.hypot(dx, dy) / speedMs / 60;
    }, []);

    const computeEmergencyReserve = useCallback((drone: DroneState) => {
        const minutesToHub = computeReturnMinutes(drone);
        if (!Number.isFinite(minutesToHub)) return droneHubReturnReserveMinutes;
        return Math.max(minutesToHub + batteryEmergencyBufferMinutes, droneHubReturnReserveMinutes);
    }, [computeReturnMinutes]);

    const detectionProbability = useCallback((distanceMeters: number) => {
        const range = Math.max(1, sensorSettings.rangeMeters);
        const falloff = Math.max(0, Math.min(1, 1 - distanceMeters / range));
        const shaped = Math.pow(falloff, 1.4);
        const base = sensorSettings.edgeDetectionProbability;
        const peak = sensorSettings.optimalDetectionProbability;
        return Math.min(1, Math.max(0, base + (peak - base) * shaped));
    }, [sensorSettings.edgeDetectionProbability, sensorSettings.optimalDetectionProbability, sensorSettings.rangeMeters]);

    const appendLog = useCallback((entries: DetectionLogEntry[]) => {
        setDetectionLog((prev) => {
            const next = [...entries, ...prev];
            return next.slice(0, sensorSettings.logLimit);
        });
    }, [sensorSettings.logLimit]);

    const handleSensorSettingChange = (key: keyof SensorConfig, value: number) => {
        setSensorSettings((prev) => ({...prev, [key]: value}));
    };

    const coverageSourceCount = useMemo(() => {
        if (selectedDroneIds.length > 0) {
            return drones.filter((d) => selectedDroneIds.includes(d.id)).length;
        }
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
    }, [drones, scenario.sector.bounds, selectedDroneIds]);

    const handleRunVoronoi = () => {
        if (coverageSourceCount < 2) {
            setVoronoiEnabled(false);
            setVoronoiCells([]);
            setMessage("Voronoi coverage needs at least two drones within the sector.");
            return;
        }
        setVoronoiEnabled(true);
        const cells = recomputeVoronoi();
        if (cells.length === 0) {
            setMessage("Unable to generate Voronoi cells for the current drone layout.");
        } else {
            setMessage(`Computed coverage for ${coverageSourceCount} drone${coverageSourceCount === 1 ? "" : "s"}.`);
        }
    };

    const handleClearVoronoi = () => {
        setVoronoiEnabled(false);
        setVoronoiCells([]);
        setCoveragePlans([]);
        setCoverageActive(false);
    };


    const computeCoveragePlans = useCallback((cells: VoronoiCell[]) => {
        return planCoveragePaths(cells, sweepSpacingMeters, coverageOverlap);
    }, [coverageOverlap, sweepSpacingMeters]);

    useEffect(() => {
        if (!coverageActive || !voronoiEnabled) return;
        const plans = computeCoveragePlans(voronoiCells);
        setCoveragePlans(plans);
    }, [computeCoveragePlans, coverageActive, voronoiCells, voronoiEnabled]);

    const handleStartCoverage = () => {
        const cells = voronoiEnabled ? voronoiCells : recomputeVoronoi();
        if (cells.length < 2) {
            setMessage("Need at least two Voronoi cells (two drones) to start coverage.");
            setCoverageActive(false);
            setCoveragePlans([]);
            return;
        }
        const plans = computeCoveragePlans(cells);
        if (plans.length === 0) {
            setMessage("No coverage paths could be generated for the current cells.");
            setCoveragePlans([]);
            setCoverageActive(false);
            return;
        }
        setVoronoiEnabled(true);
        setVoronoiCells(cells);
        setCoveragePlans(plans);
        setCoverageActive(true);
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
                coveragePlan: plan,
            };
        }));
        setMessage(`Starting coverage with spacing ${sweepSpacingMeters} m and ${Math.round(coverageOverlap * 100)}% overlap.`);
    };

    useEffect(() => {
        let raf: number;
        const step = (timestamp: number) => {
            if (lastFrameRef.current === null) {
                lastFrameRef.current = timestamp;
            }
            const dtSeconds = (timestamp - lastFrameRef.current) / 1000;
            lastFrameRef.current = timestamp;
            const events: DetectionLogEntry[] = [];
            const now = Date.now();
            setDrones((prev) => prev.map((drone) => {
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
                                message: `${drone.callsign} battery ${Math.round(batteryPct)}% near waypoint (${waypointLabel}).`,
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
                        message: `${drone.callsign} battery critical (${batteryMinutesRemaining.toFixed(1)} min left; needs ${emergencyReserveMinutes.toFixed(1)} min to reach hub). Returning to base.`,
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
                            lastUpdate: now,
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
                const headingDeg = distance > 0.001 ? (Math.atan2(dy, dx) * 180) / Math.PI : drone.headingDeg;
                const enrouteStatus = needsReturn ? "returning" : "enroute";
                if (distance < 0.01) {
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
                const maxStep = speedMs * dtSeconds;
                if (maxStep <= 0) return {
                    ...drone,
                    batteryMinutesRemaining,
                    batteryPct,
                    status: statusBase,
                    returnMinutesRequired,
                    emergencyReserveMinutes
                };
                const ratio = maxStep >= distance ? 1 : maxStep / distance;
                const nextPos = clampToBounds({
                    x: drone.position.x + dx * ratio,
                    y: drone.position.y + dy * ratio,
                });
                const reached = ratio >= 1 || Math.hypot(target.x - nextPos.x, target.y - nextPos.y) < 0.1;
                if (reached) {
                    if (remainingQueue.length > 0) {
                        const [nextTarget, ...rest] = remainingQueue;
                        return {
                            ...drone,
                            position: clampToBounds(target),
                            headingDeg,
                            status: enrouteStatus,
                            targetPosition: nextTarget,
                            waypoints: rest,
                            batteryMinutesRemaining,
                            batteryPct,
                            returnMinutesRequired,
                            emergencyReserveMinutes,
                            lastUpdate: now,
                        };
                    }
                    const atHub = Math.hypot(target.x - hub.position.x, target.y - hub.position.y) < 1;
                    return {
                        ...drone,
                        position: clampToBounds(target),
                        headingDeg,
                        status: atHub ? "landed" : "idle",
                        targetPosition: undefined,
                        waypoints: [],
                        batteryMinutesRemaining,
                        batteryPct,
                        returnMinutesRequired,
                        emergencyReserveMinutes,
                        lastUpdate: now,
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
                    lastUpdate: now,
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
    }, [appendLog, clampToBounds, computeEmergencyReserve, computeReturnMinutes, hub.position.x, hub.position.y, setMessage]);

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
                                message: `${drone.callsign} detected ${anomalyTypeLabels[anomaly.type]}`,
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
                                message: `${drone.callsign} missed ${anomalyTypeLabels[anomaly.type]} (${Math.round(confidence * 100)}% expected)`,
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
                        y: drone.position.y + Math.sin(angle) * radius,
                    });
                    const id = `fp-${Math.random().toString(36).slice(2, 8)}-${now}`;
                    const falsePositive: AnomalyInstance = {
                        id,
                        type: "false-positive",
                        position,
                        detected: true,
                        detectionRadiusMeters: currentScenario.anomalies.config["false-positive"].detectionRadiusMeters,
                        note: `False positive from ${drone.callsign}`,
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
                        message: `${drone.callsign} reported possible contact (false positive)`,
                    });
                }
            });
            if (changed) {
                updateAnomalies(() => updatedItems);
            }
            if (events.length > 0) {
                appendLog(events);
                setMessage(events[0].message);
            }
        }, sensorSettings.checkIntervalMs);
        return () => window.clearInterval(interval);
    }, [appendLog, clampToBounds, detectionProbability, sensorSettings.checkIntervalMs, sensorSettings.falsePositiveRatePerMinute, sensorSettings.rangeMeters, sensorsEnabled, setMessage, updateAnomalies]);

    const toggleDrawer = () => setDrawerOpen((prev) => !prev);

    const scenarioControls = (
        <div className="panel-card drawer-panel">
            <Badge style={{marginBottom: 8}}>Scenario Controls</Badge>
            <ControlGrid>
                <Field label="Seed">
                    <input className="field-input" value={seed}
                           onChange={(e) => setSeed(e.target.value.trim())}/>
                </Field>
                <Field label="Width (km)">
                    <input
                        className="field-input"
                        type="number"
                        min={0.1}
                        step={0.5}
                        value={widthKm}
                        onChange={(e) => setWidthKm(Number(e.target.value))}
                    />
                </Field>
                <Field label="Height (km)">
                    <input
                        className="field-input"
                        type="number"
                        min={0.1}
                        step={0.5}
                        value={heightKm}
                        onChange={(e) => setHeightKm(Number(e.target.value))}
                    />
                </Field>
                <Field label="Preset">
                    <select
                        className="field-input"
                        value={selectedPreset}
                        onChange={(e) => applyPreset(e.target.value)}
                    >
                        {scenarioPresets.map((preset) => (
                            <option key={preset.id} value={preset.id}>{preset.label}</option>
                        ))}
                    </select>
                </Field>
            </ControlGrid>

            <Badge style={{marginTop: 16, marginBottom: 8}}>Anomalies</Badge>
            <ControlGrid>
                {anomalyTypeOrder.map((type) => (
                    <Field key={type} label={anomalyTypeLabels[type]}>
                        <FieldInline>
                            <label>
                                <span className="field-sub">Count</span>
                                <input
                                    className="field-input"
                                    type="number"
                                    min={0}
                                    step={1}
                                    value={anomalyConfig[type].count}
                                    onChange={(e) => handleAnomalyConfigChange(type, "count", Math.max(0, Number(e.target.value)))}
                                />
                            </label>
                            <label>
                                <span className="field-sub">Detect radius (m)</span>
                                <input
                                    className="field-input"
                                    type="number"
                                    min={10}
                                    step={10}
                                    value={anomalyConfig[type].detectionRadiusMeters}
                                    onChange={(e) => handleAnomalyConfigChange(type, "detectionRadiusMeters", Math.max(10, Number(e.target.value)))}
                                />
                            </label>
                        </FieldInline>
                    </Field>
                ))}
            </ControlGrid>

            <Badge style={{marginTop: 16, marginBottom: 8}}>Drones</Badge>
            <ControlGrid>
                <Field label="Spawn point">
                    <select className="field-input" value={selectedSpawnPointId}
                            onChange={(e) => setSelectedSpawnPointId(e.target.value)}>
                        {spawnPoints.map((point) => (
                            <option key={point.id} value={point.id}>{point.label}</option>
                        ))}
                    </select>
                </Field>
                <Field label="Drone model">
                    <select className="field-input" value={selectedDroneModelId}
                            onChange={(e) => setSelectedDroneModelId(e.target.value)}>
                        {droneModels.map((model) => (
                            <option key={model.id} value={model.id}>{model.label}</option>
                        ))}
                    </select>
                </Field>
                <Field label=" " className="field" as="div">
                    <div style={{display: "flex", gap: 8, alignItems: "flex-end"}}>
                        <button className="btn" onClick={handleSpawnDrone}>Spawn drone</button>
                        <button className="btn ghost" onClick={() => select(drones.map((d) => d.id))}>Select
                            all
                        </button>
                        <button className="btn ghost" onClick={clear}>Deselect all</button>
                    </div>
                </Field>
                <Field label="Return to Base">
                    <div style={{display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center"}}>
                        <button className="btn" onClick={handleRTBImmediate}>RTB Immediately</button>
                        <button className="btn ghost" onClick={handleRTBAfterCompletion}>RTB After Completion
                        </button>
                        <span style={{
                            fontSize: 12,
                            opacity: 0.75
                        }}>Applies to {selectedDroneIds.length > 0 ? "selected" : "all"} drones.</span>
                    </div>
                </Field>
            </ControlGrid>
            {drones.length > 0 && (
                <div className="drone-list">
                    {drones.map((drone) => (
                        <div key={drone.id} className="drone-pill-row">
                            <button
                                className={`drone-pill ${selectedDroneIds.includes(drone.id) ? "active" : ""}`}
                                onClick={(event) => handleSelectDroneFromList(drone.id, event)}
                                style={{flex: 1}}
                            >
                                <span>{drone.callsign}</span>
                                <span style={{opacity: 0.7}}>{drone.status}</span>
                                <span style={{opacity: 0.7}}>· {Math.round(drone.batteryPct)}%</span>
                                <span
                                    style={{opacity: 0.7}}>· {drone.batteryMinutesRemaining.toFixed(1)} min left</span>
                                <span
                                    style={{opacity: 0.7}}>· Min to hub {drone.returnMinutesRequired.toFixed(1)} min</span>
                                <span
                                    style={{opacity: 0.7}}>· Emergency at {drone.emergencyReserveMinutes.toFixed(1)} min</span>
                            </button>
                            <label style={{display: "flex", alignItems: "center", gap: 4, fontSize: 12}}>
                                <span style={{opacity: 0.7}}>Speed</span>
                                <input
                                    type="number"
                                    min={0}
                                    step={1}
                                    value={drone.speedKts}
                                    onChange={(e) => handleDroneSpeedChange(drone.id, Math.max(0, Number(e.target.value)))}
                                    style={{width: 70}}
                                />
                                <span style={{opacity: 0.7}}>kts</span>
                            </label>
                        </div>
                    ))}
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
                <Field label="Range (m)">
                    <input className="field-input" type="number" min={50} step={10}
                           value={sensorSettings.rangeMeters}
                           onChange={(e) => handleSensorSettingChange("rangeMeters", Math.max(10, Number(e.target.value)))}/>
                </Field>
                <Field label="Optimal P(hit)">
                    <input className="field-input" type="number" min={0} max={1} step={0.05}
                           value={sensorSettings.optimalDetectionProbability}
                           onChange={(e) => handleSensorSettingChange("optimalDetectionProbability", Math.min(1, Math.max(0, Number(e.target.value))))}/>
                </Field>
                <Field label="Edge P(hit)">
                    <input className="field-input" type="number" min={0} max={1} step={0.05}
                           value={sensorSettings.edgeDetectionProbability}
                           onChange={(e) => handleSensorSettingChange("edgeDetectionProbability", Math.min(1, Math.max(0, Number(e.target.value))))}/>
                </Field>
                <Field label="False positives (/min)">
                    <input className="field-input" type="number" min={0} step={0.01}
                           value={sensorSettings.falsePositiveRatePerMinute}
                           onChange={(e) => handleSensorSettingChange("falsePositiveRatePerMinute", Math.max(0, Number(e.target.value)))}/>
                </Field>
                <Field label="Check interval (ms)">
                    <input className="field-input" type="number" min={100} step={100}
                           value={sensorSettings.checkIntervalMs}
                           onChange={(e) => handleSensorSettingChange("checkIntervalMs", Math.max(50, Number(e.target.value)))}/>
                </Field>
            </ControlGrid>

            <Badge style={{marginTop: 16, marginBottom: 8}}>Coverage</Badge>
            <ControlGrid>
                <Field label="Voronoi coverage">
                    <div style={{display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center"}}>
                        <button className="btn" onClick={handleRunVoronoi}>Run coverage</button>
                        <button className="btn ghost" onClick={handleClearVoronoi}
                                disabled={!voronoiEnabled || voronoiCells.length === 0}>Clear overlay
                        </button>
                        <span style={{fontSize: 12, opacity: 0.75}}>
                             Uses {coverageSourceCount} drone{coverageSourceCount === 1 ? "" : "s"} ({selectedDroneIds.length > 0 ? "selected" : "all"}).
                         </span>
                    </div>
                    <div style={{fontSize: 12, opacity: 0.75, marginTop: 4}}>
                        Clamps drones to the sector bounds and recomputes whenever positions change while
                        enabled.
                    </div>
                </Field>
                <Field label="Sweep overlap (%)">
                    <div style={{display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap"}}>
                        <input className="field-input" type="number" min={10} max={20} step={1}
                               value={Math.round(coverageOverlap * 100)}
                               onChange={(e) => setCoverageOverlap(Math.min(0.2, Math.max(0.1, Number(e.target.value) / 100)))}
                               style={{width: 90}}/>
                        <span style={{fontSize: 12, opacity: 0.75}}>Spacing {sweepSpacingMeters} m (based on sensor range)</span>
                    </div>
                </Field>
                <Field label="Lawnmower">
                    <div style={{display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center"}}>
                        <button className="btn" onClick={handleStartCoverage}>Start coverage</button>
                        <span style={{fontSize: 12, opacity: 0.75}}>
                            Generates boustrophedon sweeps with {Math.round(coverageOverlap * 100)}% overlap and injects waypoints per drone.
                        </span>
                    </div>
                </Field>
            </ControlGrid>

            <ButtonRow>
                <button className="btn" onClick={handleGenerate}>Generate</button>
                <button className="btn ghost" onClick={handleRandomSeed}>Random seed</button>
                <button className="btn ghost" onClick={() => downloadScenarioJSON(scenario)}>Save JSON</button>
                <label className="btn ghost file-btn">
                    Load JSON
                    <input type="file" accept="application/json" onChange={handleFileChange}/>
                </label>
            </ButtonRow>
            <div className="meta-row">
                <div><strong>Sector</strong> {sectorMeta.bounds.widthMeters / 1000} km
                    × {sectorMeta.bounds.heightMeters / 1000} km
                </div>
                <div><strong>Sea state</strong> {sectorMeta.conditions.seaState}</div>
                <div><strong>Wind</strong> {sectorMeta.conditions.windKts} kts</div>
                <div><strong>Visibility</strong> {sectorMeta.conditions.visibilityKm} km</div>
                <div><strong>Anomalies</strong> {scenario.anomalies.items.filter((a) => a.detected).length}
                    /{scenario.anomalies.items.length} detected
                </div>
                <div>
                    <strong>Drones</strong> {drones.length} active
                </div>
                <div>
                    <strong>Drone Hub</strong> center at x: {hub.position.x.toFixed(0)} m |
                    y: {hub.position.y.toFixed(0)} m
                </div>
            </div>
            {message && <div className="callout success">{message}</div>}
            {error && <div className="callout danger">{error}</div>}
        </div>
    );

    return (
        <div className="app-shell">
            <header className="toolbar">
                <div className="brand">
                    <span className="brand-dot"/>
                    <span>BEACON - MSAR Simulator</span>
                </div>
                <div className="badge">Seed-based maritime environment</div>
            </header>
            <main className={`content ${drawerOpen ? "content-with-drawer" : ""}`}>
                <div className="viewer-row">
                    <MaritimeCanvas2D gridSpacing={200} scenario={scenario} onToggleAnomaly={handleToggleAnomaly}
                                      drones={drones}
                                      selectedDroneIds={selectedDroneIds}
                                      onSelectDrones={select}
                                      onAddDronesToSelection={add}
                                      onToggleDroneSelection={toggle}
                                      onClearDroneSelection={clear}
                                      onMoveDrone={handleDronePositionChange}
                                      onSetWaypoint={handleSetWaypoint}
                                      showSensorRange={sensorsEnabled && showSensorRanges}
                                      sensorRangeMeters={sensorSettings.rangeMeters}
                                      voronoiCells={voronoiEnabled ? voronoiCells : []}
                                      coveragePlans={coveragePlans}/>
                    <div className="panel-card" style={{minWidth: 320}}>
                        <div className="badge" style={{marginBottom: 8}}><span className="badge-dot"/> Detection log
                        </div>
                        <div style={{fontSize: 12, color: "#94a3b8", marginBottom: 6}}>Newest first ·
                            max {sensorSettings.logLimit}</div>
                        <div style={{maxHeight: 360, overflowY: "auto", display: "grid", gap: 6}}>
                            {detectionLog.length === 0 && <div style={{opacity: 0.7}}>No detections yet.</div>}
                            {detectionLog.map((entry) => (
                                <div key={entry.id} className="callout" style={{padding: 8}}>
                                    <div style={{fontWeight: 600}}>{entry.message}</div>
                                    <div style={{fontSize: 12, opacity: 0.8}}>
                                        {new Date(entry.timestamp).toLocaleTimeString()} · {entry.kind}
                                        {entry.droneId ? ` · ${entry.droneId}` : ""}
                                        {entry.anomalyType ? ` · ${entry.anomalyType}` : ""}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </main>
            <div className={`scenario-drawer ${drawerOpen ? "open" : "closed"}`}>
                <div className="drawer-surface">
                    <button className="drawer-handle" onClick={toggleDrawer} aria-expanded={drawerOpen}>
                        <span style={{fontWeight: 700}}>Scenario controls</span>
                        <span style={{opacity: 0.75}}>{drawerOpen ? "Hide" : "Show"}</span>
                        <span className="drawer-chevron">{drawerOpen ? "▼" : "▲"}</span>
                    </button>
                    <div className="drawer-body">
                        {scenarioControls}
                    </div>
                </div>
            </div>
        </div>
    );
}
