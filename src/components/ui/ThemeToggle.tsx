import {useTheme} from "../../theme/ThemeProvider";
import type {KeyboardEvent} from "react";
import type {ThemeMode} from "../../theme/tokens";

const modes: {value: ThemeMode; label: string}[] = [
    {value: "light", label: "Light mode"},
    {value: "dark", label: "Dark mode"},
    {value: "auto", label: "System preference"},
];

export function ThemeToggle() {
    const {mode, setMode} = useTheme();

    const activeIndex = modes.findIndex((m) => m.value === mode);

    const applyModeAt = (index: number) => {
        const normalizedIndex = (index + modes.length) % modes.length;
        setMode(modes[normalizedIndex].value);
    };

    const handleRadioKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
        if (event.key === "ArrowRight" || event.key === "ArrowDown") {
            event.preventDefault();
            applyModeAt(activeIndex + 1);
            return;
        }

        if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
            event.preventDefault();
            applyModeAt(activeIndex - 1);
            return;
        }

        if (event.key === "Home") {
            event.preventDefault();
            applyModeAt(0);
            return;
        }

        if (event.key === "End") {
            event.preventDefault();
            applyModeAt(modes.length - 1);
        }
    };

    return (
        <div className="theme-toggle" role="radiogroup" aria-label="Color theme">
            {modes.map((m) => (
                <button
                    key={m.value}
                    type="button"
                    role="radio"
                    aria-checked={mode === m.value}
                    aria-label={m.label}
                    tabIndex={mode === m.value ? 0 : -1}
                    className={`theme-toggle-btn${mode === m.value ? " active" : ""}`}
                    onClick={() => setMode(m.value)}
                    onKeyDown={handleRadioKeyDown}
                >
                    <span className="theme-toggle-label">{m.value.charAt(0).toUpperCase() + m.value.slice(1)}</span>
                </button>
            ))}
        </div>
    );
}


