export interface NormalizedModelConfig {
  field: string;
  generate: () => string;
}

export type NormalizedRelations = ReadonlyMap<
  string,
  ReadonlyMap<string, string>
>;

type PayloadMode = "create" | "update";
type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function transformArray(
  value: readonly unknown[],
  transform: (item: unknown) => unknown,
): readonly unknown[] {
  let changed = false;
  const result = value.map((item) => {
    const transformed = transform(item);
    changed ||= transformed !== item;
    return transformed;
  });

  return changed ? result : value;
}

function transformPayloadValue(
  value: unknown,
  model: string,
  mode: PayloadMode,
  modelConfigs: ReadonlyMap<string, NormalizedModelConfig>,
  relations: NormalizedRelations,
  path: WeakSet<object>,
): unknown {
  if (Array.isArray(value)) {
    if (path.has(value)) {
      return value;
    }

    path.add(value);
    const transformed = transformArray(value, (item) =>
      transformPayloadValue(item, model, mode, modelConfigs, relations, path),
    );
    path.delete(value);
    return transformed;
  }

  if (!isRecord(value) || path.has(value)) {
    return value;
  }

  return transformPayload(value, model, mode, modelConfigs, relations, path);
}

function transformCreateManyEnvelope(
  value: unknown,
  model: string,
  modelConfigs: ReadonlyMap<string, NormalizedModelConfig>,
  relations: NormalizedRelations,
  path: WeakSet<object>,
): unknown {
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
    path,
  );
  path.delete(value);

  return data === value.data ? value : { ...value, data };
}

function transformBranchEntries(
  value: unknown,
  transform: (entry: UnknownRecord, path: WeakSet<object>) => unknown,
  path: WeakSet<object>,
): unknown {
  if (Array.isArray(value)) {
    if (path.has(value)) {
      return value;
    }

    path.add(value);
    const transformed = transformArray(value, (entry) =>
      isRecord(entry) && !path.has(entry) ? transform(entry, path) : entry,
    );
    path.delete(value);
    return transformed;
  }

  return isRecord(value) && !path.has(value) ? transform(value, path) : value;
}

function transformConnectOrCreate(
  value: unknown,
  model: string,
  modelConfigs: ReadonlyMap<string, NormalizedModelConfig>,
  relations: NormalizedRelations,
  path: WeakSet<object>,
): unknown {
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
        currentPath,
      );
      currentPath.delete(entry);
      return create === entry.create ? entry : { ...entry, create };
    },
    path,
  );
}

function transformUpsert(
  value: unknown,
  model: string,
  modelConfigs: ReadonlyMap<string, NormalizedModelConfig>,
  relations: NormalizedRelations,
  path: WeakSet<object>,
): unknown {
  return transformBranchEntries(
    value,
    (entry, currentPath) => {
      currentPath.add(entry);
      const create =
        "create" in entry
          ? transformPayloadValue(
              entry.create,
              model,
              "create",
              modelConfigs,
              relations,
              currentPath,
            )
          : undefined;
      const update =
        "update" in entry
          ? transformPayloadValue(
              entry.update,
              model,
              "update",
              modelConfigs,
              relations,
              currentPath,
            )
          : undefined;
      currentPath.delete(entry);

      if (
        (!("create" in entry) || create === entry.create) &&
        (!("update" in entry) || update === entry.update)
      ) {
        return entry;
      }

      return {
        ...entry,
        ...("create" in entry ? { create } : {}),
        ...("update" in entry ? { update } : {}),
      };
    },
    path,
  );
}

function transformUpdateEntry(
  entry: UnknownRecord,
  model: string,
  modelConfigs: ReadonlyMap<string, NormalizedModelConfig>,
  relations: NormalizedRelations,
  path: WeakSet<object>,
): unknown {
  path.add(entry);
  const usesDataEnvelope =
    isRecord(entry.data) &&
    ("where" in entry ||
      Object.keys(entry).every((key) => key === "data" || key === "where"));
  const transformed = usesDataEnvelope
    ? transformPayloadValue(
        entry.data,
        model,
        "update",
        modelConfigs,
        relations,
        path,
      )
    : transformPayload(
        entry,
        model,
        "update",
        modelConfigs,
        relations,
        path,
        false,
      );
  path.delete(entry);

  if (!usesDataEnvelope || transformed === entry.data) {
    return transformed;
  }

  return { ...entry, data: transformed };
}

function transformUpdate(
  value: unknown,
  model: string,
  modelConfigs: ReadonlyMap<string, NormalizedModelConfig>,
  relations: NormalizedRelations,
  path: WeakSet<object>,
): unknown {
  return transformBranchEntries(
    value,
    (entry, currentPath) =>
      transformUpdateEntry(entry, model, modelConfigs, relations, currentPath),
    path,
  );
}

function transformUpdateMany(
  value: unknown,
  model: string,
  modelConfigs: ReadonlyMap<string, NormalizedModelConfig>,
  relations: NormalizedRelations,
  path: WeakSet<object>,
): unknown {
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
        currentPath,
      );
      currentPath.delete(entry);
      return data === entry.data ? entry : { ...entry, data };
    },
    path,
  );
}

function transformRelationWrite(
  value: unknown,
  model: string,
  modelConfigs: ReadonlyMap<string, NormalizedModelConfig>,
  relations: NormalizedRelations,
  path: WeakSet<object>,
): unknown {
  if (!isRecord(value) || path.has(value)) {
    return value;
  }

  path.add(value);
  let result = value;

  const replace = (key: string, transformed: unknown) => {
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
        path,
      ),
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
        path,
      ),
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
        path,
      ),
    );
  }
  if ("upsert" in value) {
    replace(
      "upsert",
      transformUpsert(value.upsert, model, modelConfigs, relations, path),
    );
  }
  if ("update" in value) {
    replace(
      "update",
      transformUpdate(value.update, model, modelConfigs, relations, path),
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
        path,
      ),
    );
  }

  path.delete(value);
  return result;
}

function transformPayload(
  payload: UnknownRecord,
  model: string,
  mode: PayloadMode,
  modelConfigs: ReadonlyMap<string, NormalizedModelConfig>,
  relations: NormalizedRelations,
  path: WeakSet<object>,
  managePath = true,
): UnknownRecord {
  if (managePath) {
    path.add(payload);
  }

  let result = payload;
  const config = modelConfigs.get(model);
  if (mode === "create" && config && payload[config.field] === undefined) {
    result = {
      ...payload,
      [config.field]: config.generate(),
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
        path,
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

function transformRootData(
  args: UnknownRecord,
  model: string,
  mode: PayloadMode,
  modelConfigs: ReadonlyMap<string, NormalizedModelConfig>,
  relations: NormalizedRelations,
  allowArray: boolean,
): UnknownRecord {
  if (
    !("data" in args) ||
    (!isRecord(args.data) && !(allowArray && Array.isArray(args.data)))
  ) {
    return args;
  }

  const data = transformPayloadValue(
    args.data,
    model,
    mode,
    modelConfigs,
    relations,
    new WeakSet(),
  );
  return data === args.data ? args : { ...args, data };
}

export function transformOperationArgs<T>(
  operation: string,
  model: string,
  args: T,
  modelConfigs: ReadonlyMap<string, NormalizedModelConfig>,
  relations: NormalizedRelations,
): T {
  if (!isRecord(args) || (!modelConfigs.has(model) && !relations.has(model))) {
    return args;
  }

  let transformed: UnknownRecord;
  switch (operation) {
    case "create":
      transformed = transformRootData(
        args,
        model,
        "create",
        modelConfigs,
        relations,
        false,
      );
      break;
    case "createMany":
    case "createManyAndReturn":
      transformed = transformRootData(
        args,
        model,
        "create",
        modelConfigs,
        new Map(),
        true,
      );
      break;
    case "update":
      transformed = transformRootData(
        args,
        model,
        "update",
        modelConfigs,
        relations,
        false,
      );
      break;
    case "upsert": {
      const path = new WeakSet<object>();
      path.add(args);
      const create = isRecord(args.create)
        ? transformPayloadValue(
            args.create,
            model,
            "create",
            modelConfigs,
            relations,
            path,
          )
        : undefined;
      const update = isRecord(args.update)
        ? transformPayloadValue(
            args.update,
            model,
            "update",
            modelConfigs,
            relations,
            path,
          )
        : undefined;

      transformed =
        (!isRecord(args.create) || create === args.create) &&
        (!isRecord(args.update) || update === args.update)
          ? args
          : {
              ...args,
              ...(isRecord(args.create) ? { create } : {}),
              ...(isRecord(args.update) ? { update } : {}),
            };
      break;
    }
    default:
      return args;
  }

  return transformed as T;
}
