#!/usr/bin/env bash
# Executado no host do MCP por GitHub Actions depois dos testes na main.
# Altera exclusivamente o servico game-mcp; nao toca no tunel nem no volume.
set -Eeuo pipefail

commit="${1:-}"
deploy_dir="${2:-}"
if [[ ! "$commit" =~ ^[a-f0-9]{40}$ ]]; then
  echo "ERRO: commit Git invalido." >&2
  exit 2
fi
if [[ -z "$deploy_dir" || "$deploy_dir" == "/" || ! -d "$deploy_dir/.git" ]]; then
  echo "ERRO: MCP_DEPLOY_DIR precisa apontar para o clone do repositorio MCP no servidor." >&2
  exit 2
fi
cd "$deploy_dir"
if [[ "$(git branch --show-current)" != "main" ]]; then
  echo "ERRO: o clone de producao deve estar na branch main." >&2
  exit 2
fi
if [[ -n "$(git status --porcelain --untracked-files=no)" ]]; then
  echo "ERRO: existem alteracoes locais rastreadas. Resolva-as antes do deploy (nao sobrescreveremos)." >&2
  exit 2
fi
if [[ ! -f .env ]]; then
  echo "ERRO: arquivo .env ausente. Os segredos precisam permanecer SOMENTE neste host." >&2
  exit 2
fi
command -v git >/dev/null
command -v docker >/dev/null
command -v curl >/dev/null
docker compose version >/dev/null

# Nao implantar uma build antiga quando dois merges acontecerem seguidos.
git fetch --no-tags origin main
latest="$(git rev-parse FETCH_HEAD)"
if [[ "$latest" != "$commit" ]]; then
  echo "ERRO: o commit validado ($commit) nao e mais o ultimo da main ($latest)."
  echo "A execucao associada ao commit mais recente fara o deploy."
  exit 1
fi
previous="$(git rev-parse HEAD)"
echo "MCP: atualizando ${previous:0:12} para ${commit:0:12}"
git merge --ff-only "$commit"

# O volume Docker e o .env sao preservados. Nao recriar cloudflared.
docker compose config --quiet
docker compose up -d --no-deps --build --force-recreate game-mcp

healthy=false
for attempt in $(seq 1 20); do
  if curl --fail --silent --max-time 3 http://127.0.0.1:3100/health >/dev/null; then
    healthy=true
    break
  fi
  sleep 2
done
if [[ "$healthy" != "true" ]]; then
  echo "ERRO: o MCP nao respondeu em localhost:3100/health apos a atualizacao."
  docker compose ps game-mcp
  docker compose logs --tail=50 --no-color game-mcp
  exit 1
fi

# CORS tambem deve estar correto na aplicacao implantada (o teste externo
# completo e executado pelo runner do GitHub).
configured_origin="$(docker compose exec -T game-mcp node -e 'process.stdout.write(process.env.C4_GAME_ORIGIN || "")')"
if [[ "$configured_origin" != "https://jogo.portrasdaoferta.workers.dev" ]]; then
  echo "ERRO: C4_GAME_ORIGIN nao corresponde ao endereco publico do jogo." >&2
  exit 1
fi
echo "OK: game-mcp em $(git rev-parse --short HEAD), /health local disponivel e CORS configurado."
