import type {Map} from "maplibre-gl";
import {GRID_STEPS} from "../config/mapConfig";

export type CursorInfo = {
    pixel: { x: number; y: number };
    lngLat: { lng: number; lat: number };
};

export const pickStep = (span: number) => {
    const safeSpan = Math.max(span, 0.0001);
    for (const step of GRID_STEPS) {
        if (safeSpan / step <= 12) return step;
    }
    return GRID_STEPS[GRID_STEPS.length - 1];
};

interface DrawGridParams {
    map: Map;
    canvas: HTMLCanvasElement;
    container: HTMLElement;
    showGrid: boolean;
}

export const drawGridOverlay = ({map, canvas, container, showGrid}: DrawGridParams) => {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const {width: displayWidth, height: displayHeight} = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    canvas.width = displayWidth * dpr;
    canvas.height = displayHeight * dpr;
    canvas.style.width = `${displayWidth}px`;
    canvas.style.height = `${displayHeight}px`;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!showGrid) return;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const bounds = map.getBounds();
    const west = bounds.getWest();
    const east = bounds.getEast();
    const south = bounds.getSouth();
    const north = bounds.getNorth();

    const lonStep = pickStep(Math.abs(east - west));
    const latStep = pickStep(Math.abs(north - south));

    ctx.strokeStyle = "rgba(0,0,0,0.35)";
    ctx.lineWidth = 1 / dpr;

    ctx.beginPath();
    for (let lat = Math.floor(south / latStep) * latStep; lat <= north + 1e-6; lat += latStep) {
        const p1 = map.project([west, lat]);
        const p2 = map.project([east, lat]);
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
    }

    for (let lon = Math.floor(west / lonStep) * lonStep; lon <= east + 1e-6; lon += lonStep) {
        const p1 = map.project([lon, south]);
        const p2 = map.project([lon, north]);
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
    }

    ctx.stroke();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
};
