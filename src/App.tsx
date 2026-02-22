import React, {useCallback, useMemo, useState} from "react";
import MaritimeCanvas2D from "./components/MaritimeCanvas2D";
import {generateSector} from "./lib/environmentGenerator";
import {downloadScenarioJSON, getPresetById, readScenarioFile, scenarioPresets} from "./scenarios";
import type {MaritimeScenario} from "./types/environment";
import "./index.css";

const defaultSeed = "BEACON-SEA-001";
const defaultBounds = {width: 10, height: 10};

const randomSeed = () => {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const token = Array.from({length: 5}, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
    return `SEA-${token}`;
};

export default function App() {
    const [seed, setSeed] = useState(defaultSeed);
    const [widthKm, setWidthKm] = useState(defaultBounds.width);
    const [heightKm, setHeightKm] = useState(defaultBounds.height);
    const [scenario, setScenario] = useState<MaritimeScenario>(() => generateSector({
        seed: defaultSeed,
        boundsKm: defaultBounds
    }));
    const [selectedPreset, setSelectedPreset] = useState("calm-bay");
    const [message, setMessage] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const regenerate = useCallback((nextSeed: string, nextBounds: { width: number; height: number }) => {
        const fresh = generateSector({seed: nextSeed, boundsKm: nextBounds});
        setScenario(fresh);
        setMessage(`Generated sector ${nextBounds.width.toFixed(1)} km x ${nextBounds.height.toFixed(1)} km with seed ${nextSeed}`);
        setError(null);
    }, []);

    const handleGenerate = () => {
        regenerate(seed, {width: Number(widthKm), height: Number(heightKm)});
    };

    const handleRandomSeed = () => {
        const next = randomSeed();
        setSeed(next);
        regenerate(next, {width: Number(widthKm), height: Number(heightKm)});
    };

    const applyPreset = (id: string) => {
        const preset = getPresetById(id);
        if (!preset) return;
        setScenario(preset);
        setSeed(preset.seed);
        setWidthKm(Number((preset.sector.bounds.widthMeters / 1000).toFixed(2)));
        setHeightKm(Number((preset.sector.bounds.heightMeters / 1000).toFixed(2)));
        setMessage(`Loaded preset: ${preset.name}`);
        setError(null);
    };

    const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;
        try {
            const loaded = await readScenarioFile(file);
            setScenario(loaded);
            setSeed(loaded.seed);
            setWidthKm(loaded.sector.bounds.widthMeters / 1000);
            setHeightKm(loaded.sector.bounds.heightMeters / 1000);
            setMessage(`Loaded scenario from ${file.name}`);
            setError(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to load scenario");
        } finally {
            event.target.value = "";
        }
    };

    const sectorMeta = useMemo(() => scenario.sector, [scenario]);

    return (
        <div className="app-shell">
            <header className="toolbar">
                <div className="brand">
                    <span className="brand-dot"/>
                    <span>BEACON - MSAR Simulator</span>
                </div>
                <div className="badge">Seed-based maritime environment</div>
            </header>
            <main className="content">
                <div className="panel-card">
                    <div className="badge" style={{marginBottom: 8}}>
                        <span className="badge-dot"/> Scenario Controls
                    </div>
                    <div className="control-grid">
                        <label className="field">
                            <span className="field-label">Seed</span>
                            <input className="field-input" value={seed}
                                   onChange={(e) => setSeed(e.target.value.trim())}/>
                        </label>
                        <label className="field">
                            <span className="field-label">Width (km)</span>
                            <input
                                className="field-input"
                                type="number"
                                min={0.1}
                                step={0.5}
                                value={widthKm}
                                onChange={(e) => setWidthKm(Number(e.target.value))}
                            />
                        </label>
                        <label className="field">
                            <span className="field-label">Height (km)</span>
                            <input
                                className="field-input"
                                type="number"
                                min={0.1}
                                step={0.5}
                                value={heightKm}
                                onChange={(e) => setHeightKm(Number(e.target.value))}
                            />
                        </label>
                        <label className="field">
                            <span className="field-label">Preset</span>
                            <select
                                className="field-input"
                                value={selectedPreset}
                                onChange={(e) => {
                                    setSelectedPreset(e.target.value);
                                    applyPreset(e.target.value);
                                }}
                            >
                                {scenarioPresets.map((preset) => (
                                    <option key={preset.id} value={preset.id}>{preset.label}</option>
                                ))}
                            </select>
                        </label>
                    </div>
                    <div className="button-row">
                        <button className="btn" onClick={handleGenerate}>Generate</button>
                        <button className="btn ghost" onClick={handleRandomSeed}>Random seed</button>
                        <button className="btn ghost" onClick={() => downloadScenarioJSON(scenario)}>Save JSON</button>
                        <label className="btn ghost file-btn">
                            Load JSON
                            <input type="file" accept="application/json" onChange={handleFileChange}/>
                        </label>
                    </div>
                    <div className="meta-row">
                        <div><strong>Sector</strong> {sectorMeta.bounds.widthMeters / 1000} km
                            × {sectorMeta.bounds.heightMeters / 1000} km
                        </div>
                        <div><strong>Sea state</strong> {sectorMeta.conditions.seaState}</div>
                        <div><strong>Wind</strong> {sectorMeta.conditions.windKts} kts</div>
                        <div><strong>Visibility</strong> {sectorMeta.conditions.visibilityKm} km</div>
                    </div>
                    {message && <div className="callout success">{message}</div>}
                    {error && <div className="callout danger">{error}</div>}
                </div>

                <div className="viewer-row">
                    <MaritimeCanvas2D gridSpacing={200} scenario={scenario}/>
                </div>
            </main>
        </div>
    );
}
