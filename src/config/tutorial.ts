export type TutorialStep = {
    id: string;
    route: "/" | "/setup" | "/simulation";
    title: string;
    body: string;
    targetId?: string;
    requiresAction?: boolean;
    actionHint?: string;
};

export const tutorialStorageKey = "beacon.tutorial.state.v1";

export const tutorialSteps: TutorialStep[] = [
    {
        id: "landing-preset",
        route: "/",
        title: "Choose a mission profile",
        body: "Pick a preset to pre-load weather, anomaly mix, and recommended fleet composition.",
        targetId: "landing-preset-grid",
    },
    {
        id: "landing-begin",
        route: "/",
        title: "Continue to mission setup",
        body: "Use Begin Setup to configure drones, sensors, and sector settings for this run.",
        targetId: "landing-begin-setup",
    },
    {
        id: "setup-preset",
        route: "/setup",
        title: "Review setup controls",
        body: "Adjust seed, map size, and preset parameters before launch. You can regenerate at any time.",
        targetId: "setup-preset-select",
    },
    {
        id: "setup-spawn-drone",
        route: "/setup",
        title: "Spawn at least one drone",
        body: "Select a model and spawn point, then add a drone to the mission roster.",
        targetId: "setup-spawn-drone",
        requiresAction: true,
        actionHint: "Spawn one drone to continue.",
    },
    {
        id: "setup-launch",
        route: "/setup",
        title: "Launch into simulation",
        body: "Launch Mission starts the live mission loop and opens the operational controls.",
        targetId: "setup-launch-mission",
    },
    {
        id: "sim-mission-controls",
        route: "/simulation",
        title: "Mission controls drawer",
        body: "Open this drawer to command drones, tune sensors, and control autonomy and comms behavior.",
        targetId: "sim-mission-controls",
    },
    {
        id: "sim-run-coverage",
        route: "/simulation",
        title: "Generate coverage cells",
        body: "Run Coverage builds Voronoi partitions from current drone positions.",
        targetId: "sim-run-coverage",
        requiresAction: true,
        actionHint: "Run Coverage to continue.",
    },
    {
        id: "sim-start-coverage",
        route: "/simulation",
        title: "Start the sample mission walkthrough",
        body: "Start Coverage launches autonomous lawnmower sweeps, creating a realistic first mission flow.",
        targetId: "sim-start-coverage",
        requiresAction: true,
        actionHint: "Start Coverage to continue.",
    },
    {
        id: "sim-detection-log",
        route: "/simulation",
        title: "Monitor detections and alerts",
        body: "Watch this log for anomaly detections, battery events, and comm changes while coverage runs.",
        targetId: "sim-detection-log",
        requiresAction: true,
        actionHint: "Wait for the first detection log entry to continue.",
    },
    {
        id: "tutorial-complete",
        route: "/simulation",
        title: "Tutorial complete",
        body: "You have completed the sample mission walkthrough. Use Help anytime to revisit shortcuts or restart the tutorial.",
    },
];

export type KeyboardShortcut = {
    keys: string;
    description: string;
    scope: string;
};

export const keyboardShortcuts: KeyboardShortcut[] = [
    {keys: "Delete / Backspace", description: "Delete selected drones", scope: "Simulation"},
    {keys: "Shift + ?", description: "Open keyboard shortcuts help", scope: "Global"},
    {keys: "H", description: "Toggle keyboard shortcuts help", scope: "Global"},
    {keys: "Esc", description: "Close help modal", scope: "Global"},
    {keys: "Arrow Left", description: "Previous tutorial step", scope: "Tutorial"},
    {keys: "Arrow Right", description: "Next tutorial step (when requirements are met)", scope: "Tutorial"},
];

