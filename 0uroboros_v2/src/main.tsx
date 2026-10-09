import { StrictMode, Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import "./board-finish.css";
import "./board-interaction.css";
import "./cycle-motion.css";
import "./strategic-evaluation.css";
import "./circuit-controls.css";

// Game client entry. The Content Studio has its own page (`studio.html`, served at /author in dev) so the
// shipped client never bundles authoring code.
const Game = lazy(() => import('./App').then(module => ({default:module.App})));
createRoot(document.getElementById("root")!).render(<StrictMode><Suspense fallback={<p style={{padding:32,color:'#b7c8da'}}>Opening the Circuit…</p>}><Game/></Suspense></StrictMode>);
