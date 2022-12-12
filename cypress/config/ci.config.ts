import { defineConfig } from "cypress";

export default defineConfig({
  e2e: {
    // The baseUrl is set within `.github/workflows/cypress-demo.yml`
    projectId: "vq2rbp",
  },
});
