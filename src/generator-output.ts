interface DmmfDefaultFunctionLike {
  name: string;
  args: readonly unknown[];
}

interface DmmfFieldLike {
  name: string;
  kind: string;
  type: string;
  default?: unknown;
  documentation?: string;
}

interface DmmfModelLike {
  name: string;
  fields: readonly DmmfFieldLike[];
}

export interface GeneratedModelConfig {
  field: string;
  alphabet: string;
  size: number;
}

export type GeneratedModels = Readonly<
  Record<string, Readonly<GeneratedModelConfig>>
>;

export type GeneratedRelations = Readonly<
  Record<string, Readonly<Record<string, string>>>
>;

export interface GeneratedConfiguration {
  models: GeneratedModels;
  relations: GeneratedRelations;
}

const DEFAULT_NANOID_SIZE = 21;
const DIRECTIVE_NAME = "@customNanoid";
const DIRECTIVE_PATTERN =
  /^\s*@customNanoid\(\s*alphabet\s*:\s*("(?:\\.|[^"\\])*")\s*\)\s*$/;

function compareNames(left: string, right: string): number {
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
}

function parseAlphabet(
  modelName: string,
  field: DmmfFieldLike,
): string | undefined {
  const directiveLines = (field.documentation ?? "")
    .split(/\r?\n/)
    .filter((line) => line.includes(DIRECTIVE_NAME));
  if (directiveLines.length === 0) {
    return undefined;
  }
  if (directiveLines.length > 1) {
    throw new TypeError(
      `prisma-custom-nanoid: ${modelName}.${field.name} must contain exactly one ${DIRECTIVE_NAME} directive.`,
    );
  }

  const match = DIRECTIVE_PATTERN.exec(directiveLines[0] ?? "");
  if (!match?.[1]) {
    throw new TypeError(
      `prisma-custom-nanoid: ${modelName}.${field.name} has an invalid ${DIRECTIVE_NAME} directive. Expected ${DIRECTIVE_NAME}(alphabet: "characters").`,
    );
  }

  let alphabet: unknown;
  try {
    alphabet = JSON.parse(match[1]);
  } catch {
    throw new TypeError(
      `prisma-custom-nanoid: ${modelName}.${field.name} has an invalid JSON string in its ${DIRECTIVE_NAME} directive.`,
    );
  }

  if (
    typeof alphabet !== "string" ||
    alphabet.length === 0 ||
    alphabet.length > 256
  ) {
    throw new TypeError(
      `prisma-custom-nanoid: ${modelName}.${field.name} alphabet must contain between 1 and 256 characters.`,
    );
  }

  return alphabet;
}

function isDefaultFunction(value: unknown): value is DmmfDefaultFunctionLike {
  return (
    typeof value === "object" &&
    value !== null &&
    "name" in value &&
    typeof value.name === "string" &&
    "args" in value &&
    Array.isArray(value.args)
  );
}

function parseSize(modelName: string, field: DmmfFieldLike): number {
  if (
    !isDefaultFunction(field.default) ||
    field.default.name !== "nanoid" ||
    field.default.args.length > 1
  ) {
    throw new TypeError(
      `prisma-custom-nanoid: ${modelName}.${field.name} must use @default(nanoid()) or @default(nanoid(size)).`,
    );
  }

  const size = field.default.args[0] ?? DEFAULT_NANOID_SIZE;
  if (!Number.isSafeInteger(size) || Number(size) <= 0) {
    throw new TypeError(
      `prisma-custom-nanoid: ${modelName}.${field.name} nanoid size must be a positive integer.`,
    );
  }

  return Number(size);
}

export function buildModels(models: readonly DmmfModelLike[]): GeneratedModels {
  const configurations: Record<string, GeneratedModelConfig> = {};

  for (const model of [...models].sort((left, right) =>
    compareNames(left.name, right.name),
  )) {
    const configuredFields = model.fields.flatMap((field) => {
      const alphabet = parseAlphabet(model.name, field);
      return alphabet === undefined ? [] : [{ field, alphabet }];
    });
    if (configuredFields.length > 1) {
      throw new TypeError(
        `prisma-custom-nanoid: ${model.name} has multiple ${DIRECTIVE_NAME} fields, but only one field per model is supported.`,
      );
    }

    const configured = configuredFields[0];
    if (!configured) {
      continue;
    }
    if (
      configured.field.kind !== "scalar" ||
      configured.field.type !== "String"
    ) {
      throw new TypeError(
        `prisma-custom-nanoid: ${model.name}.${configured.field.name} must be a scalar String field.`,
      );
    }

    configurations[model.name] = {
      field: configured.field.name,
      alphabet: configured.alphabet,
      size: parseSize(model.name, configured.field),
    };
  }

  if (Object.keys(configurations).length === 0) {
    throw new TypeError(
      `prisma-custom-nanoid: no ${DIRECTIVE_NAME} fields were found in the Prisma schema.`,
    );
  }

  return configurations;
}

export function buildRelations(
  models: readonly DmmfModelLike[],
): GeneratedRelations {
  const relations: Record<string, Record<string, string>> = {};

  for (const model of [...models].sort((left, right) =>
    compareNames(left.name, right.name),
  )) {
    const fields = model.fields
      .filter((field) => field.kind === "object")
      .sort((left, right) => compareNames(left.name, right.name));
    if (fields.length === 0) {
      continue;
    }

    relations[model.name] = Object.fromEntries(
      fields.map((field) => [field.name, field.type]),
    );
  }

  return relations;
}

export function buildConfiguration(
  models: readonly DmmfModelLike[],
): GeneratedConfiguration {
  return {
    models: buildModels(models),
    relations: buildRelations(models),
  };
}

function renderObject(
  entries: readonly [string, readonly [string, string | number][]][],
): string {
  if (entries.length === 0) {
    return "{}";
  }

  return `{\n${entries
    .map(
      ([name, fields]) =>
        `    ${name}: {\n${fields
          .map(
            ([field, value]) =>
              `      ${field}: ${typeof value === "string" ? JSON.stringify(value) : value},`,
          )
          .join("\n")}\n    },`,
    )
    .join("\n")}\n  }`;
}

export function renderConfigurationModule(
  configuration: GeneratedConfiguration,
): string {
  const models = Object.entries(configuration.models).map(
    ([model, config]) =>
      [
        model,
        [
          ["field", config.field],
          ["alphabet", config.alphabet],
          ["size", config.size],
        ],
      ] as [string, [string, string | number][]],
  );
  const relations = Object.entries(configuration.relations).map(
    ([model, fields]) =>
      [model, Object.entries(fields)] as [string, [string, string][]],
  );

  return `// This file is automatically generated by prisma-custom-nanoid.
// Do not edit it directly. Update the Prisma schema and run prisma generate instead.

export const customNanoidConfig = {
  models: ${renderObject(models)},
  relations: ${renderObject(relations)},
} as const;
`;
}
