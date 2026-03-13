import type {DetectionLogEntry} from "./environment";

export type CommsConfig = {
    enabled: boolean;
    baseLatencyMs: number;
    maxLatencyMs: number;
    basePacketLossPct: number;
    maxPacketLossPct: number;
    degradationStartMeters: number;
    degradationFullMeters: number;
    intermittentCycleSec: number;
    intermittentDepth: number;
};

export type CommsState = {
    signalQuality: number;
    latencyMs: number;
    packetLossRate: number;
    connected: boolean;
    distanceFromHub: number;
    queueDepth: number;
    offlineBufferSize: number;
};

export type BufferedAnomalyUpdate = {
    anomalyId: string;
    totalCertaintyGain: number;
    detected: boolean;
};

export type OfflineBuffer = {
    events: DetectionLogEntry[];
    anomalyUpdates: Record<string, BufferedAnomalyUpdate>;
};

export type QueuedMessage<T = unknown> = {
    id: string;
    payload: T;
    enqueuedAt: number;
    scheduledDeliveryTime: number;
    droneId: string;
};

