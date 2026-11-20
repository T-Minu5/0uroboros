import { StrictMode, Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

// League console entry: the local AI league, its ruleset, agent settings, chat and mentoring. Built only by the full/studio build, never by `build:client`.
const Agents = lazy(() => import('./AgentsPage').then(module => ({ default: module.AgentsPage })));
createRoot(document.getElementById("root")!).render(<StrictMode><Suspense fallback={<p style={{ padding: 32, color: '#93a1b8', background: '#05070c', minHeight: '100vh', margin: 0 }}>Opening the league console</p>}><Agents/></Suspense></StrictMode>);
