import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { HouseholdApp } from "./features/households/HouseholdApp";
import "./styles/global.css";
import { AppTheme } from "./styles/theme";
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppTheme>
      <HouseholdApp />
    </AppTheme>
  </StrictMode>,
);
