import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

describe("package exports", () => {
  it("ESM import から公開 API を読み込める", async () => {
    const packageModule = await import("prisma-custom-nanoid");

    expect(packageModule.customNanoid).toEqual(expect.any(Function));
  });

  it("CommonJS require から公開 API を読み込める", () => {
    const require = createRequire(import.meta.url);
    const packageModule = require("prisma-custom-nanoid") as {
      customNanoid?: unknown;
    };

    expect(packageModule.customNanoid).toEqual(expect.any(Function));
  });
});
