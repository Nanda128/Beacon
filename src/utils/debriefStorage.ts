import type {CombinedDebriefExport} from "./metricsExport";
import {createCombinedDebriefExport} from "./metricsExport";
import type {MissionMetricsSession} from "../domain/types/metrics";
import type {NasaTlxAssessment} from "../domain/types/tlx";

export interface StoredDebrief {
    id: string;
    timestamp: number;
    label: string;
    scenarioName: string;
    debrief: CombinedDebriefExport;
}

const STORAGE_KEY = "beacon_mission_debriefs";

export function loadAllDebriefs(): StoredDebrief[] {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (!stored) return [];
        return JSON.parse(stored);
    } catch (e) {
        console.error("Failed to load debriefs from localStorage:", e);
        return [];
    }
}

export function saveDebrief(
    metrics: MissionMetricsSession,
    nasaTlx: NasaTlxAssessment | undefined,
    label?: string
): StoredDebrief {
    const debrief = createCombinedDebriefExport(metrics, nasaTlx);
    const stored: StoredDebrief = {
        id: `debrief_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        timestamp: Date.now(),
        label: label || `${metrics.scenarioName} - ${new Date().toLocaleString()}`,
        scenarioName: metrics.scenarioName,
        debrief,
    };

    const all = loadAllDebriefs();
    all.unshift(stored);
    const limited = all.slice(0, 100);

    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(limited));
    } catch (e) {
        console.error("Failed to save debrief to localStorage:", e);
    }

    return stored;
}

export function deleteDebrief(id: string): void {
    const all = loadAllDebriefs();
    const filtered = all.filter((d) => d.id !== id);
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
    } catch (e) {
        console.error("Failed to delete debrief from localStorage:", e);
    }
}

export function importDebriefJSON(jsonString: string): StoredDebrief | null {
    try {
        const parsed = JSON.parse(jsonString) as CombinedDebriefExport;
        if (!parsed.mission?.session?.scenarioName) {
            console.error("Failed to import debrief JSON: invalid format (missing mission.session.scenarioName)");
            return null;
        }

        const stored: StoredDebrief = {
            id: `debrief_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            timestamp: Date.now(),
            label: `Imported - ${parsed.mission.session.scenarioName} - ${new Date().toLocaleString()}`,
            scenarioName: parsed.mission.session.scenarioName,
            debrief: parsed,
        };

        const all = loadAllDebriefs();
        all.unshift(stored);
        const limited = all.slice(0, 100);

        localStorage.setItem(STORAGE_KEY, JSON.stringify(limited));
        return stored;
    } catch (e) {
        console.error("Failed to import debrief JSON:", e);
        return null;
    }
}

export function clearAllDebriefs(): void {
    try {
        localStorage.removeItem(STORAGE_KEY);
    } catch (e) {
        console.error("Failed to clear debriefs from localStorage:", e);
    }
}

