import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { read, update, newToken } from './storage.mjs';
import { ORIGIN, verifyCredentials } from './auth.mjs';
import { brandedPage } from './ui-pages.mjs';

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
  const message = error ? `<p class="alert" role="alert">${esc(error)}</p>` : '';
  const card = `
    <div class="brandline"><span class="brand-symbol">↗</span> POR TRÁS DA OFERTA · MCP</div>
    <h2>Confirme sua identidade.</h2>
    <p class="account-intro">Para conectar seu percurso fictício ao ChatGPT, entre com a mesma conta utilizada no jogo.</p>
    <p class="user-bubble">Conta solicitada: ${esc(username)}</p>
    ${message}
    <form method="post" action="/vincular/entrar">
      <input type="hidden" name="pedido" value="${esc(id)}">
      <label for="vincular-username">Nome de usuário</label>
      <input id="vincular-username" name="username" autocomplete="username" value="${esc(username)}" minlength="3" maxlength="24" pattern="[A-Za-z0-9_.-]+" required>
      <label for="vincular-password">Senha do jogo</label>
      <input id="vincular-password" name="password" type="password" autocomplete="current-password" minlength="10" maxlength="128" placeholder="Sua senha do jogo" required>
      <div class="actions"><button class="primary" type="submit">Confirmar identidade →</button></div>
    </form>
    <div class="account-privacy"><strong>Seus dados continuam protegidos.</strong>
      <p>A senha é verificada somente no servidor. O código mostrado a seguir dura poucos minutos e pode ser usado apenas uma vez. Nunca digite sua senha no ChatGPT.</p>
    </div>`;
  return brandedPage({
    pageTitle: 'Vincular conta ao ChatGPT',
    headline: 'Seu feed.', highlight: 'Sua conta.',
    description: 'Um jogo, muitas escolhas. Conecte seu perfil para consultar apenas os resultados da sua simulação.',
    tag: 'VÍNCULO SEGURO · CHATGPT', card
  });
}

export function linkCodePage(code) {
  const card = `
    <div class="brandline"><span class="brand-symbol">✓</span> POR TRÁS DA OFERTA · MCP</div>
    <h2>Identidade confirmada!</h2>
    <p class="account-intro">Volte para a mesma conversa no ChatGPT e informe somente o código abaixo para concluir o vínculo.</p>
    <div class="code-pill" aria-label="Código temporário de vinculação">${esc(code)}</div>
    <p class="code-help">O código é temporário e funciona uma única vez. Não compartilhe a sua senha. Depois do vínculo, o ChatGPT poderá analisar o percurso da conta autorizada.</p>
    <div class="account-privacy"><strong>Conta autorizada com segurança</strong><p>O código confirma a identidade; ele não é sua senha e não concede acesso permanente ao projeto.</p></div>`;
  return brandedPage({
    pageTitle: 'Código de confirmação do ChatGPT',
    headline: 'Conexão', highlight: 'confirmada.',
    description: 'Seu perfil está pronto para ser vinculado à conversa escolhida.',
    tag: 'CONFIRMAÇÃO · CONTA INDIVIDUAL', card
  });
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
