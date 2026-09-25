import { StrictMode, Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import "./board-finish.css";
import "./board-interaction.css";
import "./cycle-motion.css";
import "./strategic-evaluation.css";
import "./circuit-controls.css";

const Game = lazy(() => import('./App').then(module => ({default:module.App})));
const Authoring = lazy(() => import('./authoring/AuthoringApp').then(module => ({default:module.AuthoringApp})));
const authoring = window.location.pathname === '/author' || window.location.pathname.startsWith('/author/');
createRoot(document.getElementById("root")!).render(<StrictMode><Suspense fallback={<p style={{padding:32,color:'#b7c8da'}}>Opening {authoring?'content studio':'the Circuit'}…</p>}>{authoring?<Authoring/>:<Game/>}</Suspense></StrictMode>);
