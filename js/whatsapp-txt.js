/**
 * Parser de arquivo .txt exportado do WhatsApp (Android e iOS, pt-BR / en).
 *
 * Formatos suportados (uma mensagem por "cabeçalho"; linhas sem cabeçalho são continuação):
 *   Android:  12/03/2019 14:32 - Fulano: texto            (também "12/03/19 2:32 PM - ...")
 *   iOS:      [12/03/2019 14:32:10] Fulano: texto         (também "[12/03/19, 14:32:10]")
 * Linhas sem "Remetente:" são mensagens de sistema (ex.: "As mensagens são criptografadas...").
 */

// Data  d/m/a  (separador / . -), vírgula opcional, hora h:mm[:ss] [AM/PM]
const DATE = String.raw`(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})`;
const TIME = String.raw`(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s?([AaPp])\.?[Mm]\.?)?`;
const RE_IOS = new RegExp(String.raw`^‎?\[${DATE},?\s+${TIME}\]\s(.*)$`);
const RE_ANDROID = new RegExp(String.raw`^‎?${DATE},?\s+${TIME}\s[-–]\s(.*)$`);

function buildDate(m, order) {
  let [, a, b, y, hh, mm, ss, ap] = m;
  let day = +a, month = +b;
  if (order === "mdy") [day, month] = [month, day];
  y = +y; if (y < 100) y += 2000;
  let h = +hh;
  if (ap) { const pm = ap.toLowerCase() === "p"; if (pm && h < 12) h += 12; if (!pm && h === 12) h = 0; }
  return new Date(y, month - 1, day, h, +mm, ss ? +ss : 0);
}

/** Detecta se a data está no formato dia/mês ou mês/dia (se algum 1º campo > 12 => d/m). */
function detectOrder(lines) {
  let dmy = 0, mdy = 0;
  for (const l of lines.slice(0, 400)) {
    const m = l.match(RE_IOS) || l.match(RE_ANDROID);
    if (!m) continue;
    if (+m[1] > 12) dmy++;
    if (+m[2] > 12) mdy++;
  }
  return mdy > dmy ? "mdy" : "dmy";
}

function parseWhatsAppTxt(text) {
  const lines = text.replace(/\r\n?/g, "\n").replace(/^﻿/, "").split("\n");
  const order = detectOrder(lines);
  const msgs = [];
  let cur = null;

  for (const raw of lines) {
    const line = raw.replace(/^‎/, "");
    const m = line.match(RE_IOS) || line.match(RE_ANDROID);
    if (m) {
      const rest = m[m.length - 1];
      const date = buildDate(m, order);
      const idx = rest.indexOf(": ");
      let sender = null, body = rest;
      if (idx > 0 && idx < 80) { sender = rest.slice(0, idx); body = rest.slice(idx + 2); }
      cur = { date, sender, text: body, system: sender === null, kind: "text", approx: false };
      msgs.push(cur);
    } else if (cur) {
      cur.text += "\n" + raw;            // continuação de mensagem multi-linha
    }
  }

  for (const m of msgs) {
    const t = m.text.trim();
    if (/^<?(m[ií]dia oculta|media omitted|imagem ocultada|[áa]udio ocultado|v[ií]deo omitido|figurinha omitida)/i.test(t) || /\(arquivo anexado\)/i.test(t) || /^‎?<anexado/i.test(t)) {
      m.kind = "media"; m.text = t.replace(/^‎/, "");
    } else if (/mensagem apagada|apagou esta mensagem|this message was deleted/i.test(t)) {
      m.kind = "deleted";
    }
  }
  const senders = [...new Set(msgs.filter(m => m.sender).map(m => m.sender))];
  return { messages: msgs, senders };
}
