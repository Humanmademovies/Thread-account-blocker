// Logique pure de blockedex (aucun accès à Chrome ni au DOM) : testable avec Node.

export const STATUS = {
  BLOCKED: 'blocked',
  ALREADY_BLOCKED: 'already_blocked',
  NOT_FOUND: 'not_found',
  FAILED: 'failed',
  LOGIN_REQUIRED: 'login_required',
};

// Ces comptes ne sont pas retraités à la prochaine exécution ; les échecs si.
const FINAL = new Set([STATUS.BLOCKED, STATUS.ALREADY_BLOCKED, STATUS.NOT_FOUND]);
export const isDone = (status) => FINAL.has(status);

// Les comptes Threads reprennent les noms d'utilisateur Instagram.
const HANDLE_RE = /^[a-z0-9._]{1,30}$/;
const PROFILE_URL_RE = /^(?:https?:\/\/)?(?:www\.)?threads\.(?:net|com)\/@([^/?#\s]+)/i;
const HANDLE_KEYS = ['username', 'handle', 'user', 'screen_name', 'account', 'compte'];
const CONTAINER_KEYS = ['accounts', 'users', 'blocked', 'handles', 'comptes'];

export class BlocklistError extends Error {}

/** Renvoie le handle en minuscules sans @, ou null s'il est invalide. */
export function normalizeHandle(raw) {
  let value = String(raw).trim();
  const url = PROFILE_URL_RE.exec(value);
  if (url) value = url[1];
  value = value.replace(/^@+/, '').toLowerCase();
  return HANDLE_RE.test(value) ? value : null;
}

function valuesFromText(text) {
  return text
    .split(/\r?\n/)
    .map((line) => line.split('#', 1)[0].trim())
    .filter(Boolean);
}

function parseCsvRows(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      rows.push(row); row = [];
    } else cell += c;
  }
  row.push(cell);
  rows.push(row);
  return rows.filter((r) => r.some((c) => c.trim()));
}

function valuesFromCsv(text) {
  const rows = parseCsvRows(text);
  if (!rows.length) return [];
  const header = rows[0].map((c) => c.trim().toLowerCase());
  const key = HANDLE_KEYS.find((k) => header.includes(k));
  // Pas d'en-tête reconnu : première colonne, toutes les lignes.
  const column = key ? header.indexOf(key) : 0;
  const body = key ? rows.slice(1) : rows;
  return body.map((r) => r[column]).filter((v) => v && v.trim());
}

function valuesFromJson(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    throw new BlocklistError(`JSON invalide : ${e.message}`);
  }
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const key = CONTAINER_KEYS.find((k) => Array.isArray(data[k]));
    if (!key) throw new BlocklistError(`JSON : attendu une liste, ou un objet avec une clé parmi ${CONTAINER_KEYS.join(', ')}`);
    data = data[key];
  }
  if (!Array.isArray(data)) throw new BlocklistError('JSON : attendu une liste de comptes');
  return data.map((item) => {
    if (typeof item === 'string') return item;
    if (item && typeof item === 'object') {
      const key = HANDLE_KEYS.find((k) => typeof item[k] === 'string');
      return key ? item[key] : JSON.stringify(item);
    }
    return String(item);
  });
}

/**
 * Lit une ou plusieurs sources ({ name, text }) ; le format vient de l'extension du nom
 * (.json, .csv, sinon texte). Renvoie les handles uniques, dans l'ordre.
 */
export function parseBlocklists(sources) {
  const handles = [];
  const invalid = [];
  const seen = new Set();
  let duplicates = 0;
  for (const { name = '', text } of sources) {
    const clean = text.replace(/^﻿/, '');
    const lower = name.toLowerCase();
    const values = lower.endsWith('.json') ? valuesFromJson(clean)
      : lower.endsWith('.csv') ? valuesFromCsv(clean)
      : valuesFromText(clean);
    for (const raw of values) {
      const handle = normalizeHandle(raw);
      if (handle === null) invalid.push(raw);
      else if (seen.has(handle)) duplicates++;
      else { seen.add(handle); handles.push(handle); }
    }
  }
  return { handles, invalid, duplicates };
}

/** Sérialise une liste (format 'txt', 'csv' ou 'json') ; relisible par parseBlocklists. */
export function writeBlocklist(handles, format, date = new Date()) {
  if (format === 'json') return JSON.stringify(handles, null, 2) + '\n';
  if (format === 'csv') return ['username', ...handles].join('\n') + '\n';
  const day = date.toISOString().slice(0, 10);
  return `# Comptes bloqués exportés le ${day} (${handles.length} comptes)\n` + handles.map((h) => `@${h}\n`).join('');
}

/**
 * Applique les blocages un par un. `block(handle)` renvoie un STATUS ; `results` (handle -> statut)
 * est modifié en place et `onResult` appelé après chaque compte pour pouvoir le sauvegarder.
 * `limit` plafonne les tentatives par exécution (0/null = illimité).
 */
export async function runBlocks({
  handles, results, block, sleep,
  delay = [8, 20], limit = 100, maxConsecutiveFailures = 5,
  rng = Math.random, signal, onResult = async () => {}, log = () => {},
}) {
  const todo = handles.filter((h) => !isDone(results[h]));
  const summary = { counts: {}, skipped: handles.length - todo.length, remaining: 0, aborted: null };
  const abort = (reason, index) => { summary.aborted = reason; summary.remaining = todo.length - index; log(`Arrêt : ${reason}`); };
  let attempted = 0;
  let consecutiveFailures = 0;

  for (let i = 0; i < todo.length; i++) {
    const handle = todo[i];
    if (limit && attempted >= limit) {
      summary.remaining = todo.length - i;
      log(`Limite de ${limit} comptes atteinte ; relancez plus tard pour continuer.`);
      break;
    }
    if (attempted) await sleep((delay[0] + rng() * (delay[1] - delay[0])) * 1000, signal);
    if (signal?.aborted) { abort('arrêté par vous', i); break; }
    attempted++;

    let status;
    try {
      status = await block(handle);
    } catch (e) {
      abort(e.message, i);
      break;
    }
    if (status === STATUS.LOGIN_REQUIRED) {
      abort('session Threads absente ou expirée : connectez-vous sur threads.com', i);
      break;
    }
    results[handle] = status;
    summary.counts[status] = (summary.counts[status] || 0) + 1;
    await onResult(handle, status, i, todo.length);

    consecutiveFailures = status === STATUS.FAILED ? consecutiveFailures + 1 : 0;
    if (consecutiveFailures >= maxConsecutiveFailures) {
      abort(`${consecutiveFailures} échecs consécutifs (Threads a peut-être changé son interface ou limité le compte)`, i + 1);
      break;
    }
  }
  return summary;
}
