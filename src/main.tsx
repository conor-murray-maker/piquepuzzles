import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Register puzzle engines
import { EngineRegistry } from "./engines/EngineRegistry";
import { KlondikeEngine } from "./engines/KlondikeEngine";
import { FreeCellEngine } from "./engines/FreeCellEngine";

EngineRegistry.register(KlondikeEngine);
EngineRegistry.register(FreeCellEngine);

createRoot(document.getElementById("root")!).render(<App />);
