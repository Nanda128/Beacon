export const INITIAL_VIEW = {
    center: [0, 20] as [number, number],
    zoom: 2,
    pitch: 0,
};

export const GRID_STEPS = [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 45, 90];

export const MAP_STYLE_URL = (apiKey: string) =>
    `https://api.maptiler.com/maps/streets/style.json?key=${apiKey}`;

export const NORTH_BEARING_THRESHOLD = 0.5;
export const PITCH_ZERO_THRESHOLD = 0.01;
