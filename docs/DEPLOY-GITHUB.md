# Deploy automático do MCP — AWS EC2, systemd, porta 3201

**Este é o procedimento real do servidor**, confirmado por diagnóstico de
05/11/2026. O projeto NÃO usa Docker no host de produção.
A EC2 hospeda múltiplos serviços (YoLiga, YoLiga MCP, YoLiga Social Studio,
Por Trás da Oferta). O deploy abaixo toca **exclusivamente**
`por-tras-da-oferta.service`, no loopback `127.0.0.1:3201`.

- Serviço: `por-tras-da-oferta.service`
- Usuário do aplicativo: `pto-oferta`
- Arquivos executáveis: `/opt/por-tras-da-oferta/app`
- Configuração protegida: `/opt/por-tras-da-oferta/config/app.env`
- Repositório de staging legado: `/home/ubuntu/por-tras-da-oferta-stage`
  (NÃO será alterado automaticamente)
- Conta SSH do GitHub Actions: `pto-ghdeploy` (sem sudo genérico)
- Código fonte atualizado: `https://github.com/benimezz1/Por-tras-da-oferta-MCP`

## Fluxo de publicação

1. PR aberto: apenas testes (sem segredo de produção).
2. PR mesclado em `main`: CI da main executa novamente.
3. CI aprovada: `Deploy MCP em producao` envia `deploy <SHA40>` por SSH.
4. Uma chave SSH **restrita** admite somente esse comando.
5. O instalador root, fixo em `/usr/local/sbin/pto-deploy-systemd`,
   valida se o SHA é exatamente a última `main`, executa testes de
   integração na própria EC2 como `pto-oferta`, faz backup de
   `src`, `public` e `package.json` do MCP.
6. Substitui somente esses três alvos, reinicia **apenas**
   `por-tras-da-oferta.service`, confirma `/health` e CORS local.
7. Se falhar, restaura os três alvos do backup e reinicia só o MCP.
8. O runner do GitHub verifica `/health`, preflight HTTPS de
   `/api/c4/client/signup` (204) e `/api/c4/client/me` sem
   autenticação (401), ambos com CORS da origem do jogo.

O instalador não limpa `data`, não toca em `config/app.env`,
não altera as unidades YoLiga e não reinicia a máquina ou o tunnel.
O comando de deploy não concede acesso a shell remoto ao GitHub.

## Configurar a EC2 UMA VEZ

Faça login pelo seu método normal na EC2 e execute como `ubuntu`.
Se a chave ainda não existir, crie uma dedicada:

```bash
umask 077
mkdir -p /home/ubuntu/.ssh
KEY=/home/ubuntu/.ssh/pto-ghdeploy-actions
if [ ! -f "$KEY" ]; then
  ssh-keygen -q -t ed25519 -N "" -f "$KEY" -C "github-actions-pto-mcp"
fi
git clone --depth=1 https://github.com/benimezz1/Por-tras-da-oferta-MCP.git /home/ubuntu/pto-mcp-deploy-setup
sudo bash /home/ubuntu/pto-mcp-deploy-setup/scripts/bootstrap-pto-ssh.sh "$KEY.pub"
```

Se `/home/ubuntu/pto-mcp-deploy-setup` já for um clone, use
`git -C /home/ubuntu/pto-mcp-deploy-setup pull --ff-only`
em vez de clonar novamente.

O bootstrap valida a instalação systemd e cria apenas:
- usuário de deploy `pto-ghdeploy`, home `/var/lib/pto-ghdeploy`;
- chave autorizada com `restrict,command="/usr/local/bin/pto-ssh-gate"`;
- `/usr/local/bin/pto-ssh-gate` de propriedade root;
- `/usr/local/sbin/pto-deploy-systemd` de propriedade root;
- `/etc/sudoers.d/pto-ghdeploy` com autorização só para executar
  `/usr/local/sbin/pto-deploy-systemd`, **sem argumentos**.

Não executa deploy na preparação e não altera nenhum serviço.

## Configurar GitHub Environment production

Em [Settings → Environments](https://github.com/benimezz1/Por-tras-da-oferta-MCP/settings/environments)
crie/abra `production`. Adicione:

| Tipo | Nome | Conteúdo |
|---|---|---|
| Secret | `MCP_DEPLOY_HOST` | Endereço **público SSH** da EC2 obtido na AWS, não `ip-172-31-5-211` nem domínio `workers.dev` |
| Secret | `MCP_DEPLOY_SSH_KEY` | Conteúdo integral do arquivo privado `/home/ubuntu/.ssh/pto-ghdeploy-actions` |
| Secret | `MCP_DEPLOY_KNOWN_HOSTS` | Uma linha `HOST ssh-ed25519 BASE64...` com a chave de HOST verificada da EC2 |
| Variable (opcional) | `MCP_DEPLOY_PORT` | `22` por padrão |

`MCP_DEPLOY_USER=pto-ghdeploy` é fixo no workflow. Não existem mais
`MCP_DEPLOY_DIR` nem `MCP_DEPLOY_USER` para configurar.

### Como obter uma linha known_hosts autenticada

Na EC2, o fingerprint ED25519 do host já foi confirmado no diagnóstico:

`SHA256:CiQ7xBfFwW3FJDXT8v+Lf4z/QAL2j0U7UJS07z3tau4`

No painel da AWS, obtenha o **Public IPv4 address** da mesma instância.
Esse IP é o **HOST** no secret. Digite o IP no comando abaixo somente no
terminal da EC2, sem compartilhar chaves privadas:

```bash
read -rp 'IP publico da EC2 (AWS Console): ' MCP_SSH_PUBLIC_IP
printf '%s %s\n' "$MCP_SSH_PUBLIC_IP" "$(sudo awk '{print $1" "$2}' /etc/ssh/ssh_host_ed25519_key.pub)"
```

A saída é a linha `known_hosts` a ser colada no secret do GitHub.
Confirme o fingerprint pelo comando
`ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub -E sha256`.
Não use `StrictHostKeyChecking=no` nem aceite `ssh-keyscan` sem
comparar o fingerprint.

Para obter **somente a chave privada** e colá-la diretamente no campo
`MCP_DEPLOY_SSH_KEY` do GitHub, na EC2:

```bash
cat /home/ubuntu/.ssh/pto-ghdeploy-actions
```

O conteúdo desse arquivo é segredo: **NUNCA cole aqui no ChatGPT,
em logs, em issues, PRs ou no repositório**. Não compartilhe por e-mail
ou screenshots. Depois de instalar o secret e validar o workflow,
remova a chave privada temporária da EC2, caso não precise dela
para rotação. A chave pública permanece autorizada.

## Primeira publicação

Após configurar os secrets:
[Actions → Deploy MCP em producao](https://github.com/benimezz1/Por-tras-da-oferta-MCP/actions/workflows/deploy-mcp.yml)
→ **Run workflow** → branch `main`.

Para essa execução, não use outro serviço, não execute `docker compose`
e não rode `systemctl restart` fora do script de deploy.

**Rede SSH:** o runner GitHub precisa conseguir abrir a porta 22 da EC2.
Um túnel HTTPS para o MCP não permite SSH. Não exponha a porta 22
publicamente sem controles; se o Security Group estiver restrito,
adapte a rede ou use um runner privado/Cloudflare Access SSH.
O acesso usado pelo projeto YoLiga-MCP pode servir como referência
de conectividade, mas o par de chaves do PTO é separado.

## Cuidados com Node 20

A sessão de `ubuntu` reportou Node `20.20.2`; o repositório
declara `>=22`. O instalador testa o candidato com o Node disponível
na EC2 **antes** de substituir arquivos de produção. Se os testes
falharem, a publicação é abortada. É recomendável disponibilizar
Node 22 **somente para este serviço** no futuro, sem atualizar o
Node global usado pelos outros projetos. Não mude o runtime de outros
serviços ao configurar o deploy inicial.

## Solução de problemas

- Sem acesso SSH: confira o hostname/IP público, Security Group,
  fingerprint e o segredo da chave; não use IP privado `172.31.x.x`.
- Chave inválida: GitHub aceita o arquivo privado completo, incluindo
  `BEGIN OPENSSH PRIVATE KEY` e `END OPENSSH PRIVATE KEY`.
- `ExecStart` inesperado: o deploy aborta antes de modificar produção;
  confira `systemctl show por-tras-da-oferta.service -p ExecStart`.
- Testes falharam com Node 20: instale Node 22 isoladamente, não globalmente.
- HTTP OPTIONS 401: a versão instalada ainda é antiga ou o CORS
  não foi liberado; o script deve restaurar a versão anterior
  se a candidata não sanar isso.
- Deploy falhou depois de copiar arquivos: o instalador tenta rollback
  automático apenas da aplicação PTO, com backup em
  `/opt/por-tras-da-oferta/.github-deploy/backups/`.
- Dados de jogadores: não remova `app/data` nem o `DATA_FILE`
  indicado em `config/app.env` e não compartilhe seu conteúdo.
