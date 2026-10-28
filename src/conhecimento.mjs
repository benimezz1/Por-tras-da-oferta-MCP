/**
 * Biblioteca educativa. Base conceitual: Relatorio Final - C3, secoes 2, 3 e 5.
 * Sao possibilidades de influencia, nao diagnosticos nem afirmacoes de causalidade.
 */
export const ESTRATEGIAS = Object.freeze({
  urgencia: {
    nome: 'Urgência',
    mecanismo: 'Uma limitação temporal pode aumentar a sensação de perda de oportunidade e acelerar a decisão.',
    exemplo: 'Oferta termina hoje!',
    pergunta: 'Eu desejaria comprar esse produto se não houvesse contagem regressiva?',
    referencias: ['Feng et al. (2024)', 'Entrevista com psicóloga no Relatório C3']
  },
  escassez: {
    nome: 'Escassez',
    mecanismo: 'Informações sobre pouca disponibilidade podem aumentar o valor percebido e a pressão para escolher.',
    exemplo: 'Restam apenas duas unidades.',
    pergunta: 'A limitação de estoque foi demonstrada ou é apenas uma alegação comercial?',
    referencias: ['Feng et al. (2024)']
  },
  prova_social: {
    nome: 'Prova social',
    mecanismo: 'Curtidas, depoimentos e avaliações podem servir como pistas de confiança ou popularidade.',
    exemplo: 'Mais de 10 mil pessoas já compraram.',
    pergunta: 'Essas avaliações são confiáveis e representam experiências reais?',
    referencias: ['Huang et al. (2025)']
  },
  influenciadores: {
    nome: 'Influenciadores',
    mecanismo: 'A proximidade percebida com um criador pode aumentar a confiança na indicação.',
    exemplo: 'Meu produto favorito! #publi',
    pergunta: 'A recomendação é espontânea, patrocinada ou uma mistura das duas?',
    referencias: ['Shamim, Azam e Islam (2024)', 'De Jans et al. (2020)']
  },
  personalizacao: {
    nome: 'Publicidade personalizada',
    mecanismo: 'Anúncios baseados em interesses anteriores podem parecer mais relevantes e chamar atenção.',
    exemplo: 'Promoção de um item semelhante ao pesquisado ontem.',
    pergunta: 'Estou considerando a compra por necessidade ou por exposição repetida?',
    referencias: ['Setyani et al. (2019)']
  },
  fomo: {
    nome: 'FOMO e pertencimento',
    mecanismo: 'O receio de ficar de fora de uma tendência pode aumentar o desejo de consumir.',
    exemplo: 'Todo mundo está usando. Não fique de fora!',
    pergunta: 'Eu ainda gostaria deste produto se ninguém do meu grupo o tivesse?',
    referencias: ['Dinh e Lee (2024)']
  },
  descontos: {
    nome: 'Apresentação de preços e descontos',
    mecanismo: 'O modo de apresentar o preço pode alterar a percepção de oportunidade e recompensa imediata.',
    exemplo: 'De R$ 300 por R$ 149!',
    pergunta: 'O preço final e o valor de referência são verificáveis?',
    referencias: ['Bandyopadhyay et al. (2021)']
  },
  padroes_obscuros: {
    nome: 'Padrões comerciais obscuros (dark patterns)',
    mecanismo: 'A organização da interface pode direcionar escolhas, por exemplo por opções pré-selecionadas e custos revelados tarde.',
    exemplo: 'Uma assinatura aparece marcada sem escolha explícita do usuário.',
    pergunta: 'As opções de recusa, cancelamento e preço total são claras e acessíveis?',
    referencias: ['OCDE (2022)']
  }
});

export const CHAVES_ESTRATEGIAS = Object.freeze(Object.keys(ESTRATEGIAS));

export function listarEstrategias() {
  return Object.entries(ESTRATEGIAS).map(([codigo, estrategia]) => ({ codigo, nome: estrategia.nome }));
}

export function obterEstrategia(codigo) {
  if (!Object.hasOwn(ESTRATEGIAS, codigo)) {
    throw new Error('Estratégia não reconhecida.');
  }
  return { codigo, ...ESTRATEGIAS[codigo] };
}
