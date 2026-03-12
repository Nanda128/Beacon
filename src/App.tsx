import {Routes, Route, Navigate} from "react-router-dom";
import {AnimatePresence} from "framer-motion";
import LandingPage from "./pages/LandingPage";
import SetupPage from "./pages/SetupPage";
import SimulationPage from "./pages/SimulationPage";

export default function App() {
    return (
        <AnimatePresence mode="wait">
            <Routes>
                <Route path="/" element={<LandingPage/>}/>
                <Route path="/setup" element={<SetupPage/>}/>
                <Route path="/simulation" element={<SimulationPage/>}/>
                <Route path="*" element={<Navigate to="/" replace/>}/>
            </Routes>
        </AnimatePresence>
    );
}
