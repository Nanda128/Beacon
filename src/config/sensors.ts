import type {SensorConfig} from "../domain/types/environment";

export const defaultSensorConfig: SensorConfig = {
    rangeMeters: 450,
    optimalDetectionProbability: 0.9,
    edgeDetectionProbability: 0.25,
    falsePositiveRatePerMinute: 0.08,
    checkIntervalMs: 600,
    logLimit: 150,
};

