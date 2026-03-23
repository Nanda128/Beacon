import type React from "react";
import {createContext, useCallback, useContext, useEffect, useMemo, useRef, useState} from "react";
import type {DetectionLogEntry, EnvironmentalConditions, SensorConfig, Vec2} from "../domain/types/environment";
import type {DroneState, SpawnPoint} from "../domain/types/drone";
import type {Alert} from "../domain/types/alert";
import {useScenario} from "../hooks/useScenario";
import {useDroneSelection} from "../hooks/useDroneSelection";
import {defaultSensorConfig} from "../config/sensors";
import {
    droneModels,
    lastModelStorageKey,
    droneHubReturnReserveMinutes,
    batteryEmergencyBufferMinutes,
} from "../config/constants";
import {alertLogLimit} from "../config/alerts";
import {defaultCommsConfig} from "../config/comms";
import type {CommsConfig} from "../domain/types/comms";
import {droneHubFromBounds} from "../domain/environment/generator";
import {createDroneId} from "../domain/types/drone";
import type {SwarmBehaviourParams} from "../domain/swarm/behaviour";
import {
    defaultSafetyDistanceMeters,
    defaultNeighborRadiusMeters,
    defaultSwarmSeparationWeight,
    defaultSwarmCohesionWeight,
    defaultSwarmAlignmentWeight,
    defaultMaxSteeringAngleDegPerSec,
} from "../config/constants";
import type {CoveragePlan} from "../domain/coverage/planner";
import type {VoronoiCell} from "../components/canvas/voronoi";
import {getPresetById} from "../data/scenarios";
import type {MissionMetricsSession} from "../domain/types/metrics";
import type {NasaTlxAssessment, NasaTlxPairwiseSelection, NasaTlxResponses} from "../domain/types/tlx";
import {calculateWeightedNasaTlx, normalizePairwiseSelections} from "../domain/metrics/tlx";
import {computeReturnMinutesWithEnvironment} from "../domain/environment/effects";

export type MissionPhase = "landing" | "setup" | "simulation" | "debrief";
export type MissionEndReason = "manual-end" | "aborted" | "completed";

export type PostMissionState = {
    missionEndedAt?: number;
    endReason?: MissionEndReason;
    metricsSnapshot?: MissionMetricsSession;
    nasaTlxOptIn: boolean | null;
    nasaTlxAssessment?: NasaTlxAssessment;
};

type MissionContextValue = {
    phase: MissionPhase;
    setPhase: (p: MissionPhase) => void;

    scenario: ReturnType<typeof useScenario>;

    drones: DroneState[];
    setDrones: React.Dispatch<React.SetStateAction<DroneState[]>>;
    selectedDroneIds: string[];
    droneSelection: ReturnType<typeof useDroneSelection>;
    spawnPoints: SpawnPoint[];
    hub: { position: Vec2 };
    selectedSpawnPointId: string;
    setSelectedSpawnPointId: (id: string) => void;
    selectedDroneModelId: string;
    setSelectedDroneModelId: (id: string) => void;
    handleSpawnDrone: () => void;
    applyPresetDroneSet: (presetId: string) => void;

    sensorSettings: SensorConfig;
    setSensorSettings: React.Dispatch<React.SetStateAction<SensorConfig>>;
    sensorsEnabled: boolean;
    setSensorsEnabled: (v: boolean) => void;
    showSensorRanges: boolean;
    setShowSensorRanges: (v: boolean) => void;
    handleSensorSettingChange: (key: keyof SensorConfig, value: number) => void;

    voronoiEnabled: boolean;
    setVoronoiEnabled: (v: boolean) => void;
    voronoiCells: VoronoiCell[];
    setVoronoiCells: React.Dispatch<React.SetStateAction<VoronoiCell[]>>;
    coveragePlans: CoveragePlan[];
    setCoveragePlans: React.Dispatch<React.SetStateAction<CoveragePlan[]>>;
    coverageActive: boolean;
    setCoverageActive: (v: boolean) => void;
    coverageOverlap: number;
    setCoverageOverlap: (v: number) => void;

    detectionLog: DetectionLogEntry[];
    setDetectionLog: React.Dispatch<React.SetStateAction<DetectionLogEntry[]>>;
    appendLog: (entries: DetectionLogEntry[]) => void;

    alerts: Alert[];
    setAlerts: React.Dispatch<React.SetStateAction<Alert[]>>;
    appendAlerts: (newAlerts: Alert[]) => void;
    acknowledgeAlert: (id: string) => void;
    acknowledgeAllAlerts: () => void;
    alertAudioEnabled: boolean;
    setAlertAudioEnabled: (v: boolean) => void;
    unacknowledgedAlertCount: number;

    manualInterventionEnabled: boolean;
    setManualInterventionEnabled: (v: boolean) => void;

    fogOfWarEnabled: boolean;
    setFogOfWarEnabled: (v: boolean) => void;

    commsConfig: CommsConfig;
    setCommsConfig: React.Dispatch<React.SetStateAction<CommsConfig>>;

    /**
     * Mission-level overrides for seed/preset-derived environmental conditions.
     * When non-empty, these are merged over scenario.sector.conditions to produce "conditions".
     */
    environmentOverrides: Partial<EnvironmentalConditions>;
    setEnvironmentOverrides: React.Dispatch<React.SetStateAction<Partial<EnvironmentalConditions>>>;
    /**
     * Active environmental conditions for the current mission, after applying overrides.
     */
    conditions: EnvironmentalConditions;

    postMission: PostMissionState;
    finalizeMission: (input: {
        metrics: MissionMetricsSession;
        endedAt?: number;
        endReason?: MissionEndReason
    }) => void;
    setNasaTlxOptIn: (value: boolean) => void;
    submitNasaTlxResponses: (input: {
        responses: NasaTlxResponses;
        pairwiseSelections: NasaTlxPairwiseSelection[];
    }) => void;
    clearPostMission: () => void;

    swarmEnabledGlobal: boolean;
    swarmParamsRef: React.MutableRefObject<SwarmBehaviourParams>;
    batteryWarningStateRef: React.MutableRefObject<Record<string, { thresholds: Set<number>; emergency: boolean }>>;

    clampToBounds: (pos: Vec2) => Vec2;
    computeReturnMinutes: (drone: DroneState) => number;
    computeEmergencyReserve: (drone: DroneState) => number;
    detectionProbability: (distanceMeters: number) => number;
    resetDrones: () => void;
};

const MissionContext = createContext<MissionContextValue>(null!);
export const useMission = () => useContext(MissionContext);

const initialPostMissionState: PostMissionState = {
    missionEndedAt: undefined,
    endReason: undefined,
    metricsSnapshot: undefined,
    nasaTlxOptIn: null,
    nasaTlxAssessment: undefined,
};

export function MissionProvider({children}: { children: React.ReactNode }) {
    const [phase, setPhase] = useState<MissionPhase>("landing");
    const [drones, setDrones] = useState<DroneState[]>([]);
    const droneSelection = useDroneSelection();
    const {selectedIds: selectedDroneIds, clear, select} = droneSelection;
    const [swarmEnabledGlobal] = useState(true);
    const batteryWarningStateRef = useRef<Record<string, { thresholds: Set<number>; emergency: boolean }>>({});

    const resetDrones = useCallback(() => {
        setDrones([]);
        batteryWarningStateRef.current = {};
        clear();
    }, [clear]);

    const scenarioHook = useScenario({onScenarioReset: resetDrones});
    const {scenario, seed, setMessage} = scenarioHook;

    const hub = useMemo(() => droneHubFromBounds(scenario.sector.bounds), [scenario.sector.bounds]);

    const spawnPoints = useMemo<SpawnPoint[]>(() => {
        const {origin, widthMeters, heightMeters} = scenario.sector.bounds;
        const margin = Math.max(Math.min(widthMeters, heightMeters) * 0.05, 50);
        return [
            {id: "center", label: "Center (Drone Hub)", position: hub.position},
            {
                id: "northwest",
                label: "Northwest",
                position: {x: origin.x + margin, y: origin.y + heightMeters - margin}
            },
            {
                id: "northeast",
                label: "Northeast",
                position: {x: origin.x + widthMeters - margin, y: origin.y + heightMeters - margin}
            },
            {id: "southwest", label: "Southwest", position: {x: origin.x + margin, y: origin.y + margin}},
            {id: "southeast", label: "Southeast", position: {x: origin.x + widthMeters - margin, y: origin.y + margin}},
        ];
    }, [scenario.sector.bounds, hub.position]);

    const [selectedSpawnPointId, setSelectedSpawnPointId] = useState("center");
    const [selectedDroneModelId, setSelectedDroneModelId] = useState("mavic3");
    const [sensorSettings, setSensorSettings] = useState<SensorConfig>({...defaultSensorConfig});
    const [sensorsEnabled, setSensorsEnabled] = useState(true);
    const [showSensorRanges, setShowSensorRanges] = useState(true);
    const [voronoiEnabled, setVoronoiEnabled] = useState(false);
    const [voronoiCells, setVoronoiCells] = useState<VoronoiCell[]>([]);
    const [coveragePlans, setCoveragePlans] = useState<CoveragePlan[]>([]);
    const [coverageActive, setCoverageActive] = useState(false);
    const [coverageOverlap, setCoverageOverlap] = useState(0.15);
    const [detectionLog, setDetectionLog] = useState<DetectionLogEntry[]>([]);
    const [alerts, setAlerts] = useState<Alert[]>([]);
    const [alertAudioEnabled, setAlertAudioEnabled] = useState(true);
    const [manualInterventionEnabled, setManualInterventionEnabled] = useState(false);
    const [fogOfWarEnabled, setFogOfWarEnabled] = useState(false);
    const [commsConfig, setCommsConfig] = useState<CommsConfig>({...defaultCommsConfig});
    const [postMission, setPostMission] = useState<PostMissionState>({...initialPostMissionState});
    const [environmentOverrides, setEnvironmentOverrides] = useState<Partial<EnvironmentalConditions>>({});

    const swarmParamsRef = useRef<SwarmBehaviourParams>({
        safetyDistanceMeters: defaultSafetyDistanceMeters,
        neighborRadiusMeters: defaultNeighborRadiusMeters,
        separationWeight: defaultSwarmSeparationWeight,
        cohesionWeight: defaultSwarmCohesionWeight,
        alignmentWeight: defaultSwarmAlignmentWeight,
        maxSteeringAngleDegPerSec: defaultMaxSteeringAngleDegPerSec,
    });

    useEffect(() => {
        const stored = localStorage.getItem(lastModelStorageKey);
        if (stored) {
            const found = droneModels.find((m) => m.id === stored);
            if (found) setSelectedDroneModelId(found.id);
        }
    }, []);
    useEffect(() => {
        localStorage.setItem(lastModelStorageKey, selectedDroneModelId);
    }, [selectedDroneModelId]);

    const clampToBounds = useCallback((pos: Vec2) => {
        const {origin, widthMeters, heightMeters} = scenario.sector.bounds;
        return {
            x: Math.min(Math.max(pos.x, origin.x), origin.x + widthMeters),
            y: Math.min(Math.max(pos.y, origin.y), origin.y + heightMeters),
        };
    }, [scenario.sector.bounds]);

    const conditions: EnvironmentalConditions = useMemo(() => ({
        ...scenario.sector.conditions,
        ...environmentOverrides,
    }), [environmentOverrides, scenario.sector.conditions]);

    const computeReturnMinutes = useCallback((drone: DroneState) => {
        return computeReturnMinutesWithEnvironment(
            drone.position,
            drone.homePosition,
            drone.speedKts,
            conditions,
        );
    }, [conditions]);

    const computeEmergencyReserve = useCallback((drone: DroneState) => {
        const minutesToHub = computeReturnMinutes(drone);
        if (!Number.isFinite(minutesToHub)) return droneHubReturnReserveMinutes;
        return Math.max(minutesToHub + batteryEmergencyBufferMinutes, droneHubReturnReserveMinutes);
    }, [computeReturnMinutes]);

    const detectionProbability = useCallback((distanceMeters: number) => {
        const range = Math.max(1, sensorSettings.rangeMeters);
        const falloff = Math.max(0, Math.min(1, 1 - distanceMeters / range));
        const shaped = Math.pow(falloff, 1.4);
        const base = sensorSettings.edgeDetectionProbability;
        const peak = sensorSettings.optimalDetectionProbability;
        return Math.min(1, Math.max(0, base + (peak - base) * shaped));
    }, [sensorSettings.edgeDetectionProbability, sensorSettings.optimalDetectionProbability, sensorSettings.rangeMeters]);

    const appendLog = useCallback((entries: DetectionLogEntry[]) => {
        setDetectionLog((prev) => {
            const next = [...entries, ...prev];
            const seen = new Set<string>();
            const deduped = next.filter((entry) => {
                if (seen.has(entry.id)) return false;
                seen.add(entry.id);
                return true;
            });
            return deduped.slice(0, sensorSettings.logLimit);
        });
    }, [sensorSettings.logLimit]);

    const appendAlerts = useCallback((newAlerts: Alert[]) => {
        if (newAlerts.length === 0) return;
        setAlerts((prev) => {
            const next = [...newAlerts, ...prev];
            return next.slice(0, alertLogLimit);
        });
    }, []);

    const acknowledgeAlert = useCallback((id: string) => {
        const now = Date.now();
        setAlerts((prev) =>
            prev.map((a) => (a.id === id ? {...a, acknowledged: true, acknowledgedAt: now} : a)),
        );
    }, []);

    const acknowledgeAllAlerts = useCallback(() => {
        const now = Date.now();
        setAlerts((prev) =>
            prev.map((a) => (a.acknowledged ? a : {...a, acknowledged: true, acknowledgedAt: now})),
        );
    }, []);

    const unacknowledgedAlertCount = useMemo(
        () => alerts.filter((a) => !a.acknowledged).length,
        [alerts],
    );

    const handleSensorSettingChange = useCallback((key: keyof SensorConfig, value: number) => {
        setSensorSettings((prev) => ({...prev, [key]: value}));
    }, []);

    const handleSpawnDrone = useCallback(() => {
        const spawn = spawnPoints.find((p) => p.id === selectedSpawnPointId) ?? spawnPoints[0];
        if (!spawn) return;
        const model = droneModels.find((m) => m.id === selectedDroneModelId) ?? droneModels[0];
        const newDrone: DroneState = {
            id: createDroneId(seed),
            callsign: `DR-${(drones.length + 1).toString().padStart(2, "0")}`,
            position: clampToBounds(spawn.position),
            headingDeg: 0,
            status: "idle",
            speedKts: model.speedKts,
            batteryPct: 100,
            batteryLifeMinutes: model.batteryLifeMinutes,
            batteryMinutesRemaining: model.batteryLifeMinutes,
            homePosition: hub.position,
            lastUpdate: Date.now(),
            waypoints: [],
            returnMinutesRequired: 0,
            emergencyReserveMinutes: 0,
            swarmEnabled: swarmEnabledGlobal,
            avoidanceOverride: false,
        };
        const returnMinutesRequired = computeReturnMinutes(newDrone);
        const emergencyReserveMinutes = computeEmergencyReserve(newDrone);
        const hydrated = {...newDrone, returnMinutesRequired, emergencyReserveMinutes};
        batteryWarningStateRef.current[hydrated.id] = {thresholds: new Set(), emergency: false};
        setDrones((prev) => [...prev, hydrated]);
        select([hydrated.id]);
        setMessage(`Spawned ${model.label.split(" (")[0]} as ${hydrated.callsign} at ${spawn.label}`);
    }, [clampToBounds, computeEmergencyReserve, computeReturnMinutes, drones.length, hub.position, seed, select, selectedDroneModelId, selectedSpawnPointId, setMessage, spawnPoints, swarmEnabledGlobal]);

    const applyPresetDroneSet = useCallback((presetId: string) => {
        const preset = getPresetById(presetId);
        if (!preset?.droneSet) return;

        const flattenedModelIds = preset.droneSet.entries.flatMap((entry) =>
            Array.from({length: Math.max(0, Math.round(entry.count))}, () => entry.modelId),
        );
        if (flattenedModelIds.length === 0) {
            resetDrones();
            return;
        }

        const center = hub.position;
        const nextDrones: DroneState[] = flattenedModelIds.map((modelId, idx) => {
            const model = droneModels.find((m) => m.id === modelId) ?? droneModels[0];
            const ring = Math.floor(idx / 10);
            const radius = 60 + ring * 45;
            const angle = (idx % 10) / 10 * Math.PI * 2;
            const position = clampToBounds({
                x: center.x + Math.cos(angle) * radius,
                y: center.y + Math.sin(angle) * radius,
            });

            const base: DroneState = {
                id: createDroneId(seed),
                callsign: `DR-${(idx + 1).toString().padStart(2, "0")}`,
                position,
                headingDeg: (angle * 180) / Math.PI,
                status: "idle",
                speedKts: model.speedKts,
                batteryPct: 100,
                batteryLifeMinutes: model.batteryLifeMinutes,
                batteryMinutesRemaining: model.batteryLifeMinutes,
                homePosition: center,
                lastUpdate: Date.now(),
                waypoints: [],
                returnMinutesRequired: 0,
                emergencyReserveMinutes: 0,
                swarmEnabled: swarmEnabledGlobal,
                avoidanceOverride: false,
            };

            return {
                ...base,
                returnMinutesRequired: computeReturnMinutes(base),
                emergencyReserveMinutes: computeEmergencyReserve(base),
            };
        });

        const warningState: Record<string, { thresholds: Set<number>; emergency: boolean }> = {};
        nextDrones.forEach((drone) => {
            warningState[drone.id] = {thresholds: new Set(), emergency: false};
        });

        batteryWarningStateRef.current = warningState;
        setDrones(nextDrones);
        clear();
        select([nextDrones[0].id]);

        const firstModelId = preset.droneSet.entries[0]?.modelId;
        if (firstModelId && droneModels.some((m) => m.id === firstModelId)) {
            setSelectedDroneModelId(firstModelId);
        }

        setMessage(`Prepared ${nextDrones.length} drones for preset ${preset.label}`);
    }, [clampToBounds, clear, computeEmergencyReserve, computeReturnMinutes, hub.position, resetDrones, seed, select, setMessage, swarmEnabledGlobal]);

    const finalizeMission = useCallback((input: {
        metrics: MissionMetricsSession;
        endedAt?: number;
        endReason?: MissionEndReason
    }) => {
        setPostMission({
            missionEndedAt: input.endedAt ?? Date.now(),
            endReason: input.endReason ?? "manual-end",
            metricsSnapshot: input.metrics,
            nasaTlxOptIn: null,
            nasaTlxAssessment: undefined,
        });
    }, []);

    const setNasaTlxOptIn = useCallback((value: boolean) => {
        setPostMission((prev) => ({...prev, nasaTlxOptIn: value}));
    }, []);

    const submitNasaTlxResponses = useCallback((input: {
        responses: NasaTlxResponses;
        pairwiseSelections: NasaTlxPairwiseSelection[];
    }) => {
        const completedAt = Date.now();
        const pairwiseSelections = normalizePairwiseSelections(input.pairwiseSelections);
        const weighted = calculateWeightedNasaTlx(input.responses, pairwiseSelections);
        setPostMission((prev) => ({
            ...prev,
            nasaTlxOptIn: true,
            nasaTlxAssessment: {
                completedAt,
                mode: "weighted",
                responses: input.responses,
                pairwiseSelections,
                result: weighted,
            },
        }));
    }, []);

    const clearPostMission = useCallback(() => {
        setPostMission({...initialPostMissionState});
    }, []);

    const value = useMemo<MissionContextValue>(() => ({
        phase, setPhase,
        scenario: scenarioHook,
        drones, setDrones,
        selectedDroneIds,
        droneSelection,
        spawnPoints, hub,
        selectedSpawnPointId, setSelectedSpawnPointId,
        selectedDroneModelId, setSelectedDroneModelId,
        handleSpawnDrone, applyPresetDroneSet,
        sensorSettings, setSensorSettings,
        sensorsEnabled, setSensorsEnabled,
        showSensorRanges, setShowSensorRanges,
        handleSensorSettingChange,
        voronoiEnabled, setVoronoiEnabled,
        voronoiCells, setVoronoiCells,
        coveragePlans, setCoveragePlans,
        coverageActive, setCoverageActive,
        coverageOverlap, setCoverageOverlap,
        detectionLog, setDetectionLog, appendLog,
        alerts, setAlerts, appendAlerts,
        acknowledgeAlert, acknowledgeAllAlerts,
        alertAudioEnabled, setAlertAudioEnabled,
        unacknowledgedAlertCount,
        manualInterventionEnabled, setManualInterventionEnabled,
        fogOfWarEnabled, setFogOfWarEnabled,
        commsConfig, setCommsConfig,
        environmentOverrides, setEnvironmentOverrides,
        conditions,
        postMission, finalizeMission, setNasaTlxOptIn, submitNasaTlxResponses, clearPostMission,
        swarmEnabledGlobal, swarmParamsRef, batteryWarningStateRef,
        clampToBounds, computeReturnMinutes, computeEmergencyReserve, detectionProbability,
        resetDrones,
    }), [
        phase, setPhase,
        scenarioHook,
        drones, setDrones,
        selectedDroneIds,
        droneSelection,
        spawnPoints, hub,
        selectedSpawnPointId, setSelectedSpawnPointId,
        selectedDroneModelId, setSelectedDroneModelId,
        handleSpawnDrone, applyPresetDroneSet,
        sensorSettings, setSensorSettings,
        sensorsEnabled, setSensorsEnabled,
        showSensorRanges, setShowSensorRanges,
        handleSensorSettingChange,
        voronoiEnabled, setVoronoiEnabled,
        voronoiCells, setVoronoiCells,
        coveragePlans, setCoveragePlans,
        coverageActive, setCoverageActive,
        coverageOverlap, setCoverageOverlap,
        detectionLog, setDetectionLog, appendLog,
        alerts, setAlerts, appendAlerts,
        acknowledgeAlert, acknowledgeAllAlerts,
        alertAudioEnabled, setAlertAudioEnabled,
        unacknowledgedAlertCount,
        manualInterventionEnabled, setManualInterventionEnabled,
        fogOfWarEnabled, setFogOfWarEnabled,
        commsConfig, setCommsConfig,
        environmentOverrides, setEnvironmentOverrides,
        conditions,
        postMission, finalizeMission, setNasaTlxOptIn, submitNasaTlxResponses, clearPostMission,
        swarmEnabledGlobal, swarmParamsRef, batteryWarningStateRef,
        clampToBounds, computeReturnMinutes, computeEmergencyReserve, detectionProbability,
        resetDrones,
    ]);

    return <MissionContext.Provider value={value}>{children}</MissionContext.Provider>;
}

