/* Contrato do percurso C4 ("Semana ate a viagem") importado voluntariamente.
 * Nao autentica a autoria do arquivo: so a conta receptora e autenticada.
 * Os indicadores descrevem uma simulacao, nunca um diagnostico do jogador. */
const FORMAT = 'por-tras-da-oferta/c4-semana';
const CAMPAIGN = 'semana-ate-a-viagem';
const MAX_BYTES = 1024 * 1024;
const KEYS = ['urgencia','escassez','prova_social','influencia','personalizacao',
  'fomo','preco','dark_patterns','recompensa','emocao'];
const NAMES = ['Urgência','Escassez','Prova social','Influenciadores','Personalização',
  'FOMO','Âncora de preço e parcelamento','Padrões obscuros','Recompensa imediata','Gatilho emocional'];
const PRODUCTS = ['fone','tenis','plano','mochila','powerbank','garrafa','luminaria','ingresso'];
const obj = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const arr = x => Array.isArray(x) ? x : [];
const n = x => typeof x === 'number' && Number.isFinite(x) ? x : 0;
const round = x => Math.round((n(x) + Number.EPSILON) * 100) / 100;
const problem = (message, status = 422) => { throw Object.assign(new Error(message), { status }); };
function walk(value) {
  const stack = [[value,0]]; let nodes = 0;
  while(stack.length) {
    const [v, depth] = stack.pop();
    if (++nodes > 20000 || depth > 16) problem('O arquivo possui estrutura excessiva.');
    if (typeof v === 'string' && v.length > 6000) problem('Texto excessivamente longo no arquivo.');
    if (typeof v === 'number' && !Number.isFinite(v)) problem('Número inválido.');
    if (Array.isArray(v)) {
      if (v.length > 3000) problem('Lista excessivamente longa.');
      for (const x of v) stack.push([x,depth+1]);
    } else if (obj(v)) {
      const entries = Object.entries(v);
      if (entries.length > 500) problem('Objeto excessivamente grande.');
      if (entries.some(([k]) => ['__proto__','constructor','prototype'].includes(k))) problem('Chave JSON não permitida.');
      for (const [,x] of entries) stack.push([x,depth+1]);
    }
  }
}
function validate(payload) {
  if (!obj(payload)) problem('O arquivo precisa conter um objeto JSON.');
  if (Buffer.byteLength(JSON.stringify(payload), 'utf8') > MAX_BYTES) problem('Arquivo maior que 1 MB.', 413);
  walk(payload);
  if (payload.formato !== FORMAT || payload.versao !== 1 || payload.campanha !== CAMPAIGN || payload.simulado !== true)
    problem('O JSON não corresponde à campanha Semana até a viagem (versão 1).');
  if (!obj(payload.sessao) || !obj(payload.estado)) problem('Dados da sessão ou do jogo ausentes.');
  const s = payload.estado;
  if (s.version !== 4 || s.started !== true || typeof s.finished !== 'boolean' ||
    !Number.isInteger(s.day) || s.day < 1 || s.day > 5 ||
    !Number.isInteger(s.phase) || s.phase < 0 || s.phase > 15 ||
    !Number.isInteger(s.endStep) || s.endStep < 0 || s.endStep > 3)
    problem('Estado da campanha C4 inconsistente.');
  if (typeof s.runId !== 'string' || !/^[a-zA-Z0-9_-]{12,100}$/.test(s.runId) ||
    payload.sessao.id !== s.runId) problem('Identificador da partida inválido.');
  if (!Number.isFinite(s.wallet) || s.wallet < 0 || s.wallet > 5000 || s.goal !== 400 ||
    !Number.isFinite(s.coins) || s.coins < 0 || s.coins > 10000)
    problem('Valores fictícios fora do formato esperado.');
  // A semana completa tem 5 x 7 posts/anuncios, 25 eventos e 5 viradas de dia.
// O limite 58 pertence apenas ao stream comercial, nao ao historico integral.
for (const [field,max] of [['feedItems',65],['purchases',100],['viewed',100],['liked',300],
    ['likedAds',300],['bookmarks',300],['cart',20],['events',1200],['notifs',40],
    ['fixes',100],['invoice',100],['subscriptions',30]]) {
    if (!Array.isArray(s[field]) || s[field].length > max)
      problem('Dados de '+field+' ausentes ou fora do limite.');
  }
  if (!obj(s.pressure) || !obj(s.pressure.exposed) || !obj(s.pressure.influenced) ||
    !obj(s.pressure.moments) || !obj(s.algorithm) || !Array.isArray(s.algorithm.events) ||
    s.algorithm.events.length > 450 || !obj(s.vibe) || !Array.isArray(s.vibe.log) ||
    s.vibe.log.length > 160 || !obj(s.quiz)) problem('Dados de estratégias, algoritmo ou quiz inválidos.');
  if (typeof s.personalized !== 'boolean') problem('Configuração de personalização inválida.');
  if (Object.keys(s.quiz).some(k => !/^q[0-4]$/.test(k) || !KEYS.includes(s.quiz[k])))
    problem('Respostas do quiz inválidas.');
  for(const key of KEYS) {
    const count = s.pressure.exposed[key];
    if (!Number.isInteger(count) || count < 0 || count > 100000 ||
      !Array.isArray(s.pressure.influenced[key]) || s.pressure.influenced[key].length > 8 ||
      !Array.isArray(s.pressure.moments[key]) || s.pressure.moments[key].length > 8 ||
      [...s.pressure.moments[key],...s.pressure.influenced[key]].some(v => typeof v !== 'string' || v.length > 160))
      problem('Registro de estratégia '+key+' inválido.');
  }
  for (const item of s.purchases) {
    if (!obj(item) || !PRODUCTS.includes(item.id) ||
      typeof item.method !== 'string' || item.method.length > 32 ||
      !Number.isFinite(item.cost) || item.cost < 0 || item.cost > 5000)
      problem('Compra fictícia inválida.');
  }
  for(const c of s.invoice) {
    if(!obj(c) || !Number.isFinite(c.dueNow) || c.dueNow < 0 || c.dueNow > 5000 ||
      !Number.isFinite(c.future) || c.future < 0 || c.future > 20000)
      problem('Fatura fictícia inválida.');
  }
  for(const c of s.subscriptions) {
    if(!obj(c) || typeof c.active !== 'boolean' || !Number.isFinite(c.monthly) ||
      c.monthly < 0 || c.monthly > 1000) problem('Assinatura fictícia inválida.');
  }
  if (typeof payload.exportadoEm !== 'string' || !Number.isFinite(Date.parse(payload.exportadoEm)))
    problem('Data de exportação inválida.');
  for(const field of ['iniciadaEm','concluidaEm']) {
    const val=payload.sessao[field];
    if(val!==null && val!==undefined && (typeof val!=='string' || !Number.isFinite(Date.parse(val))))
      problem('Data da sessão inválida.');
  }
  return {
    formato:FORMAT,versao:1,campanha:CAMPAIGN,exportadoEm:payload.exportadoEm,
    sessao:{id:s.runId,iniciadaEm:payload.sessao.iniciadaEm||null,
      concluidaEm:payload.sessao.concluidaEm||null},
    simulado:true,estado:s
  };
}
const valueSum=(rows,key)=>round(arr(rows).reduce((sum,v)=>sum+n(v?.[key]),0));
function strategyRows(estado) {
  return KEYS.map((key,i)=>{
    const exp=n(estado.pressure.exposed[key]);
    const actions=arr(estado.pressure.influenced[key]);
    return {
      codigo:key,nome:NAMES[i],exposicoes:exp,acoesInfluenciadas:actions.length,
      ondeApareceu:arr(estado.pressure.moments[key]).slice(-8),
      oQueAconteceu:actions.slice(-8),
      indice:actions.length*3+Math.min(exp,8)*0.25,ordem:i
    };
  }).sort((a,b)=>b.indice-a.indice||b.exposicoes-a.exposicoes||a.ordem-b.ordem)
    .map(({indice,ordem,...r})=>r);
}
function quizRows(estado) {
  const ranked = strategyRows(estado);
  const chosen=ranked.filter(x=>x.exposicoes>0).slice(0,5).map(x=>x.codigo);
  for(const k of KEYS){if(chosen.length>=5)break;if(!chosen.includes(k))chosen.push(k);}
  return chosen.map((key,i)=>{
    const selecionada=Object.prototype.hasOwnProperty.call(estado.quiz,'q'+i)?estado.quiz['q'+i]:null;
    return {pergunta:i+1,estrategiaCorreta:key,escolhida:selecionada,acertou:selecionada===null?null:selecionada===key};
  });
}
export function summarizeC4(user, doc) {
  const s=doc.estado;
  const dueNow=valueSum(s.invoice,'dueNow'), future=valueSum(s.invoice,'future');
  const monthly=valueSum(s.subscriptions.filter(x=>x.active),'monthly');
  const available=round(s.wallet-dueNow-monthly);
  const travelled=available>=s.goal;
  const purchases=arr(s.purchases);
  const strategies=strategyRows(s), quiz=quizRows(s);
  const feed=arr(s.feedItems);
  const events=arr(s.algorithm.events);
  const counts=Object.create(null), topics=Object.create(null);
  for(const ev of events){if(typeof ev.type==='string'&&ev.type.length<40)counts[ev.type]=(counts[ev.type]||0)+1;
    if(PRODUCTS.includes(ev.topic))topics[ev.topic]=(topics[ev.topic]||0)+1;}
  return {
    campanha:CAMPAIGN,formato:FORMAT,versao:1,
    participante:{id:user.id,apelido:user.username},
    partida:{id:doc.sessao.id,iniciadaEm:doc.sessao.iniciadaEm,concluidaEm:doc.sessao.concluidaEm,
      exportadaEm:doc.exportadoEm,concluida:s.finished,diaAtual:s.day,etapaFinal:s.endStep},
    economia:{saldoInicial:620,metaViagem:s.goal,saldoAtual:round(s.wallet),
      valorFaturaSabado:dueNow,parcelasFuturas:future,assinaturasAtivasMensais:monthly,
      disponivelParaViagem:available,viagemFoiPossivel:travelled,
      faltaParaViagem:travelled?0:round(s.goal-available),
      gastoTotalSimulado:round(620-s.wallet+dueNow+future+monthly),moedas:s.coins},
    consumo:{compras:purchases.length,produtosVistos:s.viewed.length,curtidas:s.liked.length,
      curtidasEmAnuncios:s.likedAds.length,carrinhoAtual:s.cart,comprasPorProduto:purchases.map(p=>({
        id:p.id,produto:String(p.name||p.id).slice(0,120),dia:p.day||null,
        metodo:p.method,valor:round(p.cost)}))},
    experiencia:{conteudosExibidos:feed.length,publicacoes:feed.filter(p=>p.kind==='post').length,
      anuncios:feed.filter(p=>p.kind==='ad').length,
      eventosDeRoteiro:feed.filter(p=>p.kind!=='post'&&p.kind!=='ad').length,
      storiesAbertos:arr(s.stories).length,notificacoes:s.notifs.length,
      eventosRegistrados:s.events.length,alternativas:s.fixes.length},
    estrategias:strategies,estrategiasQueInfluenciaram:strategies.filter(p=>p.acoesInfluenciadas>0).length,
    quiz:{total:5,respondidas:quiz.filter(q=>q.escolhida!==null).length,
      acertos:quiz.filter(q=>q.acertou===true).length,questoes:quiz},
    vibe:{atual:round(s.vibe.value),registros:s.vibe.log.length,
      ultimo:s.vibe.log.at(-1)||null},
    algoritmo:{personalizacaoAtiva:s.personalized,interacoes:events.length,
      eventosPorTipo:counts,temas:topics},
    observacao:'Dados de uma simulacao educativa ficticia, importados voluntariamente. Nao comprovam identidade do jogador ou comportamento real; nao representam diagnostico.'
  };
}
export function importC4(db,user,input) {
  const doc=validate(input);
  db.c4Imports ||= [];
  const prior=db.c4Imports.find(x=>x.userId===user.id);
  if(prior?.document.sessao.id===doc.sessao.id && prior.document.exportadoEm===doc.exportadoEm)
    return {importado:false,repetido:true,resumo:summarizeC4(user,prior.document)};
  if(prior?.document.sessao.id===doc.sessao.id && Date.parse(prior.document.exportadoEm)>Date.parse(doc.exportadoEm))
    problem('Existe uma exportação mais recente desta mesma partida.',409);
  const record={userId:user.id,document:doc,importadoEm:new Date().toISOString()};
  db.c4Imports=db.c4Imports.filter(x=>x.userId!==user.id);
  db.c4Imports.push(record);
  return {importado:true,repetido:false,resumo:summarizeC4(user,doc)};
}
export function getC4(db,user) {return (db.c4Imports||[]).find(x=>x.userId===user.id)||null;}
export function detailC4(user,record,section='resumo') {
  if(!record)return null;
  const summary=summarizeC4(user,record.document),state=record.document.estado;
  if(section==='resumo')return summary;
  if(section==='economia')return {economia:summary.economia,compras:state.purchases,
    faturas:state.invoice,assinaturas:state.subscriptions,cupons:state.coupons,
    correcoesEAlternativas:state.fixes};
  if(section==='estrategias')return {estrategias:summary.estrategias};
  if(section==='quiz')return summary.quiz;
  if(section==='vibe')return {resumo:summary.vibe,linhaDoTempo:state.vibe.log};
  if(section==='algoritmo')return {resumo:summary.algoritmo,
    interacoes:state.algorithm.events,impressoes:Object.keys(state.algorithm.impressions||{}).length};
  if(section==='jornada')return {resumo:summary.partida,feed:state.feedItems,
    eventos:state.events,stories:state.stories,notificacoes:state.notifs};
  if(section==='interacoes')return {visto:state.viewed,curtidas:state.liked,
    curtidasEmAnuncios:state.likedAds,salvos:state.bookmarks,
    ocultados:state.hiddenPosts,conversas:state.threads,avaliacoes:state.reviews};
  problem('Seção não reconhecida.');
}
export const C4_FORMAT=FORMAT;
export const C4_MAX_BYTES=MAX_BYTES;
