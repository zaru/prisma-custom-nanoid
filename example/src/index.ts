import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { customNanoid } from "prisma-custom-nanoid";
import { PrismaClient } from "../prisma/generated/client.js";
import { customNanoidRelations } from "../prisma/generated-custom-nanoid/index.js";

const exampleDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const databasePath = path.join(exampleDirectory, "prisma/example.db");
const adapter = new PrismaBetterSqlite3({
  url: `file:${databasePath}`,
});

const prisma = new PrismaClient({ adapter }).$extends(
  customNanoid({
    models: {
      User: {
        field: "id",
        alphabet: "0123456789abcdefghijklmnopqrstuvwxyz",
        size: 16,
      },
      ApiKey: {
        field: "id",
        alphabet: "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ",
        size: 24,
      },
      Post: {
        field: "id",
        alphabet: "abcdefghijklmnopqrstuvwxyz",
        size: 12,
      },
    },
    relations: customNanoidRelations,
  }),
);

async function main() {
  await prisma.post.deleteMany();
  await prisma.user.deleteMany();
  await prisma.apiKey.deleteMany();
  await prisma.counter.deleteMany();

  const generatedUser = await prisma.user.create({
    data: {
      email: "generated@example.com",
      posts: {
        create: {
          title: "nested create",
        },
      },
    },
    include: { posts: true },
  });
  const explicitUser = await prisma.user.create({
    data: {
      id: "imported-user-id",
      email: "imported@example.com",
    },
  });
  const apiKey = await prisma.apiKey.create({
    data: {
      label: "CLI sample",
    },
  });
  const counter = await prisma.counter.create({
    data: {
      value: 1,
    },
  });
  const manyUsers = await prisma.user.createManyAndReturn({
    data: [
      { email: "many-1@example.com" },
      { id: "imported-many-user", email: "many-2@example.com" },
    ],
  });
  const upsertedUser = await prisma.user.upsert({
    where: { email: "upserted@example.com" },
    create: { email: "upserted@example.com" },
    update: { email: "upserted@example.com" },
  });

  console.log(`Database: ${databasePath}`);
  console.table([
    {
      model: "User",
      case: "generated ID",
      id: generatedUser.id,
    },
    {
      model: "Post",
      case: "nested create",
      id: generatedUser.posts[0]?.id,
    },
    {
      model: "User",
      case: "explicit ID",
      id: explicitUser.id,
    },
    {
      model: "ApiKey",
      case: "different alphabet / size",
      id: apiKey.id,
    },
    {
      model: "Counter",
      case: "extension not configured",
      id: counter.id,
    },
    ...manyUsers.map((user) => ({
      model: "User",
      case: "createManyAndReturn",
      id: user.id,
    })),
    {
      model: "User",
      case: "upsert create",
      id: upsertedUser.id,
    },
  ]);
}

try {
  await main();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
