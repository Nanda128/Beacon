import {Navigate, useNavigate} from "react-router-dom";
import {useEffect} from "react";
import {AppShell} from "../components/layout/AppShell";
import {PageTransition} from "../components/layout/PageTransition";
import MetricsDashboard from "../components/MetricsDashboard";
import {useMission} from "../context/MissionContext";
import {
    downloadCombinedDebriefCSV,
    downloadCombinedDebriefJSON,
    downloadMissionMetricsEventsCSV,
    downloadMissionMetricsJSON,
    downloadMissionMetricsSummaryCSV,
    downloadMissionMetricsTimelineCSV,
} from "../utils/metricsExport";
import {saveDebrief} from "../utils/debriefStorage";

const tlxBandLabel: Record<string, string> = {
    low: "Low",
    moderate: "Moderate",
    high: "High",
    "very-high": "Very High",
};

export default function ResultsPage() {
    const navigate = useNavigate();
    const {postMission, clearPostMission, setNasaTlxOptIn, setPhase} = useMission();

    if (!postMission.metricsSnapshot) {
        return <Navigate to="/setup" replace/>;
    }

    const {metricsSnapshot, nasaTlxAssessment} = postMission;

    useEffect(() => {
        if (metricsSnapshot) {
            saveDebrief(metricsSnapshot, nasaTlxAssessment);
        }
    }, [metricsSnapshot, nasaTlxAssessment]);

    return (
        <AppShell subtitle="Mission Results">
            <PageTransition>
                <div className="simulation-container">
                    <section className="panel-card" aria-labelledby="results-tlx-heading" style={{marginBottom: 16}}>
                        <h1 id="results-tlx-heading" className="section-heading">NASA-TLX Breakdown</h1>
                        {!nasaTlxAssessment && (
                            <div className="callout warning" role="status">
                                NASA-TLX was skipped. You can still complete it now.
                            </div>
                        )}

                        {nasaTlxAssessment && (
                            <>
                                <div className="metrics-summary-grid" style={{marginTop: 8}}>
                                    <div className="metric-card emphasis">
                                        <div className="metric-label">Weighted workload score</div>
                                        <div
                                            className="metric-value">{nasaTlxAssessment.result.weightedScore.toFixed(1)}</div>
                                        <div className="metric-hint">
                                            Band: {tlxBandLabel[nasaTlxAssessment.result.band] ?? nasaTlxAssessment.result.band}
                                            {" "}· Pairwise {nasaTlxAssessment.result.pairCount}/15
                                        </div>
                                        <div className="metrics-definition-calc-label">How its calculated</div>
                                        <div className="metrics-definition-calc">
                                            Sum of (dimension score x pairwise weight) divided by completed pairwise
                                            comparisons.
                                        </div>
                                    </div>
                                    <div className="metric-card">
                                        <div className="metric-label">Submitted</div>
                                        <div className="metric-value"
                                             style={{fontSize: "1rem"}}>{new Date(nasaTlxAssessment.completedAt).toLocaleString()}</div>
                                        <div className="metric-hint">Classic pairwise-weighted NASA-TLX.</div>
                                    </div>
                                </div>

                                <div className="metrics-definition-grid" style={{marginTop: 12}}>
                                    {nasaTlxAssessment.result.dimensions.map((dimension) => {
                                        const weight = nasaTlxAssessment.result.weights.find((entry) => entry.id === dimension.id)?.weight;
                                        return (
                                            <div key={dimension.id} className="metrics-definition-card">
                                                <div className="metrics-definition-head">
                                                    <strong>{dimension.label}</strong>
                                                    <span>
                                                    {dimension.value}/100
                                                        {weight !== undefined ? ` · weight ${weight}` : ""}
                                                </span>
                                                </div>
                                                <div className="progress-track" aria-label={`${dimension.label} score`}>
                                                    <div className="progress-fill"
                                                         style={{width: `${dimension.value}%`}}/>
                                                </div>
                                                <div className="metrics-definition-calc-label">How its calculated</div>
                                                <div className="metrics-definition-calc">
                                                    Contribution = {dimension.value} x {weight ?? 0} weight points.
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </>
                        )}

                        <div className="landing-actions" style={{marginTop: 14}}>
                            <button
                                className="btn ghost"
                                onClick={() => {
                                    setNasaTlxOptIn(true);
                                    setPhase("debrief");
                                    navigate("/nasa-tlx");
                                }}
                            >
                                {nasaTlxAssessment ? "Retake NASA-TLX" : "Complete NASA-TLX"}
                            </button>
                            <button
                                className="btn ghost"
                                onClick={() => downloadCombinedDebriefJSON(metricsSnapshot, nasaTlxAssessment)}
                            >
                                Download Debrief JSON
                            </button>
                            <button
                                className="btn ghost"
                                onClick={() => downloadCombinedDebriefCSV(metricsSnapshot, nasaTlxAssessment)}
                            >
                                Download Debrief CSV
                            </button>
                            <button
                                className="btn ghost"
                                onClick={() => {
                                    setPhase("debrief");
                                    navigate("/mission-end");
                                }}
                            >
                                Back to debrief choice
                            </button>
                        </div>
                    </section>

                    <MetricsDashboard
                        metrics={metricsSnapshot}
                        onExportJSON={() => downloadMissionMetricsJSON(metricsSnapshot)}
                        onExportSummaryCSV={() => downloadMissionMetricsSummaryCSV(metricsSnapshot)}
                        onExportTimelineCSV={() => downloadMissionMetricsTimelineCSV(metricsSnapshot)}
                        onExportEventsCSV={() => downloadMissionMetricsEventsCSV(metricsSnapshot)}
                    />

                    <section className="panel-card" style={{marginTop: 16}}>
                        <div className="landing-actions">
                            <button
                                className="btn"
                                onClick={() => {
                                    clearPostMission();
                                    navigate("/");
                                }}
                            >
                                Start New Mission
                            </button>
                            <button
                                className="btn ghost"
                                onClick={() => {
                                    clearPostMission();
                                    setPhase("setup");
                                    navigate("/setup");
                                }}
                            >
                                Return to Setup
                            </button>
                        </div>
                    </section>
                </div>
            </PageTransition>
        </AppShell>
    );
}


