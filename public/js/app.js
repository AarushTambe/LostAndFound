
const API = "/api";
const $ = (selector) => document.querySelector(selector);

let token = sessionStorage.getItem("campus_token") || "";
let currentUser = null;
let authMode = "login";
let activeClaimItem = null;
let allItems = [];
let toastTimer;

const icons = {
  electronics: "▣",
  accessories: "◇",
  documents: "▤",
  bags: "▱",
  clothing: "♧",
  keys: "⚿",
  other: "◈"
};

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

function safeImageURL(value) {
  if (!value) return "";
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}

function normalizeList(data, key) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.[key])) return data[key];
  if (Array.isArray(data?.data)) return data.data;
  return [];
}

async function api(path, options = {}) {
  const headers = { ...(options.headers || {}) };

  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(`${API}${path}`, {
    ...options,
    headers
  });

  const text = await response.text();
  let data = {};
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { message: text };
    }
  }

  if (!response.ok) {
    if (response.status === 401 && token) {
      token = "";
      currentUser = null;
      sessionStorage.removeItem("campus_token");
      updateAuthUI();
    }
    throw new Error(data.message || data.error || `Request failed (${response.status})`);
  }

  return data;
}

function notify(message, isError = false) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.toggle("error", isError);
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 3500);
}

function setError(selector, message = "") {
  const element = $(selector);
  element.textContent = message;
  element.classList.toggle("hidden", !message);
}

function setBusy(button, busy, label) {
  if (!button.dataset.originalText) {
    button.dataset.originalText = button.textContent;
  }
  button.disabled = busy;
  button.textContent = busy ? label : button.dataset.originalText;
}

function formatDate(value) {
  if (!value) return "Date not provided";
  const raw = String(value).slice(0, 10);
  const date = new Date(`${raw}T12:00:00`);
  return Number.isNaN(date.getTime())
    ? raw
    : date.toLocaleDateString(undefined, {
        day: "numeric",
        month: "short",
        year: "numeric"
      });
}

function statusLabel(status) {
  const labels = {
    open: "Open",
    claimed: "Claim in progress",
    resolved: "Resolved",
    pending_handover: "Awaiting desk receipt",
    in_custody: "At lost & found desk",
    released: "Returned",
    not_applicable: ""
  };
  return labels[status] || status || "Unknown";
}

function updateAuthUI() {
  const loggedIn = Boolean(currentUser);
  $("#loginBtn").classList.toggle("hidden", loggedIn);
  $("#registerBtn").classList.toggle("hidden", loggedIn);
  $("#logoutBtn").classList.toggle("hidden", !loggedIn);
  $("#userBadge").classList.toggle("hidden", !loggedIn);
  $("#userBadge").textContent = loggedIn
    ? `${currentUser.name || "Student"}${currentUser.role === "admin" ? " · Staff" : ""}`
    : "";
  $("#staffSection").classList.toggle(
    "hidden",
    !loggedIn || currentUser.role !== "admin"
  );
}

function showDialog(id) {
  const dialog = document.getElementById(id);
  if (dialog && !dialog.open) dialog.showModal();
}

function closeDialog(id) {
  const dialog = document.getElementById(id);
  if (dialog?.open) dialog.close();
}

function openAuth(mode = "login") {
  authMode = mode;
  const registering = mode === "register";

  $("#authEyebrow").textContent = registering ? "JOIN THE COMMUNITY" : "WELCOME BACK";
  $("#authTitle").innerHTML = registering
    ? "Create account<span class='heading-period'>.</span>"
    : "Log in<span class='heading-period'>.</span>";
  $("#authDescription").textContent = registering
    ? "Create a student account to report items and submit claims."
    : "Sign in to report items and manage your claims.";
  $("#registerNameGroup").classList.toggle("hidden", !registering);
  $("#authName").required = registering;
  $("#authPassword").autocomplete = registering ? "new-password" : "current-password";
  $("#authSubmit").textContent = registering ? "Create account" : "Log in";
  $("#authSwitchText").innerHTML = registering
    ? 'Already registered? <button type="button" id="switchAuth" class="text-button">Log in</button>'
    : 'New here? <button type="button" id="switchAuth" class="text-button">Create an account</button>';
  setError("#authError");
  showDialog("authDialog");
  $("#switchAuth").addEventListener("click", () => {
  openAuth(authMode === "login" ? "register" : "login");
});
}

function openReport(type = "lost") {
  if (!currentUser) {
    openAuth("login");
    notify("Log in first, then open the report form.");
    return;
  }

  $("#reportForm").reset();
  $("#reportType").value = type;
  $("#itemDate").value = new Date().toLocaleDateString("en-CA");
  $("#reportTitle").innerHTML = type === "lost"
    ? "Report a lost item<span class='heading-period'>.</span>"
    : "Report a found item<span class='heading-period'>.</span>";
  setError("#reportError");
  showDialog("reportDialog");
}

function categoryIcon(category) {
  return icons[String(category || "other").toLowerCase()] || icons.other;
}

function renderItem(item) {
  const id = escapeHTML(item.id);
  const type = item.type === "found" ? "found" : "lost";
  const title = escapeHTML(item.title || "Untitled item");
  const description = escapeHTML(item.description || "No description provided.");
  const category = escapeHTML(item.category || "Other");
  const location = escapeHTML(item.location || "Location not specified");
  const reporter = escapeHTML(item.reporter_name || item.name || "Campus member");
  const status = item.status || "open";
  const custody = item.custody_status || "";
  const imageURL = safeImageURL(item.image_url);
  const isOwner = currentUser && String(item.user_id) === String(currentUser.id);
  const isStaff = currentUser?.role === "admin";
  const canClaim = type === "found" &&
    status === "open" &&
    custody === "in_custody" &&
    currentUser &&
    !isOwner &&
    !isStaff;

  let image;
  if (imageURL) {
    image = `<img class="item-image" src="${escapeHTML(imageURL)}" alt="${title}" loading="lazy" referrerpolicy="no-referrer">`;
  } else {
    image = `<div class="item-placeholder" aria-label="No image available">${categoryIcon(item.category)}</div>`;
  }

  let custodyLine = "";
  if (type === "found" && custody && custody !== "not_applicable") {
    custodyLine = `<div class="item-detail"><span>●</span><span>${escapeHTML(statusLabel(custody))}</span></div>`;
  }

  let action = "";
  if (canClaim) {
    action = `<button class="btn btn-primary" data-action="claim" data-id="${id}" data-title="${escapeHTML(item.title || "Item")}">Submit claim</button>`;
  } else if (type === "found" && status === "open" && custody === "pending_handover") {
    action = `<button class="btn btn-secondary" disabled title="Staff must confirm physical receipt first">Awaiting desk receipt</button>`;
  } else if (type === "found" && status === "claimed") {
    action = `<button class="btn btn-secondary" disabled>Claim under review</button>`;
  } else if (status === "resolved") {
    action = `<button class="btn btn-secondary" disabled>Resolved</button>`;
  } else if (!currentUser && type === "found" && custody === "in_custody" && status === "open") {
    action = `<button class="btn btn-primary" data-action="login-claim">Log in to claim</button>`;
  }

  return `
    <article class="item-card">
      <div style="position:relative">
        ${image}
        <span class="item-type type-${type}">${type} item</span>
      </div>
      <div class="item-card-body">
        <div class="item-meta">
          <span class="category-tag">${category}</span>
          <span class="status-tag status-${escapeHTML(status)}">${escapeHTML(statusLabel(status))}</span>
        </div>
        <h3>${title}</h3>
        <p class="item-description">${description}</p>
        <div class="item-details">
          <div class="item-detail"><span>⌖</span><span>${location}</span></div>
          <div class="item-detail"><span>◷</span><span>${escapeHTML(formatDate(item.item_date))}</span></div>
          ${custodyLine}
        </div>
        <div class="item-owner">Reported by ${reporter}</div>
        ${action ? `<div class="item-footer">${action}</div>` : ""}
      </div>
    </article>`;
}

function getFilters() {
  return {
    q: $("#searchInput").value.trim().toLowerCase(),
    type: $("#typeFilter").value,
    category: $("#categoryFilter").value,
    status: $("#statusFilter").value
  };
}

function renderItems() {
  const filters = getFilters();
  const filtered = allItems.filter((item) => {
    const haystack = [
      item.title, item.description, item.location, item.category,
      item.reporter_name, item.name
    ].join(" ").toLowerCase();

    return (!filters.q || haystack.includes(filters.q)) &&
      (!filters.type || item.type === filters.type) &&
      (!filters.category || String(item.category || "").toLowerCase() === filters.category.toLowerCase()) &&
      (!filters.status || item.status === filters.status);
  });

  $("#itemsGrid").innerHTML = filtered.map(renderItem).join("");
  $("#resultsCount").textContent = `${filtered.length} report${filtered.length === 1 ? "" : "s"} shown`;
  $("#emptyState").classList.toggle("hidden", filtered.length > 0);
  $("#itemsGrid").classList.toggle("hidden", filtered.length === 0);

  // These totals describe the currently loaded set, not necessarily all historical reports.
  $("#totalCount").textContent = allItems.length;
  $("#lostCount").textContent = allItems.filter((item) => item.type === "lost").length;
  $("#foundCount").textContent = allItems.filter((item) => item.type === "found").length;
}

async function loadItems() {
  $("#itemsGrid").classList.remove("hidden");
  $("#emptyState").classList.add("hidden");
  $("#itemsGrid").innerHTML = '<div class="loading-card">Loading campus reports…</div>';

  try {
    const data = await api("/items");
    allItems = normalizeList(data, "items");
    renderItems();

    if (currentUser?.role === "admin") {
      await loadStaffDashboard();
    }
  } catch (error) {
    $("#itemsGrid").innerHTML = `
      <div class="loading-card">
        Couldn't load reports. ${escapeHTML(error.message)}
        <br><br><button class="btn btn-secondary" data-action="refresh">Try again</button>
      </div>`;
    $("#resultsCount").textContent = "Unable to load reports";
    $("#totalCount").textContent = "—";
    $("#lostCount").textContent = "—";
    $("#foundCount").textContent = "—";
  }
}

async function loadStaffDashboard() {
  if (currentUser?.role !== "admin") return;

  const foundItems = allItems.filter((item) => item.type === "found" && item.status !== "resolved");
  const pendingReceipt = foundItems.filter((item) => item.custody_status === "pending_handover");

  $("#pendingItems").innerHTML = pendingReceipt.length
    ? pendingReceipt.map((item) => `
      <article class="staff-card">
        <div class="staff-card-main">
          <h4>${escapeHTML(item.title)} <span class="status-tag status-open">Awaiting receipt</span></h4>
          <p>${escapeHTML(item.location || "Location not specified")} · Reported ${escapeHTML(formatDate(item.item_date))}</p>
          <p>Only confirm receipt after the item has physically reached the desk.</p>
        </div>
        <div class="staff-card-actions">
          <button class="btn btn-primary" data-action="receive" data-id="${escapeHTML(item.id)}">Confirm receipt</button>
        </div>
      </article>`).join("")
    : '<div class="staff-empty">No found items are awaiting desk receipt.</div>';

  $("#claimsList").innerHTML = '<div class="staff-empty">Loading claims…</div>';

  const results = await Promise.allSettled(
    foundItems.map(async (item) => {
      const data = await api(`/items/${encodeURIComponent(item.id)}/claims`);
      return normalizeList(data, "claims").map((claim) => ({ ...claim, item_title: item.title }));
    })
  );

  const claims = results
    .filter((result) => result.status === "fulfilled")
    .flatMap((result) => result.value);

  const actionable = claims.filter((claim) =>
    claim.status === "pending" || claim.status === "approved"
  );

  if (!actionable.length) {
    $("#claimsList").innerHTML = '<div class="staff-empty">No pending claims or approved returns to complete.</div>';
    return;
  }

  $("#claimsList").innerHTML = actionable.map((claim) => {
    const isPending = claim.status === "pending";
    const claimId = escapeHTML(claim.id);
    const itemId = escapeHTML(claim.item_id);
    const name = escapeHTML(claim.claimant_name || claim.name || "Student");
    const email = escapeHTML(claim.claimant_email || claim.email || "");
    const message = escapeHTML(claim.message || "No claim message provided.");
    const title = escapeHTML(claim.item_title || `Item #${itemId}`);

    return `
      <article class="staff-card">
        <div class="staff-card-main">
          <h4>${title} · Claim #${claimId}</h4>
          <p>${name}${email ? ` · ${email}` : ""} · <strong>${escapeHTML(claim.status)}</strong></p>
          <p>${message}</p>
        </div>
        <div class="staff-card-actions">
          ${isPending ? `
            <button class="btn btn-primary" data-action="decision" data-id="${claimId}" data-decision="approved">Approve</button>
            <button class="btn btn-secondary" data-action="decision" data-id="${claimId}" data-decision="rejected">Reject</button>
          ` : `
            <button class="btn btn-primary" data-action="complete" data-id="${claimId}">Record return</button>
          `}
        </div>
      </article>`;
  }).join("");
}

async function submitAuth(event) {
  event.preventDefault();
  setError("#authError");

  const button = $("#authSubmit");
  const payload = {
    email: $("#authEmail").value.trim(),
    password: $("#authPassword").value
  };

  if (authMode === "register") {
    payload.name = $("#authName").value.trim();
  }

  setBusy(button, true, "Please wait…");

  try {
    const data = await api(`/auth/${authMode}`, {
      method: "POST",
      body: JSON.stringify(payload)
    });

    if (!data.token) throw new Error("The server did not return a login token.");

    token = data.token;
    sessionStorage.setItem("campus_token", token);

    if (data.user) {
      currentUser = data.user;
    } else {
      const profile = await api("/auth/me");
      currentUser = profile.user || profile;
    }

    updateAuthUI();
    closeDialog("authDialog");
    $("#authForm").reset();
    notify(authMode === "register" ? "Account created successfully." : "Welcome back.");
    await loadItems();
  } catch (error) {
    setError("#authError", error.message);
  } finally {
    setBusy(button, false);
  }
}

async function submitReport(event) {
  event.preventDefault();
  setError("#reportError");

  if (!currentUser) {
    closeDialog("reportDialog");
    openAuth("login");
    notify("Log in to publish a report.");
    return;
  }

  const form = $("#reportForm");
  const formData = new FormData(form);
  const payload = Object.fromEntries(formData.entries());

  for (const key of ["title", "description", "category", "location", "item_date"]) {
    payload[key] = String(payload[key] || "").trim();
  }
  payload.image_url = String(payload.image_url || "").trim() || null;

  const button = $("#reportSubmit");
  setBusy(button, true, "Publishing…");

  try {
    await api("/items", {
      method: "POST",
      body: JSON.stringify(payload)
    });
    closeDialog("reportDialog");
    form.reset();
    notify(payload.type === "found"
      ? "Found-item report published. Staff must confirm receipt before claims can be submitted."
      : "Lost-item report published.");
    await loadItems();
  } catch (error) {
    setError("#reportError", error.message);
  } finally {
    setBusy(button, false);
  }
}

function openClaim(itemId, itemTitle) {
  if (!currentUser) {
    openAuth("login");
    notify("Log in before submitting a claim.");
    return;
  }

  activeClaimItem = itemId;
  $("#claimForm").reset();
  $("#claimItemName").textContent = `Submitting a claim for: ${itemTitle}`;
  setError("#claimError");
  showDialog("claimDialog");
}

async function submitClaim(event) {
  event.preventDefault();
  setError("#claimError");

  if (!activeClaimItem) {
    setError("#claimError", "No item was selected.");
    return;
  }

  const button = $("#claimSubmit");
  setBusy(button, true, "Submitting…");

  try {
    await api(`/items/${encodeURIComponent(activeClaimItem)}/claims`, {
      method: "POST",
      body: JSON.stringify({ message: $("#claimMessage").value.trim() })
    });
    closeDialog("claimDialog");
    notify("Claim submitted. Desk staff will review it.");
    activeClaimItem = null;
    await loadItems();
  } catch (error) {
    setError("#claimError", error.message);
  } finally {
    setBusy(button, false);
  }
}

async function staffAction(action, id, decision) {
  if (currentUser?.role !== "admin") {
    notify("This action is restricted to desk staff.", true);
    return;
  }

  try {
    if (action === "receive") {
      if (!confirm("Confirm that this item has physically reached the lost-and-found desk?")) return;

      await api(`/items/${encodeURIComponent(id)}/receive`, {
        method: "PATCH",
        body: JSON.stringify({})
      });
      notify("Receipt recorded. Eligible claims can now be submitted.");
    }

    if (action === "decision") {
      const verb = decision === "approved" ? "approve" : "reject";
      if (!confirm(`Are you sure you want to ${verb} this claim?`)) return;

      await api(`/claims/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify({ decision })
      });
      notify(`Claim ${decision}.`);
    }

    if (action === "complete") {
      if (!confirm("Confirm that the item has physically been returned to its owner?")) return;

      await api(`/claims/${encodeURIComponent(id)}/complete`, {
        method: "PATCH",
        body: JSON.stringify({})
      });
      notify("Return recorded. Item marked resolved and released.");
    }

    await loadItems();
  } catch (error) {
    notify(error.message, true);
  }
}

async function restoreSession() {
  if (!token) {
    updateAuthUI();
    return;
  }

  try {
    const profile = await api("/auth/me");
    currentUser = profile.user || profile;
  } catch {
    token = "";
    currentUser = null;
    sessionStorage.removeItem("campus_token");
  }

  updateAuthUI();
}

function wireEvents() {
  $("#loginBtn").addEventListener("click", () => openAuth("login"));
  $("#registerBtn").addEventListener("click", () => openAuth("register"));

  $("#logoutBtn").addEventListener("click", () => {
    token = "";
    currentUser = null;
    sessionStorage.removeItem("campus_token");
    updateAuthUI();
    notify("You have logged out.");
    loadItems();
  });

  $("#switchAuth").addEventListener("click", () => {
    openAuth(authMode === "login" ? "register" : "login");
  });

  $("#authForm").addEventListener("submit", submitAuth);
  $("#reportForm").addEventListener("submit", submitReport);
  $("#claimForm").addEventListener("submit", submitClaim);

  $("#reportBtn").addEventListener("click", () => openReport("lost"));
  $("#heroLostBtn").addEventListener("click", () => openReport("lost"));
  $("#heroFoundBtn").addEventListener("click", () => openReport("found"));
  $("#bottomFoundBtn").addEventListener("click", () => openReport("found"));
  $("#emptyReportBtn").addEventListener("click", () => openReport("lost"));

  $("#searchInput").addEventListener("input", renderItems);
  $("#typeFilter").addEventListener("change", renderItems);
  $("#categoryFilter").addEventListener("change", renderItems);
  $("#statusFilter").addEventListener("change", renderItems);
  $("#refreshBtn").addEventListener("click", loadItems);
  $("#staffRefreshBtn").addEventListener("click", async () => {
    await loadItems();
    notify("Staff data refreshed.");
  });

  document.querySelectorAll("[data-close]").forEach((button) => {
    button.addEventListener("click", () => closeDialog(button.dataset.close));
  });

  // Delegation allows actions to keep working after cards are re-rendered.
  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-action]");
    if (!button) return;

    const { action, id, title, decision } = button.dataset;

    if (action === "claim") openClaim(id, title || "Selected item");
    if (action === "login-claim") openAuth("login");
    if (action === "refresh") loadItems();
    if (["receive", "decision", "complete"].includes(action)) {
      staffAction(action, id, decision);
    }
  });

  // Clicking outside the modal card closes the dialog.
  ["authDialog", "reportDialog", "claimDialog"].forEach((id) => {
    const dialog = document.getElementById(id);
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) dialog.close();
    });
  });
}

async function init() {
  $("#year").textContent = new Date().getFullYear();
  $("#itemDate").value = new Date().toLocaleDateString("en-CA");
  wireEvents();
  await restoreSession();
  await loadItems();
}

init();
