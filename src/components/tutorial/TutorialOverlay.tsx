import {useEffect, useMemo, useState} from "react";
import {createPortal} from "react-dom";
import {type TutorialStep} from "../../config/tutorial";

type TutorialOverlayProps = {
    step: TutorialStep;
    stepIndex: number;
    totalSteps: number;
    isStepSatisfied: boolean;
    routeMismatch: boolean;
    onBack: () => void;
    onNext: () => void;
    onSkip: () => void;
    onFinish: () => void;
    onGoToStepRoute: () => void;
};

type TooltipPosition = {
    top: number;
    left: number;
};

const fallbackPosition: TooltipPosition = {
    top: 96,
    left: 24,
};

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

export default function TutorialOverlay({
                                            step,
                                            stepIndex,
                                            totalSteps,
                                            isStepSatisfied,
                                            routeMismatch,
                                            onBack,
                                            onNext,
                                            onSkip,
                                            onFinish,
                                            onGoToStepRoute,
                                        }: TutorialOverlayProps) {
    const [targetRect, setTargetRect] = useState<DOMRect | null>(null);

    useEffect(() => {
        if (typeof window === "undefined") return;

        const updateRect = () => {
            if (!step.targetId) {
                setTargetRect(null);
                return;
            }
            const element = document.querySelector(`[data-tutorial-id="${step.targetId}"]`) as HTMLElement | null;
            if (!element) {
                setTargetRect(null);
                return;
            }
            setTargetRect(element.getBoundingClientRect());
        };

        updateRect();
        const interval = window.setInterval(updateRect, 250);
        window.addEventListener("resize", updateRect);
        window.addEventListener("scroll", updateRect, true);

        return () => {
            window.clearInterval(interval);
            window.removeEventListener("resize", updateRect);
            window.removeEventListener("scroll", updateRect, true);
        };
    }, [step.targetId]);

    useEffect(() => {
        if (!step.targetId) return;
        const element = document.querySelector(`[data-tutorial-id="${step.targetId}"]`) as HTMLElement | null;
        if (!element) return;
        element.classList.add("tutorial-highlight");
        return () => {
            element.classList.remove("tutorial-highlight");
        };
    }, [step.targetId]);

    const position = useMemo<TooltipPosition>(() => {
        if (!targetRect || routeMismatch || typeof window === "undefined") return fallbackPosition;

        const cardWidth = 360;
        const left = clamp(targetRect.left + targetRect.width / 2 - cardWidth / 2, 16, window.innerWidth - cardWidth - 16);

        const preferredTop = targetRect.bottom + 12;
        const top = preferredTop > window.innerHeight - 260
            ? clamp(targetRect.top - 220, 16, window.innerHeight - 240)
            : preferredTop;

        return {top, left};
    }, [routeMismatch, targetRect]);

    if (typeof document === "undefined") return null;

    const isFinalStep = stepIndex >= totalSteps - 1;
    const blockNext = Boolean(step.requiresAction) && !isStepSatisfied;

    return createPortal(
        <div className="tutorial-layer" role="dialog" aria-live="polite" aria-label="Guided tutorial">
            <div className="tutorial-card" style={{top: position.top, left: position.left}}>
                <div className="tutorial-step-label">
                    Step {stepIndex + 1} of {totalSteps}
                </div>
                <h3>{step.title}</h3>
                <p>{step.body}</p>

                {routeMismatch && (
                    <div className="tutorial-note">
                        This step is on <code>{step.route}</code>.
                    </div>
                )}

                {blockNext && !routeMismatch && (
                    <div className="tutorial-note">{step.actionHint ?? "Complete this step action to continue."}</div>
                )}

                <div className="tutorial-actions">
                    <button className="btn ghost btn-sm" onClick={onSkip}>
                        Skip Tutorial
                    </button>
                    <button className="btn ghost btn-sm" onClick={onBack} disabled={stepIndex === 0}>
                        Back
                    </button>
                    {routeMismatch ? (
                        <button className="btn btn-sm" onClick={onGoToStepRoute}>
                            Go to Step
                        </button>
                    ) : isFinalStep ? (
                        <button className="btn btn-sm" onClick={onFinish}>
                            Finish
                        </button>
                    ) : (
                        <button className="btn btn-sm" onClick={onNext} disabled={blockNext}>
                            Next
                        </button>
                    )}
                </div>
            </div>
        </div>,
        document.body,
    );
}

