import type {ReactNode} from "react";

interface AppLayoutProps {
    children: ReactNode;
}

export function AppLayout({children}: AppLayoutProps) {
    return <div className="app-shell">{children}</div>;
}
