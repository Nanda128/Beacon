import {Routes, Route, Navigate} from "react-router-dom";
import {AnimatePresence} from "framer-motion";
import LandingPage from "./pages/LandingPage";
import SetupPage from "./pages/SetupPage";
import SimulationPage from "./pages/SimulationPage";
import EndMissionPage from "./pages/EndMissionPage";
import NasaTlxPage from "./pages/NasaTlxPage";
import ResultsPage from "./pages/ResultsPage";
import {DebriefRouteGuard} from "./components/layout/DebriefRouteGuard";
import TutorialRoot from "./components/tutorial/TutorialRoot";

export default function App() {
    return (
        <>
            <AnimatePresence mode="wait">
                <Routes>
                    <Route path="/" element={<LandingPage/>}/>
                    <Route path="/setup" element={<SetupPage/>}/>
                    <Route path="/simulation" element={<SimulationPage/>}/>
                    <Route path="/mission-end" element={<DebriefRouteGuard><EndMissionPage/></DebriefRouteGuard>}/>
                    <Route path="/nasa-tlx" element={<DebriefRouteGuard><NasaTlxPage/></DebriefRouteGuard>}/>
                    <Route path="/results" element={<DebriefRouteGuard><ResultsPage/></DebriefRouteGuard>}/>
                    <Route path="*" element={<Navigate to="/" replace/>}/>
                </Routes>
            </AnimatePresence>
            <TutorialRoot/>
        </>
    );
}
