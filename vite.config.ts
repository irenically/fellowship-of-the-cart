import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  base: "/fellowship-of-the-cart/",
  test: { environment: "jsdom", clearMocks: true },
});
