import test from 'node:test';import assert from 'node:assert/strict';import {analisar,avaliar,estrategias} from '../src/analise.mjs';
test('oito estratégias educativas',()=>assert.equal(estrategias.length,8));
test('sinais no anúncio',()=>assert.deepEqual(analisar('Só hoje! Últimas unidades. 50% de desconto.').sinais.map(s=>s.codigo),['urgencia','escassez','descontos']));
test('anúncio neutro não vira fraude',()=>assert.equal(analisar('Livro de capa dura').quantidade,0));
test('orçamento fictício',()=>assert.equal(avaliar({anuncio:'Só hoje',preco:120,orcamento:100}).simulacao.saldo,-20));
test('entradas inválidas são recusadas',()=>assert.throws(()=>avaliar({anuncio:'Livro',preco:-1,orcamento:100})));
