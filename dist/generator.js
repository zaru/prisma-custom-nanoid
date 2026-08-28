#!/usr/bin/env node

// src/generator.ts
import { mkdir, rename, writeFile } from "fs/promises";
import path from "path";
import generatorHelper from "@prisma/generator-helper";

// src/generator-output.ts
var DEFAULT_NANOID_SIZE = 21;
var DIRECTIVE_NAME = "@customNanoid";
var DIRECTIVE_PATTERN = /^\s*@customNanoid\(\s*alphabet\s*:\s*("(?:\\.|[^"\\])*")\s*\)\s*$/;
function compareNames(left, right) {
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
}
function parseAlphabet(modelName, field) {
  const directiveLines = (field.documentation ?? "").split(/\r?\n/).filter((line) => line.includes(DIRECTIVE_NAME));
  if (directiveLines.length === 0) {
    return void 0;
  }
  if (directiveLines.length > 1) {
    throw new TypeError(
      `prisma-custom-nanoid: ${modelName}.${field.name} must contain exactly one ${DIRECTIVE_NAME} directive.`
    );
  }
  const match = DIRECTIVE_PATTERN.exec(directiveLines[0] ?? "");
  if (!match?.[1]) {
    throw new TypeError(
      `prisma-custom-nanoid: ${modelName}.${field.name} has an invalid ${DIRECTIVE_NAME} directive. Expected ${DIRECTIVE_NAME}(alphabet: "characters").`
    );
  }
  let alphabet;
  try {
    alphabet = JSON.parse(match[1]);
  } catch {
    throw new TypeError(
      `prisma-custom-nanoid: ${modelName}.${field.name} has an invalid JSON string in its ${DIRECTIVE_NAME} directive.`
    );
  }
  if (typeof alphabet !== "string" || alphabet.length === 0 || alphabet.length > 256) {
    throw new TypeError(
      `prisma-custom-nanoid: ${modelName}.${field.name} alphabet must contain between 1 and 256 characters.`
    );
  }
  return alphabet;
}
function isDefaultFunction(value) {
  return typeof value === "object" && value !== null && "name" in value && typeof value.name === "string" && "args" in value && Array.isArray(value.args);
}
function parseSize(modelName, field) {
  if (!isDefaultFunction(field.default) || field.default.name !== "nanoid" || field.default.args.length > 1) {
    throw new TypeError(
      `prisma-custom-nanoid: ${modelName}.${field.name} must use @default(nanoid()) or @default(nanoid(size)).`
    );
  }
  const size = field.default.args[0] ?? DEFAULT_NANOID_SIZE;
  if (!Number.isSafeInteger(size) || Number(size) <= 0) {
    throw new TypeError(
      `prisma-custom-nanoid: ${modelName}.${field.name} nanoid size must be a positive integer.`
    );
  }
  return Number(size);
}
function buildModels(models) {
  const configurations = {};
  for (const model of [...models].sort(
    (left, right) => compareNames(left.name, right.name)
  )) {
    const configuredFields = model.fields.flatMap((field) => {
      const alphabet = parseAlphabet(model.name, field);
      return alphabet === void 0 ? [] : [{ field, alphabet }];
    });
    if (configuredFields.length > 1) {
      throw new TypeError(
        `prisma-custom-nanoid: ${model.name} has multiple ${DIRECTIVE_NAME} fields, but only one field per model is supported.`
      );
    }
    const configured = configuredFields[0];
    if (!configured) {
      continue;
    }
    if (configured.field.kind !== "scalar" || configured.field.type !== "String") {
      throw new TypeError(
        `prisma-custom-nanoid: ${model.name}.${configured.field.name} must be a scalar String field.`
      );
    }
    configurations[model.name] = {
      field: configured.field.name,
      alphabet: configured.alphabet,
      size: parseSize(model.name, configured.field)
    };
  }
  if (Object.keys(configurations).length === 0) {
    throw new TypeError(
      `prisma-custom-nanoid: no ${DIRECTIVE_NAME} fields were found in the Prisma schema.`
    );
  }
  return configurations;
}
function buildRelations(models) {
  const relations = {};
  for (const model of [...models].sort(
    (left, right) => compareNames(left.name, right.name)
  )) {
    const fields = model.fields.filter((field) => field.kind === "object").sort((left, right) => compareNames(left.name, right.name));
    if (fields.length === 0) {
      continue;
    }
    relations[model.name] = Object.fromEntries(
      fields.map((field) => [field.name, field.type])
    );
  }
  return relations;
}
function buildConfiguration(models) {
  return {
    models: buildModels(models),
    relations: buildRelations(models)
  };
}
function renderObject(entries) {
  if (entries.length === 0) {
    return "{}";
  }
  return `{
${entries.map(
    ([name, fields]) => `    ${name}: {
${fields.map(
      ([field, value]) => `      ${field}: ${typeof value === "string" ? JSON.stringify(value) : value},`
    ).join("\n")}
    },`
  ).join("\n")}
  }`;
}
function renderConfigurationModule(configuration) {
  const models = Object.entries(configuration.models).map(
    ([model, config]) => [
      model,
      [
        ["field", config.field],
        ["alphabet", config.alphabet],
        ["size", config.size]
      ]
    ]
  );
  const relations = Object.entries(configuration.relations).map(
    ([model, fields]) => [model, Object.entries(fields)]
  );
  return `// This file is automatically generated by prisma-custom-nanoid.
// Do not edit it directly. Update the Prisma schema and run prisma generate instead.

export const customNanoidConfig = {
  models: ${renderObject(models)},
  relations: ${renderObject(relations)},
} as const;
`;
}

// src/generator.ts
var { generatorHandler } = generatorHelper;
generatorHandler({
  onManifest() {
    return {
      defaultOutput: "./generated/custom-nanoid",
      prettyName: "Prisma Custom Nano ID Configuration Generator"
    };
  },
  async onGenerate(options) {
    const outputDirectory = options.generator.output?.value;
    if (!outputDirectory) {
      throw new TypeError(
        "prisma-custom-nanoid: the generator output must be specified."
      );
    }
    const outputPath = path.join(outputDirectory, "index.ts");
    const temporaryPath = `${outputPath}.tmp-${process.pid}`;
    const source = renderConfigurationModule(
      buildConfiguration(options.dmmf.datamodel.models)
    );
    await mkdir(outputDirectory, { recursive: true });
    await writeFile(temporaryPath, source, "utf8");
    await rename(temporaryPath, outputPath);
  }
});
