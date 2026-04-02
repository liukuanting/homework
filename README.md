# 羽球臨打報名系統

這是一個以 `HTML + JavaScript + Supabase` 製作的羽球臨打網站，適合直接部署到靜態網站平台，例如 Vercel。

## 主要頁面

- `index.html`：首頁
- `login.html`：會員登入 / 管理者登入 / 註冊
- `dashboard.html`：會員中心
- `admin.html`：管理後台

## Supabase 設定

請打開 `assets/config.js`，填入：

- `url`
- `anonKey`

注意：

- 這是純前端網站，只能使用 `anon key`
- 不要把 `service role key` 放到前端

## 資料表

目前前端預期使用下列表：

- `profiles`
- `tours`
- `sessions`
- `orders`

對應欄位可參考 `supabase_schema.sql`。

## 部署

這個版本不需要 PHP，直接部署整個資料夾即可。

如果你使用 Vercel：

1. 匯入專案
2. 不需要安裝 PHP
3. 直接部署

專案內的 `vercel.json` 已設定 `cleanUrls`。

## 重要提醒

因為這版是純前端直接連 Supabase，所以你一定要在 Supabase 設定好 RLS 政策，尤其是：

- 會員只能讀寫自己的 `profiles`
- 會員只能新增自己的 `orders`
- 一般會員只能讀 `tours` / `sessions`
- 只有管理者可以新增、修改、刪除 `tours` / `sessions`
- 只有管理者可以查看全部 `orders`

另外，目前報名流程仍然是：

1. 新增 `orders`
2. 更新 `sessions.remaining_slots`

正式上線前，建議你改成 Supabase RPC / SQL function 做原子扣名額，避免多人同時搶位造成超賣。
