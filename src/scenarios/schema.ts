export const maritimeScenarioSchema = {
    $schema: "http://json-schema.org/draft-07/schema#",
    title: "MaritimeScenario",
    type: "object",
    properties: {
        version: {type: "number", const: 1},
        name: {type: "string"},
        seed: {type: "string"},
        metadata: {
            type: "object",
            properties: {
                createdAt: {type: "string"},
                labels: {type: "array", items: {type: "string"}},
                notes: {type: "string"},
            },
            required: ["createdAt"],
        },
        sector: {
            type: "object",
            properties: {
                id: {type: "string"},
                name: {type: "string"},
                seed: {type: "string"},
                createdAt: {type: "string"},
                bounds: {
                    type: "object",
                    properties: {
                        origin: {
                            type: "object",
                            properties: {
                                x: {type: "number"},
                                y: {type: "number"},
                            },
                            required: ["x", "y"],
                        },
                        widthMeters: {type: "number"},
                        heightMeters: {type: "number"},
                    },
                    required: ["origin", "widthMeters", "heightMeters"],
                },
                conditions: {
                    type: "object",
                    properties: {
                        seaState: {type: "number"},
                        windKts: {type: "number"},
                        visibilityKm: {type: "number"},
                        surfaceTempC: {type: "number"},
                        description: {type: "string"},
                    },
                    required: ["seaState", "windKts", "visibilityKm", "surfaceTempC"],
                },
                water: {
                    type: "object",
                    properties: {
                        tileSize: {type: "number"},
                        noiseScale: {type: "number"},
                        detailScale: {type: "number"},
                        baseColor: {type: "array", items: {type: "number"}, minItems: 3, maxItems: 3},
                        highlightColor: {type: "array", items: {type: "number"}, minItems: 3, maxItems: 3},
                        textureStrength: {type: "number"},
                    },
                    required: ["tileSize", "noiseScale", "detailScale", "baseColor", "highlightColor", "textureStrength"],
                },
            },
            required: ["id", "name", "seed", "createdAt", "bounds", "conditions", "water"],
        },
    },
    required: ["version", "name", "seed", "sector"],
} as const;

