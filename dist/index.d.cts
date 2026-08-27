export interface ModelNanoidConfig {
    field: string;
    alphabet: string;
    size: number;
}
export interface CustomNanoidOptions {
    models: Readonly<Record<string, ModelNanoidConfig>>;
    relations?: Readonly<Record<string, Readonly<Record<string, string>>>>;
}
export declare function customNanoid(options: CustomNanoidOptions): (client: any) => import("@prisma/client/extension").PrismaClientExtends<import("@prisma/client/runtime/client").InternalArgs<{}, {}, {}, {}>>;
