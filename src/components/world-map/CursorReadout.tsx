interface CursorReadoutProps {
    pixel: { x: number; y: number };
    lngLat: { lng: number; lat: number };
}

export const CursorReadout = ({pixel, lngLat}: CursorReadoutProps) => (
    <div className="world-map__readout">
        <div>
            Pixel: {Math.round(pixel.x)}, {Math.round(pixel.y)}
        </div>
        <div>
            Lon/Lat: {lngLat.lng.toFixed(3)}, {lngLat.lat.toFixed(3)}
        </div>
    </div>
);
