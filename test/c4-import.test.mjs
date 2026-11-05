import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { importC4, getC4, summarizeC4, detailC4 } from '../src/c4-import.mjs';

const keys=['urgencia','escassez','prova_social','influencia','personalizacao',
  'fomo','preco','dark_patterns','recompensa','emocao'];
function payload(session='c4-sessao-teste-12345') {
  return {
    formato:'por-tras-da-oferta/c4-semana',versao:1,campanha:'semana-ate-a-viagem',
    exportadoEm:'2026-11-04T14:00:00.000Z',simulado:true,
    sessao:{id:session,iniciadaEm:'2026-11-04T13:45:00.000Z',concluidaEm:'2026-11-04T14:00:00.000Z'},
    origem:'jogo-estatico-c4',aviso:'Simulação fictícia',
    estado:{
      version:4,runId:session,started:true,finished:true,day:5,phase:4,endStep:3,
      wallet:450,goal:400,coins:5,personalized:true,
      purchases:[{id:'fone',name:'Atmos One',method:'pix',day:1,cost:170}],
      feedItems:[{kind:'post',id:'p1',day:1},{kind:'ad',id:'ad-main-fone',day:1}],
      cart:[],viewed:['fone'],liked:['p1'],likedAds:[],bookmarks:[],events:[{type:'buy',phase:0,message:'Comprou fone'}],
      notifs:[],fixes:[{id:'repair',cost:35}],invoice:[],subscriptions:[],reviews:[],
      pressure:{exposed:Object.fromEntries(keys.map(k=>[k,k==='fomo'?3:0])),
        influenced:Object.fromEntries(keys.map(k=>[k,k==='fomo'?['Comprou por pressão do grupo']:[]])),
        moments:Object.fromEntries(keys.map(k=>[k,k==='fomo'?['Só falta você!']:[]]))},
      algorithm:{version:2,events:[{type:'like',topic:'fone',id:'p1',author:'bia',phase:0}],impressions:{}},
      vibe:{value:54,log:[{x:0,v:64,tag:'start',label:'Inicio'},{x:1,v:54,tag:'compare',label:'comparacao'}]},
      quiz:{q0:'fomo'},stories:['story-1'],threads:{lucca:{read:true}},coupons:[],hiddenPosts:[],signals:{}
    },
    resumo:{economia:{saldoAtual:99999}} // deliberadamente falso: o MCP deve recalcular
  };
}

test('valida, isola e resume a semana C4 sem confiar em resumo do cliente', () => {
  const db={}, a={id:'A',username:'jogadorA'},b={id:'B',username:'jogadorB'};
  const source=payload();
  const result=importC4(db,a,source);
  assert.equal(result.importado,true);
  assert.equal(result.resumo.economia.saldoAtual,450);
  assert.equal(result.resumo.partida.concluida,true);
  assert.equal(result.resumo.estrategias.length,10);
  assert.equal(result.resumo.quiz.acertos,1);
  assert.equal(result.resumo.experiencia.anuncios,1);
  assert.equal(result.resumo.algoritmo.interacoes,1);
  assert.equal(getC4(db,b),null);
  assert.equal(importC4(db,a,source).repetido,true);
  const bad=payload();bad.versao=9;
  assert.throws(()=>importC4(db,a,bad),/Semana até a viagem/);
  const altered=payload();altered.estado.runId='outro';
  assert.throws(()=>importC4(db,a,altered),/Identificador/);
  assert.equal(detailC4(a,getC4(db,a),'economia').compras.length,1);
  assert.equal(detailC4(a,getC4(db,a),'vibe').linhaDoTempo.length,2);
  const older=payload();older.exportadoEm='2025-01-01T00:00:00.000Z';
  assert.throws(()=>importC4(db,a,older),/mais recente/);
  assert.equal(summarizeC4(a,getC4(db,a).document).participante.apelido,'jogadorA');
});

test('aceita feed integral de cinco dias e rejeita excesso sem perder dados', () => {
  const doc = payload('c4-semana-completa-123456');
  // 35 posts/anuncios + 25 eventos de roteiro + 5 marcadores noturnos.
  doc.estado.feedItems = [
    ...Array.from({ length: 35 }, (_, i) => ({
      kind: i % 4 === 0 ? 'ad' : 'post', id: 'post-' + i,
      day: Math.floor(i / 7) + 1
    })),
    ...Array.from({ length: 25 }, (_, i) => ({
      kind: 'event', id: 'ev-' + i, day: Math.floor(i / 5) + 1
    })),
    ...Array.from({ length: 5 }, (_, i) => ({
      kind: 'night', id: 'night-' + (i + 1), day: i + 1
    }))
  ];
  const db = {};
  const user = {id: 'aluno-c4-65', username: 'aluno_feed'};
  const imported = importC4(db, user, doc);
  assert.equal(imported.importado, true);
  assert.equal(imported.resumo.experiencia.conteudosExibidos, 65);
  assert.equal(imported.resumo.experiencia.eventosDeRoteiro, 30);
  assert.equal(getC4(db, user).document.estado.feedItems.length, 65);

  const extra = structuredClone(doc);
  extra.estado.feedItems.push({kind: 'event', id: 'ev-extra', day: 5});
  assert.throws(() => importC4({}, user, extra), /feedItems/);

  const absent = structuredClone(doc);
  delete absent.estado.feedItems;
  assert.throws(() => importC4({}, user, absent), /feedItems/);
});

test('API: importação exige login, rejeita origem externa e separa contas', {timeout:22000}, async t => {
  const port=36500+Math.floor(Math.random()*1800);
  const base='http://127.0.0.1:'+port;
  const dir=await mkdtemp(join(tmpdir(),'pto-c4-api-'));
  const child=spawn(process.execPath,['src/server.mjs'],{
    cwd:new URL('../',import.meta.url),
    env:{...process.env,PUBLIC_BASE_URL:base,HOST:'127.0.0.1',PORT:String(port),
      DATA_FILE:join(dir,'data.json'),REGISTRATION_CODE:'test-invite'},stdio:'ignore'
  });
  t.after(async()=>{child.kill();await rm(dir,{recursive:true,force:true});});
  let ready=false;
  for(let i=0;i<55;i++){try{if((await fetch(base+'/health')).ok){ready=true;break;}}catch{}await delay(90);}
  assert.ok(ready,'API inicia');
  const json=(path,body,cookie,origin)=>fetch(base+path,{
    method:'POST',headers:{'Content-Type':'application/json',...(cookie?{cookie}:{}),...(origin?{Origin:origin}:{})},
    body:JSON.stringify(body)});
  const signup=async name=>{
    const r=await json('/api/register',{username:name,password:'senha-teste-longa-123',invite:'test-invite'});
    assert.equal(r.status,201,await r.clone().text());
    return r.headers.get('set-cookie').split(';')[0];
  };
  const a=await signup('alunoC4a'),b=await signup('alunoC4b');
  const noAuth=await json('/api/c4/import',payload());
  assert.equal(noAuth.status,401);
  const origin=await json('/api/c4/import',payload(),a,'https://site-estranho.example');
  assert.equal(origin.status,403);
  const bad=await json('/api/c4/import',{...payload(),campanha:'outra'},a);
  assert.equal(bad.status,422);
  const ok=await json('/api/c4/import',payload(),a);
  assert.equal(ok.status,201,await ok.clone().text());
  assert.equal((await ok.json()).resumo.economia.saldoAtual,450);
  const seeA=await fetch(base+'/api/c4/progress',{headers:{cookie:a}});
  const seeB=await fetch(base+'/api/c4/progress',{headers:{cookie:b}});
  assert.equal((await seeA.json()).resumo.quiz.acertos,1);
  assert.equal((await seeB.json()).importado,false);
  const again=await json('/api/c4/import',payload(),a);assert.equal(again.status,200);
  const wrongDelete=await json('/api/c4/delete',{confirmar:false},a);assert.equal(wrongDelete.status,422);
  const clear=await json('/api/c4/delete',{confirmar:true},a);assert.equal(clear.status,200);
  assert.equal((await (await fetch(base+'/api/c4/progress',{headers:{cookie:a}})).json()).importado,false);
});
