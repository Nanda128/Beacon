import {Delaunay} from "d3-delaunay";
import type {DroneState} from "../../domain/types/drone";
import type {SectorBounds, Vec2} from "../../domain/types/environment";

export type VoronoiCell = {
    droneId: string;
    polygon: Vec2[];
    centroid: Vec2;
};

const clampNumber = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const clampToBounds = (point: Vec2, bounds: SectorBounds): Vec2 => {
    const x0 = bounds.origin.x;
    const x1 = bounds.origin.x + bounds.widthMeters;
    const y0 = bounds.origin.y;
    const y1 = bounds.origin.y + bounds.heightMeters;
    return {
        x: clampNumber(point.x, x0, x1),
        y: clampNumber(point.y, y0, y1),
    };
};

const spreadCoincident = (points: { drone: DroneState; position: Vec2 }[], bounds: SectorBounds) => {
    const grouped: Record<string, { base: Vec2; items: { drone: DroneState; position: Vec2 }[] }> = {};
    points.forEach((p) => {
        const key = `${p.position.x.toFixed(3)}-${p.position.y.toFixed(3)}`;
        if (!grouped[key]) grouped[key] = {base: p.position, items: []};
        grouped[key].items.push(p);
    });
    const minDim = Math.min(bounds.widthMeters, bounds.heightMeters);
    const radius = Math.max(0.5, minDim * 0.001); // gentle nudge to separate coincident points
    const result: { drone: DroneState; position: Vec2 }[] = [];
    Object.values(grouped).forEach(({base, items}) => {
        if (items.length === 1) {
            result.push(items[0]);
            return;
        }
        const count = items.length;
        items.forEach((item, idx) => {
            const angle = (2 * Math.PI * idx) / count;
            const adjusted = clampToBounds({
                x: base.x + Math.cos(angle) * radius,
                y: base.y + Math.sin(angle) * radius,
            }, bounds);
            result.push({drone: item.drone, position: adjusted});
        });
    });
    return result;
};

const polygonCentroid = (points: Vec2[]): Vec2 => {
    if (points.length === 0) return {x: 0, y: 0};
    // Use area-weighted centroid; fallback to average if degenerate
    let area = 0;
    let cx = 0;
    let cy = 0;
    for (let i = 0; i < points.length; i++) {
        const p1 = points[i];
        const p2 = points[(i + 1) % points.length];
        const cross = p1.x * p2.y - p2.x * p1.y;
        area += cross;
        cx += (p1.x + p2.x) * cross;
        cy += (p1.y + p2.y) * cross;
    }
    if (Math.abs(area) < 1e-5) {
        const avg = points.reduce((acc, p) => ({x: acc.x + p.x, y: acc.y + p.y}), {x: 0, y: 0});
        return {x: avg.x / points.length, y: avg.y / points.length};
    }
    const factor = 1 / (3 * area);
    return {x: cx * factor, y: cy * factor};
};

const polygonArea = (points: Vec2[]): number => {
    if (points.length < 3) return 0;
    let area = 0;
    for (let i = 0; i < points.length; i++) {
        const p1 = points[i];
        const p2 = points[(i + 1) % points.length];
        area += p1.x * p2.y - p2.x * p1.y;
    }
    return Math.abs(area) / 2;
};

const buildCells = (
    sites: { drone: DroneState; position: Vec2 }[],
    bounds: SectorBounds,
): VoronoiCell[] => {
    const x0 = bounds.origin.x;
    const y0 = bounds.origin.y;
    const x1 = bounds.origin.x + bounds.widthMeters;
    const y1 = bounds.origin.y + bounds.heightMeters;
    const delaunay = Delaunay.from(sites, (d) => d.position.x, (d) => d.position.y);
    const voronoi = delaunay.voronoi([x0, y0, x1, y1]);
    const cells: VoronoiCell[] = [];
    sites.forEach((site, idx) => {
        const polygonPairs = voronoi.cellPolygon(idx);
        if (!polygonPairs || polygonPairs.length < 3) return;
        const polygon = polygonPairs.map(([x, y]) => ({
            x: clampNumber(x, x0, x1),
            y: clampNumber(y, y0, y1),
        }));
        cells.push({
            droneId: site.drone.id,
            polygon,
            centroid: polygonCentroid(polygon),
        });
    });
    return cells;
};

const rebalanceVoronoiAreas = (
    sites: { drone: DroneState; position: Vec2 }[],
    bounds: SectorBounds,
    maxIterations = 10,
    tolerance = 0.15,
): VoronoiCell[] => {
    const totalArea = bounds.widthMeters * bounds.heightMeters;
    const weights = sites.map((s) => Math.max(0.1, s.drone.speedKts ?? 0));
    const weightSum = weights.reduce((a, b) => a + b, 0) || 1;
    const targetAreaByDrone = new Map<string, number>();
    sites.forEach((s, idx) => {
        targetAreaByDrone.set(s.drone.id, totalArea * (weights[idx] / weightSum));
    });
    const center = {
        x: bounds.origin.x + bounds.widthMeters / 2,
        y: bounds.origin.y + bounds.heightMeters / 2,
    };
    const minDim = Math.min(bounds.widthMeters, bounds.heightMeters);
    let workingSites = sites;
    let lastCells: VoronoiCell[] = [];
    for (let iter = 0; iter < maxIterations; iter++) {
        const cells = buildCells(workingSites, bounds);
        lastCells = cells;
        if (cells.length === 0) break;
        const deviations = cells.map((c) => {
            const target = targetAreaByDrone.get(c.droneId) ?? (totalArea / sites.length);
            return Math.abs(polygonArea(c.polygon) - target) / target;
        });
        const maxDeviation = deviations.length > 0 ? Math.max(...deviations) : 0;
        if (maxDeviation <= tolerance) return cells;
        const cellById = new Map(cells.map((c) => [c.droneId, c]));
        const moveScale = (minDim * 0.2) / (iter + 1);
        workingSites = workingSites.map((site) => {
            const cell = cellById.get(site.drone.id);
            if (!cell) return site;
            const target = targetAreaByDrone.get(site.drone.id) ?? (totalArea / sites.length);
            const areaError = (polygonArea(cell.polygon) - target) / target;
            const dir = {
                x: site.position.x - center.x,
                y: site.position.y - center.y,
            };
            const dirLen = Math.hypot(dir.x, dir.y) || 1;
            const dirNorm = {x: dir.x / dirLen, y: dir.y / dirLen};
            const radialAdjust = -areaError * moveScale;
            const centroidPull = {
                x: (cell.centroid.x - site.position.x) * 0.35,
                y: (cell.centroid.y - site.position.y) * 0.35,
            };
            const proposed = {
                x: site.position.x + dirNorm.x * radialAdjust + centroidPull.x,
                y: site.position.y + dirNorm.y * radialAdjust + centroidPull.y,
            };
            return {drone: site.drone, position: clampToBounds(proposed, bounds)};
        });
    }
    return lastCells.length > 0 ? lastCells : buildCells(workingSites, bounds);
};

export const computeVoronoiCells = (
    drones: DroneState[],
    bounds: SectorBounds,
    selectedIds: string[] | undefined,
): VoronoiCell[] => {
    const raw = (selectedIds && selectedIds.length > 0
            ? drones.filter((d) => selectedIds.includes(d.id))
            : drones
    ).map((d) => ({drone: d, position: clampToBounds(d.position, bounds)}));

    const candidatesWithSpread = spreadCoincident(raw, bounds);

    if (candidatesWithSpread.length < 2) return [];

    return rebalanceVoronoiAreas(candidatesWithSpread, bounds);
};
