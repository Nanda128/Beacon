import {generateWaterTileData, droneHubFromBounds} from "../../domain/environment/generator";
import type {MaritimeScenario, Vec2, AnomalyInstance} from "../../domain/types/environment";
import type {DroneState} from "../../domain/types/drone";
import {anomalyTypeLabels, anomalyStyles} from "../../config/anomalies";
import {adjustedGrid, screenFromWorld, type CameraState, type Size} from "./utils";

export const createWaterPattern = (ctx: CanvasRenderingContext2D, scenario: MaritimeScenario) => {
    const tile = generateWaterTileData(scenario.sector.water, scenario.seed);
    const tileCanvas = document.createElement("canvas");
    tileCanvas.width = tile.width;
    tileCanvas.height = tile.height;
    const tileCtx = tileCanvas.getContext("2d");
    if (!tileCtx) return null;
    const image = new ImageData(tile.width, tile.height);
    image.data.set(tile.pixels);
    tileCtx.putImageData(image, 0, 0);
    return ctx.createPattern(tileCanvas, "repeat");
};

export const drawWater = (ctx: CanvasRenderingContext2D, size: Size, camera: CameraState, pattern: CanvasPattern | null) => {
    if (!pattern) return;
    const transform = new DOMMatrix([
        camera.scale, 0, 0, -camera.scale,
        size.width / 2 - camera.center.x * camera.scale,
        size.height / 2 + camera.center.y * camera.scale,
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

export const drawGrid = (ctx: CanvasRenderingContext2D, size: Size, camera: CameraState, baseSpacing: number) => {
    const spacing = adjustedGrid(baseSpacing, camera.scale);
    const startX = camera.center.x - (size.width / camera.scale) / 2;
    const endX = camera.center.x + (size.width / camera.scale) / 2;
    const startY = camera.center.y - (size.height / camera.scale) / 2;
    const endY = camera.center.y + (size.height / camera.scale) / 2;

    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(148, 163, 184, 0.18)";

    const firstVertical = Math.floor(startX / spacing) * spacing;
    for (let x = firstVertical; x <= endX; x += spacing) {
        const px = screenFromWorld({x, y: 0}, size, camera).x;
        ctx.beginPath();
        ctx.moveTo(px, 0);
        ctx.lineTo(px, size.height);
        ctx.stroke();
    }

    const firstHorizontal = Math.floor(startY / spacing) * spacing;
    for (let y = firstHorizontal; y <= endY; y += spacing) {
        const py = screenFromWorld({x: 0, y}, size, camera).y;
        ctx.beginPath();
        ctx.moveTo(0, py);
        ctx.lineTo(size.width, py);
        ctx.stroke();
    }
};

export const drawAxes = (ctx: CanvasRenderingContext2D, size: Size, camera: CameraState) => {
    const origin = screenFromWorld({x: 0, y: 0}, size, camera);
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

export const drawSectorBounds = (ctx: CanvasRenderingContext2D, size: Size, camera: CameraState, scenario: MaritimeScenario) => {
    const {origin, widthMeters, heightMeters} = scenario.sector.bounds;
    const corners: Vec2[] = [
        {x: origin.x, y: origin.y},
        {x: origin.x + widthMeters, y: origin.y},
        {x: origin.x + widthMeters, y: origin.y + heightMeters},
        {x: origin.x, y: origin.y + heightMeters},
    ];
    const screenCorners = corners.map((corner) => screenFromWorld(corner, size, camera));
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

export const drawCrosshair = (ctx: CanvasRenderingContext2D, size: Size, camera: CameraState) => {
    const center = screenFromWorld(camera.center, size, camera);
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

export const drawDroneHub = (ctx: CanvasRenderingContext2D, size: Size, camera: CameraState, scenario: MaritimeScenario) => {
    const hub = droneHubFromBounds(scenario.sector.bounds);
    if (hub.radius <= 0) return;
    const center = screenFromWorld(hub.position, size, camera);
    const radiusPx = hub.radius * camera.scale;
    ctx.save();
    ctx.fillStyle = "rgba(14,165,233,0.08)";
    ctx.strokeStyle = "rgba(14,165,233,0.45)";
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(center.x, center.y, radiusPx, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "rgba(14,165,233,0.9)";
    ctx.font = "11px 'Inter', system-ui, -apple-system, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Drone Hub", center.x, center.y - 6);
    ctx.restore();
};

export const drawAnomalyShape = (ctx: CanvasRenderingContext2D, style: {
    color: string;
    fill: string;
    size: number;
    shape: string;
}, center: Vec2) => {
    ctx.fillStyle = style.fill;
    ctx.strokeStyle = style.color;
    ctx.lineWidth = 1.5;
    const s = style.size;
    ctx.beginPath();
    if (style.shape === "square") {
        ctx.rect(center.x - s, center.y - s, s * 2, s * 2);
    } else if (style.shape === "triangle") {
        ctx.moveTo(center.x, center.y - s);
        ctx.lineTo(center.x + s, center.y + s);
        ctx.lineTo(center.x - s, center.y + s);
        ctx.closePath();
    } else {
        ctx.arc(center.x, center.y, s, 0, Math.PI * 2);
    }
    ctx.fill();
    ctx.stroke();
};

export const drawAnomalies = (ctx: CanvasRenderingContext2D, size: Size, camera: CameraState, scenario: MaritimeScenario) => {
    scenario.anomalies.items.forEach((item) => {
        const style = anomalyStyles[item.type];
        const screenPos = screenFromWorld(item.position, size, camera);
        const detectionRadiusPx = item.detectionRadiusMeters * camera.scale;
        ctx.save();
        ctx.globalAlpha = item.detected ? 0.35 : 0.18;
        ctx.strokeStyle = style.color;
        ctx.setLineDash([6, 6]);
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(screenPos.x, screenPos.y, detectionRadiusPx, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
        if (item.detected) {
            ctx.shadowColor = style.color;
            ctx.shadowBlur = 12;
        }
        drawAnomalyShape(ctx, style, screenPos);
        ctx.shadowBlur = 0;
        ctx.fillStyle = "#e5e7eb";
        ctx.font = "11px 'Inter', system-ui, -apple-system, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(anomalyTypeLabels[item.type], screenPos.x, screenPos.y - (style.size + 10));
        ctx.restore();
    });
};

export const drawDrones = (ctx: CanvasRenderingContext2D, size: Size, camera: CameraState, drones: DroneState[], selectedIds: string[]) => {
    drones.forEach((drone) => {
        const screenPos = screenFromWorld(drone.position, size, camera);
        const isSelected = selectedIds.includes(drone.id);
        const path = [] as Vec2[];
        if (drone.targetPosition) path.push(drone.targetPosition);
        if (drone.waypoints && drone.waypoints.length > 0) path.push(...drone.waypoints);
        if (path.length > 0) {
            const screenPath = path.map((p) => screenFromWorld(p, size, camera));
            ctx.save();
            ctx.strokeStyle = "rgba(251,191,36,0.8)";
            ctx.setLineDash([6, 4]);
            ctx.lineWidth = 1.2;
            ctx.beginPath();
            ctx.moveTo(screenPos.x, screenPos.y);
            screenPath.forEach((pt) => ctx.lineTo(pt.x, pt.y));
            ctx.stroke();
            ctx.restore();
            screenPath.forEach((pt, idx) => {
                ctx.save();
                if (idx === 0) {
                    ctx.fillStyle = "rgba(251,191,36,0.9)";
                    ctx.beginPath();
                    ctx.arc(pt.x, pt.y, 6, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.strokeStyle = "rgba(217,119,6,0.95)";
                    ctx.lineWidth = 1.5;
                    ctx.stroke();
                } else {
                    ctx.fillStyle = "rgba(251,191,36,0.5)";
                    ctx.beginPath();
                    ctx.arc(pt.x, pt.y, 4.5, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.strokeStyle = "rgba(217,119,6,0.6)";
                    ctx.lineWidth = 1.2;
                    ctx.stroke();
                }
                ctx.restore();
            });
        }
        ctx.save();
        if (isSelected) {
            ctx.strokeStyle = "rgba(234,179,8,0.9)";
            ctx.lineWidth = 2.2;
            ctx.beginPath();
            ctx.arc(screenPos.x, screenPos.y, 16, 0, Math.PI * 2);
            ctx.stroke();
        }
        const radius = 9;
        ctx.fillStyle = isSelected ? "#fbbf24" : "#38bdf8";
        ctx.strokeStyle = isSelected ? "#f59e0b" : "#0ea5e9";
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.arc(screenPos.x, screenPos.y, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
        ctx.fillStyle = "#e5e7eb";
        ctx.font = "11px 'Inter', system-ui, -apple-system, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(drone.callsign, screenPos.x, screenPos.y + 20);
    });
};

export const drawSelectionBox = (ctx: CanvasRenderingContext2D, size: Size, camera: CameraState, selectionBox: { start: Vec2; end: Vec2 } | null) => {
    if (!selectionBox) return;
    const {start, end} = selectionBox;
    const minX = Math.min(start.x, end.x);
    const maxX = Math.max(start.x, end.x);
    const minY = Math.min(start.y, end.y);
    const maxY = Math.max(start.y, end.y);
    const topLeft = screenFromWorld({x: minX, y: maxY}, size, camera);
    const bottomRight = screenFromWorld({x: maxX, y: minY}, size, camera);
    const width = bottomRight.x - topLeft.x;
    const height = bottomRight.y - topLeft.y;
    ctx.save();
    ctx.strokeStyle = "rgba(251,191,36,0.9)";
    ctx.setLineDash([6, 4]);
    ctx.lineWidth = 1.5;
    ctx.strokeRect(topLeft.x, topLeft.y, width, height);
    ctx.fillStyle = "rgba(251,191,36,0.12)";
    ctx.fillRect(topLeft.x, topLeft.y, width, height);
    ctx.restore();
};

export const findAnomalyAtScreen = (screen: Vec2, items: AnomalyInstance[], size: Size, camera: CameraState): AnomalyInstance | null => {
    const hitRadiusPx = 12;
    let closest: AnomalyInstance | null = null;
    let best = hitRadiusPx;
    items.forEach((item) => {
        const pt = screenFromWorld(item.position, size, camera);
        const dist = Math.hypot(pt.x - screen.x, pt.y - screen.y);
        if (dist <= best) {
            closest = item;
            best = dist;
        }
    });
    return closest;
};

export const findDroneAtScreen = (screen: Vec2, items: DroneState[], size: Size, camera: CameraState): DroneState | null => {
    const hitRadiusPx = 16;
    let closest: DroneState | null = null;
    let best = hitRadiusPx;
    items.forEach((item) => {
        const pt = screenFromWorld(item.position, size, camera);
        const dist = Math.hypot(pt.x - screen.x, pt.y - screen.y);
        if (dist <= best) {
            closest = item;
            best = dist;
        }
    });
    return closest;
};

