import { customNanoid } from "prisma-custom-nanoid";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "./generated/index.js";
import { customNanoidConfig } from "./generated-custom-nanoid/index.js";

const prisma = new PrismaClient().$extends(customNanoid(customNanoidConfig));

beforeEach(async () => {
  await prisma.comment.deleteMany();
  await prisma.post.deleteMany();
  await prisma.user.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("Prisma 6.0 compatibility", () => {
  it("root と nested create の ID を生成する", async () => {
    const user = await prisma.user.create({
      data: {
        email: "prisma-6-0@example.com",
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

  it("明示 ID を保持し、nested update 内の create を補完する", async () => {
    const user = await prisma.user.create({
      data: {
        id: "explicit-user",
        email: "prisma-6-0-update@example.com",
        posts: { create: { id: "explicit-post", title: "post" } },
      },
    });
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: {
        posts: {
          update: {
            where: { id: "explicit-post" },
            data: { comments: { create: { body: "comment" } } },
          },
        },
      },
      include: { posts: { include: { comments: true } } },
    });

    expect(updated.id).toBe("explicit-user");
    expect(updated.posts[0]?.id).toBe("explicit-post");
    expect(updated.posts[0]?.comments[0]?.id).toMatch(/^[ghi789]{9}$/);
  });
});
