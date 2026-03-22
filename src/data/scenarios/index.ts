import calmBay from "./presets/calm-bay.json";
import roughSea from "./presets/rough-sea.json";
import simple from "./presets/simple.json";
import degradedComms from "./presets/degraded-comms.json";
import highStress from "./presets/high-stress.json";
import scalingTest from "./presets/scaling-test.json";
import type {MaritimeScenario} from "../../domain/types/environment";
import type {CommsConfig} from "../../domain/types/comms";
import {parseScenarioString, scenarioToJSON, validateScenario} from "../../domain/environment/generator";
import {logError} from "../../utils/errorLogging";

export type ScenarioCategory = "training" | "stress-test" | "demo";

export type ScenarioPreset = {
    id: string;
    label: string;
    description: string;
    category: ScenarioCategory;
    tags: string[];
    recommendedDroneCount: number;
    droneSet?: {
        entries: { modelId: string; count: number }[];
    };
    commsOverride?: Partial<CommsConfig>;
    scenario: MaritimeScenario;
};

export const scenarioPresets: ScenarioPreset[] = [
    {
        id: "simple",
        label: "Simple",
        description: "Nominal conditions, calm seas, light wind, 3 anomalies. Ideal first run.",
        category: "training",
        tags: ["beginner", "nominal"],
        recommendedDroneCount: 5,
        droneSet: {
            entries: [
                {modelId: "mavic3", count: 4},
                {modelId: "speeeeeeeeddemon", count: 1},
            ],
        },
        scenario: validateScenario(simple),
    },
    {
        id: "calm-bay",
        label: "Calm Bay",
        description: "Gentle breeze over a 10 km² bay with moderate anomaly density.",
        category: "training",
        tags: ["calm", "moderate"],
        recommendedDroneCount: 6,
        droneSet: {
            entries: [
                {modelId: "mavic3", count: 5},
                {modelId: "speeeeeeeeddemon", count: 1},
            ],
        },
        scenario: validateScenario(calmBay),
    },
    {
        id: "degraded-comms",
        label: "Degraded Comms",
        description: "8 km sector forces drones past the comms degradation threshold. Tests latency handling.",
        category: "stress-test",
        tags: ["comms", "latency", "degraded"],
        recommendedDroneCount: 5,
        droneSet: {
            entries: [
                {modelId: "mavic3t", count: 4},
                {modelId: "speeeeeeeeddemon", count: 1},
            ],
        },
        commsOverride: {
            enabled: true,
            baseLatencyMs: 20,
            maxLatencyMs: 120,
            basePacketLossPct: 0.002,
            maxPacketLossPct: 0.12,
            degradationStartMeters: 1500,
            degradationFullMeters: 4000,
        },
        scenario: validateScenario(degradedComms),
    },
    {
        id: "rough-sea",
        label: "Rough Sea",
        description: "Whitecaps and gusting 32 kt wind. Sensor detection is impaired.",
        category: "stress-test",
        tags: ["rough", "wind", "challenging"],
        recommendedDroneCount: 8,
        droneSet: {
            entries: [
                {modelId: "matrice30", count: 7},
                {modelId: "speeeeeeeeddemon", count: 1},
            ],
        },
        scenario: validateScenario(roughSea),
    },
    {
        id: "high-stress",
        label: "High Stress",
        description: "16 anomalies, severe weather, reduced visibility , expect simultaneous alerts.",
        category: "stress-test",
        tags: ["alerts", "high-workload", "10+ drones"],
        recommendedDroneCount: 12,
        droneSet: {
            entries: [
                {modelId: "matrice30", count: 8},
                {modelId: "mavic3t", count: 3},
                {modelId: "speeeeeeeeddemon", count: 1},
            ],
        },
        scenario: validateScenario(highStress),
    },
    {
        id: "scaling-test",
        label: "Scaling Test",
        description: "225 km² sector with 20 anomalies. Designed for 15–20 drone swarm validation.",
        category: "demo",
        tags: ["large-swarm", "scaling", "15-20 drones"],
        recommendedDroneCount: 18,
        droneSet: {
            entries: [
                {modelId: "speeeeeeeeddemon", count: 18},
            ],
        },
        scenario: validateScenario(scalingTest),
    },
];

export const categoryLabels: Record<ScenarioCategory, string> = {
    "training": "Training",
    "stress-test": "Stress Test",
    "demo": "Demonstration",
};

export const categoryOrder: ScenarioCategory[] = ["training", "stress-test", "demo"];

export function getPresetById(id: string): ScenarioPreset | undefined {
    return scenarioPresets.find((p) => p.id === id);
}

export async function readScenarioFile(file: File): Promise<MaritimeScenario> {
    const text = await file.text();
    return parseScenarioString(text);
}

export function downloadScenarioJSON(scenario: MaritimeScenario, filename?: string) {
    const blob = new Blob([scenarioToJSON(scenario)], {type: "application/json"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename ?? `${scenario.name.replace(/\s+/g, "-").toLowerCase()}.json`;
    a.click();
    URL.revokeObjectURL(url);
}

const CUSTOM_STORAGE_KEY = "beacon:customScenarios";

export type SavedCustomScenario = {
    id: string;
    label: string;
    savedAt: string;
    scenario: MaritimeScenario;
};

function getRawPreview(raw: string | null): string | null {
    return typeof raw === "string" ? raw.slice(0, 240) : null;
}

export function loadCustomScenarios(): SavedCustomScenario[] {
    let raw: string | null = null;
    try {
        raw = localStorage.getItem(CUSTOM_STORAGE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
        logError(err, {
            origin: "scenarios.custom.load",
            context: {
                storageKey: CUSTOM_STORAGE_KEY,
                rawPreview: getRawPreview(raw),
            },
        });
        return [];
    }
}

export function saveCustomScenario(label: string, scenario: MaritimeScenario): SavedCustomScenario {
    try {
        const existing = loadCustomScenarios();
        const entry: SavedCustomScenario = {
            id: `custom-${Date.now()}`,
            label,
            savedAt: new Date().toISOString(),
            scenario,
        };
        const next = [entry, ...existing].slice(0, 20);
        localStorage.setItem(CUSTOM_STORAGE_KEY, JSON.stringify(next));
        return entry;
    } catch (err) {
        logError(err, {
            origin: "scenarios.custom.save",
            context: {
                storageKey: CUSTOM_STORAGE_KEY,
                label,
                scenarioName: scenario.name,
            },
        });
        throw err;
    }
}

export function deleteCustomScenario(id: string): void {
    try {
        const existing = loadCustomScenarios();
        localStorage.setItem(CUSTOM_STORAGE_KEY, JSON.stringify(existing.filter((s) => s.id !== id)));
    } catch (err) {
        logError(err, {
            origin: "scenarios.custom.delete",
            context: {
                storageKey: CUSTOM_STORAGE_KEY,
                id,
            },
        });
        throw err;
    }
}
