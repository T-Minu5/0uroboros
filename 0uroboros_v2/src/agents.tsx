import { StrictMode, Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

// Agents page entry: the local AI league, agent switches and mentoring. Built only by the full/studio build, never by `build:client`.
const Agents = lazy(() => import('./AgentsPage').then(module => ({ default: module.AgentsPage })));
createRoot(document.getElementById("root")!).render(<StrictMode><Suspense fallback={<p style={{ padding: 32, color: '#b7c8da' }}>Opening agents…</p>}><Agents/></Suspense></StrictMode>);
