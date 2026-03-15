import type {
    NasaTlxDimensionId,
    NasaTlxDimensionScore,
    NasaTlxDimensionWeight,
    NasaTlxPairwiseComparison,
    NasaTlxPairwiseSelection,
    NasaTlxResponses,
    NasaTlxResultBand,
    NasaTlxWeightedResult,
} from "../types/tlx";

export const nasaTlxDimensions: Array<{ id: NasaTlxDimensionId; label: string; shortLabel: string; hint: string }> = [
    {
        id: "mentalDemand",
        label: "Mental Demand",
        shortLabel: "Mental",
        hint: "How much mental and perceptual activity was required?",
    },
    {
        id: "physicalDemand",
        label: "Physical Demand",
        shortLabel: "Physical",
        hint: "How much physical activity was required?",
    },
    {
        id: "temporalDemand",
        label: "Temporal Demand",
        shortLabel: "Temporal",
        hint: "How rushed or time-pressured did you feel?",
    },
    {
        id: "performance",
        label: "Performance",
        shortLabel: "Performance",
        hint: "How insecure, discouraged, or stressed did you feel about your performance?",
    },
    {
        id: "effort",
        label: "Effort",
        shortLabel: "Effort",
        hint: "How hard did you have to work to accomplish your level of performance?",
    },
    {
        id: "frustration",
        label: "Frustration",
        shortLabel: "Frustration",
        hint: "How irritated, stressed, and annoyed did you feel?",
    },
];

const clampToScale = (value: number) => Math.min(100, Math.max(0, Math.round(value / 5) * 5));

const toBand = (score: number): NasaTlxResultBand => {
    if (score < 30) return "low";
    if (score < 50) return "moderate";
    if (score < 70) return "high";
    return "very-high";
};

export const createDefaultNasaTlxResponses = (): NasaTlxResponses => ({
    mentalDemand: 50,
    physicalDemand: 50,
    temporalDemand: 50,
    performance: 50,
    effort: 50,
    frustration: 50,
});

const dimensionIds: NasaTlxDimensionId[] = nasaTlxDimensions.map((dimension) => dimension.id);

export const nasaTlxPairwiseComparisons: NasaTlxPairwiseComparison[] = dimensionIds.flatMap((left, leftIdx) =>
    dimensionIds.slice(leftIdx + 1).map((right) => ({
        id: `${left}-vs-${right}`,
        left,
        right,
    })),
);

const pairLookup = nasaTlxPairwiseComparisons.reduce<Record<string, NasaTlxPairwiseComparison>>((acc, pair) => {
    acc[pair.id] = pair;
    return acc;
}, {});

export const createDefaultPairwiseSelections = (): NasaTlxPairwiseSelection[] => [];

export const normalizePairwiseSelections = (input: NasaTlxPairwiseSelection[]): NasaTlxPairwiseSelection[] => {
    const uniqueByPair = new Map<string, NasaTlxPairwiseSelection>();
    input.forEach((selection) => {
        const pair = pairLookup[selection.pairId];
        if (!pair) return;
        if (selection.selected !== pair.left && selection.selected !== pair.right) return;
        uniqueByPair.set(selection.pairId, {pairId: pair.id, selected: selection.selected});
    });
    return Array.from(uniqueByPair.values());
};

export const normalizeNasaTlxResponses = (responses: Partial<NasaTlxResponses>): NasaTlxResponses => ({
    mentalDemand: clampToScale(responses.mentalDemand ?? 50),
    physicalDemand: clampToScale(responses.physicalDemand ?? 50),
    temporalDemand: clampToScale(responses.temporalDemand ?? 50),
    performance: clampToScale(responses.performance ?? 50),
    effort: clampToScale(responses.effort ?? 50),
    frustration: clampToScale(responses.frustration ?? 50),
});


export const calculateWeightedNasaTlx = (
    responses: NasaTlxResponses,
    selections: NasaTlxPairwiseSelection[],
): NasaTlxWeightedResult => {
    const normalizedResponses = normalizeNasaTlxResponses(responses);
    const normalizedSelections = normalizePairwiseSelections(selections);

    const weightsByDimension = dimensionIds.reduce<Record<NasaTlxDimensionId, number>>((acc, id) => {
        acc[id] = 0;
        return acc;
    }, {} as Record<NasaTlxDimensionId, number>);

    normalizedSelections.forEach((selection) => {
        weightsByDimension[selection.selected] += 1;
    });

    const dimensions: NasaTlxDimensionScore[] = nasaTlxDimensions.map((dimension) => ({
        id: dimension.id,
        label: dimension.label,
        shortLabel: dimension.shortLabel,
        value: normalizedResponses[dimension.id],
    }));

    const weights: NasaTlxDimensionWeight[] = nasaTlxDimensions.map((dimension) => ({
        id: dimension.id,
        label: dimension.label,
        shortLabel: dimension.shortLabel,
        weight: weightsByDimension[dimension.id],
    }));

    const pairCount = normalizedSelections.length;
    const weightedTotal = dimensions.reduce((sum, dimension) => {
        return sum + dimension.value * weightsByDimension[dimension.id];
    }, 0);
    const denominator = Math.max(1, pairCount);
    const weightedScore = Math.round((weightedTotal / denominator) * 10) / 10;

    return {
        weightedScore,
        band: toBand(weightedScore),
        dimensions,
        weights,
        pairCount,
    };
};


