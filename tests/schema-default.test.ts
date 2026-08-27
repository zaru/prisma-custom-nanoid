import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const schemaPath = path.join(
  currentDirectory,
  "fixtures/postgresql-defaults.prisma",
);
const pnpmCommand = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

describe("Prisma schema defaults", () => {
  it("PostgreSQL の ID 列に DB default を生成しない", () => {
    const migrationSql = execFileSync(
      pnpmCommand,
      [
        "exec",
        "prisma",
        "migrate",
        "diff",
        "--from-empty",
        "--to-schema",
        schemaPath,
        "--script",
      ],
      { encoding: "utf8" },
    );

    expect(migrationSql).not.toContain("DEFAULT");
    expect(migrationSql).toContain('CREATE TABLE "User"');
    expect(migrationSql).toContain('CREATE TABLE "Post"');
    expect(migrationSql).toContain('CREATE TABLE "ApiKey"');
  });
});
