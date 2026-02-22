import seedrandom from "seedrandom";
import {createNoise2D} from "simplex-noise";
import type {
    EnvironmentalConditions,
    MaritimeScenario,
    MaritimeSector,
    SectorBounds,
    Vec2,
    WaterSettings
} from "../types/environment";

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

const pick = <T>(arr: T[], rng: () => number) => arr[Math.floor(rng() * arr.length)];

export type GeneratorParams = {
    seed: string;
    boundsKm: { width: number; height: number };
    origin?: Vec2;
    name?: string;
    notes?: string;
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

export function generateSector(params: GeneratorParams): MaritimeScenario {
    const {seed, boundsKm, origin, name, notes} = params;
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

    return {
        version: 1,
        name: sector.name,
        seed,
        sector,
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

    return {
        version: 1,
        name: payload.name ?? safeSector.name,
        seed: payload.seed,
        sector: safeSector,
        metadata: payload.metadata,
    };
}
