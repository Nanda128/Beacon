import {useNavigate, Navigate} from "react-router-dom";
import {AppShell} from "../components/layout/AppShell";
import {PageTransition} from "../components/layout/PageTransition";
import {useMission} from "../context/MissionContext";

const formatDuration = (ms: number) => {
    if (!Number.isFinite(ms) || ms <= 0) return "0 min";
    const totalSeconds = Math.round(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}m ${seconds.toString().padStart(2, "0")}s`;
};

export default function EndMissionPage() {
    const navigate = useNavigate();
    const {postMission, setNasaTlxOptIn, setPhase} = useMission();

    if (!postMission.metricsSnapshot) {
        return <Navigate to="/setup" replace/>;
    }

    const {summary} = postMission.metricsSnapshot;

    return (
        <AppShell subtitle="Mission Debrief">
            <PageTransition>
                <div className="setup-container">
                    <section className="panel-card" aria-labelledby="mission-ended-heading">
                        <h1 id="mission-ended-heading" className="section-heading">Mission ended</h1>
                        <p className="section-description">
                            Capture subjective workload next so you can compare NASA-TLX against objective mission
                            metrics.
                        </p>

                        <div className="metrics-summary-grid" style={{marginTop: 16}}>
                            <div className="metric-card emphasis">
                                <div className="metric-label">Mission success</div>
                                <div className="metric-value">{summary.missionSuccessIndex}</div>
                                <div className="metric-hint">Composite mission effectiveness score.</div>
                            </div>
                            <div className="metric-card">
                                <div className="metric-label">Duration</div>
                                <div className="metric-value">{formatDuration(summary.missionDurationMs)}</div>
                                <div className="metric-hint">Total mission runtime.</div>
                            </div>
                            <div className="metric-card">
                                <div className="metric-label">Weighted detection</div>
                                <div className="metric-value">{summary.weightedDetectionPct.toFixed(0)}%</div>
                                <div
                                    className="metric-hint">{summary.anomaliesDetected}/{summary.totalRealAnomalies} real
                                    anomalies found.
                                </div>
                            </div>
                        </div>

                        <div className="landing-actions" style={{marginTop: 20}}>
                            <button
                                className="btn"
                                onClick={() => {
                                    setNasaTlxOptIn(true);
                                    setPhase("debrief");
                                    navigate("/nasa-tlx");
                                }}
                            >
                                Complete NASA-TLX
                            </button>
                            <button
                                className="btn ghost"
                                onClick={() => {
                                    setNasaTlxOptIn(false);
                                    setPhase("debrief");
                                    navigate("/results");
                                }}
                            >
                                Skip for now
                            </button>
                        </div>
                    </section>
                </div>
            </PageTransition>
        </AppShell>
    );
}


