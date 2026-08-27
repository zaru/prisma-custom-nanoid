// src/index.ts
import { Prisma } from "@prisma/client/extension";
import { customAlphabet } from "nanoid";

// src/transform.ts
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function transformArray(value, transform) {
  let changed = false;
  const result = value.map((item) => {
    const transformed = transform(item);
    changed ||= transformed !== item;
    return transformed;
  });
  return changed ? result : value;
}
function transformPayloadValue(value, model, mode, modelConfigs, relations, path) {
  if (Array.isArray(value)) {
    if (path.has(value)) {
      return value;
    }
    path.add(value);
    const transformed = transformArray(
      value,
      (item) => transformPayloadValue(item, model, mode, modelConfigs, relations, path)
    );
    path.delete(value);
    return transformed;
  }
  if (!isRecord(value) || path.has(value)) {
    return value;
  }
  return transformPayload(value, model, mode, modelConfigs, relations, path);
}
function transformCreateManyEnvelope(value, model, modelConfigs, relations, path) {
  if (!isRecord(value) || !("data" in value) || path.has(value)) {
    return value;
  }
  path.add(value);
  const data = transformPayloadValue(
    value.data,
    model,
    "create",
    modelConfigs,
    relations,
    path
  );
  path.delete(value);
  return data === value.data ? value : { ...value, data };
}
function transformBranchEntries(value, transform, path) {
  if (Array.isArray(value)) {
    if (path.has(value)) {
      return value;
    }
    path.add(value);
    const transformed = transformArray(
      value,
      (entry) => isRecord(entry) && !path.has(entry) ? transform(entry, path) : entry
    );
    path.delete(value);
    return transformed;
  }
  return isRecord(value) && !path.has(value) ? transform(value, path) : value;
}
function transformConnectOrCreate(value, model, modelConfigs, relations, path) {
  return transformBranchEntries(
    value,
    (entry, currentPath) => {
      if (!("create" in entry)) {
        return entry;
      }
      currentPath.add(entry);
      const create = transformPayloadValue(
        entry.create,
        model,
        "create",
        modelConfigs,
        relations,
        currentPath
      );
      currentPath.delete(entry);
      return create === entry.create ? entry : { ...entry, create };
    },
    path
  );
}
function transformUpsert(value, model, modelConfigs, relations, path) {
  return transformBranchEntries(
    value,
    (entry, currentPath) => {
      currentPath.add(entry);
      const create = "create" in entry ? transformPayloadValue(
        entry.create,
        model,
        "create",
        modelConfigs,
        relations,
        currentPath
      ) : void 0;
      const update = "update" in entry ? transformPayloadValue(
        entry.update,
        model,
        "update",
        modelConfigs,
        relations,
        currentPath
      ) : void 0;
      currentPath.delete(entry);
      if ((!("create" in entry) || create === entry.create) && (!("update" in entry) || update === entry.update)) {
        return entry;
      }
      return {
        ...entry,
        ..."create" in entry ? { create } : {},
        ..."update" in entry ? { update } : {}
      };
    },
    path
  );
}
function transformUpdateEntry(entry, model, modelConfigs, relations, path) {
  path.add(entry);
  const usesDataEnvelope = isRecord(entry.data) && ("where" in entry || Object.keys(entry).every((key) => key === "data" || key === "where"));
  const transformed = usesDataEnvelope ? transformPayloadValue(
    entry.data,
    model,
    "update",
    modelConfigs,
    relations,
    path
  ) : transformPayload(
    entry,
    model,
    "update",
    modelConfigs,
    relations,
    path,
    false
  );
  path.delete(entry);
  if (!usesDataEnvelope || transformed === entry.data) {
    return transformed;
  }
  return { ...entry, data: transformed };
}
function transformUpdate(value, model, modelConfigs, relations, path) {
  return transformBranchEntries(
    value,
    (entry, currentPath) => transformUpdateEntry(entry, model, modelConfigs, relations, currentPath),
    path
  );
}
function transformUpdateMany(value, model, modelConfigs, relations, path) {
  return transformBranchEntries(
    value,
    (entry, currentPath) => {
      if (!isRecord(entry.data)) {
        return entry;
      }
      currentPath.add(entry);
      const data = transformPayloadValue(
        entry.data,
        model,
        "update",
        modelConfigs,
        relations,
        currentPath
      );
      currentPath.delete(entry);
      return data === entry.data ? entry : { ...entry, data };
    },
    path
  );
}
function transformRelationWrite(value, model, modelConfigs, relations, path) {
  if (!isRecord(value) || path.has(value)) {
    return value;
  }
  path.add(value);
  let result = value;
  const replace = (key, transformed) => {
    if (transformed !== value[key]) {
      result = result === value ? { ...value } : result;
      result[key] = transformed;
    }
  };
  if ("create" in value) {
    replace(
      "create",
      transformPayloadValue(
        value.create,
        model,
        "create",
        modelConfigs,
        relations,
        path
      )
    );
  }
  if ("createMany" in value) {
    replace(
      "createMany",
      transformCreateManyEnvelope(
        value.createMany,
        model,
        modelConfigs,
        relations,
        path
      )
    );
  }
  if ("connectOrCreate" in value) {
    replace(
      "connectOrCreate",
      transformConnectOrCreate(
        value.connectOrCreate,
        model,
        modelConfigs,
        relations,
        path
      )
    );
  }
  if ("upsert" in value) {
    replace(
      "upsert",
      transformUpsert(value.upsert, model, modelConfigs, relations, path)
    );
  }
  if ("update" in value) {
    replace(
      "update",
      transformUpdate(value.update, model, modelConfigs, relations, path)
    );
  }
  if ("updateMany" in value) {
    replace(
      "updateMany",
      transformUpdateMany(
        value.updateMany,
        model,
        modelConfigs,
        relations,
        path
      )
    );
  }
  path.delete(value);
  return result;
}
function transformPayload(payload, model, mode, modelConfigs, relations, path, managePath = true) {
  if (managePath) {
    path.add(payload);
  }
  let result = payload;
  const config = modelConfigs.get(model);
  if (mode === "create" && config && payload[config.field] === void 0) {
    result = {
      ...payload,
      [config.field]: config.generate()
    };
  }
  const modelRelations = relations.get(model);
  if (modelRelations) {
    for (const [field, targetModel] of modelRelations) {
      if (!(field in payload)) {
        continue;
      }
      const transformed = transformRelationWrite(
        payload[field],
        targetModel,
        modelConfigs,
        relations,
        path
      );
      if (transformed !== payload[field]) {
        result = result === payload ? { ...payload } : result;
        result[field] = transformed;
      }
    }
  }
  if (managePath) {
    path.delete(payload);
  }
  return result;
}
function transformRootData(args, model, mode, modelConfigs, relations, allowArray) {
  if (!("data" in args) || !isRecord(args.data) && !(allowArray && Array.isArray(args.data))) {
    return args;
  }
  const data = transformPayloadValue(
    args.data,
    model,
    mode,
    modelConfigs,
    relations,
    /* @__PURE__ */ new WeakSet()
  );
  return data === args.data ? args : { ...args, data };
}
function transformOperationArgs(operation, model, args, modelConfigs, relations) {
  if (!isRecord(args) || !modelConfigs.has(model) && !relations.has(model)) {
    return args;
  }
  let transformed;
  switch (operation) {
    case "create":
      transformed = transformRootData(
        args,
        model,
        "create",
        modelConfigs,
        relations,
        false
      );
      break;
    case "createMany":
    case "createManyAndReturn":
      transformed = transformRootData(
        args,
        model,
        "create",
        modelConfigs,
        /* @__PURE__ */ new Map(),
        true
      );
      break;
    case "update":
      transformed = transformRootData(
        args,
        model,
        "update",
        modelConfigs,
        relations,
        false
      );
      break;
    case "upsert": {
      const path = /* @__PURE__ */ new WeakSet();
      path.add(args);
      const create = isRecord(args.create) ? transformPayloadValue(
        args.create,
        model,
        "create",
        modelConfigs,
        relations,
        path
      ) : void 0;
      const update = isRecord(args.update) ? transformPayloadValue(
        args.update,
        model,
        "update",
        modelConfigs,
        relations,
        path
      ) : void 0;
      transformed = (!isRecord(args.create) || create === args.create) && (!isRecord(args.update) || update === args.update) ? args : {
        ...args,
        ...isRecord(args.create) ? { create } : {},
        ...isRecord(args.update) ? { update } : {}
      };
      break;
    }
    default:
      return args;
  }
  return transformed;
}

// src/index.ts
function validateOptions(options) {
  if (typeof options !== "object" || options === null || Array.isArray(options) || typeof options.models !== "object" || options.models === null || Array.isArray(options.models)) {
    throw new TypeError("customNanoid: a models configuration is required.");
  }
  const entries = Object.entries(options.models);
  if (entries.length === 0) {
    throw new TypeError(
      "customNanoid: models must contain at least one configuration."
    );
  }
  const modelConfigs = new Map(
    entries.map(([model, config]) => {
      if (model.trim().length === 0) {
        throw new TypeError("customNanoid: model names must not be empty.");
      }
      if (typeof config !== "object" || config === null || Array.isArray(config) || typeof config.field !== "string" || config.field.trim().length === 0) {
        throw new TypeError(
          `customNanoid: ${model}.field must be a non-empty string.`
        );
      }
      if (typeof config.alphabet !== "string" || config.alphabet.length === 0 || config.alphabet.length > 256) {
        throw new TypeError(
          `customNanoid: ${model}.alphabet must contain between 1 and 256 characters.`
        );
      }
      if (!Number.isSafeInteger(config.size) || config.size <= 0) {
        throw new TypeError(
          `customNanoid: ${model}.size must be a positive integer.`
        );
      }
      return [
        model,
        {
          field: config.field,
          generate: customAlphabet(config.alphabet, config.size)
        }
      ];
    })
  );
  if (options.relations !== void 0 && (typeof options.relations !== "object" || options.relations === null || Array.isArray(options.relations))) {
    throw new TypeError("customNanoid: relations must be an object.");
  }
  const relations = /* @__PURE__ */ new Map();
  for (const [parentModel, fields] of Object.entries(options.relations ?? {})) {
    if (parentModel.trim().length === 0) {
      throw new TypeError(
        "customNanoid: parent model names in relations must not be empty."
      );
    }
    if (typeof fields !== "object" || fields === null || Array.isArray(fields)) {
      throw new TypeError(
        `customNanoid: relations.${parentModel} must be an object.`
      );
    }
    const normalizedFields = /* @__PURE__ */ new Map();
    for (const [field, targetModel] of Object.entries(fields)) {
      if (field.trim().length === 0) {
        throw new TypeError(
          `customNanoid: field names in relations.${parentModel} must not be empty.`
        );
      }
      if (typeof targetModel !== "string" || targetModel.trim().length === 0) {
        throw new TypeError(
          `customNanoid: relations.${parentModel}.${field} must be a non-empty target model name.`
        );
      }
      normalizedFields.set(field, targetModel);
    }
    relations.set(parentModel, normalizedFields);
  }
  return { modelConfigs, relations };
}
function customNanoid(options) {
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
              relations
            )
          );
        }
      }
    }
  });
}
export {
  customNanoid
};
