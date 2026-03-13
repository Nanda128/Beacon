/**
 * Pure alert generation from simulation tick state.
 *
 * Implements the four-tier alert classification modelled after the
 * Boeing 757/767 EICAS Crew Alerting System (Boucek et al., 1983,
 * SAE Technical Paper 831488; FAA AC 25-11B §4.5).
 */

import type {Alert, AlertCategory} from "../types/alert";
import {classifyAlert} from "../types/alert";
import type {DroneState} from "../types/drone";
import type {DetectionLogEntry, Vec2} from "../types/environment";
import {alertDeduplicationWindowMs, commDegradationDistanceMeters} from "../../config/alerts";

let alertCounter = 0;

function nextAlertId(prefix: string): string {
    alertCounter += 1;
    return `${prefix}-${Date.now()}-${alertCounter}`;
}

function isDuplicate(
    existing: Alert[],
    category: AlertCategory,
    droneId: string | undefined,
    now: number,
): boolean {
    return existing.some(
        (a) =>
            a.category === category &&
            a.droneId === droneId &&
            now - a.timestamp < alertDeduplicationWindowMs,
    );
}

export type CommAlertBand = "healthy" | "degraded" | "poor" | "critical" | "lost";

export function getCommAlertBand(drone: DroneState, hub: Vec2): CommAlertBand {
    if (drone.status === "landed" || drone.status === "idle") return "healthy";

    if (drone.comms) {
        const quality = drone.comms.signalQuality;
        if (quality < 0.05) return "lost";
        if (quality < 0.1) return "critical";
        if (quality < 0.3) return "poor";
        if (quality < 0.6) return "degraded";
        return "healthy";
    }

    const distFromHub = Math.hypot(
        drone.position.x - hub.x,
        drone.position.y - hub.y,
    );
    return distFromHub > commDegradationDistanceMeters ? "degraded" : "healthy";
}

export function createCommDegradationAlert(drone: DroneState, hub: Vec2, now: number): Alert | null {
    const band = getCommAlertBand(drone, hub);
    if (band === "healthy") return null;

    if (drone.comms) {
        const quality = drone.comms.signalQuality;
        const label = band === "lost" ? "LOST" : band === "critical" ? "CRITICAL" : "DEGRADED";
        return {
            id: nextAlertId("alert-comm"),
            timestamp: now,
            severity: classifyAlert("comm-degradation", {signalQuality: quality}),
            category: "comm-degradation",
            droneId: drone.id,
            droneCallsign: drone.callsign,
            position: drone.position,
            message: `${drone.callsign} comm ${label} — signal ${Math.round(quality * 100)}% · ${Math.round(drone.comms.latencyMs)} ms latency · ${(drone.comms.distanceFromHub / 1000).toFixed(1)} km from hub.`,
            acknowledged: false,
        };
    }

    const distFromHub = Math.hypot(
        drone.position.x - hub.x,
        drone.position.y - hub.y,
    );
    return {
        id: nextAlertId("alert-comm"),
        timestamp: now,
        severity: classifyAlert("comm-degradation"),
        category: "comm-degradation",
        droneId: drone.id,
        droneCallsign: drone.callsign,
        position: drone.position,
        message: `${drone.callsign} comm degraded — ${(distFromHub / 1000).toFixed(1)} km from hub.`,
        acknowledged: false,
    };
}

export type AlertTickInput = {
    drones: DroneState[];
    hub: Vec2;
    existingAlerts: Alert[];
    newLogEntries: DetectionLogEntry[];
    now: number;
};

export function generateAlertsFromTick(input: AlertTickInput): Alert[] {
    const {drones, existingAlerts, newLogEntries, now} = input;
    const alerts: Alert[] = [];

    for (const entry of newLogEntries) {
        if (entry.kind === "detected" && entry.anomalyType && entry.anomalyType !== "false-positive") {
            if (!isDuplicate(existingAlerts, "anomaly-detected", entry.droneId, now)) {
                const severity = classifyAlert("anomaly-detected", {anomalyType: entry.anomalyType});
                alerts.push({
                    id: nextAlertId("alert-anomaly"),
                    timestamp: now,
                    severity,
                    category: "anomaly-detected",
                    droneId: entry.droneId,
                    droneCallsign: entry.droneId,
                    anomalyId: entry.anomalyId,
                    position: entry.position,
                    message: entry.message,
                    acknowledged: false,
                });
            }
        }
    }

    for (const entry of newLogEntries) {
        if (entry.kind === "battery-warning") {
            if (!isDuplicate(existingAlerts, "low-battery", entry.droneId, now)) {
                const severity = classifyAlert("low-battery", {
                    batteryPct: entry.batteryPct,
                    isEmergency: false,
                });
                alerts.push({
                    id: nextAlertId("alert-battery"),
                    timestamp: now,
                    severity,
                    category: "low-battery",
                    droneId: entry.droneId,
                    position: entry.position,
                    message: entry.message,
                    acknowledged: false,
                });
            }
        }
        if (entry.kind === "battery-emergency") {
            if (!isDuplicate(existingAlerts, "low-battery", entry.droneId, now)) {
                const severity = classifyAlert("low-battery", {
                    batteryPct: entry.batteryPct,
                    isEmergency: true,
                });
                alerts.push({
                    id: nextAlertId("alert-battery-crit"),
                    timestamp: now,
                    severity,
                    category: "low-battery",
                    droneId: entry.droneId,
                    position: entry.position,
                    message: entry.message,
                    acknowledged: false,
                });
            }
        }
    }

    for (const drone of drones) {
        if (drone.status === "error") {
            if (!isDuplicate(existingAlerts, "drone-malfunction", drone.id, now)) {
                alerts.push({
                    id: nextAlertId("alert-malfunction"),
                    timestamp: now,
                    severity: classifyAlert("drone-malfunction"),
                    category: "drone-malfunction",
                    droneId: drone.id,
                    droneCallsign: drone.callsign,
                    position: drone.position,
                    message: `${drone.callsign} malfunction — drone in error state.`,
                    acknowledged: false,
                });
            }
        }
    }

    for (const drone of drones) {
        if (
            drone.status === "search" &&
            drone.coveragePlan &&
            drone.waypoints.length === 0 &&
            !drone.targetPosition
        ) {
            if (!isDuplicate(existingAlerts, "area-completion", drone.id, now)) {
                alerts.push({
                    id: nextAlertId("alert-complete"),
                    timestamp: now,
                    severity: classifyAlert("area-completion"),
                    category: "area-completion",
                    droneId: drone.id,
                    droneCallsign: drone.callsign,
                    position: drone.position,
                    message: `${drone.callsign} completed search area coverage.`,
                    acknowledged: false,
                });
            }
        }
    }

    return alerts;
}

