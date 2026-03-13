import type React from "react";
import {createContext, useCallback, useContext, useEffect, useMemo, useRef, useState} from "react";
import {useLocation} from "react-router-dom";
import {tutorialSteps, tutorialStorageKey, type TutorialStep} from "../config/tutorial";
import {useMission} from "./MissionContext";

type TutorialStateValue = "completed" | "skipped";

type TutorialContextValue = {
    tutorialSteps: TutorialStep[];
    currentStep: TutorialStep | null;
    currentStepIndex: number;
    isTutorialActive: boolean;
    isHelpOpen: boolean;
    hasDismissedTutorial: boolean;
    isCurrentStepSatisfied: boolean;
    setHelpOpen: React.Dispatch<React.SetStateAction<boolean>>;
    startTutorial: (fromCurrentRoute?: boolean) => void;
    restartTutorial: () => void;
    nextStep: () => void;
    previousStep: () => void;
    skipTutorial: () => void;
    completeTutorial: () => void;
};

const TutorialContext = createContext<TutorialContextValue | null>(null);

const getStoredState = (): TutorialStateValue | null => {
    if (typeof window === "undefined") return null;
    const value = window.localStorage.getItem(tutorialStorageKey);
    if (value === "completed" || value === "skipped") return value;
    return null;
};

const firstStepIndexForRoute = (pathname: string) => {
    const idx = tutorialSteps.findIndex((step) => step.route === pathname);
    return idx >= 0 ? idx : 0;
};

export const useTutorial = () => {
    const ctx = useContext(TutorialContext);
    if (!ctx) throw new Error("useTutorial must be used inside TutorialProvider");
    return ctx;
};

export function TutorialProvider({children}: { children: React.ReactNode }) {
    const location = useLocation();
    const {drones, voronoiEnabled, voronoiCells, coverageActive, detectionLog} = useMission();

    const [currentStepIndex, setCurrentStepIndex] = useState(0);
    const [isTutorialActive, setTutorialActive] = useState(false);
    const [isHelpOpen, setHelpOpen] = useState(false);
    const [dismissedState, setDismissedState] = useState<TutorialStateValue | null>(() => getStoredState());
    const didAutoStartRef = useRef(false);

    const persistState = useCallback((value: TutorialStateValue) => {
        if (typeof window !== "undefined") {
            window.localStorage.setItem(tutorialStorageKey, value);
        }
        setDismissedState(value);
    }, []);

    const hasDismissedTutorial = dismissedState !== null;

    useEffect(() => {
        if (didAutoStartRef.current) return;
        didAutoStartRef.current = true;
        if (hasDismissedTutorial) return;
        setCurrentStepIndex(0);
        setTutorialActive(true);
    }, [hasDismissedTutorial]);

    const currentStep = tutorialSteps[currentStepIndex] ?? null;

    const isStepSatisfied = useCallback((stepId: string) => {
        switch (stepId) {
            case "setup-spawn-drone":
                return drones.length > 0;
            case "sim-run-coverage":
                return voronoiEnabled && voronoiCells.length > 0;
            case "sim-start-coverage":
                return coverageActive;
            case "sim-detection-log":
                return detectionLog.length > 0;
            default:
                return true;
        }
    }, [coverageActive, detectionLog.length, drones.length, voronoiCells.length, voronoiEnabled]);

    const isCurrentStepSatisfied = useMemo(() => {
        if (!currentStep) return true;
        return isStepSatisfied(currentStep.id);
    }, [currentStep, isStepSatisfied]);

    const setStepByRoute = useCallback((pathname: string) => {
        setCurrentStepIndex(firstStepIndexForRoute(pathname));
    }, []);

    const startTutorial = useCallback((fromCurrentRoute = false) => {
        setTutorialActive(true);
        if (fromCurrentRoute) {
            setStepByRoute(location.pathname);
            return;
        }
        setCurrentStepIndex(0);
    }, [location.pathname, setStepByRoute]);

    const restartTutorial = useCallback(() => {
        if (typeof window !== "undefined") {
            window.localStorage.removeItem(tutorialStorageKey);
        }
        setDismissedState(null);
        setHelpOpen(false);
        setTutorialActive(true);
        setStepByRoute(location.pathname);
    }, [location.pathname, setStepByRoute]);

    const completeTutorial = useCallback(() => {
        persistState("completed");
        setTutorialActive(false);
    }, [persistState]);

    const skipTutorial = useCallback(() => {
        persistState("skipped");
        setTutorialActive(false);
        setHelpOpen(false);
    }, [persistState]);

    const nextStep = useCallback(() => {
        setCurrentStepIndex((prev) => {
            const step = tutorialSteps[prev];
            if (step?.requiresAction && !isStepSatisfied(step.id)) return prev;
            if (prev >= tutorialSteps.length - 1) return prev;
            return prev + 1;
        });
    }, [isStepSatisfied]);

    const previousStep = useCallback(() => {
        setCurrentStepIndex((prev) => Math.max(0, prev - 1));
    }, []);

    useEffect(() => {
        if (!isTutorialActive || !currentStep) return;
        if (currentStep.route === location.pathname) return;

        if (currentStep.id === "setup-launch" && location.pathname === "/simulation") {
            setCurrentStepIndex((prev) => Math.min(tutorialSteps.length - 1, prev + 1));
            return;
        }

        if (currentStep.route === "/setup" && location.pathname === "/simulation") {
            setStepByRoute("/simulation");
        }
    }, [currentStep, isTutorialActive, location.pathname, setStepByRoute]);

    useEffect(() => {
        if (!isTutorialActive || !currentStep) return;
        if (!currentStep.requiresAction) return;
        if (!isStepSatisfied(currentStep.id)) return;
        if (currentStepIndex >= tutorialSteps.length - 1) return;

        const timer = window.setTimeout(() => {
            setCurrentStepIndex((prev) => {
                if (prev !== currentStepIndex) return prev;
                return Math.min(tutorialSteps.length - 1, prev + 1);
            });
        }, 350);

        return () => window.clearTimeout(timer);
    }, [currentStep, currentStepIndex, isStepSatisfied, isTutorialActive]);

    const value = useMemo<TutorialContextValue>(() => ({
        tutorialSteps,
        currentStep,
        currentStepIndex,
        isTutorialActive,
        isHelpOpen,
        hasDismissedTutorial,
        isCurrentStepSatisfied,
        setHelpOpen,
        startTutorial,
        restartTutorial,
        nextStep,
        previousStep,
        skipTutorial,
        completeTutorial,
    }), [
        currentStep,
        currentStepIndex,
        hasDismissedTutorial,
        isCurrentStepSatisfied,
        isHelpOpen,
        isTutorialActive,
        startTutorial,
        restartTutorial,
        nextStep,
        previousStep,
        skipTutorial,
        completeTutorial,
    ]);

    return <TutorialContext.Provider value={value}>{children}</TutorialContext.Provider>;
}


