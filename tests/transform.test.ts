import { describe, expect, it } from "vitest";
import {
  type NormalizedModelConfig,
  type NormalizedRelations,
  transformOperationArgs,
} from "../src/transform.js";

function createConfigs(): ReadonlyMap<string, NormalizedModelConfig> {
  let sequence = 0;
  return new Map([
    ["User", { field: "id", generate: () => `user-${++sequence}` }],
    ["Post", { field: "id", generate: () => `post-${++sequence}` }],
  ]);
}

const relations: NormalizedRelations = new Map([
  ["User", new Map([["posts", "Post"]])],
]);

describe("transformOperationArgs", () => {
  it("入力を変更せず、変更が必要な経路だけをコピーする", () => {
    const untouched = { connect: { id: "existing" } };
    const post = { title: "post" };
    const args = {
      data: {
        email: "user@example.com",
        posts: {
          create: post,
          untouched,
        },
      },
    };

    const result = transformOperationArgs(
      "create",
      "User",
      args,
      createConfigs(),
      relations,
    );

    expect(result).not.toBe(args);
    expect(result.data).not.toBe(args.data);
    expect(result.data.posts).not.toBe(args.data.posts);
    expect(result.data.posts.untouched).toBe(untouched);
    expect(post).toEqual({ title: "post" });
    expect(result.data.posts.create).toEqual({
      id: "post-2",
      title: "post",
    });
  });

  it("変更がなければ元の参照を保持する", () => {
    const args = {
      data: {
        id: "existing",
        email: "user@example.com",
      },
    };

    expect(
      transformOperationArgs(
        "create",
        "User",
        args,
        createConfigs(),
        relations,
      ),
    ).toBe(args);
    expect(
      transformOperationArgs(
        "delete",
        "User",
        args,
        createConfigs(),
        relations,
      ),
    ).toBe(args);
  });

  it("認識できない root 引数形を変更しない", () => {
    const createArgs = { data: [{ email: "invalid@example.com" }] };
    const upsertArgs = { create: [], update: [] };

    expect(
      transformOperationArgs(
        "create",
        "User",
        createArgs,
        createConfigs(),
        relations,
      ),
    ).toBe(createArgs);
    expect(
      transformOperationArgs(
        "upsert",
        "User",
        upsertArgs,
        createConfigs(),
        relations,
      ),
    ).toBe(upsertArgs);
  });

  it("undefined だけを未指定として扱い、null と明示値を保持する", () => {
    const data = [
      { id: undefined, email: "undefined@example.com" },
      { id: null, email: "null@example.com" },
      { id: "explicit", email: "explicit@example.com" },
    ];
    const args = { data };

    const result = transformOperationArgs(
      "createMany",
      "User",
      args,
      createConfigs(),
      relations,
    );

    expect(result.data[0]?.id).toBe("user-1");
    expect(result.data[1]?.id).toBeNull();
    expect(result.data[2]?.id).toBe("explicit");
    expect(data[0]?.id).toBeUndefined();
  });

  it("循環参照で停止し、循環先の参照を保持する", () => {
    const create: Record<string, unknown> = { title: "cyclic" };
    const relationWrite = { create };
    create.posts = relationWrite;
    const cyclicRelations: NormalizedRelations = new Map([
      ["User", new Map([["posts", "Post"]])],
      ["Post", new Map([["posts", "Post"]])],
    ]);
    const args = {
      data: {
        email: "user@example.com",
        posts: relationWrite,
      },
    };

    const result = transformOperationArgs(
      "create",
      "User",
      args,
      createConfigs(),
      cyclicRelations,
    );

    expect(result.data.posts.create).toMatchObject({
      id: "post-2",
      title: "cyclic",
    });
    expect(result.data.posts.create.posts).toBe(relationWrite);
  });

  it("同じオブジェクトを異なるモデルと mode で個別に処理する", () => {
    const shared = { posts: { create: { title: "nested" } } };
    const args = {
      create: shared,
      update: shared,
    };

    const result = transformOperationArgs(
      "upsert",
      "User",
      args,
      createConfigs(),
      relations,
    );

    expect(result.create).toMatchObject({
      id: "user-1",
      posts: { create: { id: "post-2", title: "nested" } },
    });
    expect(result.update).toMatchObject({
      posts: { create: { id: "post-3", title: "nested" } },
    });
    expect(result.update).not.toHaveProperty("id");
    expect(shared).toEqual({ posts: { create: { title: "nested" } } });
  });
});
