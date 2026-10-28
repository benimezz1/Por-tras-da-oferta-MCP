import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { register, login, sessionOf, logout, cookie, clearCookie, ORIGIN, RESOURCE, PRODUCTION, metadata, startAuthorize, consent, registerClient, exchangeCode, bearerChallenge } from './auth.mjs';
import { read, update } from './storage.mjs';
import { SCENARIOS, summarize, recordChoice } from './scenarios.mjs';
import { CHAVES_ESTRATEGIAS } from './conhecimento.mjs';
import { analisarTextoAnuncio } from './anuncios.mjs';
import { handleMcp } from './mcp.mjs';
import { CHAT_LOGIN_ENABLED, linkPageInfo, linkPage, linkCodePage, verifyChatLink } from './chat-auth.mjs';
const HOST = process.env.HOST || '127.0.0.1';
const PORT = Number(process.env.PORT || 3100);
if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) throw Error('Porta inválida');
const html = new URL('../public/index.html', import.meta.url);
const limitMap = new Map();
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
function send(res, status, obj, headers = {}) { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers }); res.end(JSON.stringify(obj)); }
function page(res, status, content) { res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(content); }
function redirect(res, where) { res.writeHead(302, { Location: where, 'Cache-Control': 'no-store' }); res.end(); }
async function bodyText(req, max = 12000) { let s = ''; for await (const chunk of req) { s += chunk.toString('utf8'); if (s.length > max) throw Object.assign(Error('Requisição muito grande.'), { status: 413 }); } return s; }
const jsonBody = async req => { if (!(req.headers['content-type'] || '').startsWith('application/json')) throw Error('Use application/json.'); const data = JSON.parse(await bodyText(req)); if (!data || typeof data !== 'object' || Array.isArray(data)) throw Error('JSON inválido.'); return data; };
function throttle(req, kind, max = 15) {
  const ip = String(req.headers['cf-connecting-ip'] || req.socket.remoteAddress || 'unknown').slice(0, 100);
  const key = kind + ':' + ip; const now = Date.now(); const item = limitMap.get(key) || { start: now, count: 0 };
  if (now - item.start > 60000) { item.start = now; item.count = 0; }
  item.count++; limitMap.set(key, item);
  if (item.count > max) throw Object.assign(Error('Muitas tentativas. Tente novamente mais tarde.'), { status: 429 });
  if (limitMap.size > 10000) limitMap.clear();
}
const privateUser = user => ({ id: user.id, username: user.username });
function loginPage() { return `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Conectar conta do jogo</title><body style="font:17px system-ui;max-width:500px;margin:70px auto;padding:20px"><h1>Por Trás da Oferta</h1><p>Faça login com a mesma conta do jogo para autorizar a conexão do assistente.</p><form id="login"><input name="username" autocomplete="username" placeholder="Apelido" required style="padding:12px"><input name="password" type="password" autocomplete="current-password" placeholder="Senha" required style="padding:12px"><button>Entrar</button></form><p id="status"></p><script>document.getElementById('login').onsubmit=async e=>{e.preventDefault();const data=Object.fromEntries(new FormData(e.target));const r=await fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});if(r.ok)location.reload();else document.getElementById('status').textContent=(await r.json()).erro||'Falha no login';};</script></body></html>`; }
function consentPage(ctx) { return `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Autorizar conexão</title><body style="font:17px system-ui;max-width:550px;margin:70px auto;padding:20px"><h1>Conectar ao Por Trás da Oferta</h1><p><b>${escape(ctx.clientName)}</b> está solicitando acesso educativo à conta <b>${escape(ctx.username)}</b>.</p><p>Permissões: <code>${escape(ctx.scopes.join(', '))}</code>. A IA poderá consultar o progresso fictício e analisar anúncios. Ela não poderá alterar o jogo.</p><form method="post" action="/oauth/consent"><input type="hidden" name="pendingId" value="${escape(ctx.id)}"><input type="hidden" name="csrf" value="${escape(ctx.csrf)}"><button name="approve" value="yes">Autorizar</button> <button name="approve" value="no">Recusar</button></form></body></html>`; }
const corsOriginAllowed = req => !req.headers.origin || req.headers.origin === ORIGIN;
const needsOrigin = req => ['POST', 'PUT', 'DELETE'].includes(req.method);
const server = createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer'); res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  const path = new URL(req.url, ORIGIN);
  try {
    if (needsOrigin(req) && !corsOriginAllowed(req)) return send(res, 403, { erro: 'Origin não autorizado.' });
    if (req.method === 'GET' && path.pathname === '/') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }); return res.end(await readFile(html)); }
    if (req.method === 'GET' && path.pathname === '/health') return send(res, 200, { status: 'ok', projeto: 'por-tras-da-oferta', mcp: '/mcp' });
    if (req.method === 'GET' && ['/.well-known/oauth-protected-resource', '/.well-known/oauth-protected-resource/mcp'].includes(path.pathname)) return send(res, 200, metadata('resource'));
    if (req.method === 'GET' && path.pathname === '/.well-known/oauth-authorization-server') return send(res, 200, metadata('oauth'));
    if (CHAT_LOGIN_ENABLED && req.method === 'GET' && path.pathname === '/vincular') {
      const id = path.searchParams.get('pedido') || '';
      const pair = await linkPageInfo(id);
      if (!pair) return page(res, 404, '<!doctype html><html lang="pt-BR"><meta charset="utf-8"><h1>Vinculacao expirada ou invalida</h1><p>Solicite um novo link na conversa.</p></html>');
      // Same-origin HTML form POSTs may otherwise send Origin: null under
      // Referrer-Policy: no-referrer (Fetch specification). Preserve no-referrer
      // globally, but use same-origin only on this short-lived login page.
      // No referrer is sent to other origins, including the pairing secret.
      res.setHeader('Referrer-Policy', 'same-origin');
      return page(res, 200, linkPage(id, pair.username));
    }
    if (CHAT_LOGIN_ENABLED && req.method === 'POST' && path.pathname === '/vincular/entrar') {
      throttle(req, 'chat-link-password', 12);
      if (!(req.headers['content-type'] || '').startsWith('application/x-www-form-urlencoded')) return send(res, 415, { erro: 'Formulario invalido.' });
      const p = new URLSearchParams(await bodyText(req));
      const id = p.get('pedido') || '';
      const username = p.get('username') || '';
      const password = p.get('password') || '';
      const result = await verifyChatLink(id, username, password);
      if (!result.ok) return page(res, 401, linkPage(id, username, 'Dados incorretos ou vinculo expirado. Tente novamente ou solicite outro link.'));
      return page(res, 200, linkCodePage(result.code));
    }
    if (req.method === 'POST' && path.pathname === '/api/register') { throttle(req, 'register', 8); const p = await jsonBody(req); const user = await register(p); const token = await login(p); return send(res, 201, { usuario: user }, { 'Set-Cookie': cookie(token) }); }
    if (req.method === 'POST' && path.pathname === '/api/login') { throttle(req, 'login', 20); const token = await login(await jsonBody(req)); return send(res, 200, { sucesso: true }, { 'Set-Cookie': cookie(token) }); }
    if (req.method === 'POST' && path.pathname === '/api/logout') { await logout(req); return send(res, 200, { sucesso: true }, { 'Set-Cookie': clearCookie }); }
    if (req.method === 'POST' && path.pathname === '/oauth/register') { throttle(req, 'oauth-client', 12); return send(res, 201, await registerClient(await jsonBody(req))); }
    if (req.method === 'GET' && path.pathname === '/oauth/authorize') {
      throttle(req, 'oauth-authorize', 50);
      const ctx = await startAuthorize(path.searchParams, req);
      return page(res, 200, ctx.loginRequired ? loginPage() : consentPage(ctx));
    }
    if (req.method === 'POST' && path.pathname === '/oauth/consent') {
      const params = new URLSearchParams(await bodyText(req));
      return redirect(res, await consent(req, Object.fromEntries(params)));
    }
    if (req.method === 'POST' && path.pathname === '/oauth/token') {
      throttle(req, 'oauth-token', 30);
      return send(res, 200, await exchangeCode(new URLSearchParams(await bodyText(req))), { 'Pragma': 'no-cache' });
    }
    if (path.pathname === '/mcp') {
      if (req.method === 'GET' || req.method === 'DELETE') { res.writeHead(405, { Allow: 'POST', 'Cache-Control': 'no-store' }); return res.end(); }
      if (req.method !== 'POST') return send(res, 405, { erro: 'Método não permitido.' });
      if (!(req.headers['accept'] || '').includes('application/json') && !(req.headers['accept'] || '').includes('*/*')) return send(res, 406, { erro: 'Accept deve incluir application/json e text/event-stream.' });
      const rpc = await jsonBody(req);
      if (CHAT_LOGIN_ENABLED && rpc.method === 'tools/call' && ['iniciar_vinculo','confirmar_vinculo'].includes(rpc.params?.name)) {
        throttle(req, 'chat-link-mcp', 18);
      }
      const result = await handleMcp(req, rpc);
      if (result.httpStatus === 202) { res.writeHead(202, { 'Cache-Control': 'no-store' }); return res.end(); }
      return send(res, result.httpStatus, result.payload, result.challenge ? { 'WWW-Authenticate': result.challenge } : {});
    }
    if (path.pathname.startsWith('/api/')) {
      const session = await sessionOf(req);
      if (!session) return send(res, 401, { erro: 'Faça login.' });
      if (req.method === 'GET' && path.pathname === '/api/me') return send(res, 200, { usuario: privateUser(session.user) });
      if (req.method === 'GET' && path.pathname === '/api/game') return send(res, 200, await read(db => ({ resumo: summarize(session.user, db.choices),
        cenarios: SCENARIOS.map(({ id, title, text, price }) => ({ id, title, text, price })), estrategias: CHAVES_ESTRATEGIAS })));
      if (req.method === 'POST' && path.pathname === '/api/game/choice') {
        const input = await jsonBody(req);
        const result = await update(db => recordChoice(db, session.user, input));
        return send(res, 200, { resultado: result, resumo: await read(db => summarize(session.user, db.choices)) });
      }
      if (req.method === 'POST' && path.pathname === '/api/game/reset') {
        await update(db => { db.choices = db.choices.filter(v => v.userId !== session.user.id); });
        return send(res, 200, { sucesso: true });
      }
      if (req.method === 'POST' && path.pathname === '/api/analisar') return send(res, 200, analisarTextoAnuncio((await jsonBody(req)).texto));
    }
    return send(res, 404, { erro: 'Rota não encontrada.' });
  } catch (e) {
    if (e instanceof SyntaxError) return send(res, 400, { erro: 'JSON inválido.' });
    if (e.status === 429 || e.status === 413) return send(res, e.status, { erro: e.message });
    if (path.pathname === '/oauth/token') return send(res, 400, { error: 'invalid_grant', error_description: e.message });
    console.error('Erro de requisição:', e.message);
    if (!res.headersSent) send(res, 400, { erro: e.message || 'Erro na solicitação.' });
  }
});
server.listen(PORT, HOST, () => { console.log(`Por Trás da Oferta iniciado em ${HOST}:${PORT}; url declarada ${ORIGIN}`); if (!PRODUCTION) console.log('Modo LOCAL; não exponha com PUBLIC_BASE_URL de localhost.'); });
export { server };
