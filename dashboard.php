<?php

declare(strict_types=1);

require __DIR__ . '/lib/bootstrap.php';

render_head('會員中心', 'dashboard');
render_header('dashboard');
?>
<main class="page-shell">
    <section class="section-header">
        <div>
            <p class="eyebrow">User Side</p>
            <h1>會員中心</h1>
        </div>
        <div class="glass-card welcome-card">
            <p>登入後可瀏覽場次、直接報名、查詢訂單紀錄。</p>
            <strong id="dashboardUserName">尚未登入</strong>
        </div>
    </section>

    <section class="two-column">
        <div class="glass-card">
            <div class="section-header stacked">
                <div>
                    <p class="eyebrow">Product List</p>
                    <h2>行程瀏覽</h2>
                </div>
                <p>可依時間與級數篩選場次。</p>
            </div>
            <div class="filter-row">
                <input id="sessionDateFilter" type="date">
                <select id="sessionLevelFilter">
                    <option value="">全部級數</option>
                    <option value="新手">新手</option>
                    <option value="進階">進階</option>
                    <option value="老手">老手</option>
                </select>
            </div>
            <div id="dashboardSessions" class="card-grid compact-grid"></div>
        </div>

        <div class="glass-card">
            <div class="section-header stacked">
                <div>
                    <p class="eyebrow">Order Flow</p>
                    <h2>快速報名</h2>
                </div>
                <p>選擇檔期與人數後，會直接寫入 `orders` 資料表並同步扣除名額。</p>
            </div>
            <form id="bookingForm" class="form-card">
                <label>
                    <span>檔期</span>
                    <select id="bookingSessionId" required>
                        <option value="">請先選擇場次</option>
                    </select>
                </label>
                <label>
                    <span>人數</span>
                    <input id="bookingQuantity" type="number" min="1" value="1" required>
                </label>
                <button class="button" type="submit">我要報名</button>
            </form>
            <div id="bookingMessage" class="message-box"></div>
        </div>
    </section>

    <section class="glass-card">
        <div class="section-header stacked">
            <div>
                <p class="eyebrow">Order History</p>
                <h2>訂單紀錄</h2>
            </div>
            <p>顯示會員所有報名日期、檔期與總金額。</p>
        </div>
        <div id="orderHistory" class="table-shell"></div>
    </section>
</main>
<?php render_footer(); ?>
