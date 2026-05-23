const STORAGE_KEY = "apocalypse249PlayerApp";
const PLAYER_PREFIX = "APOC-PLAYER";
const OWNER_ADMIN_EMAIL = "chrisyoungairsoft@gmail.com";
const SESSION_KEY = "apocalypse249SessionToken";
const MAP_MARKERS_KEY = "apocalypse249MapMarkers";
const TAB_SEEN_KEY = "apocalypse249TabSeen";
const UKARA_REMINDER_KEY = "apocalypse249UkaraReminder";
const BOOKING_URL = "https://apocalypse249.co.uk/v2/";

const defaultState = {
  currentUserId: null,
  users: [
    {
      id: "admin-1",
      role: "admin",
      approved: true,
      playerNumber: "",
      password: "admin123",
      name: "Site Admin",
      phone: "",
      address: "",
      email: "admin@apocalypse249.co.uk",
      ukara: "",
      ukaraExpiry: "",
      photo: "",
      rifs: [],
      rifWishlist: []
    },
    {
      id: "player-1",
      role: "player",
      approved: true,
      playerNumber: "APOC-PLAYER0001",
      password: "player123",
      name: "Demo Player",
      phone: "07123 456789",
      address: "Apocalypse 249 Safe Zone",
      email: "player@example.com",
      ukara: "UKARA-249",
      ukaraExpiry: "2026-12-31",
      photo: "",
      rifWishlist: [],
      rifs: [
        {
          id: "rif-1",
          make: "Specna Arms",
          model: "SA-E12",
          type: "AEG",
          serial: "SA249-DEMO",
          fps: "",
          joules: "",
          bbWeight: "",
          zeroRange: "",
          zeroUnit: "metres",
          photo: ""
        }
      ]
    }
  ],
  events: [
    {
      id: "event-1",
      title: "Open Skirmish Day",
      date: "2026-06-07",
      notes: "Standard walk-on day. Booking required.",
      bookingUrl: BOOKING_URL
    },
    {
      id: "event-2",
      title: "MilSim Lite",
      date: "2026-06-21",
      notes: "Team objectives, medic rules and limited ammo.",
      bookingUrl: BOOKING_URL
    }
  ],
  announcements: [
    {
      id: "announcement-1",
      text: "Welcome to the Apocalypse 249 player app. Keep an eye here for site updates, game day news and kit reminders.",
      image: "",
      createdAt: "2026-05-18T12:00:00.000Z",
      scheduledAt: "",
      cheers: []
    }
  ],
  contactMessages: []
};

let state = loadState();
let calendarMonth = getInitialCalendarMonth();
let apiOnline = false;
let sessionToken = localStorage.getItem(SESSION_KEY) || "";
let apiDiagnostic = "";
let adminRefreshTimer = null;
let mapState = {
  scale: 1,
  x: 0,
  y: 0,
  rotation: 0,
  markersLocked: false,
  markerMode: "red",
  markers: loadMapMarkers(),
  pointers: new Map(),
  lastPan: null,
  lastPinch: null,
  draggingMarker: null
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

function loadState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) return migrateState(structuredClone(defaultState));

  try {
    return migrateState(JSON.parse(saved));
  } catch {
    return migrateState(structuredClone(defaultState));
  }
}

function loadMapMarkers() {
  const saved = localStorage.getItem(MAP_MARKERS_KEY);
  if (!saved) return {};

  try {
    return JSON.parse(saved);
  } catch {
    return {};
  }
}

function saveMapMarkers() {
  localStorage.setItem(MAP_MARKERS_KEY, JSON.stringify(mapState.markers));
}

function loadTabSeen() {
  try {
    return JSON.parse(localStorage.getItem(TAB_SEEN_KEY)) || {};
  } catch {
    return {};
  }
}

function saveTabSeen(seen) {
  localStorage.setItem(TAB_SEEN_KEY, JSON.stringify(seen));
}

function migrateState(loadedState) {
  loadedState.users ??= [];
  loadedState.events ??= [];
  loadedState.announcements ??= [];
  loadedState.contactMessages ??= [];

  loadedState.events.forEach((event) => {
    event.bookingUrl = BOOKING_URL;
  });

  loadedState.users.forEach((user) => {
    user.rifs ??= [];
    user.rifs.forEach((rif) => {
      rif.fps ??= "";
      rif.joules ??= "";
      rif.bbWeight ??= "";
      rif.zeroRange ??= "";
      rif.zeroUnit ??= "metres";
    });
    user.rifWishlist ??= [];
    user.playerNumber ??= "";
    user.approved ??= true;
    user.ukaraExpiry ??= "";

    if (user.email?.toLowerCase() === OWNER_ADMIN_EMAIL) {
      user.role = "admin";
      user.approved = true;
    }
  });

  loadedState.announcements.forEach((announcement) => {
    announcement.cheers ??= [];
    announcement.createdAt ??= new Date().toISOString();
    announcement.scheduledAt ??= "";
  });

  assignMissingPlayerNumbers(loadedState);
  return loadedState;
}

function saveState() {
  if (apiOnline) {
    localStorage.removeItem(STORAGE_KEY);
    return;
  }

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    renderTabNotifications();
  } catch (error) {
    localStorage.removeItem(STORAGE_KEY);
    alert("Local browser storage was full, so the local demo cache has been cleared.");
  }
}

async function apiRequest(action, body = {}) {
  let result = await fetchJson(apiUrl(action), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(sessionToken ? { authorization: `Bearer ${sessionToken}` } : {})
    },
    body: JSON.stringify(body)
  });

  if (!result.ok && apiOnline !== "direct") {
    const directResult = await fetchJson(`/.netlify/functions/api/${action}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(sessionToken ? { authorization: `Bearer ${sessionToken}` } : {})
      },
      body: JSON.stringify(body)
    });

    if (directResult.ok) {
      apiOnline = "direct";
      renderBackendStatus();
    }

    result = directResult;
  }

  if (!result.ok) throw new Error(result.data?.error || result.error || "Something went wrong.");
  return result.data;
}

function apiUrl(action) {
  return apiOnline === "direct" ? `/.netlify/functions/api/${action}` : `/api/${action}`;
}

async function fetchJson(url, options = {}) {
  try {
    const response = await fetch(url, options);
    const text = await response.text();
    const contentType = response.headers.get("content-type") || "";

    if (!contentType.includes("application/json")) {
      return {
        ok: false,
        status: response.status,
        error: `${url} returned ${response.status} but did not return JSON.`
      };
    }

    return {
      ok: response.ok,
      status: response.status,
      data: JSON.parse(text)
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      error: `${url} could not be reached.`
    };
  }
}

function applyServerData(result) {
  if (result.token) {
    sessionToken = result.token;
    localStorage.removeItem(STORAGE_KEY);
    localStorage.setItem(SESSION_KEY, sessionToken);
  }

  if (result.data) {
    state.users = result.data.users || [];
    state.events = result.data.events || [];
    state.announcements = result.data.announcements || [];
    state.contactMessages = result.data.contactMessages || [];
  }

  if (result.user) {
    state.currentUserId = result.user.id;
    const existing = state.users.find((user) => user.id === result.user.id);
    if (existing) Object.assign(existing, result.user);
    else state.users.push(result.user);
  }

  saveState();
  renderTabNotifications();
}

async function bootstrap() {
  apiOnline = await detectApiMode();

  renderBackendStatus();

  if (apiOnline) {
    localStorage.removeItem(STORAGE_KEY);
  }

  if (apiOnline && sessionToken) {
    try {
      const result = await apiRequest("auth/me");
      applyServerData(result);
    } catch {
      sessionToken = "";
      localStorage.removeItem(SESSION_KEY);
      state.currentUserId = null;
      saveState();
    }
  }

  render();
}

async function detectApiMode() {
  let functionHealthWorks = false;

  const apiHealth = await fetchJson("/api/health", { cache: "no-store" });
  if (apiHealth.ok && apiHealth.data?.ok === true) return true;
  apiDiagnostic = apiHealth.error || `/api/health returned ${apiHealth.status}.`;

  const directApiHealth = await fetchJson("/.netlify/functions/api/health", { cache: "no-store" });
  if (directApiHealth.ok && directApiHealth.data?.ok === true) return "direct";
  apiDiagnostic += ` ${directApiHealth.error || `Direct function URL returned ${directApiHealth.status}.`}`;

  try {
    const health = await fetchJson("/.netlify/functions/health", { cache: "no-store" });
    functionHealthWorks = health.ok && health.data?.ok === true;
  } catch {
    functionHealthWorks = false;
  }

  if (functionHealthWorks) {
    apiDiagnostic += " Basic Netlify Functions are working, but the shared database api function is not.";
  } else {
    apiDiagnostic += " Basic Netlify Functions are not reachable either.";
  }

  return false;
}

function renderBackendStatus() {
  const status = $("#backendStatus");
  if (!status) return;

  status.classList.toggle("is-live", apiOnline);
  status.classList.toggle("is-local", !apiOnline);
  status.textContent = apiOnline
    ? "Shared live mode: accounts work across devices."
    : "Local demo mode: accounts only work on this browser.";

  const detail = $("#backendDetail");
  if (!detail) return;

  if (apiOnline) {
    detail.textContent = "Backend connected.";
  } else if (location.hostname === "localhost" || location.hostname === "127.0.0.1") {
    detail.textContent = "This is expected on the local preview. Check your live Netlify URL for shared mode.";
  } else {
    detail.textContent = `${apiDiagnostic} Check that Netlify deployed the api function.`;
  }
}

function makeId(prefix) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function assignMissingPlayerNumbers(appState = state) {
  appState.users
    .filter((user) => user.role === "player" && !user.playerNumber)
    .forEach((user) => {
      user.playerNumber = nextPlayerNumber(appState);
    });
}

function nextPlayerNumber(appState = state) {
  const highestNumber = appState.users.reduce((highest, user) => {
    const match = user.playerNumber?.match(/^APOC-PLAYER(\d+)$/);
    return match ? Math.max(highest, Number(match[1])) : highest;
  }, 0);

  return `${PLAYER_PREFIX}${String(highestNumber + 1).padStart(4, "0")}`;
}

function getInitialCalendarMonth() {
  const firstEvent = [...state.events].sort((a, b) => a.date.localeCompare(b.date))[0];
  const baseDate = firstEvent?.date ? new Date(`${firstEvent.date}T12:00:00`) : new Date();
  return new Date(baseDate.getFullYear(), baseDate.getMonth(), 1);
}

function currentUser() {
  return state.users.find((user) => user.id === state.currentUserId) || null;
}

async function readImage(fileInput, options = {}) {
  const file = fileInput.files?.[0];
  if (!file) return "";

  const {
    maxSize = 900,
    quality = 0.72
  } = options;

  if (!file.type.startsWith("image/")) {
    alert("Please choose an image file.");
    return "";
  }

  const image = await loadImage(file);
  const scale = Math.min(1, maxSize / Math.max(image.width, image.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));
  const context = canvas.getContext("2d");
  context.drawImage(image, 0, 0, canvas.width, canvas.height);

  return canvas.toDataURL("image/jpeg", quality);
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const objectUrl = URL.createObjectURL(file);
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Image could not be loaded."));
    };
    image.src = objectUrl;
  });
}

function formatDate(dateValue) {
  if (!dateValue) return "Not set";

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  }).format(new Date(`${dateValue}T12:00:00`));
}

function toDate(dateValue) {
  return new Date(`${dateValue}T12:00:00`);
}

function toDateKey(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")
  ].join("-");
}

function addRepeatInterval(date, repeats) {
  const next = new Date(date);

  if (repeats === "daily") next.setDate(next.getDate() + 1);
  if (repeats === "weekly") next.setDate(next.getDate() + 7);
  if (repeats === "biweekly") next.setDate(next.getDate() + 14);
  if (repeats === "monthly") next.setMonth(next.getMonth() + 1);
  if (repeats === "yearly") next.setFullYear(next.getFullYear() + 1);

  return next;
}

function expandedEvents(startDate, endDate) {
  const occurrences = [];

  state.events.forEach((event) => {
    if (!event.date) return;

    const repeats = event.repeats || "none";
    const eventStart = toDate(event.date);
    const repeatUntil = event.repeatUntil ? toDate(event.repeatUntil) : endDate;
    const hardStop = repeatUntil < endDate ? repeatUntil : endDate;

    if (repeats === "none") {
      if (eventStart >= startDate && eventStart <= endDate) {
        occurrences.push({ ...event, occurrenceId: event.id, occurrenceDate: event.date });
      }
      return;
    }

    let cursor = new Date(eventStart);
    let guard = 0;
    while (cursor <= hardStop && guard < 370) {
      if (cursor >= startDate) {
        const occurrenceDate = toDateKey(cursor);
        occurrences.push({
          ...event,
          occurrenceId: `${event.id}-${occurrenceDate}`,
          occurrenceDate
        });
      }
      cursor = addRepeatInterval(cursor, repeats);
      guard += 1;
    }
  });

  return occurrences.sort((a, b) => a.occurrenceDate.localeCompare(b.occurrenceDate));
}

function repeatLabel(event) {
  if (!event.repeats || event.repeats === "none") return "";
  const label = event.repeats === "biweekly" ? "bi-weekly" : event.repeats;
  const until = event.repeatUntil ? ` until ${formatDate(event.repeatUntil)}` : "";
  return `Repeats ${label}${until}`;
}

function isAnnouncementLive(announcement) {
  return !announcement.scheduledAt || new Date(announcement.scheduledAt) <= new Date();
}

function visibleAnnouncements() {
  return state.announcements.filter(isAnnouncementLive);
}

function toDateTimeLocalValue(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return localDate.toISOString().slice(0, 16);
}

function fromDateTimeLocalValue(value) {
  return value ? new Date(value).toISOString() : "";
}

function formatDateTime(value) {
  if (!value) return "Posts immediately";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Posts immediately";
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}

function notificationSignature(viewName) {
  if (viewName === "announcements") {
    return visibleAnnouncements()
      .map((announcement) => `${announcement.id}:${announcement.createdAt || ""}:${announcement.scheduledAt || ""}`)
      .sort()
      .join("|");
  }

  if (viewName === "calendar") {
    return [...state.events]
      .map((event) => `${event.id}:${event.date || ""}:${event.title || ""}:${event.repeats || ""}:${event.repeatUntil || ""}`)
      .sort()
      .join("|");
  }

  if (viewName === "admin") {
    const pendingUsers = state.users.filter((user) => user.role === "player" && !user.approved).map((user) => user.id);
    const messages = (state.contactMessages || []).filter((message) => !message.replied).map((message) => `${message.id}:${message.createdAt || ""}`);
    const wishlists = state.users.flatMap((user) => (user.rifWishlist || []).map((rif) => `${user.id}:${rif.id}:${rif.make}:${rif.model}`));
    return [...pendingUsers, ...messages, ...wishlists].sort().join("|");
  }

  return "";
}

function markTabSeen(viewName) {
  const signature = notificationSignature(viewName);
  if (!signature) return;
  const seen = loadTabSeen();
  seen[viewName] = signature;
  saveTabSeen(seen);
  renderTabNotifications();
}

function renderTabNotifications() {
  const user = currentUser();
  const seen = loadTabSeen();
  let changed = false;
  let badgeCount = 0;

  $$(".tab").forEach((tab) => {
    const viewName = tab.dataset.view;
    const signature = notificationSignature(viewName);
    const canShow = user && signature && viewName !== "profile" && (viewName !== "admin" || user.role === "admin");
    if (user && viewName !== "profile" && !Object.prototype.hasOwnProperty.call(seen, viewName)) {
      seen[viewName] = signature;
      changed = true;
    }
    const hasUpdate = Boolean(canShow && seen[viewName] !== signature && !tab.classList.contains("is-active"));
    tab.classList.toggle("has-notification", hasUpdate);
    if (hasUpdate) badgeCount += 1;
  });

  if (changed) saveTabSeen(seen);
  updateAppBadge(badgeCount);
}

function checkUkaraExpiryReminder(user) {
  if (!user || !user.ukaraExpiry) return;

  const expiry = toDate(user.ukaraExpiry);
  const today = toDate(toDateKey(new Date()));
  const daysUntilExpiry = Math.ceil((expiry - today) / 86400000);
  if (daysUntilExpiry > 7) return;

  const reminderId = `${user.id}:${user.ukaraExpiry}:${toDateKey(today)}`;
  if (localStorage.getItem(UKARA_REMINDER_KEY) === reminderId) return;

  localStorage.setItem(UKARA_REMINDER_KEY, reminderId);
  const message = daysUntilExpiry < 0
    ? "Your UKARA expiry date has passed. Please update your UKARA expiry date on your ID page."
    : `Your UKARA expiry date is ${daysUntilExpiry === 0 ? "today" : `in ${daysUntilExpiry} day${daysUntilExpiry === 1 ? "" : "s"}`}. Please update it if you have renewed.`;
  window.setTimeout(() => alert(message), 350);
}

function setView(viewName) {
  $$(".view").forEach((view) => view.classList.add("hidden"));
  $(`#${viewName}View`)?.classList.remove("hidden");

  $$(".tab").forEach((tab) => {
    tab.classList.toggle("is-active", tab.dataset.view === viewName);
  });

  markTabSeen(viewName);

  if (viewName === "admin") {
    refreshSharedData().then(() => renderAdmin());
    startAdminAutoRefresh();
  } else {
    stopAdminAutoRefresh();
  }

  if (viewName === "calendar") {
    renderCalendar();
  }

  if (viewName === "announcements") {
    renderAnnouncements();
  }

  if (viewName === "siteDetails") {
    window.requestAnimationFrame(fitMapToStage);
  }

  renderTabNotifications();
}

function startAdminAutoRefresh() {
  stopAdminAutoRefresh();
  adminRefreshTimer = window.setInterval(async () => {
    if ($("#adminView").classList.contains("hidden")) {
      stopAdminAutoRefresh();
      return;
    }

    const refreshed = await refreshSharedData();
    if (refreshed) renderAdmin($("#adminUserId").value);
  }, 8000);
}

function stopAdminAutoRefresh() {
  if (!adminRefreshTimer) return;
  window.clearInterval(adminRefreshTimer);
  adminRefreshTimer = null;
}

async function refreshSharedData() {
  if (!apiOnline || !sessionToken) return false;

  try {
    const result = await apiRequest("auth/me");
    applyServerData(result);
    return true;
  } catch (error) {
    alert(error.message);
    return false;
  }
}

function updateAppBadge(count) {
  if ("setAppBadge" in navigator && "clearAppBadge" in navigator) {
    const action = count > 0 ? navigator.setAppBadge(count) : navigator.clearAppBadge();
    Promise.resolve(action).catch(() => {});
  }
}

function render() {
  const user = currentUser();
  $("#authPanel").classList.toggle("hidden", Boolean(user));
  $("#dashboard").classList.toggle("hidden", !user);

  if (!user) {
    $("#sessionBar").innerHTML = "";
    return;
  }

  $("#sessionBar").innerHTML = `
    <span>Signed in as <strong>${escapeHtml(user.name)}</strong></span>
    <button class="small-button" type="button" id="logoutButton">Log out</button>
  `;
  $("#logoutButton").addEventListener("click", async () => {
    if (apiOnline && sessionToken) {
      try {
        await apiRequest("auth/logout");
      } catch {
        // The local session still clears even if the remote logout call fails.
      }
    }
    sessionToken = "";
    localStorage.removeItem(SESSION_KEY);
    state.currentUserId = null;
    saveState();
    render();
  });

  $$(".admin-only").forEach((item) => item.classList.toggle("hidden", user.role !== "admin"));

  fillProfileForm(user);
  renderProfileCard(user);
  renderRifs(user);
  renderRifWishlist(user);
  renderAnnouncements();
  renderCalendar();
  renderAdmin();
  renderTabNotifications();
  checkUkaraExpiryReminder(user);
}

function fillProfileForm(user) {
  $("#profileName").value = user.name || "";
  $("#profilePhone").value = user.phone || "";
  $("#profileAddress").value = user.address || "";
  $("#profileEmail").value = user.email || "";
  $("#profileUkara").value = user.ukara || "";
  $("#profileUkaraExpiry").value = user.ukaraExpiry || "";
}

function renderProfileCard(user) {
  $("#profilePreview").innerHTML = user.photo
    ? `<img src="${user.photo}" alt="${escapeHtml(user.name)}" />`
    : "Profile photo";
  $("#cardName").textContent = user.name || "Player name";
  $("#cardPlayerNumber").textContent = user.playerNumber || "Not assigned";
  $("#cardUkara").textContent = user.ukara || "Not added";
  $("#cardUkaraExpiry").textContent = formatDate(user.ukaraExpiry);
  $("#cardEmail").textContent = user.email || "Not added";
}

function renderRifs(user) {
  const list = $("#rifList");
  list.innerHTML = "";

  if (!user.rifs.length) {
    list.innerHTML = `<article class="event-card"><h2>No RIFs added yet</h2><p>Add your first one using the form above.</p></article>`;
    return;
  }

  user.rifs.forEach((rif) => {
    const template = $("#rifCardTemplate").content.cloneNode(true);
    const card = template.querySelector(".rif-card");
    card.dataset.id = rif.id;
    template.querySelector(".rif-image").innerHTML = rif.photo
      ? `<img src="${rif.photo}" alt="${escapeHtml(rif.make)} ${escapeHtml(rif.model)}" />`
      : "RIF photo";
    template.querySelector("h2").textContent = `${rif.make} ${rif.model}`;
    const chronoParts = [
      rif.fps ? `${rif.fps} FPS` : "",
      rif.joules ? `${rif.joules} J` : "",
      rif.bbWeight ? `${rif.bbWeight} BB` : "",
      rif.zeroRange ? `Zero: ${rif.zeroRange} ${zeroUnitLabel(rif.zeroUnit)}` : ""
    ].filter(Boolean);
    template.querySelector("p").innerHTML = `
      ${escapeHtml(rif.type)} | Serial: ${escapeHtml(rif.serial)}
      ${chronoParts.length ? `<br>${escapeHtml(chronoParts.join(" | "))}` : ""}
    `;
    template.querySelector(".edit-rif").addEventListener("click", () => editRif(rif.id));
    template.querySelector(".delete-rif").addEventListener("click", () => deleteRif(rif.id));
    list.appendChild(template);
  });
}

function zeroUnitLabel(unit) {
  const labels = {
    metres: "m",
    yards: "yd",
    feet: "ft",
    "feet-inches": "ft/in"
  };
  return labels[unit] || "m";
}

function renderRifWishlist(user) {
  const list = $("#wishlistList");
  if (!list) return;
  list.innerHTML = "";

  const wishlist = user.rifWishlist || [];
  if (!wishlist.length) {
    list.innerHTML = `<article class="event-card"><h2>No wishlist RIFs yet</h2><p>Add the RIFs you would like to own using the form above.</p></article>`;
    return;
  }

  wishlist.forEach((rif) => {
    const template = $("#wishlistCardTemplate").content.cloneNode(true);
    const card = template.querySelector(".rif-card");
    card.dataset.id = rif.id;
    template.querySelector(".rif-image").innerHTML = rif.photo
      ? `<img src="${rif.photo}" alt="${escapeHtml(rif.make)} ${escapeHtml(rif.model)}" />`
      : "Wishlist photo";
    template.querySelector("h2").textContent = `${rif.make} ${rif.model}`;
    template.querySelector("p").textContent = `${rif.type} | Serial: ${rif.serial || "Not set"}`;
    template.querySelector(".edit-wishlist").addEventListener("click", () => editWishlistRif(rif.id));
    template.querySelector(".delete-wishlist").addEventListener("click", () => deleteWishlistRif(rif.id));
    list.appendChild(template);
  });
}

function renderMap() {
  const content = $("#mapContent");
  if (!content) return;

  content.style.transform = `translate(${mapState.x}px, ${mapState.y}px) rotate(${mapState.rotation}deg) scale(${mapState.scale})`;

  $$(".marker-mode").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.markerMode === mapState.markerMode);
  });

  const lockButton = $("#lockMapMarkers");
  if (lockButton) {
    lockButton.textContent = mapState.markersLocked ? "Unlock markers" : "Lock markers";
    lockButton.classList.toggle("is-active", mapState.markersLocked);
  }

  ["red", "blue", "objective"].forEach((markerName) => {
    const marker = document.querySelector(`[data-marker="${markerName}"]`);
    const position = mapState.markers[markerName];
    if (!marker) return;
    marker.classList.toggle("hidden", !position);
    marker.classList.toggle("is-locked", mapState.markersLocked);
    if (position) {
      marker.style.left = `${position.x * 100}%`;
      marker.style.top = `${position.y * 100}%`;
    }
  });
}

function fitMapToStage() {
  const stage = $("#mapStage");
  const content = $("#mapContent");
  if (!stage || !content) return;

  const stageWidth = stage.clientWidth;
  const contentWidth = content.offsetWidth;
  if (!stageWidth || !contentWidth) {
    renderMap();
    return;
  }

  const scale = Math.min(1, stageWidth / contentWidth);
  mapState.scale = scale;
  mapState.x = Math.max(0, (stageWidth - contentWidth * scale) / 2);
  mapState.y = 14;
  mapState.rotation = 0;
  renderMap();
}

function setMarkerFromStagePoint(clientX, clientY, markerName = mapState.markerMode) {
  const stage = $("#mapStage");
  const content = $("#mapContent");
  if (mapState.markersLocked) return;
  if (!stage || !content) return;

  const rect = stage.getBoundingClientRect();
  const x = (clientX - rect.left - mapState.x) / mapState.scale / content.offsetWidth;
  const y = (clientY - rect.top - mapState.y) / mapState.scale / content.offsetHeight;
  mapState.markers[markerName] = {
    x: Math.min(1, Math.max(0, x)),
    y: Math.min(1, Math.max(0, y))
  };
  saveMapMarkers();
  renderMap();
}

function zoomMapAt(clientX, clientY, nextScale) {
  const stage = $("#mapStage");
  if (!stage) return;

  const rect = stage.getBoundingClientRect();
  const pointX = clientX - rect.left;
  const pointY = clientY - rect.top;
  const oldScale = mapState.scale;
  const scale = Math.min(4, Math.max(0.25, nextScale));
  mapState.x = pointX - ((pointX - mapState.x) / oldScale) * scale;
  mapState.y = pointY - ((pointY - mapState.y) / oldScale) * scale;
  mapState.scale = scale;
  renderMap();
}

function pointerDistance(first, second) {
  return Math.hypot(first.clientX - second.clientX, first.clientY - second.clientY);
}

function pointerAngle(first, second) {
  return Math.atan2(second.clientY - first.clientY, second.clientX - first.clientX) * (180 / Math.PI);
}

function editRif(rifId) {
  const user = currentUser();
  const rif = user.rifs.find((item) => item.id === rifId);
  if (!rif) return;

  $("#rifId").value = rif.id;
  $("#rifMake").value = rif.make;
  $("#rifModel").value = rif.model;
  $("#rifType").value = rif.type;
  $("#rifSerial").value = rif.serial;
  $("#rifFps").value = rif.fps || "";
  $("#rifJoules").value = rif.joules || "";
  $("#rifBbWeight").value = rif.bbWeight || "";
  $("#rifZeroRange").value = rif.zeroRange || "";
  $("#rifZeroUnit").value = rif.zeroUnit || "metres";
  $("#rifPhoto").value = "";
  $("#rifMake").focus();
}

async function deleteRif(rifId) {
  const user = currentUser();
  if (apiOnline) {
    try {
      const result = await apiRequest("rifs/delete", { id: rifId });
      applyServerData(result);
      renderRifs(currentUser());
      return;
    } catch (error) {
      alert(error.message);
      return;
    }
  }

  user.rifs = user.rifs.filter((rif) => rif.id !== rifId);
  saveState();
  renderRifs(user);
}

function editWishlistRif(rifId) {
  const user = currentUser();
  const rif = (user.rifWishlist || []).find((item) => item.id === rifId);
  if (!rif) return;

  $("#wishlistId").value = rif.id;
  $("#wishlistMake").value = rif.make;
  $("#wishlistModel").value = rif.model;
  $("#wishlistType").value = rif.type;
  $("#wishlistSerial").value = rif.serial || "";
  $("#wishlistPhoto").value = "";
  $("#wishlistMake").focus();
}

async function deleteWishlistRif(rifId) {
  const user = currentUser();
  if (apiOnline) {
    try {
      const result = await apiRequest("wishlist/delete", { id: rifId });
      applyServerData(result);
      renderRifWishlist(currentUser());
      renderAdminWishlist();
      return;
    } catch (error) {
      alert(error.message);
      return;
    }
  }

  user.rifWishlist = (user.rifWishlist || []).filter((rif) => rif.id !== rifId);
  saveState();
  renderRifWishlist(user);
  renderAdminWishlist();
}

function renderAnnouncements() {
  const feed = $("#announcementFeed");
  if (!feed) return;

  const user = currentUser();
  const announcements = visibleAnnouncements().sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  if (!announcements.length) {
    feed.innerHTML = `<article class="announcement-card"><h2>No announcements yet</h2><p>The admin team can add updates from the backend.</p></article>`;
    return;
  }

  feed.innerHTML = announcements
    .map((announcement) => {
      const hasCheered = announcement.cheers.includes(user.id);
      return `
        <article class="announcement-card">
          ${announcement.image ? `<img src="${announcement.image}" alt="Announcement image" />` : ""}
          <div class="announcement-body">
            <p>${escapeHtml(announcement.text)}</p>
            <div class="announcement-actions">
              <button class="cheer-button ${hasCheered ? "has-cheered" : ""}" type="button" data-id="${announcement.id}" ${hasCheered ? "disabled" : ""} aria-label="Pew pew like">
                <img src="assets/pew-like.png" alt="" aria-hidden="true" />
                <span>${announcement.cheers.length}</span>
              </button>
            </div>
          </div>
        </article>
      `;
    })
    .join("");

  $$(".cheer-button").forEach((button) => {
    button.addEventListener("click", () => cheerAnnouncement(button.dataset.id));
  });
}

async function cheerAnnouncement(announcementId) {
  const user = currentUser();
  const announcement = state.announcements.find((item) => item.id === announcementId);
  if (!user || !announcement) return;
  if (announcement.cheers.includes(user.id)) return;

  const previousCheers = [...announcement.cheers];
  announcement.cheers.push(user.id);
  renderAnnouncements();
  renderAdminAnnouncements();
  const button = document.querySelector(`.cheer-button[data-id="${announcementId}"]`);
  button?.classList.add("is-firing");
  window.setTimeout(() => button?.classList.remove("is-firing"), 550);
  playPewPewSound();

  if (apiOnline) {
    try {
      const result = await apiRequest("announcements/cheer", { id: announcementId });
      applyServerData(result);
      renderAnnouncements();
      renderAdminAnnouncements();
      return;
    } catch (error) {
      announcement.cheers = previousCheers;
      renderAnnouncements();
      renderAdminAnnouncements();
      alert(error.message);
      return;
    }
  }

  saveState();
}

function playPewPewSound() {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return;

  const audioContext = new AudioContext();
  const now = audioContext.currentTime;
  const shots = [0, 0.13, 0.27];

  shots.forEach((offset, index) => {
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    const filter = audioContext.createBiquadFilter();
    const start = now + offset;

    oscillator.type = index === 1 ? "square" : "sawtooth";
    oscillator.frequency.setValueAtTime(index === 0 ? 1400 : index === 1 ? 980 : 1180, start);
    oscillator.frequency.exponentialRampToValueAtTime(index === 0 ? 120 : 150, start + 0.12);
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(index === 0 ? 1600 : 1200, start);
    filter.Q.setValueAtTime(10, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.32, start + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.14);
    oscillator.connect(filter).connect(gain).connect(audioContext.destination);
    oscillator.start(start);
    oscillator.stop(start + 0.15);
  });

  shots.forEach((offset) => {
    const noiseBuffer = audioContext.createBuffer(1, audioContext.sampleRate * 0.07, audioContext.sampleRate);
    const noise = noiseBuffer.getChannelData(0);
    for (let index = 0; index < noise.length; index += 1) {
      noise[index] = Math.random() * 2 - 1;
    }
    const noiseSource = audioContext.createBufferSource();
    const noiseGain = audioContext.createGain();
    noiseSource.buffer = noiseBuffer;
    noiseGain.gain.setValueAtTime(0.16, now + offset);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.07);
    noiseSource.connect(noiseGain).connect(audioContext.destination);
    noiseSource.start(now + offset);
    noiseSource.stop(now + offset + 0.07);
  });

  window.setTimeout(() => audioContext.close(), 900);
}

function renderEvents() {
  const startDate = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1);
  const endDate = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 0, 23, 59, 59);
  const futureEvents = expandedEvents(startDate, endDate);
  const eventHtml = futureEvents.length
    ? futureEvents
        .map(
          (event) => `
            <article class="event-card" id="event-${event.occurrenceId}">
              <h2>${escapeHtml(event.title)}</h2>
              <p><strong>${formatDate(event.occurrenceDate)}</strong></p>
              ${repeatLabel(event) ? `<p>${escapeHtml(repeatLabel(event))}</p>` : ""}
              <p>${escapeHtml(event.notes || "No extra notes.")}</p>
              <button class="small-button event-booking-link" type="button" data-booking-link>Book this event</button>
            </article>
          `
        )
        .join("")
    : `<article class="event-card"><h2>No events listed</h2><p>The admin team can add upcoming events for this month.</p></article>`;

  $("#eventList").innerHTML = eventHtml;
}

function renderCalendar() {
  renderMiniCalendar();
  renderEvents();
}

function renderMiniCalendar() {
  const grid = $("#calendarGrid");
  if (!grid) return;

  const year = calendarMonth.getFullYear();
  const month = calendarMonth.getMonth();
  const monthStart = new Date(year, month, 1);
  const monthEnd = new Date(year, month + 1, 0, 23, 59, 59);
  const monthEvents = expandedEvents(monthStart, monthEnd);
  const eventsByDay = monthEvents.reduce((days, event) => {
    const day = Number(event.occurrenceDate.slice(-2));
    days[day] ??= [];
    days[day].push(event);
    return days;
  }, {});
  const firstDay = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const mondayOffset = (firstDay.getDay() + 6) % 7;

  $("#calendarMonthLabel").textContent = new Intl.DateTimeFormat("en-GB", {
    month: "long",
    year: "numeric"
  }).format(calendarMonth);

  grid.innerHTML = "";

  for (let index = 0; index < mondayOffset; index += 1) {
    grid.insertAdjacentHTML("beforeend", `<div class="calendar-day empty"></div>`);
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const dayEvents = eventsByDay[day] || [];
    const eventTarget = dayEvents[0]?.occurrenceId || "";
    const eventDots = dayEvents.map(() => `<span></span>`).join("");
    grid.insertAdjacentHTML(
      "beforeend",
      `
        <button class="calendar-day ${dayEvents.length ? "has-event" : ""}" type="button" data-event-id="${eventTarget}" ${dayEvents.length ? "" : "disabled"}>
          <span class="day-number">${day}</span>
          <span class="event-dots">${eventDots}</span>
        </button>
      `
    );
  }

  $$(".calendar-day.has-event").forEach((button) => {
    button.addEventListener("click", () => {
      const target = document.getElementById(`event-${button.dataset.eventId}`);
      target?.scrollIntoView({ behavior: "smooth", block: "start" });
      target?.classList.add("is-highlighted");
      window.setTimeout(() => target?.classList.remove("is-highlighted"), 1300);
    });
  });
}

function renderAdmin(selectedUserId = $("#adminUserId").value || "") {
  const user = currentUser();
  if (!user || user.role !== "admin") return;

  $("#adminUsers").innerHTML = state.users
    .map(
      (player) => `
        <article class="user-row">
          <div>
            <h3>${escapeHtml(player.name)}</h3>
            <p>${escapeHtml(player.email)} | ${escapeHtml(player.role)} | ${player.approved ? "Approved" : "Pending approval"} | Player No: ${escapeHtml(player.playerNumber || "Not assigned")} | UKARA: ${escapeHtml(player.ukara || "Not set")} | Expires: ${formatDate(player.ukaraExpiry)}</p>
          </div>
          <div class="card-actions">
            <button class="small-button select-user" type="button" data-id="${player.id}">Edit</button>
            ${
              player.role === "player" && !player.approved
                ? `<button class="small-button approve-user" type="button" data-id="${player.id}">Approve</button>`
                : ""
            }
            ${
              player.id === user.id
                ? ""
                : `<button class="small-button danger delete-user" type="button" data-id="${player.id}">Delete</button>`
            }
          </div>
        </article>
      `
    )
    .join("");

  $$(".select-user").forEach((button) => {
    button.addEventListener("click", () => fillAdminUser(button.dataset.id));
  });
  $$(".delete-user").forEach((button) => {
    button.addEventListener("click", () => deleteUser(button.dataset.id));
  });
  $$(".approve-user").forEach((button) => {
    button.addEventListener("click", () => approveUser(button.dataset.id));
  });

  const selectedUser = state.users.find((item) => item.id === selectedUserId) || state.users[0];
  fillAdminUser(selectedUser.id);

  $("#adminEvents").innerHTML = state.events
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(
      (event) => `
        <article class="user-row">
          <div>
            <h3>${escapeHtml(event.title)}</h3>
            <p>${formatDate(event.date)} | ${escapeHtml(repeatLabel(event) || "Does not repeat")} | ${escapeHtml(event.notes || "No notes")}</p>
            <p>Booking: ${escapeHtml(BOOKING_URL)}</p>
          </div>
          <div class="card-actions">
            <button class="small-button edit-event" type="button" data-id="${event.id}">Edit</button>
            <button class="small-button danger delete-event" type="button" data-id="${event.id}">Delete</button>
          </div>
        </article>
      `
    )
    .join("");

  $$(".edit-event").forEach((button) => button.addEventListener("click", () => fillEvent(button.dataset.id)));
  $$(".delete-event").forEach((button) => button.addEventListener("click", () => deleteEvent(button.dataset.id)));
  renderAdminAnnouncements();
  renderAdminContactMessages();
  renderAdminWishlist();
}

function renderAdminWishlist() {
  const list = $("#adminWishlist");
  if (!list) return;

  const wishlistItems = state.users.flatMap((player) =>
    (player.rifWishlist || []).map((rif) => ({
      ...rif,
      playerName: player.name,
      playerEmail: player.email,
      playerNumber: player.playerNumber
    }))
  );

  if (!wishlistItems.length) {
    list.innerHTML = `<article class="user-row"><div><h3>No wishlist RIFs yet</h3><p>Player wishlist items will appear here.</p></div></article>`;
    return;
  }

  list.innerHTML = wishlistItems
    .sort((a, b) => `${a.make} ${a.model}`.localeCompare(`${b.make} ${b.model}`))
    .map(
      (rif) => `
        <article class="user-row wishlist-row">
          ${
            rif.photo
              ? `<img class="wishlist-admin-thumb" src="${rif.photo}" alt="${escapeHtml(rif.make)} ${escapeHtml(rif.model)}" />`
              : `<div class="wishlist-admin-thumb">RIF</div>`
          }
          <div>
            <h3>${escapeHtml(rif.make)} ${escapeHtml(rif.model)}</h3>
            <p>${escapeHtml(rif.type)} | Serial: ${escapeHtml(rif.serial || "Not set")}</p>
            <p>${escapeHtml(rif.playerName)} | ${escapeHtml(rif.playerNumber || "No player number")} | ${escapeHtml(rif.playerEmail)}</p>
          </div>
        </article>
      `
    )
    .join("");
}

function renderAdminAnnouncements() {
  const list = $("#adminAnnouncements");
  if (!list) return;

  if (!state.announcements.length) {
    list.innerHTML = `<article class="user-row"><div><h3>No announcements</h3><p>Add the first post using the form above.</p></div></article>`;
    return;
  }

  list.innerHTML = [...state.announcements]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map(
      (announcement) => `
        <article class="user-row">
          <div>
            <h3>${escapeHtml(announcement.text.slice(0, 58))}${announcement.text.length > 58 ? "..." : ""}</h3>
            <p>${announcement.cheers.length} likes | ${isAnnouncementLive(announcement) ? "Live" : `Scheduled for ${formatDateTime(announcement.scheduledAt)}`}</p>
          </div>
          <div class="card-actions">
            <button class="small-button edit-announcement" type="button" data-id="${announcement.id}">Edit</button>
            <button class="small-button danger delete-announcement" type="button" data-id="${announcement.id}">Delete</button>
          </div>
        </article>
      `
    )
    .join("");

  $$(".edit-announcement").forEach((button) =>
    button.addEventListener("click", () => fillAnnouncement(button.dataset.id))
  );
  $$(".delete-announcement").forEach((button) =>
    button.addEventListener("click", () => deleteAnnouncement(button.dataset.id))
  );
}

function fillAnnouncement(announcementId) {
  const announcement = state.announcements.find((item) => item.id === announcementId);
  if (!announcement) return;

  $("#announcementId").value = announcement.id;
  $("#announcementText").value = announcement.text;
  $("#announcementScheduledAt").value = toDateTimeLocalValue(announcement.scheduledAt);
  $("#announcementImage").value = "";
  $("#announcementText").focus();
}

async function deleteAnnouncement(announcementId) {
  if (apiOnline) {
    try {
      const result = await apiRequest("admin/announcements/delete", { id: announcementId });
      applyServerData(result);
      renderAnnouncements();
      renderAdminAnnouncements();
      return;
    } catch (error) {
      alert(error.message);
      return;
    }
  }

  state.announcements = state.announcements.filter((announcement) => announcement.id !== announcementId);
  saveState();
  renderAnnouncements();
  renderAdminAnnouncements();
}

function renderAdminContactMessages() {
  const list = $("#adminContactMessages");
  if (!list) return;

  const messages = [...(state.contactMessages || [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  if (!messages.length) {
    list.innerHTML = `<article class="user-row"><div><h3>No messages</h3><p>Contact form submissions will appear here.</p></div></article>`;
    return;
  }

  list.innerHTML = messages
    .map(
      (message) => `
        <article class="contact-message ${message.replied ? "is-replied" : ""}">
          <div>
            <h3>${escapeHtml(message.subject)}</h3>
            <p><strong>${escapeHtml(message.name)}</strong> | ${escapeHtml(message.email)}${message.phone ? ` | ${escapeHtml(message.phone)}` : ""}</p>
            <p>${escapeHtml(message.question)}</p>
            <p>${message.replied ? "Replied" : "Awaiting reply"}</p>
          </div>
          <div class="card-actions">
            <a class="small-button" href="mailto:${escapeHtml(message.email)}?subject=${encodeURIComponent(`Re: ${message.subject}`)}">Reply by email</a>
            ${
              message.replied
                ? ""
                : `<button class="small-button mark-contact-replied" type="button" data-id="${message.id}">Mark replied</button>`
            }
            <button class="small-button danger delete-contact-message" type="button" data-id="${message.id}">Delete</button>
          </div>
        </article>
      `
    )
    .join("");

  $$(".mark-contact-replied").forEach((button) =>
    button.addEventListener("click", () => markContactReplied(button.dataset.id))
  );
  $$(".delete-contact-message").forEach((button) =>
    button.addEventListener("click", () => deleteContactMessage(button.dataset.id))
  );
}

async function markContactReplied(messageId) {
  if (apiOnline) {
    try {
      const result = await apiRequest("admin/contact/mark-replied", { id: messageId });
      applyServerData(result);
      renderAdminContactMessages();
    } catch (error) {
      alert(error.message);
    }
    return;
  }

  const message = state.contactMessages.find((item) => item.id === messageId);
  if (message) message.replied = true;
  saveState();
  renderAdminContactMessages();
}

async function deleteContactMessage(messageId) {
  if (apiOnline) {
    try {
      const result = await apiRequest("admin/contact/delete", { id: messageId });
      applyServerData(result);
      renderAdminContactMessages();
    } catch (error) {
      alert(error.message);
    }
    return;
  }

  state.contactMessages = state.contactMessages.filter((message) => message.id !== messageId);
  saveState();
  renderAdminContactMessages();
}

function fillAdminUser(userId) {
  const user = state.users.find((item) => item.id === userId);
  if (!user) return;

  $("#adminUserId").value = user.id;
  $("#adminName").value = user.name || "";
  $("#adminPhone").value = user.phone || "";
  $("#adminEmail").value = user.email || "";
  $("#adminUkara").value = user.ukara || "";
  $("#adminUkaraExpiry").value = user.ukaraExpiry || "";
  $("#adminRole").value = user.role || "player";
}

async function deleteUser(userId) {
  const signedInUser = currentUser();
  const user = state.users.find((item) => item.id === userId);
  if (!user || user.id === signedInUser?.id) return;

  const shouldDelete = window.confirm(`Delete ${user.name}? This removes their player profile and RIF list from this app.`);
  if (!shouldDelete) return;

  if (apiOnline) {
    try {
      const result = await apiRequest("admin/users/delete", { id: userId });
      applyServerData(result);
      renderAdmin();
      return;
    } catch (error) {
      alert(error.message);
      return;
    }
  }

  state.users = state.users.filter((item) => item.id !== userId);

  if ($("#adminUserId").value === userId) {
    $("#adminUserId").value = "";
  }

  saveState();
  renderAdmin();
}

async function approveUser(userId) {
  if (apiOnline) {
    try {
      const result = await apiRequest("admin/users/approve", { id: userId });
      applyServerData(result);
      renderAdmin(userId);
      return;
    } catch (error) {
      alert(error.message);
      return;
    }
  }

  const user = state.users.find((item) => item.id === userId);
  if (!user) return;

  user.approved = true;
  saveState();
  renderAdmin(user.id);
}

function fillEvent(eventId) {
  const event = state.events.find((item) => item.id === eventId);
  if (!event) return;

  $("#eventId").value = event.id;
  $("#eventTitle").value = event.title;
  $("#eventDate").value = event.date;
  $("#eventRepeats").value = event.repeats || "none";
  $("#eventRepeatUntil").value = event.repeatUntil || "";
  $("#eventBookingUrl").value = BOOKING_URL;
  $("#eventNotes").value = event.notes || "";
  $("#eventTitle").focus();
}

async function deleteEvent(eventId) {
  if (apiOnline) {
    try {
      const result = await apiRequest("admin/events/delete", { id: eventId });
      applyServerData(result);
      renderEvents();
      renderMiniCalendar();
      renderAdmin();
      return;
    } catch (error) {
      alert(error.message);
      return;
    }
  }

  state.events = state.events.filter((event) => event.id !== eventId);
  saveState();
  renderEvents();
  renderAdmin();
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => {
    const map = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    };
    return map[character];
  });
}

$("#loginForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const email = $("#loginEmail").value.trim().toLowerCase();
  const password = $("#loginPassword").value;

  if (apiOnline) {
    try {
      const result = await apiRequest("auth/login", { email, password });
      applyServerData(result);
      $("#loginForm").reset();
      setView("profile");
      render();
    } catch (error) {
      alert(error.message);
    }
    return;
  }

  const user = state.users.find((item) => item.email.toLowerCase() === email && item.password === password);

  if (!user) {
    alert("Login details not recognised.");
    return;
  }

  if (user.role !== "admin" && !user.approved) {
    alert("Your account is waiting for admin approval.");
    return;
  }

  state.currentUserId = user.id;
  saveState();
  $("#loginForm").reset();
  setView("profile");
  render();
});

$("#showResetForm").addEventListener("click", () => {
  $("#resetPasswordForm").classList.remove("hidden");
  $("#resetEmail").focus();
});

$("#hideResetForm").addEventListener("click", () => {
  $("#resetPasswordForm").classList.add("hidden");
  $("#resetPasswordForm").reset();
});

$("#resetPasswordForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const email = $("#resetEmail").value.trim().toLowerCase();

  if (apiOnline) {
    try {
      const result = await apiRequest("auth/reset-password", {
        email,
        password: $("#resetPassword").value
      });
      $("#resetPasswordForm").reset();
      $("#resetPasswordForm").classList.add("hidden");
      alert(result.message || "Password updated. You can now log in.");
    } catch (error) {
      alert(error.message);
    }
    return;
  }

  const user = state.users.find((item) => item.email.toLowerCase() === email);

  if (!user) {
    alert("No account found for that email.");
    return;
  }

  user.password = $("#resetPassword").value;

  if (email === OWNER_ADMIN_EMAIL) {
    user.role = "admin";
    user.approved = true;
  }

  saveState();
  $("#resetPasswordForm").reset();
  $("#resetPasswordForm").classList.add("hidden");
  alert("Password updated. You can now log in.");
});

$("#registerForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const email = $("#registerEmail").value.trim().toLowerCase();

  if (apiOnline) {
    try {
      const result = await apiRequest("auth/register", {
        name: $("#registerName").value.trim(),
        email,
        password: $("#registerPassword").value
      });
      applyServerData(result);
      $("#registerForm").reset();
      alert(result.message || "Account created.");
    } catch (error) {
      alert(error.message);
    }
    return;
  }

  if (state.users.some((user) => user.email.toLowerCase() === email)) {
    alert("That email already has an account.");
    return;
  }

  const user = {
    id: makeId("user"),
    role: "player",
    approved: false,
    playerNumber: nextPlayerNumber(),
    password: $("#registerPassword").value,
    name: $("#registerName").value.trim(),
    phone: "",
    address: "",
    email,
    ukara: "",
    ukaraExpiry: "",
    photo: "",
    rifs: [],
    rifWishlist: []
  };

  state.users.push(user);
  saveState();
  $("#registerForm").reset();
  alert("Account created. An admin needs to approve it before you can log in.");
  render();
});

$("#profileForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const submitButton = event.submitter;
  submitButton.disabled = true;
  submitButton.textContent = "Saving...";
  const user = currentUser();
  const photo = await readImage($("#profilePhoto"), { maxSize: 720, quality: 0.72 });

  if (apiOnline) {
    try {
      const result = await apiRequest("profile/update", {
        name: $("#profileName").value.trim(),
        phone: $("#profilePhone").value.trim(),
        address: $("#profileAddress").value.trim(),
        email: $("#profileEmail").value.trim(),
        ukara: $("#profileUkara").value.trim(),
        ukaraExpiry: $("#profileUkaraExpiry").value,
        photo
      });
      applyServerData(result);
      $("#profilePhoto").value = "";
      render();
    } catch (error) {
      alert(error.message);
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = "Save ID";
    }
    return;
  }

  user.name = $("#profileName").value.trim();
  user.phone = $("#profilePhone").value.trim();
  user.address = $("#profileAddress").value.trim();
  user.email = $("#profileEmail").value.trim();
  user.ukara = $("#profileUkara").value.trim();
  user.ukaraExpiry = $("#profileUkaraExpiry").value;
  if (photo) user.photo = photo;

  saveState();
  $("#profilePhoto").value = "";
  render();
  submitButton.disabled = false;
  submitButton.textContent = "Save ID";
});

$("#rifForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const submitButton = event.submitter;
  submitButton.disabled = true;
  submitButton.textContent = "Saving...";
  const user = currentUser();
  const photo = await readImage($("#rifPhoto"), { maxSize: 900, quality: 0.7 });
  const rifId = $("#rifId").value;
  const existingRif = user.rifs.find((rif) => rif.id === rifId);
  const rifData = {
    id: rifId || makeId("rif"),
    make: $("#rifMake").value.trim(),
    model: $("#rifModel").value.trim(),
    type: $("#rifType").value,
    serial: $("#rifSerial").value.trim(),
    fps: $("#rifFps").value,
    joules: $("#rifJoules").value,
    bbWeight: $("#rifBbWeight").value,
    zeroRange: $("#rifZeroRange").value.trim(),
    zeroUnit: $("#rifZeroUnit").value,
    photo: photo || existingRif?.photo || ""
  };

  if (apiOnline) {
    try {
      const result = await apiRequest("rifs/save", rifData);
      applyServerData(result);
      $("#rifForm").reset();
      $("#rifId").value = "";
      renderRifs(currentUser());
    } catch (error) {
      alert(error.message);
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = "Save RIF";
    }
    return;
  }

  if (existingRif) {
    Object.assign(existingRif, rifData);
  } else {
    user.rifs.push(rifData);
  }

  saveState();
  $("#rifForm").reset();
  $("#rifId").value = "";
  renderRifs(user);
  submitButton.disabled = false;
  submitButton.textContent = "Save RIF";
});

$("#wishlistForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const submitButton = event.submitter;
  submitButton.disabled = true;
  submitButton.textContent = "Saving...";
  const user = currentUser();
  user.rifWishlist ??= [];
  const photo = await readImage($("#wishlistPhoto"), { maxSize: 900, quality: 0.7 });
  const wishlistId = $("#wishlistId").value;
  const existingRif = user.rifWishlist.find((rif) => rif.id === wishlistId);
  const rifData = {
    id: wishlistId || makeId("wishlist"),
    make: $("#wishlistMake").value.trim(),
    model: $("#wishlistModel").value.trim(),
    type: $("#wishlistType").value,
    serial: $("#wishlistSerial").value.trim(),
    photo: photo || existingRif?.photo || ""
  };

  if (apiOnline) {
    try {
      const result = await apiRequest("wishlist/save", rifData);
      applyServerData(result);
      $("#wishlistForm").reset();
      $("#wishlistId").value = "";
      renderRifWishlist(currentUser());
      renderAdminWishlist();
    } catch (error) {
      alert(error.message);
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = "Save wishlist RIF";
    }
    return;
  }

  if (existingRif) {
    Object.assign(existingRif, rifData);
  } else {
    user.rifWishlist.push(rifData);
  }

  saveState();
  $("#wishlistForm").reset();
  $("#wishlistId").value = "";
  renderRifWishlist(user);
  renderAdminWishlist();
  submitButton.disabled = false;
  submitButton.textContent = "Save wishlist RIF";
});

$("#contactForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const submitButton = event.submitter;
  submitButton.disabled = true;
  submitButton.textContent = "Submitting...";
  const messageData = {
    id: makeId("contact"),
    name: $("#contactName").value.trim(),
    subject: $("#contactSubject").value.trim(),
    phone: $("#contactPhone").value.trim(),
    email: $("#contactEmail").value.trim(),
    question: $("#contactQuestion").value.trim(),
    createdAt: new Date().toISOString(),
    replied: false
  };

  if (apiOnline) {
    try {
      const result = await apiRequest("contact/submit", messageData);
      applyServerData(result);
      $("#contactForm").reset();
      alert(result.message || "Question sent to the admin team.");
    } catch (error) {
      alert(error.message);
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = "Submit question";
    }
    return;
  }

  state.contactMessages.push(messageData);
  saveState();
  $("#contactForm").reset();
  alert("Question saved for the admin team.");
  submitButton.disabled = false;
  submitButton.textContent = "Submit question";
});

$("#adminUserForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const user = state.users.find((item) => item.id === $("#adminUserId").value);
  if (!user) return;

  const userData = {
    id: $("#adminUserId").value,
    name: $("#adminName").value.trim(),
    phone: $("#adminPhone").value.trim(),
    email: $("#adminEmail").value.trim(),
    ukara: $("#adminUkara").value.trim(),
    ukaraExpiry: $("#adminUkaraExpiry").value,
    role: $("#adminRole").value
  };

  if (apiOnline) {
    try {
      const result = await apiRequest("admin/users/update", userData);
      applyServerData(result);
      render();
    } catch (error) {
      alert(error.message);
    }
    return;
  }

  user.name = $("#adminName").value.trim();
  user.phone = $("#adminPhone").value.trim();
  user.email = $("#adminEmail").value.trim();
  user.ukara = $("#adminUkara").value.trim();
  user.ukaraExpiry = $("#adminUkaraExpiry").value;
  user.role = $("#adminRole").value;

  saveState();
  render();
});

$("#eventForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const eventId = $("#eventId").value;
  const existingEvent = state.events.find((item) => item.id === eventId);
  const eventData = {
    id: eventId || makeId("event"),
    title: $("#eventTitle").value.trim(),
    date: $("#eventDate").value,
    notes: $("#eventNotes").value.trim(),
    repeats: $("#eventRepeats").value,
    repeatUntil: $("#eventRepeatUntil").value,
    bookingUrl: BOOKING_URL
  };

  if (apiOnline) {
    try {
      const result = await apiRequest("admin/events/save", eventData);
      applyServerData(result);
      $("#eventForm").reset();
      $("#eventId").value = "";
      renderEvents();
      renderMiniCalendar();
      renderAdmin();
    } catch (error) {
      alert(error.message);
    }
    return;
  }

  if (existingEvent) {
    Object.assign(existingEvent, eventData);
  } else {
    state.events.push(eventData);
  }

  saveState();
  $("#eventForm").reset();
  $("#eventId").value = "";
  renderEvents();
  renderMiniCalendar();
  renderAdmin();
});

$("#announcementForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const announcementId = $("#announcementId").value;
  const existingAnnouncement = state.announcements.find((item) => item.id === announcementId);
  const image = await readImage($("#announcementImage"), { maxSize: 1100, quality: 0.72 });
  const announcementData = {
    id: announcementId || makeId("announcement"),
    text: $("#announcementText").value.trim(),
    image: image || existingAnnouncement?.image || "",
    createdAt: existingAnnouncement?.createdAt || new Date().toISOString(),
    scheduledAt: fromDateTimeLocalValue($("#announcementScheduledAt").value),
    cheers: existingAnnouncement?.cheers || []
  };

  if (apiOnline) {
    try {
      const result = await apiRequest("admin/announcements/save", announcementData);
      applyServerData(result);
      $("#announcementForm").reset();
      $("#announcementId").value = "";
      $("#announcementScheduledAt").value = "";
      renderAnnouncements();
      renderAdminAnnouncements();
    } catch (error) {
      alert(error.message);
    }
    return;
  }

  if (existingAnnouncement) {
    Object.assign(existingAnnouncement, announcementData);
  } else {
    state.announcements.push(announcementData);
  }

  saveState();
  $("#announcementForm").reset();
  $("#announcementId").value = "";
  $("#announcementScheduledAt").value = "";
  renderAnnouncements();
  renderAdminAnnouncements();
});

$("#refreshAdminData").addEventListener("click", async () => {
  const button = $("#refreshAdminData");
  button.disabled = true;
  button.textContent = "Refreshing...";
  await refreshSharedData();
  renderAdmin();
  button.disabled = false;
  button.textContent = "Refresh list";
});

$("#prevMonth").addEventListener("click", () => {
  calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1);
  renderCalendar();
});

$("#nextMonth").addEventListener("click", () => {
  calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1);
  renderCalendar();
});

$$(".marker-mode").forEach((button) => {
  button.addEventListener("click", () => {
    mapState.markerMode = button.dataset.markerMode;
    renderMap();
  });
});

$("#resetMapView").addEventListener("click", () => {
  fitMapToStage();
});

$("#lockMapMarkers").addEventListener("click", () => {
  mapState.markersLocked = !mapState.markersLocked;
  renderMap();
});

$("#clearMapMarkers").addEventListener("click", () => {
  mapState.markers = {};
  mapState.markersLocked = false;
  saveMapMarkers();
  renderMap();
});

$("#siteRulesJump").addEventListener("click", () => {
  setView("rules");
});

document.addEventListener("click", (event) => {
  const bookingLink = event.target.closest("[data-booking-link]");
  if (!bookingLink) return;
  event.preventDefault();
  openBookingSite();
});

function openBookingSite() {
  const openedWindow = window.open(BOOKING_URL, "_blank", "noopener,noreferrer");
  if (!openedWindow) {
    window.location.assign(BOOKING_URL);
  }
}

$("#mapStage").addEventListener("wheel", (event) => {
  event.preventDefault();
  const factor = event.deltaY > 0 ? 0.9 : 1.1;
  zoomMapAt(event.clientX, event.clientY, mapState.scale * factor);
});

$("#mapStage").addEventListener("pointerdown", (event) => {
  const marker = event.target.closest(".map-marker");
  if (marker && !mapState.markersLocked) {
    mapState.draggingMarker = marker.dataset.marker;
    marker.setPointerCapture(event.pointerId);
  }

  mapState.pointers.set(event.pointerId, event);

  if (mapState.pointers.size === 1 && !mapState.draggingMarker) {
    mapState.lastPan = {
      clientX: event.clientX,
      clientY: event.clientY
    };
  }

  if (mapState.pointers.size === 2) {
    const pointers = Array.from(mapState.pointers.values());
    mapState.lastPinch = {
      distance: pointerDistance(pointers[0], pointers[1]),
      angle: pointerAngle(pointers[0], pointers[1]),
      scale: mapState.scale,
      rotation: mapState.rotation
    };
  }
});

$("#mapStage").addEventListener("pointermove", (event) => {
  if (!mapState.pointers.has(event.pointerId)) return;
  mapState.pointers.set(event.pointerId, event);

  if (mapState.draggingMarker) {
    setMarkerFromStagePoint(event.clientX, event.clientY, mapState.draggingMarker);
    return;
  }

  if (mapState.pointers.size === 2 && mapState.lastPinch) {
    const pointers = Array.from(mapState.pointers.values());
    const distance = pointerDistance(pointers[0], pointers[1]);
    const angle = pointerAngle(pointers[0], pointers[1]);
    const midpoint = {
      x: (pointers[0].clientX + pointers[1].clientX) / 2,
      y: (pointers[0].clientY + pointers[1].clientY) / 2
    };
    zoomMapAt(midpoint.x, midpoint.y, mapState.lastPinch.scale * (distance / mapState.lastPinch.distance));
    mapState.rotation = mapState.lastPinch.rotation + angle - mapState.lastPinch.angle;
    renderMap();
    return;
  }

  if (mapState.lastPan) {
    mapState.x += event.clientX - mapState.lastPan.clientX;
    mapState.y += event.clientY - mapState.lastPan.clientY;
    mapState.lastPan = {
      clientX: event.clientX,
      clientY: event.clientY
    };
    renderMap();
  }
});

function endMapPointer(event) {
  const wasTap = mapState.pointers.size === 1 && mapState.lastPan
    ? Math.hypot(event.clientX - mapState.lastPan.clientX, event.clientY - mapState.lastPan.clientY) < 8
    : false;

  if (mapState.draggingMarker) {
    setMarkerFromStagePoint(event.clientX, event.clientY, mapState.draggingMarker);
  } else if (wasTap && event.target.closest("#mapContent")) {
    setMarkerFromStagePoint(event.clientX, event.clientY);
  }

  mapState.pointers.delete(event.pointerId);
  mapState.draggingMarker = null;
  mapState.lastPan = null;
  mapState.lastPinch = null;
}

$("#mapStage").addEventListener("pointerup", endMapPointer);
$("#mapStage").addEventListener("pointercancel", endMapPointer);

$$("[data-view]").forEach((button) => {
  button.addEventListener("click", () => {
    if (!currentUser() && button.dataset.view !== "profile") return;
    setView(button.dataset.view);
  });
});

bootstrap();
