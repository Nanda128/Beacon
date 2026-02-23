import type {Vec2} from "./environment";
import type {CoveragePlan} from "../coverage/planner";

export type DroneStatus = "idle" | "launching" | "enroute" | "search" | "returning" | "landed" | "error";

export type DroneModel = {
    id: string;
    label: string;
    speedKts: number;
    batteryLifeMinutes: number;
};

export type DroneState = {
    id: string;
    callsign: string;
    position: Vec2;
    headingDeg: number;
    status: DroneStatus;
    speedKts: number;
    batteryPct: number;
    batteryLifeMinutes: number;
    batteryMinutesRemaining: number;
    homePosition: Vec2;
    lastUpdate: number;
    targetPosition?: Vec2;
    waypoints: Vec2[];
    coveragePlan?: CoveragePlan;
    returnMinutesRequired: number;
    emergencyReserveMinutes: number;
};

export type SpawnPoint = {
    id: string;
    label: string;
    position: Vec2;
};

let droneIdCounter = 0;

export const createDroneId = (seed?: string) => {
    const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
    droneIdCounter += 1;
    const base = `DRN-${seed ? seed.replace(/[^A-Z0-9]/gi, "").slice(-4).toUpperCase() : ""}${rand}`;
    return `${base}-${droneIdCounter}`;
};
