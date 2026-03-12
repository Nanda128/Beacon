import type {Vec2} from "../types/environment";
import type {CommsConfig, CommsState, QueuedMessage} from "../types/comms";
import {commsThresholds} from "../../config/comms";

export function computeCommsState(
    dronePos: Vec2,
    hubPos: Vec2,
    config: CommsConfig,
    simTimeMs: number,
    queueDepth: number = 0,
    offlineBufferSize: number = 0,
): CommsState {
    const dist = Math.hypot(dronePos.x - hubPos.x, dronePos.y - hubPos.y);

    let distanceFactor: number;
    if (dist <= config.degradationStartMeters) {
        distanceFactor = 1.0;
    } else if (dist >= config.degradationFullMeters) {
        distanceFactor = 0.0;
    } else {
        const range = config.degradationFullMeters - config.degradationStartMeters;
        distanceFactor = 1.0 - (dist - config.degradationStartMeters) / range;
    }

    let intermittentFactor = 1.0;
    if (config.intermittentCycleSec > 0 && config.intermittentDepth > 0) {
        const cycleMs = config.intermittentCycleSec * 1000;
        const phase = (simTimeMs % cycleMs) / cycleMs;
        // 0 → 1 → 0 → -1 → 0 over one cycle
        const sineValue = Math.sin(phase * Math.PI * 2);
        // map to [1 - depth, 1]
        // at trough, signal drops by `depth`
        intermittentFactor = 1.0 - config.intermittentDepth * (0.5 - 0.5 * sineValue);
    }

    const signalQuality = Math.max(0, Math.min(1, distanceFactor * intermittentFactor));

    const latencyMs = config.baseLatencyMs + (config.maxLatencyMs - config.baseLatencyMs) * (1 - signalQuality);

    const packetLossRate = config.basePacketLossPct + (config.maxPacketLossPct - config.basePacketLossPct) * (1 - signalQuality);

    const connected = signalQuality >= commsThresholds.disconnectedQuality;

    return {
        signalQuality,
        latencyMs,
        packetLossRate,
        connected,
        distanceFromHub: dist,
        queueDepth,
        offlineBufferSize,
    };
}

export function shouldDropPacket(packetLossRate: number, randomValue: number): boolean {
    return randomValue < packetLossRate;
}

export function enqueueMessage<T>(
    queue: QueuedMessage<T>[],
    id: string,
    payload: T,
    latencyMs: number,
    now: number,
    droneId: string,
): QueuedMessage<T>[] {
    return [
        ...queue,
        {
            id,
            payload,
            enqueuedAt: now,
            scheduledDeliveryTime: now + latencyMs,
            droneId,
        },
    ];
}

export function drainQueue<T>(
    queue: QueuedMessage<T>[],
    now: number,
): { delivered: QueuedMessage<T>[]; remaining: QueuedMessage<T>[] } {
    const delivered: QueuedMessage<T>[] = [];
    const remaining: QueuedMessage<T>[] = [];

    for (const msg of queue) {
        if (now >= msg.scheduledDeliveryTime) {
            delivered.push(msg);
        } else {
            remaining.push(msg);
        }
    }

    return {delivered, remaining};
}

export function signalQualityColor(quality: number): string {
    if (quality >= 0.6) return "#22c55e";     // green is ok
    if (quality >= 0.3) return "#f59e0b";     // amber is caution
    return "#ef4444";                         // red is critical
}

export function signalQualityLabel(quality: number): string {
    if (quality >= 0.8) return "Excellent";
    if (quality >= 0.6) return "Good";
    if (quality >= 0.3) return "Degraded";
    if (quality >= 0.1) return "Poor";
    if (quality >= 0.05) return "Critical";
    return "Lost";
}

export function signalBars(quality: number): number {
    if (quality >= 0.75) return 4;
    if (quality >= 0.5) return 3;
    if (quality >= 0.25) return 2;
    if (quality >= 0.05) return 1;
    return 0;
}

