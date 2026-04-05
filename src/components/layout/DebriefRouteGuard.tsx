import type React from "react";
import {Navigate, useLocation} from "react-router-dom";
import {useMission} from "../../context/MissionContext";

export function DebriefRouteGuard({children}: { children: React.ReactNode }) {
    const location = useLocation();
    const {postMission} = useMission();

    if (!postMission.metricsSnapshot) {
        return <Navigate to="/setup" replace/>;
    }

    if (location.pathname === "/results" && !postMission.nasaTlxAssessment) {
        return <Navigate to="/nasa-tlx" replace/>;
    }

    return <>{children}</>;
}

