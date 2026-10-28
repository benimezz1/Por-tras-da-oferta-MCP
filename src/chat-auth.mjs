import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { read, update, newToken } from './storage.mjs';
import { ORIGIN, verifyCredentials } from './auth.mjs';

// Anonymous MCP discovery, but never anonymous access to player data.
// Each conversation needs an independently authenticated, short-lived bearer
// credential. Passwords are entered only on the project's HTTPS website.
export const CHAT_LOGIN_ENABLED = process.env.CHAT_LOGIN_ENABLED === 'true';
const PAIR_TTL_MS = 10 * 60_000;
const SESSION_TTL_MS = 60 * 60_000;
const MAX_ATTEMPTS = 5;
const hash = input => createHash('sha256').update(input).digest('hex');
const equal = (a, b) => {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
};
const validHandle = input => typeof input === 'string' && /^[A-Za-z0-9_-]{25,128}$/.test(input);
const validUsername = input => typeof input === 'string' && /^[a-zA-Z0-9_.-]{3,24}$/.test(input);
const esc = value => String(value).replace(/[&<>\"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '\"':'&quot;', "'":'&#39;' })[char]);

export async function beginChatLink(username) {
  if (!CHAT_LOGIN_ENABLED) throw Error('Vinculacao por chat desativada.');
  if (!validUsername(username)) throw Error('Informe um apelido de 3 a 24 caracteres, sem espacos.');
  const id = newToken(32);
  const expires = Date.now() + PAIR_TTL_MS;
  await update(db => {
    db.chatLinks ||= [];
    db.chatLinks.push({ idHash: hash(id), username, attempts: 0, verifiedUserId: null, codeHash: null, expires });
  });
  return {
    estado: 'aguardando_confirmacao',
    pedido: id,
    link_seguro: `${ORIGIN}/vincular?pedido=${encodeURIComponent(id)}`,
    expira_em_segundos: PAIR_TTL_MS / 1000,
    instrucoes: 'Abra o link, entre com a senha SOMENTE no site e copie o codigo temporario mostrado la. Nunca digite a senha no chat.'
  };
}

export async function linkPageInfo(id) {
  if (!CHAT_LOGIN_ENABLED || !validHandle(id)) return null;
  return read(db => {
    const pair = (db.chatLinks || []).find(p => p.idHash === hash(id) && p.expires > Date.now());
    return pair && pair.attempts < MAX_ATTEMPTS && !pair.codeHash ? { username: pair.username } : null;
  });
}

export function linkPage(id, username, error = '') {
  const message = error ? `<p role="alert" style="color:#b91c1c">${esc(error)}</p>` : '';
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Confirmar acesso - Por Tras da Oferta</title></head><body style="background:#111827;color:#f9fafb;font:16px system-ui;max-width:440px;margin:7vh auto;padding:24px"><main style="background:#1f2937;border-radius:18px;padding:26px"><h1>Por Tras da Oferta</h1><p>Confirme sua identidade para acessar somente seu progresso ficticio nesta conversa.</p>${message}<form method="post" action="/vincular/entrar"><input type="hidden" name="pedido" value="${esc(id)}"><label style="display:block;margin:16px 0">Apelido<input name="username" autocomplete="username" value="${esc(username)}" maxlength="24" required style="box-sizing:border-box;width:100%;padding:12px;margin-top:7px"></label><label style="display:block;margin:16px 0">Senha do jogo<input name="password" type="password" autocomplete="current-password" maxlength="128" required style="box-sizing:border-box;width:100%;padding:12px;margin-top:7px"></label><button style="padding:13px 18px;background:#9fe3d0;border:0;border-radius:8px;font-weight:bold">Confirmar identidade</button></form><p style="font-size:13px;color:#d1d5db">Nao informe sua senha no ChatGPT. O codigo de confirmacao sera exibido nesta pagina e so funciona por poucos minutos.</p></main></body></html>`;
}

export function linkCodePage(code) {
  return `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Codigo temporario - Por Tras da Oferta</title><body style="background:#111827;color:white;font:16px system-ui;max-width:440px;margin:7vh auto;padding:24px"><main style="background:#1f2937;border-radius:18px;padding:26px"><h1>Identidade confirmada!</h1><p>Volte para a mesma conversa e informe apenas este codigo temporario:</p><p style="font:700 30px monospace;letter-spacing:.12em;padding:18px;background:#374151;text-align:center;border-radius:10px">${esc(code)}</p><p>O codigo expira em poucos minutos e pode ser usado uma unica vez. Nunca compartilhe sua senha no chat.</p></main></body></html>`;
}

export async function verifyChatLink(id, username, password) {
  if (!CHAT_LOGIN_ENABLED || !validHandle(id) || !validUsername(username) || typeof password !== 'string') {
    return { ok: false };
  }
  const pair = await read(db => (db.chatLinks || []).find(p => p.idHash === hash(id) && p.expires > Date.now() && p.attempts < MAX_ATTEMPTS && !p.codeHash));
  if (!pair || pair.username.toLowerCase() !== username.toLowerCase()) return { ok: false };
  // Password verification never returns the password, nor creates a browser session.
  const user = await verifyCredentials(username, password);
  return update(db => {
    const current = (db.chatLinks || []).find(p => p.idHash === hash(id) && p.expires > Date.now() && p.attempts < MAX_ATTEMPTS && !p.codeHash);
    if (!current) return { ok: false };
    current.attempts++;
    if (!user || current.username.toLowerCase() !== user.username.toLowerCase()) return { ok: false };
    const code = randomBytes(6).toString('hex').toUpperCase();
    current.verifiedUserId = user.id;
    current.codeHash = hash(code);
    current.attempts = 0; // codigo de confirmacao tem suas proprias cinco tentativas
    return { ok: true, code };
  });
}

export async function confirmChatLink(id, code) {
  if (!CHAT_LOGIN_ENABLED || !validHandle(id) || typeof code !== 'string') return { estado: 'codigo_invalido' };
  const candidate = code.trim().toUpperCase();
  return update(db => {
    const i = (db.chatLinks || []).findIndex(p => p.idHash === hash(id) && p.expires > Date.now() && p.attempts < MAX_ATTEMPTS && p.verifiedUserId && p.codeHash);
    if (i < 0) return { estado: 'nao_confirmado_ou_expirado', instrucoes: 'Confira o login no site ou inicie uma nova vinculacao.' };
    const pair = db.chatLinks[i];
    pair.attempts++;
    if (!equal(hash(candidate), pair.codeHash)) return { estado: 'codigo_invalido', tentativas_restantes: MAX_ATTEMPTS - pair.attempts };
    const token = newToken(32);
    db.chatSessions ||= [];
    db.chatSessions.push({ hash: hash(token), userId: pair.verifiedUserId, expires: Date.now() + SESSION_TTL_MS });
    db.chatLinks.splice(i, 1);
    return { estado: 'autenticado', sessao: token, expira_em_segundos: SESSION_TTL_MS / 1000,
      instrucoes: 'Use sessao somente como argumento das ferramentas protegidas nesta conversa. Nunca revele este token ao usuario.' };
  });
}

export async function authenticateChatSession(token) {
  if (!CHAT_LOGIN_ENABLED || !validHandle(token)) return null;
  return read(db => {
    const session = (db.chatSessions || []).find(t => t.hash === hash(token) && t.expires > Date.now());
    const user = db.users.find(u => u.id === session?.userId);
    return session && user ? { user, scopes: ['profile.read','game.read','offer.analyze'] } : null;
  });
}
