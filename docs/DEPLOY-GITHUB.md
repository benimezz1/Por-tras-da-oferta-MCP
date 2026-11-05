# Deploy automático do MCP pelo GitHub Actions

A partir desta configuração, **cada pull request executa os testes** da
[CI](../.github/workflows/test.yml). **Quando o PR é mesclado em `main` e a
CI da `main` conclui com sucesso**, o
[workflow de deploy](../.github/workflows/deploy-mcp.yml) inicia a publicação.
Há também um botão **Run workflow** para redeploy manual da `main`.

**Não implantar PRs abertos diretamente em produção.** Um PR pode conter
código ainda não revisado. O deploy ocorre somente depois do merge e dos
testes aprovados.

## Como este projeto é publicado

O MCP é um servidor Node.js com dados persistidos no volume Docker
`participant_data`; não é um site estático e **não é publicado executando
`wrangler deploy`**. O Cloudflare encaminha as solicitações ao servidor
pelo túnel já existente. Por isso, GitHub Actions precisa de uma conexão
segura com o host que já executa o `docker compose`.

O workflow envia comandos **somente por SSH**, usa o commit efetivamente
aprovado e atualiza apenas:

```sh
docker compose up -d --no-deps --build --force-recreate game-mcp
```

Não executa `docker compose down`, não recria `cloudflared`, não apaga
volumes, nem envia o arquivo `.env` ao GitHub. O script exige que a branch
local seja `main`, que não existam alterações rastreadas, que `.env`
esteja presente e que o commit aprovado ainda seja o último da `main`.

## Configuração inicial (necessária uma única vez)

**1. Preparar o host do MCP.** No servidor que já tem o MCP implantado,
confirme via acesso administrativo que existe um clone do repositório
`benimezz1/Por-tras-da-oferta-MCP` na branch `main`, com `.env`,
Docker Compose e as credenciais atuais do Cloudflare Tunnel. **Não
recrie o volume nem o túnel.** O usuário de deploy deve ter permissão
para operar Docker e acesso de leitura/gravação ao clone. Use uma conta
dedicada e proteja seu acesso; o grupo Docker equivale a privilégios
elevados no host.

**2. Configurar a chave SSH dedicada.** Crie uma chave específica para o
GitHub Actions. Coloque **apenas a chave pública** no
`~/.ssh/authorized_keys` da conta de deploy do host. A chave privada
deve ser inserida diretamente como secret do GitHub, nunca em arquivo
versionado, chat, comentário de PR ou histórico de comandos. Obtenha
e confirme a chave pública do host SSH por um canal confiável para
preencher `MCP_DEPLOY_KNOWN_HOSTS`; não aceite cegamente a identidade
de um host desconhecido. O SSH do host deve ser alcançável a partir do
GitHub Actions por uma rota autorizada. **O túnel HTTP do MCP não
implica que haja acesso SSH.** Se o host é acessível apenas em rede
privada, será necessário viabilizar um caminho seguro ou adaptar o
deploy a um runner dedicado dentro dessa rede.

**3. No repositório GitHub:**
[Settings → Environments](https://github.com/benimezz1/Por-tras-da-oferta-MCP/settings/environments)
→ criar o ambiente `production`. Opcionalmente configure revisores
obrigatórios. Adicione os seguintes valores **no ambiente production**:

| Tipo | Nome | Valor |
|---|---|---|
| Secret | `MCP_DEPLOY_HOST` | Hostname/IP do servidor SSH (não é a URL do MCP) |
| Secret | `MCP_DEPLOY_USER` | Usuário SSH de deploy |
| Secret | `MCP_DEPLOY_SSH_KEY` | Chave privada SSH dedicada |
| Secret | `MCP_DEPLOY_KNOWN_HOSTS` | Linha `known_hosts` do host **verificada** |
| Variable | `MCP_DEPLOY_DIR` | Caminho **absoluto** do clone no host, sem espaços, por exemplo `/srv/por-tras-da-oferta-mcp` somente se for o caminho real |
| Variable | `MCP_DEPLOY_PORT` | Porta SSH (opcional, padrão 22) |
| Variable | `MCP_PUBLIC_ORIGIN` | `https://mcp.portrasdaoferta.workers.dev` (opcional, padrão esse endereço) |

Não há como criar essas credenciais automaticamente a partir do conteúdo
público do GitHub. Se faltarem, o deploy **falhará claramente** na etapa
de verificação; não declarará uma publicação fictícia.

**4. Conferir `.env` no servidor, não no GitHub.** Os valores esperados são:

```dotenv
PUBLIC_BASE_URL=https://mcp.portrasdaoferta.workers.dev
C4_GAME_ORIGIN=https://jogo.portrasdaoferta.workers.dev
C4_SIGNUP_ENABLED=true
```

Preserve também o `REGISTRATION_CODE`, `TUNNEL_TOKEN` e outros
segredos existentes. Confira se a origem está sem barra final e se
`PUBLIC_BASE_URL` corresponde ao domínio público real. O workflow
não escreve no `.env`.

## Verificações automáticas depois de cada deploy

O job só apresenta **sucesso** se passar em:

1. `GET /health` no contêiner local do servidor;
2. `C4_GAME_ORIGIN` correto no contêiner;
3. `GET https://mcp.portrasdaoferta.workers.dev/health` por HTTPS;
4. `OPTIONS /api/c4/client/signup` a partir da origem do jogo:
   HTTP **204** com `Access-Control-Allow-Origin` correto;
5. `GET /api/c4/client/me` sem token: HTTP **401**, também com CORS
   correto. O `401` nesse caso é **esperado**.

Os testes de CORS detectam diretamente o bloqueio visto no navegador
após a atualização do jogo. **Nenhuma conta é criada pelos testes de deploy.**

## Operação e manutenção

- **PR aberto:** a CI valida, mas **não publica**.
- **PR mesclado à main:** a CI roda novamente no commit mesclado;
  em caso de sucesso, o deploy se inicia.
- **CI falhou:** não publica.
- **Deploy falhou:** verifique a etapa específica na aba
  [Actions](https://github.com/benimezz1/Por-tras-da-oferta-MCP/actions)
  antes de tentar novamente. O job retorna falha se servidor/credenciais
  estiverem ausentes, ou se CORS e API pública estiverem incorretos.
- **Redeploy manual:** Actions → `Deploy MCP em producao` →
  **Run workflow** → branch `main`.
- **Rollback:** antes de reverter, inspecione os logs do contêiner e
  registre o SHA anterior mostrado no job. Reverter somente o código do
  `game-mcp` e nunca apagar `participant_data`. Para recuperação
  urgente, use a cópia/commit conhecido do servidor via acesso
  administrativo; não faça rollback por exclusão de volumes.
- **Mudança no Cloudflare Worker ou túnel:** não é abrangida por este
  workflow. Encaminhamento de URL, regras de Cloudflare e permissões da
  máquina continuam sendo configurados no respectivo serviço.

**Situação inicial:** workflow implementado no repositório, mas o
deploy só ocorrerá depois que o host SSH, a chave, a impressão do host
e o caminho do projeto forem configurados no ambiente `production`.
