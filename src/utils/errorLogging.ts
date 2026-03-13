type ErrorSeverity = "error" | "fatal";

type ErrorLogEntry = {
    id: string;
    timestamp: string;
    severity: ErrorSeverity;
    origin: string;
    name: string;
    message: string;
    stack?: string;
    cause?: unknown;
    context?: Record<string, unknown>;
    url?: string;
    userAgent?: string;
};

type ErrorLogOptions = {
    severity?: ErrorSeverity;
    origin: string;
    context?: Record<string, unknown>;
};

declare global {
    interface Window {
        __BEACON_ERROR_LOGS__?: ErrorLogEntry[];
        __BEACON_ERROR_HANDLERS_ATTACHED__?: boolean;
    }
}

const MAX_LOG_ENTRIES = 200;

function normalizeError(err: unknown): { name: string; message: string; stack?: string; cause?: unknown } {
    if (err instanceof Error) {
        return {
            name: err.name,
            message: err.message,
            stack: err.stack,
            cause: (err as Error & { cause?: unknown }).cause,
        };
    }
    if (typeof err === "string") {
        return {name: "Error", message: err};
    }
    return {
        name: "UnknownError",
        message: "Unknown error",
        cause: err,
    };
}

function nextErrorId(): string {
    return `err-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function logError(err: unknown, options: ErrorLogOptions): ErrorLogEntry {
    const normalized = normalizeError(err);
    const entry: ErrorLogEntry = {
        id: nextErrorId(),
        timestamp: new Date().toISOString(),
        severity: options.severity ?? "error",
        origin: options.origin,
        name: normalized.name,
        message: normalized.message,
        stack: normalized.stack,
        cause: normalized.cause,
        context: options.context,
        url: typeof window !== "undefined" ? window.location.href : undefined,
        userAgent: typeof navigator !== "undefined" ? navigator.userAgent : undefined,
    };

    if (typeof window !== "undefined") {
        const store = window.__BEACON_ERROR_LOGS__ ?? [];
        store.unshift(entry);
        if (store.length > MAX_LOG_ENTRIES) store.length = MAX_LOG_ENTRIES;
        window.__BEACON_ERROR_LOGS__ = store;
    }

    console.groupCollapsed(`[Beacon][${entry.severity}] ${entry.origin}: ${entry.message}`);
    console.error(err);
    console.table({
        id: entry.id,
        timestamp: entry.timestamp,
        origin: entry.origin,
        severity: entry.severity,
        name: entry.name,
        message: entry.message,
        url: entry.url,
    });
    if (entry.context) {
        console.info("Context", entry.context);
    }
    if (entry.stack) {
        console.info("Stack", entry.stack);
    }
    if (entry.cause !== undefined) {
        console.info("Cause", entry.cause);
    }
    console.groupEnd();

    return entry;
}

export function registerGlobalErrorHandlers(): void {
    if (typeof window === "undefined") return;
    if (window.__BEACON_ERROR_HANDLERS_ATTACHED__) return;

    window.addEventListener("error", (event) => {
        logError(event.error ?? event.message, {
            severity: "fatal",
            origin: "window.error",
            context: {
                filename: event.filename,
                line: event.lineno,
                column: event.colno,
            },
        });
    });

    window.addEventListener("unhandledrejection", (event) => {
        logError(event.reason, {
            severity: "fatal",
            origin: "window.unhandledrejection",
        });
    });

    window.__BEACON_ERROR_HANDLERS_ATTACHED__ = true;
}
