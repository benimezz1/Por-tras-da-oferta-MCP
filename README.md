# Por Trás da Oferta — MCP (Ciclo 4)

Protótipo escolar para reconhecer estratégias psicológicas do marketing digital, inspirado no **Relatório Final C3** de Lógica e Negócios.

## Demonstração web local (sem conta)

Requer Node.js 20+; **sem dependências npm**:

```bash
npm start
```

Acesse http://127.0.0.1:3100. Cole um anúncio, informe preço e orçamento fictício e obtenha indícios textuais de persuasão e perguntas para reflexão.

## Testes

```bash
npm test
```

## Rotas da API local

- `GET /health` — estado do protótipo.
- `GET /api/estrategias` — biblioteca de oito estratégias.
- `POST /api/analisar` — JSON `{"texto":"Só hoje! Restam 2 unidades."}`.
- `POST /api/avaliar` — JSON `{"anuncio":"Só hoje!","preco":150,"orcamento":200,"necessidade":"desejo"}`.

## MCP

**Esta branch é o primeiro protótipo web e de API, ainda não é um servidor de transporte MCP.** O pacote complementar com as ferramentas MCP está disponível separadamente para testes locais; sua integração completa, autenticação e implantação remota são tarefas da próxima etapa. Não configure esta versão como um endpoint MCP.

## Limitações e segurança

A análise é heurística e textual. Não verifica se preços, estoques ou depoimentos são verdadeiros. Não classifica usuários como consumistas ou vendedores como fraudulentos. Não há cadastro ou persistência de dados. O servidor está limitado a `127.0.0.1`; antes de hospedar, será preciso HTTPS, autenticação e revisão de segurança.
