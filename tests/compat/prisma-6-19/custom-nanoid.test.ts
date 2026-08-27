import { customNanoid } from "prisma-custom-nanoid";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "./generated/index.js";
import { customNanoidRelations } from "./generated-custom-nanoid/index.js";

const prisma = new PrismaClient().$extends(
  customNanoid({
    models: {
      User: {
        field: "id",
        alphabet: "abc123",
        size: 12,
      },
      Post: {
        field: "id",
        alphabet: "def456",
        size: 10,
      },
    },
    relations: customNanoidRelations,
  }),
);

beforeEach(async () => {
  await prisma.post.deleteMany();
  await prisma.user.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("Prisma 6.19 compatibility", () => {
  it("root と nested create の ID を生成する", async () => {
    const user = await prisma.user.create({
      data: {
        email: "prisma-6-19@example.com",
        posts: {
          create: {
            title: "post",
          },
        },
      },
      include: {
        posts: true,
      },
    });

    expect(user.id).toMatch(/^[abc123]{12}$/);
    expect(user.posts[0]?.id).toMatch(/^[def456]{10}$/);
  });
});
