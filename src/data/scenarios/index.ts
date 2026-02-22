import calmBay from "./presets/calm-bay.json";
import roughSea from "./presets/rough-sea.json";
import type {MaritimeScenario} from "../../domain/types/environment";
import {parseScenarioString, scenarioToJSON, validateScenario} from "../../domain/environment/generator";

export const scenarioPresets: { id: string; label: string; scenario: MaritimeScenario }[] = [
    {id: "calm-bay", label: "Calm Bay", scenario: validateScenario(calmBay)},
    {id: "rough-sea", label: "Rough Sea", scenario: validateScenario(roughSea)},
];

export function getPresetById(id: string): MaritimeScenario | undefined {
    return scenarioPresets.find((p) => p.id === id)?.scenario;
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

