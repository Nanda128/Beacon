import type React from "react";
import {ThemeToggle} from "../ui/ThemeToggle";
import {useTutorial} from "../../context/TutorialContext";

type AppShellProps = {
    children: React.ReactNode;
    subtitle?: string;
};

export function AppShell({children, subtitle}: AppShellProps) {
    const {setHelpOpen} = useTutorial();

    return (
        <div className="app-shell">
            <header className="toolbar" role="banner">
                <div className="brand">
                    <span className="brand-dot" aria-hidden="true" />
                    <span>BEACON</span>
                    {subtitle && <span className="brand-subtitle">— {subtitle}</span>}
                </div>
                <div className="toolbar-actions">
                    <button
                        className="btn ghost btn-sm toolbar-help-btn"
                        onClick={() => setHelpOpen(true)}
                        data-tutorial-id="toolbar-help"
                    >
                        Help
                    </button>
                    <ThemeToggle />
                </div>
            </header>
            <main className="content" id="main-content" role="main">
                {children}
            </main>
        </div>
    );
}
