import crypto from "node:crypto";
import { getStore } from "@netlify/blobs";

const STORE_NAME = "apocalypse-249-player-app";
const IMAGE_STORE_NAME = "apocalypse-249-player-images";
const STATE_KEY = "state";
const OWNER_ADMIN_EMAIL = "chrisyoungairsoft@gmail.com";
const PLAYER_PREFIX = "APOC-PLAYER";

const json = (statusCode, body) =>
  new Response(JSON.stringify(body), {
    status: statusCode,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store"
    }
  });

const defaultState = () => ({
  users: [],
  events: [
    {
      id: "event-1",
      title: "Open Skirmish Day",
      date: "2026-06-07",
      notes: "Standard walk-on day. Booking required.",
      repeats: "none",
      repeatUntil: "",
      bookingUrl: "https://apocalypse249.co.uk/v2/"
    },
    {
      id: "event-2",
      title: "MilSim Lite",
      date: "2026-06-21",
      notes: "Team objectives, medic rules and limited ammo.",
      repeats: "none",
      repeatUntil: "",
      bookingUrl: "https://apocalypse249.co.uk/v2/"
    }
  ],
  announcements: [
    {
      id: "announcement-1",
      text: "Welcome to the Apocalypse 249 player app. Keep an eye here for site updates, game day news and kit reminders.",
      image: "",
      createdAt: "2026-05-18T12:00:00.000Z",
      cheers: []
    }
  ],
  sessions: {},
  contactMessages: []
});

export default async (request) => {
  try {
    const url = new URL(request.url);
    const action = url.pathname.replace(/^\/(?:api|\.netlify\/functions\/api)\/?/, "").replace(/\/$/, "");
    const body = request.method === "GET" ? {} : await request.json().catch(() => ({}));

    if (request.method === "GET" && action === "health") {
      return json(200, { ok: true });
    }

    if (request.method === "GET" && action.startsWith("image/")) {
      return getImage(action.replace(/^image\//, ""));
    }

    const state = await loadState();

    if (action === "auth/register") return register(state, body);
    if (action === "auth/login") return login(state, body);
    if (action === "auth/reset-password") return resetPassword(state, body);

    const user = getSessionUser(state, request.headers.get("authorization") || "");
    if (!user) return json(401, { error: "Please log in again." });

    if (action === "auth/me") return json(200, { user: safeUser(user), data: publicData(state) });
    if (action === "auth/logout") return logout(state, request.headers.get("authorization") || "");
    if (action === "profile/update") return updateProfile(state, user, body);
    if (action === "rifs/save") return saveRif(state, user, body);
    if (action === "rifs/delete") return deleteRif(state, user, body);
    if (action === "announcements/cheer") return cheerAnnouncement(state, user, body);
    if (action === "contact/submit") return submitContactMessage(state, user, body);

    if (user.role !== "admin") return json(403, { error: "Admin access required." });

    if (action === "admin/users/update") return updateUser(state, body);
    if (action === "admin/users/approve") return approveUser(state, body);
    if (action === "admin/users/delete") return deleteUser(state, user, body);
    if (action === "admin/events/save") return saveEvent(state, body);
    if (action === "admin/events/delete") return deleteEvent(state, body);
    if (action === "admin/announcements/save") return saveAnnouncement(state, body);
    if (action === "admin/announcements/delete") return deleteAnnouncement(state, body);
    if (action === "admin/contact/mark-replied") return markContactReplied(state, body);
    if (action === "admin/contact/delete") return deleteContactMessage(state, body);

    return json(404, { error: "Not found." });
  } catch (error) {
    return json(500, { error: error.message || "Something went wrong." });
  }
};

async function loadState() {
  const store = getStore(STORE_NAME);
  const saved = await store.get(STATE_KEY, { type: "json" });
  const state = saved || defaultState();
  migrateState(state);
  const imageMigrationChangedState = await externalizeStateImages(state);
  if (imageMigrationChangedState) {
    await store.setJSON(STATE_KEY, state);
  }
  return state;
}

async function saveState(state) {
  const store = getStore(STORE_NAME);
  await store.setJSON(STATE_KEY, state);
}

async function saveImage(dataUrl, folder) {
  if (!isDataImage(dataUrl)) return dataUrl || "";

  const match = dataUrl.match(/^data:(image\/(?:jpeg|jpg|png|webp));base64,(.+)$/);
  if (!match) return "";

  const mimeType = match[1] === "image/jpg" ? "image/jpeg" : match[1];
  const extension = mimeType.split("/")[1].replace("jpeg", "jpg");
  const key = `${folder}-${crypto.randomUUID()}.${extension}`;
  const buffer = Buffer.from(match[2], "base64");
  const store = getStore(IMAGE_STORE_NAME);

  await store.set(key, buffer, {
    metadata: {
      contentType: mimeType
    }
  });

  return `/.netlify/functions/api/image/${key}`;
}

async function getImage(key) {
  if (!key || key.includes("..")) return new Response("Not found", { status: 404 });

  const store = getStore(IMAGE_STORE_NAME);
  const entry = await store.getWithMetadata(key, { type: "arrayBuffer" });
  if (!entry || !entry.data) return new Response("Not found", { status: 404 });

  return new Response(entry.data, {
    status: 200,
    headers: {
      "content-type": entry.metadata?.contentType || "image/jpeg",
      "cache-control": "public, max-age=31536000, immutable"
    }
  });
}

function isDataImage(value) {
  return typeof value === "string" && value.startsWith("data:image/");
}

async function externalizeStateImages(state) {
  let changed = false;

  for (const user of state.users) {
    if (isDataImage(user.photo)) {
      user.photo = await saveImage(user.photo, "profile");
      changed = true;
    }

    for (const rif of user.rifs || []) {
      if (isDataImage(rif.photo)) {
        rif.photo = await saveImage(rif.photo, "rif");
        changed = true;
      }
    }
  }

  for (const announcement of state.announcements) {
    if (isDataImage(announcement.image)) {
      announcement.image = await saveImage(announcement.image, "announcement");
      changed = true;
    }
  }

  return changed;
}

function migrateState(state) {
  state.users ??= [];
  state.events ??= [];
  state.announcements ??= [];
  state.sessions ??= {};
  state.contactMessages ??= [];

  state.users.forEach((user) => {
    user.rifs ??= [];
    user.playerNumber ??= "";
    user.approved ??= true;
    user.ukaraExpiry ??= "";
    if (user.email?.toLowerCase() === OWNER_ADMIN_EMAIL) {
      user.role = "admin";
      user.approved = true;
    }
  });

  state.announcements.forEach((announcement) => {
    announcement.cheers ??= [];
    announcement.createdAt ??= new Date().toISOString();
  });

  assignMissingPlayerNumbers(state);
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, storedHash) {
  if (!storedHash) return false;
  const [salt, originalHash] = storedHash.split(":");
  const candidate = crypto.scryptSync(password, salt, 64);
  const original = Buffer.from(originalHash, "hex");
  return original.length === candidate.length && crypto.timingSafeEqual(original, candidate);
}

function makeId(prefix) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function nextPlayerNumber(state) {
  const highestNumber = state.users.reduce((highest, user) => {
    const match = user.playerNumber?.match(/^APOC-PLAYER(\d+)$/);
    return match ? Math.max(highest, Number(match[1])) : highest;
  }, 0);

  return `${PLAYER_PREFIX}${String(highestNumber + 1).padStart(4, "0")}`;
}

function assignMissingPlayerNumbers(state) {
  state.users
    .filter((user) => user.role === "player" && !user.playerNumber)
    .forEach((user) => {
      user.playerNumber = nextPlayerNumber(state);
    });
}

function safeUser(user) {
  const { passwordHash, ...safe } = user;
  return safe;
}

function publicData(state) {
  return {
    users: state.users.map(safeUser),
    events: state.events,
    announcements: state.announcements,
    contactMessages: state.contactMessages || []
  };
}

function getSessionUser(state, authorization = "") {
  const token = authorization.replace(/^Bearer\s+/i, "");
  const userId = state.sessions[token];
  return state.users.find((user) => user.id === userId) || null;
}

async function register(state, body) {
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");
  const name = String(body.name || "").trim();

  if (!email || !password || !name) return json(400, { error: "Name, email and password are required." });
  if (state.users.some((user) => user.email.toLowerCase() === email)) {
    return json(400, { error: "That email already has an account." });
  }

  const isOwner = email === OWNER_ADMIN_EMAIL;
  const user = {
    id: makeId("user"),
    role: isOwner ? "admin" : "player",
    approved: isOwner ? true : false,
    playerNumber: isOwner ? "" : nextPlayerNumber(state),
    passwordHash: hashPassword(password),
    name,
    phone: "",
    address: "",
    email,
    ukara: "",
    ukaraExpiry: "",
    photo: "",
    rifs: []
  };

  state.users.push(user);
  await saveState(state);
  return json(200, {
    message: isOwner
      ? "Owner admin account created. You can now log in."
      : "Account created. An admin needs to approve it before you can log in.",
    data: publicData(state)
  });
}

async function login(state, body) {
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");
  const user = state.users.find((item) => item.email.toLowerCase() === email);

  if (!user || !verifyPassword(password, user.passwordHash)) {
    return json(401, { error: "Login details not recognised." });
  }

  if (user.role !== "admin" && !user.approved) {
    return json(403, { error: "Your account is waiting for admin approval." });
  }

  const token = crypto.randomBytes(32).toString("hex");
  state.sessions[token] = user.id;
  await saveState(state);
  return json(200, { token, user: safeUser(user), data: publicData(state) });
}

async function logout(state, authorization = "") {
  const token = authorization.replace(/^Bearer\s+/i, "");
  delete state.sessions[token];
  await saveState(state);
  return json(200, { ok: true });
}

async function resetPassword(state, body) {
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");
  const user = state.users.find((item) => item.email.toLowerCase() === email);
  if (!user) return json(404, { error: "No account found for that email." });
  if (!password) return json(400, { error: "New password is required." });

  user.passwordHash = hashPassword(password);
  if (email === OWNER_ADMIN_EMAIL) {
    user.role = "admin";
    user.approved = true;
  }

  await saveState(state);
  return json(200, { message: "Password updated. You can now log in." });
}

async function updateProfile(state, sessionUser, body) {
  const user = state.users.find((item) => item.id === sessionUser.id);
  const photo = await saveImage(body.photo, "profile");

  Object.assign(user, {
    name: String(body.name || "").trim(),
    phone: String(body.phone || "").trim(),
    address: String(body.address || "").trim(),
    email: String(body.email || "").trim().toLowerCase(),
    ukara: String(body.ukara || "").trim(),
    ukaraExpiry: body.ukaraExpiry || ""
  });
  if (photo) user.photo = photo;

  await saveState(state);
  return json(200, { user: safeUser(user), data: publicData(state) });
}

async function saveRif(state, sessionUser, body) {
  const user = state.users.find((item) => item.id === sessionUser.id);
  const existing = user.rifs.find((rif) => rif.id === body.id);
  const photo = await saveImage(body.photo, "rif");
  const rif = {
    id: body.id || makeId("rif"),
    make: String(body.make || "").trim(),
    model: String(body.model || "").trim(),
    type: String(body.type || "").trim(),
    serial: String(body.serial || "").trim(),
    photo: photo || existing?.photo || ""
  };

  if (existing) Object.assign(existing, rif);
  else user.rifs.push(rif);

  await saveState(state);
  return json(200, { user: safeUser(user), data: publicData(state) });
}

async function deleteRif(state, sessionUser, body) {
  const user = state.users.find((item) => item.id === sessionUser.id);
  user.rifs = user.rifs.filter((rif) => rif.id !== body.id);
  await saveState(state);
  return json(200, { user: safeUser(user), data: publicData(state) });
}

async function cheerAnnouncement(state, user, body) {
  const announcement = state.announcements.find((item) => item.id === body.id);
  if (!announcement) return json(404, { error: "Announcement not found." });

  if (announcement.cheers.includes(user.id)) {
    announcement.cheers = announcement.cheers.filter((userId) => userId !== user.id);
  } else {
    announcement.cheers.push(user.id);
  }

  await saveState(state);
  return json(200, { data: publicData(state) });
}

async function submitContactMessage(state, user, body) {
  const message = {
    id: makeId("contact"),
    playerId: user.id,
    playerName: user.name,
    name: String(body.name || "").trim(),
    subject: String(body.subject || "").trim(),
    phone: String(body.phone || "").trim(),
    email: String(body.email || "").trim().toLowerCase(),
    question: String(body.question || "").trim(),
    createdAt: new Date().toISOString(),
    replied: false
  };

  if (!message.name || !message.subject || !message.email || !message.question) {
    return json(400, { error: "Name, subject, email and question are required." });
  }

  state.contactMessages ??= [];
  state.contactMessages.push(message);
  await saveState(state);
  return json(200, { message: "Question sent to the admin team.", data: publicData(state) });
}

async function updateUser(state, body) {
  const user = state.users.find((item) => item.id === body.id);
  if (!user) return json(404, { error: "User not found." });

  Object.assign(user, {
    name: String(body.name || "").trim(),
    phone: String(body.phone || "").trim(),
    email: String(body.email || "").trim().toLowerCase(),
    ukara: String(body.ukara || "").trim(),
    ukaraExpiry: body.ukaraExpiry || "",
    role: body.role || "player"
  });

  if (user.role === "admin") user.approved = true;
  await saveState(state);
  return json(200, { data: publicData(state) });
}

async function approveUser(state, body) {
  const user = state.users.find((item) => item.id === body.id);
  if (!user) return json(404, { error: "User not found." });
  user.approved = true;
  await saveState(state);
  return json(200, { data: publicData(state) });
}

async function deleteUser(state, sessionUser, body) {
  if (body.id === sessionUser.id) return json(400, { error: "You cannot delete your own admin account." });
  state.users = state.users.filter((user) => user.id !== body.id);
  Object.entries(state.sessions).forEach(([token, userId]) => {
    if (userId === body.id) delete state.sessions[token];
  });
  await saveState(state);
  return json(200, { data: publicData(state) });
}

async function saveEvent(state, body) {
  const existing = state.events.find((event) => event.id === body.id);
  const event = {
    id: body.id || makeId("event"),
    title: String(body.title || "").trim(),
    date: body.date || "",
    notes: String(body.notes || "").trim(),
    repeats: body.repeats || "none",
    repeatUntil: body.repeatUntil || "",
    bookingUrl: body.bookingUrl || "https://apocalypse249.co.uk/v2/"
  };
  if (existing) Object.assign(existing, event);
  else state.events.push(event);
  await saveState(state);
  return json(200, { data: publicData(state) });
}

async function deleteEvent(state, body) {
  state.events = state.events.filter((event) => event.id !== body.id);
  await saveState(state);
  return json(200, { data: publicData(state) });
}

async function saveAnnouncement(state, body) {
  const existing = state.announcements.find((announcement) => announcement.id === body.id);
  const image = await saveImage(body.image, "announcement");
  const announcement = {
    id: body.id || makeId("announcement"),
    text: String(body.text || "").trim(),
    image: image || existing?.image || "",
    createdAt: existing?.createdAt || new Date().toISOString(),
    cheers: existing?.cheers || []
  };
  if (existing) Object.assign(existing, announcement);
  else state.announcements.push(announcement);
  await saveState(state);
  return json(200, { data: publicData(state) });
}

async function deleteAnnouncement(state, body) {
  state.announcements = state.announcements.filter((announcement) => announcement.id !== body.id);
  await saveState(state);
  return json(200, { data: publicData(state) });
}

async function markContactReplied(state, body) {
  const message = state.contactMessages.find((item) => item.id === body.id);
  if (!message) return json(404, { error: "Message not found." });
  message.replied = true;
  await saveState(state);
  return json(200, { data: publicData(state) });
}

async function deleteContactMessage(state, body) {
  state.contactMessages = state.contactMessages.filter((message) => message.id !== body.id);
  await saveState(state);
  return json(200, { data: publicData(state) });
}
