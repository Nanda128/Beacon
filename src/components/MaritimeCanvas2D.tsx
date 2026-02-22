import React, {useCallback, useEffect, useRef, useState} from "react";
import {generateWaterTileData} from "../lib/environmentGenerator";
import type {MaritimeScenario, Vec2} from "../types/environment";

type CameraState = { center: Vec2; scale: number };

type MaritimeCanvas2DProps = {
    gridSpacing?: number;
    scenario: MaritimeScenario;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const adjustedGrid = (baseSpacing: number, scale: number) => {
    let spacing = baseSpacing;
    let pixels = spacing * scale;
    while (pixels < 32) {
        spacing *= 2;
        pixels = spacing * scale;
    }
    while (pixels > 240) {
        spacing /= 2;
        pixels = spacing * scale;
    }
    return spacing;
};

export function MaritimeCanvas2D({gridSpacing = 200, scenario}: MaritimeCanvas2DProps) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const [size, setSize] = useState({width: 0, height: 0});
    const [camera, setCamera] = useState<CameraState>({center: {x: 0, y: 0}, scale: 1.2});
    const cameraRef = useRef(camera);
    const [cursorWorld, setCursorWorld] = useState<Vec2 | null>(null);
    const isDraggingRef = useRef(false);
    const lastPointerRef = useRef<Vec2>({x: 0, y: 0});
    const waterPatternRef = useRef<CanvasPattern | null>(null);
    const [isExpanded, setIsExpanded] = useState(false);
    const previousCameraRef = useRef<CameraState | null>(null);

    const computeMinScale = (padding = 16) => {
        const {widthMeters, heightMeters} = scenario.sector.bounds;
        if (size.width <= 0 || size.height <= 0 || widthMeters <= 0 || heightMeters <= 0) return 0.0001;
        const availableWidth = Math.max(size.width - padding * 2, 50);
        const availableHeight = Math.max(size.height - padding * 2, 50);
        const fitWidth = availableWidth / widthMeters;
        const fitHeight = availableHeight / heightMeters;
        return Math.max(0.0001, Math.min(fitWidth, fitHeight));
    };

    const setCameraState = (next: CameraState) => {
        const clampedScale = clamp(next.scale, computeMinScale(), 30);
        const nextState = {...next, scale: clampedScale};
        cameraRef.current = nextState;
        setCamera(nextState);
    };

    const fitCameraToSector = useCallback((padding = 48) => {
        const {origin, widthMeters, heightMeters} = scenario.sector.bounds;
        if (size.width === 0 || size.height === 0) return;
        const availableWidth = Math.max(size.width - padding * 2, 50);
        const availableHeight = Math.max(size.height - padding * 2, 50);
        const scale = Math.max(0.0001, Math.min(availableWidth / widthMeters, availableHeight / heightMeters));
        const center = {x: origin.x + widthMeters / 2, y: origin.y + heightMeters / 2};
        setCameraState({center, scale});
    }, [scenario.sector.bounds.heightMeters, scenario.sector.bounds.origin.x, scenario.sector.bounds.origin.y, scenario.sector.bounds.widthMeters, size.height, size.width]);

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

    const worldFromScreen = (screen: Vec2, scale = cameraRef.current.scale, center = cameraRef.current.center) => {
        return {
            x: (screen.x - size.width / 2) / scale + center.x,
            y: (size.height / 2 - screen.y) / scale + center.y,
        };
    };

    const screenFromWorld = (world: Vec2, scale = cameraRef.current.scale, center = cameraRef.current.center) => {
        return {
            x: (world.x - center.x) * scale + size.width / 2,
            y: size.height / 2 - (world.y - center.y) * scale,
        };
    };

    const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
        isDraggingRef.current = true;
        lastPointerRef.current = {x: event.clientX, y: event.clientY};
        event.currentTarget.setPointerCapture(event.pointerId);
    };

    const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect) return;
        const local = {x: event.clientX - rect.left, y: event.clientY - rect.top};
        setCursorWorld(worldFromScreen(local));
        if (!isDraggingRef.current) return;
        const delta = {x: event.clientX - lastPointerRef.current.x, y: event.clientY - lastPointerRef.current.y};
        lastPointerRef.current = {x: event.clientX, y: event.clientY};
        setCameraState({
            center: {
                x: cameraRef.current.center.x - delta.x / cameraRef.current.scale,
                y: cameraRef.current.center.y + delta.y / cameraRef.current.scale,
            },
            scale: cameraRef.current.scale,
        });
    };

    const handlePointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
        isDraggingRef.current = false;
        event.currentTarget.releasePointerCapture(event.pointerId);
    };

    const handleWheel = (event: React.WheelEvent<HTMLCanvasElement>) => {
        event.preventDefault();
        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect) return;
        const zoomFactor = event.deltaY < 0 ? 1.1 : 0.9;
        const nextScale = clamp(cameraRef.current.scale * zoomFactor, computeMinScale(), 30);
        const local = {x: event.clientX - rect.left, y: event.clientY - rect.top};
        const before = worldFromScreen(local, cameraRef.current.scale, cameraRef.current.center);
        const after = worldFromScreen(local, nextScale, cameraRef.current.center);
        setCameraState({
            center: {
                x: cameraRef.current.center.x + (before.x - after.x),
                y: cameraRef.current.center.y + (before.y - after.y),
            },
            scale: nextScale,
        });
    };

    const drawWater = (ctx: CanvasRenderingContext2D) => {
        const pattern = waterPatternRef.current;
        if (!pattern) return;
        const cam = cameraRef.current;
        const transform = new DOMMatrix([
            cam.scale, 0, 0, -cam.scale,
            size.width / 2 - cam.center.x * cam.scale,
            size.height / 2 + cam.center.y * cam.scale,
        ]);
        pattern.setTransform(transform);
        ctx.save();
        ctx.fillStyle = pattern;
        ctx.fillRect(0, 0, size.width, size.height);
        const grad = ctx.createLinearGradient(0, 0, 0, size.height);
        grad.addColorStop(0, "rgba(14, 165, 233, 0.08)");
        grad.addColorStop(1, "rgba(7, 89, 133, 0.08)");
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, size.width, size.height);
        ctx.restore();
    };

    const drawGrid = (ctx: CanvasRenderingContext2D) => {
        const cam = cameraRef.current;
        const spacing = adjustedGrid(gridSpacing, cam.scale);
        const startX = cam.center.x - (size.width / cam.scale) / 2;
        const endX = cam.center.x + (size.width / cam.scale) / 2;
        const startY = cam.center.y - (size.height / cam.scale) / 2;
        const endY = cam.center.y + (size.height / cam.scale) / 2;

        ctx.lineWidth = 1;
        ctx.strokeStyle = "rgba(148, 163, 184, 0.18)";

        const firstVertical = Math.floor(startX / spacing) * spacing;
        for (let x = firstVertical; x <= endX; x += spacing) {
            const px = screenFromWorld({x, y: 0}).x;
            ctx.beginPath();
            ctx.moveTo(px, 0);
            ctx.lineTo(px, size.height);
            ctx.stroke();
        }

        const firstHorizontal = Math.floor(startY / spacing) * spacing;
        for (let y = firstHorizontal; y <= endY; y += spacing) {
            const py = screenFromWorld({x: 0, y}).y;
            ctx.beginPath();
            ctx.moveTo(0, py);
            ctx.lineTo(size.width, py);
            ctx.stroke();
        }
    };

    const drawAxes = (ctx: CanvasRenderingContext2D) => {
        const cam = cameraRef.current;
        const origin = screenFromWorld({x: 0, y: 0}, cam.scale, cam.center);
        ctx.strokeStyle = "rgba(56, 189, 248, 0.45)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(0, origin.y);
        ctx.lineTo(size.width, origin.y);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(origin.x, 0);
        ctx.lineTo(origin.x, size.height);
        ctx.stroke();
        ctx.fillStyle = "rgba(125, 211, 252, 0.85)";
        ctx.beginPath();
        ctx.arc(origin.x, origin.y, 4, 0, Math.PI * 2);
        ctx.fill();
    };

    const drawCrosshair = (ctx: CanvasRenderingContext2D) => {
        const cam = cameraRef.current;
        const center = screenFromWorld(cam.center, cam.scale, cam.center);
        ctx.strokeStyle = "rgba(34, 211, 238, 0.6)";
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(center.x - 10, center.y);
        ctx.lineTo(center.x + 10, center.y);
        ctx.moveTo(center.x, center.y - 10);
        ctx.lineTo(center.x, center.y + 10);
        ctx.stroke();
        ctx.setLineDash([]);
    };

    const drawSectorBounds = (ctx: CanvasRenderingContext2D) => {
        const {origin, widthMeters, heightMeters} = scenario.sector.bounds;
        const corners: Vec2[] = [
            {x: origin.x, y: origin.y},
            {x: origin.x + widthMeters, y: origin.y},
            {x: origin.x + widthMeters, y: origin.y + heightMeters},
            {x: origin.x, y: origin.y + heightMeters},
        ];
        const screenCorners = corners.map((corner) => screenFromWorld(corner));
        ctx.save();
        ctx.strokeStyle = "rgba(94, 234, 212, 0.6)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(screenCorners[0].x, screenCorners[0].y);
        for (let i = 1; i < screenCorners.length; i++) {
            ctx.lineTo(screenCorners[i].x, screenCorners[i].y);
        }
        ctx.closePath();
        ctx.stroke();
        ctx.restore();
    };

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        const tile = generateWaterTileData(scenario.sector.water, scenario.seed);
        const tileCanvas = document.createElement("canvas");
        tileCanvas.width = tile.width;
        tileCanvas.height = tile.height;
        const tileCtx = tileCanvas.getContext("2d");
        if (!tileCtx) return;
        const image = new ImageData(tile.width, tile.height);
        image.data.set(tile.pixels);
        tileCtx.putImageData(image, 0, 0);
        waterPatternRef.current = ctx.createPattern(tileCanvas, "repeat");
    }, [scenario]);

    useEffect(() => {
        if (isExpanded) {
            fitCameraToSector();
            return;
        }
        const {origin, widthMeters, heightMeters} = scenario.sector.bounds;
        const center = {x: origin.x + widthMeters / 2, y: origin.y + heightMeters / 2};
        setCameraState({center, scale: 1.2});
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [scenario.sector.bounds.origin.x, scenario.sector.bounds.origin.y, scenario.sector.bounds.widthMeters, scenario.sector.bounds.heightMeters, isExpanded]);

    useEffect(() => {
        if (!isExpanded) return;
        if (size.width === 0 || size.height === 0) return;
        fitCameraToSector();
    }, [isExpanded, size.height, size.width, fitCameraToSector]);

    useEffect(() => {
        if (!isExpanded || !previousCameraRef.current) return;
        setCameraState(previousCameraRef.current);
        previousCameraRef.current = null;
    }, [isExpanded]);

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
            drawWater(ctx);
            drawGrid(ctx);
            drawAxes(ctx);
            drawSectorBounds(ctx);
            drawCrosshair(ctx);
            ctx.restore();
        };
        raf = requestAnimationFrame(render);
        return () => cancelAnimationFrame(raf);
    }, [size.width, size.height, gridSpacing]);

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
                        onPointerLeave={() => (isDraggingRef.current = false)}
                        onWheel={handleWheel}
                    />
                    <div className="overlay-box">
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
                        <div style={{marginTop: 4, opacity: 0.7}}>Drag to pan · Scroll to zoom</div>
                    </div>
                </div>
            </div>
        </>
    );
}

export default MaritimeCanvas2D;

