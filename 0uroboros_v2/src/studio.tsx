import { StrictMode, Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

// Content Studio entry: offline authoring tooling. Built only by the full/studio build, never by `build:client`.
const Authoring = lazy(() => import('./authoring/AuthoringApp').then(module => ({default:module.AuthoringApp})));
createRoot(document.getElementById("root")!).render(<StrictMode><Suspense fallback={<p style={{padding:32,color:'#b7c8da'}}>Opening content studio…</p>}><Authoring/></Suspense></StrictMode>);
