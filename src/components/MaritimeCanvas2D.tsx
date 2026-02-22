import React, {useCallback, useEffect, useRef, useState} from "react";
import type {MaritimeScenario, Vec2} from "../domain/types/environment";
import type {AnomalyType} from "../domain/types/environment";
import type {DroneState} from "../domain/types/drone";
import type {VoronoiCell} from "./canvas/voronoi";
import type {CoveragePlan} from "../domain/coverage/planner";
import {anomalyTypeLabels} from "../config/anomalies";
import {
    adjustedGrid,
    clamp,
    computeMinScale,
    fitCameraToBounds,
    selectionBounds,
    worldFromScreen,
    type CameraState,
    type Size,
} from "./canvas/utils";
import {
    createWaterPattern,
    drawAxes,
    drawAnomalies,
    drawCrosshair,
    drawDrones,
    drawGrid,
    drawSectorBounds,
    drawSelectionBox,
    drawWater,
    findAnomalyAtScreen,
    findDroneAtScreen,
    drawDroneHub,
    drawVoronoiCells,
    drawCoveragePaths,
} from "./canvas/layers";
import {anomalyStyles} from "../config/anomalies";

type MaritimeCanvas2DProps = {
    gridSpacing?: number;
    scenario: MaritimeScenario;
    onToggleAnomaly?: (id: string) => void;
    drones?: DroneState[];
    selectedDroneIds?: string[];
    onSelectDrones?: (ids: string[]) => void;
    onAddDronesToSelection?: (ids: string[]) => void;
    onToggleDroneSelection?: (ids: string[]) => void;
    onClearDroneSelection?: () => void;
    onMoveDrone?: (id: string, position: Vec2) => void;
    onSetWaypoint?: (point: Vec2, append?: boolean) => void;
    showSensorRange?: boolean;
    sensorRangeMeters?: number;
    voronoiCells?: VoronoiCell[];
    coveragePlans?: CoveragePlan[];
};

const MaritimeCanvas2D = ({
                              gridSpacing = 200,
                              scenario,
                              onToggleAnomaly,
                              drones = [],
                              selectedDroneIds = [],
                              onSelectDrones,
                              onAddDronesToSelection,
                              onToggleDroneSelection,
                              onClearDroneSelection,
                              onMoveDrone,
                              onSetWaypoint,
                              showSensorRange,
                              sensorRangeMeters,
                              voronoiCells,
                              coveragePlans,
                          }: MaritimeCanvas2DProps) => {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const [size, setSize] = useState<Size>({width: 0, height: 0});
    const [camera, setCamera] = useState<CameraState>({center: {x: 0, y: 0}, scale: 1.2});
    const cameraRef = useRef(camera);
    const [cursorWorld, setCursorWorld] = useState<Vec2 | null>(null);
    const isDraggingRef = useRef(false);
    const lastPointerRef = useRef<Vec2>({x: 0, y: 0});
    const pointerMovedRef = useRef(false);
    const interactionModeRef = useRef<"pan" | "drone" | "select" | null>(null);
    const draggingDroneIdRef = useRef<string | null>(null);
    const dragOffsetRef = useRef<Vec2>({x: 0, y: 0});
    const selectionBoxRef = useRef<{ start: Vec2; end: Vec2 } | null>(null);
    const [selectionBox, setSelectionBox] = useState<{ start: Vec2; end: Vec2 } | null>(null);
    const waterPatternRef = useRef<CanvasPattern | null>(null);
    const [isExpanded, setIsExpanded] = useState(false);
    const previousCameraRef = useRef<CameraState | null>(null);

    const computeScale = useCallback(() => computeMinScale(size, scenario.sector.bounds), [size, scenario.sector.bounds]);

    const setCameraState = useCallback((next: CameraState) => {
        const clampedScale = clamp(next.scale, computeScale(), 30);
        const nextState = {...next, scale: clampedScale};
        cameraRef.current = nextState;
        setCamera(nextState);
    }, [computeScale]);

    const fitCameraToSector = useCallback((padding = 48) => {
        const next = fitCameraToBounds(size, scenario.sector.bounds, padding);
        if (next) setCameraState(next);
    }, [scenario.sector.bounds, setCameraState, size]);

    const toggleExpanded = () => {
        setIsExpanded((prev) => {
            if (!prev) {
                previousCameraRef.current = cameraRef.current;
            }
            return !prev;
        });
    };

    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        const resizeObserver = new ResizeObserver((entries) => {
            const entry = entries[0];
            setSize({width: entry.contentRect.width, height: entry.contentRect.height});
        });
        resizeObserver.observe(el);
        return () => resizeObserver.disconnect();
    }, []);

    const beginSelectionBox = (world: Vec2) => {
        const next = {start: world, end: world};
        selectionBoxRef.current = next;
        setSelectionBox(next);
    };

    const updateSelectionBox = (world: Vec2) => {
        if (!selectionBoxRef.current) return;
        const next = {...selectionBoxRef.current, end: world};
        selectionBoxRef.current = next;
        setSelectionBox(next);
    };

    const clearSelectionBox = () => {
        selectionBoxRef.current = null;
        setSelectionBox(null);
    };

    const applySelection = (ids: string[], mode: "replace" | "add" | "toggle") => {
        if (ids.length === 0 && mode === "replace") {
            onClearDroneSelection?.();
            return;
        }
        if (mode === "add") {
            onAddDronesToSelection?.(ids);
            return;
        }
        if (mode === "toggle") {
            onToggleDroneSelection?.(ids);
            return;
        }
        onSelectDrones?.(ids);
    };

    const selectionModeFromEvent = (event: React.PointerEvent | React.MouseEvent | React.KeyboardEvent) => {
        if (event.ctrlKey || event.metaKey) return "toggle" as const;
        if (event.shiftKey) return "add" as const;
        return "replace" as const;
    };

    const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect) return;
        const local = {x: event.clientX - rect.left, y: event.clientY - rect.top};
        const hitDrone = findDroneAtScreen(local, drones, size, cameraRef.current);
        const world = worldFromScreen(local, size, cameraRef.current);
        pointerMovedRef.current = false;
        isDraggingRef.current = true;
        lastPointerRef.current = {x: event.clientX, y: event.clientY};
        const mode = selectionModeFromEvent(event);
        if (hitDrone) {
            interactionModeRef.current = "drone";
            draggingDroneIdRef.current = hitDrone.id;
            dragOffsetRef.current = {x: hitDrone.position.x - world.x, y: hitDrone.position.y - world.y};
            applySelection([hitDrone.id], mode);
        } else {
            const shouldPan = event.button === 1 || event.button === 2 || event.altKey;
            if (shouldPan) {
                interactionModeRef.current = "pan";
            } else {
                interactionModeRef.current = "select";
                beginSelectionBox(world);
            }
        }
        setCursorWorld(world);
        event.currentTarget.setPointerCapture(event.pointerId);
    };

    const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect) return;
        const local = {x: event.clientX - rect.left, y: event.clientY - rect.top};
        setCursorWorld(worldFromScreen(local, size, cameraRef.current));
        if (!isDraggingRef.current) return;
        const delta = {x: event.clientX - lastPointerRef.current.x, y: event.clientY - lastPointerRef.current.y};
        if (Math.abs(delta.x) > 2 || Math.abs(delta.y) > 2) {
            pointerMovedRef.current = true;
        }
        lastPointerRef.current = {x: event.clientX, y: event.clientY};
        if (interactionModeRef.current === "pan") {
            setCameraState({
                center: {
                    x: cameraRef.current.center.x - delta.x / cameraRef.current.scale,
                    y: cameraRef.current.center.y + delta.y / cameraRef.current.scale,
                },
                scale: cameraRef.current.scale,
            });
        } else if (interactionModeRef.current === "drone" && draggingDroneIdRef.current) {
            const world = worldFromScreen(local, size, cameraRef.current);
            const target = {x: world.x + dragOffsetRef.current.x, y: world.y + dragOffsetRef.current.y};
            onMoveDrone?.(draggingDroneIdRef.current, target);
        } else if (interactionModeRef.current === "select") {
            updateSelectionBox(worldFromScreen(local, size, cameraRef.current));
        }
    };

    const handlePointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
        event.currentTarget.releasePointerCapture(event.pointerId);
        const rect = canvasRef.current?.getBoundingClientRect();
        const mode = selectionModeFromEvent(event);
        if (!pointerMovedRef.current && rect) {
            const local = {x: event.clientX - rect.left, y: event.clientY - rect.top};
            if (interactionModeRef.current === "drone") {
                // click already applied selection on down
            } else {
                const hitDrone = findDroneAtScreen(local, drones, size, cameraRef.current);
                const append = event.shiftKey || event.ctrlKey || event.metaKey;
                if (hitDrone) {
                    applySelection([hitDrone.id], mode);
                } else if (onToggleAnomaly) {
                    const hit = findAnomalyAtScreen(local, scenario.anomalies.items, size, cameraRef.current);
                    if (hit) {
                        onToggleAnomaly(hit.id);
                    } else if (selectedDroneIds.length > 0) {
                        onSetWaypoint?.(worldFromScreen(local, size, cameraRef.current), append);
                    } else {
                        onClearDroneSelection?.();
                    }
                } else if (selectedDroneIds.length > 0) {
                    onSetWaypoint?.(worldFromScreen(local, size, cameraRef.current), append);
                } else {
                    onClearDroneSelection?.();
                }
            }
        } else if (interactionModeRef.current === "select" && selectionBoxRef.current) {
            const {start, end} = selectionBoxRef.current;
            const {minX, maxX, minY, maxY} = selectionBounds(start, end);
            const hits = drones.filter((drone) => {
                const {x, y} = drone.position;
                return x >= minX && x <= maxX && y >= minY && y <= maxY;
            }).map((d) => d.id);
            if (hits.length > 0) {
                applySelection(hits, mode);
            } else if (mode === "replace") {
                onClearDroneSelection?.();
            }
        }
        clearSelectionBox();
        isDraggingRef.current = false;
        interactionModeRef.current = null;
        draggingDroneIdRef.current = null;
    };

    const handleWheel = (event: React.WheelEvent<HTMLCanvasElement>) => {
        event.preventDefault();
        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect) return;
        const zoomFactor = event.deltaY < 0 ? 1.1 : 0.9;
        const nextScale = clamp(cameraRef.current.scale * zoomFactor, computeScale(), 30);
        const local = {x: event.clientX - rect.left, y: event.clientY - rect.top};
        const before = worldFromScreen(local, size, cameraRef.current);
        const after = worldFromScreen(local, size, {...cameraRef.current, scale: nextScale});
        setCameraState({
            center: {
                x: cameraRef.current.center.x + (before.x - after.x),
                y: cameraRef.current.center.y + (before.y - after.y),
            },
            scale: nextScale,
        });
    };

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        waterPatternRef.current = createWaterPattern(ctx, scenario);
    }, [scenario]);

    useEffect(() => {
        if (isExpanded) {
            fitCameraToSector();
            return;
        }
        const {origin, widthMeters, heightMeters} = scenario.sector.bounds;
        const center = {x: origin.x + widthMeters / 2, y: origin.y + heightMeters / 2};
        setCameraState({center, scale: 1.2});
    }, [scenario.sector.bounds, isExpanded]);

    useEffect(() => {
        if (size.width === 0 || size.height === 0) return;
        fitCameraToSector();
    }, [isExpanded, size.height, size.width, fitCameraToSector]);

    useEffect(() => {
        if (!isExpanded) return;
        if (size.width === 0 || size.height === 0) return;
        fitCameraToSector();
    }, [isExpanded, size.height, size.width, fitCameraToSector]);

    useEffect(() => {
        if (!isExpanded) return;
        previousCameraRef.current = null;
    }, [scenario.sector.bounds.heightMeters, scenario.sector.bounds.origin.x, scenario.sector.bounds.origin.y, scenario.sector.bounds.widthMeters, scenario.seed, isExpanded]);

    useEffect(() => {
        if (!isExpanded) return;
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => {
            document.body.style.overflow = previousOverflow;
        };
    }, [isExpanded]);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || size.width === 0 || size.height === 0) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        const dpr = window.devicePixelRatio || 1;
        canvas.width = Math.round(size.width * dpr);
        canvas.height = Math.round(size.height * dpr);
        ctx.scale(dpr, dpr);

        let raf = 0;
        const render = () => {
            raf = requestAnimationFrame(render);
            ctx.save();
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            ctx.clearRect(0, 0, size.width, size.height);
            drawWater(ctx, size, cameraRef.current, waterPatternRef.current);
            drawGrid(ctx, size, cameraRef.current, gridSpacing);
            drawAxes(ctx, size, cameraRef.current);
            drawSectorBounds(ctx, size, cameraRef.current, scenario);
            drawVoronoiCells(ctx, size, cameraRef.current, voronoiCells, selectedDroneIds);
            drawCoveragePaths(ctx, size, cameraRef.current, coveragePlans, selectedDroneIds);
            drawDroneHub(ctx, size, cameraRef.current, scenario);
            drawAnomalies(ctx, size, cameraRef.current, scenario);
            drawDrones(ctx, size, cameraRef.current, drones, selectedDroneIds, {
                showSensorRange,
                sensorRangeMeters,
            });
            drawSelectionBox(ctx, size, cameraRef.current, selectionBox);
            drawCrosshair(ctx, size, cameraRef.current);
            ctx.restore();
        };
        raf = requestAnimationFrame(render);
        return () => cancelAnimationFrame(raf);
    }, [size.width, size.height, gridSpacing, drones, scenario, selectedDroneIds, selectionBox, showSensorRange, sensorRangeMeters, voronoiCells, coveragePlans]);

    useEffect(() => {
        const handleGlobalPointerDown = (event: PointerEvent) => {
            const container = containerRef.current;
            if (!container) return;
            const target = event.target as Node | null;
            if (target && container.contains(target)) return;
            onClearDroneSelection?.();
        };
        document.addEventListener("pointerdown", handleGlobalPointerDown);
        return () => document.removeEventListener("pointerdown", handleGlobalPointerDown);
    }, [onClearDroneSelection]);

    return (
        <>
            {isExpanded && <div className="canvas-fullscreen-backdrop" onClick={toggleExpanded}/>}
            <div className="panel-card">
                <div className="badge" style={{marginBottom: 10}}>
                    <span className="badge-dot"/> 2D canvas
                </div>
                <div ref={containerRef} className={`canvas-wrapper ${isExpanded ? "expanded" : ""}`}>
                    <button className="expand-button" onClick={toggleExpanded}>
                        {isExpanded ? "Exit full view" : "Full view"}
                    </button>
                    <canvas
                        ref={canvasRef}
                        onPointerDown={handlePointerDown}
                        onPointerMove={handlePointerMove}
                        onPointerUp={handlePointerUp}
                        onPointerLeave={() => {
                            isDraggingRef.current = false;
                            interactionModeRef.current = null;
                            draggingDroneIdRef.current = null;
                            clearSelectionBox();
                        }}
                        onWheel={handleWheel}
                    />
                    <div className="overlay-box">
                        {onClearDroneSelection && (
                            <div style={{marginBottom: 6}}>
                                <button className="btn ghost" onClick={onClearDroneSelection} style={{width: "100%"}}>
                                    Deselect all drones
                                </button>
                            </div>
                        )}
                        <div><strong>Center</strong> x: {camera.center.x.toFixed(1)} m |
                            y: {camera.center.y.toFixed(1)} m
                        </div>
                        <div><strong>Scale</strong> {camera.scale.toFixed(2)} px/unit</div>
                        <div><strong>Grid</strong> ~{adjustedGrid(gridSpacing, camera.scale).toFixed(0)} m</div>
                        {cursorWorld && (
                            <div><strong>Cursor</strong> x: {cursorWorld.x.toFixed(1)} | y: {cursorWorld.y.toFixed(1)}
                            </div>
                        )}
                        <div><strong>Seed</strong> {scenario.seed}</div>
                        <div>
                            <strong>Conditions</strong> SS {scenario.sector.conditions.seaState} · {scenario.sector.conditions.windKts} kts
                            · {scenario.sector.conditions.visibilityKm} km vis
                        </div>
                        <div>
                            <strong>Anomalies</strong> {scenario.anomalies.items.filter((a) => a.detected).length}/{scenario.anomalies.items.length} detected
                        </div>
                        <div>
                            <strong>Drones</strong> {drones.length} active
                        </div>
                        {voronoiCells && voronoiCells.length > 0 && (
                            <div>
                                <strong>Voronoi</strong> {voronoiCells.length} cells
                            </div>
                        )}
                        {coveragePlans && coveragePlans.length > 0 && (
                            <div>
                                <strong>Coverage</strong> avg {Math.round(coveragePlans.reduce((sum, p) => sum + p.completenessPct, 0) / coveragePlans.length)}%
                            </div>
                        )}
                        <div style={{display: "grid", gap: 2, marginTop: 4}}>
                            {Object.entries(anomalyStyles).map(([type, style]) => {
                                const typed = type as AnomalyType;
                                const detected = scenario.anomalies.items.filter((a) => a.type === typed && a.detected).length;
                                const total = scenario.anomalies.items.filter((a) => a.type === typed).length;
                                return (
                                    <div key={type}
                                         style={{display: "flex", alignItems: "center", gap: 6, fontSize: 12}}>
                                        <span style={{
                                            width: 10,
                                            height: 10,
                                            borderRadius: 2,
                                            background: style.color,
                                            display: "inline-block"
                                        }}/>
                                        <span>{anomalyTypeLabels[typed]}: {detected}/{total}</span>
                                    </div>
                                );
                            })}
                        </div>
                        <div style={{marginTop: 4, opacity: 0.7}}>Drag empty water to box-select (Shift add, Ctrl/Cmd
                            toggle)
                            · Alt/right drag to pan · Scroll to zoom · Drag drones to reposition · Shift/Ctrl/Cmd click
                            to
                            queue waypoint · Click marker to
                            toggle
                            detected
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}

export default MaritimeCanvas2D;
