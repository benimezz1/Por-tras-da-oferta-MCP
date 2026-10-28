import { ESTRATEGIAS } from './conhecimento.mjs';
export const BUDGET = 500;
export const SCENARIOS = Object.freeze([
  { id: 'fone', title: 'Oferta relâmpago de fones', text: 'Só hoje! Últimas 3 unidades. 50% de desconto nos fones!', price: 180, signals: ['urgencia', 'escassez', 'descontos'] },
  { id: 'tenis', title: 'O tênis que viralizou', text: 'Todo mundo está usando! Não fique de fora desta tendência. #publi', price: 245, signals: ['fomo', 'influenciadores'] },
  { id: 'curso', title: 'O curso mais vendido', text: 'Mais vendido! Milhares de clientes recomendam. Preço especial: R$ 129.', price: 129, signals: ['prova_social'] },
  { id: 'assinatura', title: 'Assinatura com seleção automática', text: 'Plano mensal R$ 35; na tela de pagamento uma opção de serviço extra aparece pré-selecionada.', price: 35, signals: ['padroes_obscuros'] }
]);
export function summarize(user, choices) {
  const records = choices.filter(v => v.userId === user.id);
  const gasto = records.filter(v => v.buy).reduce((s, v) => s + SCENARIOS.find(x => x.id === v.scenarioId).price, 0);
  const acertos = records.filter(v => v.correct);
  const revisao = [...new Set(records.filter(v => !v.correct).flatMap(v => SCENARIOS.find(x => x.id === v.scenarioId).signals))];
  return {
    participante: { id: user.id, apelido: user.username },
    orcamento_ficticio: BUDGET, gasto_ficticio: gasto, saldo_ficticio: BUDGET - gasto,
    fases_concluidas: records.length, acertos: acertos.length,
    estrategias_para_revisar: revisao.map(code => ({ codigo: code, nome: ESTRATEGIAS[code].nome })),
    escolhas: records.map(v => ({ fase: v.scenarioId, comprou: v.buy, estrategia_escolhida: v.guess, reconheceu: v.correct })),
    observacao: 'São escolhas simuladas. Isto não é diagnóstico de consumismo nem avaliação do comportamento real.'
  };
}
export function recordChoice(state, user, input) {
  const scenario = SCENARIOS.find(x => x.id === input.scenarioId);
  if (!scenario) throw Error('Fase desconhecida.');
  if (typeof input.buy !== 'boolean') throw Error('Escolha de compra inválida.');
  if (!Object.hasOwn(ESTRATEGIAS, input.guess)) throw Error('Estratégia inválida.');
  const correct = scenario.signals.includes(input.guess);
  state.choices = state.choices.filter(v => v.userId !== user.id || v.scenarioId !== scenario.id);
  state.choices.push({ userId: user.id, scenarioId: scenario.id, buy: input.buy, guess: input.guess, correct, recordedAt: Date.now() });
  return { correto: correct, explicacao: correct ? 'Boa identificação: o anúncio usa esta estratégia.' : 'Reveja os elementos da oferta e compare com outras estratégias.',
    estrategias_presentes: scenario.signals.map(code => ({ codigo: code, nome: ESTRATEGIAS[code].nome, mecanismo: ESTRATEGIAS[code].mecanismo })) };
}
