import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const KEYS=["urgencia","escassez","prova_social","influencia","personalizacao","fomo",
  "preco","dark_patterns","recompensa","emocao"];
const C4_ORIGIN="http://127.0.0.1:4174";
function completeDoc() {
 const run="c4-teste-auth-00123456";
 return {formato:"por-tras-da-oferta/c4-semana",versao:1,
  campanha:"semana-ate-a-viagem",simulado:true,
  exportadoEm:"2026-11-04T20:00:00.000Z",
  sessao:{id:run,iniciadaEm:"2026-11-04T19:50:00.000Z",concluidaEm:"2026-11-04T20:00:00.000Z"},
  estado:{version:4,runId:run,started:true,finished:true,day:5,phase:4,endStep:3,
   wallet:420,goal:400,coins:5,personalized:true,
   feedItems:[{id:"p1",kind:"post",day:1}],purchases:[{id:"fone",method:"pix",cost:180,name:"Atmos One",day:1}],
   cart:[],viewed:["fone"],liked:[],likedAds:[],bookmarks:[],events:[],notifs:[],
   fixes:[],invoice:[],subscriptions:[],reviews:[],stories:[],coupons:[],threads:{},
   algorithm:{version:2,events:[],impressions:{}},
   vibe:{value:64,log:[{x:0,v:64,tag:"start",label:"Início"}]},
   pressure:{exposed:Object.fromEntries(KEYS.map(key=>[key,key==="fomo"?3:0])),
    influenced:Object.fromEntries(KEYS.map(key=>[key,[]])),
    moments:Object.fromEntries(KEYS.map(key=>[key,[]]))},
   quiz:{q0:"fomo",q1:"urgencia",q2:"escassez",q3:"prova_social",q4:"influencia"}
  }
 };
}
test("login simples, envio automatico, identidade e CORS da Semana C4", {timeout:25000},async t=>{
 const port=38100+Math.floor(Math.random()*1600),base="http://127.0.0.1:"+port;
 const temp=await mkdtemp(join(tmpdir(),"pto-c4-login-"));
 const child=spawn(process.execPath,["src/server.mjs"],{cwd:new URL("../",import.meta.url),
  env:{...process.env,PORT:String(port),HOST:"127.0.0.1",PUBLIC_BASE_URL:base,
   C4_GAME_ORIGIN:C4_ORIGIN,REGISTRATION_CODE:"teste-interno",
   C4_SIGNUP_ENABLED:"true",DATA_FILE:join(temp,"db.json"),CHAT_LOGIN_ENABLED:"false"},
  stdio:"ignore"});
 t.after(async()=>{child.kill();await rm(temp,{recursive:true,force:true});});
 let up=false;for(let i=0;i<55;i++){try{if((await fetch(base+"/health")).ok){up=true;break;}}catch{}await delay(90);}
 assert.ok(up,"API iniciou");
 const json=async(path,data,token,origin=C4_ORIGIN)=>{
  const res=await fetch(base+path,{method:"POST",headers:{"Content-Type":"application/json",Origin:origin,
   ...(token?{Authorization:"Bearer "+token}:{})},body:JSON.stringify(data)});
  return {response:res,body:await res.json()};
 };
 const preflight=await fetch(base+"/api/c4/client/complete",{method:"OPTIONS",
  headers:{Origin:C4_ORIGIN,"Access-Control-Request-Method":"POST",
   "Access-Control-Request-Headers":"Authorization, Content-Type"}});
 assert.equal(preflight.status,204);
 assert.equal(preflight.headers.get("access-control-allow-origin"),C4_ORIGIN);
 const wrongOrigin=await json("/api/c4/client/signup",{username:"teste_a",password:"uma-senha-longa-123"},null,"https://site-externo.test");
 assert.equal(wrongOrigin.response.status,403);
 const signup=await json("/api/c4/client/signup",{username:"estudante_a",password:"uma-senha-longa-123"});
 assert.equal(signup.response.status,201,JSON.stringify(signup.body));
 assert.equal(signup.body.usuario.username,"estudante_a");
 assert.equal(signup.body.token.length>32,true);
 assert.equal(signup.body.usuario.password,undefined);
 const token=signup.body.token;
 const duplicate=await json("/api/c4/client/signup",{username:"estudante_a",password:"outra-senha-longa"});
 assert.equal(duplicate.response.status,409);
 const noPassword=await json("/api/c4/client/login",{username:"estudante_a",password:"errada-errada-123"});
 assert.equal(noPassword.response.status,401);
 const login=await json("/api/c4/client/login",{username:"estudante_a",password:"uma-senha-longa-123"});
 assert.equal(login.response.status,200);
 const liveToken=login.body.token;
 const expired=await fetch(base+"/api/c4/client/me",{headers:{Authorization:"Bearer "+token,Origin:C4_ORIGIN}});
 assert.equal(expired.status,401,"login novo invalida o token anterior");
 const myProfile=await fetch(base+"/api/c4/client/me",{headers:{Authorization:"Bearer "+liveToken,Origin:C4_ORIGIN}});
 assert.equal(myProfile.status,200);
 assert.equal((await myProfile.json()).usuario.id,signup.body.usuario.id);
 const withoutToken=await json("/api/c4/client/complete",completeDoc());
 assert.equal(withoutToken.response.status,401);
 const notFinished=completeDoc();notFinished.estado.endStep=2;
 const rejected=await json("/api/c4/client/complete",notFinished,liveToken);
 assert.equal(rejected.response.status,422);
 const completed=await json("/api/c4/client/complete",completeDoc(),liveToken);
 assert.equal(completed.response.status,201,JSON.stringify(completed.body));
 assert.equal(completed.body.partida,completeDoc().sessao.id);
 assert.equal(completed.body.usuario.id,signup.body.usuario.id);
 const repeated=await json("/api/c4/client/complete",completeDoc(),liveToken);
 assert.equal(repeated.response.status,200);
 assert.equal(repeated.body.repetido,true);
 const oldLogin=await fetch(base+"/api/login",{method:"POST",headers:{"Content-Type":"application/json"},
  body:JSON.stringify({username:"estudante_a",password:"uma-senha-longa-123"})});
 assert.equal(oldLogin.status,200);
 const cookie=oldLogin.headers.get("set-cookie")?.split(";")[0];
 const progress=await fetch(base+"/api/c4/progress",{headers:{Cookie:cookie}});
 assert.equal(progress.status,200);
 const summary=(await progress.json()).resumo;
 assert.equal(summary.campanha,"semana-ate-a-viagem");
 assert.equal(summary.economia.saldoAtual,420);
 assert.equal(summary.quiz.respondidas,5);
 const other=await json("/api/c4/client/signup",{username:"estudante_b",password:"senha-bem-longa-1234"});
 assert.equal(other.response.status,201);
 const otherLogin=await fetch(base+"/api/login",{method:"POST",headers:{"Content-Type":"application/json"},
  body:JSON.stringify({username:"estudante_b",password:"senha-bem-longa-1234"})});
 const otherCookie=otherLogin.headers.get("set-cookie")?.split(";")[0];
 const otherProgress=await fetch(base+"/api/c4/progress",{headers:{Cookie:otherCookie}});
 assert.equal((await otherProgress.json()).importado,false,"contas separadas");
 const logout=await json("/api/c4/client/logout",{},liveToken);
 assert.equal(logout.response.status,200);
 const after=await fetch(base+"/api/c4/client/me",{headers:{Authorization:"Bearer "+liveToken,Origin:C4_ORIGIN}});
 assert.equal(after.status,401);
});
