import type {Vec2} from "./environment";

export type AlertSeverity = "critical" | "high" | "medium" | "low";

export const severityWeight: Record<AlertSeverity, number> = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
};


export type AlertCategory =
    | "anomaly-detected"
    | "low-battery"
    | "comm-degradation"
    | "drone-malfunction"
    | "area-completion";


export type Alert = {
    id: string;
    timestamp: number;
    severity: AlertSeverity;
    category: AlertCategory;
    droneId?: string;
    droneCallsign?: string;
    anomalyId?: string;
    position: Vec2;
    message: string;
    acknowledged: boolean;
    acknowledgedAt?: number;
};

export function classifyAlert(
    category: AlertCategory,
    context: { batteryPct?: number; isEmergency?: boolean; anomalyType?: string; signalQuality?: number } = {},
): AlertSeverity {
    switch (category) {
        case "low-battery":
            if (context.isEmergency || (context.batteryPct !== undefined && context.batteryPct <= 5))
                return "critical";
            if (context.batteryPct !== undefined && context.batteryPct <= 15)
                return "high";
            return "medium";

        case "drone-malfunction":
            return "critical";

        case "comm-degradation":
            if (context.signalQuality !== undefined && context.signalQuality < 0.1) return "critical";
            if (context.signalQuality !== undefined && context.signalQuality < 0.3) return "high";
            return "medium";

        case "anomaly-detected":
            if (context.anomalyType === "person-in-water") return "critical";
            if (context.anomalyType === "lifeboat") return "high";
            if (context.anomalyType === "false-positive") return "low";
            return "medium";

        case "area-completion":
            return "low";

        default:
            return "medium";
    }
}

