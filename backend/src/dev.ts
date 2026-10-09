import { Router } from "express";
import { ApiError, type Actor, type Context } from "./api/common.js";

// Dev-only test console served at /dev (never mounted in production).
// The script is a separate route because helmet's CSP blocks inline scripts.

const presets = [
  ["Auth", "Guest", "POST", "/auth/guest", { displayName: "Guest" }],
  [
    "Auth",
    "Sign up",
    "POST",
    "/auth/signup",
    { email: "bob@example.test", username: "bob", password: "Password123!" },
  ],
  [
    "Auth",
    "Log in",
    "POST",
    "/auth/login",
    { username: "bob", password: "Password123!" },
  ],
  ["Auth", "Me", "GET", "/auth/me", null],
  ["Auth", "Log out", "POST", "/auth/logout", null],
  ["Email", "Resend verification", "POST", "/auth/verify-email/resend", null],
  ["Email", "Verify email", "POST", "/auth/verify-email", { code: "123456" }],
  [
    "Email",
    "Reset: request code",
    "POST",
    "/auth/password-reset/request",
    { email: "bob@example.test" },
  ],
  [
    "Email",
    "Reset: verify code",
    "POST",
    "/auth/password-reset/verify",
    { email: "bob@example.test", code: "123456" },
  ],
  [
    "Email",
    "Reset: set password",
    "POST",
    "/auth/password-reset/confirm",
    { resetToken: "{resetToken}", password: "NewPass123!" },
  ],
  ["Rooms", "List rooms", "GET", "/rooms", null],
  ["Rooms", "Create room", "POST", "/rooms", { name: "Study room" }],
  ["Rooms", "My invite code", "POST", "/rooms/{roomId}/invite-code", null],
  [
    "Rooms",
    "Rotate my invite code",
    "POST",
    "/rooms/{roomId}/invite-code",
    { rotate: true },
  ],
  [
    "Rooms",
    "Join by invite code",
    "POST",
    "/rooms/join",
    { inviteCode: "{inviteCode}" },
  ],
  ["Rooms", "Get room", "GET", "/rooms/{roomId}", null],
  ["Rooms", "Leave room", "POST", "/rooms/{roomId}/leave", null],
  ["Rooms", "Close room", "POST", "/rooms/{roomId}/close", null],
  ["Timers", "Start room timer", "POST", "/rooms/{roomId}/timers", null],
  [
    "Timers",
    "Start solo (5 min break)",
    "POST",
    "/timers",
    { phase: "SHORT_BREAK", plannedSeconds: 300 },
  ],
  ["Timers", "Start solo (focus)", "POST", "/timers", { phase: "FOCUS" }],
  ["Timers", "List timers", "GET", "/timers", null],
  ["Timers", "Get timer", "GET", "/timers/{timerId}", null],
  ["Timers", "Pause", "POST", "/timers/{timerId}/pause", null],
  ["Timers", "Resume", "POST", "/timers/{timerId}/resume", null],
  ["Timers", "Cancel", "POST", "/timers/{timerId}/cancel", null],
  ["Timers", "Join", "POST", "/timers/{timerId}/join", null],
  ["Timers", "Leave", "POST", "/timers/{timerId}/leave", null],
  ["Friends", "List friends", "GET", "/friends", null],
  ["Friends", "Send request", "POST", "/friends", { username: "bob" }],
  ["Friends", "Accept request", "POST", "/friends/{friendshipId}/accept", null],
  ["Friends", "Remove / decline", "DELETE", "/friends/{friendshipId}", null],
  [
    "Friends",
    "Heartbeat (in room)",
    "PUT",
    "/presence",
    { roomId: "{roomId}" },
  ],
  ["Friends", "Heartbeat (online only)", "PUT", "/presence", { roomId: null }],
  [
    "Friends",
    "Ask friend to join",
    "POST",
    "/join-requests",
    { friendId: 1, roomId: "{roomId}" },
  ],
  ["Friends", "Join requests", "GET", "/join-requests", null],
  [
    "Friends",
    "Accept join request",
    "POST",
    "/join-requests/{joinRequestId}/accept",
    null,
  ],
  [
    "Friends",
    "Decline / cancel join",
    "DELETE",
    "/join-requests/{joinRequestId}",
    null,
  ],
  ["Chat", "Read messages", "GET", "/rooms/{roomId}/messages", null],
  [
    "Chat",
    "Send message",
    "POST",
    "/rooms/{roomId}/messages",
    { content: "Hello!" },
  ],
  ["Stats", "My stats", "GET", "/users/me/stats", null],
  ["Stats", "Study sessions", "GET", "/users/me/study-sessions", null],
  ["Stats", "Game results", "GET", "/users/me/game-results", null],
  ["Games", "List games", "GET", "/games", null],
  ["Account", "Profile", "GET", "/users/me", null],
  [
    "Account",
    "Delete account",
    "DELETE",
    "/users/me",
    { password: "Password123!" },
  ],
  ["Server", "Health", "GET", "/health", null],
];

const page = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>WePomodoro Dev</title>
<style>
:root{--bg:#fafaf9;--card:#fff;--ink:#1c1917;--mute:#78716c;--line:#e7e5e4;--accent:#e5484d;--ok:#16a34a;--bad:#dc2626;--code:#f5f5f4}
@media(prefers-color-scheme:dark){:root{--bg:#171413;--card:#201c1b;--ink:#f5f5f4;--mute:#a8a29e;--line:#312c2a;--code:#2a2523}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.5 system-ui,sans-serif}
header{display:flex;align-items:center;gap:12px;padding:14px 20px;border-bottom:1px solid var(--line);background:var(--card)}
header h1{font-size:16px;margin:0}header span{color:var(--mute)}
.skip{margin-left:auto;display:flex;gap:6px;align-items:center;color:var(--mute)}.skip input{flex:none}#reload{background:var(--code);color:inherit;border:1px solid var(--line);border-radius:6px;padding:5px 9px;cursor:pointer}
#who{padding:2px 10px;border-radius:99px;background:var(--code);font-size:12px}
main{display:grid;grid-template-columns:260px 1fr;gap:16px;padding:16px 20px;max-width:1200px;margin:auto}
@media(max-width:800px){main{grid-template-columns:1fr}}
.card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:14px}
h2{font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--mute);margin:14px 0 6px}
h2:first-child{margin-top:0}
.presets button{display:flex;gap:8px;width:100%;text-align:left;padding:6px 8px;border:0;border-radius:6px;background:none;color:inherit;font:inherit;cursor:pointer}
.presets button:hover,.presets button.on{background:var(--code)}
.m{font:600 10px/20px ui-monospace,monospace;width:42px;flex:none;color:var(--mute)}
.GET .m{color:var(--ok)}.POST .m{color:#2563eb}.DELETE .m{color:var(--bad)}
.row{display:flex;gap:8px}
select,input,textarea{font:13px ui-monospace,monospace;background:var(--code);color:inherit;border:1px solid var(--line);border-radius:6px;padding:7px 9px}
input{flex:1;min-width:0}textarea{width:100%;min-height:110px;resize:vertical}
.send{background:var(--accent);color:#fff;border:0;border-radius:6px;padding:7px 18px;font-weight:600;cursor:pointer}
.vars{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;margin-top:8px}
.vars label{font-size:11px;color:var(--mute);display:grid;gap:2px}
.status{font:600 12px ui-monospace,monospace;margin:12px 0 4px}
pre{margin:0;padding:10px;background:var(--code);border-radius:6px;overflow:auto;max-height:340px;font:12px/1.5 ui-monospace,monospace;white-space:pre-wrap;word-break:break-word}
#log div{padding:3px 0;border-bottom:1px solid var(--line);font:12px ui-monospace,monospace;cursor:pointer}
.ok{color:var(--ok)}.bad{color:var(--bad)}
.col{display:grid;gap:16px;align-content:start}
</style></head><body>
<header><h1>WePomodoro Dev</h1><span>test console</span><label class="skip"><input type="checkbox" id="skip"> no token, act as</label>
<select id="actor" disabled></select><button id="reload" title="Reload users">&#8635;</button>
<span id="who">no token</span></header>
<main>
<div class="card presets" id="presets"></div>
<div class="col">
 <div class="card">
  <div class="row"><select id="method"><option>GET</option><option>POST</option><option>PUT</option><option>PATCH</option><option>DELETE</option></select>
  <input id="path" spellcheck="false"><button class="send" id="send">Send</button></div>
  <h2>Body (JSON)</h2><textarea id="body" spellcheck="false"></textarea>
  <h2>Variables (auto-filled from responses, editable)</h2><div class="vars" id="vars"></div>
 </div>
 <div class="card"><div class="status" id="status">No request yet</div><pre id="out"></pre></div>
 <div class="card"><h2>History</h2><div id="log"></div></div>
</div></main>
<script src="/dev/app.js"></script></body></html>`;

const script = `
const presets = ${JSON.stringify(presets)};
const names = ["token", "roomId", "timerId", "inviteCode", "resetToken", "friendshipId", "joinRequestId"];
const $ = (id) => document.getElementById(id);
const vars = {};
for (const n of names) {
  let saved = ""; try { saved = localStorage.getItem("dev." + n) ?? ""; } catch {}
  const label = document.createElement("label");
  label.textContent = n;
  const input = document.createElement("input");
  input.value = vars[n] = saved;
  input.oninput = () => set(n, input.value);
  label.append(input);
  $("vars").append(label);
  vars[n + "$"] = input;
}
function set(n, v) {
  vars[n] = v; vars[n + "$"].value = v;
  try { localStorage.setItem("dev." + n, v); } catch {}
  updateWho();
}
function updateWho() {
  $("who").textContent = $("skip").checked ? "as " + ($("actor").value || "nobody") : vars.token ? "token set" : "no token";
}
set("token", vars.token);
async function loadActors() {
  const res = await fetch("/dev/actors");
  if (!res.ok) { $("skip").disabled = true; $("skip").parentNode.title = "Start the API with DEV_AUTH=true"; return; }
  const list = await res.json();
  $("actor").replaceChildren(...list.map((a) => new Option(a.label, a.value)));
  try { $("actor").value = localStorage.getItem("dev.actor") ?? ""; } catch {}
  if (!$("actor").value && list[0]) $("actor").value = list[0].value;
  $("skip").checked = (() => { try { return localStorage.getItem("dev.skip") === "1"; } catch { return false; } })();
  $("actor").disabled = !$("skip").checked;
  updateWho();
}
$("skip").onchange = () => {
  $("actor").disabled = !$("skip").checked;
  try { localStorage.setItem("dev.skip", $("skip").checked ? "1" : "0"); } catch {}
  updateWho();
};
$("actor").onchange = () => { try { localStorage.setItem("dev.actor", $("actor").value); } catch {} updateWho(); };
$("reload").onclick = loadActors;
loadActors();
const fill = (s) => s.replace(/\\{(\\w+)\\}/g, (m, k) => vars[k] || m);

let group = "";
for (const p of presets) {
  const [g, name, method, path, body] = p;
  if (g !== group) { const h = document.createElement("h2"); h.textContent = group = g; $("presets").append(h); }
  const b = document.createElement("button");
  b.className = method;
  const m = document.createElement("span"); m.className = "m"; m.textContent = method;
  b.append(m, name);
  b.onclick = () => {
    for (const x of document.querySelectorAll(".presets .on")) x.classList.remove("on");
    b.classList.add("on");
    $("method").value = method; $("path").value = path;
    $("body").value = body ? JSON.stringify(body, null, 2) : "";
  };
  $("presets").append(b);
}

async function send() {
  const method = $("method").value;
  const headers = { "Content-Type": "application/json" };
  if ($("skip").checked && $("actor").value) headers["X-Dev-User"] = $("actor").value;
  else if (vars.token) headers.Authorization = "Bearer " + vars.token;
  const path = fill($("path").value);
  const raw = fill($("body").value).trim();
  const t0 = performance.now();
  let status = 0, data;
  try {
    const res = await fetch("/api" + path, { method, headers, body: raw && method !== "GET" ? raw : undefined });
    status = res.status;
    const text = await res.text();
    try { data = JSON.parse(text); } catch { data = text; }
  } catch (e) { data = String(e); }
  const ms = Math.round(performance.now() - t0);
  const good = status >= 200 && status < 300;
  $("status").className = "status " + (good ? "ok" : "bad");
  $("status").textContent = (status || "network error") + "  " + method + " " + path + "  " + ms + " ms";
  $("out").textContent = typeof data === "string" ? data : JSON.stringify(data, null, 2);
  const line = document.createElement("div");
  line.className = good ? "ok" : "bad";
  line.textContent = status + " " + method + " " + path;
  $("log").prepend(line);
  if (good && data && typeof data === "object") capture(path, data);
}
function capture(path, d) {
  if (typeof d.token === "string") set("token", d.token);
  if (typeof d.resetToken === "string") set("resetToken", d.resetToken);
  const o = d.room ?? d;
  if (/^\\/rooms/.test(path) && typeof o.id === "string") set("roomId", o.id);
  if (typeof o.inviteCode === "string") set("inviteCode", o.inviteCode);
  if (/^\\/(rooms\\/.*\\/)?timers/.test(path) && typeof d.id === "string") set("timerId", d.id);
  if (/^\\/friends/.test(path) && typeof d.id === "string") set("friendshipId", d.id);
  if (/^\\/join-requests/.test(path) && typeof d.id === "string") set("joinRequestId", d.id);
  if (path === "/auth/logout") set("token", "");
  if (/^\\/(auth\\/(signup|guest)|users)$/.test(path)) loadActors();
}
$("send").onclick = send;
`;

/** `X-Dev-User: <username>` or `guest:<id>`; only called when dev auth is on. */
export async function devActor(ctx: Context, who: string): Promise<Actor> {
  if (who.startsWith("guest:")) {
    const guest = await ctx.db.guestSession.findUnique({
      where: { id: who.slice(6) },
    });
    if (!guest) throw new ApiError(401, "Unknown dev guest");
    return { userId: null, guestSessionId: guest.id };
  }
  const user = await ctx.db.user.findUnique({ where: { username: who } });
  if (!user) throw new ApiError(401, "Unknown dev user");
  return { userId: user.id, guestSessionId: null };
}

export function devRouter(ctx: Context, devAuth: boolean) {
  const router = Router();
  router.get("/actors", async (req, res) => {
    if (!devAuth) {
      res.sendStatus(404);
      return;
    }
    const [users, guests] = await Promise.all([
      ctx.db.user.findMany({ orderBy: { id: "desc" }, take: 200 }),
      ctx.db.guestSession.findMany({
        where: { expiresAt: { gt: ctx.now() } },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
    ]);
    res.json([
      ...users.map((u) => ({
        value: u.username,
        label: `${u.username} (#${u.id})`,
      })),
      ...guests.map((g) => ({
        value: `guest:${g.id}`,
        label: `guest ${g.displayName} (${g.id.slice(0, 8)})`,
      })),
    ]);
  });
  router.get("/", (req, res) => {
    // helmet's default CSP already allows same-origin scripts and inline styles.
    res.type("html").send(page);
  });
  router.get("/app.js", (req, res) => {
    res.type("js").send(script);
  });
  return router;
}
