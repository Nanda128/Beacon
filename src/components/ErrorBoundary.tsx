import type React from "react";
import {Component} from "react";
import {logError} from "../utils/errorLogging";

type Props = {
    children: React.ReactNode;
};

type State = {
    hasError: boolean;
};

export default class ErrorBoundary extends Component<Props, State> {
    state: State = {hasError: false};

    static getDerivedStateFromError(): State {
        return {hasError: true};
    }

    componentDidCatch(error: Error, info: React.ErrorInfo): void {
        logError(error, {
            severity: "fatal",
            origin: "react.error-boundary",
            context: {
                componentStack: info.componentStack,
            },
        });
    }

    private handleReload = () => {
        window.location.reload();
    };

    render(): React.ReactNode {
        if (this.state.hasError) {
            return (
                <main style={{padding: 24, maxWidth: 640, margin: "0 auto"}}>
                    <h1>Something went wrong</h1>
                    <p>An unexpected error occurred. A detailed error log was captured in the console.</p>
                    <button className="btn" type="button" onClick={this.handleReload}>Reload Beacon</button>
                </main>
            );
        }
        return this.props.children;
    }
}

