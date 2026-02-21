import type {RefObject} from "react";

interface MapViewProps {
    mapContainerRef: RefObject<HTMLDivElement | null>;
    gridCanvasRef: RefObject<HTMLCanvasElement | null>;
    showGrid: boolean;
}

export const MapView = ({mapContainerRef, gridCanvasRef, showGrid}: MapViewProps) => {
    return (
        <div className="world-map__viewport">
            <div ref={mapContainerRef} className="world-map__map"/>
            <canvas
                ref={gridCanvasRef}
                className="world-map__grid"
                data-visible={showGrid}
            />
        </div>
    );
};
