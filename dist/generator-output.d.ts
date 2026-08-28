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
export type GeneratedModels = Readonly<Record<string, Readonly<GeneratedModelConfig>>>;
export type GeneratedRelations = Readonly<Record<string, Readonly<Record<string, string>>>>;
export interface GeneratedConfiguration {
    models: GeneratedModels;
    relations: GeneratedRelations;
}
export declare function buildModels(models: readonly DmmfModelLike[]): GeneratedModels;
export declare function buildRelations(models: readonly DmmfModelLike[]): GeneratedRelations;
export declare function buildConfiguration(models: readonly DmmfModelLike[]): GeneratedConfiguration;
export declare function renderConfigurationModule(configuration: GeneratedConfiguration): string;
export {};
