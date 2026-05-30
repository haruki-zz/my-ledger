# My Ledger

面向两人同居生活的 iOS 优先记账 App。前端使用 Expo React Native，数据持久化和同步使用 Supabase。

## 功能

- 邮箱密码登录/注册。
- 创建共享账本或通过邀请码加入账本。
- 每个账本最多两名成员。
- 新增、查看、编辑、删除支出。
- 支出字段包含金额（日元整数）、类别、支付人、归属、日期、备注、记录人。
- 记录人由当前登录用户自动写入，编辑支出不会改变原记录人。
- 共同支出支持按金额或比例分摊，最终以双方承担日元金额保存。
- 明细页从 Supabase 读取数据，并订阅支出变化以刷新双方视图。

## Supabase 配置

1. 在 Supabase 项目中执行 migration：

   ```bash
   supabase db push
   ```

   如果没有安装 Supabase CLI，也可以把 `supabase/migrations/20260523000000_initial_ledger_schema.sql` 的内容复制到 Supabase SQL Editor 执行。

2. 在项目根目录创建 `.env`：

   ```bash
   cp .env.example .env
   ```

3. 填入 Supabase Project URL 和 anon key：

   ```bash
   EXPO_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
   EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
   ```

4. 在 Supabase Auth 中确认邮箱登录已启用。若开启邮箱确认，注册后需要先确认邮箱再登录。

## 本地运行

`npm run ios` 和 `npm run android` 会执行 native build，需要本机已配置 Xcode 或 Android Studio。只想用 Expo Go 预览时使用 `npm start`。

```bash
npm install
npm run typecheck
npm run lint
npm run ios
```

也可以用 Expo Go：

```bash
npm start
```

## 备注

- 当前版本仅支持日元，不做多币种。
- 当前删除为硬删除。
- 为避开当前依赖中的 Hermes 动态 import 编译问题，App 显式使用 JSC：见 `app.json` 的 `jsEngine` 配置。
- `postinstall` 会在已知受影响的 `@supabase/supabase-js` 版本中移除可选 OTEL dynamic import；升级 Supabase 后应复查并删除该 workaround。
