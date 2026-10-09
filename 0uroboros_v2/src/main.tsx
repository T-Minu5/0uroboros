import { StrictMode, Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import "./board-finish.css";
import "./board-interaction.css";
import "./cycle-motion.css";
import "./strategic-evaluation.css";
import "./circuit-controls.css";
import { installErrorReporting } from "./platform/errors";

// Game client entry. The Content Studio has its own page (`studio.html`, served at /author in dev) so the
// shipped client never bundles authoring code.
// Crash reports go to the game server's /errors route (off with VITE_REPORT_ERRORS=off).
installErrorReporting(import.meta.env.PROD && import.meta.env.VITE_REPORT_ERRORS !== 'off');
const Game = lazy(() => import('./App').then(module => ({default:module.App})));
createRoot(document.getElementById("root")!).render(<StrictMode><Suspense fallback={<p style={{padding:32,color:'#b7c8da'}}>Opening the Circuit…</p>}><Game/></Suspense></StrictMode>);
