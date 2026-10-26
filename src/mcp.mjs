import { authenticateBearer, bearerChallenge } from './auth.mjs';
import { read } from './storage.mjs';
import { summarize } from './scenarios.mjs';
import { analisarTextoAnuncio } from './anuncios.mjs';
import { avaliarCompra } from './avaliacao.mjs';
import { CHAVES_ESTRATEGIAS, obterEstrategia, listarEstrategias } from './conhecimento.mjs';
const oauth = scopes => [{ type: 'oauth2', scopes }];
const schema = (properties = {}, required = []) => ({ type: 'object', properties, required, additionalProperties: false });
const stringField = (desc, length = 2500) => ({ type: 'string', minLength: 1, maxLength: length, description: desc });
const TOOLS = [
  { name: 'get_profile', title: 'Identificar participante conectado', description: 'Retorna identidade estável da conta autenticada do jogo. Use para confirmar que está ajudando a pessoa correta.',
    inputSchema: schema(), outputSchema: schema({ id: { type: 'string' }, name: { type: 'string' }, nickname: { type: 'string' } }, ['id']),
    securitySchemes: oauth(['profile.read']), _meta: { 'openai/profile': true }, requiredScopes: ['profile.read'] },
  { name: 'consultar_progresso', title: 'Consultar progresso no jogo', description: 'Leia exclusivamente os resultados fictícios da pessoa autenticada, sem solicitar nome ou código de outro participante. Use os pontos de revisão para orientar explicações personalizadas; não diagnostique consumismo.',
    inputSchema: schema(), securitySchemes: oauth(['game.read']), requiredScopes: ['game.read'] },
  { name: 'analisar_anuncio', title: 'Identificar persuasão em anúncio', description: 'Analise texto do anúncio, reconhecendo indícios de urgência, escassez, FOMO, prova social e outros. Para anúncios em imagens, primeiro extraia ou descreva o texto visível na imagem. A ferramenta não comprova fraude nem autenticidade.',
    inputSchema: schema({ texto: stringField('Texto do anúncio ou descrição fiel do conteúdo visual.') }, ['texto']), securitySchemes: oauth(['offer.analyze']), requiredScopes: ['offer.analyze'] },
  { name: 'avaliar_compra', title: 'Refletir sobre decisão de compra', description: 'Compara preço com orçamento fictício e propõe perguntas críticas. Não recomenda comprar nem substitui análise independente de preços.',
    inputSchema: schema({ anuncio: stringField('Texto do anúncio.'), preco: { type: 'number', minimum: 0 }, orcamento: { type: 'number', minimum: 0 }, necessidade: { type: 'string', enum: ['necessario', 'desejo', 'nao_sei'] } }, ['anuncio', 'preco', 'orcamento']),
    securitySchemes: oauth(['offer.analyze']), requiredScopes: ['offer.analyze'] },
  { name: 'explicar_estrategia', title: 'Explicar estratégia psicológica', description: 'Explica um conceito estudado no Relatório C3, trazendo mecanismo, exemplo e pergunta educativa.',
    inputSchema: schema({ codigo: { type: 'string', enum: CHAVES_ESTRATEGIAS } }, ['codigo']), securitySchemes: oauth(['offer.analyze']), requiredScopes: ['offer.analyze'] }
];
export const TOOL_DESCRIPTORS = TOOLS.map(({ requiredScopes, ...rest }) => ({ ...rest, annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false }, _meta: { ...(rest._meta || {}), securitySchemes: rest.securitySchemes } }));
const ok = data => ({ content: [{ type: 'text', text: JSON.stringify(data, null, 2) }], structuredContent: data });
const err = msg => ({ isError: true, content: [{ type: 'text', text: msg }] });
export async function handleMcp(req, body) {
  const auth = await authenticateBearer(req);
  if (!auth) return { httpStatus: 401, challenge: bearerChallenge(), payload: { error: 'unauthorized', message: 'Vincule sua conta do jogo por OAuth.' } };
  if (!body || typeof body !== 'object' || Array.isArray(body) || body.jsonrpc !== '2.0' || typeof body.method !== 'string') return { httpStatus: 400, payload: { error: 'invalid_request' } };
  const modern = body.params?._meta?.['io.modelcontextprotocol/protocolVersion'] === '2026-07-28';
  const claimed = req.headers['mcp-protocol-version'];
  if (claimed && !['2026-07-28', '2025-11-25', '2025-06-18', '2025-03-26'].includes(claimed)) {
    return { httpStatus: 400, payload: { jsonrpc: '2.0', id: body.id ?? null, error: { code: -32022, message: 'Unsupported protocol version', data: { requested: claimed, supported: ['2026-07-28', '2025-11-25'] } } } };
  }
  if (body.id === undefined || body.id === null) return { httpStatus: 202 };
  let result, error;
  try {
    if (body.method === 'server/discover') {
      if (!modern) throw Error('Esta descoberta requer o protocolo 2026-07-28.');
      result = { resultType: 'complete', supportedVersions: ['2026-07-28'], capabilities: { tools: { listChanged: false } },
        instructions: 'Consulte o progresso do participante autenticado antes de orientar escolhas. Nunca trate uma simulação como diagnóstico.' };
    } else if (body.method === 'initialize') {
      result = { protocolVersion: ['2025-11-25','2025-06-18','2025-03-26'].includes(body.params?.protocolVersion) ? body.params.protocolVersion : '2025-11-25',
        capabilities: { tools: { listChanged: false } }, serverInfo: { name: 'por-tras-da-oferta', version: '0.2.0' },
        instructions: 'Ferramentas educativas. Consulte apenas o perfil autenticado e apresente limitações das análises.' };
    } else if (body.method === 'ping') result = {};
    else if (body.method === 'tools/list') result = { tools: TOOL_DESCRIPTORS };
    else if (body.method === 'tools/call') {
      const name = body.params?.name;
      const tool = TOOLS.find(t => t.name === name);
      if (!tool) throw Error('Ferramenta desconhecida.');
      if (!tool.requiredScopes.every(scope => auth.scopes.includes(scope))) {
        result = { ...err('Permissão insuficiente. Autorize novamente a conta do jogo.'),
          _meta: { 'mcp/www_authenticate': [`${bearerChallenge()}, error="insufficient_scope", error_description="Permissao adicional necessaria"`] } };
      } else {
        const a = body.params?.arguments || {};
        if (!a || typeof a !== 'object' || Array.isArray(a)) throw Error('Argumentos inválidos.');
        if (name === 'get_profile') result = ok({ id: auth.user.id, name: auth.user.username, nickname: auth.user.username });
        if (name === 'consultar_progresso') result = ok(await read(db => summarize(auth.user, db.choices)));
        if (name === 'analisar_anuncio') result = ok(analisarTextoAnuncio(a.texto));
        if (name === 'avaliar_compra') result = ok(avaliarCompra(a));
        if (name === 'explicar_estrategia') result = ok(a.codigo ? obterEstrategia(a.codigo) : listarEstrategias());
      }
    } else { error = { code: -32601, message: 'Método não implementado.' }; }
  } catch (e) { result = body.method === 'tools/call' ? err(e.message) : undefined; if (!result) error = { code: -32602, message: e.message }; }
  const payload = { jsonrpc: '2.0', id: body.id };
  if (error) payload.error = error; else payload.result = result;
  if (modern && payload.result && typeof payload.result === 'object') payload.result._meta = { ...payload.result._meta, 'io.modelcontextprotocol/serverInfo': { name: 'por-tras-da-oferta', version: '0.2.0' } };
  return { httpStatus: 200, payload };
}
