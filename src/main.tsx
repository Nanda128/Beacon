import {StrictMode} from "react";
import ReactDOM from "react-dom/client";
import {BrowserRouter} from "react-router-dom";
import {ThemeProvider} from "./theme/ThemeProvider";
import {MissionProvider} from "./context/MissionContext";
import App from "./App";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <StrictMode>
        <BrowserRouter>
            <ThemeProvider>
                <MissionProvider>
                    <App/>
                </MissionProvider>
            </ThemeProvider>
        </BrowserRouter>
    </StrictMode>
);
