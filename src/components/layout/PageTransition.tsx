import {type ReactNode, useEffect, useRef, useState} from "react";

/**
 * Wraps page content in an opacity + translateY entrance transition.
 *
 * Duration kept under 300 ms per Nielsen Norman Group (2023) guidelines,
 * transitions at this speed feel instantaneous while giving spatial continuity.
 *
 * Respects `prefers-reduced-motion` automatically via the CSS media query
 * in index.css that zeros out all transition durations.
 */
export function PageTransition({children}: {children: ReactNode}) {
    const [visible, setVisible] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const id = requestAnimationFrame(() => setVisible(true));
        return () => cancelAnimationFrame(id);
    }, []);

    return (
        <div
            ref={ref}
            style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                opacity: visible ? 1 : 0,
                transform: visible ? "translateY(0)" : "translateY(14px)",
                transition: "opacity 0.25s ease-out, transform 0.25s ease-out",
            }}
        >
            {children}
        </div>
    );
}
