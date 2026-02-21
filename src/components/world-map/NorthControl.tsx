interface NorthControlProps {
    onClick: () => void;
}

export const NorthControl = ({onClick}: NorthControlProps) => (
    <button
        type="button"
        className="world-map__button world-map__button--circle"
        onClick={onClick}
        aria-label="Reorient map to face north"
    >
        N
    </button>
);
