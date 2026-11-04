/* Sessões de acesso ao jogo C4, separadas do OAuth/MCP.
 * Token opaco somente na aba do navegador; no banco, apenas o hash.
 * A conta do jogador e a mesma usada para consultar o percurso no MCP. */
import { createHash, timingSafeEqual } from 'node:crypto';
import { read, update, newToken } from './storage.mjs';
import { registerC4, verifyCredentials } from './auth.mjs';

const hash = text => createHash('sha256').update(text).digest('hex');
const same = (a,b) => {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x,y);
};
const TTL = 8 * 3600_000;
export const GAME_ORIGIN = (process.env.C4_GAME_ORIGIN || 'https://jogo.portrasdaoferta.workers.dev').replace(/\/$/,'');
if (!/^https:\/\/[^/]+$/.test(GAME_ORIGIN) &&
  !/^http:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?$/.test(GAME_ORIGIN))
  throw Error('C4_GAME_ORIGIN deve ser uma origem HTTPS ou localhost.');

const publicUser = user => ({ id: user.id, username: user.username });
async function issue(user) {
  const token = newToken(32), tokenHash = hash(token), expires = Date.now() + TTL;
  await update(db => {
    db.c4GameSessions ||= [];
    db.c4GameSessions = db.c4GameSessions.filter(x=>x.userId!==user.id);
    db.c4GameSessions.push({ hash: tokenHash, userId: user.id, expires });
  });
  return { token, usuario: publicUser(user), expiresEm: new Date(expires).toISOString() };
}
export async function createPlayer(input) {
  const user = await registerC4(input);
  return issue(user);
}
export async function loginPlayer(input) {
  const user = await verifyCredentials(input?.username, input?.password);
  if (!user) throw Object.assign(Error('Apelido ou senha incorretos.'), { status: 401 });
  return issue(user);
}
export async function identifyPlayer(req) {
  const match = /^Bearer ([a-zA-Z0-9_-]{32,128})$/.exec(String(req.headers.authorization || ''));
  if (!match) return null;
  const tokenHash = hash(match[1]);
  return read(db => {
    const entry = (db.c4GameSessions||[]).find(s => same(s.hash,tokenHash) && s.expires>Date.now());
    const user = db.users.find(u=>u.id===entry?.userId);
    return entry && user ? { user, expires: entry.expires } : null;
  });
}
export async function revokePlayer(req) {
  const match = /^Bearer ([a-zA-Z0-9_-]{32,128})$/.exec(String(req.headers.authorization || ''));
  if (!match) return;
  const tokenHash=hash(match[1]);
  await update(db=>{db.c4GameSessions=(db.c4GameSessions||[]).filter(s=>!same(s.hash,tokenHash));});
}
