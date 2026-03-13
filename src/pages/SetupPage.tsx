import {useEffect, useRef} from "react";
import {useNavigate} from "react-router-dom";
import {AppShell} from "../components/layout/AppShell";
import {PageTransition} from "../components/layout/PageTransition";
import {useMission} from "../context/MissionContext";
import Badge from "../components/ui/Badge";
import Field, {ControlGrid, FieldInline} from "../components/ui/Field";
import ButtonRow from "../components/ui/ButtonRow";
import {anomalyTypeLabels, anomalyTypeOrder} from "../config/anomalies";
import {droneModels} from "../config/constants";
import {scenarioPresets} from "../data/scenarios";

// (Miller, 1956. Chunking reduces working-memory overload).
export default function SetupPage() {
    const navigate = useNavigate();
    const mission = useMission();
    const {
        scenario: scenarioHook,
        spawnPoints,
        selectedSpawnPointId, setSelectedSpawnPointId,
        selectedDroneModelId, setSelectedDroneModelId,
        handleSpawnDrone,
        applyPresetDroneSet,
        drones, setDrones,
        droneSelection,
        selectedDroneIds,
        sensorSettings,
        sensorsEnabled, setSensorsEnabled,
        showSensorRanges, setShowSensorRanges,
        handleSensorSettingChange,
        coverageOverlap, setCoverageOverlap,
        setPhase,
    } = mission;

    const {
        seed, widthKm, heightKm,
        setSeed, setWidthKm, setHeightKm,
        anomalyConfig,
        selectedPreset,
        message, error,
        handleGenerate,
        handleRandomSeed,
        applyPreset,
        handleAnomalyConfigChange,
        downloadScenarioJSON,
        scenario,
        sectorMeta,
        loadScenarioFile,
    } = scenarioHook;

    const {select, clear} = droneSelection;
    const didAutoApplyPresetFleet = useRef(false);

    useEffect(() => {
        if (didAutoApplyPresetFleet.current) return;
        if (drones.length > 0) return;
        applyPresetDroneSet(selectedPreset);
        didAutoApplyPresetFleet.current = true;
    }, [applyPresetDroneSet, drones.length, selectedPreset]);

    const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;
        await loadScenarioFile(file);
        event.target.value = "";
    };

    const handleDroneSpeedChange = (id: string, speedKts: number) => {
        setDrones((prev) => prev.map((drone) => drone.id === id ? {
            ...drone,
            speedKts,
            lastUpdate: Date.now()
        } : drone));
    };

    const handleLaunchMission = () => {
        setPhase("simulation");
        navigate("/simulation");
    };

    const handleBack = () => {
        setPhase("landing");
        navigate("/");
    };

    return (
        <AppShell subtitle="Mission Setup">
            <PageTransition>
                <div className="setup-container">
                    <nav className="setup-nav" aria-label="Setup navigation">
                        <button className="btn ghost btn-sm" onClick={handleBack}>← Back to Home</button>
                    </nav>

                    <section className="panel-card" aria-labelledby="scenario-heading">
                        <Badge><span id="scenario-heading">Scenario Configuration</span></Badge>
                        <ControlGrid>
                            <Field label="Seed">
                                <input className="field-input" value={seed}
                                       aria-label="Scenario seed"
                                       onChange={(e) => setSeed(e.target.value.trim())}/>
                            </Field>
                            <Field label="Width (km)">
                                <input className="field-input" type="number" min={0.1} step={0.5}
                                       value={widthKm}
                                       aria-label="Sector width in kilometres"
                                       onChange={(e) => setWidthKm(Number(e.target.value))}/>
                            </Field>
                            <Field label="Height (km)">
                                <input className="field-input" type="number" min={0.1} step={0.5}
                                       value={heightKm}
                                       aria-label="Sector height in kilometres"
                                       onChange={(e) => setHeightKm(Number(e.target.value))}/>
                            </Field>
                            <Field label="Preset">
                                <select className="field-input" value={selectedPreset}
                                        data-tutorial-id="setup-preset-select"
                                        aria-label="Environment preset"
                                        onChange={(e) => {
                                            applyPreset(e.target.value);
                                            applyPresetDroneSet(e.target.value);
                                        }}>
                                    {scenarioPresets.map((preset) => (
                                        <option key={preset.id} value={preset.id}>{preset.label}</option>
                                    ))}
                                </select>
                            </Field>
                        </ControlGrid>
                        <ButtonRow>
                            <button className="btn" onClick={handleGenerate}>Generate</button>
                            <button className="btn ghost" onClick={handleRandomSeed}>Random Seed</button>
                            <button className="btn ghost" onClick={() => downloadScenarioJSON(scenario)}>Save JSON
                            </button>
                            <label className="btn ghost file-btn" tabIndex={0}>
                                Load JSON
                                <input type="file" accept="application/json" onChange={handleFileChange}/>
                            </label>
                        </ButtonRow>
                    </section>

                    <section className="panel-card" aria-labelledby="anomaly-heading">
                        <Badge><span id="anomaly-heading">Anomalies</span></Badge>
                        <ControlGrid>
                            {anomalyTypeOrder.map((type) => (
                                <Field key={type} label={anomalyTypeLabels[type]}>
                                    <FieldInline>
                                        <label>
                                            <span className="field-sub">Count</span>
                                            <input className="field-input" type="number" min={0} step={1}
                                                   value={anomalyConfig[type].count}
                                                   onChange={(e) => handleAnomalyConfigChange(type, "count", Math.max(0, Number(e.target.value)))}/>
                                        </label>
                                        <label>
                                            <span className="field-sub">Detect radius (m)</span>
                                            <input className="field-input" type="number" min={10} step={10}
                                                   value={anomalyConfig[type].detectionRadiusMeters}
                                                   onChange={(e) => handleAnomalyConfigChange(type, "detectionRadiusMeters", Math.max(10, Number(e.target.value)))}/>
                                        </label>
                                    </FieldInline>
                                </Field>
                            ))}
                        </ControlGrid>
                    </section>

                    <section className="panel-card" aria-labelledby="drone-heading">
                        <Badge><span id="drone-heading">Drone Configuration</span></Badge>
                        <ControlGrid>
                            <Field label="Spawn point">
                                <select className="field-input" value={selectedSpawnPointId}
                                        aria-label="Drone spawn location"
                                        onChange={(e) => setSelectedSpawnPointId(e.target.value)}>
                                    {spawnPoints.map((point) => (
                                        <option key={point.id} value={point.id}>{point.label}</option>
                                    ))}
                                </select>
                            </Field>
                            <Field label="Drone model">
                                <select className="field-input" value={selectedDroneModelId}
                                        aria-label="Drone model selection"
                                        onChange={(e) => setSelectedDroneModelId(e.target.value)}>
                                    {droneModels.map((model) => (
                                        <option key={model.id} value={model.id}>{model.label}</option>
                                    ))}
                                </select>
                            </Field>
                            <Field label=" " className="field" as="div">
                                <div style={{display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap"}}>
                                    <button className="btn" onClick={handleSpawnDrone} data-tutorial-id="setup-spawn-drone">Spawn Drone</button>
                                    <button className="btn ghost" onClick={() => select(drones.map((d) => d.id))}>Select
                                        All
                                    </button>
                                    <button className="btn ghost" onClick={clear}>Deselect All</button>
                                </div>
                            </Field>
                        </ControlGrid>

                        {drones.length > 0 && (
                            <div className="drone-list" role="list" aria-label="Spawned drones">
                                {drones.map((drone) => (
                                    <div key={drone.id} className="drone-pill-row" role="listitem">
                                        <button
                                            className={`drone-pill${selectedDroneIds.includes(drone.id) ? " active" : ""}`}
                                            onClick={(event) => {
                                                if (event.ctrlKey || event.metaKey) droneSelection.toggle([drone.id]);
                                                else if (event.shiftKey) droneSelection.add([drone.id]);
                                                else droneSelection.select([drone.id]);
                                            }}
                                            aria-pressed={selectedDroneIds.includes(drone.id)}
                                            style={{flex: 1}}
                                        >
                                            <span>{drone.callsign}</span>
                                            <span className="drone-meta">{drone.status}</span>
                                            <span className="drone-meta">· {Math.round(drone.batteryPct)}%</span>
                                        </button>
                                        <label className="speed-label">
                                            <span className="drone-meta">Speed</span>
                                            <input type="number" min={0} step={1} value={drone.speedKts}
                                                   aria-label={`Speed for ${drone.callsign}`}
                                                   onChange={(e) => handleDroneSpeedChange(drone.id, Math.max(0, Number(e.target.value)))}
                                                   style={{width: 70}}/>
                                            <span className="drone-meta">kts</span>
                                        </label>
                                    </div>
                                ))}
                            </div>
                        )}
                    </section>

                    <section className="panel-card" aria-labelledby="sensor-heading">
                        <Badge><span id="sensor-heading">Sensor Settings</span></Badge>
                        <ControlGrid>
                            <Field label="Sensors enabled">
                                <label style={{display: "flex", alignItems: "center", gap: 8}}>
                                    <input type="checkbox" checked={sensorsEnabled}
                                           onChange={(e) => setSensorsEnabled(e.target.checked)}/>
                                    <span>Run detection loop</span>
                                </label>
                            </Field>
                            <Field label="Show ranges">
                                <label style={{display: "flex", alignItems: "center", gap: 8}}>
                                    <input type="checkbox" checked={showSensorRanges}
                                           onChange={(e) => setShowSensorRanges(e.target.checked)}/>
                                    <span>Draw sensor radius on map</span>
                                </label>
                            </Field>
                            <Field label="Range (m)">
                                <input className="field-input" type="number" min={50} step={10}
                                       value={sensorSettings.rangeMeters}
                                       onChange={(e) => handleSensorSettingChange("rangeMeters", Math.max(10, Number(e.target.value)))}/>
                            </Field>
                            <Field label="Optimal P(hit)">
                                <input className="field-input" type="number" min={0} max={1} step={0.05}
                                       value={sensorSettings.optimalDetectionProbability}
                                       onChange={(e) => handleSensorSettingChange("optimalDetectionProbability", Math.min(1, Math.max(0, Number(e.target.value))))}/>
                            </Field>
                            <Field label="Edge P(hit)">
                                <input className="field-input" type="number" min={0} max={1} step={0.05}
                                       value={sensorSettings.edgeDetectionProbability}
                                       onChange={(e) => handleSensorSettingChange("edgeDetectionProbability", Math.min(1, Math.max(0, Number(e.target.value))))}/>
                            </Field>
                            <Field label="False positives (/min)">
                                <input className="field-input" type="number" min={0} step={0.01}
                                       value={sensorSettings.falsePositiveRatePerMinute}
                                       onChange={(e) => handleSensorSettingChange("falsePositiveRatePerMinute", Math.max(0, Number(e.target.value)))}/>
                            </Field>
                            <Field label="Check interval (ms)">
                                <input className="field-input" type="number" min={100} step={100}
                                       value={sensorSettings.checkIntervalMs}
                                       onChange={(e) => handleSensorSettingChange("checkIntervalMs", Math.max(50, Number(e.target.value)))}/>
                            </Field>
                        </ControlGrid>
                    </section>

                    <section className="panel-card" aria-labelledby="coverage-heading">
                        <Badge><span id="coverage-heading">Coverage Settings</span></Badge>
                        <ControlGrid>
                            <Field label="Sweep overlap (%)">
                                <input className="field-input" type="number" min={10} max={20} step={1}
                                       value={Math.round(coverageOverlap * 100)}
                                       onChange={(e) => setCoverageOverlap(Math.min(0.2, Math.max(0.1, Number(e.target.value) / 100)))}
                                       style={{width: 90}}/>
                            </Field>
                        </ControlGrid>
                    </section>

                    <section className="panel-card setup-summary" aria-label="Environment summary">
                        <div className="meta-row">
                            <div><strong>Sector</strong> {sectorMeta.bounds.widthMeters / 1000} km
                                × {sectorMeta.bounds.heightMeters / 1000} km
                            </div>
                            <div><strong>Sea state</strong> {sectorMeta.conditions.seaState}</div>
                            <div><strong>Wind</strong> {sectorMeta.conditions.windKts} kts</div>
                            <div><strong>Visibility</strong> {sectorMeta.conditions.visibilityKm} km</div>
                            <div><strong>Anomalies</strong> {scenario.anomalies.items.length} placed</div>
                            <div><strong>Drones</strong> {drones.length} spawned</div>
                        </div>
                        {message && <div className="callout success" role="status" aria-live="polite">{message}</div>}
                        {error && <div className="callout danger" role="alert" aria-live="assertive">{error}</div>}
                    </section>

                    <section className="setup-cta" aria-label="Launch mission">
                        <button className="btn btn-large btn-launch" onClick={handleLaunchMission} data-tutorial-id="setup-launch-mission">
                            Launch Mission
                        </button>
                    </section>
                </div>
            </PageTransition>
        </AppShell>
    );
}









