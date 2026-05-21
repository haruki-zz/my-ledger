# 共有家計簿

React Native + TypeScript で作った、2 人用の共有記帳アプリ MVP です。UI 文言は日本語、通貨は日本円固定です。

## 実装済み

- メール認証コードを前提にした Supabase Auth 接続口
- 招待コードで 2 人の家計簿に参加するオンボーディング
- 自分・相手・共有の支出表示
- 共有支出の割合分割、金額分割、端数 1 円の支払者負担
- 固定金額と変動金額の定期支出モデル
- 未入力の変動定期支出表示
- Supabase Postgres schema、RLS、招待 RPC
- Jest による分割、精算、定期支出テスト

## セットアップ

```sh
npm install
bundle install
cd ios && bundle exec pod install && cd ..
```

Supabase を使う場合は、`src/config/supabase.ts` の `SUPABASE_URL` と `SUPABASE_ANON_KEY` を自分のプロジェクト値に変更し、`supabase/migrations/001_initial_schema.sql` を Supabase SQL Editor または Supabase CLI で適用してください。

未設定のままでも、デモデータで画面と計算ロジックを確認できます。

## 開発コマンド

```sh
npm start
npm run ios
npm run typecheck
npm run lint
npm test
```

## 注意

iOS 実行には Xcode が必要です。`xcode-select -p` が `/Library/Developer/CommandLineTools` を指している場合は、Xcode をインストールしてから以下のように切り替えてください。

```sh
sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
```
