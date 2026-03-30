export const dronePalette: string[] = [
    "#38bdf8", // light cyan
    "#a78bfa", // light purple
    "#f59e0b", // amber
    "#22c55e", // green
    "#ef4444", // red
    "#eab308", // yellow
    "#14b8a6", // teal
    "#6366f1", // indigo
    "#8b5cf6", // purple
    "#0ea5e9", // cyan
];

export const getDroneColorIndex = (droneId: string, orderedDroneIds: string[]): number => {
    const paletteSize = dronePalette.length;
    if (paletteSize === 0) return 0;
    const idx = orderedDroneIds.indexOf(droneId);
    if (idx === -1) {
        let hash = 0;
        for (let i = 0; i < droneId.length; i += 1) {
            hash = (hash + droneId.charCodeAt(i) * (i + 1)) % 997;
        }
        return hash % paletteSize;
    }
    return idx % paletteSize;
};

export const getDroneColorForLayer = (droneId: string, orderedDroneIds: string[]): string => {
    const index = getDroneColorIndex(droneId, orderedDroneIds);
    return dronePalette[index];
};

export const coveragePathColor = "rgba(59,130,246,0.9)";
