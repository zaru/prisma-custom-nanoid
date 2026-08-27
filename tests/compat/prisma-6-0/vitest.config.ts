import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["custom-nanoid.test.ts"],
  },
});
