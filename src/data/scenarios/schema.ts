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
        anomalies: {
            type: "object",
            properties: {
                config: {
                    type: "object",
                    properties: {
                        "person-in-water": {
                            type: "object",
                            properties: {
                                count: {type: "number"},
                                detectionRadiusMeters: {type: "number"},
                            },
                            required: ["count", "detectionRadiusMeters"],
                        },
                        "lifeboat": {
                            type: "object",
                            properties: {
                                count: {type: "number"},
                                detectionRadiusMeters: {type: "number"},
                            },
                            required: ["count", "detectionRadiusMeters"],
                        },
                        "debris-field": {
                            type: "object",
                            properties: {
                                count: {type: "number"},
                                detectionRadiusMeters: {type: "number"},
                            },
                            required: ["count", "detectionRadiusMeters"],
                        },
                        "false-positive": {
                            type: "object",
                            properties: {
                                count: {type: "number"},
                                detectionRadiusMeters: {type: "number"},
                            },
                            required: ["count", "detectionRadiusMeters"],
                        },
                    },
                    required: ["person-in-water", "lifeboat", "debris-field", "false-positive"],
                    additionalProperties: false,
                },
                items: {
                    type: "array",
                    items: {
                        type: "object",
                        properties: {
                            id: {type: "string"},
                            type: {
                                type: "string",
                                enum: ["person-in-water", "lifeboat", "debris-field", "false-positive"]
                            },
                            detected: {type: "boolean"},
                            detectionRadiusMeters: {type: "number"},
                            note: {type: "string"},
                            position: {
                                type: "object",
                                properties: {
                                    x: {type: "number"},
                                    y: {type: "number"},
                                },
                                required: ["x", "y"],
                            },
                        },
                        required: ["id", "type", "position", "detected", "detectionRadiusMeters"],
                    },
                },
            },
            required: ["config", "items"],
        },
    },
    required: ["version", "name", "seed", "sector", "anomalies"],
} as const;

