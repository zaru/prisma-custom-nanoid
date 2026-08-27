# Prisma Custom Nano ID 拡張の操作対応拡張計画

## 問題と現状

このリポジトリは、Prisma Client の Client Extension で、設定済みモデルの単一レコード `create` に限り、対象フィールドが未指定のとき Nano ID を生成している。`src/index.ts` は `$allModels.$allOperations` を利用しているが、`operation === "create"` 以外はそのまま Prisma に渡している。

テストはトップレベルの `create`、明示 ID の保持、未設定モデルへの非干渉、設定値のバリデーションまでを対象としている。README と example も単一 `create` を前提にしており、`createMany`、`upsert`、`connectOrCreate` は明示的に対象外としている。テスト fixture には現在リレーションがない。

## 目標と確認済みの仕様

- トップレベルの `createMany` と Prisma 7 の `createManyAndReturn` を対象にし、各要素で未指定の ID だけを個別生成する。
- `upsert` は `create` 分岐を補完し、`where` と既存レコードを更新する `update` 分岐の既存値は変更しない。
- `create` / `createMany` / `connectOrCreate` など、nested write の新規作成ブランチを再帰的に補完する。root が `update` または `upsert.update` でも、内部の新規作成ブランチは対象にする。
- 明示値は既存仕様を維持して保持する。`undefined` は未指定として生成し、`null` などの値は拡張で置換しない。
- 認識できない引数形や、モデルを解決できない nested write は拡張側で無理に解釈せず、そのまま Prisma に渡す。
- 現在の `$allModels.$allOperations` を維持し、操作別の変換ヘルパーを追加する。
- nested write の対象モデルを安定して解決するため、親モデルと relation field から対象モデルを引く公開設定を追加する。Prisma の内部メタデータには依存しない。
- relation mapping は Nano ID のモデル設定とは独立して扱う。root または中間モデルに Nano ID 設定がなくても、mapping で到達できる設定済み子孫モデルは処理する。
- `relations` は省略可能な追加設定とし、既存の `{ models }` のみを渡す利用方法との型・実行時の後方互換性を維持する。

## 実装タスク

1. **操作・データ変換の設計を整理する**
   - `create`、`createMany`、`createManyAndReturn`、`update`、`upsert` のトップレベル引数を処理する共通入口を定義する。
   - 操作ごとの処理を次のように固定する。
     - `create`: root を create payload として補完し、relation field を再帰処理する。
     - `createMany` / `createManyAndReturn`: root の `data` の各要素を create payload として補完する。Prisma が許可しない relation write は独自に解釈しない。
     - `update`: root を update payload として扱い、root モデルの ID は補完せず、relation field 内の新規作成ブランチだけを再帰処理する。
     - `upsert`: `create` を create payload、`update` を update payloadとして処理し、`where` は変更しない。
     - その他の操作: 引数を変更せず Prisma に渡す。
   - `create` payload、複数 payload、`upsert.create`、nested `create` / `createMany` / `connectOrCreate` を区別する不変変換ヘルパーを設計する。
   - `update` payload は root モデルの ID を補完せず、relation field 内の新規作成ブランチだけを再帰処理する。
   - `where`、`connect`、`delete`、`disconnect`、通常の update scalar は変更しない。
   - Nano ID 設定の有無と relation mapping の有無を別々に判定する。現在モデルの Nano ID 設定がなくても relation mapping があれば再帰探索を続け、両方がなければ元の参照をそのまま返す。
   - 認識した箇所に変更がない場合は元のオブジェクト参照を返し、変更が必要な経路だけを shallow copy する。

2. **nested model 解決の公開設定を追加する**
   - 親モデル名と relation field 名から対象モデル名を解決する省略可能な設定を `CustomNanoidOptions` に追加する（例: `relations?: Readonly<Record<string, Readonly<Record<string, string>>>>`、`relations[parentModel][field] = targetModel`）。
   - `relations` の省略時は空の mapping として正規化し、既存の `{ models }` のみの設定を維持する。
   - relation 設定について、配列や `null` を拒否し、親モデル名・field 名・対象モデル名が空でない文字列であることを初期化時に検証する。
   - 対象モデルに Nano ID 設定がない場合は生成せず、既存の「未設定モデルには干渉しない」挙動を維持する。
   - 対象モデルに Nano ID 設定がなくても、その対象モデルに relation mapping があれば子孫の探索は継続する。
   - README に設定例と、Prisma schema の relation field 名を使う必要があることを記載する。

3. **トップレベル操作を実装する**
   - `createMany` / `createManyAndReturn` の `data` が単体または配列の双方で動作し、要素ごとに新しい ID を生成するようにする。
   - `update` を update payload の入口として処理し、root の scalar field と ID は変更せず、設定済み relation field だけを再帰処理する。
   - `upsert.create` のみを create payload として処理し、`upsert.update` の nested create は update payload として再帰処理する。
   - 操作処理の開始条件を「root モデルに Nano ID 設定がある場合」だけに限定せず、root モデルに relation mapping がある場合も変換入口へ渡す。
   - 現在の単一 `create` の明示値保持、未設定モデルの透過、`relations` 省略時の挙動、既存の型安全性を維持する。

4. **nested write の再帰処理を実装する**
   - relation mapping で解決した対象モデルに対して、`create`、`createMany.data`、`connectOrCreate.create` を処理する。
   - 配列形式と単体形式、さらに nested relation の深い階層を扱う。
   - nested `upsert.create` と update 系 payload 内の nested 新規作成ブランチも処理し、既存レコードの更新用データや `where` は変更しない。
   - relation field の値では、認識済みの Prisma nested write キーだけを処理する。未知のキーや形状はコピー・正規化せず、その値を保持して Prisma 本来の検証に委ねる。
   - 再帰処理の文脈を `model` と `payloadMode`（create/update）で明示し、同じオブジェクトが異なるモデルまたはモードで参照されても誤った変換結果を再利用しない。
   - 循環検出は現在の再帰経路を管理する `WeakSet` などで行い、循環先はそれ以上探索せず元の参照を保持する。変換結果をキャッシュする場合は、少なくとも `object + model + payloadMode` 単位で管理する。
   - 入力オブジェクトや配列を直接変更せず、共有オブジェクトを含む場合も無限再帰を起こさない。

5. **fixture と統合テストを拡張する**
   - `tests/fixtures/schema.prisma` に親子 relation と文字列 ID を持つモデルを追加し、複数階層の nested write を検証できるようにする。
   - `createMany` と `createManyAndReturn` で、未指定 ID の生成、明示 ID の保持、混在配列を検証する。
   - `upsert` の create/update 両分岐、`where` の不変性、update 内 nested create を検証する。
   - nested `create`、nested `createMany`、`connectOrCreate`、nested `upsert` を単体・配列・再帰階層で検証する。
   - Nano ID 未設定の root または中間モデルから、relation mapping を経由して設定済み子孫モデルの ID が生成されることを検証する。
   - Nano ID 設定のないモデル、relation mapping のない nested write、未対応形状が透過されることを検証する。
   - `relations` を省略した既存形式の設定が従来どおり動作することと、不正な relation 設定が初期化時に拒否されることを検証する。
   - helper の単体テストでは、入力の非変更、変更なしの場合の参照保持、循環参照の停止、同一オブジェクトを異なるモデル・payload mode で処理した場合を検証する。
   - 既存の設定バリデーションと create テストを残し、ID の alphabet/size と `undefined` / 明示値の境界も確認する。

6. **example とドキュメントを更新する**
   - README の概要、対応範囲、操作別の挙動、relation mapping 設定、非対応・透過方針を更新する。
   - example schema と実行例に、少なくとも `createMany` / `upsert` / nested write の代表ケースを追加する。
   - `example/README.md` の確認項目と実行結果の説明を、現行の対応範囲に合わせる。
   - package description など、単一 `create` に限定しているメタデータ表現を見直す。

7. **検証と公開物を確認する**
   - 開発中は変更範囲を覆う対象テストを実行し、完了時に `pnpm validate`（`check`、`typecheck`、`test`、`pack:check`）で一括確認する。
   - example の generate / db push / build / demo が新しい schema と拡張 API で動作することを確認する。
   - TypeScript declaration、ESM/CJS の build output、package files に不要な生成物が混入しないことを確認する。

## 注意点・判断

- nested write は query extension の一回の引数に埋め込まれており、実行時 callback だけでは対象モデル名を得られない。そのため、Prisma 内部 API を読む方式ではなく、relation mapping を公開 API として持つ。
- Prisma の operation 名には `createManyAndReturn` も含める。`update` 自体で root の ID を生成するのではなく、内部に含まれる新規作成ブランチだけを処理する。nested write を持たない `delete` などは透過する。
- 変換は immutable に行い、生成処理を query 実行後や DB default に委ねない。既存の `@default("")` を前提とする型上の回避策と、明示 ID を保持する仕様は維持する。
- 設定検証の失敗は既存どおり初期化時に明示的な `TypeError` とし、実行時の未知の入力は成功形の代替値を返さず Prisma 本来の検証に委ねる。
