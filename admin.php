<?php

declare(strict_types=1);

require __DIR__ . '/lib/bootstrap.php';

render_head('管理後台', 'admin');
render_header('admin');
?>
<main class="page-shell">
    <section class="section-header">
        <div>
            <p class="eyebrow">Admin Side</p>
            <h1>後台管理</h1>
        </div>
        <div class="glass-card welcome-card">
            <p>限 `profiles.is_admin = true` 的帳號使用。</p>
            <strong id="adminUserName">驗證中...</strong>
        </div>
    </section>

    <section class="admin-grid">
        <div class="glass-card">
            <div class="section-header stacked">
                <div>
                    <p class="eyebrow">Tour Management</p>
                    <h2>行程管理</h2>
                </div>
                <p>新增、修改、刪除級數、價格、時間說明。</p>
            </div>
            <form id="tourForm" class="form-card">
                <input id="tourId" type="hidden">
                <label>
                    <span>標題</span>
                    <input id="tourTitle" type="text" required>
                </label>
                <label>
                    <span>級數</span>
                    <select id="tourLevel" required>
                        <option value="新手">新手</option>
                        <option value="進階">進階</option>
                        <option value="老手">老手</option>
                    </select>
                </label>
                <label>
                    <span>費用</span>
                    <input id="tourPrice" type="number" min="0" required>
                </label>
                <label>
                    <span>地點</span>
                    <input id="tourLocation" type="text" placeholder="台北市中正區羽球館">
                </label>
                <label>
                    <span>說明</span>
                    <textarea id="tourDescription" rows="4"></textarea>
                </label>
                <button class="button" type="submit">儲存行程</button>
            </form>
            <div id="tourTable" class="table-shell"></div>
        </div>

        <div class="glass-card">
            <div class="section-header stacked">
                <div>
                    <p class="eyebrow">Session Management</p>
                    <h2>檔期管理</h2>
                </div>
                <p>新增檔期、刪除檔期，並維護總名額與剩餘名額。</p>
            </div>
            <form id="sessionForm" class="form-card">
                <input id="adminSessionId" type="hidden">
                <label>
                    <span>對應行程</span>
                    <select id="sessionTourId" required>
                        <option value="">請選擇行程</option>
                    </select>
                </label>
                <label>
                    <span>開始時間</span>
                    <input id="sessionStartTime" type="datetime-local" required>
                </label>
                <label>
                    <span>總名額</span>
                    <input id="sessionCapacity" type="number" min="1" required>
                </label>
                <label>
                    <span>剩餘名額</span>
                    <input id="sessionRemaining" type="number" min="0" required>
                </label>
                <button class="button" type="submit">儲存檔期</button>
            </form>
            <div id="sessionTable" class="table-shell"></div>
        </div>
    </section>

    <section class="glass-card">
        <div class="section-header">
            <div>
                <p class="eyebrow">Order Management</p>
                <h2>訂單管理</h2>
            </div>
            <div class="filter-row compact">
                <input id="orderDateFilter" type="date">
                <select id="orderTourFilter">
                    <option value="">全部行程</option>
                </select>
                <button id="refreshOrders" class="button button-secondary" type="button">查詢訂單</button>
            </div>
        </div>
        <div id="adminOrderTable" class="table-shell"></div>
    </section>
</main>
<?php render_footer(); ?>
