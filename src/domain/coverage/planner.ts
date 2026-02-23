import type {Vec2} from "../types/environment";
import type {VoronoiCell} from "../../components/canvas/voronoi";

export type CoverageLane = { start: Vec2; end: Vec2 };

export type CoveragePlan = {
    droneId: string;
    cellId: string;
    polygon: Vec2[];
    spacingMeters: number;
    overlapRatio: number;
    lanes: CoverageLane[];
    waypoints: Vec2[];
    completenessPct: number;
};

const polygonArea = (poly: Vec2[]) => {
    if (poly.length < 3) return 0;
    let area = 0;
    for (let i = 0; i < poly.length; i++) {
        const p1 = poly[i];
        const p2 = poly[(i + 1) % poly.length];
        area += p1.x * p2.y - p2.x * p1.y;
    }
    return Math.abs(area) / 2;
};

const bbox = (poly: Vec2[]) => {
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    poly.forEach(({x, y}) => {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
    });
    return {minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY};
};

const intersectVertical = (poly: Vec2[], x: number): Vec2[] => {
    const hits: Vec2[] = [];
    for (let i = 0; i < poly.length; i++) {
        const a = poly[i];
        const b = poly[(i + 1) % poly.length];
        const minX = Math.min(a.x, b.x);
        const maxX = Math.max(a.x, b.x);
        if (x < minX || x > maxX || Math.abs(a.x - b.x) < 1e-6) continue;
        const t = (x - a.x) / (b.x - a.x);
        const y = a.y + t * (b.y - a.y);
        hits.push({x, y});
    }
    return hits;
};

const intersectHorizontal = (poly: Vec2[], y: number): Vec2[] => {
    const hits: Vec2[] = [];
    for (let i = 0; i < poly.length; i++) {
        const a = poly[i];
        const b = poly[(i + 1) % poly.length];
        const minY = Math.min(a.y, b.y);
        const maxY = Math.max(a.y, b.y);
        if (y < minY || y > maxY || Math.abs(a.y - b.y) < 1e-6) continue;
        const t = (y - a.y) / (b.y - a.y);
        const x = a.x + t * (b.x - a.x);
        hits.push({x, y});
    }
    return hits;
};

const buildLanes = (poly: Vec2[], spacing: number) => {
    const {minX, minY, maxX, maxY, width, height} = bbox(poly);
    const sweepVertical = width >= height; // choose axis to minimize turns
    const lanes: CoverageLane[] = [];
    if (sweepVertical) {
        let x = minX + spacing / 2;
        let laneIndex = 0;
        while (x <= maxX + 1e-6) {
            const hits = intersectVertical(poly, x).sort((a, b) => a.y - b.y);
            for (let i = 0; i + 1 < hits.length; i += 2) {
                const start = laneIndex % 2 === 0 ? hits[i] : hits[i + 1];
                const end = laneIndex % 2 === 0 ? hits[i + 1] : hits[i];
                lanes.push({start, end});
                laneIndex += 1;
            }
            x += spacing;
        }
    } else {
        let y = minY + spacing / 2;
        let laneIndex = 0;
        while (y <= maxY + 1e-6) {
            const hits = intersectHorizontal(poly, y).sort((a, b) => a.x - b.x);
            for (let i = 0; i + 1 < hits.length; i += 2) {
                const start = laneIndex % 2 === 0 ? hits[i] : hits[i + 1];
                const end = laneIndex % 2 === 0 ? hits[i + 1] : hits[i];
                lanes.push({start, end});
                laneIndex += 1;
            }
            y += spacing;
        }
    }
    return {lanes, sweepVertical};
};

const lanesToWaypoints = (lanes: CoverageLane[]): Vec2[] => {
    const points: Vec2[] = [];
    lanes.forEach(({start, end}, idx) => {
        points.push(start, end);
        const next = lanes[idx + 1];
        if (next) {
            points.push(end, next.start); // connector keeps path explicit for existing waypoint follower
        }
    });
    return points;
};

export const planCoveragePaths = (
    cells: VoronoiCell[],
    spacingMeters: number,
    overlapRatio: number,
): CoveragePlan[] => {
    if (spacingMeters <= 0) return [];
    return cells.map((cell) => {
        const {lanes} = buildLanes(cell.polygon, spacingMeters);
        const waypoints = lanesToWaypoints(lanes);
        const area = polygonArea(cell.polygon);
        const laneArea = lanes.reduce((sum, lane) => sum + Math.hypot(lane.end.x - lane.start.x, lane.end.y - lane.start.y) * spacingMeters, 0);
        const completeness = area > 0 ? Math.min(1, laneArea / area) : 0;
        return {
            droneId: cell.droneId,
            cellId: `${cell.droneId}-cell`,
            polygon: cell.polygon,
            spacingMeters,
            overlapRatio,
            lanes,
            waypoints,
            completenessPct: Math.round(completeness * 100),
        };
    }).filter((plan) => plan.lanes.length > 0 && plan.waypoints.length > 0);
};

