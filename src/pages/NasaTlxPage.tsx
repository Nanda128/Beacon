import {useMemo, useState} from "react";
import {Navigate, useNavigate} from "react-router-dom";
import {AppShell} from "../components/layout/AppShell";
import {PageTransition} from "../components/layout/PageTransition";
import {useMission} from "../context/MissionContext";
import {
    createDefaultNasaTlxResponses,
    createDefaultPairwiseSelections,
    nasaTlxDimensions,
    nasaTlxPairwiseComparisons,
    normalizeNasaTlxResponses,
    normalizePairwiseSelections,
} from "../domain/metrics/tlx";
import type {NasaTlxPairwiseSelection, NasaTlxResponses} from "../domain/types/tlx";

export default function NasaTlxPage() {
    const navigate = useNavigate();
    const {postMission, submitNasaTlxResponses, setNasaTlxOptIn, setPhase} = useMission();

    const [responses, setResponses] = useState<NasaTlxResponses>(() =>
        normalizeNasaTlxResponses(postMission.nasaTlxAssessment?.responses ?? createDefaultNasaTlxResponses()),
    );

    const [pairwiseSelections, setPairwiseSelections] = useState<NasaTlxPairwiseSelection[]>(() =>
        normalizePairwiseSelections(postMission.nasaTlxAssessment?.pairwiseSelections ?? createDefaultPairwiseSelections()),
    );

    const selectedPairIds = useMemo(() => new Set(pairwiseSelections.map((selection) => selection.pairId)), [pairwiseSelections]);
    const pairwiseComplete = selectedPairIds.size === nasaTlxPairwiseComparisons.length;

    const workloadPreview = useMemo(() => {
        const values = Object.values(responses);
        return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10;
    }, [responses]);

    if (!postMission.metricsSnapshot) {
        return <Navigate to="/setup" replace/>;
    }

    return (
        <AppShell subtitle="NASA-TLX Questionnaire">
            <PageTransition>
                <div className="setup-container">
                    <section className="panel-card" aria-labelledby="nasa-tlx-heading">
                        <h1 id="nasa-tlx-heading" className="section-heading">NASA-TLX</h1>
                        <p className="section-description">
                            Rate each workload dimension from 0 (very low) to 100 (very high). Use 5-point steps.
                        </p>

                        <div className="callout" role="status" style={{marginBottom: 16}}>
                            <strong>Current workload rating mean:</strong> {workloadPreview.toFixed(1)} / 100
                        </div>

                        {nasaTlxDimensions.map((dimension) => {
                            const value = responses[dimension.id];
                            return (
                                <div key={dimension.id} style={{marginBottom: 16}}>
                                    <label htmlFor={`tlx-${dimension.id}`} style={{display: "block", marginBottom: 6}}>
                                        <strong>{dimension.label}</strong>
                                        <span className="field-hint" style={{display: "block"}}>{dimension.hint}</span>
                                    </label>
                                    <div style={{display: "flex", alignItems: "center", gap: 12}}>
                                        <input
                                            id={`tlx-${dimension.id}`}
                                            type="range"
                                            min={0}
                                            max={100}
                                            step={5}
                                            value={value}
                                            onChange={(event) => {
                                                const next = Number(event.target.value);
                                                setResponses((prev) => ({
                                                    ...prev,
                                                    [dimension.id]: Number.isFinite(next) ? next : prev[dimension.id],
                                                }));
                                            }}
                                            style={{flex: 1}}
                                        />
                                        <output
                                            style={{minWidth: 42, textAlign: "right", fontWeight: 700}}>{value}</output>
                                    </div>
                                </div>
                            );
                        })}

                        <section style={{marginTop: 18}} aria-labelledby="tlx-pairwise-heading">
                            <h2 id="tlx-pairwise-heading" className="section-heading" style={{fontSize: "1rem"}}>
                                Pairwise weighting comparisons
                            </h2>
                            <p className="section-description" style={{marginBottom: 10}}>
                                For each pair, choose which factor contributed more to workload.
                            </p>
                            <div className="callout" role="status" style={{marginBottom: 12}}>
                                <strong>Completed:</strong> {selectedPairIds.size}/{nasaTlxPairwiseComparisons.length}
                            </div>

                            {nasaTlxPairwiseComparisons.map((pair) => {
                                const existing = pairwiseSelections.find((selection) => selection.pairId === pair.id)?.selected;
                                const leftLabel = nasaTlxDimensions.find((dimension) => dimension.id === pair.left)?.label ?? pair.left;
                                const rightLabel = nasaTlxDimensions.find((dimension) => dimension.id === pair.right)?.label ?? pair.right;
                                return (
                                    <div key={pair.id} className="metrics-definition-card" style={{marginBottom: 10}}>
                                        <div className="metrics-definition-head">
                                            <strong>{leftLabel} vs {rightLabel}</strong>
                                            <span>{existing ? "Selected" : "Pending"}</span>
                                        </div>
                                        <div className="landing-actions" style={{marginTop: 8}}>
                                            <button
                                                className={`btn btn-sm ${existing === pair.left ? "" : "ghost"}`}
                                                onClick={() => {
                                                    setPairwiseSelections((prev) => {
                                                        const filtered = prev.filter((selection) => selection.pairId !== pair.id);
                                                        return [...filtered, {pairId: pair.id, selected: pair.left}];
                                                    });
                                                }}
                                            >
                                                {leftLabel}
                                            </button>
                                            <button
                                                className={`btn btn-sm ${existing === pair.right ? "" : "ghost"}`}
                                                onClick={() => {
                                                    setPairwiseSelections((prev) => {
                                                        const filtered = prev.filter((selection) => selection.pairId !== pair.id);
                                                        return [...filtered, {pairId: pair.id, selected: pair.right}];
                                                    });
                                                }}
                                            >
                                                {rightLabel}
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </section>

                        <div className="landing-actions" style={{marginTop: 20}}>
                            <button
                                className="btn"
                                disabled={!pairwiseComplete}
                                onClick={() => {
                                    submitNasaTlxResponses({
                                        responses: normalizeNasaTlxResponses(responses),
                                        pairwiseSelections,
                                    });
                                    setPhase("debrief");
                                    navigate("/results");
                                }}
                            >
                                Submit questionnaire
                            </button>
                            <button
                                className="btn ghost"
                                onClick={() => {
                                    setNasaTlxOptIn(false);
                                    setPhase("debrief");
                                    navigate("/results");
                                }}
                            >
                                Skip questionnaire
                            </button>
                        </div>
                        {!pairwiseComplete && (
                            <div className="field-hint" style={{marginTop: 8}}>
                                Complete all pairwise comparisons to submit weighted NASA-TLX.
                            </div>
                        )}
                    </section>
                </div>
            </PageTransition>
        </AppShell>
    );
}



