// src/main.tsx
// Entry point. Vite scaffolds this file by default — we replace it
// with a minimal version (no index.css needed; App.css carries the styles).

import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
