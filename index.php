<?php

declare(strict_types=1);

require __DIR__ . '/lib/bootstrap.php';

render_head('首頁', 'home');
render_header('home');
?>
<main class="page-shell">
    <section class="hero">
        <div class="hero-copy">
            <p class="eyebrow">Badminton Booking</p>
            <h1>羽球臨打，一眼看場次，立即完成報名。</h1>
            <p class="hero-text">
                幫你把場次、級數、時間、費用和剩餘名額整合在同一個頁面。會員可直接登入報名，管理者可在後台即時維護行程與檔期。
            </p>
            <div class="hero-actions">
                <a class="button" href="login.php">會員登入 / 註冊</a>
                <a class="button button-secondary" href="admin.php">管理者登入</a>
            </div>
        </div>
        <div class="hero-panel glass-card">
            <div class="metric-row">
                <div>
                    <span class="metric-label">即時場次</span>
                    <strong id="heroSessionCount">--</strong>
                </div>
                <div>
                    <span class="metric-label">剩餘名額</span>
                    <strong id="heroSlotsCount">--</strong>
                </div>
            </div>
            <p class="panel-note">首頁會自動載入 Supabase 的場次資料。</p>
        </div>
    </section>

    <section class="section-header">
        <div>
            <p class="eyebrow">Open Sessions</p>
            <h2>近期臨打場次</h2>
        </div>
        <div class="filter-row compact">
            <select id="homeLevelFilter">
                <option value="">全部級數</option>
                <option value="新手">新手</option>
                <option value="進階">進階</option>
                <option value="老手">老手</option>
            </select>
        </div>
    </section>

    <section id="homeSessions" class="card-grid"></section>
</main>
<?php render_footer(); ?>
