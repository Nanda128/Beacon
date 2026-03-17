import type {EnvironmentalConditions, Vec2} from "../types/environment";

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const normalizeDegrees = (deg: number) => {
    const normalized = deg % 360;
    return normalized < 0 ? normalized + 360 : normalized;
};

const toRadians = (deg: number) => (deg * Math.PI) / 180;

const roughnessFromConditions = (conditions: EnvironmentalConditions) => {
    const seaStateFactor = clamp((conditions.seaState ?? 0) / 9, 0, 1);
    const windFactor = clamp((conditions.windKts ?? 0) / 40, 0, 1);
    return clamp(seaStateFactor * 0.65 + windFactor * 0.35, 0, 1);
};

const visibilityFactor = (visibilityKm: number) => clamp((visibilityKm - 4) / 26, 0, 1);

export const computeWindAdjustedSpeedKts = (
    baseSpeedKts: number,
    headingDeg: number,
    conditions: EnvironmentalConditions,
) => {
    const base = Math.max(0, baseSpeedKts);
    const windKts = Math.max(0, conditions.windKts ?? 0);
    if (base <= 0 || windKts <= 0 || !Number.isFinite(conditions.windDirectionDeg)) {
        return {effectiveSpeedKts: base, windAlignment: 0};
    }

    const headingRad = toRadians(normalizeDegrees(headingDeg));
    const windRad = toRadians(normalizeDegrees(conditions.windDirectionDeg ?? 0));
    const windAlignment = Math.cos(headingRad - windRad);

    const windDeltaKts = windKts * 0.18 * windAlignment;
    const minGroundSpeed = Math.max(1.5, base * 0.35);
    const maxGroundSpeed = Math.max(minGroundSpeed, base * 1.35);
    const effectiveSpeedKts = clamp(base + windDeltaKts, minGroundSpeed, maxGroundSpeed);

    return {effectiveSpeedKts, windAlignment};
};

export const computeEnvironmentalSensorMultiplier = (conditions: EnvironmentalConditions) => {
    const visibility = visibilityFactor(conditions.visibilityKm ?? 0);
    const roughness = roughnessFromConditions(conditions);
    const tempStress = clamp(Math.abs((conditions.surfaceTempC ?? 20) - 20) / 18, 0, 1);

    const visibilityMultiplier = clamp(0.55 + visibility * 0.45, 0.55, 1);
    const roughnessMultiplier = clamp(1 - roughness * 0.18, 0.82, 1);
    const temperatureMultiplier = clamp(1 - tempStress * 0.12, 0.88, 1);

    return clamp(visibilityMultiplier * roughnessMultiplier * temperatureMultiplier, 0.45, 1);
};

export const computeEnvironmentalBatteryDrainMultiplier = (conditions: EnvironmentalConditions) => {
    const roughness = roughnessFromConditions(conditions);
    const tempStress = clamp(Math.abs((conditions.surfaceTempC ?? 20) - 20) / 15, 0, 1);
    return 1 + roughness * 0.22 + tempStress * 0.12;
};

export const computeEnvironmentalFalsePositiveMultiplier = (conditions: EnvironmentalConditions) => {
    const visibility = visibilityFactor(conditions.visibilityKm ?? 0);
    const roughness = roughnessFromConditions(conditions);
    return 1 + (1 - visibility) * 0.45 + roughness * 0.25;
};

export const computeReturnMinutesWithEnvironment = (
    position: Vec2,
    homePosition: Vec2,
    baseSpeedKts: number,
    conditions: EnvironmentalConditions,
) => {
    const dx = homePosition.x - position.x;
    const dy = homePosition.y - position.y;
    const distanceMeters = Math.hypot(dx, dy);
    if (distanceMeters <= 0.001) return 0;

    const headingDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
    const {effectiveSpeedKts} = computeWindAdjustedSpeedKts(baseSpeedKts, headingDeg, conditions);
    const speedMs = Math.max(0, effectiveSpeedKts) * 0.514444;
    if (speedMs <= 0.0001) return Number.POSITIVE_INFINITY;

    return distanceMeters / speedMs / 60;
};

