import type React from "react";
import {useCallback, useMemo, useState} from "react";
import {useNavigate} from "react-router-dom";
import {AppShell} from "../components/layout/AppShell";
import {PageTransition} from "../components/layout/PageTransition";
import {
    scenarioPresets,
    categoryLabels,
    categoryOrder,
    loadCustomScenarios,
    saveCustomScenario,
    deleteCustomScenario,
    downloadScenarioJSON,
    type ScenarioPreset,
    type SavedCustomScenario,
} from "../data/scenarios";
import {useMission} from "../context/MissionContext";

export default function LandingPage() {
    const navigate = useNavigate();
    const {scenario: scenarioHook, setPhase, setCommsConfig, applyPresetDroneSet} = useMission();
    const {applyPreset, selectedPreset, loadScenarioFile, scenario, applyScenario} = scenarioHook;

    const [customScenarios, setCustomScenarios] = useState<SavedCustomScenario[]>(loadCustomScenarios);
    const [saveDialogOpen, setSaveDialogOpen] = useState(false);
    const [saveLabel, setSaveLabel] = useState("");
    const [filterTag, setFilterTag] = useState<string | null>(null);

    const allTags = useMemo(() => {
        const set = new Set<string>();
        for (const p of scenarioPresets) p.tags.forEach((t) => set.add(t));
        return Array.from(set).sort();
    }, []);

    const groupedPresets = useMemo(() => {
        const filtered = filterTag
            ? scenarioPresets.filter((p) => p.tags.includes(filterTag))
            : scenarioPresets;
        const groups = new Map<string, ScenarioPreset[]>();
        for (const cat of categoryOrder) groups.set(cat, []);
        for (const p of filtered) {
            const arr = groups.get(p.category) ?? [];
            arr.push(p);
            groups.set(p.category, arr);
        }
        return groups;
    }, [filterTag]);


    const handleSelectPreset = useCallback((preset: ScenarioPreset) => {
        applyPreset(preset.id);
        applyPresetDroneSet(preset.id);
        if (preset.commsOverride) {
            setCommsConfig((prev) => ({...prev, ...preset.commsOverride}));
        }
    }, [applyPreset, applyPresetDroneSet, setCommsConfig]);

    const handleBeginSetup = () => {
        setPhase("setup");
        navigate("/setup");
    };

    const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;
        await loadScenarioFile(file);
        event.target.value = "";
    };

    const handleSaveCustom = () => {
        if (!saveLabel.trim()) return;
        const saved = saveCustomScenario(saveLabel.trim(), scenario);
        setCustomScenarios((prev) => [saved, ...prev].slice(0, 20));
        setSaveLabel("");
        setSaveDialogOpen(false);
    };

    const handleLoadCustom = (custom: SavedCustomScenario) => {
        applyScenario(custom.scenario, `Loaded custom scenario: ${custom.label}`);
    };

    const handleDeleteCustom = (id: string) => {
        deleteCustomScenario(id);
        setCustomScenarios((prev) => prev.filter((s) => s.id !== id));
    };

    const handleExportCurrent = () => {
        downloadScenarioJSON(scenario);
    };

    const handleReset = () => {
        applyPreset("simple");
        applyPresetDroneSet("simple");
    };

    const anomalyCount = (p: ScenarioPreset) => {
        const c = p.scenario.anomalies.config;
        return (
            c["person-in-water"].count +
            c["lifeboat"].count +
            c["debris-field"].count +
            c["false-positive"].count
        );
    };

    return (
        <AppShell subtitle="Maritime Search & Rescue Simulator">
            <PageTransition>
                <div className="landing-container">
                    <section className="landing-hero" aria-labelledby="hero-heading">
                        <h1 id="hero-heading" className="landing-title">
                            Maritime Search &amp; Rescue
                        </h1>
                        <p className="landing-subtitle">
                            Plan, configure, and execute drone swarm search missions over procedurally generated
                            maritime environments.
                        </p>
                    </section>

                    <div className="scenario-tag-bar" role="toolbar" aria-label="Filter by tag">
                        <button
                            className={`scenario-tag-chip${filterTag === null ? " scenario-tag-chip-active" : ""}`}
                            onClick={() => setFilterTag(null)}
                        >
                            All
                        </button>
                        {allTags.map((tag) => (
                            <button
                                key={tag}
                                className={`scenario-tag-chip${filterTag === tag ? " scenario-tag-chip-active" : ""}`}
                                onClick={() => setFilterTag(filterTag === tag ? null : tag)}
                            >
                                {tag}
                            </button>
                        ))}
                    </div>

                    {categoryOrder.map((cat) => {
                        const presets = groupedPresets.get(cat);
                        if (!presets || presets.length === 0) return null;
                        return (
                            <section key={cat} className="landing-card" aria-labelledby={`cat-${cat}`}>
                                <h2 id={`cat-${cat}`} className="section-heading">
                                    {categoryLabels[cat]}
                                </h2>
                                <div className="preset-grid" role="list" data-tutorial-id="landing-preset-grid">
                                    {presets.map((preset) => (
                                        <button
                                            key={preset.id}
                                            role="listitem"
                                            className={`preset-card${selectedPreset === preset.id ? " preset-card-active" : ""}`}
                                            onClick={() => handleSelectPreset(preset)}
                                            aria-pressed={selectedPreset === preset.id}
                                        >
                                            <span className="preset-card-name">{preset.label}</span>
                                            <span className="preset-card-desc">{preset.description}</span>
                                            <span className="preset-card-meta">
                                                Sea state {preset.scenario.sector.conditions.seaState} · Wind{" "}
                                                {preset.scenario.sector.conditions.windKts} kts ·{" "}
                                                {anomalyCount(preset)} anomalies · {preset.recommendedDroneCount} drones rec.
                                            </span>
                                            <span className="preset-card-tags">
                                                {preset.tags.map((t) => (
                                                    <span key={t} className="preset-tag">{t}</span>
                                                ))}
                                            </span>
                                        </button>
                                    ))}
                                </div>
                            </section>
                        );
                    })}

                    <section className="landing-card" aria-labelledby="custom-heading">
                        <h2 id="custom-heading" className="section-heading">Custom Scenarios</h2>
                        <p className="section-description">
                            Save or load your own scenario configurations.
                        </p>

                        <div className="landing-actions">
                            <label className="btn ghost file-btn" tabIndex={0}>
                                Import File
                                <input type="file" accept="application/json" onChange={handleFileChange}/>
                            </label>
                            <button className="btn ghost" onClick={handleExportCurrent}>
                                Export Current
                            </button>
                            <button className="btn ghost" onClick={() => setSaveDialogOpen((v) => !v)}>
                                Save Current
                            </button>
                            <button className="btn ghost" onClick={handleReset}>
                                Reset to Default
                            </button>
                        </div>

                        {saveDialogOpen && (
                            <div className="save-dialog">
                                <input
                                    type="text"
                                    className="save-dialog-input"
                                    placeholder="Scenario name…"
                                    value={saveLabel}
                                    onChange={(e) => setSaveLabel(e.target.value)}
                                    onKeyDown={(e) => e.key === "Enter" && handleSaveCustom()}
                                    autoFocus
                                />
                                <button className="btn" onClick={handleSaveCustom} disabled={!saveLabel.trim()}>
                                    Save
                                </button>
                                <button className="btn ghost" onClick={() => setSaveDialogOpen(false)}>
                                    Cancel
                                </button>
                            </div>
                        )}

                        {customScenarios.length > 0 && (
                            <div className="custom-scenario-list" role="list">
                                {customScenarios.map((cs) => (
                                    <div key={cs.id} className="custom-scenario-row" role="listitem">
                                        <button className="custom-scenario-load" onClick={() => handleLoadCustom(cs)}>
                                            <span className="preset-card-name">{cs.label}</span>
                                            <span className="preset-card-meta">
                                                Saved {new Date(cs.savedAt).toLocaleDateString()} · Seed {cs.scenario.seed}
                                            </span>
                                        </button>
                                        <button
                                            className="custom-scenario-delete"
                                            onClick={() => handleDeleteCustom(cs.id)}
                                            aria-label={`Delete ${cs.label}`}
                                            title="Delete"
                                        >
                                            ✕
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </section>

                    <section className="landing-cta" aria-label="Begin">
                        <button className="btn btn-large" onClick={handleBeginSetup} data-tutorial-id="landing-begin-setup">
                            Begin Setup →
                        </button>
                    </section>
                </div>
            </PageTransition>
        </AppShell>
    );
}
