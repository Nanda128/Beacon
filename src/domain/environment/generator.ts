import seedrandom from "seedrandom";
import {createNoise2D} from "simplex-noise";
import type {
    EnvironmentalConditions,
    MaritimeScenario,
    MaritimeSector,
    SectorBounds,
    Vec2,
    WaterSettings,
    AnomalySettings,
    AnomalyType,
    AnomalyInstance,
    AnomalySet,
} from "../types/environment";
import {droneHubExclusionRadiusMeters} from "../../config/constants";

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

const pick = <T>(arr: T[], rng: () => number) => arr[Math.floor(rng() * arr.length)];

const centerOfBounds = (bounds: SectorBounds): Vec2 => ({
    x: bounds.origin.x + bounds.widthMeters / 2,
    y: bounds.origin.y + bounds.heightMeters / 2,
});

const hubRadiusForBounds = (bounds: SectorBounds) => {
    const maxRadius = Math.min(bounds.widthMeters, bounds.heightMeters) / 2;
    const safeMargin = Math.max(maxRadius - 10, 0);
    return Math.max(0, Math.min(droneHubExclusionRadiusMeters, safeMargin));
};

export const droneHubFromBounds = (bounds: SectorBounds) => ({
    position: centerOfBounds(bounds),
    radius: hubRadiusForBounds(bounds),
});

const isInsideHubSafeZone = (point: Vec2, hub: { position: Vec2; radius: number }) =>
    hub.radius > 0 && Math.hypot(point.x - hub.position.x, point.y - hub.position.y) <= hub.radius;

const createAnomalyPositionSampler = (sector: MaritimeSector, hub: { position: Vec2; radius: number }, rng: () => number) => {
    const {bounds} = sector;
    return () => {
        for (let attempt = 0; attempt < 32; attempt++) {
            const x = bounds.origin.x + rng() * bounds.widthMeters;
            const y = bounds.origin.y + rng() * bounds.heightMeters;
            const candidate = {x, y};
            if (!isInsideHubSafeZone(candidate, hub)) return candidate;
        }
        const angle = rng() * Math.PI * 2;
        const radius = hub.radius > 0 ? hub.radius + 5 : 0;
        const candidate = {
            x: hub.position.x + Math.cos(angle) * radius,
            y: hub.position.y + Math.sin(angle) * radius,
        };
        return {
            x: clamp(candidate.x, bounds.origin.x, bounds.origin.x + bounds.widthMeters),
            y: clamp(candidate.y, bounds.origin.y, bounds.origin.y + bounds.heightMeters),
        } as Vec2;
    };
};

export type GeneratorParams = {
    seed: string;
    boundsKm: { width: number; height: number };
    origin?: Vec2;
    name?: string;
    notes?: string;
    anomalyConfig?: Partial<AnomalySettings>;
};

export type WaterTileData = {
    width: number;
    height: number;
    pixels: Uint8ClampedArray;
};

export const defaultWaterSettings: WaterSettings = {
    tileSize: 256,
    noiseScale: 0.015,
    detailScale: 0.07,
    baseColor: [16, 60, 96],
    highlightColor: [38, 114, 176],
    textureStrength: 0.65,
};

export const anomalyTypeLabels: Record<AnomalyType, string> = {
    "person-in-water": "Person in Water",
    "lifeboat": "Lifeboat",
    "debris-field": "Debris Field",
    "false-positive": "False Positive",
};

export const anomalyTypeOrder: AnomalyType[] = [
    "person-in-water",
    "lifeboat",
    "debris-field",
    "false-positive",
];

export const defaultAnomalyConfig: AnomalySettings = {
    "person-in-water": {count: 3, detectionRadiusMeters: 250},
    "lifeboat": {count: 1, detectionRadiusMeters: 400},
    "debris-field": {count: 2, detectionRadiusMeters: 300},
    "false-positive": {count: 1, detectionRadiusMeters: 180},
};

const normalizeAnomalyConfig = (config?: Partial<AnomalySettings>): AnomalySettings => {
    return anomalyTypeOrder.reduce((acc, type) => {
        const incoming = config?.[type];
        const count = Math.max(0, Math.round(incoming?.count ?? defaultAnomalyConfig[type].count));
        const detectionRadiusMeters = Math.max(10, Math.round(incoming?.detectionRadiusMeters ?? defaultAnomalyConfig[type].detectionRadiusMeters));
        acc[type] = {count, detectionRadiusMeters};
        return acc;
    }, {} as AnomalySettings);
};

export const cloneAnomalyConfig = (config: AnomalySettings): AnomalySettings => JSON.parse(JSON.stringify(config));

const totalAnomalyCount = (config: AnomalySettings) =>
    anomalyTypeOrder.reduce((sum, type) => sum + (config[type]?.count ?? 0), 0);

const generateAnomalies = (sector: MaritimeSector, seed: string, config: AnomalySettings): AnomalyInstance[] => {
    const rng = seedrandom(`${seed}-anomalies`);
    const hub = droneHubFromBounds(sector.bounds);
    const samplePosition = createAnomalyPositionSampler(sector, hub, rng);
    const items: AnomalyInstance[] = [];
    anomalyTypeOrder.forEach((type) => {
        const typeConfig = config[type];
        for (let i = 0; i < typeConfig.count; i++) {
            const position = samplePosition();
            items.push({
                id: `${type}-${i + 1}`,
                type,
                position,
                detected: false,
                detectionRadiusMeters: typeConfig.detectionRadiusMeters,
            });
        }
    });
    return items;
};

const sanitizeAnomalyItems = (
    payloadItems: any,
    sector: MaritimeSector,
    seed: string,
    config: AnomalySettings,
): AnomalyInstance[] => {
    const hub = droneHubFromBounds(sector.bounds);
    const rng = seedrandom(`${seed}-anomalies-sanitize`);
    const samplePosition = createAnomalyPositionSampler(sector, hub, rng);
    const items: AnomalyInstance[] = Array.isArray(payloadItems)
        ? payloadItems
            .map((item, idx) => {
                const type: AnomalyType | undefined = anomalyTypeOrder.find((t) => t === item?.type) ?? undefined;
                if (!type) return null;
                const x = Number(item?.position?.x);
                const y = Number(item?.position?.y);
                if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
                const detectionRadiusMeters = Math.max(10, Number(item?.detectionRadiusMeters ?? config[type].detectionRadiusMeters));
                const candidate = {
                    x: clamp(x, sector.bounds.origin.x, sector.bounds.origin.x + sector.bounds.widthMeters),
                    y: clamp(y, sector.bounds.origin.y, sector.bounds.origin.y + sector.bounds.heightMeters),
                } as Vec2;
                const position = isInsideHubSafeZone(candidate, hub) ? samplePosition() : candidate;
                return {
                    id: String(item?.id ?? `${type}-${idx + 1}`),
                    type,
                    position,
                    detected: Boolean(item?.detected ?? false),
                    detectionRadiusMeters,
                    note: item?.note,
                } as AnomalyInstance;
            })
            .filter(Boolean) as AnomalyInstance[]
        : [];
    const expected = totalAnomalyCount(config);
    if (items.length !== expected) {
        return generateAnomalies(sector, seed, config);
    }
    return items.map((item) => ({
        ...item,
        detectionRadiusMeters: item.detectionRadiusMeters || config[item.type].detectionRadiusMeters,
    }));
};

export function generateSector(params: GeneratorParams): MaritimeScenario {
    const {seed, boundsKm, origin, name, notes, anomalyConfig} = params;
    const rng = seedrandom(seed);
    const widthMeters = Math.max(100, boundsKm.width * 1000);
    const heightMeters = Math.max(100, boundsKm.height * 1000);
    const originPoint: Vec2 = origin ?? {x: -widthMeters / 2, y: -heightMeters / 2};

    const seaStateNoise = rng();
    const windNoise = rng();
    const visibilityNoise = rng();

    const conditions: EnvironmentalConditions = {
        seaState: Math.round(clamp(lerp(1, 6, seaStateNoise), 0, 9)),
        windKts: Math.round(lerp(3, 38, windNoise)),
        visibilityKm: Math.round(lerp(4, 30, visibilityNoise)),
        surfaceTempC: Math.round(lerp(12, 28, rng())),
        description: pick([
            "Calm swell with light breeze",
            "Gentle chop; steady breeze",
            "Moderate seas with scattered whitecaps",
            "Rising swell and gusty wind",
            "Low visibility haze over the water",
            "Dense fog pockets and cool air",
        ], rng),
    };

    const water: WaterSettings = {
        ...defaultWaterSettings,
        textureStrength: clamp(0.55 + rng() * 0.3, 0.4, 0.85),
        noiseScale: clamp(0.01 + rng() * 0.01, 0.008, 0.022),
        detailScale: clamp(0.05 + rng() * 0.03, 0.045, 0.09),
        baseColor: defaultWaterSettings.baseColor,
        highlightColor: defaultWaterSettings.highlightColor,
    };

    const bounds: SectorBounds = {
        origin: originPoint,
        widthMeters,
        heightMeters,
    };

    const sector: MaritimeSector = {
        id: `${seed}-${Math.round(widthMeters)}x${Math.round(heightMeters)}`,
        name: name ?? `Sector ${boundsKm.width.toFixed(1)}km x ${boundsKm.height.toFixed(1)}km`,
        seed,
        bounds,
        conditions,
        water,
        createdAt: new Date().toISOString(),
    };

    const normalizedAnomalies = normalizeAnomalyConfig(anomalyConfig);
    const anomalies: AnomalySet = {
        config: normalizedAnomalies,
        items: generateAnomalies(sector, seed, normalizedAnomalies),
    };

    return {
        version: 1,
        name: sector.name,
        seed,
        sector,
        anomalies,
        metadata: {
            createdAt: sector.createdAt,
            notes,
            labels: ["generated"],
        },
    };
}

export function generateWaterTileData(settings: WaterSettings, seed: string): WaterTileData {
    const width = settings.tileSize;
    const height = settings.tileSize;
    const pixels = new Uint8ClampedArray(width * height * 4);
    const baseRng = seedrandom(`${seed}-water`);
    const noise = createNoise2D(baseRng);

    const tileableNoise = (x: number, y: number, scale: number) => {
        const u = x / width;
        const v = y / height;
        const n00 = noise(x * scale, y * scale);
        const n10 = noise((x - width) * scale, y * scale);
        const n01 = noise(x * scale, (y - height) * scale);
        const n11 = noise((x - width) * scale, (y - height) * scale);
        return lerp(lerp(n00, n10, u), lerp(n01, n11, u), v);
    };

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const primary = tileableNoise(x, y, settings.noiseScale);
            const detail = tileableNoise(x, y, settings.noiseScale * 2.3) * settings.detailScale;
            const value = clamp(0.5 + primary * 0.4 + detail, 0, 1);
            const t = Math.pow(value, 1.2) * settings.textureStrength + (1 - settings.textureStrength) * 0.45;
            const r = Math.round(lerp(settings.baseColor[0], settings.highlightColor[0], t));
            const g = Math.round(lerp(settings.baseColor[1], settings.highlightColor[1], t));
            const b = Math.round(lerp(settings.baseColor[2], settings.highlightColor[2], t));
            const idx = (y * width + x) * 4;
            pixels[idx] = r;
            pixels[idx + 1] = g;
            pixels[idx + 2] = b;
            pixels[idx + 3] = 255;
        }
    }

    return {width, height, pixels};
}

export function scenarioToJSON(scenario: MaritimeScenario): string {
    return JSON.stringify(scenario, null, 2);
}

export function parseScenarioString(payload: string): MaritimeScenario {
    const parsed = JSON.parse(payload);
    return validateScenario(parsed);
}

export function validateScenario(payload: any): MaritimeScenario {
    if (!payload || payload.version !== 1) {
        throw new Error("Unsupported or missing scenario version");
    }
    if (!payload.seed || !payload.sector) {
        throw new Error("Scenario missing seed or sector definition");
    }
    const sector = payload.sector;
    if (!sector.bounds || typeof sector.bounds.widthMeters !== "number" || typeof sector.bounds.heightMeters !== "number") {
        throw new Error("Sector bounds are invalid");
    }
    if (!sector.conditions) {
        throw new Error("Sector conditions are missing");
    }
    const water = sector.water ?? defaultWaterSettings;
    const baseColor = Array.isArray(water.baseColor) && water.baseColor.length >= 3 ? [
        Number(water.baseColor[0]),
        Number(water.baseColor[1]),
        Number(water.baseColor[2]),
    ] as [number, number, number] : defaultWaterSettings.baseColor;
    const highlightColor = Array.isArray(water.highlightColor) && water.highlightColor.length >= 3 ? [
        Number(water.highlightColor[0]),
        Number(water.highlightColor[1]),
        Number(water.highlightColor[2]),
    ] as [number, number, number] : defaultWaterSettings.highlightColor;

    const safeSector: MaritimeSector = {
        id: sector.id ?? `${payload.seed}-${Math.round(sector.bounds.widthMeters)}x${Math.round(sector.bounds.heightMeters)}`,
        name: sector.name ?? payload.name ?? "Unnamed Sector",
        seed: payload.seed,
        bounds: {
            origin: sector.bounds.origin ?? {x: -sector.bounds.widthMeters / 2, y: -sector.bounds.heightMeters / 2},
            widthMeters: sector.bounds.widthMeters,
            heightMeters: sector.bounds.heightMeters,
        },
        conditions: {
            seaState: Number(sector.conditions.seaState ?? 0),
            windKts: Number(sector.conditions.windKts ?? 0),
            visibilityKm: Number(sector.conditions.visibilityKm ?? 0),
            surfaceTempC: Number(sector.conditions.surfaceTempC ?? 0),
            description: sector.conditions.description,
        },
        water: {
            tileSize: water.tileSize ?? defaultWaterSettings.tileSize,
            noiseScale: water.noiseScale ?? defaultWaterSettings.noiseScale,
            detailScale: water.detailScale ?? defaultWaterSettings.detailScale,
            baseColor,
            highlightColor,
            textureStrength: water.textureStrength ?? defaultWaterSettings.textureStrength,
        },
        createdAt: sector.createdAt ?? new Date().toISOString(),
    };

    const normalizedAnomalies = normalizeAnomalyConfig(payload.anomalies?.config);
    const anomalies: AnomalySet = {
        config: normalizedAnomalies,
        items: sanitizeAnomalyItems(payload.anomalies?.items, safeSector, payload.seed, normalizedAnomalies),
    };

    return {
        version: 1,
        name: payload.name ?? safeSector.name,
        seed: payload.seed,
        sector: safeSector,
        anomalies,
        metadata: payload.metadata,
    };
}

