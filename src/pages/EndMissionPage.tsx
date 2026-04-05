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

const formatPercent = (value: number) => `${value.toFixed(0)}%`;
const formatPerMinute = (value: number) => `${value.toFixed(1)}/min`;

export default function EndMissionPage() {
    const navigate = useNavigate();
    const {postMission, setPhase} = useMission();

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
                                <div className="metric-label">Detection rate</div>
                                <div className="metric-value">{formatPercent(summary.anomaliesDetectedPct)}</div>
                                <div
                                    className="metric-hint">{summary.anomaliesDetected}/{summary.totalRealAnomalies} real
                                    anomalies found.
                                </div>
                                <div className="metrics-definition-calc-label">How its calculated</div>
                                <div className="metrics-definition-calc">
                                    (Detected real anomalies / total real anomalies) x 100.
                                </div>
                            </div>
                            <div className="metric-card">
                                <div className="metric-label">Duration</div>
                                <div className="metric-value">{formatDuration(summary.missionDurationMs)}</div>
                                <div className="metric-hint">Total mission runtime.</div>
                                <div className="metrics-definition-calc-label">How its calculated</div>
                                <div className="metrics-definition-calc">End timestamp - mission start timestamp.</div>
                            </div>
                            <div className="metric-card">
                                <div className="metric-label">Alerts per minute</div>
                                <div className="metric-value">{formatPerMinute(summary.alertBurdenPerMin)}</div>
                                <div className="metric-hint">{summary.alertCount} total alerts ·
                                    peak {summary.peakUnacknowledgedAlerts} unacknowledged.
                                </div>
                                <div className="metrics-definition-calc-label">How its calculated</div>
                                <div className="metrics-definition-calc">
                                    Total alerts raised / mission duration in minutes.
                                </div>
                            </div>
                        </div>

                        <div className="landing-actions" style={{marginTop: 20}}>
                            <button
                                className="btn"
                                onClick={() => {
                                    setPhase("debrief");
                                    navigate("/nasa-tlx");
                                }}
                            >
                                Complete NASA-TLX
                            </button>
                        </div>
                    </section>
                </div>
            </PageTransition>
        </AppShell>
    );
}


