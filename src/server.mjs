import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {analisar,avaliar,estrategias} from './analise.mjs';
const HOST='127.0.0.1',PORT=Number(process.env.PORT||3100);
if(!Number.isInteger(PORT)||PORT<1||PORT>65535)throw Error('PORT inválida');
const html=new URL('../public/index.html',import.meta.url);
const json=(res,status,obj)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(obj));};
createServer(async(req,res)=>{
 res.setHeader('X-Content-Type-Options','nosniff');
 res.setHeader('X-Frame-Options','DENY');
 try{
  if(req.method==='GET'&&req.url==='/'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});return res.end(await readFile(html));}
  if(req.method==='GET'&&req.url==='/health')return json(res,200,{status:'ok',modo:'local'});
  if(req.method==='GET'&&req.url==='/api/estrategias')return json(res,200,{estrategias});
  if(req.method==='POST'&&['/api/analisar','/api/avaliar'].includes(req.url)){
    let body='';
    for await(const chunk of req){body+=chunk.toString();if(body.length>12000)return json(res,413,{erro:'Requisição grande demais'});}
    let args;try{args=JSON.parse(body);}catch{return json(res,400,{erro:'JSON inválido'});}
    try{return json(res,200,req.url==='/api/analisar'?analisar(args.texto):avaliar(args));}
    catch(e){return json(res,400,{erro:e.message});}
  }
  return json(res,404,{erro:'Rota não encontrada'});
 }catch(e){console.error(e);if(!res.headersSent)json(res,500,{erro:'Erro interno'});}
}).listen(PORT,HOST,()=>console.log('Por Trás da Oferta em http://'+HOST+':'+PORT));
