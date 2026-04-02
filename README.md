# 羽球臨打報名系統

這是一個以 `PHP + JavaScript + Supabase` 製作的羽球臨打網站起始專案，包含：

- 首頁：顯示場次、時間、級數、價格、剩餘名額
- 登入頁：會員註冊、會員登入、管理者登入
- 會員中心：場次瀏覽、線上報名、訂單紀錄
- 管理後台：行程管理、檔期管理、訂單查詢

## 你需要填的設定

打開 `config.php`，填入：

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

正式上線建議改用伺服器環境變數，不要把金鑰直接寫在檔案中。

## 預期的 Supabase 資料表

### `profiles`

- `id` uuid primary key，對應 `auth.users.id`
- `full_name` text
- `email` text
- `is_admin` boolean default false

### `tours`

- `id` uuid primary key default `gen_random_uuid()`
- `title` text
- `description` text
- `level` text
- `price` integer
- `location` text
- `created_at` timestamptz default `now()`

### `sessions`

- `id` uuid primary key default `gen_random_uuid()`
- `tour_id` uuid references `tours(id)`
- `start_time` timestamptz
- `capacity` integer
- `remaining_slots` integer
- `created_at` timestamptz default `now()`

### `orders`

- `id` uuid primary key default `gen_random_uuid()`
- `user_id` uuid references `auth.users(id)`
- `tour_id` uuid references `tours(id)`
- `session_id` uuid references `sessions(id)`
- `quantity` integer
- `total_amount` integer
- `created_at` timestamptz default `now()`

## 重要提醒

目前報名流程是先寫入 `orders`，再更新 `sessions.remaining_slots`。流程可用，但正式上線建議改成 Supabase SQL function 做交易式扣名額，避免多人同時搶位時發生競爭條件。

## 本機啟動

```powershell
php -S localhost:8000
```

開啟 `http://localhost:8000/index.php` 即可。
