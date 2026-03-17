/**
 * Values derived from Zulkifley et al. (2021): LTE-powered UAV measurements:
 * C2 latency requirement: < 50 ms
 * Measured max latency increase: 94 ms at 170 m height
 * C2 packet error rate requirement: < 0.1%
 *
 * Degradation distances calibrated to typical maritime SAR sector sizes (3–5 km). Starts at 1500 m, full degradation at 4000 m.
 */

import type {CommsConfig} from "../domain/types/comms";

export const defaultCommsConfig: CommsConfig = {
    enabled: false,
    baseLatencyMs: 15,
    maxLatencyMs: 94,
    basePacketLossPct: 0.001,
    maxPacketLossPct: 0.08,
    degradationStartMeters: 1500,
    degradationFullMeters: 4000,
    intermittentCycleSec: 0,
    intermittentDepth: 0.4,
};

export const commsThresholds = {
    reducedSensorQuality: 0.3,
    swarmDisabledQuality: 0.1,
    disconnectedQuality: 0.05,
} as const;

