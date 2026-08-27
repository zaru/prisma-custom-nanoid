export interface NormalizedModelConfig {
    field: string;
    generate: () => string;
}
export type NormalizedRelations = ReadonlyMap<string, ReadonlyMap<string, string>>;
export declare function transformOperationArgs<T>(operation: string, model: string, args: T, modelConfigs: ReadonlyMap<string, NormalizedModelConfig>, relations: NormalizedRelations): T;
