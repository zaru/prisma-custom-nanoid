interface DmmfFieldLike {
    name: string;
    kind: string;
    type: string;
}
interface DmmfModelLike {
    name: string;
    fields: readonly DmmfFieldLike[];
}
export type GeneratedRelations = Readonly<Record<string, Readonly<Record<string, string>>>>;
export declare function buildRelations(models: readonly DmmfModelLike[]): GeneratedRelations;
export declare function renderRelationsModule(relations: GeneratedRelations): string;
export {};
