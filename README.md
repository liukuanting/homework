# 羽球臨打報名系統

這是一個以 `HTML + JavaScript + Supabase` 製作的羽球臨打網站。

## 頁面

- `index.html`：首頁
- `login.html`：會員登入 / 註冊 / 管理者登入
- `dashboard.html`：會員中心
- `admin.html`：管理後台

## 設定方式

請先打開 `config.js`，填入：

- `url`
- `anonKey`

## Supabase 需要執行

1. 先跑 `supabase_schema.sql`
2. 再跑 `supabase_policies.sql`

## 功能

- 首頁顯示場次、級數、時間、價格、人數
- 會員可 Email / 密碼登入與註冊
- 管理者需 `profiles.is_admin = true`
- 會員可即時報名，寫入 `orders`
- 報名後同步扣除 `sessions.remaining_slots`
- 會員可查個人訂單紀錄
- 管理者可管理行程、檔期、訂單

## 部署

這是靜態網站，可直接部署到 Vercel。
