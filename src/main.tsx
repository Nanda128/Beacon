import {StrictMode} from "react";
import ReactDOM from "react-dom/client";
import {BrowserRouter} from "react-router-dom";
import {ThemeProvider} from "./theme/ThemeProvider";
import {MissionProvider} from "./context/MissionContext";
import ErrorBoundary from "./components/ErrorBoundary";
import {registerGlobalErrorHandlers} from "./utils/errorLogging";
import App from "./App";
import "./index.css";

registerGlobalErrorHandlers();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <StrictMode>
        <BrowserRouter>
            <ThemeProvider>
                <MissionProvider>
                    <ErrorBoundary>
                        <App/>
                    </ErrorBoundary>
                </MissionProvider>
            </ThemeProvider>
        </BrowserRouter>
    </StrictMode>
);
