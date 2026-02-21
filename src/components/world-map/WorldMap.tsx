import {useState} from "react";
import "maplibre-gl/dist/maplibre-gl.css";
import "../../styles/world-map.css";
import {MapView} from "./MapView";
import {GridToggle} from "./GridToggle";
import {NorthControl} from "./NorthControl";
import {CursorReadout} from "./CursorReadout";
import {useMapInstance} from "../../hooks/useMapInstance";
import {useGridOverlay} from "../../hooks/useGridOverlay";

export const WorldMap = () => {
    const [showGrid, setShowGrid] = useState(false);
    const {containerRef, mapRef, isOffNorth, resetNorth} = useMapInstance();
    const {gridCanvasRef, cursorInfo} = useGridOverlay({
        mapRef,
        containerRef,
        isEnabled: showGrid,
    });

    return (
        <section className="world-map">
            <MapView
                mapContainerRef={containerRef}
                gridCanvasRef={gridCanvasRef}
                showGrid={showGrid}
            />

            <div className="world-map__control-layer">
                <div className="world-map__north-control">
                    {isOffNorth && <NorthControl onClick={resetNorth}/>}
                </div>
                <div className="world-map__grid-toggle">
                    <GridToggle active={showGrid} onToggle={() => setShowGrid((prev) => !prev)}/>
                </div>
            </div>

            {showGrid && cursorInfo && (
                <div className="world-map__readout-wrapper">
                    <CursorReadout pixel={cursorInfo.pixel} lngLat={cursorInfo.lngLat}/>
                </div>
            )}
        </section>
    );
};
