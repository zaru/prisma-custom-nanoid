# prisma-custom-nanoid

A Prisma Client extension that generates Nano IDs with a configurable alphabet and length.

```prisma
model User {
  /// @customNanoid(alphabet: "0123456789abcdefghijklmnopqrstuvwxyz")
  id    String @id @default(nanoid(16))
  email String @unique
  posts Post[]
}
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

Add a `@customNanoid` documentation directive to each target field. Set the alphabet in the directive and the size in Prisma's client-side `nanoid(size)` default.

```prisma
model User {
  /// @customNanoid(alphabet: "0123456789abcdefghijklmnopqrstuvwxyz")
  id    String @id @default(nanoid(16))
  email String @unique
  posts Post[]
}

model Post {
  /// @customNanoid(alphabet: "abcdefghijklmnopqrstuvwxyz")
  id       String @id @default(nanoid(12))
  title    String
  authorId String
  author   User   @relation(fields: [authorId], references: [id])
}
```

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

Running `prisma generate` creates the model configuration from annotated fields and a mapping from every relation field in the Prisma schema.

```sh
pnpm exec prisma generate
```

```ts
import { PrismaClient } from "./generated/prisma/client.js";
import { customNanoidConfig } from "./generated/custom-nanoid/index.js";
import { customNanoid } from "prisma-custom-nanoid";

const prisma = new PrismaClient({ adapter }).$extends(
  customNanoid(customNanoidConfig),
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

The extension does not generate IDs for models without an annotated field. Traversal still continues through the generated relation mapping so configured descendants can be reached from an unconfigured root or intermediate model.

## Regenerating after schema changes

Regenerate Prisma Client and the custom Nano ID configuration whenever you change an alphabet, size, configured field, model, or relation.

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
