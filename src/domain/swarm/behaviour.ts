import type {DroneState} from "../types/drone";
import type {SectorBounds, Vec2} from "../types/environment";

export type SwarmBehaviourParams = {
    safetyDistanceMeters: number;
    neighborRadiusMeters: number;
    separationWeight: number;
    cohesionWeight: number;
    alignmentWeight: number;
    maxSteeringAngleDegPerSec: number;
};

export type SwarmAdjustment = {
    headingDeltaDeg: number;
};

export type SwarmAdjustmentMap = Record<string, SwarmAdjustment | undefined>;

type SpatialKey = string;

const toRad = (deg: number) => (deg * Math.PI) / 180;
const toDeg = (rad: number) => (rad * 180) / Math.PI;

const vecAdd = (a: Vec2, b: Vec2): Vec2 => ({x: a.x + b.x, y: a.y + b.y});
const vecSub = (a: Vec2, b: Vec2): Vec2 => ({x: a.x - b.x, y: a.y - b.y});
const vecScale = (v: Vec2, s: number): Vec2 => ({x: v.x * s, y: v.y * s});
const vecLength = (v: Vec2): number => Math.hypot(v.x, v.y);
const vecNormalize = (v: Vec2): Vec2 => {
    const len = vecLength(v);
    if (len <= 1e-6) return {x: 0, y: 0};
    return {x: v.x / len, y: v.y / len};
};

const dirFromHeadingDeg = (headingDeg: number): Vec2 => {
    const rad = toRad(headingDeg);
    return {x: Math.cos(rad), y: Math.sin(rad)};
};

const angleFromDir = (v: Vec2): number => {
    if (!Number.isFinite(v.x) || !Number.isFinite(v.y)) return 0;
    return toDeg(Math.atan2(v.y, v.x));
};

const normalizeAngleDeg = (angle: number): number => {
    let a = angle;
    while (a > 180) a -= 360;
    while (a <= -180) a += 360;
    return a;
};

const clampAngleDelta = (delta: number, maxDelta: number): number => {
    const d = normalizeAngleDeg(delta);
    if (d > maxDelta) return maxDelta;
    if (d < -maxDelta) return -maxDelta;
    return d;
};

const spatialKey = (cx: number, cy: number): SpatialKey => `${cx},${cy}`;

const buildSpatialIndex = (drones: ReadonlyArray<DroneState>, cellSize: number, bounds: SectorBounds) => {
    const index = new Map<SpatialKey, DroneState[]>();
    const origin = bounds.origin;
    drones.forEach((d) => {
        const cx = Math.floor((d.position.x - origin.x) / cellSize);
        const cy = Math.floor((d.position.y - origin.y) / cellSize);
        const key = spatialKey(cx, cy);
        const bucket = index.get(key);
        if (bucket) bucket.push(d); else index.set(key, [d]);
    });
    return index;
};

const pseudoRandomAngleFromId = (id: string): number => {
    let hash = 0;
    for (let i = 0; i < id.length; i += 1) {
        hash = (hash * 31 + id.charCodeAt(i)) | 0;
    }
    const normalized = (hash >>> 0) / 0xffffffff;
    return (normalized * 360) - 180;
};

export function computeSwarmAdjustments(
    drones: ReadonlyArray<DroneState>,
    params: SwarmBehaviourParams,
    bounds: SectorBounds,
    dtSeconds: number,
): SwarmAdjustmentMap {
    const {
        safetyDistanceMeters,
        neighborRadiusMeters,
        separationWeight,
        cohesionWeight,
        alignmentWeight,
        maxSteeringAngleDegPerSec,
    } = params;

    const result: SwarmAdjustmentMap = {};
    if (drones.length === 0 || neighborRadiusMeters <= 0 || dtSeconds <= 0) return result;

    const cellSize = Math.max(1, neighborRadiusMeters);
    const index = buildSpatialIndex(drones, cellSize, bounds);
    const origin = bounds.origin;
    const maxDeltaThisFrame = maxSteeringAngleDegPerSec * dtSeconds;

    for (const self of drones) {
        if (self.avoidanceOverride) {
            result[self.id] = undefined;
            continue;
        }
        if (self.swarmEnabled === false) {
            result[self.id] = undefined;
            continue;
        }

        const cx = Math.floor((self.position.x - origin.x) / cellSize);
        const cy = Math.floor((self.position.y - origin.y) / cellSize);

        let separationAcc: Vec2 = {x: 0, y: 0};
        let cohesionPosSum: Vec2 = {x: 0, y: 0};
        let cohesionCount = 0;
        let alignmentDirSum: Vec2 = {x: 0, y: 0};
        let alignmentCount = 0;

        for (let ox = -1; ox <= 1; ox += 1) {
            for (let oy = -1; oy <= 1; oy += 1) {
                const key = spatialKey(cx + ox, cy + oy);
                const bucket = index.get(key);
                if (!bucket) continue;
                for (const other of bucket) {
                    if (other.id === self.id) continue;
                    const offset = vecSub(self.position, other.position);
                    const dist = vecLength(offset);
                    if (dist <= 1e-3) {
                        const ang = pseudoRandomAngleFromId(self.id);
                        const dir: Vec2 = {x: Math.cos(toRad(ang)), y: Math.sin(toRad(ang))};
                        separationAcc = vecAdd(separationAcc, dir);
                        continue;
                    }
                    if (dist > neighborRadiusMeters) continue;

                    if (dist < safetyDistanceMeters) {
                        const away = vecScale(vecNormalize(offset), (safetyDistanceMeters - dist) / safetyDistanceMeters);
                        separationAcc = vecAdd(separationAcc, away);
                    }

                    const cohesionMinDist = safetyDistanceMeters * 1.2;
                    if (dist > cohesionMinDist) {
                        cohesionPosSum = vecAdd(cohesionPosSum, other.position);
                        cohesionCount += 1;
                    }

                    const otherDir = dirFromHeadingDeg(other.headingDeg);
                    alignmentDirSum = vecAdd(alignmentDirSum, otherDir);
                    alignmentCount += 1;
                }
            }
        }

        const separationDir = vecLength(separationAcc) > 0 ? vecNormalize(separationAcc) : {x: 0, y: 0};
        const cohesionDir = cohesionCount > 0
            ? vecNormalize(vecSub(vecScale(cohesionPosSum, 1 / cohesionCount), self.position))
            : {x: 0, y: 0};
        const alignmentDir = alignmentCount > 0 ? vecNormalize(alignmentDirSum) : {x: 0, y: 0};

        const combined: Vec2 = {
            x: separationDir.x * separationWeight + cohesionDir.x * cohesionWeight + alignmentDir.x * alignmentWeight,
            y: separationDir.y * separationWeight + cohesionDir.y * cohesionWeight + alignmentDir.y * alignmentWeight,
        };

        if (!Number.isFinite(combined.x) || !Number.isFinite(combined.y)) {
            result[self.id] = undefined;
            continue;
        }

        if (Math.abs(combined.x) < 1e-4 && Math.abs(combined.y) < 1e-4) {
            result[self.id] = undefined;
            continue;
        }

        const desiredHeading = angleFromDir(combined);
        const baseHeading = self.headingDeg;
        const delta = normalizeAngleDeg(desiredHeading - baseHeading);
        const limitedDelta = clampAngleDelta(delta, maxDeltaThisFrame);

        if (Math.abs(limitedDelta) < 0.01) {
            result[self.id] = undefined;
        } else {
            result[self.id] = {headingDeltaDeg: limitedDelta};
        }
    }

    return result;
}
