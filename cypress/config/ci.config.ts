import { defineConfig } from "cypress";

export default defineConfig({
  e2e: {
    baseUrl: "http://localhost:8000",
    // TODO: A projectId needs to be added for video recordings
    // of tests
  },
});
