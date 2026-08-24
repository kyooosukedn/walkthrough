import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 3000,
  },
  build: {
    rollupOptions: {
      output: {
        // Function form — object form misses deep imports like
        // elkjs/lib/elk.bundled.js.
        manualChunks(id: string) {
          if (!id.includes("node_modules")) return undefined;
          if (id.includes("elkjs")) return "layout";
          if (id.includes("@xyflow")) return "flow";
          if (id.includes("framer-motion")) return "motion";
          if (id.includes("react-dom") || /node_modules[\\/]react[\\/]/.test(id)) return "react";
          return undefined;
        },
      },
    },
  },
});
