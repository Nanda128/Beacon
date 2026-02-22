import React, {useCallback, useEffect, useMemo, useRef, useState} from "react";
import MaritimeCanvas2D from "./components/MaritimeCanvas2D";
import {anomalyTypeLabels, anomalyTypeOrder} from "./config/anomalies";
import type {Vec2} from "./domain/types/environment";
import {createDroneId, type DroneState, type SpawnPoint} from "./domain/types/drone";
import {droneModels, lastModelStorageKey, droneHubReturnReserveMinutes} from "./config/constants";
import {scenarioPresets} from "./data/scenarios";
import {useScenario} from "./hooks/useScenario";
import {useDroneSelection} from "./hooks/useDroneSelection";
import Badge from "./components/ui/Badge";
import Field, {ControlGrid, FieldInline} from "./components/ui/Field";
import ButtonRow from "./components/ui/ButtonRow";
import "./index.css";
import {droneHubFromBounds} from "./domain/environment/generator";

export default function App() {
    const [drones, setDrones] = useState<DroneState[]>([]);
    const {selectedIds: selectedDroneIds, select, add, toggle, clear} = useDroneSelection();
    const resetDrones = useCallback(() => {
        setDrones([]);
        clear();
    }, [clear]);
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

    useEffect(() => {
        const stored = localStorage.getItem(lastModelStorageKey);
        if (!stored) return;
        const found = droneModels.find((m) => m.id === stored);
        if (found) setSelectedDroneModelId(found.id);
    }, []);

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
        };
        setDrones((prev) => [...prev, newDrone]);
        select([newDrone.id]);
        setMessage(`Spawned ${model.label.split(" (")[0]} as ${newDrone.callsign} at ${spawn.label}`);
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

    useEffect(() => {
        let raf: number;
        const step = (timestamp: number) => {
            if (lastFrameRef.current === null) {
                lastFrameRef.current = timestamp;
            }
            const dtSeconds = (timestamp - lastFrameRef.current) / 1000;
            lastFrameRef.current = timestamp;
            setDrones((prev) => prev.map((drone) => {
                const queue = drone.waypoints ?? [];
                let target = drone.targetPosition;
                let remainingQueue = queue;
                if (!target && remainingQueue.length > 0) {
                    const [nextTarget, ...rest] = remainingQueue;
                    target = nextTarget;
                    remainingQueue = rest;
                }

                // Battery drain and auto-RTB
                const drainMinutes = dtSeconds / 60;
                const stillFlying = drone.status !== "landed";
                const batteryMinutesRemaining = Math.max(0, drone.batteryMinutesRemaining - (stillFlying ? drainMinutes : 0));
                const batteryPct = Math.max(0, Math.min(100, (batteryMinutesRemaining / drone.batteryLifeMinutes) * 100));
                const needsReturn = stillFlying && drone.status !== "returning" && batteryMinutesRemaining <= droneHubReturnReserveMinutes;
                const statusBase = needsReturn ? "returning" : drone.status;

                if (needsReturn) {
                    target = hub.position;
                    remainingQueue = [];
                }

                if (!target) {
                    if (remainingQueue !== queue || batteryMinutesRemaining !== drone.batteryMinutesRemaining || batteryPct !== drone.batteryPct || statusBase !== drone.status) {
                        return {
                            ...drone,
                            waypoints: remainingQueue,
                            batteryMinutesRemaining,
                            batteryPct,
                            status: statusBase === "landed" ? "landed" : statusBase,
                            lastUpdate: Date.now(),
                        };
                    }
                    return drone;
                }
                const speedMs = drone.speedKts * 0.514444;
                if (speedMs <= 0) return {...drone, batteryMinutesRemaining, batteryPct, status: statusBase};
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
                            lastUpdate: Date.now()
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
                        lastUpdate: Date.now()
                    };
                }
                const maxStep = speedMs * dtSeconds;
                if (maxStep <= 0) return {...drone, batteryMinutesRemaining, batteryPct, status: statusBase};
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
                            lastUpdate: Date.now(),
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
                        lastUpdate: Date.now(),
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
                    lastUpdate: Date.now(),
                };
            }));
            raf = requestAnimationFrame(step);
        };
        raf = requestAnimationFrame(step);
        return () => {
            cancelAnimationFrame(raf);
            lastFrameRef.current = null;
        };
    }, [clampToBounds, hub.position.x, hub.position.y]);

    return (
        <div className="app-shell">
            <header className="toolbar">
                <div className="brand">
                    <span className="brand-dot"/>
                    <span>BEACON - MSAR Simulator</span>
                </div>
                <div className="badge">Seed-based maritime environment</div>
            </header>
            <main className="content">
                <div className="panel-card">
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
                        <Field label=" " className="field" as="div" >
                            <div style={{display: "flex", gap: 8, alignItems: "flex-end"}}>
                                <button className="btn" onClick={handleSpawnDrone}>Spawn drone</button>
                                <button className="btn ghost" onClick={() => select(drones.map((d) => d.id))}>Select all</button>
                                <button className="btn ghost" onClick={clear}>Deselect all</button>
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
                            <strong>Drone Hub</strong> center at x: {hub.position.x.toFixed(0)} m | y: {hub.position.y.toFixed(0)} m
                        </div>
                    </div>
                    {message && <div className="callout success">{message}</div>}
                    {error && <div className="callout danger">{error}</div>}
                </div>

                <div className="viewer-row">
                    <MaritimeCanvas2D gridSpacing={200} scenario={scenario} onToggleAnomaly={handleToggleAnomaly}
                                      drones={drones}
                                      selectedDroneIds={selectedDroneIds}
                                      onSelectDrones={select}
                                      onAddDronesToSelection={add}
                                      onToggleDroneSelection={toggle}
                                      onClearDroneSelection={clear}
                                      onMoveDrone={handleDronePositionChange}
                                      onSetWaypoint={handleSetWaypoint}/>
                </div>
            </main>
        </div>
    );
}
