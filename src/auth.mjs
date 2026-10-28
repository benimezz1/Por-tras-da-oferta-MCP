import { createHash, scryptSync, randomBytes, timingSafeEqual } from 'node:crypto';
import { read, update, newToken } from './storage.mjs';

export const ORIGIN = (process.env.PUBLIC_BASE_URL || 'http://127.0.0.1:3100').replace(/\/$/, '');
const url = new URL(ORIGIN);
if (!['https:', 'http:'].includes(url.protocol) || (url.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(url.hostname))) {
  throw Error('PUBLIC_BASE_URL precisa ser HTTPS, exceto localhost.');
}
export const PRODUCTION = url.protocol === 'https:';
const INVITE = process.env.REGISTRATION_CODE || (PRODUCTION ? '' : 'demo-local');
if (PRODUCTION && (INVITE.length < 16 || INVITE.startsWith('TROQUE-'))) throw Error('Defina REGISTRATION_CODE aleatório de 16+ caracteres no ambiente público.');
const SCOPE = ['profile.read', 'game.read', 'offer.analyze'];
export const RESOURCE = ORIGIN + '/mcp';
const sha = value => createHash('sha256').update(value).digest('hex');
const safeEqual = (a, b) => {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
};
const hashedPassword = (pass, salt) => scryptSync(pass, salt, 64).toString('hex');
const cookieToken = req => (req.headers.cookie || '').split(';').map(p => p.trim()).find(p => p.startsWith('pto_session='))?.slice(12) || '';
export const cookie = token => `pto_session=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=28800${PRODUCTION ? '; Secure' : ''}`;
export const clearCookie = `pto_session=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0${PRODUCTION ? '; Secure' : ''}`;

export async function register({ username, password, invite }) {
  if (!INVITE || !safeEqual(invite, INVITE)) throw Error('Código de inscrição inválido.');
  if (typeof username !== 'string' || !/^[a-zA-Z0-9_.-]{3,24}$/.test(username)) throw Error('Apelido: 3 a 24 caracteres, sem espaços.');
  if (typeof password !== 'string' || password.length < 10 || password.length > 128) throw Error('Senha: 10 a 128 caracteres.');
  const salt = randomBytes(16).toString('hex');
  const user = { id: 'usr_' + newToken(12), username, salt, passwordHash: hashedPassword(password, salt), createdAt: Date.now() };
  await update(db => {
    if (db.users.length >= 50) throw Error('Limite de inscrições da demonstração atingido.');
    if (db.users.some(x => x.username.toLowerCase() === username.toLowerCase())) throw Error('Este apelido já está em uso.');
    db.users.push(user);
  });
  return { id: user.id, username: user.username };
}
export async function verifyCredentials(username, password) {
  if (typeof username !== 'string' || typeof password !== 'string' || password.length > 128) return null;
  const user = await read(db => db.users.find(u => u.username.toLowerCase() === username.toLowerCase()));
  const actual = hashedPassword(password, user?.salt || '00000000000000000000000000000000');
  return user && safeEqual(actual, user.passwordHash) ? user : null;
}
export async function login({ username, password }) {
  const user = await verifyCredentials(username, password);
  if (!user) throw Error('Apelido ou senha incorretos.');
  const token = newToken(), hash = sha(token);
  await update(db => { db.sessions.push({ hash, userId: user.id, csrf: newToken(16), expires: Date.now() + 8 * 3600000 }); });
  return token;
}
export async function sessionOf(req) {
  const token = cookieToken(req);
  if (!token) return null;
  return read(db => {
    const session = db.sessions.find(s => s.hash === sha(token) && s.expires > Date.now());
    const user = db.users.find(u => u.id === session?.userId);
    return session && user ? { user, session } : null;
  });
}
export async function logout(req) {
  const t = cookieToken(req);
  if (t) await update(db => { db.sessions = db.sessions.filter(s => s.hash !== sha(t)); });
}
export async function authenticateBearer(req, required = []) {
  const match = /^Bearer ([a-zA-Z0-9_-]{20,})$/.exec(req.headers.authorization || '');
  if (!match) return null;
  return read(db => {
    const entry = db.tokens.find(t => t.hash === sha(match[1]) && t.expires > Date.now() && t.resource === RESOURCE);
    const user = db.users.find(u => u.id === entry?.userId);
    return user && required.every(s => entry.scopes.includes(s)) ? { user, scopes: entry.scopes } : null;
  });
}
export function metadata(type) {
  if (type === 'resource') return { resource: RESOURCE, authorization_servers: [ORIGIN], scopes_supported: SCOPE };
  return { issuer: ORIGIN, authorization_endpoint: ORIGIN + '/oauth/authorize', token_endpoint: ORIGIN + '/oauth/token',
    registration_endpoint: ORIGIN + '/oauth/register', response_types_supported: ['code'], grant_types_supported: ['authorization_code'],
    token_endpoint_auth_methods_supported: ['none'], code_challenge_methods_supported: ['S256'], scopes_supported: SCOPE,
    authorization_response_iss_parameter_supported: true };
}
const allowedCallback = value => {
  try {
    const u = new URL(value);
    if (u.protocol === 'https:' && u.hostname === 'chatgpt.com' && (u.pathname === '/connector_platform_oauth_redirect' || /^\/connector\/oauth\/[a-zA-Z0-9_-]+$/.test(u.pathname))) return true;
    if (!PRODUCTION && u.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(u.hostname)) return true;
  } catch {}
  return false;
};
export async function registerClient(input) {
  if (!Array.isArray(input.redirect_uris) || input.redirect_uris.length < 1 || input.redirect_uris.length > 3 || !input.redirect_uris.every(allowedCallback)) {
    throw Error('Redirect OAuth não autorizado.');
  }
  if (input.token_endpoint_auth_method && input.token_endpoint_auth_method !== 'none') throw Error('Apenas clientes públicos PKCE são aceitos.');
  const client = { client_id: 'cli_' + newToken(18), client_name: String(input.client_name || 'ChatGPT').slice(0, 80),
    redirect_uris: input.redirect_uris, grant_types: ['authorization_code'], response_types: ['code'], token_endpoint_auth_method: 'none', client_id_issued_at: Math.floor(Date.now() / 1000) };
  await update(db => { if (db.clients.length > 100) throw Error('Limite de clientes OAuth atingido.'); db.clients.push(client); });
  return client;
}
export async function startAuthorize(query, req) {
  const session = await sessionOf(req);
  const client = await read(db => db.clients.find(c => c.client_id === query.get('client_id')));
  const redirectUri = query.get('redirect_uri');
  const challenge = query.get('code_challenge');
  const scope = (query.get('scope') || SCOPE.join(' ')).split(' ').filter(Boolean);
  if (!client || !client.redirect_uris.includes(redirectUri) || query.get('response_type') !== 'code' || query.get('code_challenge_method') !== 'S256' || !/^[a-zA-Z0-9_-]{43,128}$/.test(challenge || '') ||
    query.get('resource') !== RESOURCE || !scope.length || scope.some(s => !SCOPE.includes(s))) throw Error('Solicitação OAuth inválida.');
  if (!session) return { loginRequired: true };
  const id = newToken(18);
  await update(db => { db.pending.push({ id: sha(id), sessionHash: session.session.hash, userId: session.user.id, clientId: client.client_id,
    redirectUri, codeChallenge: challenge, resource: RESOURCE, scopes: scope, state: query.get('state') || '', expires: Date.now() + 5 * 60000 }); });
  return { id, csrf: session.session.csrf, username: session.user.username, clientName: client.client_name, scopes: scope };
}
export async function consent(req, { pendingId, csrf, approve }) {
  const sess = await sessionOf(req);
  if (!sess || !safeEqual(csrf, sess.session.csrf)) throw Error('Sessão ou CSRF inválido.');
  const found = await update(db => {
    const idx = db.pending.findIndex(p => p.id === sha(pendingId) && p.expires > Date.now() && p.sessionHash === sess.session.hash);
    if (idx === -1) throw Error('Autorização expirada.');
    return db.pending.splice(idx, 1)[0];
  });
  const redirect = new URL(found.redirectUri);
  if (found.state) redirect.searchParams.set('state', found.state);
  redirect.searchParams.set('iss', ORIGIN);
  if (approve !== 'yes') { redirect.searchParams.set('error', 'access_denied'); return redirect.toString(); }
  const raw = newToken();
  await update(db => { db.codes.push({ hash: sha(raw), userId: found.userId, clientId: found.clientId, redirectUri: found.redirectUri,
    challenge: found.codeChallenge, resource: found.resource, scopes: found.scopes, expires: Date.now() + 5 * 60000 }); });
  redirect.searchParams.set('code', raw);
  return redirect.toString();
}
export async function exchangeCode(body) {
  if (body.get('grant_type') !== 'authorization_code') throw Error('grant_type não suportado.');
  const verifier = body.get('code_verifier') || '';
  if (!/^[a-zA-Z0-9._~-]{43,128}$/.test(verifier)) throw Error('PKCE inválido.');
  const code = body.get('code') || '';
  const clientId = body.get('client_id');
  return update(db => {
    const idx = db.codes.findIndex(c => c.hash === sha(code) && c.expires > Date.now());
    if (idx === -1) throw Error('Código OAuth inválido ou expirado.');
    const auth = db.codes.splice(idx, 1)[0]; // código de uso único mesmo em falha
    const computed = createHash('sha256').update(verifier).digest('base64url');
    if (!safeEqual(computed, auth.challenge) || auth.clientId !== clientId || auth.redirectUri !== body.get('redirect_uri') || auth.resource !== body.get('resource')) throw Error('Validação do OAuth falhou.');
    const token = newToken();
    db.tokens.push({ hash: sha(token), userId: auth.userId, clientId, scopes: auth.scopes, resource: RESOURCE, expires: Date.now() + 8 * 3600000 });
    return { access_token: token, token_type: 'Bearer', expires_in: 8 * 3600, scope: auth.scopes.join(' ') };
  });
}
export function bearerChallenge() { return `Bearer resource_metadata="${ORIGIN}/.well-known/oauth-protected-resource", scope="${SCOPE.join(' ')}"`; }
