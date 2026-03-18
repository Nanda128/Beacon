import type React from "react";
import {useRef} from "react";
import {ThemeToggle} from "../ui/ThemeToggle";
import {useTutorial} from "../../context/TutorialContext";

type AppShellProps = {
    children: React.ReactNode;
    subtitle?: string;
};

export function AppShell({children, subtitle}: AppShellProps) {
    const {isHelpOpen, setHelpOpen} = useTutorial();
    const mainRef = useRef<HTMLElement | null>(null);

    const focusMainContent = () => {
        mainRef.current?.focus();
    };

    return (
        <div className="app-shell">
            <button
                type="button"
                className="skip-link"
                onClick={focusMainContent}
                aria-controls="main-content"
            >
                Skip to main content
            </button>
            <header className="toolbar" role="banner">
                <div className="brand">
                    <span className="brand-dot" aria-hidden="true"/>
                    <span>BEACON</span>
                    {subtitle && <span className="brand-subtitle">- {subtitle}</span>}
                </div>
                <div className="toolbar-actions">
                    <button
                        type="button"
                        className="btn ghost btn-sm toolbar-help-btn"
                        onClick={() => setHelpOpen(true)}
                        data-tutorial-id="toolbar-help"
                        aria-haspopup="dialog"
                        aria-controls="help-modal"
                        aria-expanded={isHelpOpen}
                    >
                        Help
                    </button>
                    <ThemeToggle/>
                </div>
            </header>
            <main ref={mainRef} className="content" id="main-content" role="main" tabIndex={-1}>
                {children}
            </main>
        </div>
    );
}
