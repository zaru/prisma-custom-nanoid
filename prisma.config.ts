import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "prisma/config";

const rootDirectory = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  schema: path.join(rootDirectory, "tests/fixtures/schema.prisma"),
  datasource: {
    url: `file:${path.join(rootDirectory, "tests/fixtures/test.db")}`,
  },
});
