/* Interface: upload, lista de conversas, balões, busca. */
const $ = (s) => document.querySelector(s);
const state = { db: null, chats: [], chat: null, messages: [], me: null, query: "", source: "" };

const el = {
  drop: $("#drop"), file: $("#file"), app: $("#app"), chatList: $("#chatList"), msgs: $("#messages"),
  title: $("#chatTitle"), sub: $("#chatSub"), search: $("#search"), count: $("#hits"), status: $("#status"),
  meWrap: $("#meWrap"), meSel: $("#meSel"), prev: $("#prev"), next: $("#next"), chatFilter: $("#chatFilter"),
};

/* ---------- Upload ---------- */
el.file.addEventListener("change", (e) => e.target.files[0] && handleFile(e.target.files[0]));
["dragover", "dragenter"].forEach(ev => document.addEventListener(ev, (e) => { e.preventDefault(); el.drop.classList.add("over"); }));
["dragleave", "drop"].forEach(ev => document.addEventListener(ev, (e) => { e.preventDefault(); el.drop.classList.remove("over"); }));
document.addEventListener("drop", (e) => { const f = e.dataTransfer.files[0]; if (f) handleFile(f); });
$("#reload").addEventListener("click", () => el.file.click());

async function handleFile(file) {
  setStatus(`Lendo ${file.name}…`);
  try {
    const ext = file.name.split(".").pop().toLowerCase();
    if (["sqlite", "db", "sqlite3"].includes(ext)) {
      state.db = await openDatabase(await file.arrayBuffer());
      validate(state.db);
      state.chats = listChats(state.db);
      if (!state.chats.length) throw new Error("Nenhuma conversa encontrada no banco.");
      state.source = file.name;
      showApp(); renderChatList(); selectChat(state.chats[0]);
    } else if (ext === "txt") {
      const { messages, senders } = parseWhatsAppTxt(await file.text());
      if (!messages.length) throw new Error("Nenhuma mensagem reconhecida. Verifique se é uma exportação do WhatsApp.");
      state.db = null; state.source = file.name;
      state.chats = [{ id: 0, name: file.name.replace(/^Conversa do WhatsApp com\s*/i, "").replace(/\.txt$/i, ""), count: messages.length, isGroup: senders.length > 2 }];
      showApp(); renderChatList();
      state.chat = state.chats[0];
      setMessages(messages, senders);
    } else throw new Error("Formato não suportado. Envie um arquivo .sqlite, .db ou .txt.");
    setStatus("");
  } catch (err) {
    console.error(err); setStatus("⚠ " + err.message, true);
  }
}
function setStatus(t, err) { for (const s of [el.status, $("#status2")]) { s.textContent = t; s.className = err ? "err" : ""; } }
function showApp() { el.drop.hidden = true; el.app.hidden = false; }

/* ---------- Conversas ---------- */
function renderChatList() {
  const q = fold(el.chatFilter.value.trim());
  el.chatList.innerHTML = "";
  for (const c of state.chats) {
    if (q && !fold(c.name).includes(q)) continue;
    const li = document.createElement("li");
    li.className = (state.chat && state.chat.id === c.id ? "active" : "");
    li.innerHTML = `<span class="av" style="background:${colorFor(c.name)}">${c.isGroup ? "👥" : escapeHtml(c.name.trim()[0] || "?").toUpperCase()}</span>
      <span class="ci"><b>${escapeHtml(c.name)}</b><small>${c.count.toLocaleString("pt-BR")} mensagens</small></span>`;
    li.onclick = () => state.db && selectChat(c);
    el.chatList.append(li);
  }
}
el.chatFilter.addEventListener("input", renderChatList);

function selectChat(c) {
  state.chat = c; renderChatList();
  setStatus("Carregando conversa…");
  setTimeout(() => {   // deixa o navegador pintar o status
    const messages = loadChat(state.db, c);
    setMessages(messages, [...new Set(messages.filter(m => m.sender).map(m => m.sender))]);
    setStatus("");
  }, 10);
}

function setMessages(messages, senders) {
  state.messages = messages;
  el.search.value = ""; state.query = "";
  // "Quem sou eu" define o lado direito (no .sqlite já vem de ZISFROMME)
  if (state.db) { el.meWrap.hidden = true; state.me = "Você"; }
  else {
    el.meWrap.hidden = false;
    el.meSel.innerHTML = senders.map(s => `<option>${escapeHtml(s)}</option>`).join("");
    state.me = senders[0]; el.meSel.value = state.me;
  }
  el.title.textContent = state.chat.name;
  const first = messages[0]?.date, last = messages[messages.length - 1]?.date;
  el.sub.textContent = `${messages.length.toLocaleString("pt-BR")} mensagens · ${senders.length} participante(s)` +
    (first ? ` · ${fmtDate(first)} a ${fmtDate(last)}` : "") + (state.source ? ` · ${state.source}` : "");
  render(true);
}
el.meSel.addEventListener("change", () => { state.me = el.meSel.value; render(false); });

/* ---------- Balões ---------- */
const ICON = { image: "📷 Foto", video: "🎥 Vídeo", audio: "🎤 Áudio", contact: "👤 Contato", location: "📍 Localização",
               link: "🔗 Link", document: "📄 Documento", gif: "GIF", sticker: "Figurinha", deleted: "🚫 Mensagem apagada", media: "📎 Mídia" };
let hitEls = [], hitIdx = -1;

function isMine(m) { return state.db ? m.me : m.sender === state.me; }

function render(scrollBottom) {
  const q = fold(state.query.trim());
  const terms = q ? q.split(/\s+/) : [];
  const frag = document.createDocumentFragment();
  let lastDay = "", shown = 0;
  hitEls = []; hitIdx = -1;

  for (const m of state.messages) {
    const hay = fold((m.text || "") + " " + (m.sender || "") + " " + (m.title || ""));
    if (terms.length && !terms.every(t => hay.includes(t))) continue;   // filtro: todas as palavras (AND)
    shown++;
    const dk = dayKey(m.date);
    if (dk !== lastDay) {
      lastDay = dk;
      const d = document.createElement("div"); d.className = "day"; d.textContent = fmtDayLabel(m.date);
      frag.append(d);
    }
    if (m.system) {
      const s = document.createElement("div"); s.className = "sys"; s.textContent = m.text; frag.append(s); continue;
    }
    const mine = isMine(m);
    const b = document.createElement("div");
    b.className = "bubble " + (mine ? "out" : "in") + (m.kind !== "text" ? " media" : "");
    const showName = !mine && (state.chat.isGroup || !state.db);
    let body = "";
    if (m.kind !== "text" && ICON[m.kind]) body += `<span class="tag">${ICON[m.kind]}</span>`;
    const txt = m.kind === "media" ? m.text.replace(/[<>\u200e]/g, "").replace(/^anexado:\s*/i, "") : (m.text || m.title);
    body += highlight(txt || "", terms);
    const approx = m.approx ? `<span title="Horário aproximado: o banco anonimizado só preserva a janela de ~2h46min">~</span>` : "";
    b.innerHTML = (showName ? `<div class="who" style="color:${colorFor(m.sender)}">${highlight(m.sender, terms)}</div>` : "") +
      `<div class="txt">${body}</div><div class="meta">${fmtDate(m.date)} ${approx}${fmtTime(m.date)}</div>`;
    if (terms.length && b.querySelector("mark")) hitEls.push(b);
    frag.append(b);
  }
  el.msgs.replaceChildren(frag);
  el.count.textContent = terms.length ? `${shown.toLocaleString("pt-BR")} de ${state.messages.length.toLocaleString("pt-BR")} mensagens` : "";
  if (!shown) el.msgs.innerHTML = `<div class="empty">Nenhuma mensagem encontrada.</div>`;
  if (scrollBottom || terms.length === 0) el.msgs.scrollTop = el.msgs.scrollHeight;
  else el.msgs.scrollTop = 0;
  el.prev.hidden = el.next.hidden = !terms.length || !hitEls.length;
}

function highlight(text, terms) {
  if (!text) return "";
  if (!terms.length) return linkify(escapeHtml(text));
  const f = fold(text); const ranges = [];
  for (const t of terms) { let i = 0; while ((i = f.indexOf(t, i)) !== -1) { ranges.push([i, i + t.length]); i += t.length; } }
  ranges.sort((a, b) => a[0] - b[0]);
  let out = "", pos = 0;
  for (const [s, e] of ranges) {
    if (s < pos) { if (e > pos) { out += `<mark>${escapeHtml(text.slice(pos, e))}</mark>`; pos = e; } continue; }
    out += escapeHtml(text.slice(pos, s)) + `<mark>${escapeHtml(text.slice(s, e))}</mark>`; pos = e;
  }
  return out + escapeHtml(text.slice(pos));
}
const escapeHtml = (s) => s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const linkify = (h) => h.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');

/* ---------- Busca ---------- */
let timer;
el.search.addEventListener("input", () => {
  clearTimeout(timer);
  timer = setTimeout(() => { state.query = el.search.value; render(false); if (hitEls.length) jump(0); }, 180);
});
$("#clear").addEventListener("click", () => { el.search.value = ""; state.query = ""; render(true); });
function jump(i) {
  if (!hitEls.length) return;
  hitIdx = (i + hitEls.length) % hitEls.length;
  hitEls.forEach(h => h.classList.remove("cur"));
  hitEls[hitIdx].classList.add("cur");
  hitEls[hitIdx].scrollIntoView({ block: "center", behavior: "smooth" });
}
el.next.onclick = () => jump(hitIdx + 1);
el.prev.onclick = () => jump(hitIdx - 1);
el.search.addEventListener("keydown", (e) => { if (e.key === "Enter") jump(hitIdx + (e.shiftKey ? -1 : 1)); });
