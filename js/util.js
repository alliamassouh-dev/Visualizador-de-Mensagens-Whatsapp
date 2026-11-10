/* Utilitários compartilhados */
const APPLE_EPOCH_OFFSET = 978307200; // 2001-01-01 -> 1970-01-01 (segundos)

/** Converte timestamp Core Data (segundos desde 2001) para Date via Unix epoch. */
function appleToDate(appleSeconds) {
  const unix = appleSeconds + APPLE_EPOCH_OFFSET;
  return new Date(unix * 1000);
}

/** Remove acentos e baixa caixa, mantendo o MESMO comprimento da string (1 char -> 1 char). */
function fold(s) {
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    const n = c.normalize("NFD")[0];
    out += n.toLowerCase();
  }
  return out;
}

const pad = (n) => String(n).padStart(2, "0");
const fmtDate = (d) => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
const fmtTime = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const dayKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const WEEK = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];
const fmtDayLabel = (d) => `${WEEK[d.getDay()]}, ${fmtDate(d)}`;

/** Cor estável por nome (para o remetente em grupos). */
function colorFor(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return `hsl(${h % 360} 55% var(--name-l))`;
}
