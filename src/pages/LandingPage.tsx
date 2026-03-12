import type React from "react";
import {useNavigate} from "react-router-dom";
import {AppShell} from "../components/layout/AppShell";
import {PageTransition} from "../components/layout/PageTransition";
import {scenarioPresets} from "../data/scenarios";
import {useMission} from "../context/MissionContext";

/**
 * Landing Page — low-cognitive-load entry point.
 *
 * Progressive disclosure (Shneiderman, 1998) reduces initial overwhelm.
 * A single clear call-to-action ("Begin Setup") respects Hick's Law
 * by minimising choice count at the entry point.
 */
export default function LandingPage() {
    const navigate = useNavigate();
    const {scenario: scenarioHook, setPhase} = useMission();
    const {applyPreset, selectedPreset, loadScenarioFile} = scenarioHook;

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

                    <section className="landing-card" aria-labelledby="preset-heading">
                        <h2 id="preset-heading" className="section-heading">Quick Start — Choose a Preset</h2>
                        <p className="section-description">
                            Select a preset environment to begin with, or load a previously saved scenario file.
                        </p>
                        <div className="preset-grid" role="list">
                            {scenarioPresets.map((preset) => (
                                <button
                                    key={preset.id}
                                    role="listitem"
                                    className={`preset-card${selectedPreset === preset.id ? " preset-card-active" : ""}`}
                                    onClick={() => applyPreset(preset.id)}
                                    aria-pressed={selectedPreset === preset.id}
                                >
                                    <span className="preset-card-name">{preset.label}</span>
                                    <span className="preset-card-meta">
                                        Sea state {preset.scenario.sector.conditions.seaState} · Wind {preset.scenario.sector.conditions.windKts} kts
                                    </span>
                                </button>
                            ))}
                        </div>
                        <div className="landing-actions">
                            <label className="btn ghost file-btn" tabIndex={0}>
                                Load Scenario File
                                <input type="file" accept="application/json" onChange={handleFileChange}/>
                            </label>
                        </div>
                    </section>

                    <section className="landing-cta" aria-label="Begin">
                        <button className="btn btn-large" onClick={handleBeginSetup}>
                            Begin Setup →
                        </button>
                    </section>
                </div>
            </PageTransition>
        </AppShell>
    );
}
