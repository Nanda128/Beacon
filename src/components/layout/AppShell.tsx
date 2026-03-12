import type React from "react";
import {ThemeToggle} from "../ui/ThemeToggle";

type AppShellProps = {
    children: React.ReactNode;
    subtitle?: string;
};

export function AppShell({children, subtitle}: AppShellProps) {
    return (
        <div className="app-shell">
            <header className="toolbar" role="banner">
                <div className="brand">
                    <span className="brand-dot" aria-hidden="true" />
                    <span>BEACON</span>
                    {subtitle && <span className="brand-subtitle">— {subtitle}</span>}
                </div>
                <ThemeToggle />
            </header>
            <main className="content" id="main-content" role="main">
                {children}
            </main>
        </div>
    );
}
