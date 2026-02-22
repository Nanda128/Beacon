export type Vec2 = { x: number; y: number };

export type EnvironmentalConditions = {
    seaState: number;
    windKts: number;
    visibilityKm: number;
    surfaceTempC: number;
    description?: string;
};

export type SectorBounds = {
    origin: Vec2;
    widthMeters: number;
    heightMeters: number;
};

export type WaterSettings = {
    tileSize: number;
    noiseScale: number;
    detailScale: number;
    baseColor: [number, number, number];
    highlightColor: [number, number, number];
    textureStrength: number;
};

export type MaritimeSector = {
    id: string;
    name: string;
    seed: string;
    bounds: SectorBounds;
    conditions: EnvironmentalConditions;
    water: WaterSettings;
    createdAt: string;
};

export type ScenarioMetadata = {
    createdAt: string;
    labels?: string[];
    notes?: string;
};

export type AnomalyType = "person-in-water" | "lifeboat" | "debris-field" | "false-positive";

export type AnomalyConfig = {
    count: number;
    detectionRadiusMeters: number;
};

export type AnomalySettings = Record<AnomalyType, AnomalyConfig>;

export type AnomalyInstance = {
    id: string;
    type: AnomalyType;
    position: Vec2;
    detected: boolean;
    detectionRadiusMeters: number;
    note?: string;
};

export type AnomalySet = {
    config: AnomalySettings;
    items: AnomalyInstance[];
};

export type MaritimeScenario = {
    version: 1;
    name: string;
    seed: string;
    sector: MaritimeSector;
    anomalies: AnomalySet;
    metadata?: ScenarioMetadata;
};

