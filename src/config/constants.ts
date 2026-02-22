import type {AnomalySettings} from "../domain/types/environment";
import type {DroneModel} from "../domain/types/drone";

export const defaultSeed = "BEACON-SEA-001";
export const defaultBoundsKm = {width: 5, height: 5};
export const lastModelStorageKey = "beacon:lastDroneModel";
export const droneHubExclusionRadiusMeters = 150;
export const droneHubReturnReserveMinutes = 5;

export const droneModels: DroneModel[] = [
    {id: "mavic3", label: "DJI Mavic 3 (23 kts)", speedKts: 23, batteryLifeMinutes: 46},
    {id: "mavic3t", label: "DJI Mavic 3T (19 kts)", speedKts: 19, batteryLifeMinutes: 45},
    {id: "phantom4", label: "DJI Phantom 4 (16 kts)", speedKts: 16, batteryLifeMinutes: 30},
    {id: "matrice30", label: "DJI Matrice 30 (23 kts)", speedKts: 23, batteryLifeMinutes: 41},
    {id: "matrice300", label: "DJI Matrice 300 (19 kts)", speedKts: 19, batteryLifeMinutes: 55},
    {id: "anafiusa", label: "Parrot Anafi USA (15 kts)", speedKts: 15, batteryLifeMinutes: 32},
    {id: "skydio2", label: "Skydio 2+ (18 kts)", speedKts: 18, batteryLifeMinutes: 27},
    {id: "wingtraone", label: "WingtraOne (39 kts)", speedKts: 39, batteryLifeMinutes: 59},
    {id: "custom12", label: "Custom Low (12 kts)", speedKts: 12, batteryLifeMinutes: 25},
];

export const randomSeed = () => {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const token = Array.from({length: 5}, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
    return `SEA-${token}`;
};

export const defaultAnomalyConfigOverride: Partial<AnomalySettings> = {};
