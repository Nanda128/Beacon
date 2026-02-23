import type {Vec2} from "../../domain/types/environment";

export type CameraState = { center: Vec2; scale: number };
export type Bounds = { origin: Vec2; widthMeters: number; heightMeters: number };
export type Size = { width: number; height: number };

export const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export const adjustedGrid = (baseSpacing: number, scale: number) => {
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

export const worldFromScreen = (screen: Vec2, size: Size, camera: CameraState) => ({
    x: (screen.x - size.width / 2) / camera.scale + camera.center.x,
    y: (size.height / 2 - screen.y) / camera.scale + camera.center.y,
});

export const screenFromWorld = (world: Vec2, size: Size, camera: CameraState) => ({
    x: (world.x - camera.center.x) * camera.scale + size.width / 2,
    y: size.height / 2 - (world.y - camera.center.y) * camera.scale,
});

export const computeMinScale = (size: Size, bounds: Bounds, padding = 16) => {
    if (size.width <= 0 || size.height <= 0 || bounds.widthMeters <= 0 || bounds.heightMeters <= 0) return 0.0001;
    const availableWidth = Math.max(size.width - padding * 2, 50);
    const availableHeight = Math.max(size.height - padding * 2, 50);
    const fitWidth = availableWidth / bounds.widthMeters;
    const fitHeight = availableHeight / bounds.heightMeters;
    return Math.max(0.0001, Math.min(fitWidth, fitHeight));
};

export const fitCameraToBounds = (size: Size, bounds: Bounds, padding = 48): CameraState | null => {
    if (size.width === 0 || size.height === 0) return null;
    const availableWidth = Math.max(size.width - padding * 2, 50);
    const availableHeight = Math.max(size.height - padding * 2, 50);
    const scale = Math.max(0.0001, Math.min(availableWidth / bounds.widthMeters, availableHeight / bounds.heightMeters));
    const center = {x: bounds.origin.x + bounds.widthMeters / 2, y: bounds.origin.y + bounds.heightMeters / 2};
    return {center, scale};
};

export const selectionBounds = (start: Vec2, end: Vec2) => {
    const minX = Math.min(start.x, end.x);
    const maxX = Math.max(start.x, end.x);
    const minY = Math.min(start.y, end.y);
    const maxY = Math.max(start.y, end.y);
    return {minX, maxX, minY, maxY};
};

