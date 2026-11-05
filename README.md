# Por Trás da Oferta — MCP

Jogo educativo e servidor **Model Context Protocol (MCP)** para o Ciclo 4 de Lógica e Negócios do Colégio Rio Branco. A pesquisa do C3 analisou urgência, escassez, prova social, influenciadores, personalização, FOMO, descontos e padrões comerciais obscuros.

> **Estado:** MVP funcional testado localmente, mas a conexão real com o ChatGPT e a implantação Cloudflare ainda precisam ser testadas no ambiente de destino. Não trate este protótipo como sistema de contas auditado para produção com dados de menores.

## Recursos

- Criação de contas por **apelido**, senha protegida por `scrypt` e código de inscrição da bancada (sem e-mail ou nome real).
- Duas ou mais contas podem jogar ao mesmo tempo. O histórico e o orçamento fictício são isolados por ID de usuário.
- Campanha atual: cadastro/login por apelido e senha antes da partida, com **envio automático do JSON C4 ao final do quiz**. A importação manual continua apenas como contingência. Os quatro desafios de compra são o protótipo anterior.
- Analisador textual heurístico e biblioteca com oito estratégias. Não verifica fraudes, preços reais ou diagnósticos psicológicos.
- MCP remoto em `/mcp` por Streamable HTTP, com suporte a mensagens JSON-RPC, `initialize` legado e `server/discover` moderno.
- OAuth 2.1 experimental para ChatGPT: fluxo de autorização com **PKCE S256**, DCR com callbacks permitidos e token Bearer associado a um participante. Sem API key da OpenAI.
- Ferramentas MCP: `get_profile`, `consultar_progresso` (prioriza C4), `consultar_percurso_c4`, `analisar_anuncio`, `avaliar_compra`, `explicar_estrategia`.

## Execução local sem Docker

Requer Node.js 22+; o protótipo não precisa instalar pacotes npm.

```bash
npm test
npm start
```

Abra `http://127.0.0.1:3100/`. O código de inscrição local é `demo-local` (somente quando não configurado um domínio público). Para testes locais, use apelidos fictícios e senhas de teste. A persistência fica em `data/runtime.json` (não é enviada ao GitHub).

## Deploy automatico pelo GitHub (novo)

Pull requests executam os testes. Quando um PR e mesclado em `main` e a
CI aprova o commit resultante, o workflow
[Deploy MCP em producao](.github/workflows/deploy-mcp.yml) conecta por SSH ao
host do Docker Compose, atualiza **somente `game-mcp`**, preserva os dados
e verifica a resposta publica e o CORS do jogo. **O deploy nao ocorre no
momento em que um PR e aberto**, para proteger a versao da apresentacao.

**Atencao:** e obrigatorio configurar uma vez o ambiente `production`,
com secrets SSH e a variavel do caminho do servidor. Sem acesso ao
servidor, o GitHub consegue testar mas nao implantar o MCP.
[Guia completo de configuracao e verificacao](docs/DEPLOY-GITHUB.md).

## Publicação com Cloudflare Tunnel (Docker)

### Preparar no servidor

```bash
git clone https://github.com/benimezz1/Por-tras-da-oferta-MCP.git
cd Por-tras-da-oferta-MCP
# Faça checkout da branch revisada deste projeto, se o PR ainda não estiver incorporado.
cp .env.example .env
```

Edite **apenas no servidor** `.env` com:

- `PUBLIC_BASE_URL=https://mcp.SEUDOMINIO.com.br` (um domínio real gerenciado na Cloudflare)
- `REGISTRATION_CODE=` uma frase secreta com ao menos 16 caracteres, não usar o texto de exemplo
- `TUNNEL_TOKEN=` o token do tunnel obtido no painel Cloudflare (tratar como senha)

```bash
docker compose up -d --build
docker compose logs -f game-mcp
```

Em **Cloudflare Dashboard → Networking → Tunnels**, crie um tunnel gerenciado e uma rota **Published application** para o hostname escolhido com **Service URL `http://game-mcp:3100`**. O container `cloudflared` compartilha a rede privada do Docker Compose com `game-mcp`. Não abra portas 80/443 no roteador. A única porta publicada pelo Compose fica restrita a `127.0.0.1:3100` no host.

Verifique:

```bash
curl -fsS https://mcp.SEUDOMINIO.com.br/health
curl -fsS https://mcp.SEUDOMINIO.com.br/.well-known/oauth-protected-resource
curl -fsS https://mcp.SEUDOMINIO.com.br/.well-known/oauth-authorization-server
```

Jogo: `https://mcp.SEUDOMINIO.com.br/`  
MCP: `https://mcp.SEUDOMINIO.com.br/mcp`

> Não use uma regra do Cloudflare Access com login interativo na frente do `/mcp`, pois ela pode impedir que clientes MCP sigam o fluxo OAuth padrão. O próprio MCP valida tokens. Implemente limitação de requisições/WAF no Cloudflare antes de abrir a inscrição ao público.

### Vínculo da conta do jogo com o assistente

1. No Chrome do participante A, acesse o jogo, crie um apelido com o código da bancada e jogue.
2. Se a conta ChatGPT utilizada permitir conexões MCP personalizadas, abra **Plugins → (+) → Adicionar servidor MCP personalizado** e configure a URL `https://mcp.SEUDOMINIO.com.br/mcp` com OAuth.
3. Ao aparecer a página de login do **Por Trás da Oferta**, entre com o **mesmo apelido e senha** usados no jogo e autorize.
4. Peça no ChatGPT: **“Use Por Trás da Oferta, confirme meu perfil conectado e analise minhas escolhas no jogo. Depois explique este anúncio: ‘Só hoje! Últimas unidades!’”**
5. Repita no Chrome do participante B, com conta do jogo diferente e conta ChatGPT diferente. Cada token OAuth determina o usuário, e as ferramentas consultam somente seu registro.

**Limitação comercial do ChatGPT:** a documentação da OpenAI de outubro de 2026 indica que contas Free não têm garantida a criação de MCP personalizado. A presença da opção precisa ser verificada **em cada conta**. O site/jogo funciona por conta própria mesmo sem ChatGPT; a integração externa é condicional.

## Plano de contingência para ChatGPT Free

O jogo inclui um botão **“Copiar resumo para ChatGPT”**. O participante decide copiar seus dados fictícios de jogo para uma conversa normal na conta gratuita, **sem conexão MCP**. A IA pode orientar a partir desse resumo, mas não acessa o servidor automaticamente nem verifica mudanças em tempo real. Esta alternativa funciona mesmo quando o plano não permite plugins personalizados.

## Vinculação por conversa sem OAuth (experimental, somente para demonstração)

O backend preserva **OAuth como padrão**. Uma alternativa de demonstração pode ser habilitada
com `CHAT_LOGIN_ENABLED=true` no ambiente do serviço (reinicie **somente** o MCP).

Nesse modo, o cliente MCP pode ser configurado como **No authentication**;
`initialize` e `tools/list` são anônimos. Isso **não** torna os dados dos jogadores públicos.
Para consultar perfil, progresso ou usar qualquer ferramenta protegida, o assistente deve:

1. Perguntar o **apelido**, sem revelar se aquela conta existe.
2. Chamar `iniciar_vinculo({usuario})`, que retorna um link HTTPS temporário.
3. Enviar o link; o participante digita sua **senha somente no nosso site**, nunca no ChatGPT.
4. O site exibe um **código temporário de uso único**, que o participante informa no chat.
5. Chamar `confirmar_vinculo({pedido,codigo})`, que libera um token de sessão de curta duração.
6. Passar esse token no argumento `sessao` de cada ferramenta protegida. O servidor valida
   o token e acessa exclusivamente o usuário vinculado a ele.

O pedido expira em 10 minutos e a sessão em 60 minutos. Sem `sessao` válida, nenhuma
ferramenta protegida entrega informações de usuário. Cada nova conversa deve criar nova
vinculação. O ChatGPT **não** garante um ID de conversa autenticado para o servidor; o
isolamento é feito pelo token e o modelo precisa repassá-lo às ferramentas. O modelo
pode responder perguntas gerais sem usar o MCP, e o servidor não controla essas respostas.

**Limites:** esse token de sessão aparece em argumentos/resultados de ferramentas no
contexto do modelo, logo essa opção é **menos segura do que OAuth**. Use somente
apelidos e dados fictícios, sem dados pessoais de menores, e restrinja testes à
bancada. **Nunca peça senha no chat**. Códigos temporários também são segredos
até expirar. Não indicado para serviço público sensível sem auditoria.

### Depois do Ciclo 4

Para permitir login uma única vez em várias conversas, é necessário usar a
identidade autenticada do cliente (por exemplo, OAuth do ChatGPT com renovação e
revogação adequadas). Isso não se obtém apenas alternando uma flag do servidor.
Desabilitar OAuth **não** habilita plugins em contas sem acesso a esse recurso.

## Segurança e privacidade

- Não peça nomes completos, e-mails, documentos nem informações financeiras reais. Use só apelidos e decisões simuladas.
- O arquivo JSON guarda hashes de senha (`scrypt`), hashes dos tokens, escolhas fictícias e IDs. Faça backup controlado, proteja o volume Docker e não o publique.
- O `REGISTRATION_CODE` limita cadastros, mas não substitui uma auditoria de segurança. A implementação OAuth é didática e deve ser revisada antes de uso real com muitos estudantes ou publicação do plugin.
- Tokens OAuth vencem em 8 horas e não têm refresh token: após o prazo, o participante deverá reconectar.
- Para excluir todos os dados após a feira, pare o Compose e remova **somente** o volume dedicado do projeto, após conferir que não precisa dos dados: `docker compose down -v`. Isso apaga também usuários, resultados e tokens. Para reiniciar só o progresso, o jogador usa “Reiniciar jogo”.
- Não exponha `/data`, `.env`, tokens ou senhas em capturas de tela, repositórios ou demonstrações.
- O endpoint MCP é acessível por HTTPS, mas não entrega dados pessoais sem token autorizado. A análise é educativa e limitada, e não verifica o anúncio no mundo real.

## Próximos passos para demonstração

1. Escolher domínio na Cloudflare e criar tunnel (os tokens ficam com o responsável pelo servidor).
2. Testar duas contas locais e duas janelas privadas.
3. Testar OAuth com MCP Inspector e, **se habilitado no plano**, conectar no ChatGPT.
4. Integrar o jogo final ao mesmo armazenamento ou substituir os desafios de demonstração pelas fases oficiais.
5. Avaliar submissão do plugin ao diretório somente após auditoria, política de privacidade e testes de compatibilidade.

Fontes técnicas: https://developers.cloudflare.com/tunnel/get-started/ ; https://developers.openai.com/plugins/build/auth ; https://modelcontextprotocol.io/specification/2025-11-25/basic/transports .


## Login e envio automático do jogo atual

O jogo de cinco dias é publicado no Worker estático em
`https://jogo.portrasdaoferta.workers.dev`; **o MCP serve como backend de
contas e armazenamento**. Antes de jogar, a pessoa usa somente um apelido
fictício e uma senha (mínimo de 10 caracteres). O backend oferece
`/api/c4/client/signup` e `/api/c4/client/login` sem exigir e-mail ou o
código secreto do modo legado. O cadastro é limitado a 50 contas no total e
há limitação por IP. Uma sessão opaca de 8 horas é guardada no navegador
apenas na aba (`sessionStorage`), enquanto o banco mantém **somente o hash**
desse token. O armazenamento das partidas do jogo é segregado por ID de conta.

Após os cinco dias e as cinco perguntas, o jogo chama automaticamente
`POST /api/c4/client/complete` com o JSON C4 versão 1. O servidor valida a
campanha concluída, associa o documento à **conta autenticada do token** e
recalcula o resumo. Não confia no nome, ID de participante ou notas enviadas
pelo navegador. O jogo confirma o recebimento apenas após HTTP 200/201 com
identidade e partida correspondentes; se falhar, o progresso local permanece
para nova tentativa. Nenhuma compra ou pagamento é real.

O ChatGPT vê esse percurso pelas ferramentas `consultar_progresso` e
`consultar_percurso_c4`, **depois** que o participante vincular essa mesma
conta pelo OAuth ou pelo fluxo de código temporário. A senha nunca deve ser
digitada no chat. O arquivo JSON não contém senha. O modo antigo continua
compatível; o portal `/api/c4/import` permite importação manual em caso de
contingência e `/api/c4/delete` exclui o registro.

### Novos endpoints da sessão C4

| Método | Rota | Autorização |
|---|---|---|
| POST | `/api/c4/client/signup` | Apelido e senha, sem código de inscrição |
| POST | `/api/c4/client/login` | Apelido e senha; emite token de jogo |
| GET | `/api/c4/client/me` | `Authorization: Bearer TOKEN` |
| POST | `/api/c4/client/complete` | Bearer + JSON `c4-semana`, quiz final completo |
| POST | `/api/c4/client/logout` | Bearer; invalida sessão |
| GET | `/api/c4/progress` | Cookie do portal MCP, apenas mesma conta |
| POST | `/api/c4/import` | Importação manual legada, cookie do portal MCP |
| POST | `/api/c4/delete` | Excluir com confirmação, cookie do portal MCP |

O CORS da sessão do jogo permite somente `C4_GAME_ORIGIN` (origem exata da
página hospedada), com métodos e cabeçalhos limitados, **sem cookies
cross-site**. As demais rotas não ganham CORS indiscriminado. Use sempre
HTTPS em produção.

### Configuração do backend e deploy

No `.env` do MCP configure:

```sh
PUBLIC_BASE_URL=https://DOMINIO_REAL_DO_MCP
C4_GAME_ORIGIN=https://jogo.portrasdaoferta.workers.dev
C4_SIGNUP_ENABLED=true
CHAT_LOGIN_ENABLED=true
```

No build do site estático configure
`VITE_C4_MCP_ORIGIN=https://DOMINIO_REAL_DO_MCP`. O fallback
`https://mcp.portrasdaoferta.workers.dev` é somente um endereço padrão
**não verificado neste repositório**: confirme o hostname usado na implantação.
O Compose propaga `C4_GAME_ORIGIN`, `C4_SIGNUP_ENABLED` e
`CHAT_LOGIN_ENABLED` ao contêiner.

A importação C4 continua sendo um envio de dados fictícios pelo navegador,
e não uma fonte independente que comprove a autoria de cada interação ou
permita diagnosticar o comportamento de alguém. Use apenas apelidos e
estabeleça procedimento de exclusão dos registros após a apresentação.
