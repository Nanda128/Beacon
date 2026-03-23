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
        commsConfig, setCommsConfig,
        environmentOverrides, setEnvironmentOverrides,
        conditions,
        clearPostMission,
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

    const {select, clear, setSelectedIds} = droneSelection;
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

    const handleDeleteSelectedDrones = () => {
        setSelectedIds((ids) => {
            if (ids.length === 0) return ids;
            setDrones((prev) => prev.filter((d) => !ids.includes(d.id)));
            return [];
        });
    };

    const handleDroneSpeedChange = (id: string, speedKts: number) => {
        setDrones((prev) => prev.map((drone) => drone.id === id ? {
            ...drone,
            speedKts,
            lastUpdate: Date.now()
        } : drone));
    };

    const handleLaunchMission = () => {
        clearPostMission();
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
                        <button type="button" className="btn ghost btn-sm" onClick={handleBack}>← Back to Home</button>
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
                            <button type="button" className="btn" onClick={handleGenerate}>Generate</button>
                            <button type="button" className="btn ghost" onClick={handleRandomSeed}>Random Seed</button>
                            <button type="button" className="btn ghost"
                                    onClick={() => downloadScenarioJSON(scenario)}>Save JSON
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
                                    <button type="button" className="btn" onClick={handleSpawnDrone}
                                            data-tutorial-id="setup-spawn-drone">Spawn Drone
                                    </button>
                                    <button type="button" className="btn ghost"
                                            onClick={() => select(drones.map((d) => d.id))}>Select
                                        All
                                    </button>
                                    <button type="button" className="btn ghost" onClick={clear}>Deselect All</button>
                                    <button
                                        type="button"
                                        className="btn ghost danger"
                                        onClick={handleDeleteSelectedDrones}
                                        disabled={selectedDroneIds.length === 0}
                                        aria-label="Delete selected drones"
                                    >
                                        Delete Selected
                                    </button>
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

                    <section className="panel-card" aria-labelledby="environment-heading">
                        <Badge><span id="environment-heading">Environment Settings</span></Badge>
                        <ControlGrid>
                            <Field label="Sea state">
                                <input
                                    className="field-input"
                                    type="number"
                                    min={0}
                                    max={9}
                                    step={1}
                                    value={environmentOverrides.seaState ?? conditions.seaState}
                                    onChange={(e) => {
                                        const value = Number(e.target.value);
                                        setEnvironmentOverrides((prev) => ({
                                            ...prev,
                                            seaState: Number.isNaN(value) ? prev.seaState : Math.max(0, Math.min(9, value)),
                                        }));
                                    }}
                                />
                                <div className="field-hint">0 = calm · 9 = phenomenal</div>
                            </Field>
                            <Field label="Wind speed (kts)">
                                <input
                                    className="field-input"
                                    type="number"
                                    min={0}
                                    step={1}
                                    value={environmentOverrides.windKts ?? conditions.windKts}
                                    onChange={(e) => {
                                        const value = Number(e.target.value);
                                        setEnvironmentOverrides((prev) => ({
                                            ...prev,
                                            windKts: Number.isNaN(value) ? prev.windKts : Math.max(0, value),
                                        }));
                                    }}
                                />
                            </Field>
                            <Field label="Wind direction (deg)">
                                <input
                                    className="field-input"
                                    type="number"
                                    min={0}
                                    max={359}
                                    step={1}
                                    value={environmentOverrides.windDirectionDeg ?? conditions.windDirectionDeg ?? 0}
                                    onChange={(e) => {
                                        const raw = Number(e.target.value);
                                        const value = ((Number.isNaN(raw) ? 0 : raw) % 360 + 360) % 360;
                                        setEnvironmentOverrides((prev) => ({
                                            ...prev,
                                            windDirectionDeg: value,
                                        }));
                                    }}
                                />
                            </Field>
                            <Field label="Visibility (km)">
                                <input
                                    className="field-input"
                                    type="number"
                                    min={0.1}
                                    step={0.1}
                                    value={environmentOverrides.visibilityKm ?? conditions.visibilityKm}
                                    onChange={(e) => {
                                        const value = Number(e.target.value);
                                        setEnvironmentOverrides((prev) => ({
                                            ...prev,
                                            visibilityKm: Number.isNaN(value) ? prev.visibilityKm : Math.max(0.1, value),
                                        }));
                                    }}
                                />
                            </Field>
                            <Field label="Sea surface temp (°C)">
                                <input
                                    className="field-input"
                                    type="number"
                                    step={0.5}
                                    value={environmentOverrides.surfaceTempC ?? conditions.surfaceTempC}
                                    onChange={(e) => {
                                        const value = Number(e.target.value);
                                        setEnvironmentOverrides((prev) => ({
                                            ...prev,
                                            surfaceTempC: Number.isNaN(value) ? prev.surfaceTempC : value,
                                        }));
                                    }}
                                />
                            </Field>
                            <Field label="Conditions note">
                                <input
                                    className="field-input"
                                    value={environmentOverrides.description ?? conditions.description ?? ""}
                                    onChange={(e) => {
                                        const value = e.target.value.trim();
                                        setEnvironmentOverrides((prev) => ({
                                            ...prev,
                                            description: value.length === 0 ? undefined : value,
                                        }));
                                    }}
                                    placeholder={conditions.description ?? "e.g., Swell from NE, scattered showers"}
                                />
                                <div className="field-hint">Overrides seed/preset-derived description for this
                                    mission.
                                </div>
                            </Field>
                            <Field label=" ">
                                <button
                                    type="button"
                                    className="btn ghost"
                                    onClick={() => setEnvironmentOverrides({})}
                                >
                                    Reset to scenario defaults
                                </button>
                            </Field>
                        </ControlGrid>
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

                    <section className="panel-card" aria-labelledby="comms-heading">
                        <Badge><span id="comms-heading">Communications Settings</span></Badge>
                        <ControlGrid>
                            <Field label="Comms degradation">
                                <label style={{display: "flex", alignItems: "center", gap: 8}}>
                                    <input
                                        type="checkbox"
                                        checked={commsConfig.enabled}
                                        onChange={(e) => setCommsConfig((prev) => ({
                                            ...prev,
                                            enabled: e.target.checked,
                                        }))}
                                    />
                                    <span>Simulate comm degradation</span>
                                </label>
                                <div className="field-hint" style={{marginTop: 4}}>
                                    Models distance-based signal decay, packet loss, and latency per Zulkifley et al.
                                    (2021).
                                </div>
                            </Field>
                            <Field label="Base latency (ms)">
                                <div style={{display: "flex", gap: 8, alignItems: "center"}}>
                                    <input
                                        className="field-input"
                                        type="number"
                                        min={0}
                                        max={200}
                                        step={1}
                                        value={commsConfig.baseLatencyMs}
                                        disabled={!commsConfig.enabled}
                                        onChange={(e) => setCommsConfig((prev) => ({
                                            ...prev,
                                            baseLatencyMs: Math.max(0, Number(e.target.value)),
                                        }))}
                                        style={{width: 80}}
                                    />
                                    <span className="field-hint">C2 spec: &lt; 50 ms</span>
                                </div>
                            </Field>
                            <Field label="Max latency (ms)">
                                <div style={{display: "flex", gap: 8, alignItems: "center"}}>
                                    <input
                                        className="field-input"
                                        type="number"
                                        min={0}
                                        max={500}
                                        step={1}
                                        value={commsConfig.maxLatencyMs}
                                        disabled={!commsConfig.enabled}
                                        onChange={(e) => setCommsConfig((prev) => ({
                                            ...prev,
                                            maxLatencyMs: Math.max(0, Number(e.target.value)),
                                        }))}
                                        style={{width: 80}}
                                    />
                                    <span className="field-hint">Measured: up to 94 ms</span>
                                </div>
                            </Field>
                            <Field label="Packet loss (%)">
                                <div style={{display: "flex", gap: 8, alignItems: "center"}}>
                                    <input
                                        className="field-input"
                                        type="number"
                                        min={0}
                                        max={50}
                                        step={0.1}
                                        value={Math.round(commsConfig.maxPacketLossPct * 1000) / 10}
                                        disabled={!commsConfig.enabled}
                                        onChange={(e) => setCommsConfig((prev) => ({
                                            ...prev,
                                            maxPacketLossPct: Math.min(0.5, Math.max(0, Number(e.target.value) / 100)),
                                        }))}
                                        style={{width: 80}}
                                    />
                                    <span className="field-hint">Max at full degradation</span>
                                </div>
                            </Field>
                            <Field label="Degradation start (m)">
                                <div style={{display: "flex", gap: 8, alignItems: "center"}}>
                                    <input
                                        className="field-input"
                                        type="number"
                                        min={100}
                                        max={10000}
                                        step={100}
                                        value={commsConfig.degradationStartMeters}
                                        disabled={!commsConfig.enabled}
                                        onChange={(e) => setCommsConfig((prev) => ({
                                            ...prev,
                                            degradationStartMeters: Math.max(100, Number(e.target.value)),
                                        }))}
                                        style={{width: 90}}
                                    />
                                    <span className="field-hint">Distance from hub</span>
                                </div>
                            </Field>
                            <Field label="Degradation full (m)">
                                <div style={{display: "flex", gap: 8, alignItems: "center"}}>
                                    <input
                                        className="field-input"
                                        type="number"
                                        min={500}
                                        max={20000}
                                        step={100}
                                        value={commsConfig.degradationFullMeters}
                                        disabled={!commsConfig.enabled}
                                        onChange={(e) => setCommsConfig((prev) => ({
                                            ...prev,
                                            degradationFullMeters: Math.max(500, Number(e.target.value)),
                                        }))}
                                        style={{width: 90}}
                                    />
                                    <span className="field-hint">Max degradation distance</span>
                                </div>
                            </Field>
                            <Field label="Intermittent cycle (s)">
                                <div style={{display: "flex", gap: 8, alignItems: "center"}}>
                                    <input
                                        className="field-input"
                                        type="number"
                                        min={0}
                                        max={120}
                                        step={1}
                                        value={commsConfig.intermittentCycleSec}
                                        disabled={!commsConfig.enabled}
                                        onChange={(e) => setCommsConfig((prev) => ({
                                            ...prev,
                                            intermittentCycleSec: Math.max(0, Number(e.target.value)),
                                        }))}
                                        style={{width: 80}}
                                    />
                                    <span className="field-hint">0 = disabled</span>
                                </div>
                            </Field>
                            <Field label="Intermittent depth">
                                <div style={{display: "flex", gap: 8, alignItems: "center"}}>
                                    <input
                                        className="field-input"
                                        type="number"
                                        min={0}
                                        max={100}
                                        step={5}
                                        value={Math.round(commsConfig.intermittentDepth * 100)}
                                        disabled={!commsConfig.enabled}
                                        onChange={(e) => setCommsConfig((prev) => ({
                                            ...prev,
                                            intermittentDepth: Math.min(1, Math.max(0, Number(e.target.value) / 100)),
                                        }))}
                                        style={{width: 80}}
                                    />
                                    <span className="field-hint">% signal drop at trough</span>
                                </div>
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
                            <div><strong>Sea state</strong> {conditions.seaState}</div>
                            <div><strong>Wind</strong> {conditions.windKts} kts @{conditions.windDirectionDeg ?? 0}deg
                            </div>
                            <div><strong>Visibility</strong> {conditions.visibilityKm} km</div>
                            <div><strong>Sea temp</strong> {conditions.surfaceTempC} C</div>
                            <div>
                                <strong>Conditions</strong> {conditions.description ?? sectorMeta.conditions.description ?? "N/A"}
                            </div>
                            <div><strong>Anomalies</strong> {scenario.anomalies.items.length} placed</div>
                            <div><strong>Drones</strong> {drones.length} spawned</div>
                        </div>
                        {message && <div className="callout success" role="status" aria-live="polite">{message}</div>}
                        {error && <div className="callout danger" role="alert" aria-live="assertive">{error}</div>}
                    </section>

                    <section className="setup-cta" aria-label="Launch mission">
                        <button type="button" className="btn btn-large btn-launch" onClick={handleLaunchMission}
                                data-tutorial-id="setup-launch-mission">
                            Launch Mission
                        </button>
                    </section>
                </div>
            </PageTransition>
        </AppShell>
    );
}









