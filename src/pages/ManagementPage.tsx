import {useCallback, useMemo, useRef, useState, useEffect} from "react";
import {useNavigate} from "react-router-dom";
import {AppShell} from "../components/layout/AppShell";
import {PageTransition} from "../components/layout/PageTransition";
import {
    loadAllDebriefs,
    deleteDebrief,
    importDebriefJSON,
    clearAllDebriefs,
    type StoredDebrief,
} from "../utils/debriefStorage";
import {aggregateDebriefs, generateInsights} from "../utils/debriefAnalysis";
import type {ManagementInsight} from "../utils/debriefAnalysis";
import {buildDashboardSummaryMetrics} from "../utils/dashboardMetrics";

export default function ManagementPage() {
    const navigate = useNavigate();
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        console.log("[ManagementPage] Mounted");
        return () => console.log("[ManagementPage] Unmounted");
    }, []);

    const [debriefs, setDebriefs] = useState<StoredDebrief[]>(() => {
        try {
            console.log("[ManagementPage] Loading debriefs...");
            const loaded = loadAllDebriefs();
            console.log("[ManagementPage] Loaded", loaded.length, "debriefs");
            return loaded;
        } catch (e) {
            const errorMsg = `Failed to load debriefs on mount: ${e instanceof Error ? e.message : String(e)}`;
            console.error("[ManagementPage]", errorMsg, e);
            setError(errorMsg);
            return [];
        }
    });
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [importError, setImportError] = useState<string | null>(null);
    const [selectedDebriefId, setSelectedDebriefId] = useState<string | null>(null);

    const aggregation = useMemo(() => aggregateDebriefs(debriefs), [debriefs]);
    const insights = useMemo(() => generateInsights(aggregation), [aggregation]);

    const handleDeleteDebrief = useCallback((id: string) => {
        if (confirm("Are you sure you want to delete this debrief?")) {
            deleteDebrief(id);
            setDebriefs(loadAllDebriefs());
            if (selectedDebriefId === id) {
                setSelectedDebriefId(null);
            }
        }
    }, [selectedDebriefId]);

    const handleClearAll = useCallback(() => {
        if (confirm("Are you sure you want to delete ALL debriefs? This cannot be undone.")) {
            clearAllDebriefs();
            setDebriefs([]);
            setSelectedDebriefId(null);
        }
    }, []);

    const handleImportClick = () => {
        fileInputRef.current?.click();
    };

    const handleFileChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            const content = e.target?.result as string;
            try {
                const imported = importDebriefJSON(content);
                if (imported) {
                    setImportError(null);
                    setDebriefs(loadAllDebriefs());
                    setSelectedDebriefId(imported.id);
                } else {
                    setImportError("Failed to import debrief. Invalid format.");
                }
            } catch (err) {
                setImportError(`Import error: ${err instanceof Error ? err.message : "Unknown error"}`);
            }
        };
        reader.onerror = () => {
            setImportError("Failed to read file.");
        };
        reader.readAsText(file);
        event.target.value = "";
    }, []);

    const selectedDebrief = debriefs.find((d) => d.id === selectedDebriefId);
    const selectedDebriefDashboardMetrics = useMemo(() => {
        if (!selectedDebrief) return [];
        return selectedDebrief.debrief.mission.dashboardSummary
            ?? buildDashboardSummaryMetrics(selectedDebrief.debrief.mission.session.summary);
    }, [selectedDebrief]);

    const severityColor: Record<ManagementInsight["severity"], string> = {
        high: "var(--color-danger)",
        medium: "var(--color-warning)",
        low: "var(--color-primary)",
    };

    const categoryLabel: Record<ManagementInsight["category"], string> = {
        technology: "Technology",
        training: "Training",
        procedures: "Procedures",
        fleet: "Fleet Management",
    };

    return (
        <AppShell subtitle="Mission Management & Analysis">
            <PageTransition>
                <div className="simulation-container">
                    <section className="panel-card" style={{marginBottom: 16}}>
                        <h1 className="section-heading">Management Dashboard</h1>
                        <p style={{marginTop: 8, color: "var(--color-text-secondary)"}}>
                            Analyze aggregated mission data to identify trends and make informed decisions about
                            technology upgrades,
                            training needs, and operational procedures.
                        </p>

                        {error && (
                            <div className="callout error" style={{marginTop: 12}}>
                                <strong>Error loading management dashboard:</strong> {error}
                            </div>
                        )}

                        <div className="landing-actions" style={{marginTop: 14}}>
                            <button className="btn" onClick={handleImportClick}>
                                Upload Debrief JSON
                            </button>
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept=".json"
                                onChange={handleFileChange}
                                style={{display: "none"}}
                            />
                            <button className="btn ghost" onClick={() => navigate("/")}>
                                Return to Landing
                            </button>
                        </div>

                        {importError && (
                            <div className="callout error" style={{marginTop: 12}}>
                                {importError}
                            </div>
                        )}
                    </section>

                    {debriefs.length > 0 && (
                        <section className="panel-card" style={{marginBottom: 16}}>
                            <h2 className="section-heading" style={{fontSize: "1.1rem"}}>
                                Overall Performance Summary
                            </h2>
                            <div className="metrics-summary-grid" style={{marginTop: 12}}>
                                <div className="metric-card">
                                    <div className="metric-label">Missions analyzed</div>
                                    <div className="metric-value">{aggregation.totalMissions}</div>
                                </div>
                                <div className="metric-card">
                                    <div className="metric-label">Detection rate (avg)</div>
                                    <div className="metric-value">{aggregation.avgDetectionRatePct.toFixed(1)}%</div>
                                </div>
                                <div className="metric-card">
                                    <div className="metric-label">Coverage (avg)</div>
                                    <div className="metric-value">{aggregation.avgCoveragePct.toFixed(1)}%</div>
                                </div>
                                <div className="metric-card">
                                    <div className="metric-label">Comms uptime (avg)</div>
                                    <div className="metric-value">{aggregation.avgCommsUptimePct.toFixed(1)}%</div>
                                </div>
                                <div className="metric-card">
                                    <div className="metric-label">Alerts per minute (avg)</div>
                                    <div className="metric-value">{aggregation.avgAlertsPerMin.toFixed(2)}/min</div>
                                </div>
                                <div className="metric-card">
                                    <div className="metric-label">Manual commands per minute (avg)</div>
                                    <div className="metric-value">{aggregation.avgManualCommandsPerMin.toFixed(2)}/min</div>
                                </div>
                                <div className="metric-card">
                                    <div className="metric-label">Battery safety events (avg)</div>
                                    <div className="metric-value">{aggregation.avgBatterySafetyEvents.toFixed(1)}</div>
                                </div>
                                <div className="metric-card">
                                    <div className="metric-label">False contacts (total)</div>
                                    <div className="metric-value">{aggregation.totalFalseContacts}</div>
                                </div>
                            </div>
                        </section>
                    )}

                    {insights.length > 0 && (
                        <section className="panel-card" style={{marginBottom: 16}}>
                            <h2 className="section-heading" style={{fontSize: "1.1rem"}}>
                                Management Insights & Recommendations
                            </h2>
                            <div style={{marginTop: 12, display: "flex", flexDirection: "column", gap: 12}}>
                                {insights.map((insight, idx) => (
                                    <div
                                        key={idx}
                                        style={{
                                            borderLeft: `4px solid ${severityColor[insight.severity]}`,
                                            padding: "12px",
                                            backgroundColor: "var(--color-bg-inset)",
                                            borderRadius: "4px",
                                        }}
                                    >
                                        <div
                                            style={{
                                                display: "flex",
                                                alignItems: "center",
                                                gap: 8,
                                                marginBottom: 6,
                                            }}
                                        >
                                            <strong style={{fontSize: "1rem"}}>{insight.title}</strong>
                                            <span
                                                style={{
                                                    fontSize: "0.75rem",
                                                    padding: "2px 6px",
                                                    backgroundColor: severityColor[insight.severity],
                                                    color: "var(--color-primary-text)",
                                                    borderRadius: "3px",
                                                    textTransform: "uppercase",
                                                    fontWeight: 600,
                                                }}
                                            >
                                                {insight.severity}
                                            </span>
                                            <span
                                                style={{
                                                    fontSize: "0.75rem",
                                                    padding: "2px 6px",
                                                    backgroundColor: "var(--color-bg-raised)",
                                                    color: "var(--color-text-secondary)",
                                                    borderRadius: "3px",
                                                }}
                                            >
                                                {categoryLabel[insight.category]}
                                            </span>
                                        </div>
                                        <p style={{
                                            fontSize: "0.95rem",
                                            margin: "6px 0",
                                            color: "var(--color-text-secondary)"
                                        }}>
                                            {insight.description}
                                        </p>
                                        <p style={{fontSize: "0.95rem", margin: "6px 0", fontStyle: "italic"}}>
                                            <strong>Recommendation:</strong> {insight.recommendation}
                                        </p>
                                        <p style={{fontSize: "0.85rem", color: "var(--color-text-muted)"}}>
                                            Affected Metric: {insight.affectedMetric}
                                        </p>
                                    </div>
                                ))}
                            </div>
                        </section>
                    )}

                    {aggregation.scenarioPerformance.length > 0 && (
                        <section className="panel-card" style={{marginBottom: 16}}>
                            <h2 className="section-heading" style={{fontSize: "1.1rem"}}>
                                Performance by Scenario
                            </h2>
                            <div style={{marginTop: 12, overflowX: "auto"}}>
                                <table style={{width: "100%", borderCollapse: "collapse", fontSize: "0.95rem"}}>
                                    <thead>
                                    <tr
                                        style={{
                                            borderBottom: "2px solid var(--color-border)",
                                            backgroundColor: "var(--color-bg-inset)",
                                        }}
                                    >
                                        <th style={{padding: "8px", textAlign: "left"}}>Scenario</th>
                                        <th style={{padding: "8px", textAlign: "right"}}>Missions</th>
                                        <th style={{padding: "8px", textAlign: "right"}}>Detect %</th>
                                        <th style={{padding: "8px", textAlign: "right"}}>Coverage %</th>
                                        <th style={{padding: "8px", textAlign: "right"}}>Comms %</th>
                                        <th style={{padding: "8px", textAlign: "right"}}>Operator Load</th>
                                    </tr>
                                    </thead>
                                    <tbody>
                                    {aggregation.scenarioPerformance.map((perf) => (
                                        <tr
                                            key={perf.scenarioName}
                                            style={{
                                                borderBottom: "1px solid var(--color-border)",
                                                backgroundColor: "var(--color-bg-raised)",
                                            }}
                                        >
                                            <td style={{padding: "8px"}}>{perf.scenarioName}</td>
                                            <td style={{padding: "8px", textAlign: "right"}}>{perf.missionCount}</td>
                                            <td style={{padding: "8px", textAlign: "right"}}>
                                                {perf.avgDetectionRatePct.toFixed(1)}%
                                            </td>
                                            <td style={{padding: "8px", textAlign: "right"}}>
                                                {perf.avgCoveragePct.toFixed(1)}%
                                            </td>
                                            <td style={{padding: "8px", textAlign: "right"}}>
                                                {perf.avgCommsUptimePct.toFixed(1)}%
                                            </td>
                                            <td style={{padding: "8px", textAlign: "right"}}>
                                                {perf.avgOperatorLoadIndex.toFixed(1)}
                                            </td>
                                        </tr>
                                    ))}
                                    </tbody>
                                </table>
                            </div>
                        </section>
                    )}

                    <section className="panel-card" style={{marginBottom: 16}}>
                        <div style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            marginBottom: 12
                        }}>
                            <h2 className="section-heading" style={{fontSize: "1.1rem", margin: 0}}>
                                Stored Debriefs ({debriefs.length})
                            </h2>
                            {debriefs.length > 0 && (
                                <button
                                    className="btn ghost"
                                    style={{color: "var(--color-danger)", fontSize: "0.9rem"}}
                                    onClick={handleClearAll}
                                >
                                    Clear All
                                </button>
                            )}
                        </div>

                        {debriefs.length === 0 ? (
                            <div className="callout" style={{marginTop: 12}}>
                                No debriefs stored yet. Complete missions or upload debrief JSONs to get started.
                            </div>
                        ) : (
                            <div style={{marginTop: 12, display: "flex", flexDirection: "column", gap: 8}}>
                                {debriefs.map((debrief) => (
                                    <div
                                        key={debrief.id}
                                        onClick={() => setSelectedDebriefId(debrief.id)}
                                        style={{
                                            padding: "10px 12px",
                                            backgroundColor:
                                                selectedDebriefId === debrief.id
                                                    ? "var(--color-primary)"
                                                    : "var(--color-bg-inset)",
                                            color:
                                                selectedDebriefId === debrief.id
                                                    ? "var(--color-primary-text)"
                                                    : "var(--color-text)",
                                            borderRadius: "4px",
                                            cursor: "pointer",
                                            display: "flex",
                                            justifyContent: "space-between",
                                            alignItems: "center",
                                            transition: "background-color 0.2s",
                                        }}
                                    >
                                        <div style={{flex: 1}}>
                                            <div style={{fontWeight: 600}}>{debrief.label}</div>
                                            <div style={{fontSize: "0.85rem", opacity: 0.8}}>
                                                {debrief.scenarioName} • {new Date(debrief.timestamp).toLocaleString()}
                                            </div>
                                        </div>
                                        <button
                                            className="btn ghost"
                                            style={{
                                                padding: "4px 8px",
                                                fontSize: "0.85rem",
                                                color: selectedDebriefId === debrief.id ? "var(--color-primary-text)" : "var(--color-danger)",
                                            }}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleDeleteDebrief(debrief.id);
                                            }}
                                        >
                                            Delete
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </section>

                    {selectedDebrief && (
                        <section className="panel-card" style={{marginBottom: 16}}>
                            <h2 className="section-heading" style={{fontSize: "1.1rem"}}>
                                Debrief Details: {selectedDebrief.label}
                            </h2>
                            <div style={{marginTop: 12}}>
                                <div className="metrics-summary-grid">
                                    <div className="metric-card">
                                        <div className="metric-label">Mission Duration</div>
                                        <div className="metric-value">
                                            {(selectedDebrief.debrief.mission.session.summary.missionDurationMs / 1000 / 60).toFixed(1)}
                                        </div>
                                        <div className="metric-hint">minutes</div>
                                    </div>
                                    {selectedDebriefDashboardMetrics.map((metric) => (
                                        <div key={metric.id} className="metric-card">
                                            <div className="metric-label">{metric.label}</div>
                                            <div className="metric-value">{metric.displayValue}</div>
                                        </div>
                                    ))}
                                </div>
                                {selectedDebrief.debrief.nasaTlx && (
                                    <div style={{
                                        marginTop: 12,
                                        padding: "12px",
                                        backgroundColor: "var(--color-bg-secondary)",
                                        borderRadius: "4px"
                                    }}>
                                        <div style={{fontSize: "0.95rem", fontWeight: 600}}>NASA-TLX Assessment</div>
                                        <div style={{fontSize: "0.9rem", marginTop: 6}}>
                                            Weighted Score:{" "}
                                            <strong>{selectedDebrief.debrief.nasaTlx.result.weightedScore.toFixed(1)}</strong> ({selectedDebrief.debrief.nasaTlx.result.band})
                                        </div>
                                    </div>
                                )}
                            </div>
                        </section>
                    )}
                </div>
            </PageTransition>
        </AppShell>
    );
}

