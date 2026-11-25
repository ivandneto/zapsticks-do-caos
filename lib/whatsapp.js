// Conexão com o SEU WhatsApp (como um WhatsApp Web). Envia figurinhas para você mesmo,
// para um contato, um grupo ou um número digitado.
import makeWASocket, { useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, jidNormalizedUser, Browsers, prepareWAMessageMedia, generateMessageIDV2, proto } from 'baileys';
import QRCode from 'qrcode';
import pino from 'pino';
import fs from 'node:fs';
import path from 'node:path';
import { WA_AUTH_DIR, DATA_DIR } from './paths.js';

const logger = pino({ level: 'silent' });

const state = { status: 'disconnected', qr: null, me: null, error: null };
let sock = null;
let authKeys = null;
let retry = null;

export const waStatus = () => ({ ...state });
export const hasSession = () => fs.existsSync(WA_AUTH_DIR) && fs.readdirSync(WA_AUTH_DIR).some((f) => f === 'creds.json');

// ---------------------------------------------------------------------------
// Agenda: o WhatsApp não entrega os contatos sob demanda. Eles chegam em eventos de sincronização
// (ao conectar, ao receber mensagens, ou quando pedimos uma ressincronização). Guardamos em disco.
// ---------------------------------------------------------------------------
const CONTACTS_FILE = path.join(DATA_DIR, 'whatsapp-contacts.json');
let contacts = {};
try { contacts = JSON.parse(fs.readFileSync(CONTACTS_FILE, 'utf8')); } catch { /* ainda não existe */ }
let saveT = null;
const saveContacts = () => { clearTimeout(saveT); saveT = setTimeout(() => fs.writeFile(CONTACTS_FILE, JSON.stringify(contacts), () => {}), 1500); };

const isPerson = (jid) => /@(s\.whatsapp\.net|lid)$/.test(jid || '');
function upsertContact(c) {
  if (!c?.id) return;
  // prefere o número de telefone como chave (mais estável que o id "lid")
  const pn = c.phoneNumber && /@s\.whatsapp\.net$/.test(c.phoneNumber) ? c.phoneNumber : null;
  const id = pn || jidNormalizedUser(c.id);
  if (!isPerson(id) || id === state.me?.id) return;
  const cur = contacts[id] || {};
  const next = {
    name: c.name || cur.name || null,          // nome salvo na sua agenda
    notify: c.notify || c.verifiedName || cur.notify || null, // nome que a pessoa usa no WhatsApp
  };
  if (next.name !== cur.name || next.notify !== cur.notify) { contacts[id] = next; saveContacts(); }
  // se chegou pelo id lid e agora sabemos o número, junta os dois
  if (pn && c.id !== pn && contacts[jidNormalizedUser(c.id)]) { delete contacts[jidNormalizedUser(c.id)]; saveContacts(); }
}

export function listContacts() {
  return Object.entries(contacts)
    .map(([id, c]) => ({ id, name: c.name || c.notify, saved: !!c.name, phone: id.endsWith('@s.whatsapp.net') ? '+' + id.split('@')[0] : null }))
    .filter((c) => c.name || c.phone)
    .sort((a, b) => (b.saved - a.saved) || String(a.name || a.phone).localeCompare(String(b.name || b.phone), 'pt-BR'));
}

let groupsCache = { at: 0, list: [] };
export async function listGroups() {
  ensureOpen();
  if (Date.now() - groupsCache.at < 2 * 60 * 1000) return groupsCache.list;
  const all = await sock.groupFetchAllParticipating();
  const list = Object.values(all)
    .map((g) => ({ id: g.id, name: g.subject || 'Grupo sem nome', size: g.participants?.length || g.size || 0 }))
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  groupsCache = { at: Date.now(), list };
  return list;
}

/** Pede ao WhatsApp a lista de contatos de novo (a mesma sincronização de quando se lê o QR). */
export async function syncContacts() {
  ensureOpen();
  await authKeys.set({ 'app-state-sync-version': { critical_unblock_low: null } });
  await sock.resyncAppState(['critical_unblock_low'], true);
  await new Promise((r) => setTimeout(r, 800)); // deixa os eventos chegarem
  return listContacts().length;
}

/** Confere se um número tem WhatsApp. Aceita "(11) 98888-7777", "+55 11 98888-7777"… */
export async function checkNumber(raw) {
  ensureOpen();
  let digits = String(raw || '').replace(/\D/g, '');
  if (digits.length === 10 || digits.length === 11) digits = '55' + digits; // número brasileiro sem DDI
  if (digits.length < 8 || digits.length > 15) throw new Error('Número inválido. Use DDD + número, ex.: 11 98888-7777.');
  const [r] = await sock.onWhatsApp(digits);
  if (!r?.exists) return null;
  const jid = jidNormalizedUser(r.jid);
  const c = contacts[jid];
  return { id: jid, phone: '+' + jid.split('@')[0], name: c?.name || c?.notify || null };
}

// ---------------------------------------------------------------------------
// Conexão
// ---------------------------------------------------------------------------
export async function connect() {
  if (sock && (state.status === 'open' || state.status === 'connecting' || state.status === 'qr')) return waStatus();
  clearTimeout(retry);
  state.status = 'connecting';
  state.error = null;

  const { state: auth, saveCreds } = await useMultiFileAuthState(WA_AUTH_DIR);
  authKeys = auth.keys;
  let version;
  try { ({ version } = await fetchLatestBaileysVersion()); } catch { /* usa a versão padrão do Baileys */ }

  sock = makeWASocket({
    auth, logger, version,
    browser: Browsers.windows('Audio Sticks'),
    markOnlineOnConnect: false,
    syncFullHistory: false,
  });
  sock.ev.on('creds.update', saveCreds);

  // agenda
  sock.ev.on('contacts.upsert', (list) => list.forEach(upsertContact));
  sock.ev.on('contacts.update', (list) => list.forEach(upsertContact));
  sock.ev.on('messaging-history.set', ({ contacts: list }) => (list || []).forEach(upsertContact));
  sock.ev.on('messages.upsert', ({ messages }) => {
    for (const m of messages || []) {
      if (m.key?.fromMe || !m.pushName) continue;
      const from = m.key.participant || m.key.remoteJid;
      const alt = m.key.participantAlt || m.key.remoteJidAlt;
      upsertContact({ id: from, notify: m.pushName, phoneNumber: alt && /@s\.whatsapp\.net$/.test(alt) ? alt : undefined });
    }
  });

  sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      state.status = 'qr';
      state.qr = await QRCode.toDataURL(qr, { margin: 1, width: 320 });
    }
    if (connection === 'open') {
      state.status = 'open';
      state.qr = null;
      state.me = { id: jidNormalizedUser(sock.user.id), name: sock.user.name || null, number: sock.user.id.split(/[:@]/)[0] };
      console.log(`[whatsapp] conectado como +${state.me.number}`);
    }
    if (connection === 'close') {
      const code = lastDisconnect?.error?.output?.statusCode;
      sock = null;
      state.qr = null;
      if (!auth.creds.registered && code === DisconnectReason.timedOut) {
        // ninguém leu o QR a tempo: para de gerar códigos até o usuário pedir de novo
        Object.assign(state, { status: 'disconnected', error: 'O QR code expirou. Gere outro quando estiver com o celular em mãos.' });
      } else if (code === DisconnectReason.loggedOut) {
        fs.rmSync(WA_AUTH_DIR, { recursive: true, force: true });
        Object.assign(state, { status: 'disconnected', me: null, error: 'Sessão encerrada no celular. Conecte de novo.' });
        console.log('[whatsapp] sessão encerrada');
      } else {
        state.status = 'connecting';
        retry = setTimeout(() => connect().catch((e) => { state.status = 'disconnected'; state.error = e.message; }), code === DisconnectReason.restartRequired ? 200 : 3000);
      }
    }
  });
  return waStatus();
}

export async function logout() {
  clearTimeout(retry);
  try { await sock?.logout(); } catch { /* já estava desconectado */ }
  sock = null;
  fs.rmSync(WA_AUTH_DIR, { recursive: true, force: true });
  Object.assign(state, { status: 'disconnected', qr: null, me: null, error: null });
}

// ---------------------------------------------------------------------------
// Envio. `to` = 'me' (ou vazio), id de contato (…@s.whatsapp.net / …@lid) ou de grupo (…@g.us).
// ---------------------------------------------------------------------------
function ensureOpen() {
  if (state.status !== 'open' || !sock) throw Object.assign(new Error('WhatsApp não está conectado.'), { code: 'NOT_CONNECTED' });
}
export function resolveTarget(to) {
  ensureOpen();
  if (!to || to === 'me') return state.me.id;
  if (!/^[\d-]+@(s\.whatsapp\.net|g\.us|lid)$/.test(to)) throw new Error('Destino inválido.');
  return to;
}
export const isSelf = (to) => !to || to === 'me' || to === state.me?.id;

export async function sendText(to, text) {
  const jid = resolveTarget(to);
  await sock.sendMessage(jid, { text });
}

/** Figurinha animada comum (sem som). */
export async function sendSticker(to, webp, { animated = true } = {}) {
  const jid = resolveTarget(to);
  await sock.sendMessage(jid, { sticker: webp, isAnimated: animated });
}

/** Áudio como mensagem de voz (com a forma de onda desenhada). */
export async function sendVoice(to, buffer, { seconds, waveform }) {
  const jid = resolveTarget(to);
  await sock.sendMessage(jid, {
    audio: buffer,
    mimetype: 'audio/ogg; codecs=opus',
    ptt: true,
    seconds: Math.max(1, Math.round(seconds)),
    waveform: Uint8Array.from(waveform.map((v) => Math.max(0, Math.min(100, v)))),
  });
}

// ---------------------------------------------------------------------------
// EXPERIMENTAL: "figurinha com som" (WhatsApp, liberada no Brasil em 24/11/2026).
// O Baileys ainda não conhece esse formato, então a mensagem é montada à mão, em bytes de protobuf:
//   Message.audioStickerMessage (134) → FutureProofMessage.message (1)
//     → Message.stickerMessage (26) → StickerMessage.audioMessage (26)
// Esses números vêm de engenharia reversa de terceiros e NÃO são oficiais. Se o WhatsApp não reconhecer,
// a mensagem chega como "não suportada". Quando o Baileys ganhar suporte oficial, troque por sock.sendMessage.
// ---------------------------------------------------------------------------
const RAW_TAIL = '__stickerRawTail';
let encoderPatched = false;
function patchEncoder() {
  if (encoderPatched) return;
  const original = proto.Message.encode;
  proto.Message.encode = function encode(m, w) {
    const writer = original.call(this, m, w);
    for (const { field, bytes } of m?.[RAW_TAIL] || []) writer.uint32((field << 3) | 2).bytes(bytes);
    return writer;
  };
  encoderPatched = true;
}

function varint(n) {
  const out = [];
  while (n > 127) { out.push((n & 127) | 128); n >>>= 7; }
  out.push(n);
  return Buffer.from(out);
}
const field = (num, bytes) => Buffer.concat([varint((num << 3) | 2), varint(bytes.length), Buffer.from(bytes)]);

export async function sendSoundSticker(to, webp, ogg, { seconds }) {
  const jid = resolveTarget(to);
  patchEncoder();
  const opts = { upload: sock.waUploadToServer, logger };
  const { stickerMessage } = await prepareWAMessageMedia({ sticker: webp }, opts);
  const { audioMessage } = await prepareWAMessageMedia({ audio: ogg, mimetype: 'audio/ogg; codecs=opus', seconds: Math.max(1, Math.round(seconds)) }, opts);
  Object.assign(stickerMessage, { mimetype: 'image/webp', isAnimated: true, width: 512, height: 512 });
  Object.assign(audioMessage, { ptt: false, mimetype: 'audio/ogg; codecs=opus' });

  const stickerBytes = Buffer.concat([
    proto.Message.StickerMessage.encode(stickerMessage).finish(),
    field(26, proto.Message.AudioMessage.encode(audioMessage).finish()),
  ]);
  const inner = field(26, stickerBytes);     // Message.stickerMessage
  const futureProof = field(1, inner);       // FutureProofMessage.message
  const message = { [RAW_TAIL]: [{ field: 134, bytes: futureProof }] }; // Message.audioStickerMessage
  await sock.relayMessage(jid, message, { messageId: generateMessageIDV2(sock.user?.id) });
}
