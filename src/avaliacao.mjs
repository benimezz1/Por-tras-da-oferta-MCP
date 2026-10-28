import { analisarTextoAnuncio } from './anuncios.mjs';

export function avaliarCompra({ anuncio, preco, orcamento, necessidade = 'nao_sei' }) {
  const p = Number(preco);
  const o = Number(orcamento);
  if (typeof anuncio !== 'string' || !anuncio.trim() || anuncio.length > 2500) throw new Error('Anúncio inválido.');
  if (!Number.isFinite(p) || p < 0 || !Number.isFinite(o) || o < 0) throw new Error('Preço e orçamento devem ser valores positivos ou zero.');
  if (!['necessario', 'desejo', 'nao_sei'].includes(necessidade)) throw new Error('Necessidade inválida.');
  const analise = analisarTextoAnuncio(anuncio);
  const sobra = Math.round((o-p)*100)/100;
  const percentual = o === 0 ? null : Math.round(p/o*1000)/10;
  return {
    tipo: 'simulacao_educativa',
    analise,
    simulacao: { preco: p, orcamento: o, sobra, percentual_do_orcamento: percentual, dentro_do_orcamento: p <= o, necessidade_autodeclarada: necessidade },
    reflexoes: [
      'Eu compraria este produto se o anúncio não tivesse urgência ou promoção?',
      'Há outras opções que atendem à mesma necessidade?',
      necessidade === 'desejo' ? 'Posso esperar 24 horas antes de decidir?' : 'Posso verificar informações independentes sobre qualidade e preço?',
      'O preço total, as condições e o vendedor foram conferidos?'
    ],
    limite: 'Simulação educativa, não aconselhamento financeiro individual, verificação de preço ou diagnóstico de comportamento.'
  };
}
