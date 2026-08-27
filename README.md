# prisma-custom-nanoid

A Prisma Client extension that generates Nano IDs with a configurable alphabet and length.

```ts
const prisma = new PrismaClient({ adapter }).$extends(
  customNanoid({
    models: {
      User: {
        field: "id",
        alphabet: "0123456789abcdefghijklmnopqrstuvwxyz",
        size: 16,
      },
    },
  }),
);
```

## Requirements

- Node.js 20.19 or later, 22.12 or later, or 24 or later
- Prisma 6 or Prisma 7

## Installation

```sh
pnpm add prisma-custom-nanoid
```

Install `@prisma/client` in your application separately.

## Usage

Set a placeholder database default on each target field so that Prisma's types allow the ID to be omitted and the extension can provide a value. The extension replaces this value before Prisma executes a create operation.

```prisma
model User {
  id    String @id @default("")
  email String @unique
  posts Post[]
}

model Post {
  id       String @id @default("")
  title    String
  authorId String
  author   User   @relation(fields: [authorId], references: [id])
}
```

Add the relation mapping generator to the same Prisma schema. Configure the Prisma Client generator for your Prisma major version.

### Prisma 7

```prisma
generator client {
  provider = "prisma-client"
  output   = "./generated/prisma"
}

generator customNanoid {
  provider = "prisma-custom-nanoid-generator"
  output   = "./generated/custom-nanoid"
}
```

With Prisma 7, configure the datasource URL in `prisma.config.ts`.

### Prisma 6

Use the `prisma-client-js` generator, which is available in all Prisma 6 versions, and define the datasource URL in `schema.prisma`.

```prisma
generator client {
  provider = "prisma-client-js"
  output   = "./generated/prisma"
}

generator customNanoid {
  provider = "prisma-custom-nanoid-generator"
  output   = "./generated/custom-nanoid"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

Running `prisma generate` creates a mapping from every relation field in the Prisma schema.

```sh
pnpm exec prisma generate
```

```ts
import { PrismaClient } from "./generated/prisma/client.js";
import { customNanoidRelations } from "./generated/custom-nanoid/index.js";
import { customNanoid } from "prisma-custom-nanoid";

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
        alphabet: "0123456789abcdefghijklmnopqrstuvwxyz",
        size: 20,
      },
    },
    relations: customNanoidRelations,
  }),
);
```

The example above uses Prisma 7 imports. When using Prisma 6 with `prisma-client-js`, import `PrismaClient` from a path such as `./generated/prisma/index.js`, depending on your output directory, and typically instantiate it with `new PrismaClient()`.

## Supported operations

- `create`: fills the root record and nested writes resolved through the relation mapping
- `createMany` / `createManyAndReturn`: fills each item in `data`
- `update`: leaves the root ID unchanged and fills create branches in nested writes
- `upsert`: fills `create` and create branches in nested writes under `update`
- nested `create` / `createMany` / `connectOrCreate` / `upsert`
- create branches contained in nested `update` / `updateMany`

The extension does not modify `where`, `connect`, `delete`, `disconnect`, or regular update scalar values. It passes unrecognized argument shapes and nested writes without a mapping through to Prisma unchanged. Because Prisma does not allow relation writes in top-level `createMany` or `createManyAndReturn`, only the root items are processed for those operations.

The extension does not generate IDs for models without a Nano ID configuration. If such a model has a relation mapping, traversal continues so that configured descendant models can still be reached from an unconfigured root or intermediate model. The `relations` option is optional, so the original `{ models }`-only configuration remains supported.

## Regenerating after schema changes

Regenerate Prisma Client and the relation mapping whenever you add, remove, or rename a relation field.

```sh
pnpm exec prisma generate
```

Either commit the generated `index.ts` with your application source or generate it before type checking, building, and deploying. To detect stale generated files, add a diff check to CI:

```sh
pnpm exec prisma generate
git diff --exit-code
```

Do not edit generated files directly. Update the Prisma schema and regenerate them instead. Output is sorted by model and field name, so the same schema produces the same result.

## Example project

The `example` directory contains a framework-free CLI example using SQLite and Prisma Client. It demonstrates a single `create`, `createManyAndReturn`, `upsert`, nested create, preservation of explicit IDs, and non-interference with unconfigured models.

```sh
pnpm build
pnpm --dir example install
pnpm --dir example run demo
```

See [example/README.md](./example/README.md) for the project structure and individual commands.

## Development

```sh
pnpm install
pnpm validate
```

In addition to the standard Prisma 7 tests, `pnpm validate` runs compatibility tests against Prisma 6.0 and Prisma 6.19.

## License

MIT
