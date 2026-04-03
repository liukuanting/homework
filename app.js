const cfg = window.SUPABASE_CONFIG || {};
const page = document.body?.dataset?.page || "";
const currency = cfg.currency || "NT$";
const supabaseClient =
  window.supabase && cfg.url && cfg.anonKey
    ? window.supabase.createClient(cfg.url, cfg.anonKey)
    : null;

const levels = Array.from({ length: 18 }, (_, index) => String(index + 1));
let toursCache = [];
let appState = {
  session: null,
  user: null,
  profile: null,
};

document.addEventListener("DOMContentLoaded", () => {
  bindGlobalUi();

  if (!supabaseClient) {
    showMessage("authMessage", "Please set Supabase config first.", true);
    showMessage("registerMessage", "Please set Supabase config first.", true);
    return;
  }

  startApp().catch((error) => {
    console.error(error);
    showMessage("authMessage", error.message || "App init failed.", true);
    showMessage("registerMessage", error.message || "App init failed.", true);
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
  if (page === "register") bindRegisterPage();
  if (page === "dashboard") await loadDashboardPage();
  if (page === "admin") await loadAdminPage();
}

function bindGlobalUi() {
  document.getElementById("logoutButton")?.addEventListener("click", async () => {
    await supabaseClient.auth.signOut();
    try {
      window.localStorage.removeItem("admin_debug_snapshot");
    } catch (_error) {
      // ignore
    }
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
  const profileResult = await supabaseClient
    .from("profiles")
    .select("id, full_name, email, is_admin")
    .eq("id", user.id)
    .maybeSingle();

  if (!profileResult.error && profileResult.data) return profileResult.data;

  if (profileResult.error) {
    throw new Error(`Profile read failed: ${profileResult.error.message}`);
  }

  const payload = {
    id: user.id,
    full_name: user.user_metadata?.full_name || user.email?.split("@")[0] || "member",
    email: user.email || "",
    is_admin: false,
  };

  const upsertResult = await supabaseClient
    .from("profiles")
    .upsert(payload, { onConflict: "id" })
    .select("id, full_name, email, is_admin")
    .single();

  if (upsertResult.error) {
    console.error(upsertResult.error);
    return payload;
  }

  return upsertResult.data;
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
  for (const session of sessionsResult.data || []) {
    if (!sessionMap[session.tour_id]) sessionMap[session.tour_id] = [];
    sessionMap[session.tour_id].push(session);
  }

  toursCache = (toursResult.data || []).map((tour) => ({
    ...tour,
    sessions: sessionMap[tour.id] || [],
  }));

  return toursCache;
}

function fillLevelSelect(selectId, includeAll = false) {
  const select = document.getElementById(selectId);
  if (!select) return;
  const options = levels.map((level) => `<option value="${level}">${level}</option>`).join("");
  select.innerHTML = includeAll ? `<option value="">All Levels</option>${options}` : options;
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatMoney(value) {
  return `${currency}${Number(value || 0).toLocaleString("zh-TW")}`;
}

function formatDateTime(value) {
  if (!value) return "-";
  return new Date(value).toLocaleString("zh-TW", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function toDateOnly(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function extractMeta(description) {
  const raw = String(description || "");
  const scheduleMatch = raw.match(/^\[\[TIME\]\](.+)$/m);
  const detail = raw.replace(/^\[\[TIME\]\].+$/m, "").trim();
  return {
    schedule: scheduleMatch ? scheduleMatch[1].trim() : "",
    detail,
  };
}

function buildDescription(schedule, detail) {
  const parts = [];
  if (schedule) parts.push(`[[TIME]]${schedule}`);
  if (detail) parts.push(detail);
  return parts.join("\n");
}

function parseScheduleToIso(scheduleText) {
  const value = String(scheduleText || "").trim();
  const match = value.match(/^(\d{1,4})[\/-](\d{1,2})(?:[\/-](\d{1,2}))?\s+(\d{1,2}):(\d{2})\s*[-~]\s*(\d{1,2}):(\d{2})$/);
  if (!match) {
    throw new Error("Use format like 4/12 19:00-21:00 or 2026-04-12 19:00-21:00");
  }

  let year = new Date().getFullYear();
  let month;
  let day;

  if (match[3]) {
    year = Number(match[1]);
    month = Number(match[2]);
    day = Number(match[3]);
  } else {
    month = Number(match[1]);
    day = Number(match[2]);
  }

  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const date = new Date(year, month - 1, day, hour, minute);
  if (Number.isNaN(date.getTime())) {
    throw new Error("Time format cannot be parsed.");
  }

  return date.toISOString();
}

function renderCards(tours, canBook) {
  const cards = [];

  for (const tour of tours) {
    const meta = extractMeta(tour.description);
    for (const session of tour.sessions || []) {
      cards.push(`
        <article class="session-card">
          <div class="session-top">
            <span class="level-badge">Level ${escapeHtml(tour.level)}</span>
            <span class="slot-badge">${session.remaining_slots}/${session.capacity}</span>
          </div>
          <h3>${escapeHtml(tour.title)}</h3>
          <p>${escapeHtml(meta.detail || "Badminton session open for booking.")}</p>
          <dl class="session-meta">
            <div><dt>Time</dt><dd>${escapeHtml(meta.schedule || formatDateTime(session.start_time))}</dd></div>
            <div><dt>Location</dt><dd>${escapeHtml(tour.location || "-")}</dd></div>
            <div><dt>Price</dt><dd>${formatMoney(tour.price)}</dd></div>
          </dl>
          ${
            canBook
              ? `<button class="button book-button" data-session-id="${session.id}">Book Now</button>`
              : `<a class="button button-secondary" href="login.html">Login to Book</a>`
          }
        </article>
      `);
    }
  }

  return cards.length ? cards.join("") : '<div class="empty-state">No sessions found.</div>';
}

function filterTours(date, level) {
  return toursCache
    .map((tour) => {
      let sessions = [...(tour.sessions || [])];
      if (date) sessions = sessions.filter((item) => toDateOnly(item.start_time) === date);
      if (level) sessions = String(tour.level) === String(level) ? sessions : [];
      return { ...tour, sessions };
    })
    .filter((tour) => tour.sessions.length > 0);
}

async function loadHomePage() {
  fillLevelSelect("homeLevelFilter", true);
  await fetchTours();
  renderHomeCards(toursCache);
  document.getElementById("homeLevelFilter")?.addEventListener("change", () => {
    const level = document.getElementById("homeLevelFilter").value;
    renderHomeCards(filterTours("", level));
  });
}

function renderHomeCards(tours) {
  const container = document.getElementById("homeSessions");
  if (container) container.innerHTML = renderCards(tours, false);

  const totalSessions = tours.reduce((sum, tour) => sum + (tour.sessions || []).length, 0);
  const totalSlots = tours.reduce(
    (sum, tour) => sum + (tour.sessions || []).reduce((inner, item) => inner + Number(item.remaining_slots || 0), 0),
    0
  );

  const sessionCount = document.getElementById("heroSessionCount");
  const slotCount = document.getElementById("heroSlotsCount");
  if (sessionCount) sessionCount.textContent = String(totalSessions);
  if (slotCount) slotCount.textContent = String(totalSlots);
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
}

function bindRegisterPage() {
  document.getElementById("registerForm")?.addEventListener("submit", handleRegister);
}

async function handleLogin(event) {
  event.preventDefault();
  const email = document.getElementById("loginEmail").value.trim();
  const password = document.getElementById("loginPassword").value;
  const mode = document.getElementById("loginMode").value;

  try {
    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) throw error;

    appState.user = data.user;
    appState.session = data.session;
    appState.profile = await ensureProfile(data.user);

    if (mode === "admin" && !appState.profile?.is_admin) {
      throw new Error("This account is not an admin.");
    }

    window.location.href = mode === "admin" ? "admin.html" : "dashboard.html";
  } catch (error) {
    showMessage("authMessage", error.message || "Login failed.", true);
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

    if (data.session) {
      window.location.href = "dashboard.html";
      return;
    }

    showMessage("registerMessage", "Registered. Please verify email before login.");
  } catch (error) {
    showMessage("registerMessage", error.message || "Register failed.", true);
  }
}

async function loadDashboardPage() {
  if (!appState.user) {
    window.location.href = "login.html";
    return;
  }

  fillLevelSelect("sessionLevelFilter", true);

  const userName = document.getElementById("dashboardUserName");
  if (userName) {
    userName.textContent = appState.profile?.full_name || appState.user.email || "member";
  }

  await fetchTours();
  renderDashboardCards();
  await loadMyOrders();

  document.getElementById("sessionDateFilter")?.addEventListener("change", renderDashboardCards);
  document.getElementById("sessionLevelFilter")?.addEventListener("change", renderDashboardCards);
}

function renderDashboardCards() {
  const date = document.getElementById("sessionDateFilter")?.value || "";
  const level = document.getElementById("sessionLevelFilter")?.value || "";
  const container = document.getElementById("dashboardSessions");
  if (container) container.innerHTML = renderCards(filterTours(date, level), true);

  document.querySelectorAll(".book-button").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        await createOrder(button.dataset.sessionId, 1);
        showMessage("bookingMessage", "Booked successfully.");
      } catch (error) {
        showMessage("bookingMessage", error.message || "Booking failed.", true);
      }
    });
  });
}

async function createOrder(sessionId, quantity) {
  const sessionResult = await supabaseClient
    .from("sessions")
    .select("id, tour_id, remaining_slots")
    .eq("id", sessionId)
    .single();
  if (sessionResult.error) throw sessionResult.error;

  const session = sessionResult.data;
  if (Number(session.remaining_slots || 0) < quantity) {
    throw new Error("No slots left.");
  }

  const tour = toursCache.find((item) => item.id === session.tour_id);
  if (!tour) throw new Error("Tour not found.");

  const orderResult = await supabaseClient.from("orders").insert({
    user_id: appState.user.id,
    tour_id: tour.id,
    session_id: session.id,
    quantity,
    total_amount: Number(tour.price || 0) * quantity,
  });
  if (orderResult.error) throw orderResult.error;

  const updateResult = await supabaseClient
    .from("sessions")
    .update({ remaining_slots: Number(session.remaining_slots) - quantity })
    .eq("id", session.id);
  if (updateResult.error) throw updateResult.error;

  await fetchTours();
  renderDashboardCards();
  await loadMyOrders();
}

async function loadMyOrders() {
  const result = await supabaseClient
    .from("orders")
    .select("id, quantity, total_amount, created_at, tours(title, level), sessions(start_time)")
    .eq("user_id", appState.user.id)
    .order("created_at", { ascending: false });
  if (result.error) throw result.error;

  const rows = (result.data || []).map((order) => [
    formatDateTime(order.created_at),
    escapeHtml(order.tours?.title || "-"),
    escapeHtml(order.tours?.level || "-"),
    `${order.quantity}`,
    formatMoney(order.total_amount),
  ]);

  const container = document.getElementById("orderHistory");
  if (container) {
    container.innerHTML = rows.length
      ? renderTable(["Date", "Tour", "Level", "Qty", "Amount"], rows)
      : '<div class="empty-state">No orders yet.</div>';
  }
}

async function loadAdminPage() {
  renderAdminDebug({
    stage: "enter_admin_page",
    hasUser: Boolean(appState.user),
    userEmail: appState.user?.email || "",
    userId: appState.user?.id || "",
    hasSession: Boolean(appState.session),
    profileLoaded: Boolean(appState.profile),
    isAdmin: Boolean(appState.profile?.is_admin),
  });

  if (!appState.user) {
    renderAdminDebug({
      stage: "no_user",
      hasUser: false,
      userEmail: "",
      userId: "",
      hasSession: Boolean(appState.session),
      profileLoaded: Boolean(appState.profile),
      isAdmin: false,
    });
    return;
  }

  const freshProfile = await ensureProfile(appState.user);
  appState.profile = freshProfile;

  renderAdminDebug({
    stage: "profile_loaded",
    hasUser: true,
    userEmail: appState.user?.email || "",
    userId: appState.user?.id || "",
    hasSession: Boolean(appState.session),
    profileLoaded: Boolean(appState.profile),
    profileId: appState.profile?.id || "",
    profileEmail: appState.profile?.email || "",
    isAdmin: Boolean(appState.profile?.is_admin),
  });

  if (!appState.profile?.is_admin) {
    renderAdminDebug({
      stage: "not_admin",
      hasUser: true,
      userEmail: appState.user?.email || "",
      userId: appState.user?.id || "",
      hasSession: Boolean(appState.session),
      profileLoaded: Boolean(appState.profile),
      profileId: appState.profile?.id || "",
      profileEmail: appState.profile?.email || "",
      isAdmin: Boolean(appState.profile?.is_admin),
    });
    const panel = document.getElementById("tourTable");
    if (panel) {
      panel.innerHTML = '<div class="empty-state">目前登入帳號不是管理者，請先把上方除錯資訊截圖給我。</div>';
    }
    return;
  }

  const adminName = document.getElementById("adminUserName");
  if (adminName) {
    adminName.textContent = appState.profile?.full_name || appState.user.email || "admin";
  }

  await fetchTours();
  renderAdminTours();
  await loadAdminOrders();

  document.getElementById("tourForm")?.addEventListener("submit", saveAdminTour);
  document.getElementById("tourResetButton")?.addEventListener("click", resetAdminForm);
  document.getElementById("refreshOrders")?.addEventListener("click", loadAdminOrders);
}

function renderAdminDebug(data) {
  const panel = document.getElementById("adminDebugPanel");
  try {
    window.localStorage.setItem("admin_debug_snapshot", JSON.stringify(data));
  } catch (_error) {
    // ignore
  }
  if (!panel) return;

  const rows = [
    ["stage", escapeHtml(data.stage || "")],
    ["hasUser", escapeHtml(String(Boolean(data.hasUser)))],
    ["userEmail", escapeHtml(data.userEmail || "")],
    ["userId", escapeHtml(data.userId || "")],
    ["hasSession", escapeHtml(String(Boolean(data.hasSession)))],
    ["profileLoaded", escapeHtml(String(Boolean(data.profileLoaded)))],
    ["profileId", escapeHtml(data.profileId || "")],
    ["profileEmail", escapeHtml(data.profileEmail || "")],
    ["isAdmin", escapeHtml(String(Boolean(data.isAdmin)))],
  ];

  panel.innerHTML = renderTable(["key", "value"], rows);
}

function renderAdminTours() {
  const rows = toursCache.flatMap((tour) => {
    const meta = extractMeta(tour.description);
    return (tour.sessions || []).map((session) => [
      escapeHtml(tour.title),
      escapeHtml(meta.schedule || formatDateTime(session.start_time)),
      escapeHtml(tour.level),
      escapeHtml(tour.location || "-"),
      formatMoney(tour.price),
      `${session.remaining_slots}/${session.capacity}`,
      escapeHtml(meta.detail || "-"),
      `<div class="inline-actions">
        <button class="button button-secondary small-button" data-edit-tour="${tour.id}" data-edit-session="${session.id}">Edit</button>
        <button class="button danger-button small-button" data-delete-tour="${tour.id}" data-delete-session="${session.id}">Delete</button>
      </div>`,
    ]);
  });

  const table = document.getElementById("tourTable");
  if (table) {
    table.innerHTML = rows.length
      ? renderTable(["Title", "Time", "Level", "Location", "Price", "Slots", "Description", "Actions"], rows)
      : '<div class="empty-state">No tour data yet.</div>';
  }

  const tourOptions = toursCache.map((tour) => `<option value="${tour.id}">${escapeHtml(tour.title)}</option>`).join("");
  const orderFilter = document.getElementById("orderTourFilter");
  if (orderFilter) {
    orderFilter.innerHTML = `<option value="">All Tours</option>${tourOptions}`;
  }

  document.querySelectorAll("[data-edit-tour]").forEach((button) => {
    button.addEventListener("click", () => fillAdminForm(button.dataset.editTour, button.dataset.editSession));
  });
  document.querySelectorAll("[data-delete-tour]").forEach((button) => {
    button.addEventListener("click", () => deleteAdminTour(button.dataset.deleteTour, button.dataset.deleteSession));
  });
}

function fillAdminForm(tourId, sessionId) {
  const tour = toursCache.find((item) => item.id === tourId);
  const session = tour?.sessions?.find((item) => item.id === sessionId);
  if (!tour || !session) return;

  const meta = extractMeta(tour.description);
  document.getElementById("tourId").value = tour.id;
  document.getElementById("sessionId").value = session.id;
  document.getElementById("tourTitle").value = tour.title || "";
  document.getElementById("tourSchedule").value = meta.schedule || "";
  document.getElementById("tourLevel").value = String(tour.level || "1");
  document.getElementById("tourLocation").value = tour.location || "";
  document.getElementById("tourPrice").value = Number(tour.price || 0);
  document.getElementById("tourCapacity").value = Number(session.capacity || 0);
  document.getElementById("tourDescription").value = meta.detail || "";
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function resetAdminForm() {
  document.getElementById("tourForm")?.reset();
  document.getElementById("tourId").value = "";
  document.getElementById("sessionId").value = "";
}

async function saveAdminTour(event) {
  event.preventDefault();

  try {
    const tourId = document.getElementById("tourId").value;
    const sessionId = document.getElementById("sessionId").value;
    const schedule = document.getElementById("tourSchedule").value.trim();
    const startTime = parseScheduleToIso(schedule);
    const description = buildDescription(schedule, document.getElementById("tourDescription").value.trim());
    const capacity = Number(document.getElementById("tourCapacity").value || 0);

    const tourPayload = {
      title: document.getElementById("tourTitle").value.trim(),
      description,
      level: document.getElementById("tourLevel").value,
      location: document.getElementById("tourLocation").value.trim(),
      price: Number(document.getElementById("tourPrice").value || 0),
    };

    if (tourId) {
      const updateTour = await supabaseClient.from("tours").update(tourPayload).eq("id", tourId);
      if (updateTour.error) throw updateTour.error;

      const existingTour = toursCache.find((item) => item.id === tourId);
      const existingSession = existingTour?.sessions?.find((item) => item.id === sessionId);
      const remaining = existingSession
        ? Math.min(Number(existingSession.remaining_slots || 0), capacity)
        : capacity;

      const updateSession = await supabaseClient
        .from("sessions")
        .update({
          start_time: startTime,
          capacity,
          remaining_slots: remaining,
        })
        .eq("id", sessionId);
      if (updateSession.error) throw updateSession.error;
    } else {
      const insertTour = await supabaseClient.from("tours").insert(tourPayload).select("id").single();
      if (insertTour.error) throw insertTour.error;

      const insertSession = await supabaseClient.from("sessions").insert({
        tour_id: insertTour.data.id,
        start_time: startTime,
        capacity,
        remaining_slots: capacity,
      });
      if (insertSession.error) throw insertSession.error;
    }

    resetAdminForm();
    showMessage("adminTourMessage", "Tour saved.");
    await fetchTours();
    renderAdminTours();
    await loadAdminOrders();
  } catch (error) {
    showMessage("adminTourMessage", error.message || "Save failed.", true);
  }
}

async function deleteAdminTour(tourId, sessionId) {
  if (!window.confirm("Delete this tour?")) return;

  try {
    const deleteSession = await supabaseClient.from("sessions").delete().eq("id", sessionId);
    if (deleteSession.error) throw deleteSession.error;

    const tour = toursCache.find((item) => item.id === tourId);
    if ((tour?.sessions?.length || 0) <= 1) {
      const deleteTour = await supabaseClient.from("tours").delete().eq("id", tourId);
      if (deleteTour.error) throw deleteTour.error;
    }

    await fetchTours();
    renderAdminTours();
    await loadAdminOrders();
  } catch (error) {
    showMessage("adminTourMessage", error.message || "Delete failed.", true);
  }
}

async function loadAdminOrders() {
  const date = document.getElementById("orderDateFilter")?.value || "";
  const tourId = document.getElementById("orderTourFilter")?.value || "";

  let query = supabaseClient
    .from("orders")
    .select("id, quantity, total_amount, created_at, profiles(full_name, email), sessions(start_time), tours(title)")
    .order("created_at", { ascending: false });

  if (tourId) query = query.eq("tour_id", tourId);
  if (date) query = query.gte("created_at", `${date}T00:00:00`).lte("created_at", `${date}T23:59:59`);

  const result = await query;
  if (result.error) throw result.error;

  const rows = (result.data || []).map((order) => [
    formatDateTime(order.created_at),
    escapeHtml(order.profiles?.full_name || order.profiles?.email || "-"),
    escapeHtml(order.tours?.title || "-"),
    formatDateTime(order.sessions?.start_time),
    `${order.quantity}`,
    formatMoney(order.total_amount),
  ]);

  const container = document.getElementById("adminOrderTable");
  if (container) {
    container.innerHTML = rows.length
      ? renderTable(["Date", "Member", "Tour", "Session", "Qty", "Amount"], rows)
      : '<div class="empty-state">No matching orders.</div>';
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
  const element = document.getElementById(id);
  if (!element) return;
  element.textContent = message;
  element.classList.add("is-visible");
  element.classList.toggle("is-error", isError);
}
