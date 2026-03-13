import {useCallback, useRef} from "react";
import type {Alert} from "../domain/types/alert";
import {alertAudioConfig} from "../config/alerts";
import {logError} from "../utils/errorLogging";

export function useAlertAudio(enabled: boolean) {
    const audioCtxRef = useRef<AudioContext | null>(null);
    const lastPlayRef = useRef<number>(0);

    const getContext = useCallback(() => {
        if (!audioCtxRef.current) {
            audioCtxRef.current = new AudioContext();
        }
        if (audioCtxRef.current.state === "suspended") {
            audioCtxRef.current.resume();
        }
        return audioCtxRef.current;
    }, []);

    const playTone = useCallback(
        (frequency: number, duration: number, repeat: number, gap: number) => {
            if (!enabled) return;
            const now = Date.now();
            if (now - lastPlayRef.current < 1000) return;
            lastPlayRef.current = now;

            try {
                const ctx = getContext();
                for (let i = 0; i < repeat; i++) {
                    const startTime = ctx.currentTime + i * (duration + gap);
                    const osc = ctx.createOscillator();
                    const gain = ctx.createGain();
                    osc.type = "sine";
                    osc.frequency.value = frequency;
                    gain.gain.setValueAtTime(0.15, startTime);
                    gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
                    osc.connect(gain);
                    gain.connect(ctx.destination);
                    osc.start(startTime);
                    osc.stop(startTime + duration);
                }
            } catch (err) {
                logError(err, {
                    origin: "audio.play-tone",
                    context: {
                        frequency,
                        duration,
                        repeat,
                        gap,
                        enabled,
                    },
                });
            }
        },
        [enabled, getContext],
    );

    const playForAlerts = useCallback(
        (alerts: Alert[]) => {
            if (!enabled || alerts.length === 0) return;
            const hasCritical = alerts.some((a) => a.severity === "critical");
            const hasHigh = alerts.some((a) => a.severity === "high");
            if (hasCritical) {
                const c = alertAudioConfig.critical;
                playTone(c.frequency, c.duration, c.repeat, c.gap);
            } else if (hasHigh) {
                const c = alertAudioConfig.high;
                playTone(c.frequency, c.duration, c.repeat, c.gap);
            }
        },
        [enabled, playTone],
    );

    return {playForAlerts};
}

