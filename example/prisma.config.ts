import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "prisma/config";

const exampleDirectory = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  schema: path.join(exampleDirectory, "prisma/schema.prisma"),
  datasource: {
    url: `file:${path.join(exampleDirectory, "prisma/example.db")}`,
  },
});
