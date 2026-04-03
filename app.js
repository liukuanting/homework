const cfg = window.SUPABASE_CONFIG || {};
const page = document.body?.dataset?.page || "";
const currency = cfg.currency || "NT$";

const supabaseClient =
  window.supabase && cfg.url && cfg.anonKey
    ? window.supabase.createClient(cfg.url, cfg.anonKey)
    : null;

let toursCache = [];
let appState = {
  session: null,
  user: null,
  profile: null,
};

document.addEventListener("DOMContentLoaded", () => {
  bindGlobalUi();

  if (!supabaseClient) {
    showMessage("authMessage", "Please update assets/config.js first.", true);
    return;
  }

  startApp().catch((error) => {
    console.error(error);
    showMessage("authMessage", error.message || "App init failed.", true);
  });
});

async function startApp() {
  const { data, error } = await supabaseClient.auth.getSession();
  if (error) throw error;

  appState.session = data.session;
  appState.user = data.session?.user || null;

  supabaseClient.auth.onAuthStateChange(async (_event, session) => {
    appState.session = session;
    appState.user = session?.user || null;
    await refreshIdentity();
  });

  await refreshIdentity();

  if (page === "home") await loadHomePage();
  if (page === "login") bindLoginPage();
  if (page === "dashboard") await loadDashboardPage();
  if (page === "admin") await loadAdminPage();
}

function bindGlobalUi() {
  document.getElementById("logoutButton")?.addEventListener("click", async () => {
    await supabaseClient?.auth.signOut();
    window.location.href = "login.html";
  });
}

async function refreshIdentity() {
  const navUser = document.getElementById("navUserEmail");
  const logoutButton = document.getElementById("logoutButton");

  if (!appState.user) {
    appState.profile = null;
    if (navUser) navUser.textContent = "";
    logoutButton?.classList.add("is-hidden");
    return;
  }

  appState.profile = await ensureProfile(appState.user);

  if (navUser) {
    navUser.textContent =
      appState.profile?.full_name ||
      appState.user.user_metadata?.full_name ||
      appState.user.email ||
      "";
  }

  logoutButton?.classList.remove("is-hidden");
}

async function ensureProfile(user) {
  const { data, error } = await supabaseClient
    .from("profiles")
    .select("id, full_name, email, is_admin")
    .eq("id", user.id)
    .maybeSingle();

  if (!error && data) return data;

  const payload = {
    id: user.id,
    full_name: user.user_metadata?.full_name || user.email?.split("@")[0] || "Member",
    email: user.email || "",
    is_admin: false,
  };

  const upsert = await supabaseClient
    .from("profiles")
    .upsert(payload, { onConflict: "id" })
    .select("id, full_name, email, is_admin")
    .single();

  if (upsert.error) {
    console.error("Profile sync failed:", upsert.error);
    return payload;
  }

  return upsert.data;
}

async function fetchTours() {
  const toursResult = await supabaseClient
    .from("tours")
    .select("id, title, description, level, price, location, created_at")
    .order("created_at", { ascending: false });
  if (toursResult.error) throw toursResult.error;

  const sessionsResult = await supabaseClient
    .from("sessions")
    .select("id, tour_id, start_time, capacity, remaining_slots, created_at")
    .order("start_time", { ascending: true });
  if (sessionsResult.error) throw sessionsResult.error;

  const sessionMap = {};
  (sessionsResult.data || []).forEach((session) => {
    if (!sessionMap[session.tour_id]) sessionMap[session.tour_id] = [];
    sessionMap[session.tour_id].push(session);
  });

  toursCache = (toursResult.data || []).map((tour) => ({
    ...tour,
    sessions: sessionMap[tour.id] || [],
  }));

  return toursCache;
}

function formatDateTime(value) {
  if (!value) return "-";
  return new Date(value).toLocaleString("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatMoney(value) {
  return `${currency}${Number(value || 0).toLocaleString("zh-TW")}`;
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderCards(tours, canBook = false) {
  const cards = [];

  tours.forEach((tour) => {
    (tour.sessions || []).forEach((session) => {
      cards.push(`
        <article class="session-card">
          <div class="session-top">
            <span class="level-badge">${escapeHtml(tour.level)}</span>
            <span class="slot-badge">${session.remaining_slots}/${session.capacity} 名</span>
          </div>
          <h3>${escapeHtml(tour.title)}</h3>
          <p>${escapeHtml(tour.description || "尚未填寫說明")}</p>
          <dl class="session-meta">
            <div><dt>時間</dt><dd>${formatDateTime(session.start_time)}</dd></div>
            <div><dt>費用</dt><dd>${formatMoney(tour.price)}</dd></div>
            <div><dt>地點</dt><dd>${escapeHtml(tour.location || "待公告")}</dd></div>
          </dl>
          ${
            canBook
              ? `<button class="button book-button" data-session-id="${session.id}">我要報名</button>`
              : `<a class="button button-secondary" href="login.html">登入後報名</a>`
          }
        </article>
      `);
    });
  });

  return cards.length
    ? cards.join("")
    : '<div class="empty-state">目前沒有符合條件的場次。</div>';
}

function filterTours({ date = "", level = "" } = {}) {
  return toursCache
    .map((tour) => {
      let sessions = [...(tour.sessions || [])];
      if (date) sessions = sessions.filter((item) => item.start_time.startsWith(date));
      if (level && tour.level !== level) sessions = [];
      return { ...tour, sessions };
    })
    .filter((tour) => tour.sessions.length > 0);
}

async function loadHomePage() {
  const tours = await fetchTours();
  renderHomeCards(tours);

  document.getElementById("homeLevelFilter")?.addEventListener("change", (event) => {
    renderHomeCards(filterTours({ level: event.target.value }));
  });
}

function renderHomeCards(tours) {
  const container = document.getElementById("homeSessions");
  if (container) container.innerHTML = renderCards(tours, false);

  const totalSessions = tours.reduce((sum, tour) => sum + (tour.sessions || []).length, 0);
  const totalSlots = tours.reduce((sum, tour) => {
    return sum + (tour.sessions || []).reduce((inner, item) => inner + Number(item.remaining_slots || 0), 0);
  }, 0);

  const sessionCounter = document.getElementById("heroSessionCount");
  const slotCounter = document.getElementById("heroSlotsCount");
  if (sessionCounter) sessionCounter.textContent = String(totalSessions);
  if (slotCounter) slotCounter.textContent = String(totalSlots);
}

function bindLoginPage() {
  const tabs = document.querySelectorAll("[data-auth-tab]");
  const modeInput = document.getElementById("loginMode");

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      tabs.forEach((item) => item.classList.remove("is-active"));
      tab.classList.add("is-active");
      if (modeInput) modeInput.value = tab.dataset.authTab || "member";
    });
  });

  document.getElementById("loginForm")?.addEventListener("submit", handleLogin);
  document.getElementById("registerForm")?.addEventListener("submit", handleRegister);
}

async function handleLogin(event) {
  event.preventDefault();

  const email = document.getElementById("loginEmail").value.trim();
  const password = document.getElementById("loginPassword").value;
  const mode = document.getElementById("loginMode")?.value || "member";

  try {
    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) throw error;

    appState.session = data.session;
    appState.user = data.user;
    appState.profile = await ensureProfile(data.user);

    if (mode === "admin" && !appState.profile?.is_admin) {
      throw new Error("此帳號不是管理者。");
    }

    window.location.href = mode === "admin" ? "admin.html" : "dashboard.html";
  } catch (error) {
    showMessage("authMessage", error.message || "登入失敗。", true);
  }
}

async function handleRegister(event) {
  event.preventDefault();

  const fullName = document.getElementById("registerName").value.trim();
  const email = document.getElementById("registerEmail").value.trim();
  const password = document.getElementById("registerPassword").value;

  try {
    const { data, error } = await supabaseClient.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
      },
    });
    if (error) throw error;

    if (data.user) await ensureProfile(data.user);

    showMessage(
      "authMessage",
      data.session
        ? "註冊成功，現在可以登入。"
        : "註冊成功，請先到 Email 完成驗證。"
    );
  } catch (error) {
    showMessage("authMessage", error.message || "註冊失敗。", true);
  }
}

async function loadDashboardPage() {
  if (!appState.user) {
    window.location.href = "login.html";
    return;
  }

  const userLabel = document.getElementById("dashboardUserName");
  if (userLabel) {
    userLabel.textContent = appState.profile?.full_name || appState.user.email || "會員";
  }

  await fetchTours();
  renderDashboardCards();
  await loadMyOrders();

  document.getElementById("sessionDateFilter")?.addEventListener("change", renderDashboardCards);
  document.getElementById("sessionLevelFilter")?.addEventListener("change", renderDashboardCards);
  document.getElementById("bookingForm")?.addEventListener("submit", submitBooking);
}

function renderDashboardCards() {
  const date = document.getElementById("sessionDateFilter")?.value || "";
  const level = document.getElementById("sessionLevelFilter")?.value || "";
  const filtered = filterTours({ date, level });

  const container = document.getElementById("dashboardSessions");
  if (container) container.innerHTML = renderCards(filtered, true);

  const select = document.getElementById("bookingSessionId");
  if (select) {
    const options = filtered.flatMap((tour) =>
      (tour.sessions || []).map((session) => {
        return `<option value="${session.id}">${escapeHtml(tour.title)} | ${formatDateTime(session.start_time)} | 剩 ${session.remaining_slots} 名</option>`;
      })
    );
    select.innerHTML = `<option value="">請選擇場次</option>${options.join("")}`;
  }

  document.querySelectorAll(".book-button").forEach((button) => {
    button.addEventListener("click", () => {
      const bookingSelect = document.getElementById("bookingSessionId");
      if (bookingSelect) bookingSelect.value = button.dataset.sessionId || "";
      bookingSelect?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  });
}

async function submitBooking(event) {
  event.preventDefault();

  try {
    const sessionId = document.getElementById("bookingSessionId").value;
    const quantity = Number(document.getElementById("bookingQuantity").value || 1);
    if (!sessionId) throw new Error("請先選擇場次。");

    const sessionResult = await supabaseClient
      .from("sessions")
      .select("id, tour_id, remaining_slots")
      .eq("id", sessionId)
      .single();
    if (sessionResult.error) throw sessionResult.error;

    const selectedSession = sessionResult.data;
    if (Number(selectedSession.remaining_slots || 0) < quantity) {
      throw new Error("剩餘名額不足。");
    }

    const tour = toursCache.find((item) => item.id === selectedSession.tour_id);
    if (!tour) throw new Error("找不到對應行程。");

    const orderResult = await supabaseClient.from("orders").insert({
      user_id: appState.user.id,
      tour_id: tour.id,
      session_id: selectedSession.id,
      quantity,
      total_amount: Number(tour.price || 0) * quantity,
    });
    if (orderResult.error) throw orderResult.error;

    const slotResult = await supabaseClient
      .from("sessions")
      .update({ remaining_slots: Number(selectedSession.remaining_slots) - quantity })
      .eq("id", selectedSession.id);
    if (slotResult.error) throw slotResult.error;

    showMessage("bookingMessage", "報名成功。");
    await fetchTours();
    renderDashboardCards();
    await loadMyOrders();
  } catch (error) {
    showMessage("bookingMessage", error.message || "報名失敗。", true);
  }
}

async function loadMyOrders() {
  try {
    const { data, error } = await supabaseClient
      .from("orders")
      .select("id, quantity, total_amount, created_at, tours(title, level), sessions(start_time)")
      .eq("user_id", appState.user.id)
      .order("created_at", { ascending: false });
    if (error) throw error;

    const container = document.getElementById("orderHistory");
    container.innerHTML = (data || []).length
      ? renderTable(
          ["日期", "行程", "級數", "人數", "金額"],
          data.map((order) => [
            formatDateTime(order.created_at),
            escapeHtml(order.tours?.title || "-"),
            escapeHtml(order.tours?.level || "-"),
            `${order.quantity} 人`,
            formatMoney(order.total_amount),
          ])
        )
      : '<div class="empty-state">目前還沒有報名紀錄。</div>';
  } catch (error) {
    showMessage("bookingMessage", error.message || "讀取訂單失敗。", true);
  }
}

async function loadAdminPage() {
  if (!appState.user) {
    window.location.href = "login.html";
    return;
  }

  if (!appState.profile?.is_admin) {
    window.location.href = "login.html";
    return;
  }

  const adminLabel = document.getElementById("adminUserName");
  if (adminLabel) {
    adminLabel.textContent = appState.profile?.full_name || appState.user.email || "管理者";
  }

  await fetchTours();
  renderAdminTours();
  renderAdminSessions();
  await loadAdminOrders();

  document.getElementById("tourForm")?.addEventListener("submit", saveTour);
  document.getElementById("sessionForm")?.addEventListener("submit", saveSession);
  document.getElementById("refreshOrders")?.addEventListener("click", loadAdminOrders);
}

function renderAdminTours() {
  const rows = toursCache.map((tour) => [
    escapeHtml(tour.title),
    escapeHtml(tour.level),
    formatMoney(tour.price),
    escapeHtml(tour.location || "-"),
    `<div class="inline-actions">
      <button class="button button-secondary small-button" data-edit-tour="${tour.id}">編輯</button>
      <button class="button danger-button small-button" data-delete-tour="${tour.id}">刪除</button>
    </div>`,
  ]);

  document.getElementById("tourTable").innerHTML = rows.length
    ? renderTable(["標題", "級數", "費用", "地點", "操作"], rows)
    : '<div class="empty-state">尚未建立任何行程。</div>';

  const options = toursCache.map((tour) => `<option value="${tour.id}">${escapeHtml(tour.title)}</option>`);
  document.getElementById("sessionTourId").innerHTML = `<option value="">請選擇行程</option>${options.join("")}`;
  document.getElementById("orderTourFilter").innerHTML = `<option value="">全部行程</option>${options.join("")}`;

  document.querySelectorAll("[data-edit-tour]").forEach((button) => {
    button.addEventListener("click", () => fillTourForm(button.dataset.editTour));
  });
  document.querySelectorAll("[data-delete-tour]").forEach((button) => {
    button.addEventListener("click", () => deleteTour(button.dataset.deleteTour));
  });
}

function renderAdminSessions() {
  const sessions = toursCache.flatMap((tour) =>
    (tour.sessions || []).map((session) => ({
      ...session,
      tourTitle: tour.title,
    }))
  );

  const rows = sessions.map((session) => [
    escapeHtml(session.tourTitle),
    formatDateTime(session.start_time),
    `${session.remaining_slots}/${session.capacity}`,
    `<div class="inline-actions">
      <button class="button button-secondary small-button" data-edit-session="${session.id}">編輯</button>
      <button class="button danger-button small-button" data-delete-session="${session.id}">刪除</button>
    </div>`,
  ]);

  document.getElementById("sessionTable").innerHTML = rows.length
    ? renderTable(["行程", "時間", "名額", "操作"], rows)
    : '<div class="empty-state">目前沒有檔期。</div>';

  document.querySelectorAll("[data-edit-session]").forEach((button) => {
    button.addEventListener("click", () => fillSessionForm(button.dataset.editSession));
  });
  document.querySelectorAll("[data-delete-session]").forEach((button) => {
    button.addEventListener("click", () => deleteSession(button.dataset.deleteSession));
  });
}

function fillTourForm(tourId) {
  const tour = toursCache.find((item) => String(item.id) === String(tourId));
  if (!tour) return;

  document.getElementById("tourId").value = tour.id;
  document.getElementById("tourTitle").value = tour.title || "";
  document.getElementById("tourLevel").value = tour.level || "新手";
  document.getElementById("tourPrice").value = tour.price || 0;
  document.getElementById("tourLocation").value = tour.location || "";
  document.getElementById("tourDescription").value = tour.description || "";
}

function fillSessionForm(sessionId) {
  const session = toursCache
    .flatMap((tour) => tour.sessions || [])
    .find((item) => String(item.id) === String(sessionId));
  if (!session) return;

  document.getElementById("adminSessionId").value = session.id;
  document.getElementById("sessionTourId").value = session.tour_id;
  document.getElementById("sessionStartTime").value = toDatetimeLocal(session.start_time);
  document.getElementById("sessionCapacity").value = session.capacity || 0;
  document.getElementById("sessionRemaining").value = session.remaining_slots || 0;
}

function toDatetimeLocal(value) {
  if (!value) return "";
  const date = new Date(value);
  const pad = (number) => String(number).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

async function saveTour(event) {
  event.preventDefault();

  try {
    const payload = {
      title: document.getElementById("tourTitle").value.trim(),
      level: document.getElementById("tourLevel").value,
      price: Number(document.getElementById("tourPrice").value || 0),
      location: document.getElementById("tourLocation").value.trim(),
      description: document.getElementById("tourDescription").value.trim(),
    };

    const id = document.getElementById("tourId").value;
    const result = id
      ? await supabaseClient.from("tours").update(payload).eq("id", id)
      : await supabaseClient.from("tours").insert(payload);
    if (result.error) throw result.error;

    event.target.reset();
    document.getElementById("tourId").value = "";
    await fetchTours();
    renderAdminTours();
    renderAdminSessions();
    await loadAdminOrders();
  } catch (error) {
    alert(error.message || "儲存行程失敗。");
  }
}

async function deleteTour(tourId) {
  if (!window.confirm("確定要刪除這個行程嗎？")) return;

  try {
    const result = await supabaseClient.from("tours").delete().eq("id", tourId);
    if (result.error) throw result.error;

    await fetchTours();
    renderAdminTours();
    renderAdminSessions();
    await loadAdminOrders();
  } catch (error) {
    alert(error.message || "刪除行程失敗。");
  }
}

async function saveSession(event) {
  event.preventDefault();

  try {
    const payload = {
      tour_id: document.getElementById("sessionTourId").value,
      start_time: new Date(document.getElementById("sessionStartTime").value).toISOString(),
      capacity: Number(document.getElementById("sessionCapacity").value || 0),
      remaining_slots: Number(document.getElementById("sessionRemaining").value || 0),
    };

    const id = document.getElementById("adminSessionId").value;
    const result = id
      ? await supabaseClient.from("sessions").update(payload).eq("id", id)
      : await supabaseClient.from("sessions").insert(payload);
    if (result.error) throw result.error;

    event.target.reset();
    document.getElementById("adminSessionId").value = "";
    await fetchTours();
    renderAdminTours();
    renderAdminSessions();
  } catch (error) {
    alert(error.message || "儲存檔期失敗。");
  }
}

async function deleteSession(sessionId) {
  if (!window.confirm("確定要刪除這個檔期嗎？")) return;

  try {
    const result = await supabaseClient.from("sessions").delete().eq("id", sessionId);
    if (result.error) throw result.error;

    await fetchTours();
    renderAdminSessions();
  } catch (error) {
    alert(error.message || "刪除檔期失敗。");
  }
}

async function loadAdminOrders() {
  try {
    const date = document.getElementById("orderDateFilter")?.value || "";
    const tourId = document.getElementById("orderTourFilter")?.value || "";

    let query = supabaseClient
      .from("orders")
      .select("id, quantity, total_amount, created_at, profiles(full_name, email), sessions(start_time), tours(title)")
      .order("created_at", { ascending: false });

    if (tourId) query = query.eq("tour_id", tourId);
    if (date) query = query.gte("created_at", `${date}T00:00:00`).lte("created_at", `${date}T23:59:59`);

    const { data, error } = await query;
    if (error) throw error;

    const rows = (data || []).map((order) => [
      formatDateTime(order.created_at),
      escapeHtml(order.profiles?.full_name || order.profiles?.email || "-"),
      escapeHtml(order.tours?.title || "-"),
      formatDateTime(order.sessions?.start_time),
      `${order.quantity} 人`,
      formatMoney(order.total_amount),
    ]);

    document.getElementById("adminOrderTable").innerHTML = rows.length
      ? renderTable(["日期", "會員名稱", "行程", "檔期", "人數", "總金額"], rows)
      : '<div class="empty-state">查無符合條件的訂單。</div>';
  } catch (error) {
    alert(error.message || "讀取訂單失敗。");
  }
}

function renderTable(headers, rows) {
  return `
    <table class="data-table">
      <thead>
        <tr>${headers.map((item) => `<th>${item}</th>`).join("")}</tr>
      </thead>
      <tbody>
        ${rows.map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join("")}</tr>`).join("")}
      </tbody>
    </table>
  `;
}

function showMessage(id, message, isError = false) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = message;
  el.classList.add("is-visible");
  el.classList.toggle("is-error", isError);
}
