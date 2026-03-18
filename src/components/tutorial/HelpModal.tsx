import {createPortal} from "react-dom";
import {keyboardShortcuts} from "../../config/tutorial";

type HelpModalProps = {
    open: boolean;
    onClose: () => void;
    onStartTutorial: () => void;
    onRestartTutorial: () => void;
    onSkipTutorial: () => void;
    hasDismissedTutorial: boolean;
};

export default function HelpModal({
                                      open,
                                      onClose,
                                      onStartTutorial,
                                      onRestartTutorial,
                                      onSkipTutorial,
                                      hasDismissedTutorial,
                                  }: HelpModalProps) {
    if (!open || typeof document === "undefined") return null;

    return createPortal(
        <div className="help-modal-backdrop" role="presentation" onClick={onClose}>
            <div
                id="help-modal"
                className="help-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="help-modal-heading"
                onClick={(event) => event.stopPropagation()}
            >
                <header className="help-modal-header">
                    <h2 id="help-modal-heading">Help & Keyboard Shortcuts</h2>
                    <button className="btn ghost btn-sm" onClick={onClose} aria-label="Close help">
                        Close
                    </button>
                </header>

                <p className="help-modal-subtitle">
                    Quick references for tutorial navigation and live mission controls.
                </p>

                <div className="help-shortcut-grid" role="list" aria-label="Keyboard shortcuts">
                    {keyboardShortcuts.map((shortcut) => (
                        <div className="help-shortcut-row" role="listitem" key={`${shortcut.scope}:${shortcut.keys}`}>
                            <span className="help-shortcut-keys">{shortcut.keys}</span>
                            <span>{shortcut.description}</span>
                            <span className="help-shortcut-scope">{shortcut.scope}</span>
                        </div>
                    ))}
                </div>

                <div className="help-modal-actions">
                    <button className="btn" onClick={hasDismissedTutorial ? onRestartTutorial : onStartTutorial}>
                        {hasDismissedTutorial ? "Restart Tutorial" : "Start Tutorial"}
                    </button>
                    <button className="btn ghost" onClick={onSkipTutorial}>
                        Skip Tutorial
                    </button>
                </div>
            </div>
        </div>,
        document.body,
    );
}

