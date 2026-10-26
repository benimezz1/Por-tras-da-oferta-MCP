import { ESTRATEGIAS } from './conhecimento.mjs';

// Reconhecimento textual simples, deliberadamente conservador.
// Nao substitui a interpretacao da imagem pelo assistente nem a checagem de fatos.
const REGRAS = Object.freeze([
  {
    codigo: 'urgencia',
    expressoes: [/s[oó] hoje/iu, /termina (?:em|hoje|amanh[aã])/iu, /tempo limitado/iu, /oferta rel[aâ]mpago/iu, /[úu]ltimas horas/iu, /compre agora/iu]
  },
  {
    codigo: 'escassez',
    expressoes: [/restam? (?:apenas )?\d+/iu, /[úu]ltimas? unidades?/iu, /estoque limitado/iu, /quase esgotado/iu]
  },
  {
    codigo: 'prova_social',
    expressoes: [/mais vendido/iu, /\d[\d.,]* pessoas? (?:j[aá] )?(?:compraram|avaliaram)/iu, /\d[\d.,]* avalia[çc][õo]es/iu, /aprovado por milhares/iu]
  },
  {
    codigo: 'influenciadores',
    expressoes: [/#publi/iu, /parceria paga/iu, /conte[úu]do patrocinado/iu, /recebi da marca/iu]
  },
  {
    codigo: 'fomo',
    expressoes: [/todo mundo (?:tem|est[aá]|usa|comprou)/iu, /n[aã]o fique de fora/iu, /a tend[êe]ncia do momento/iu, /viralizou/iu]
  },
  {
    codigo: 'descontos',
    expressoes: [/\d{1,2}%\s*(?:off|de desconto)/iu, /de\s*R\$\s*\d+[\d.,]*\s*por\s*R\$\s*\d+[\d.,]*/iu, /metade do pre[çc]o/iu, /superpromo[çc][aã]o/iu]
  }
]);

export function analisarTextoAnuncio(texto) {
  if (typeof texto !== 'string' || !texto.trim() || texto.length > 2500) {
    throw new Error('O texto do anúncio deve ter de 1 a 2.500 caracteres.');
  }
  const sinais = [];
  for (const regra of REGRAS) {
    const trechos = regra.expressoes.map(expressao => texto.match(expressao)?.[0]).filter(Boolean);
    if (trechos.length > 0) {
      sinais.push({
        estrategia: regra.codigo,
        nome: ESTRATEGIAS[regra.codigo].nome,
        trechos_indicativos: [...new Set(trechos)].slice(0, 3),
        explicacao: ESTRATEGIAS[regra.codigo].mecanismo,
        pergunta: ESTRATEGIAS[regra.codigo].pergunta
      });
    }
  }
  return {
    tipo: 'triagem_textual_educativa',
    sinais_possiveis: sinais,
    quantidade_de_categorias: sinais.length,
    estrategias_que_exigem_contexto_visual: [
      'Publicidade personalizada',
      'Padrões comerciais obscuros (dark patterns)'
    ],
    verificacoes_recomendadas: [
      'Comparar o preço final em fontes confiáveis.',
      'Conferir a identificação de publicidade patrocinada e a reputação do vendedor.',
      'Avaliar a necessidade real do produto e a possibilidade de esperar antes de comprar.'
    ],
    limite: 'Identificamos apenas expressões no texto. Não verificamos estoque, preço anterior, autenticidade de depoimentos, confiabilidade do vendedor nem a existência de fraude. Ausência de sinais não significa ausência de persuasão.'
  };
}
