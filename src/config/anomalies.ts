import type {AnomalyType} from "../domain/types/environment";

export const anomalyStyles: Record<AnomalyType, {
    color: string;
    fill: string;
    size: number;
    shape: "circle" | "square" | "triangle";
}> = {
    "person-in-water": {color: "#f97316", fill: "rgba(249,115,22,0.8)", size: 7, shape: "circle"},
    "lifeboat": {color: "#22c55e", fill: "rgba(34,197,94,0.8)", size: 9, shape: "square"},
    "debris-field": {color: "#a855f7", fill: "rgba(168,85,247,0.8)", size: 8, shape: "triangle"},
    "false-positive": {color: "#94a3b8", fill: "rgba(148,163,184,0.8)", size: 6, shape: "circle"},
};

export {anomalyTypeLabels, anomalyTypeOrder} from "../domain/environment/generator";

