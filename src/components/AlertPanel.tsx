import {useMemo, useState} from "react";
import type {Alert, AlertSeverity, AlertCategory} from "../domain/types/alert";
import {severityWeight} from "../domain/types/alert";
import {alertSeverityStyles, alertCategoryLabels} from "../config/alerts";

type AlertPanelProps = {
    alerts: Alert[];
    onAcknowledge: (id: string) => void;
    onAcknowledgeAll: () => void;
};

const severities: AlertSeverity[] = ["critical", "high", "medium", "low"];
const categories: AlertCategory[] = [
    "anomaly-detected",
    "low-battery",
    "comm-degradation",
    "drone-malfunction",
    "area-completion",
];

export default function AlertPanel({alerts, onAcknowledge, onAcknowledgeAll}: AlertPanelProps) {
    const [search, setSearch] = useState("");
    const [severityFilter, setSeverityFilter] = useState<Set<AlertSeverity>>(new Set(severities));
    const [categoryFilter, setCategoryFilter] = useState<Set<AlertCategory>>(new Set(categories));

    const toggleSeverity = (s: AlertSeverity) => {
        setSeverityFilter((prev) => {
            const next = new Set(prev);
            if (next.has(s)) next.delete(s);
            else next.add(s);
            return next;
        });
    };

    const toggleCategory = (c: AlertCategory) => {
        setCategoryFilter((prev) => {
            const next = new Set(prev);
            if (next.has(c)) next.delete(c);
            else next.add(c);
            return next;
        });
    };

    const filtered = useMemo(() => {
        const q = search.toLowerCase().trim();
        return alerts
            .filter((a) => severityFilter.has(a.severity))
            .filter((a) => categoryFilter.has(a.category))
            .filter((a) => {
                if (!q) return true;
                return (
                    a.message.toLowerCase().includes(q) ||
                    (a.droneId?.toLowerCase().includes(q) ?? false) ||
                    (a.droneCallsign?.toLowerCase().includes(q) ?? false) ||
                    a.category.toLowerCase().includes(q)
                );
            })
            .sort((a, b) => {
                if (a.acknowledged !== b.acknowledged) return a.acknowledged ? 1 : -1;
                const sw = severityWeight[a.severity] - severityWeight[b.severity];
                if (sw !== 0) return sw;
                return b.timestamp - a.timestamp;
            });
    }, [alerts, severityFilter, categoryFilter, search]);

    const unackCount = alerts.filter((a) => !a.acknowledged).length;

    return (
        <div className="panel-card alert-panel" aria-labelledby="alert-panel-heading">
            <div className="alert-panel-header" id="alert-panel-heading">
                <div className="badge">
                    <span className="badge-dot" aria-hidden="true"/>
                    Alerts
                    {unackCount > 0 && (
                        <span className="alert-unack-badge" aria-label={`${unackCount} unacknowledged`}>
                            {unackCount}
                        </span>
                    )}
                </div>
                <button
                    className="btn ghost btn-sm"
                    onClick={onAcknowledgeAll}
                    disabled={unackCount === 0}
                    aria-label="Acknowledge all alerts"
                >
                    ACK All
                </button>
            </div>

            <div className="alert-filter-row" role="group" aria-label="Filter by severity">
                {severities.map((s) => {
                    const style = alertSeverityStyles[s];
                    const active = severityFilter.has(s);
                    return (
                        <button
                            key={s}
                            className={`alert-sev-btn${active ? " active" : ""}`}
                            style={{
                                "--sev-color": style.color,
                                "--sev-fill": active ? style.fill : "transparent",
                                "--sev-border": active ? style.border : "var(--color-border-subtle)",
                            } as React.CSSProperties}
                            onClick={() => toggleSeverity(s)}
                            aria-pressed={active}
                            title={style.label}
                        >
                            <span className="alert-sev-dot" style={{background: style.color}} aria-hidden="true"/>
                            {style.label}
                        </button>
                    );
                })}
            </div>

            <div className="alert-filter-row alert-cat-row" role="group" aria-label="Filter by category">
                {categories.map((c) => {
                    const active = categoryFilter.has(c);
                    return (
                        <button
                            key={c}
                            className={`alert-cat-btn${active ? " active" : ""}`}
                            onClick={() => toggleCategory(c)}
                            aria-pressed={active}
                        >
                            {alertCategoryLabels[c]}
                        </button>
                    );
                })}
            </div>

            <div className="alert-search-row">
                <input
                    type="search"
                    className="field-input alert-search"
                    placeholder="Search alerts…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    aria-label="Search alerts"
                />
            </div>

            <div className="alert-scroll" role="log" aria-live="polite" aria-relevant="additions">
                {filtered.length === 0 && (
                    <div className="log-empty">
                        {alerts.length === 0 ? "No alerts yet." : "No alerts match the current filters."}
                    </div>
                )}
                {filtered.map((alert) => {
                    const style = alertSeverityStyles[alert.severity];
                    return (
                        <div
                            key={alert.id}
                            className={`alert-entry${alert.acknowledged ? " acked" : ""}`}
                            style={{"--sev-color": style.color, "--sev-fill": style.fill} as React.CSSProperties}
                        >
                            <div className="alert-entry-sev" style={{background: style.color}} title={style.label}/>
                            <div className="alert-entry-body">
                                <div className="alert-entry-msg">{alert.message}</div>
                                <div className="alert-entry-meta">
                                    {new Date(alert.timestamp).toLocaleTimeString()}
                                    {" · "}
                                    <span style={{color: style.color}}>{style.label}</span>
                                    {" · "}
                                    {alertCategoryLabels[alert.category]}
                                    {alert.droneCallsign && ` · ${alert.droneCallsign}`}
                                </div>
                            </div>
                            {!alert.acknowledged && (
                                <button
                                    className="btn ghost btn-sm alert-ack-btn"
                                    onClick={() => onAcknowledge(alert.id)}
                                    aria-label={`Acknowledge alert: ${alert.message}`}
                                    title="Acknowledge"
                                >
                                    ACK
                                </button>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

