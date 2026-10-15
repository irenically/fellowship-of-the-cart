import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./features/shopping-list/App";
import "./styles/global.css";
import { AppTheme } from "./styles/theme";
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppTheme>
      <App />
    </AppTheme>
  </StrictMode>,
);
