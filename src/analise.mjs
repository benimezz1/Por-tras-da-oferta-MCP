const categorias = [
  { codigo:'urgencia', nome:'Urgência', padroes:[/s[oó] hoje/iu,/termina (?:hoje|amanh[aã])/iu,/tempo limitado/iu,/compre agora/iu,/oferta rel[aâ]mpago/iu], reflexao:'Eu compraria sem o prazo?' },
  { codigo:'escassez', nome:'Escassez', padroes:[/[úu]ltimas? unidades?/iu,/restam? (?:apenas )?\d+/iu,/estoque limitado/iu], reflexao:'A disponibilidade foi realmente comprovada?' },
  { codigo:'prova_social', nome:'Prova social', padroes:[/mais vendido/iu,/milhares de clientes/iu,/\d[\d.,]* avalia[çc][õo]es/iu], reflexao:'Essas avaliações são independentes e confiáveis?' },
  { codigo:'influenciadores', nome:'Influenciadores', padroes:[/#publi/iu,/parceria paga/iu,/conte[úu]do patrocinado/iu], reflexao:'A recomendação é patrocinada?' },
  { codigo:'fomo', nome:'FOMO e pertencimento', padroes:[/todo mundo (?:tem|usa|comprou|est[aá])/iu,/n[aã]o fique de fora/iu,/viralizou/iu], reflexao:'Eu desejaria isso sem a pressão do grupo?' },
  { codigo:'descontos', nome:'Descontos e enquadramento de preço', padroes:[/\d{1,2}%\s*(?:off|de desconto)/iu,/de\s*R\$\s*\d+[\d.,]*\s*por\s*R\$\s*\d+[\d.,]*/iu,/metade do pre[çc]o/iu], reflexao:'O desconto se baseia em um preço anterior real?' }
];
export const estrategias = Object.freeze([
  ...categorias.map(({codigo,nome,reflexao})=>({codigo,nome,reflexao})),
  {codigo:'personalizacao',nome:'Publicidade personalizada',reflexao:'Por que este anúncio apareceu para mim?'},
  {codigo:'padroes_obscuros',nome:'Dark patterns',reflexao:'A interface facilita recusar ou cancelar?'}
]);
export function analisar(texto) {
  if(typeof texto!=='string'||!texto.trim()||texto.length>2500)throw Error('O anúncio precisa ter entre 1 e 2500 caracteres.');
  const sinais=categorias.flatMap(c=>{
    const trechos=[...new Set(c.padroes.map(p=>texto.match(p)?.[0]).filter(Boolean))];
    return trechos.length?[{codigo:c.codigo,nome:c.nome,trechos,reflexao:c.reflexao}]:[];
  });
  return {sinais,quantidade:sinais.length,limite:'Triagem educativa de palavras. Não comprova fraude, estoque, desconto, intenção do vendedor ou ausência de persuasão.'};
}
export function avaliar({anuncio,preco,orcamento,necessidade='nao_sei'}) {
  const p=Number(preco),o=Number(orcamento);
  if(!Number.isFinite(p)||p<0||!Number.isFinite(o)||o<0)throw Error('Preço e orçamento devem ser números não negativos.');
  if(!['desejo','necessario','nao_sei'].includes(necessidade))throw Error('Classificação inválida.');
  return {analise:analisar(anuncio),simulacao:{preco:p,orcamento:o,saldo:Math.round((o-p)*100)/100,cabe_no_orcamento:p<=o,percentual:o===0?null:Math.round(p/o*1000)/10},
  perguntas:['Eu compraria sem esta oferta?', 'Comparei o preço com outras lojas?', necessidade==='desejo'?'Posso esperar antes de decidir?':'É uma necessidade real agora?', 'Conheço o preço final e a reputação do vendedor?'],
  limite:'Uma simulação de orçamento fictício não constitui orientação financeira individual.'};
}
