import { Prisma } from "@prisma/client/extension";
import { customAlphabet } from "nanoid";
import {
  type NormalizedModelConfig,
  type NormalizedRelations,
  transformOperationArgs,
} from "./transform.js";

export interface ModelNanoidConfig {
  field: string;
  alphabet: string;
  size: number;
}

export interface CustomNanoidOptions {
  models: Readonly<Record<string, ModelNanoidConfig>>;
  relations?: Readonly<Record<string, Readonly<Record<string, string>>>>;
}

function validateOptions(options: CustomNanoidOptions): {
  modelConfigs: ReadonlyMap<string, NormalizedModelConfig>;
  relations: NormalizedRelations;
} {
  if (
    typeof options !== "object" ||
    options === null ||
    Array.isArray(options) ||
    typeof options.models !== "object" ||
    options.models === null ||
    Array.isArray(options.models)
  ) {
    throw new TypeError("customNanoid: a models configuration is required.");
  }

  const entries = Object.entries(options.models);
  if (entries.length === 0) {
    throw new TypeError(
      "customNanoid: models must contain at least one configuration.",
    );
  }

  const modelConfigs = new Map(
    entries.map(([model, config]) => {
      if (model.trim().length === 0) {
        throw new TypeError("customNanoid: model names must not be empty.");
      }
      if (
        typeof config !== "object" ||
        config === null ||
        Array.isArray(config) ||
        typeof config.field !== "string" ||
        config.field.trim().length === 0
      ) {
        throw new TypeError(
          `customNanoid: ${model}.field must be a non-empty string.`,
        );
      }
      if (
        typeof config.alphabet !== "string" ||
        config.alphabet.length === 0 ||
        config.alphabet.length > 256
      ) {
        throw new TypeError(
          `customNanoid: ${model}.alphabet must contain between 1 and 256 characters.`,
        );
      }
      if (!Number.isSafeInteger(config.size) || config.size <= 0) {
        throw new TypeError(
          `customNanoid: ${model}.size must be a positive integer.`,
        );
      }

      return [
        model,
        {
          field: config.field,
          generate: customAlphabet(config.alphabet, config.size),
        },
      ];
    }),
  );

  if (
    options.relations !== undefined &&
    (typeof options.relations !== "object" ||
      options.relations === null ||
      Array.isArray(options.relations))
  ) {
    throw new TypeError("customNanoid: relations must be an object.");
  }

  const relations = new Map<string, ReadonlyMap<string, string>>();
  for (const [parentModel, fields] of Object.entries(options.relations ?? {})) {
    if (parentModel.trim().length === 0) {
      throw new TypeError(
        "customNanoid: parent model names in relations must not be empty.",
      );
    }
    if (
      typeof fields !== "object" ||
      fields === null ||
      Array.isArray(fields)
    ) {
      throw new TypeError(
        `customNanoid: relations.${parentModel} must be an object.`,
      );
    }

    const normalizedFields = new Map<string, string>();
    for (const [field, targetModel] of Object.entries(fields)) {
      if (field.trim().length === 0) {
        throw new TypeError(
          `customNanoid: field names in relations.${parentModel} must not be empty.`,
        );
      }
      if (typeof targetModel !== "string" || targetModel.trim().length === 0) {
        throw new TypeError(
          `customNanoid: relations.${parentModel}.${field} must be a non-empty target model name.`,
        );
      }
      normalizedFields.set(field, targetModel);
    }
    relations.set(parentModel, normalizedFields);
  }

  return { modelConfigs, relations };
}

export function customNanoid(options: CustomNanoidOptions) {
  const { modelConfigs, relations } = validateOptions(options);

  return Prisma.defineExtension({
    name: "prisma-custom-nanoid",
    query: {
      $allModels: {
        $allOperations({ model, operation, args, query }) {
          return query(
            transformOperationArgs(
              operation,
              model,
              args,
              modelConfigs,
              relations,
            ),
          );
        },
      },
    },
  });
}
