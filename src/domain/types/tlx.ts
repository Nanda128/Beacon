export type NasaTlxDimensionId =
    | "mentalDemand"
    | "physicalDemand"
    | "temporalDemand"
    | "performance"
    | "effort"
    | "frustration";

export type NasaTlxResponses = Record<NasaTlxDimensionId, number>;

export type NasaTlxMode = "weighted";

export type NasaTlxDimensionScore = {
    id: NasaTlxDimensionId;
    label: string;
    shortLabel: string;
    value: number;
};

export type NasaTlxResultBand = "low" | "moderate" | "high" | "very-high";

export type NasaTlxPairwiseComparison = {
    id: string;
    left: NasaTlxDimensionId;
    right: NasaTlxDimensionId;
};

export type NasaTlxPairwiseSelection = {
    pairId: string;
    selected: NasaTlxDimensionId;
};

export type NasaTlxDimensionWeight = {
    id: NasaTlxDimensionId;
    label: string;
    shortLabel: string;
    weight: number;
};

export type NasaTlxWeightedResult = {
    weightedScore: number;
    band: NasaTlxResultBand;
    dimensions: NasaTlxDimensionScore[];
    weights: NasaTlxDimensionWeight[];
    pairCount: number;
};

export type NasaTlxAssessment = {
    completedAt: number;
    mode: NasaTlxMode;
    responses: NasaTlxResponses;
    pairwiseSelections: NasaTlxPairwiseSelection[];
    result: NasaTlxWeightedResult;
};


