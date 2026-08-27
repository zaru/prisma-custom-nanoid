import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { type CustomNanoidOptions, customNanoid } from "../src/index.js";
import { PrismaClient } from "./fixtures/generated/client.js";
import { customNanoidRelations } from "./fixtures/generated-custom-nanoid/index.js";

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const databasePath = path.join(currentDirectory, "fixtures/test.db");
const adapter = new PrismaBetterSqlite3({
  url: `file:${databasePath}`,
});

const prisma = new PrismaClient({ adapter }).$extends(
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
      Comment: {
        field: "id",
        alphabet: "ghi789",
        size: 9,
      },
      ApiKey: {
        field: "id",
        alphabet: "xyz789",
        size: 8,
      },
      Token: {
        field: "id",
        alphabet: "tuv456",
        size: 7,
      },
    },
    relations: customNanoidRelations,
  }),
);

beforeEach(async () => {
  await prisma.comment.deleteMany();
  await prisma.token.deleteMany();
  await prisma.post.deleteMany();
  await prisma.project.deleteMany();
  await prisma.account.deleteMany();
  await prisma.user.deleteMany();
  await prisma.apiKey.deleteMany();
  await prisma.counter.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("customNanoid", () => {
  it("create で未指定の ID を生成し、明示値を保持する", async () => {
    const generated = await prisma.user.create({
      data: { email: "generated@example.com" },
    });
    const explicit = await prisma.user.create({
      data: {
        id: "explicit-id",
        email: "explicit@example.com",
      },
    });

    expect(generated.id).toMatch(/^[abc123]{12}$/);
    expect(explicit.id).toBe("explicit-id");
  });

  it("createMany と createManyAndReturn の各要素を補完する", async () => {
    const created = await prisma.user.createMany({
      data: [
        { email: "many-1@example.com" },
        { id: "many-explicit", email: "many-2@example.com" },
      ],
    });
    const returned = await prisma.user.createManyAndReturn({
      data: [
        { email: "return-1@example.com" },
        { id: "return-explicit", email: "return-2@example.com" },
      ],
    });
    const returnedByEmail = new Map(returned.map((user) => [user.email, user]));

    expect(created.count).toBe(2);
    await expect(
      prisma.user.findUniqueOrThrow({
        where: { email: "many-1@example.com" },
      }),
    ).resolves.toMatchObject({ id: expect.stringMatching(/^[abc123]{12}$/) });
    expect(returnedByEmail.get("return-1@example.com")?.id).toMatch(
      /^[abc123]{12}$/,
    );
    expect(returnedByEmail.get("return-2@example.com")?.id).toBe(
      "return-explicit",
    );
  });

  it("upsert の create だけ root ID を補完し、where と update の ID を変更しない", async () => {
    const where = { email: "upsert@example.com" };
    const created = await prisma.user.upsert({
      where,
      create: { email: where.email },
      update: { email: "ignored@example.com" },
    });
    const updated = await prisma.user.upsert({
      where,
      create: { email: where.email },
      update: { email: "updated@example.com" },
    });

    expect(where).toEqual({ email: "upsert@example.com" });
    expect(created.id).toMatch(/^[abc123]{12}$/);
    expect(updated.id).toBe(created.id);
    expect(updated.email).toBe("updated@example.com");
  });

  it("nested create と深い nested create を再帰的に補完する", async () => {
    const user = await prisma.user.create({
      data: {
        email: "nested@example.com",
        posts: {
          create: {
            title: "post",
            comments: {
              create: [
                { body: "first" },
                { id: "comment-explicit", body: "second" },
              ],
            },
          },
        },
      },
      include: {
        posts: { include: { comments: { orderBy: { body: "asc" } } } },
      },
    });

    expect(user.posts[0]?.id).toMatch(/^[def456]{10}$/);
    expect(user.posts[0]?.comments[0]?.id).toMatch(/^[ghi789]{9}$/);
    expect(user.posts[0]?.comments[1]?.id).toBe("comment-explicit");
  });

  it("nested createMany と connectOrCreate を補完する", async () => {
    const user = await prisma.user.create({
      data: {
        email: "nested-many@example.com",
        posts: {
          createMany: {
            data: [
              { title: "generated" },
              { id: "post-explicit", title: "explicit" },
            ],
          },
        },
      },
      include: { posts: { orderBy: { title: "asc" } } },
    });
    const connected = await prisma.user.create({
      data: {
        email: "connect-or-create@example.com",
        posts: {
          connectOrCreate: {
            where: { id: "missing-post" },
            create: { title: "connected" },
          },
        },
      },
      include: { posts: true },
    });

    expect(user.posts[0]?.id).toBe("post-explicit");
    expect(user.posts[1]?.id).toMatch(/^[def456]{10}$/);
    expect(connected.posts[0]?.id).toMatch(/^[def456]{10}$/);
  });

  it("update と upsert.update 内の nested create を補完する", async () => {
    const user = await prisma.user.create({
      data: { email: "update-nested@example.com" },
    });
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: {
        posts: { create: { title: "from-update" } },
      },
      include: { posts: true },
    });
    const upserted = await prisma.user.upsert({
      where: { id: user.id },
      create: { email: "not-created@example.com" },
      update: {
        posts: { create: { title: "from-upsert-update" } },
      },
      include: { posts: { orderBy: { title: "asc" } } },
    });

    expect(updated.posts[0]?.id).toMatch(/^[def456]{10}$/);
    expect(upserted.posts).toHaveLength(2);
    expect(upserted.posts[1]?.id).toMatch(/^[def456]{10}$/);
  });

  it("nested upsert の create と update 内 nested create を処理する", async () => {
    const user = await prisma.user.create({
      data: {
        email: "nested-upsert@example.com",
        posts: { create: { id: "existing-post", title: "existing" } },
      },
    });
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: {
        posts: {
          upsert: [
            {
              where: { id: "new-post" },
              create: {
                title: "created",
                comments: { create: { body: "created-comment" } },
              },
              update: { title: "unused" },
            },
            {
              where: { id: "existing-post" },
              create: { title: "unused" },
              update: {
                comments: { create: { body: "updated-comment" } },
              },
            },
          ],
        },
      },
      include: {
        posts: {
          orderBy: { title: "asc" },
          include: { comments: true },
        },
      },
    });

    expect(updated.posts).toHaveLength(2);
    for (const post of updated.posts) {
      expect(post.comments[0]?.id).toMatch(/^[ghi789]{9}$/);
    }
  });

  it("未設定 root と中間モデルから設定済み子孫へ到達する", async () => {
    const account = await prisma.account.create({
      data: {
        name: "account",
        projects: {
          create: {
            name: "project",
            tokens: { create: { label: "token" } },
          },
        },
      },
      include: {
        projects: { include: { tokens: true } },
      },
    });

    expect(account.id).toEqual(expect.any(Number));
    expect(account.projects[0]?.id).toEqual(expect.any(Number));
    expect(account.projects[0]?.tokens[0]?.id).toMatch(/^[tuv456]{7}$/);
  });

  it("設定されていないモデルと mapping のない relation write に干渉しない", async () => {
    const counter = await prisma.counter.create({ data: { value: 1 } });
    const user = await prisma.user.create({
      data: { email: "no-mapping@example.com" },
    });
    const token = await prisma.token.create({
      data: {
        label: "direct",
        project: {
          create: {
            name: "unmapped-project",
            account: { create: { name: "unmapped-account" } },
          },
        },
        user: { connect: { id: user.id } },
      },
    });

    expect(counter).toEqual({ id: expect.any(Number), value: 1 });
    expect(token.id).toMatch(/^[tuv456]{7}$/);
  });

  it("relations を省略した既存形式を維持する", async () => {
    const legacyPrisma = new PrismaClient({ adapter }).$extends(
      customNanoid({
        models: {
          ApiKey: {
            field: "id",
            alphabet: "legacy",
            size: 6,
          },
        },
      }),
    );

    const apiKey = await legacyPrisma.apiKey.create({
      data: { label: "legacy" },
    });

    expect(apiKey.id).toMatch(/^[legacy]{6}$/);
  });

  it.each([
    [{ models: {} }, "models must contain at least one"],
    [
      { models: { User: { field: "", alphabet: "abc", size: 10 } } },
      "User.field",
    ],
    [
      { models: { User: { field: "id", alphabet: "", size: 10 } } },
      "User.alphabet",
    ],
    [
      { models: { User: { field: "id", alphabet: "abc", size: 0 } } },
      "User.size",
    ],
    [
      {
        models: { User: { field: "id", alphabet: "abc", size: 10 } },
        relations: null,
      },
      "relations must be an object",
    ],
    [
      {
        models: { User: { field: "id", alphabet: "abc", size: 10 } },
        relations: { User: [] },
      },
      "relations.User",
    ],
    [
      {
        models: { User: { field: "id", alphabet: "abc", size: 10 } },
        relations: { User: { "": "Post" } },
      },
      "field names",
    ],
    [
      {
        models: { User: { field: "id", alphabet: "abc", size: 10 } },
        relations: { User: { posts: "" } },
      },
      "relations.User.posts",
    ],
  ])("不正な設定を初期化時に拒否する", (options, message) => {
    expect(() => customNanoid(options as CustomNanoidOptions)).toThrow(message);
  });
});
