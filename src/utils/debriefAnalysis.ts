import type {StoredDebrief} from "./debriefStorage";

export interface DebriefAggregation {
    totalMissions: number;
    avgMissionDurationMin: number;
    avgDetectionRatePct: number;
    avgCoveragePct: number;
    avgCommsUptimePct: number;
    avgOperatorLoadIndex: number;
    avgManualCommandsPerMin: number;
    avgAlertsPerMin: number;
    avgBatterySafetyEvents: number;
    totalFalseContacts: number;
    missionsByScenario: Record<string, number>;
    scenarioPerformance: ScenarioPerformance[];
}

export interface ScenarioPerformance {
    scenarioName: string;
    missionCount: number;
    avgDetectionRatePct: number;
    avgCoveragePct: number;
    avgCommsUptimePct: number;
    avgOperatorLoadIndex: number;
    avgManualCommandsPerMin: number;
    avgAlertsPerMin: number;
    avgBatterySafetyEvents: number;
}

export interface ManagementInsight {
    category: "technology" | "training" | "procedures" | "fleet";
    severity: "low" | "medium" | "high";
    title: string;
    description: string;
    recommendation: string;
    affectedMetric: string;
}

export function aggregateDebriefs(debriefs: StoredDebrief[]): DebriefAggregation {
    if (debriefs.length === 0) {
        return {
            totalMissions: 0,
            avgMissionDurationMin: 0,
            avgDetectionRatePct: 0,
            avgCoveragePct: 0,
            avgCommsUptimePct: 0,
            avgOperatorLoadIndex: 0,
            avgManualCommandsPerMin: 0,
            avgAlertsPerMin: 0,
            avgBatterySafetyEvents: 0,
            totalFalseContacts: 0,
            missionsByScenario: {},
            scenarioPerformance: [],
        };
    }

    let totalDuration = 0;
    let totalDetectionRate = 0;
    let totalCoverage = 0;
    let totalCommsUptime = 0;
    let totalOperatorLoad = 0;
    let totalManualCommandsPerMin = 0;
    let totalAlertsPerMin = 0;
    let totalBatterySafetyEvents = 0;
    let totalFalseContacts = 0;
    let validDebriefCount = 0;

    const scenarioMap = new Map<string, ScenarioPerformance>();

    for (const debrief of debriefs) {
        try {
            const summary = debrief.debrief?.mission?.session?.summary;
            if (!summary) {
                console.warn("Skipping debrief with missing summary:", debrief);
                continue;
            }
            const scenario = debrief.scenarioName;

            totalDuration += summary.missionDurationMs / 1000 / 60;
            totalDetectionRate += summary.anomaliesDetectedPct;
            totalCoverage += summary.coveragePct;
            totalCommsUptime += summary.commsConnectedPct;
            totalOperatorLoad += summary.operatorLoadIndex;
            totalManualCommandsPerMin += summary.manualCommandsPerMin;
            totalAlertsPerMin += summary.alertBurdenPerMin;
            totalBatterySafetyEvents += summary.batteryWarningCount + summary.batteryEmergencyCount;
            totalFalseContacts += summary.falsePositiveCount + summary.falseNegativeCount;
            validDebriefCount++;

            if (!scenarioMap.has(scenario)) {
                scenarioMap.set(scenario, {
                    scenarioName: scenario,
                    missionCount: 0,
                    avgDetectionRatePct: 0,
                    avgCoveragePct: 0,
                    avgCommsUptimePct: 0,
                    avgOperatorLoadIndex: 0,
                    avgManualCommandsPerMin: 0,
                    avgAlertsPerMin: 0,
                    avgBatterySafetyEvents: 0,
                });
            }

            const perf = scenarioMap.get(scenario)!;
            perf.missionCount++;
            perf.avgDetectionRatePct += summary.anomaliesDetectedPct;
            perf.avgCoveragePct += summary.coveragePct;
            perf.avgCommsUptimePct += summary.commsConnectedPct;
            perf.avgOperatorLoadIndex += summary.operatorLoadIndex;
            perf.avgManualCommandsPerMin += summary.manualCommandsPerMin;
            perf.avgAlertsPerMin += summary.alertBurdenPerMin;
            perf.avgBatterySafetyEvents += summary.batteryWarningCount + summary.batteryEmergencyCount;
        } catch (e) {
            console.error("Error processing debrief:", debrief, e);
        }
    }

    const count = validDebriefCount || 1;
    const scenarioPerformance = Array.from(scenarioMap.values()).map((perf) => ({
        ...perf,
        avgDetectionRatePct: perf.avgDetectionRatePct / perf.missionCount,
        avgCoveragePct: perf.avgCoveragePct / perf.missionCount,
        avgCommsUptimePct: perf.avgCommsUptimePct / perf.missionCount,
        avgOperatorLoadIndex: perf.avgOperatorLoadIndex / perf.missionCount,
        avgManualCommandsPerMin: perf.avgManualCommandsPerMin / perf.missionCount,
        avgAlertsPerMin: perf.avgAlertsPerMin / perf.missionCount,
        avgBatterySafetyEvents: perf.avgBatterySafetyEvents / perf.missionCount,
    }));

    const missionsByScenario: Record<string, number> = {};
    scenarioPerformance.forEach((perf) => {
        missionsByScenario[perf.scenarioName] = perf.missionCount;
    });

    return {
        totalMissions: validDebriefCount,
        avgMissionDurationMin: validDebriefCount > 0 ? totalDuration / count : 0,
        avgDetectionRatePct: validDebriefCount > 0 ? totalDetectionRate / count : 0,
        avgCoveragePct: validDebriefCount > 0 ? totalCoverage / count : 0,
        avgCommsUptimePct: validDebriefCount > 0 ? totalCommsUptime / count : 0,
        avgOperatorLoadIndex: validDebriefCount > 0 ? totalOperatorLoad / count : 0,
        avgManualCommandsPerMin: validDebriefCount > 0 ? totalManualCommandsPerMin / count : 0,
        avgAlertsPerMin: validDebriefCount > 0 ? totalAlertsPerMin / count : 0,
        avgBatterySafetyEvents: validDebriefCount > 0 ? totalBatterySafetyEvents / count : 0,
        totalFalseContacts,
        missionsByScenario,
        scenarioPerformance,
    };
}

export function generateInsights(aggregation: DebriefAggregation): ManagementInsight[] {
    const insights: ManagementInsight[] = [];

    if (aggregation.totalMissions === 0) {
        return insights;
    }

    if (aggregation.avgDetectionRatePct < 60) {
        insights.push({
            category: "technology",
            severity: "high",
            title: "Low detection rate",
            description: `Average detection rate is only ${aggregation.avgDetectionRatePct.toFixed(1)}%. Drones are missing real targets.`,
            recommendation: "Consider upgrading sensor technology or increasing drone sensor range in next procurement cycle.",
            affectedMetric: "Detection Rate",
        });
    } else if (aggregation.avgDetectionRatePct < 80) {
        insights.push({
            category: "training",
            severity: "medium",
            title: "Moderate detection performance",
            description: `Average detection rate is ${aggregation.avgDetectionRatePct.toFixed(1)}%. There's room for improvement in detection efficiency.`,
            recommendation: "Conduct additional training on sensor interpretation and optimal search patterns.",
            affectedMetric: "Detection Rate",
        });
    }

    if (aggregation.avgCoveragePct < 50) {
        insights.push({
            category: "procedures",
            severity: "high",
            title: "Insufficient area coverage",
            description: `Only ${aggregation.avgCoveragePct.toFixed(1)}% of sector is being covered. SAR missions require broader area scanning.`,
            recommendation: "Review and optimize coverage planning algorithms. Consider increasing drone fleet size or extending mission duration.",
            affectedMetric: "Coverage",
        });
    }

    if (aggregation.avgCommsUptimePct < 85) {
        insights.push({
            category: "technology",
            severity: "high",
            title: "Poor communication reliability",
            description: `Communications are only up ${aggregation.avgCommsUptimePct.toFixed(1)}% of the time. This is critical for SAR operations.`,
            recommendation: "Upgrade communication equipment or review signal propagation in operational areas. Consider redundant communication systems.",
            affectedMetric: "Comms Uptime",
        });
    }

    if (aggregation.avgOperatorLoadIndex > 70) {
        insights.push({
            category: "training",
            severity: "high",
            title: "Excessive operator workload",
            description: `Average operator load index is ${aggregation.avgOperatorLoadIndex.toFixed(1)}. Operators are significantly stressed.`,
            recommendation: "Implement improved autonomy modes or distribute operations across multiple operators. Provide additional workload management training.",
            affectedMetric: "Operator Load Index",
        });
    } else if (aggregation.avgOperatorLoadIndex > 50) {
        insights.push({
            category: "training",
            severity: "medium",
            title: "Elevated operator workload",
            description: `Average operator load index is ${aggregation.avgOperatorLoadIndex.toFixed(1)}. There's room to improve automation.`,
            recommendation: "Review autonomy settings and consider enabling more automated features for routine operations.",
            affectedMetric: "Operator Load Index",
        });
    }

    if (aggregation.avgManualCommandsPerMin > 2) {
        insights.push({
            category: "procedures",
            severity: "medium",
            title: "High manual intervention rate",
            description: `Operators are issuing ${aggregation.avgManualCommandsPerMin.toFixed(2)} manual commands per minute. Autonomy may need tuning.`,
            recommendation: "Audit swarm autonomy parameters. Consider improving autonomous decision-making or operator training on when intervention is needed.",
            affectedMetric: "Manual Commands",
        });
    }

    if (aggregation.avgAlertsPerMin > 3) {
        insights.push({
            category: "procedures",
            severity: "high",
            title: "Alert fatigue risk",
            description: `Alert rate of ${aggregation.avgAlertsPerMin.toFixed(2)} per minute is excessive. Operators may miss critical alerts.`,
            recommendation: "Implement better alert filtering and deduplication logic. Review alert thresholds and prioritization.",
            affectedMetric: "Alert Burden",
        });
    }

    if (aggregation.avgBatterySafetyEvents > 3) {
        insights.push({
            category: "fleet",
            severity: "high",
            title: "Frequent battery safety incidents",
            description: `Average of ${aggregation.avgBatterySafetyEvents.toFixed(1)} battery safety events per mission. Flight safety risk.`,
            recommendation: "Reduce mission duration or increase drone battery capacity. Implement more aggressive return-to-base thresholds.",
            affectedMetric: "Battery Safety Events",
        });
    }

    if (aggregation.totalFalseContacts > aggregation.totalMissions * 5) {
        insights.push({
            category: "technology",
            severity: "medium",
            title: "High false contact rate",
            description: `${aggregation.totalFalseContacts} false contacts across ${aggregation.totalMissions} missions. Sensor tuning may be needed.`,
            recommendation: "Consider procuring better sensors. Tighten data processing algorithms to reduce false positives and negatives.",
            affectedMetric: "False Contacts",
        });
    }

    return insights.sort((a, b) => {
        const severityOrder = {high: 0, medium: 1, low: 2};
        return severityOrder[a.severity] - severityOrder[b.severity];
    });
}

