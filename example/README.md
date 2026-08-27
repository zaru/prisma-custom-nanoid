# Prisma CLI example

This minimal example shows how to add automatic ID generation with `prisma-custom-nanoid` to Prisma Client create operations and nested writes. It uses only SQLite and a Node.js CLI, with no framework.

## Running the example

From the repository root, build the library and install the example dependencies:

```sh
pnpm build
pnpm --dir example install
pnpm --dir example run demo
```

The `demo` script performs these steps:

1. Generates Prisma Client and the relation mapping.
2. Applies the schema to the SQLite database.
3. Builds the CLI from TypeScript.
4. Creates records and displays their IDs.

Use these commands to manage generated files and the database individually:

```sh
pnpm --dir example run generate
pnpm --dir example run db:push
pnpm --dir example run build
pnpm --dir example start
```

## What the example demonstrates

- Omitting `User.id` generates a Nano ID with the configured alphabet and size.
- `ApiKey` can use a different alphabet and size from `User`.
- Records with an explicit `id` preserve that value.
- Each item in `createManyAndReturn` receives its own ID.
- The create branch of `upsert` receives an ID.
- A nested create generates `Post.id` through the relation mapping generated from the Prisma schema.
- The extension does not interfere with unconfigured models such as `Counter`.

The `customNanoid` generator in `prisma/schema.prisma` creates `prisma/generated-custom-nanoid/index.ts`, and the CLI imports `customNanoidRelations` from that file.

The script deletes its example records before recreating them, so it can be run repeatedly.
