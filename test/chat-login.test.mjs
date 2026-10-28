import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

test('MCP sem OAuth: senha somente no site, codigo por chat, isolamento por jogador', { timeout: 22000 }, async t => {
  const port = 35500 + Math.floor(Math.random() * 1000);
  const base = `http://127.0.0.1:${port}`;
  const dir = await mkdtemp(join(tmpdir(), 'pto-chat-test-'));
  const child = spawn(process.execPath, ['src/server.mjs'], {
    cwd: new URL('../', import.meta.url),
    env: { ...process.env, PUBLIC_BASE_URL: base, HOST:'127.0.0.1', PORT:String(port), CHAT_LOGIN_ENABLED:'true', DATA_FILE:join(dir,'db.json'), REGISTRATION_CODE:'code-para-teste' },
    stdio: 'ignore'
  });
  t.after(async () => { child.kill(); await rm(dir,{recursive:true,force:true}); });
  let started = false;
  for (let i=0;i<55;i++) { try { if ((await fetch(base+'/health')).ok) { started=true;break; } } catch {} await delay(90); }
  assert.ok(started,'Servidor iniciou');
  assert.equal((await fetch(base+'/health')).headers.get('referrer-policy'), 'no-referrer', 'Demais rotas continuam protegidas');

  const post = (path, data, headers={}) => fetch(base+path,{ method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(data) });
  const rpc = async (method,params={}) => {
    const r=await post('/mcp',{jsonrpc:'2.0',id:1,method,params},{accept:'application/json, text/event-stream'});
    assert.equal(r.status,200,await r.clone().text());
    return r.json();
  };
  const call = async (name,args={}) => (await rpc('tools/call',{name,arguments:args})).result;
  async function register(username) {
    const r=await post('/api/register',{username,password:'senha-super-forte-de-teste',invite:'code-para-teste'});
    assert.equal(r.status,201,await r.clone().text());
    return r.headers.get('set-cookie').split(';')[0];
  }
  const cookieA = await register('alunoAAA');
  await register('alunoBBB');
  const choice = await post('/api/game/choice',{scenarioId:'fone',buy:true,guess:'urgencia'},{Cookie:cookieA});
  assert.equal(choice.status,200);

  const init = await rpc('initialize',{protocolVersion:'2025-11-25',capabilities:{},clientInfo:{name:'test',version:'1'}});
  assert.equal(init.result.protocolVersion,'2025-11-25');
  const listed = await rpc('tools/list');
  assert.deepEqual(listed.result.tools.find(t=>t.name==='iniciar_vinculo').securitySchemes,[{type:'noauth'}]);
  assert.ok(listed.result.tools.some(t=>t.name==='confirmar_vinculo'));
  assert.deepEqual(listed.result.tools.find(t=>t.name==='consultar_progresso').securitySchemes,[{type:'noauth'}]);

  const before = await call('consultar_progresso');
  assert.equal(before.isError,true,'Sem credencial nao pode consultar dados');
  assert.equal(before.structuredContent,undefined);
  const noProfile = await call('get_profile',{sessao:'fake-token'});
  assert.equal(noProfile.isError,true);

  async function connect(username) {
    const started = await call('iniciar_vinculo',{usuario:username});
    assert.equal(started.structuredContent.estado,'aguardando_confirmacao');
    const {pedido,link_seguro} = started.structuredContent;
    assert.ok(pedido.length>=40);
    assert.match(link_seguro,/\/vincular\?pedido=/);
    const page = await fetch(link_seguro);
    assert.equal(page.status,200);
    assert.equal(page.headers.get('referrer-policy'), 'same-origin', 'Permite Origin real no POST HTML do navegador');
    assert.doesNotMatch(await page.text(), /senha-super-forte-de-teste/);
    const form = async(password) => fetch(base+'/vincular/entrar',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({pedido,username,password})});
    const wrong=await form('senha-errada');
    assert.equal(wrong.status,401);
    const right=await form('senha-super-forte-de-teste');
    assert.equal(right.status,200,await right.clone().text());
    const html=await right.text();
    const code=html.match(/[0-9A-F]{12}/)?.[0];
    assert.ok(code,'Codigo exibido somente no site');
    const bad=await call('confirmar_vinculo',{pedido,codigo:'000000000000'});
    assert.equal(bad.structuredContent.estado,'codigo_invalido');
    const approved=await call('confirmar_vinculo',{pedido,codigo:code});
    assert.equal(approved.structuredContent.estado,'autenticado');
    const sessao=approved.structuredContent.sessao;
    assert.ok(sessao.length>=40);
    const replay=await call('confirmar_vinculo',{pedido,codigo:code});
    assert.notEqual(replay.structuredContent.estado,'autenticado');
    return sessao;
  }

  const sessA=await connect('alunoAAA');
  const sessB=await connect('alunoBBB');
  const a=await call('consultar_progresso',{sessao:sessA});
  const b=await call('consultar_progresso',{sessao:sessB});
  assert.equal(a.structuredContent.participante.apelido,'alunoAAA');
  assert.equal(b.structuredContent.participante.apelido,'alunoBBB');
  assert.equal(a.structuredContent.fases_concluidas,1);
  assert.equal(b.structuredContent.fases_concluidas,0);
  assert.notEqual(a.structuredContent.participante.id,b.structuredContent.participante.id);
  const profile=await call('get_profile',{sessao:sessB});
  assert.equal(profile.structuredContent.name,'alunoBBB');

  const pending=await call('iniciar_vinculo',{usuario:'alunoAAA'});
  const unconfirmed=await call('consultar_progresso',{sessao:pending.structuredContent.pedido});
  assert.equal(unconfirmed.isError,true,'Pedido de vinculo nao substitui token de sessao');
});
