import {useCallback, useMemo, useState} from "react";
import {
    cloneAnomalyConfig,
    defaultAnomalyConfig,
    generateSector,
} from "../domain/environment/generator";
import {downloadScenarioJSON, getPresetById, readScenarioFile} from "../data/scenarios";
import type {AnomalySettings, MaritimeScenario} from "../domain/types/environment";
import {
    defaultAnomalyConfigOverride,
    defaultBoundsKm,
    defaultSeed,
    randomSeed
} from "../config/constants";

const initialScenario = generateSector({
    seed: defaultSeed,
    boundsKm: defaultBoundsKm,
    anomalyConfig: {...defaultAnomalyConfig, ...defaultAnomalyConfigOverride},
});

type UseScenarioOptions = {
    onScenarioReset?: () => void;
};

export function useScenario({onScenarioReset}: UseScenarioOptions = {}) {
    const [seed, setSeed] = useState(initialScenario.seed);
    const [widthKm, setWidthKm] = useState(defaultBoundsKm.width);
    const [heightKm, setHeightKm] = useState(defaultBoundsKm.height);
    const [scenario, setScenario] = useState<MaritimeScenario>(initialScenario);
    const [anomalyConfig, setAnomalyConfig] = useState<AnomalySettings>(() => cloneAnomalyConfig(initialScenario.anomalies.config));
    const [selectedPreset, setSelectedPreset] = useState("calm-bay");
    const [message, setMessage] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const applyScenario = useCallback((next: MaritimeScenario, msg: string) => {
        setScenario(next);
        setSeed(next.seed);
        setWidthKm(Number((next.sector.bounds.widthMeters / 1000).toFixed(2)));
        setHeightKm(Number((next.sector.bounds.heightMeters / 1000).toFixed(2)));
        setAnomalyConfig(cloneAnomalyConfig(next.anomalies.config));
        onScenarioReset?.();
        setMessage(msg);
        setError(null);
    }, [onScenarioReset]);

    const regenerate = useCallback((nextSeed: string, boundsKm: {
        width: number;
        height: number
    }, nextConfig?: AnomalySettings) => {
        const effectiveConfig = nextConfig ?? anomalyConfig;
        const next = generateSector({seed: nextSeed, boundsKm, anomalyConfig: effectiveConfig});
        applyScenario(next, `Generated sector ${boundsKm.width.toFixed(1)} km x ${boundsKm.height.toFixed(1)} km with seed ${nextSeed}`);
    }, [anomalyConfig, applyScenario]);

    const handleGenerate = useCallback(() => {
        regenerate(seed, {width: Number(widthKm), height: Number(heightKm)});
    }, [regenerate, seed, widthKm, heightKm]);

    const handleRandomSeed = useCallback(() => {
        regenerate(randomSeed(), {width: Number(widthKm), height: Number(heightKm)});
    }, [regenerate, widthKm, heightKm]);

    const applyPreset = useCallback((id: string) => {
        const preset = getPresetById(id);
        if (!preset) return;
        setSelectedPreset(id);
        applyScenario(preset, `Loaded preset: ${preset.name}`);
    }, [applyScenario]);

    const loadScenarioFile = useCallback(async (file: File) => {
        try {
            const loaded = await readScenarioFile(file);
            applyScenario(loaded, `Loaded scenario from ${file.name}`);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to load scenario");
        }
    }, [applyScenario]);

    const handleAnomalyConfigChange = useCallback((type: keyof AnomalySettings, key: "count" | "detectionRadiusMeters", value: number) => {
        setAnomalyConfig((prev) => ({
            ...prev,
            [type]: {
                ...prev[type],
                [key]: value,
            },
        }));
    }, []);

    const handleToggleAnomaly = useCallback((id: string) => {
        setScenario((prev) => ({
            ...prev,
            anomalies: {
                ...prev.anomalies,
                items: prev.anomalies.items.map((item) => item.id === id ? {...item, detected: !item.detected} : item),
            },
        }));
    }, []);

    const updateAnomalies = useCallback((updater: (items: MaritimeScenario["anomalies"]["items"]) => MaritimeScenario["anomalies"]["items"]) => {
        setScenario((prev) => ({
            ...prev,
            anomalies: {
                ...prev.anomalies,
                items: updater(prev.anomalies.items),
            },
        }));
    }, []);

    const sectorMeta = useMemo(() => scenario.sector, [scenario]);

    return {
        seed,
        widthKm,
        heightKm,
        scenario,
        anomalyConfig,
        selectedPreset,
        message,
        error,
        setSeed,
        setWidthKm,
        setHeightKm,
        setSelectedPreset,
        setMessage,
        setError,
        sectorMeta,
        regenerate,
        handleGenerate,
        handleRandomSeed,
        applyPreset,
        loadScenarioFile,
        handleAnomalyConfigChange,
        handleToggleAnomaly,
        applyScenario,
        downloadScenarioJSON,
        updateAnomalies,
    };
}
