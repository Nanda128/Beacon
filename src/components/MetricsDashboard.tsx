import {useMemo} from "react";
import type {MissionMetricsSession, MissionMetricsTimelineSample} from "../domain/types/metrics";

type MetricsDashboardProps = {
    metrics: MissionMetricsSession;
    onExportJSON: () => void;
    onExportSummaryCSV: () => void;
    onExportTimelineCSV: () => void;
    onExportEventsCSV: () => void;
};

const formatDuration = (ms?: number) => {
    if (ms == null || !Number.isFinite(ms)) return "—";
    if (ms < 1000) return `${Math.round(ms)} ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)} s`;
    return `${(ms / 60000).toFixed(1)} min`;
};

const formatPercent = (value: number, digits = 0) => `${value.toFixed(digits)}%`;
const formatPerMinute = (value: number) => `${value.toFixed(1)}/min`;
const formatMs = (value: number) => `${Math.round(value)} ms`;

function MiniSeriesChart({
                             title,
                             color,
                             samples,
                             accessor,
                             latestLabel,
                         }: {
    title: string;
    color: string;
    samples: MissionMetricsTimelineSample[];
    accessor: (sample: MissionMetricsTimelineSample) => number;
    latestLabel: string;
}) {
    const chart = useMemo(() => {
        const points = samples.slice(-32);
        const width = 260;
        const height = 86;
        const padding = 10;
        const baselineValue = 0;
        if (points.length === 0) return {path: "", areaPath: "", latest: baselineValue, baselineValue};

        const values = [baselineValue, ...points.map(accessor)];
        const maxValue = Math.max(...values, 1);
        const range = Math.max(1, maxValue - baselineValue);
        const coords = values.map((value, index) => {
            const x = padding + (index / Math.max(1, values.length - 1)) * (width - padding * 2);
            const normalized = (value - baselineValue) / range;
            const y = height - padding - normalized * (height - padding * 2);
            return {x, y};
        });
        const line = coords.map((coord, index) => `${index === 0 ? "M" : "L"}${coord.x},${coord.y}`).join(" ");
        const area = `${line} L${coords[coords.length - 1].x},${height - padding} L${coords[0].x},${height - padding} Z`;
        return {path: line, areaPath: area, latest: values[values.length - 1] ?? baselineValue, baselineValue};
    }, [accessor, samples]);

    const gradientId = `${title.replace(/\s+/g, "-")}-gradient`;

    return (
        <div className="metrics-chart-card">
            <div className="metrics-chart-head">
                <span>{title}</span>
                <strong>{latestLabel}</strong>
            </div>
            <svg className="metrics-chart" viewBox="0 0 260 86" role="img" aria-label={`${title} trend`}>
                <defs>
                    <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={color} stopOpacity="0.35"/>
                        <stop offset="100%" stopColor={color} stopOpacity="0"/>
                    </linearGradient>
                </defs>
                <line x1="10" y1="76" x2="250" y2="76" className="metrics-chart-axis"/>
                {chart.areaPath && <path d={chart.areaPath} fill={`url(#${gradientId})`}/>}
                {chart.path && <path d={chart.path} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round"
                                     strokeLinecap="round"/>}
            </svg>
            <div className="metrics-chart-foot">
                <span>{chart.baselineValue.toFixed(0)}</span>
                <span>Baseline</span>
                <span>{chart.latest.toFixed(0)}</span>
            </div>
        </div>
    );
}

export default function MetricsDashboard({
                                             metrics,
                                             onExportJSON,
                                             onExportSummaryCSV,
                                             onExportTimelineCSV,
                                             onExportEventsCSV,
                                         }: MetricsDashboardProps) {
    const {summary, timeline, metricCatalog, events} = metrics;

    return (
        <div className="panel-card metrics-dashboard" aria-labelledby="metrics-dashboard-heading">
            <div className="metrics-toolbar">
                <div>
                    <div className="badge" id="metrics-dashboard-heading">
                        <span className="badge-dot" aria-hidden="true"/> Operational Metrics
                    </div>
                    <div className="metrics-subtitle">
                        Objective metrics to pair with NASA-TLX and evaluate anomaly-finding effectiveness versus
                        operator stress.
                    </div>
                </div>
                <div className="metrics-export-row">
                    <button className="btn ghost btn-sm" onClick={onExportJSON}>Export JSON</button>
                    <button className="btn ghost btn-sm" onClick={onExportSummaryCSV}>Summary CSV</button>
                    <button className="btn ghost btn-sm" onClick={onExportTimelineCSV}>Timeline CSV</button>
                    <button className="btn ghost btn-sm" onClick={onExportEventsCSV}>Events CSV</button>
                </div>
            </div>

            <div className="metrics-summary-grid">
                <div className="metric-card emphasis">
                    <div className="metric-label">Detection rate</div>
                    <div className="metric-value">{formatPercent(summary.anomaliesDetectedPct)}</div>
                    <div className="metric-hint">
                        {summary.anomaliesDetected}/{summary.totalRealAnomalies} real anomalies found
                        · first find {formatDuration(summary.timeToFirstDetectionMs)}
                    </div>
                </div>
                <div className="metric-card">
                    <div className="metric-label">Time to first detection</div>
                    <div className="metric-value">{formatDuration(summary.timeToFirstDetectionMs)}</div>
                    <div className="metric-hint">Time from mission start to first real anomaly detection.</div>
                </div>
                <div className="metric-card">
                    <div className="metric-label">Coverage</div>
                    <div className="metric-value">{formatPercent(summary.coveragePct)}</div>
                    <div className="metric-hint">{summary.areaCoveredSqKm.toFixed(2)} km² scanned
                        · {summary.avgCoverageVisitsPerVisitedCell.toFixed(1)} passes/cell
                    </div>
                </div>
                <div className="metric-card">
                    <div className="metric-label">Alerts per minute</div>
                    <div className="metric-value">{formatPerMinute(summary.alertBurdenPerMin)}</div>
                    <div className="metric-hint">{summary.alertCount} total alerts ·
                        peak {summary.peakUnacknowledgedAlerts} unacknowledged
                    </div>
                </div>
                <div className="metric-card">
                    <div className="metric-label">Comms uptime</div>
                    <div className="metric-value">{formatPercent(summary.commsConnectedPct)}</div>
                    <div className="metric-hint">Drop {formatPercent(summary.packetDropPct, 1)} ·
                        queue {summary.avgQueueDepth.toFixed(1)} · latency {formatMs(summary.avgLatencyMs)}</div>
                </div>
                <div className="metric-card">
                    <div className="metric-label">False contacts</div>
                    <div className="metric-value">{summary.falsePositiveCount + summary.falseNegativeCount}</div>
                    <div className="metric-hint">FP {summary.falsePositiveCount} · FN {summary.falseNegativeCount} ·
                        certainty {formatPercent(summary.avgScanCertaintyPct)}</div>
                </div>
            </div>

            <div className="metrics-chart-grid">
                <MiniSeriesChart
                    title="Coverage"
                                color={'var(--color-success)'}
                    samples={timeline}
                    accessor={(sample) => sample.coveragePct}
                    latestLabel={formatPercent(summary.coveragePct)}
                />
                <MiniSeriesChart
                    title="Detection rate"
                                color={'var(--color-primary)'}
                    samples={timeline}
                    accessor={(sample) => sample.detectedPct}
                    latestLabel={formatPercent(summary.anomaliesDetectedPct)}
                />
                <MiniSeriesChart
                    title="Alerts per minute"
                                color={'var(--color-warning)'}
                    samples={timeline}
                    accessor={(sample) => sample.alertBurdenPerMin}
                    latestLabel={formatPerMinute(summary.alertBurdenPerMin)}
                />
                <MiniSeriesChart
                    title="Comms uptime"
                                color={'var(--color-primary-hover)'}
                    samples={timeline}
                    accessor={(sample) => sample.connectedPct}
                    latestLabel={formatPercent(summary.commsConnectedPct)}
                />
            </div>

            <div className="metrics-lower-grid">
                <div>
                    <div className="metrics-section-heading">Tracked metric set</div>
                    <div className="metrics-definition-grid">
                        {metricCatalog.map((metric) => (
                            <div key={metric.id} className="metrics-definition-card">
                                <div className="metrics-definition-head">
                                    <strong>{metric.label}</strong>
                                    <span>{metric.unit}</span>
                                </div>
                                <div className="metrics-definition-objective">{metric.objective}</div>
                                <div className="metrics-definition-rationale">{metric.rationale}</div>
                                <div className="metrics-definition-calc-label">How its calculated</div>
                                <div className="metrics-definition-calc">{metric.calculation}</div>
                            </div>
                        ))}
                    </div>
                </div>

                <div>
                    <div className="metrics-section-heading">Recent mission markers</div>
                    <div className="metrics-event-list" role="log" aria-live="polite">
                        {events.length === 0 && <div className="log-empty">No metric events yet.</div>}
                        {events.slice(0, 8).map((event) => (
                            <div key={event.id} className="metrics-event-item">
                                <div className="metrics-event-top">
                                    <strong>{event.type}</strong>
                                    <span>{new Date(event.timestamp).toLocaleTimeString()}</span>
                                </div>
                                <div>{event.label}</div>
                                <div className="metrics-event-meta">
                                    {event.droneId ? `Drone ${event.droneId}` : "Mission-level"}
                                    {event.value !== undefined ? ` · ${event.value}` : ""}
                                    {event.severity ? ` · ${event.severity}` : ""}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}

