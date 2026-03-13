import {useTheme} from "../../theme/ThemeProvider";
import type {ThemeMode} from "../../theme/tokens";

const modes: {value: ThemeMode; label: string}[] = [
    {value: "light", label: "Light mode"},
    {value: "dark", label: "Dark mode"},
    {value: "auto", label: "System preference"},
];

export function ThemeToggle() {
    const {mode, setMode} = useTheme();

    return (
        <div className="theme-toggle" role="radiogroup" aria-label="Color theme">
            {modes.map((m) => (
                <button
                    key={m.value}
                    role="radio"
                    aria-checked={mode === m.value}
                    aria-label={m.label}
                    className={`theme-toggle-btn${mode === m.value ? " active" : ""}`}
                    onClick={() => setMode(m.value)}
                >
                    <span className="theme-toggle-label">{m.value.charAt(0).toUpperCase() + m.value.slice(1)}</span>
                </button>
            ))}
        </div>
    );
}


