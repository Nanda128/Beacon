import {useEffect} from "react";
import {useLocation, useNavigate} from "react-router-dom";
import HelpModal from "./HelpModal";
import TutorialOverlay from "./TutorialOverlay";
import {useTutorial} from "../../context/TutorialContext";

export default function TutorialRoot() {
    const navigate = useNavigate();
    const location = useLocation();
    const {
        tutorialSteps,
        currentStep,
        currentStepIndex,
        isTutorialActive,
        isCurrentStepSatisfied,
        isHelpOpen,
        hasDismissedTutorial,
        setHelpOpen,
        startTutorial,
        restartTutorial,
        nextStep,
        previousStep,
        skipTutorial,
        completeTutorial,
    } = useTutorial();

    useEffect(() => {
        const handler = (event: KeyboardEvent) => {
            const target = event.target as HTMLElement | null;
            const tagName = target?.tagName;
            if (tagName === "INPUT" || tagName === "TEXTAREA" || tagName === "SELECT") return;

            if ((event.key === "?" || (event.key === "/" && event.shiftKey)) && !event.ctrlKey && !event.metaKey) {
                event.preventDefault();
                setHelpOpen(true);
                return;
            }

            if (event.key.toLowerCase() === "h" && !event.ctrlKey && !event.metaKey) {
                event.preventDefault();
                setHelpOpen(!isHelpOpen);
                return;
            }

            if (event.key === "Escape" && isHelpOpen) {
                event.preventDefault();
                setHelpOpen(false);
                return;
            }

            if (!isTutorialActive || !currentStep || currentStep.route !== location.pathname) return;

            if (event.key === "ArrowRight") {
                event.preventDefault();
                if (!currentStep.requiresAction || isCurrentStepSatisfied) {
                    nextStep();
                }
            }

            if (event.key === "ArrowLeft") {
                event.preventDefault();
                previousStep();
            }
        };

        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, [
        currentStep,
        isCurrentStepSatisfied,
        isHelpOpen,
        isTutorialActive,
        location.pathname,
        nextStep,
        previousStep,
        setHelpOpen,
    ]);

    const routeMismatch = Boolean(currentStep && currentStep.route !== location.pathname);

    return (
        <>
            <HelpModal
                open={isHelpOpen}
                hasDismissedTutorial={hasDismissedTutorial}
                onClose={() => setHelpOpen(false)}
                onStartTutorial={() => {
                    setHelpOpen(false);
                    startTutorial(true);
                }}
                onRestartTutorial={() => restartTutorial()}
                onSkipTutorial={skipTutorial}
            />

            {isTutorialActive && currentStep && (
                <TutorialOverlay
                    step={currentStep}
                    stepIndex={currentStepIndex}
                    totalSteps={tutorialSteps.length}
                    isStepSatisfied={isCurrentStepSatisfied}
                    routeMismatch={routeMismatch}
                    onBack={previousStep}
                    onNext={() => {
                        nextStep();
                        const next = tutorialSteps[currentStepIndex + 1];
                        if (next && next.route !== location.pathname) {
                            navigate(next.route);
                        }
                    }}
                    onSkip={skipTutorial}
                    onFinish={completeTutorial}
                    onGoToStepRoute={() => navigate(currentStep.route)}
                />
            )}
        </>
    );
}


