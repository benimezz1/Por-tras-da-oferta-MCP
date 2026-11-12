import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { register, login, sessionOf, logout, cookie, clearCookie, ORIGIN, RESOURCE, PRODUCTION, metadata, startAuthorize, consent, registerClient, exchangeCode, bearerChallenge } from './auth.mjs';
import { read, update } from './storage.mjs';
import { SCENARIOS, summarize, recordChoice } from './scenarios.mjs';
import { CHAVES_ESTRATEGIAS } from './conhecimento.mjs';
import { analisarTextoAnuncio } from './anuncios.mjs';
import { handleMcp } from './mcp.mjs';
import { brandedPage } from './ui-pages.mjs';
import { importC4, getC4, summarizeC4, C4_MAX_BYTES } from './c4-import.mjs';
import { GAME_ORIGIN, createPlayer, loginPlayer, identifyPlayer, revokePlayer } from './c4-client-auth.mjs';
import { CHAT_LOGIN_ENABLED, linkPageInfo, linkPage, linkCodePage, verifyChatLink } from './chat-auth.mjs';
const HOST = process.env.HOST || '127.0.0.1';
const PORT = Number(process.env.PORT || 3100);
if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) throw Error('Porta inválida');
const html = new URL('../public/index.html', import.meta.url);
const themeCss = new URL('../public/mcp-theme.css', import.meta.url);
const limitMap = new Map();
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
function send(res, status, obj, headers = {}) { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers }); res.end(JSON.stringify(obj)); }
function page(res, status, content) { res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(content); }
function redirect(res, where) { res.writeHead(302, { Location: where, 'Cache-Control': 'no-store' }); res.end(); }
async function bodyText(req, max = 12000) { const chunks = []; let bytes = 0; for await (const chunk of req) { bytes += chunk.length; if (bytes > max) throw Object.assign(Error('Requisição muito grande.'), { status: 413 }); chunks.push(chunk); } return Buffer.concat(chunks).toString('utf8'); }
const jsonBody = async (req, max = 12000) => { if (!(req.headers['content-type'] || '').startsWith('application/json')) throw Error('Use application/json.'); const data = JSON.parse(await bodyText(req, max)); if (!data || typeof data !== 'object' || Array.isArray(data)) throw Error('JSON inválido.'); return data; };
function throttle(req, kind, max = 15) {
  const ip = String(req.headers['cf-connecting-ip'] || req.socket.remoteAddress || 'unknown').slice(0, 100);
  const key = kind + ':' + ip; const now = Date.now(); const item = limitMap.get(key) || { start: now, count: 0 };
  if (now - item.start > 60000) { item.start = now; item.count = 0; }
  item.count++; limitMap.set(key, item);
  if (item.count > max) throw Object.assign(Error('Muitas tentativas. Tente novamente mais tarde.'), { status: 429 });
  if (limitMap.size > 10000) limitMap.clear();
}
const privateUser = user => ({ id: user.id, username: user.username });
function loginPage() {
  const card = `
    <div class="brandline"><span class="brand-symbol">↗</span> POR TRÁS DA OFERTA · MCP</div>
    <h2>Entre com seu perfil.</h2>
    <p class="account-intro">Use o mesmo apelido e senha da conta do jogo para continuar a autorização do assistente.</p>
    <form id="login">
      <label for="oauth-username">Nome de usuário</label>
      <input id="oauth-username" name="username" autocomplete="username" placeholder="Seu apelido do jogo" minlength="3" maxlength="24" required>
      <label for="oauth-password">Senha do jogo</label>
      <input id="oauth-password" name="password" type="password" autocomplete="current-password" placeholder="Sua senha" minlength="10" maxlength="128" required>
      <div class="actions"><button class="primary" type="submit">Entrar e continuar →</button></div>
    </form>
    <p id="status" class="account-status" role="status" aria-live="polite"></p>
    <div class="account-privacy"><strong>Senha só no site seguro</strong><p>Nunca informe sua senha diretamente ao ChatGPT. Ela é usada apenas para autenticar sua conta no servidor.</p></div>
    <script>
      document.getElementById('login').onsubmit = async event => {
        event.preventDefault();
        const status = document.getElementById('status');
        status.textContent = 'Conectando sua conta…';
        const data = Object.fromEntries(new FormData(event.target));
        try {
          const response = await fetch('/api/login', {
            method: 'POST',
            credentials: 'same-origin',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(data)
          });
          if (response.ok) {location.reload();return;}
          const result = await response.json().catch(()=>({}));
          status.textContent = result.erro || 'Não foi possível entrar. Confira seus dados.';
        } catch {
          status.textContent = 'Sem conexão com o servidor. Tente novamente.';
        }
      };
    </script>`;
  return brandedPage({
    pageTitle: 'Entrar para autorizar o ChatGPT',
    headline: 'Seu feed.', highlight: 'Sua conta.',
    description: 'Entre com as credenciais do seu jogo para autorizar a leitura do seu percurso fictício.',
    tag: 'LOGIN SEGURO · CONEXÃO CHATGPT', card
  });
}
function consentPage(ctx) {
  const card = `
    <div class="brandline"><span class="brand-symbol">↗</span> POR TRÁS DA OFERTA · MCP</div>
    <h2>Autorizar conexão?</h2>
    <p class="account-intro"><strong>${escape(ctx.clientName)}</strong> deseja consultar o percurso da conta <strong>${escape(ctx.username)}</strong>.</p>
    <p class="user-bubble">Conta: ${escape(ctx.username)}</p>
    <div class="account-privacy"><strong>O que será compartilhado?</strong><p>Leitura do progresso fictício e análise de anúncios. Permissões: <code>${escape(ctx.scopes.join(', '))}</code>. O assistente não poderá mudar suas decisões no jogo.</p></div>
    <form method="post" action="/oauth/consent">
      <input type="hidden" name="pendingId" value="${escape(ctx.id)}">
      <input type="hidden" name="csrf" value="${escape(ctx.csrf)}">
      <div class="consent-actions actions"><button class="primary" name="approve" value="yes" type="submit">Autorizar leitura</button><button class="secondary" name="approve" value="no" type="submit">Recusar</button></div>
    </form>`;
  return brandedPage({
    pageTitle: 'Autorizar acesso ao ChatGPT',
    headline: 'Escolhas suas.', highlight: 'Acesso seu.',
    description: 'Decida se o assistente pode consultar o histórico fictício que você registrou no jogo.',
    tag: 'VOCÊ CONTROLA OS DADOS · OAUTH', card
  });
}
const isC4Client = path => path.pathname.startsWith('/api/c4/client/');
const corsOriginAllowed = (req,path) => !req.headers.origin || req.headers.origin === ORIGIN ||
  (isC4Client(path) && req.headers.origin === GAME_ORIGIN);
const needsOrigin = req => ['POST', 'PUT', 'DELETE'].includes(req.method);
const server = createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer'); res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  const path = new URL(req.url, ORIGIN);
  try {
    if (isC4Client(path) && req.headers.origin === GAME_ORIGIN) {
      res.setHeader('Access-Control-Allow-Origin', GAME_ORIGIN);
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Max-Age', '600');
      res.setHeader('Vary', 'Origin');
    }
    if (req.method === 'OPTIONS' && isC4Client(path)) {
      if (req.headers.origin !== GAME_ORIGIN && req.headers.origin !== ORIGIN)
        return send(res, 403, { erro: 'Origem não autorizada.' });
      res.writeHead(204, {'Cache-Control':'no-store'});return res.end();
    }
    if (needsOrigin(req) && !corsOriginAllowed(req,path)) return send(res, 403, { erro: 'Origin não autorizado.' });
    if (req.method === 'GET' && path.pathname === '/mcp-theme.css') { res.writeHead(200, { 'Content-Type': 'text/css; charset=utf-8', 'Cache-Control': 'no-store' }); return res.end(await readFile(themeCss)); }
    if (req.method === 'GET' && path.pathname === '/') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }); return res.end(await readFile(html)); }
    if (req.method === 'GET' && path.pathname === '/health') return send(res, 200, { status: 'ok', projeto: 'por-tras-da-oferta', mcp: '/mcp' });
    if (req.method === 'GET' && ['/.well-known/oauth-protected-resource', '/.well-known/oauth-protected-resource/mcp'].includes(path.pathname)) return send(res, 200, metadata('resource'));
    if (req.method === 'GET' && path.pathname === '/.well-known/oauth-authorization-server') return send(res, 200, metadata('oauth'));
    if (CHAT_LOGIN_ENABLED && req.method === 'GET' && path.pathname === '/vincular') {
      const id = path.searchParams.get('pedido') || '';
      const pair = await linkPageInfo(id);
      if (!pair) return page(res, 404, '<!doctype html><html lang="pt-BR"><meta charset="utf-8"><h1>Vinculacao expirada ou invalida</h1><p>Solicite um novo link na conversa.</p></html>');
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
    if (isC4Client(path)) {
      if (req.method === 'POST' && path.pathname === '/api/c4/client/signup') {
        throttle(req,'c4-signup',5);
        return send(res,201,await createPlayer(await jsonBody(req)));
      }
      if (req.method === 'POST' && path.pathname === '/api/c4/client/login') {
        throttle(req,'c4-login',18);
        return send(res,200,await loginPlayer(await jsonBody(req)));
      }
      const identity = await identifyPlayer(req);
      if (!identity) return send(res,401,{erro:'Sessão expirada ou inválida. Entre novamente.'});
      if (req.method === 'GET' && path.pathname === '/api/c4/client/me')
        return send(res,200,{usuario:{id:identity.user.id,username:identity.user.username}});
      if (req.method === 'POST' && path.pathname === '/api/c4/client/logout') {
        await revokePlayer(req);return send(res,200,{sucesso:true});
      }
      if (req.method === 'POST' && path.pathname === '/api/c4/client/complete') {
        throttle(req,'c4-auto-submit',15);
        const payload=await jsonBody(req,C4_MAX_BYTES);
        const estado=payload?.estado,quiz=estado?.quiz;
        const completed=estado?.finished===true&&estado.endStep===3&&
          quiz&&Object.keys(quiz).length===5;
        // O jogador pode escolher enviar o resultado da viagem sem entrar no quiz.
        // Essa via exige a intencao explicita e preserva quiz respondido como 0/5.
        const tripOnly=payload?.modoEnvio==='viagem-sem-quiz'&&
          estado?.finished===true&&estado.day===5&&estado.endStep===0&&
          quiz&&Object.keys(quiz).length===0;
        if(!completed&&!tripOnly)
          return send(res,422,{erro:'Conclua os cinco dias e responda o quiz, ou escolha explicitamente enviar a viagem sem quiz.'});
        const result=await update(db=>importC4(db,identity.user,payload));
        return send(res,result.repetido?200:201,{sucesso:true,importado:result.importado,
          repetido:result.repetido,partida:result.resumo.partida.id,
          quiz:result.resumo.quiz,usuario:{id:identity.user.id,username:identity.user.username}});
      }
      return send(res,404,{erro:'Rota C4 não encontrada.'});
    }
    if (path.pathname.startsWith('/api/')) {
      const session = await sessionOf(req);
      if (!session) return send(res, 401, { erro: 'Faça login.' });
      if (req.method === 'GET' && path.pathname === '/api/me') return send(res, 200, { usuario: privateUser(session.user) });
      if (req.method === 'GET' && path.pathname === '/api/c4/progress') {
        const record = await read(db => getC4(db, session.user));
        return send(res, 200, record ? { importado: true, importadoEm: record.importadoEm, resumo: summarizeC4(session.user, record.document) } : { importado: false, resumo: null });
      }
      if (req.method === 'POST' && path.pathname === '/api/c4/import') {
        throttle(req, 'c4-import', 15);
        const payload = await jsonBody(req, C4_MAX_BYTES);
        const result = await update(db => importC4(db, session.user, payload));
        return send(res, result.repetido ? 200 : 201, result);
      }
      if (req.method === 'POST' && path.pathname === '/api/c4/delete') {
        if ((await jsonBody(req)).confirmar !== true) return send(res, 422, { erro: 'Confirme explicitamente a exclusão do percurso importado.' });
        await update(db => { db.c4Imports = (db.c4Imports||[]).filter(x => x.userId !== session.user.id); });
        return send(res, 200, { excluido: true });
      }
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
    if ([401, 403, 409, 413, 422, 429].includes(e.status)) return send(res, e.status, { erro: e.message });
    if (path.pathname === '/oauth/token') return send(res, 400, { error: 'invalid_grant', error_description: e.message });
    console.error('Erro de requisição:', e.message);
    if (!res.headersSent) send(res, 400, { erro: e.message || 'Erro na solicitação.' });
  }
});
server.listen(PORT, HOST, () => { console.log(`Por Trás da Oferta iniciado em ${HOST}:${PORT}; url declarada ${ORIGIN}`); if (!PRODUCTION) console.log('Modo LOCAL; não exponha com PUBLIC_BASE_URL de localhost.'); });
export { server };
