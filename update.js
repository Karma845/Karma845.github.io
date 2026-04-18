// update.js — AnimeStuff Update Panel logic

// ─── State ────────────────────────────────────────────────────
let novels = [];      // loaded from novels.json
let token  = "";      // GitHub PAT (from input)

// ─── DOM refs (resolved after DOMContentLoaded) ───────────────
let elToken, elRepo, elBranch, elNovelSelect, elVolume,
    elUpdateType, elCustomReason, elReasonPreview,
    elSubmitBtn, elTestBtn, elConnStatus,
    elToast, elToastMsg, elToastIcon,
    elLoadingOverlay, elLoadingMsg;

// ─── Init ─────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  elToken        = id("ghToken");
  elRepo         = id("ghRepo");
  elBranch       = id("ghBranch");
  elNovelSelect  = id("novelSelect");
  elVolume       = id("volumeNum");
  elUpdateType   = id("updateType");
  elCustomReason = id("customReason");
  elReasonPreview= id("reasonPreview");
  elSubmitBtn    = id("submitBtn");
  elTestBtn      = id("testBtn");
  elConnStatus   = id("connStatus");
  elToast        = id("toast");
  elToastMsg     = id("toastMsg");
  elToastIcon    = id("toastIcon");
  elLoadingOverlay = id("loadingOverlay");
  elLoadingMsg     = id("loadingMsg");

  // Pre-fill from config
  elRepo.value   = CONFIG.repo;
  elBranch.value = CONFIG.branch;

  // Restore saved token from sessionStorage (not localStorage — security)
  const saved = sessionStorage.getItem("as_token");
  if (saved) { elToken.value = saved; }

  // Wire up live reason preview
  elNovelSelect.addEventListener("change", updateReasonPreview);
  elVolume.addEventListener("input", updateReasonPreview);
  elUpdateType.addEventListener("change", () => {
    id("customReasonWrap").style.display =
      elUpdateType.value === "other" ? "block" : "none";
    updateReasonPreview();
  });
  elCustomReason.addEventListener("input", updateReasonPreview);

  // Token eye toggle
  id("pwEye").addEventListener("click", () => {
    elToken.type = elToken.type === "password" ? "text" : "password";
    id("pwEye").textContent = elToken.type === "password" ? "👁" : "🙈";
  });

  // Save token to session on input
  elToken.addEventListener("input", () => {
    sessionStorage.setItem("as_token", elToken.value.trim());
  });

  updateReasonPreview();
});

// ─── Helpers ──────────────────────────────────────────────────
function id(s) { return document.getElementById(s); }

function getToken()  { return elToken.value.trim(); }
function getRepo()   { return elRepo.value.trim();  }
function getBranch() { return elBranch.value.trim() || "main"; }

function setLoading(active, msg = "Working…") {
  elLoadingMsg.textContent = msg;
  elLoadingOverlay.style.display = active ? "flex" : "none";
}

function showToast(msg, type = "success") {
  // type: "success" | "error" | "info"
  const icons = { success: "✅", error: "❌", info: "ℹ️" };
  elToastIcon.textContent = icons[type] || "ℹ️";
  elToastMsg.textContent  = msg;
  elToast.className = "toast toast-" + type + " show";
  clearTimeout(elToast._tid);
  elToast._tid = setTimeout(() => elToast.classList.remove("show"), 4000);
}

function buildReason() {
  const type   = elUpdateType.value;
  const vol    = elVolume.value.trim();
  const custom = elCustomReason.value.trim();

  if (type === "volume")  return vol ? `Volume ${vol} added`   : "New volume added";
  if (type === "chapter") return vol ? `Chapter ${vol} added`  : "New chapter added";
  if (type === "fix")     return vol ? `Fix in Volume ${vol}`  : "Fixed";
  if (type === "other")   return custom || "Update";
  return "Update";
}

function updateReasonPreview() {
  elReasonPreview.textContent = buildReason();
}

// ─── Test Connection ──────────────────────────────────────────
async function testConnection() {
  const tok = getToken();
  if (!tok) { showToast("Enter your GitHub token first.", "error"); return; }

  elTestBtn.disabled = true;
  elConnStatus.textContent = "";
  elConnStatus.className   = "conn-status";
  setLoading(true, "Testing connection…");

  try {
    await GitHub.testConnection(tok, getRepo());
    elConnStatus.textContent = "✅ Connected!";
    elConnStatus.classList.add("ok");

    // Also load novels now
    setLoading(true, "Loading novels.json…");
    await loadNovels();
    showToast("Connected and novels loaded!", "success");
  } catch (e) {
    elConnStatus.textContent = "❌ " + e.message;
    elConnStatus.classList.add("err");
    showToast("Connection failed: " + e.message, "error");
  } finally {
    elTestBtn.disabled = false;
    setLoading(false);
  }
}

// ─── Load Novels ──────────────────────────────────────────────
async function loadNovels() {
  const tok = getToken();
  if (!tok) { showToast("Enter your GitHub token first.", "error"); return; }

  setLoading(true, "Fetching novels.json…");
  try {
    const { data } = await GitHub.getJSON(tok, getRepo(), CONFIG.novelsJsonPath, getBranch(), []);
    novels = data;
    populateDropdown(novels);
    showToast(`${novels.length} novels loaded.`, "info");
  } catch (e) {
    showToast("Failed to load novels: " + e.message, "error");
  } finally {
    setLoading(false);
  }
}

function populateDropdown(list) {
  elNovelSelect.innerHTML = `<option value="">— Select a novel —</option>`;
  list.forEach((n, i) => {
    const opt = document.createElement("option");
    opt.value = i;
    opt.textContent = n.title;
    elNovelSelect.appendChild(opt);
  });
  elSubmitBtn.disabled = list.length === 0;
}

// ─── Submit Update ────────────────────────────────────────────
async function submitUpdate() {
  const tok = getToken();
  if (!tok) { showToast("Enter your GitHub token first.", "error"); return; }

  const idx = elNovelSelect.value;
  if (idx === "") { showToast("Please select a novel.", "error"); return; }

  const novel  = novels[parseInt(idx, 10)];
  const reason = buildReason();

  const entry = {
    title:     novel.title,
    url:       novel.url,
    cover:     novel.cover || "",
    genres:    novel.genres || [],
    reason,
    timestamp: new Date().toISOString(),
  };

  elSubmitBtn.disabled = true;
  setLoading(true, "Reading updates.json…");

  try {
    // 1. Fetch current updates.json (create if missing)
    const { sha, data: updates } = await GitHub.getJSON(
      tok, getRepo(), CONFIG.updatesJsonPath, getBranch(), []
    );

    // 2. Prepend new entry, cap at maxUpdates
    const newUpdates = [entry, ...updates].slice(0, CONFIG.maxUpdates);

    // 3. Push back
    setLoading(true, "Pushing updates.json…");

    // Re-fetch SHA in case it changed between read and write
    let writeSHA = sha;
    try {
      const fresh = await GitHub.getJSON(tok, getRepo(), CONFIG.updatesJsonPath, getBranch(), []);
      writeSHA = fresh.sha;
    } catch (_) {}

    await GitHub.putJSON(
      tok, getRepo(),
      CONFIG.updatesJsonPath,
      newUpdates,
      `Update log: "${novel.title}" — ${reason}`,
      writeSHA,
      getBranch()
    );

    showToast(`✅ "${novel.title}" logged as "${reason}"`, "success");

    // Reset form fields (keep token + connection)
    elNovelSelect.value = "";
    elVolume.value      = "";
    elUpdateType.value  = "volume";
    elCustomReason.value = "";
    id("customReasonWrap").style.display = "none";
    updateReasonPreview();

    // Show recent entries
    renderRecentUpdates(newUpdates.slice(0, 5));

  } catch (e) {
    showToast("Failed: " + e.message, "error");
  } finally {
    elSubmitBtn.disabled = false;
    setLoading(false);
  }
}

// ─── Recent Updates Preview ───────────────────────────────────
function renderRecentUpdates(list) {
  const el = id("recentList");
  const wrap = id("recentWrap");
  if (!list || list.length === 0) { wrap.style.display = "none"; return; }

  wrap.style.display = "block";
  el.innerHTML = list.map(u => {
    const d  = new Date(u.timestamp);
    const ts = d.toLocaleDateString("en-US", { month: "short", day: "numeric" })
             + " · " + d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
    return `
      <div class="recent-item">
        <div class="recent-title">${esc(u.title)}</div>
        <div class="recent-meta">
          <span class="recent-reason">${esc(u.reason)}</span>
          <span class="recent-ts">${ts}</span>
        </div>
      </div>`;
  }).join("");
}

async function loadRecentUpdates() {
  const tok = getToken();
  if (!tok) { showToast("Enter your GitHub token first.", "error"); return; }
  setLoading(true, "Loading update log…");
  try {
    const { data } = await GitHub.getJSON(tok, getRepo(), CONFIG.updatesJsonPath, getBranch(), []);
    renderRecentUpdates(data.slice(0, 5));
    if (data.length === 0) showToast("No updates logged yet.", "info");
    else showToast(`Showing ${Math.min(5, data.length)} recent updates.`, "info");
  } catch (e) {
    showToast("Failed to load updates: " + e.message, "error");
  } finally {
    setLoading(false);
  }
}

function esc(s) {
  return String(s)
    .replace(/&/g,"&amp;").replace(/</g,"&lt;")
    .replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}
