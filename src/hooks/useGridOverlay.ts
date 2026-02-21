import {useCallback, useEffect, useRef, useState} from "react";
import type {RefObject} from "react";
import type {Map, MapMouseEvent} from "maplibre-gl";
import {drawGridOverlay} from "../utils/mapGrid";
import type {CursorInfo} from "../utils/mapGrid";

interface UseGridOverlayParams {
    mapRef: RefObject<Map | null>;
    containerRef: RefObject<HTMLDivElement | null>;
    isEnabled: boolean;
}

export const useGridOverlay = ({mapRef, containerRef, isEnabled}: UseGridOverlayParams) => {
    const gridCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const [cursorInfo, setCursorInfo] = useState<CursorInfo | null>(null);

    const drawGrid = useCallback(() => {
        const map = mapRef.current;
        const canvas = gridCanvasRef.current;
        const container = containerRef.current;
        if (!map || !canvas || !container) return;

        drawGridOverlay({map, canvas, container, showGrid: isEnabled});
    }, [containerRef, isEnabled, mapRef]);

    useEffect(() => {
        const map = mapRef.current;
        if (!map) return;

        const redraw = () => drawGrid();

        map.on("move", redraw);
        map.on("zoom", redraw);
        map.on("rotate", redraw);
        map.on("pitch", redraw);
        map.on("resize", redraw);

        redraw();

        return () => {
            map.off("move", redraw);
            map.off("zoom", redraw);
            map.off("rotate", redraw);
            map.off("pitch", redraw);
            map.off("resize", redraw);
        };
    }, [drawGrid, mapRef]);

    useEffect(() => {
        const map = mapRef.current;
        if (!map) {
            setCursorInfo(null);
            return;
        }

        if (!isEnabled) {
            setCursorInfo(null);
            return;
        }

        const handlePointerMove = (e: MapMouseEvent) => {
            setCursorInfo({
                pixel: {x: e.point.x, y: e.point.y},
                lngLat: {lng: e.lngLat.lng, lat: e.lngLat.lat},
            });
        };

        map.on("mousemove", handlePointerMove);

        return () => {
            map.off("mousemove", handlePointerMove);
            setCursorInfo(null);
        };
    }, [isEnabled, mapRef]);

    return {
        gridCanvasRef,
        cursorInfo,
    } as const;
};
