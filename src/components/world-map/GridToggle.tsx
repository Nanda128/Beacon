interface GridToggleProps {
    active: boolean;
    onToggle: () => void;
}

export const GridToggle = ({active, onToggle}: GridToggleProps) => (
    <button
        type="button"
        className="world-map__button"
        onClick={onToggle}
        aria-pressed={active}
        aria-label="Toggle grid overlay"
        data-active={active}
    >
        {active ? "Hide grid" : "Show grid"}
    </button>
);
