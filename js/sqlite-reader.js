/**
 * Leitura de um backup SQLite do WhatsApp (iOS - ChatStorage.sqlite) com sql.js.
 * Timestamps do Core Data são "segundos desde 2001-01-01": convertidos para Unix/Epoch
 * (+978307200) em util.appleToDate.
 *
 * ATENÇÃO (dados anonimizados do exercício): em ~60% das mensagens a coluna
 * ZMESSAGEDATE foi truncada para um INTEIRO de 5 dígitos (= timestamp / 10.000, ou seja,
 * janela de ~2h46min). Reconstruímos o horário interpolando entre as mensagens vizinhas
 * (ordem ZSORT) que têm timestamp real, mantendo-o dentro da janela. Essas mensagens
 * ficam marcadas com `approx: true` (exibidas com "~" no horário).
 */

const BUCKET = 10000;

async function openDatabase(arrayBuffer) {
  const SQL = await window.initSqlJs();
  return new SQL.Database(new Uint8Array(arrayBuffer));
}

function rows(db, sql, params = []) {
  const st = db.prepare(sql);
  st.bind(params);
  const out = [];
  while (st.step()) out.push(st.getAsObject());
  st.free();
  return out;
}

function validate(db) {
  const t = rows(db, "SELECT name FROM sqlite_master WHERE type='table'").map(r => r.name);
  if (!t.includes("ZWAMESSAGE") || !t.includes("ZWACHATSESSION"))
    throw new Error("Banco não reconhecido: faltam as tabelas ZWAMESSAGE / ZWACHATSESSION do WhatsApp (iOS).");
}

function listChats(db) {
  return rows(db, `
    SELECT s.Z_PK AS id, s.ZSESSIONTYPE AS type, s.ZPARTNERNAME AS name, s.ZCONTACTJID AS jid,
           COUNT(m.Z_PK) AS n
    FROM ZWACHATSESSION s JOIN ZWAMESSAGE m ON m.ZCHATSESSION = s.Z_PK
    WHERE s.ZSESSIONTYPE IN (0,1)
    GROUP BY s.Z_PK
    ORDER BY n DESC`).map(r => ({
      id: r.id, isGroup: r.type === 1, count: r.n,
      name: r.name || r.jid.split("@")[0],
    }));
}

const KIND = { 0: "text", 1: "image", 2: "video", 3: "audio", 4: "contact", 5: "location", 6: "system",
               7: "link", 8: "document", 10: "system", 11: "gif", 14: "deleted", 15: "sticker" };

function loadChat(db, chat) {
  const raw = rows(db, `
    SELECT m.Z_PK AS id, m.ZISFROMME AS me, m.ZMESSAGETYPE AS t, m.ZMESSAGEDATE AS d, m.ZSENTDATE AS sd,
           m.ZSORT AS srt, m.ZTEXT AS txt, m.ZPUSHNAME AS pn, m.ZFROMJID AS fj,
           gm.ZCONTACTNAME AS gname, gm.ZFIRSTNAME AS gfirst, mi.ZTITLE AS title
    FROM ZWAMESSAGE m
    LEFT JOIN ZWAGROUPMEMBER gm ON gm.Z_PK = m.ZGROUPMEMBER
    LEFT JOIN ZWAMEDIAITEM mi ON mi.Z_PK = m.ZMEDIAITEM
    WHERE m.ZCHATSESSION = ? ORDER BY m.ZSORT, m.Z_PK`, [chat.id]);

  // 1) timestamps: reais (float) ou truncados (inteiro de 5 dígitos)
  const ts = raw.map(r => {
    const v = r.d;
    return { v, approx: Number.isInteger(v) && v < 100000 };
  });
  reconstruct(ts);

  // 2) montar mensagens
  const messages = raw.map((r, i) => {
    const kind = KIND[r.t] ?? "text";
    const system = kind === "system";
    let sender = null;
    if (!system) {
      if (r.me) sender = "Você";
      else if (chat.isGroup) sender = r.gname || r.gfirst || r.pn || (r.fj ? "+" + r.fj.split(/[@~]/)[0] : "Participante");
      else sender = chat.name;
    }
    let text = r.txt || "";
    if (system && !text) text = "Evento do grupo";
    return { id: r.id, sender, me: !!r.me, kind, system, text, title: r.title || "",
             date: appleToDate(ts[i].v), approx: ts[i].approx };
  });
  return messages;
}

/** Interpola timestamps truncados entre vizinhos reais, respeitando a janela [d*1e4, (d+1)*1e4). */
function reconstruct(ts) {
  const n = ts.length;
  let i = 0, prev = null;
  while (i < n) {
    if (!ts[i].approx) { prev = ts[i].v; i++; continue; }
    // trecho consecutivo de mesmo "bucket"
    const b = ts[i].v; let j = i;
    while (j < n && ts[j].approx && ts[j].v === b) j++;
    let next = null;
    for (let k = j; k < n; k++) if (!ts[k].approx) { next = ts[k].v; break; }
    const lo0 = b * BUCKET, hi0 = (b + 1) * BUCKET;
    let lo = Math.max(lo0, prev ?? lo0);
    let hi = Math.min(hi0, next ?? hi0);
    if (hi <= lo) { lo = lo0; hi = hi0; }
    const cnt = j - i;
    for (let k = 0; k < cnt; k++) ts[i + k].v = lo + ((hi - lo) * (k + 1)) / (cnt + 1);
    prev = ts[j - 1].v; i = j;
  }
}
