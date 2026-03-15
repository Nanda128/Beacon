import type React from "react";
import {Navigate} from "react-router-dom";
import {useMission} from "../../context/MissionContext";

export function DebriefRouteGuard({children}: { children: React.ReactNode }) {
    const {postMission} = useMission();

    if (!postMission.metricsSnapshot) {
        return <Navigate to="/setup" replace />;
    }

    return <>{children}</>;
}

