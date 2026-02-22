import {useCallback, useState} from "react";

export type SelectionMode = "replace" | "add" | "toggle";

export function useDroneSelection(initialIds: string[] = []) {
    const [selectedIds, setSelectedIds] = useState<string[]>(initialIds);

    const select = useCallback((ids: string[]) => setSelectedIds(ids), []);

    const add = useCallback((ids: string[]) => {
        setSelectedIds((prev) => {
            const next = new Set(prev);
            ids.forEach((id) => next.add(id));
            return Array.from(next);
        });
    }, []);

    const toggle = useCallback((ids: string[]) => {
        setSelectedIds((prev) => {
            const next = new Set(prev);
            ids.forEach((id) => {
                if (next.has(id)) {
                    next.delete(id);
                } else {
                    next.add(id);
                }
            });
            return Array.from(next);
        });
    }, []);

    const clear = useCallback(() => setSelectedIds([]), []);

    const applySelection = useCallback((ids: string[], mode: SelectionMode) => {
        if (ids.length === 0 && mode === "replace") {
            clear();
            return;
        }
        if (mode === "add") {
            add(ids);
            return;
        }
        if (mode === "toggle") {
            toggle(ids);
            return;
        }
        select(ids);
    }, [add, clear, select, toggle]);

    return {
        selectedIds,
        select,
        add,
        toggle,
        clear,
        applySelection,
        setSelectedIds,
    };
}

