import type React from "react";
import {createContext, useCallback, useContext, useEffect, useMemo, useRef, useState} from "react";
import type {DetectionLogEntry, SensorConfig, Vec2} from "../domain/types/environment";
import type {DroneState, SpawnPoint} from "../domain/types/drone";
import {useScenario} from "../hooks/useScenario";
import {useDroneSelection} from "../hooks/useDroneSelection";
import {defaultSensorConfig} from "../config/sensors";
import {
    droneModels,
    lastModelStorageKey,
    droneHubReturnReserveMinutes,
    batteryEmergencyBufferMinutes,
} from "../config/constants";
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

export type MissionPhase = "landing" | "setup" | "simulation";

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

    manualInterventionEnabled: boolean;
    setManualInterventionEnabled: (v: boolean) => void;

    fogOfWarEnabled: boolean;
    setFogOfWarEnabled: (v: boolean) => void;

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
    const [manualInterventionEnabled, setManualInterventionEnabled] = useState(false);
    const [fogOfWarEnabled, setFogOfWarEnabled] = useState(false);

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

    const computeReturnMinutes = useCallback((drone: DroneState) => {
        const speedMs = Math.max(0, drone.speedKts) * 0.514444;
        if (speedMs <= 0.0001) return Number.POSITIVE_INFINITY;
        const dx = drone.position.x - drone.homePosition.x;
        const dy = drone.position.y - drone.homePosition.y;
        return Math.hypot(dx, dy) / speedMs / 60;
    }, []);

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
            return next.slice(0, sensorSettings.logLimit);
        });
    }, [sensorSettings.logLimit]);

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

    const value = useMemo<MissionContextValue>(() => ({
        phase, setPhase,
        scenario: scenarioHook,
        drones, setDrones,
        selectedDroneIds,
        droneSelection,
        spawnPoints, hub,
        selectedSpawnPointId, setSelectedSpawnPointId,
        selectedDroneModelId, setSelectedDroneModelId,
        handleSpawnDrone,
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
        manualInterventionEnabled, setManualInterventionEnabled,
        fogOfWarEnabled, setFogOfWarEnabled,
        swarmEnabledGlobal, swarmParamsRef, batteryWarningStateRef,
        clampToBounds, computeReturnMinutes, computeEmergencyReserve, detectionProbability,
        resetDrones,
    }), [
        phase, scenarioHook, drones, selectedDroneIds, droneSelection,
        spawnPoints, hub, selectedSpawnPointId, selectedDroneModelId,
        handleSpawnDrone,
        sensorSettings, sensorsEnabled, showSensorRanges,
        handleSensorSettingChange,
        voronoiEnabled, voronoiCells, coveragePlans, coverageActive, coverageOverlap,
        detectionLog, appendLog,
        manualInterventionEnabled, fogOfWarEnabled,
        swarmEnabledGlobal,
        clampToBounds, computeReturnMinutes, computeEmergencyReserve, detectionProbability,
        resetDrones,
    ]);

    return <MissionContext.Provider value={value}>{children}</MissionContext.Provider>;
}



