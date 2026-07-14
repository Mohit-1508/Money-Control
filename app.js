/* Money Control v2.1 - People + Ledger (IndexedDB Upgrade)
   UPDATED:
   ✅ Chat summary: Given / Received / This Month totals
   ✅ Entry add/edit/delete/settle ke baad summary auto update
   ✅ Fixed Messaging trigger (SMS / WhatsApp / Share)
   ✅ Upgraded to IndexedDB for permanent storage (no more vanishing data)
   ✅ Added PIN Lock Security
   ✅ Added Toast Notifications
*/

const DB_KEY = "money_control_v2_db";
const THEME_KEY = "money_control_theme_v2";

const $ = (id) => document.getElementById(id);

let GLOBAL_DB = { people: [] }; // In-memory database

function uid() {
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

function normalizeName(name) {
  return (name || "").trim().replace(/\s+/g, " ").toLowerCase();
}

function formatINR(n) {
  const v = Math.round(Number(n) || 0);
  return "₹" + v.toLocaleString("en-IN");
}

/* ---------- DATABASE UPGRADE (IndexedDB) ---------- */
function initPersistentDB() {
  // 1. Ask the device to protect this data from auto-cleanup
  if (navigator.storage && navigator.storage.persist) {
    navigator.storage.persist().catch(() => {});
  }

  return new Promise((resolve) => {
    const req = indexedDB.open("MoneyControlDB", 1);
    
    req.onupgradeneeded = (e) => {
      e.target.result.createObjectStore("dataStore");
    };
    
    req.onsuccess = (e) => {
      const idb = e.target.result;
      
      if (!idb.objectStoreNames.contains("dataStore")) return resolve();

      const tx = idb.transaction("dataStore", "readonly");
      const getReq = tx.objectStore("dataStore").get("appData");
      
      getReq.onsuccess = () => {
        if (getReq.result) {
          GLOBAL_DB = getReq.result; 
        } else {
          // Migration: Move old data from localStorage to prevent data loss
          const oldData = localStorage.getItem(DB_KEY);
          if (oldData) {
            try { GLOBAL_DB = JSON.parse(oldData); } catch(err){}
          }
        }
        resolve();
      };
      tx.onerror = () => resolve(); 
    };
    req.onerror = () => resolve(); 
  });
}

function loadDB() {
  return GLOBAL_DB; 
}

function saveDB(db) {
  GLOBAL_DB = db;
  
  // Save to IndexedDB permanently
  const req = indexedDB.open("MoneyControlDB", 1);
  req.onsuccess = (e) => {
    const idb = e.target.result;
    const tx = idb.transaction("dataStore", "readwrite");
    tx.objectStore("dataStore").put(db, "appData");
    
    // Keep localStorage updated as a secondary fallback
    localStorage.setItem(DB_KEY, JSON.stringify(db)); 
  };
}

/* ---------- MATH & UI HELPERS ---------- */
function calcBalance(person) {
  let bal = 0; 
  for (const t of person.transactions || []) {
    if (t.type === "given") bal += Number(t.amount) || 0;
    if (t.type === "received") bal -= Number(t.amount) || 0;
  }
  return bal;
}

function amountClass(balance) {
  if (balance > 0) return "green";
  if (balance < 0) return "red";
  return "grey";
}

function displayAmount(balance) {
  return formatINR(Math.abs(balance)); 
}

/* ---------- TOAST NOTIFICATIONS ---------- */
function showToast(message, type = "success") {
  // 1. Find or create the container
  let container = document.getElementById("toastContainer");
  if (!container) {
    container = document.createElement("div");
    container.id = "toastContainer";
    container.className = "toast-container";
    document.body.appendChild(container);
  }

  // 2. Create the toast element
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.textContent = message;

  // 3. Add it to the screen
  container.appendChild(toast);

  // 4. Remove it smoothly after 3 seconds
  setTimeout(() => {
    toast.style.animation = "fadeOut 0.3s ease forwards";
    setTimeout(() => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 300);
  }, 3000);
}

function openChat(personId) {
  window.location.href = `chat.html?pid=${encodeURIComponent(personId)}`;
}

function escapeHtml(s) {
  return String(s || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function calcSummary(person) {
  let given = 0;
  let received = 0;
  let thisMonth = 0;

  const now = new Date();
  const m = now.getMonth();
  const y = now.getFullYear();

  for (const t of person.transactions || []) {
    const amt = Number(t.amount) || 0;
    if (t.type === "given") given += amt;
    if (t.type === "received") received += amt;
    if (t.date) {
      const d = new Date(t.date + "T00:00:00");
      if (d.getMonth() === m && d.getFullYear() === y) {
        thisMonth += amt; 
      }
    }
  }
  return { given, received, thisMonth };
}

function setTextIfEl(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function updateChatSummaryUI(person) {
  const { given, received, thisMonth } = calcSummary(person);
  setTextIfEl("sumGiven", formatINR(given));
  setTextIfEl("sumReceived", formatINR(received));
  setTextIfEl("sumThisMonth", formatINR(thisMonth));
}

/* ---------- MESSAGE (SMS/WhatsApp/Share) ---------- */
function makeEntryMessage(personName, tx) {
  const type = tx.type === "given" ? "GIVEN" : "RECEIVED";
  const amt = formatINR(tx.amount);
  const date = tx.date || "";
  const note = (tx.note || "").trim();
  return `Money Control Entry\nPerson: ${personName || "-"}\nType: ${type}\nAmount: ${amt}\nDate: ${date}${note ? "\nNote: " + note : ""}`.trim();
}

function cleanPhone(phone) {
  return String(phone || "").replace(/[^\d]/g, "");
}

function openSMS(phone, text) {
  const clean = cleanPhone(phone);
  if (!clean) return;
  window.location.href = `sms:${clean}?body=${encodeURIComponent(text)}`;
}

function openWhatsApp(phone, text) {
  let clean = cleanPhone(phone);
  if (!clean) return;
  if (clean.length === 10) clean = "91" + clean;
  window.open(`https://wa.me/${clean}?text=${encodeURIComponent(text)}`, "_blank");
}

async function shareText(text) {
  try {
    if (navigator.share) {
      await navigator.share({ text });
      return;
    }
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(text);
      showToast("Message copied to clipboard.", "success");
      return;
    }
  } catch {}
}

// FIXED: Uses database profile settings instead of HTML checkboxes
function triggerMessageIfEnabled(person, tx) {
  if (!person.sendMsg || !person.phone) return;

  const text = makeEntryMessage(person.name, tx);

  if (person.msgMethod === "sms") openSMS(person.phone, text);
  else if (person.msgMethod === "whatsapp") openWhatsApp(person.phone, text);
  else shareText(text);
}

async function pickContact() {
  if (!("contacts" in navigator) || !("ContactsManager" in window)) {
    showToast("Contact picker not supported here.", "error");
    return null;
  }
  const props = ["name", "tel"];
  const opts = { multiple: false };
  const contacts = await navigator.contacts.select(props, opts);
  return contacts?.[0] || null;
}

function setupMessageUI() {
  const sendMsg = $("sendMsg");
  const msgBox = $("msgBox");
  const pickBtn = $("pickContactBtn");
  const phoneInput = $("phone");

  if (sendMsg && msgBox) {
    const sync = () => {
      msgBox.style.display = sendMsg.checked ? "block" : "none";
    };
    sendMsg.addEventListener("change", sync);
    sync();
  }

  if (pickBtn) {
    pickBtn.addEventListener("click", async () => {
      const c = await pickContact();
      const tel = c?.tel?.[0] || "";
      if (tel && phoneInput) phoneInput.value = tel;
    });
  }
}

/* ---------- THEME ---------- */
function getTheme() {
  return localStorage.getItem(THEME_KEY) || "dark";
}

function applyTheme(theme) {
  document.body.setAttribute("data-theme", theme);
  localStorage.setItem(THEME_KEY, theme);
}

function setupThemeToggle() {
  applyTheme(getTheme());
  const toggle = document.getElementById("themeToggle");
  if (!toggle) return;

  const setIcon = () => {
    toggle.textContent = getTheme() === "dark" ? "🌙" : "☀️";
  };
  setIcon();

  toggle.addEventListener("click", () => {
    const next = getTheme() === "dark" ? "light" : "dark";
    applyTheme(next);
    setIcon();
  });
}

/* ---------- DATE HELPERS ---------- */
function todayISO() {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function formatDMYFromISO(iso) {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function labelForISO(iso) {
  if (!iso) return "";
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const d = new Date(iso + "T00:00:00");
  const diffDays = Math.round((d - today) / (24 * 60 * 60 * 1000));
  if (diffDays === 0) return "Today";
  if (diffDays === -1) return "Yesterday";
  return formatDMYFromISO(iso);
}

function lastTxLine(person) {
  const txs = (person.transactions || []).slice();
  if (txs.length === 0) return "No entries yet";

  txs.sort((a, b) => {
    const da = (a.date || ""), db = (b.date || "");
    if (da !== db) return db.localeCompare(da); 
    return (b.createdAt || 0) - (a.createdAt || 0);
  });

  const t = txs[0];
  const label = t.type === "given" ? "Given" : "Received";
  const dateTxt = formatDMYFromISO(t.date || "");
  const note = (t.note || "").trim();

  return `${formatINR(t.amount)} ${label} on ${dateTxt}${note ? " • " + note : ""}`;
}

function netSummary(db) {
  let net = 0;
  for (const p of db.people || []) net += calcBalance(p);
  return net;
}

/* ===================== HOME ===================== */

/* ---------- SECURITY PIN ---------- */
const PIN_KEY = "money_control_pin_v2";

function initPinLock() {
  const pinOverlay = $("pinOverlay");
  const pinTitle = $("pinTitle");
  const pinDots = document.querySelectorAll(".pinDot");
  const pinBtns = document.querySelectorAll(".pinPad .pinBtn");
  const pinClear = $("pinClear");
  const pinClose = $("pinClose");
  const setPinBtn = $("setPinBtn");

  if (!pinOverlay) return; // Failsafe if HTML isn't added

  let savedPin = localStorage.getItem(PIN_KEY);
  let currentInput = "";
  let isSettingPin = false;
  let firstPinEntry = "";

  // Show lock screen immediately if a PIN exists
  if (savedPin) {
    pinOverlay.classList.remove("hidden");
    if (pinClose) pinClose.style.display = "none"; // Hide cancel button on startup
  }

  // Open "Set PIN" mode when header icon is clicked
  if (setPinBtn) {
    setPinBtn.addEventListener("click", () => {
      isSettingPin = true;
      firstPinEntry = "";
      currentInput = "";
      updateDots();
      pinTitle.textContent = savedPin ? "Enter New PIN" : "Create PIN";
      if (pinClose) pinClose.style.display = "flex";
      pinOverlay.classList.remove("hidden");
    });
  }

  function updateDots() {
    pinDots.forEach((dot, index) => {
      if (index < currentInput.length) {
        dot.classList.add("filled");
        dot.classList.remove("error");
      } else {
        dot.classList.remove("filled", "error");
      }
    });
  }

  function showError() {
    pinDots.forEach(dot => dot.classList.add("error"));
    setTimeout(() => {
      currentInput = "";
      updateDots();
    }, 400);
  }

  function handlePinComplete() {
    if (isSettingPin) {
      if (firstPinEntry === "") {
        firstPinEntry = currentInput;
        currentInput = "";
        pinTitle.textContent = "Confirm PIN";
        setTimeout(updateDots, 200);
      } else {
        if (currentInput === firstPinEntry) {
          localStorage.setItem(PIN_KEY, currentInput);
          savedPin = currentInput;
          isSettingPin = false;
          pinOverlay.classList.add("hidden");
          showToast("PIN successfully saved!", "success");
        } else {
          pinTitle.textContent = "Mismatch. Try Again.";
          firstPinEntry = "";
          showError();
        }
      }
    } else {
      // Unlocking the app
      if (currentInput === savedPin) {
        pinOverlay.classList.add("hidden");
      } else {
        showError();
      }
    }
  }

  // Attach clicks to numbers
  pinBtns.forEach(btn => {
    if (btn.id === "pinClear" || btn.id === "pinClose") return;
    btn.addEventListener("click", () => {
      if (currentInput.length < 4) {
        currentInput += btn.textContent;
        updateDots();
        if (currentInput.length === 4) handlePinComplete();
      }
    });
  });

  if (pinClear) {
    pinClear.addEventListener("click", () => {
      currentInput = currentInput.slice(0, -1);
      updateDots();
    });
  }

  if (pinClose) {
    pinClose.addEventListener("click", () => {
      pinOverlay.classList.add("hidden");
      isSettingPin = false;
    });
  }
}

function initHome() {
  const peopleList = $("peopleList");
  const searchPeople = $("searchPeople");
  const accountsCount = $("accountsCount");
  const netAmount = $("netAmount");
  const netLabel = $("netLabel");

  const fabAdd = $("fabAdd");
  const modal = $("personModal");
  const backdrop = $("modalBackdrop");
  const modalClose = $("modalClose");
  const modalCancel = $("modalCancel");
  const modalSave = $("modalSave");
  const personNameInput = $("personNameInput");

  const exportBackupBtn = $("exportBackupBtn");
  const importBackupBtn = $("importBackupBtn");
  const importFile = $("importFile");
  const exportCsvBtn = $("exportCsvBtn");

  function showModal() {
    if (!modal || !backdrop || !personNameInput) return;
    modal.classList.remove("hidden");
    backdrop.classList.remove("hidden");
    personNameInput.value = "";
    setTimeout(() => personNameInput.focus(), 0);
  }

  function hideModal() {
    if (!modal || !backdrop) return;
    modal.classList.add("hidden");
    backdrop.classList.add("hidden");
  }

  function renderHeader(db) {
    if (accountsCount) accountsCount.textContent = String((db.people || []).length);
    if (!netAmount || !netLabel) return;

    const net = netSummary(db);
    netAmount.textContent = displayAmount(net);

    if (net > 0) {
      netAmount.style.color = "var(--green)";
      netLabel.textContent = "You Get";
      netLabel.style.color = "var(--green)";
    } else if (net < 0) {
      netAmount.style.color = "var(--red)";
      netLabel.textContent = "You Pay";
      netLabel.style.color = "var(--red)";
    } else {
      netAmount.style.color = "var(--grey)";
      netLabel.textContent = "Settled";
      netLabel.style.color = "var(--grey)";
    }
  }

  function render() {
    const db = loadDB();
    renderHeader(db);

    const q = (searchPeople?.value || "").trim().toLowerCase();
    const people = (db.people || []).slice().map((p) => ({
      ...p,
      balance: calcBalance(p),
      lastLine: lastTxLine(p),
    }));

    const filtered = q
      ? people.filter((p) => (p.name || "").toLowerCase().includes(q))
      : people;

    filtered.sort((a, b) => {
      const aa = Math.abs(a.balance);
      const bb = Math.abs(b.balance);
      if (bb !== aa) return bb - aa;
      return (a.name || "").localeCompare(b.name || "");
    });

    if (!peopleList) return;
    peopleList.innerHTML = "";

    if (filtered.length === 0) {
      const div = document.createElement("div");
      div.className = "meta";
      div.textContent = (db.people || []).length === 0 ? "No people yet. Tap + to add." : "No match.";
      peopleList.appendChild(div);
      return;
    }

    for (const p of filtered) {
      const row = document.createElement("div");
      row.className = "mcRow";

      const left = document.createElement("div");
      left.className = "mcLeft";

      const av = document.createElement("div");
      av.className = "mcAvatar";
      av.textContent = (p.name || "?").trim().charAt(0).toUpperCase() || "?";

      const text = document.createElement("div");
      const nm = document.createElement("div");
      nm.className = "mcName";
      nm.textContent = p.name || "Unnamed";

      const last = document.createElement("div");
      last.className = "mcLast";
      last.textContent = p.lastLine;

      text.appendChild(nm);
      text.appendChild(last);
      left.appendChild(av);
      left.appendChild(text);

      const right = document.createElement("div");
      right.className = "mcRight";

      const amt = document.createElement("div");
      amt.className = `mcDueAmount ${amountClass(p.balance)}`;
      amt.textContent = displayAmount(p.balance);

      const lbl = document.createElement("div");
      lbl.className = "mcDueLabel";
      lbl.textContent = p.balance === 0 ? "Settled" : "Due";

      right.appendChild(amt);
      right.appendChild(lbl);
      row.appendChild(left);
      row.appendChild(right);

      row.addEventListener("click", () => openChat(p.id));
      peopleList.appendChild(row);
    }
  }

  // FIXED: Save phone and message preferences 
  function addPerson(nameRaw) {
    const name = (nameRaw || "").trim().replace(/\s+/g, " ");
    if (!name) return;

    const db = loadDB();
    const key = normalizeName(name);
    const existing = (db.people || []).find((p) => normalizeName(p.name) === key);

    if (existing) {
      hideModal();
      openChat(existing.id);
      return;
    }

    const sendMsg = $("sendMsg")?.checked || false;
    const msgMethod = $("msgMethod")?.value || "sms";
    const phone = $("phone")?.value || "";

    const person = { 
      id: uid(), 
      name, 
      sendMsg, 
      msgMethod, 
      phone, 
      transactions: [] 
    };
    
    db.people.push(person);
    saveDB(db);

    hideModal();
    openChat(person.id);
  }

  fabAdd?.addEventListener("click", showModal);
  modalClose?.addEventListener("click", hideModal);
  modalCancel?.addEventListener("click", hideModal);
  backdrop?.addEventListener("click", hideModal);

  modalSave?.addEventListener("click", () => addPerson(personNameInput?.value));
  personNameInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") addPerson(personNameInput.value);
    if (e.key === "Escape") hideModal();
  });

  searchPeople?.addEventListener("input", render);

  exportBackupBtn?.addEventListener("click", () => {
    const db = loadDB();
    const blob = new Blob([JSON.stringify(db, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "money-control-backup.json";
    a.click();
    URL.revokeObjectURL(url);
  });

  importBackupBtn?.addEventListener("click", () => importFile?.click());

  importFile?.addEventListener("change", async () => {
    const file = importFile.files && importFile.files[0];
    if (!file) return;

    try {
      const text = await file.text();
      const db = JSON.parse(text);

      if (!db || !Array.isArray(db.people)) {
        showToast("Invalid backup file.", "error");
        importFile.value = "";
        return;
      }

      if (!confirm("Import will replace your current data. Continue?")) {
        importFile.value = "";
        return;
      }

      saveDB(db);
      importFile.value = "";
      render();
      showToast("Backup imported successfully!", "success");
    } catch {
      showToast("Failed to import backup.", "error");
      importFile.value = "";
    }
  });

  render();
}

/* ===================== CHAT ===================== */
function initChat() {
  const title = $("chatTitle");
  const balEl = $("chatBalance");
  const hintEl = $("chatHint"); 
  const list = $("chatList");

  const settleBtn = $("settleBtn");
  const deletePersonBtn = $("deletePersonBtn");
  const fabTx = $("fabTx");

  const txModal = $("txModal");
  const txBackdrop = $("txBackdrop");
  const txClose = $("txClose");
  const txCancel = $("txCancel");
  const txSave = $("txSave");

  const txAmount = $("txAmount");
  const txDate = $("txDate");
  const txNote = $("txNote");
  const btnGiven = $("btnGiven");
  const btnReceived = $("btnReceived");

  const actModal = $("actModal");
  const actBackdrop = $("actBackdrop");
  const actClose = $("actClose");
  const actCancel = $("actCancel");
  const actEdit = $("actEdit");
  const actDelete = $("actDelete");
  const actInfo = $("actInfo");

  const params = new URLSearchParams(location.search);
  const pid = params.get("pid");

  let selectedType = "given";
  let editingTxId = null;
  let longPressTxId = null;

  function showTxModal(modeTitle = "Add Entry") {
    const ttl = $("txTitle");
    if (ttl) ttl.textContent = modeTitle;
    txModal?.classList.remove("hidden");
    txBackdrop?.classList.remove("hidden");
    setTimeout(() => txAmount?.focus(), 0);
  }

  function hideTxModal() {
    txModal?.classList.add("hidden");
    txBackdrop?.classList.add("hidden");
    editingTxId = null;
    selectedType = "given";

    if (txAmount) txAmount.value = "";
    if (txNote) txNote.value = "";
    if (txDate) txDate.value = todayISO();
  }

  function showActModal(infoText) {
    if (actInfo) actInfo.textContent = infoText;
    actModal?.classList.remove("hidden");
    actBackdrop?.classList.remove("hidden");
  }

  function hideActModal(clearId = true) {
    actModal?.classList.add("hidden");
    actBackdrop?.classList.add("hidden");
    if (clearId) longPressTxId = null;
  }

  function getPerson() {
    const db = loadDB();
    const person = (db.people || []).find((p) => p.id === pid);
    return { db, person };
  }

  function setBalanceUI(balance) {
    if (!balEl) return;
    balEl.textContent = displayAmount(balance);

    if (balance > 0) {
      balEl.style.color = "var(--green)";
      if (hintEl) {
        hintEl.textContent = " • You'll receive";
        hintEl.style.color = "var(--green)";
      }
    } else if (balance < 0) {
      balEl.style.color = "var(--red)";
      if (hintEl) {
        hintEl.textContent = " • You'll pay";
        hintEl.style.color = "var(--red)";
      }
    } else {
      balEl.style.color = "var(--grey)";
      if (hintEl) {
        hintEl.textContent = " • Settled";
        hintEl.style.color = "var(--grey)";
      }
    }
  }

  function attachLongPress(el, txId, infoText) {
    let pressTimer = null;
    const start = () => {
      pressTimer = setTimeout(() => {
        longPressTxId = txId;
        showActModal(infoText);
      }, 450);
    };
    const cancel = () => {
      if (pressTimer) clearTimeout(pressTimer);
      pressTimer = null;
    };

    el.addEventListener("mousedown", start);
    el.addEventListener("touchstart", start, { passive: true });
    el.addEventListener("mouseup", cancel);
    el.addEventListener("mouseleave", cancel);
    el.addEventListener("touchend", cancel);
    el.addEventListener("touchcancel", cancel);
    el.addEventListener("contextmenu", (e) => e.preventDefault());
  }

  function render() {
    const { person } = getPerson();

    if (!person) {
      if (title) title.textContent = "Not found";
      if (list) list.innerHTML = `<div class="meta">Person not found.</div>`;
      return;
    }

    if (title) title.textContent = person.name;

    const balance = calcBalance(person);
    setBalanceUI(balance);
    updateChatSummaryUI(person);

    const txs = (person.transactions || []).slice();
    txs.sort(
      (a, b) =>
        (a.date || "").localeCompare(b.date || "") ||
        (a.createdAt || 0) - (b.createdAt || 0)
    );

    if (!list) return;
    list.innerHTML = "";

    if (txs.length === 0) {
      list.innerHTML = `<div class="meta">No entries yet. Tap + to add.</div>`;
      return;
    }

    let lastDate = null;

    for (const t of txs) {
      const iso = t.date || "";
      if (iso !== (lastDate || "")) {
        const sep = document.createElement("div");
        sep.className = "dateSep";
        sep.innerHTML = `<span>${escapeHtml(labelForISO(iso))}</span>`;
        list.appendChild(sep);
        lastDate = iso;
      }

      const side = t.type === "given" ? "right" : "left";
      const color = t.type === "given" ? "green" : "red";

      const row = document.createElement("div");
      row.className = `bubbleRow ${side}`;

      const bubble = document.createElement("div");
      bubble.className = `bubble ${color}`;

      const amt = document.createElement("div");
      amt.className = "bubbleAmount";
      amt.textContent = formatINR(t.amount);

      const meta = document.createElement("div");
      meta.className = "bubbleMeta";
      meta.innerHTML = `<span>${escapeHtml(t.date || "")}</span><span>${escapeHtml(t.note || "")}</span>`;

      bubble.appendChild(amt);
      bubble.appendChild(meta);

      const info = `${t.type === "given" ? "Given" : "Received"} • ${formatINR(t.amount)} • ${t.date || ""}`;
      attachLongPress(bubble, t.id, info);

      row.appendChild(bubble);
      list.appendChild(row);
    }

    setTimeout(() => {
      try {
        list.scrollTo({ top: list.scrollHeight, behavior: "smooth" });
      } catch {
        list.scrollTop = list.scrollHeight;
      }
    }, 0);
  }

  function upsertTx(type) {
    const amount = Number(String(txAmount?.value || "").replaceAll(",", "").trim());
    const date = txDate?.value || todayISO();
    const note = String(txNote?.value || "").trim();

    if (!Number.isFinite(amount) || amount <= 0) {
      showToast("Please enter a valid amount.", "error");
      return;
    }

    const { db, person } = getPerson();
    if (!person) return;

    if (!Array.isArray(person.transactions)) person.transactions = [];

    let txForMessage = null;

    if (editingTxId) {
      const idx = person.transactions.findIndex((x) => x.id === editingTxId);
      if (idx >= 0) {
        person.transactions[idx] = { ...person.transactions[idx], type, amount, date, note };
        txForMessage = person.transactions[idx];
      }
    } else {
      const newTx = {
        id: uid(),
        type,
        amount,
        date,
        note,
        createdAt: Date.now(),
      };
      person.transactions.push(newTx);
      txForMessage = newTx;
    }

    saveDB(db);
    hideTxModal();
    render();

    // FIXED: Passes whole person object
    if (txForMessage) triggerMessageIfEnabled(person, txForMessage);
  }

  function editTx(txId) {
    const { person } = getPerson();
    if (!person) return;

    const t = (person.transactions || []).find((x) => x.id === txId);
    if (!t) return;

    editingTxId = txId;
    selectedType = t.type;

    if (txAmount) txAmount.value = String(t.amount || "");
    if (txDate) txDate.value = t.date || todayISO();
    if (txNote) txNote.value = t.note || "";

    showTxModal("Edit Entry");
  }

  function deleteTx(txId) {
    const { db, person } = getPerson();
    if (!person) return;
    person.transactions = (person.transactions || []).filter((x) => x.id !== txId);
    saveDB(db);
    render();
  }

  function settle() {
    const { db, person } = getPerson();
    if (!person) return;

    const b = calcBalance(person);
    if (b === 0) return;

    const type = b > 0 ? "received" : "given";
    const amount = Math.abs(b);

    const tx = {
      id: uid(),
      type,
      amount,
      date: todayISO(),
      note: "Settle",
      createdAt: Date.now(),
    };

    person.transactions.push(tx);
    saveDB(db);
    render();
    
    triggerMessageIfEnabled(person, tx);
  }

  if (txDate) txDate.value = todayISO();

  fabTx?.addEventListener("click", () => {
    editingTxId = null;
    selectedType = "given";
    if (txAmount) txAmount.value = "";
    if (txNote) txNote.value = "";
    if (txDate) txDate.value = todayISO();
    showTxModal("Add Entry");
  });

  btnGiven?.addEventListener("click", () => upsertTx("given"));
  btnReceived?.addEventListener("click", () => upsertTx("received"));
  txSave?.addEventListener("click", () => upsertTx(selectedType));

  txClose?.addEventListener("click", hideTxModal);
  txCancel?.addEventListener("click", hideTxModal);
  txBackdrop?.addEventListener("click", hideTxModal);

  settleBtn?.addEventListener("click", () => {
    if (!confirm("Settle this account to ₹0?")) return;
    settle();
  });

  deletePersonBtn?.addEventListener("click", () => {
    const { db, person } = getPerson();
    if (!person) return;
    if (!confirm(`Delete "${person.name}" and all transactions?`)) return;

    db.people = (db.people || []).filter((p) => p.id !== pid);
    saveDB(db);
    history.back();
  });

  actClose?.addEventListener("click", hideActModal);
  actCancel?.addEventListener("click", hideActModal);
  actBackdrop?.addEventListener("click", hideActModal);

  actEdit?.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    const txId = longPressTxId;
    if (!txId) return;
    hideActModal(false);
    editTx(txId);
    longPressTxId = null;
  });

  actDelete?.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    const txId = longPressTxId;
    if (!txId) return;
    if (!confirm("Delete this transaction?")) return;
    deleteTx(txId);
    hideActModal();
  });

  render();
}

/* ---------- INIT ---------- */
// Wait for IndexedDB to load before booting up the UI
(async function init() {
  setupThemeToggle();
  setupMessageUI();

  await initPersistentDB(); // CRITICAL: Loads permanent data
  
  initPinLock(); // <--- ADD THIS LINE HERE!

  const page = document.body.getAttribute("data-page");
  if (page === "home") initHome();
  if (page === "chat") initChat();
})();
