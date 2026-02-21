import {useCallback, useEffect, useRef, useState} from "react";
import maplibregl, {Map} from "maplibre-gl";
import {INITIAL_VIEW, MAP_STYLE_URL, NORTH_BEARING_THRESHOLD, PITCH_ZERO_THRESHOLD} from "../config/mapConfig";

export const useMapInstance = () => {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const mapRef = useRef<Map | null>(null);
    const [bearing, setBearing] = useState(0);
    const [pitch, setPitch] = useState(0);

    useEffect(() => {
        if (!containerRef.current || mapRef.current) return;

        const apiKey = import.meta.env.VITE_MAPTILER_API_KEY as string | undefined;
        if (!apiKey) {
            console.error("Missing VITE_MAPTILER_API_KEY env var. Create a .env.local file and set it.");
            return;
        }

        const map = new maplibregl.Map({
            container: containerRef.current,
            style: MAP_STYLE_URL(apiKey),
            center: INITIAL_VIEW.center,
            zoom: INITIAL_VIEW.zoom,
            pitch: INITIAL_VIEW.pitch,
            bearing: 0,
            antialias: true,
        });

        mapRef.current = map;

        const syncOrientation = () => {
            setBearing(map.getBearing());
            setPitch(map.getPitch());
        };

        map.on("rotate", syncOrientation);
        map.on("pitch", syncOrientation);
        map.on("move", syncOrientation);

        return () => {
            map.off("rotate", syncOrientation);
            map.off("pitch", syncOrientation);
            map.off("move", syncOrientation);
            map.remove();
            mapRef.current = null;
        };
    }, []);

    const resetNorth = useCallback(() => {
        const map = mapRef.current;
        if (!map) return;

        map.stop();
        map.easeTo({
            bearing: 0,
            pitch: 0,
            duration: 1000,
        });
    }, []);

    return {
        containerRef,
        mapRef,
        bearing,
        pitch,
        isOffNorth:
            Math.abs(bearing) > NORTH_BEARING_THRESHOLD || Math.abs(pitch) > PITCH_ZERO_THRESHOLD,
        resetNorth,
    } as const;
};
