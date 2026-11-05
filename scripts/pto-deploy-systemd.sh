#!/usr/bin/env bash
# Instalador de um UNICO servico: por-tras-da-oferta.service em 127.0.0.1:3201.
# Invocado por sudoers com SHA validado na entrada padrao. NUNCA roda Docker.
set -Eeuo pipefail
umask 027

BASE=/opt/por-tras-da-oferta
LIVE="$BASE/app"
CONFIG="$BASE/config/app.env"
SERVICE=por-tras-da-oferta.service
STATE="$BASE/.github-deploy"
SOURCE="$STATE/source"
ORIGIN=https://jogo.portrasdaoferta.workers.dev

fail() { echo "ERRO DEPLOY PTO: $*" >&2; exit 1; }
[[ "$(id -u)" -eq 0 ]] || fail "Execute somente por sudoers como root."
IFS= read -r SHA || fail "SHA nao recebido."
[[ "$SHA" =~ ^[a-f0-9]{40}$ ]] || fail "SHA invalido."
for cmd in git tar curl flock systemctl runuser node; do command -v "$cmd" >/dev/null || fail "$cmd ausente"; done

[[ -d "$LIVE/src" && -d "$LIVE/public" && -f "$LIVE/package.json" ]] || fail "Arquivos de producao inesperados: abortando sem modificar."
[[ -f "$CONFIG" ]] || fail "app.env ausente; nao tocar em producao."
[[ "$(systemctl show -p WorkingDirectory --value "$SERVICE")" == "$LIVE" ]] || fail "WorkingDirectory diferente do projeto autorizado."
[[ "$(systemctl show -p User --value "$SERVICE")" == "pto-oferta" ]] || fail "Usuario do servico inesperado."
exec_start="$(systemctl show -p ExecStart --value "$SERVICE")"
[[ "$exec_start" == *"src/server.mjs"* ]] || fail "ExecStart nao aponta para server.mjs; revise o servico."
for path in "$LIVE" "$LIVE/src" "$LIVE/public" "$CONFIG"; do
  [[ ! -L "$path" ]] || fail "Caminho simbolico inesperado: $path"
done
systemctl is-active --quiet "$SERVICE" || fail "Servico nao estava ativo antes do deploy."

install -d -o root -g root -m 0700 "$STATE"
exec 9>"$STATE/deploy.lock"
flock -n 9 || fail "Outro deploy PTO ja esta em andamento."

# Fonte remota de leitura publica; nao executar scripts da branch como root.
if [[ ! -d "$SOURCE/.git" ]]; then
  git clone --quiet --no-checkout https://github.com/benimezz1/Por-tras-da-oferta-MCP.git "$SOURCE"
fi
[[ "$(git -C "$SOURCE" remote get-url origin)" == "https://github.com/benimezz1/Por-tras-da-oferta-MCP.git" ]] || fail "Repositorio de deploy incorreto."
git -C "$SOURCE" fetch --quiet --no-tags origin main
latest="$(git -C "$SOURCE" rev-parse FETCH_HEAD)"
if [[ "$latest" != "$SHA" ]]; then
  fail "SHA $SHA nao e o ultimo commit da main ($latest). O proximo workflow fara o deploy atualizado."
fi

candidate="$(mktemp -d "$STATE/candidate.XXXXXXXX")"
backup=""
modified=false
cleanup() {
  status=$?
  trap - EXIT
  if (( status != 0 )) && [[ "$modified" == true && -n "$backup" ]]; then
    echo "FALHA: restaurando apenas src, public e package.json do MCP..." >&2
    for item in src public package.json; do
      if [[ -e "$backup/$item" ]]; then
        rm -rf -- "$LIVE/$item"
        cp -a -- "$backup/$item" "$LIVE/$item"
      fi
    done
    systemctl restart "$SERVICE" || echo "ATENCAO: falha ao reiniciar servico apos rollback." >&2
    echo "Rollback executado. Verifique a saude do servico PTO." >&2
  fi
  rm -rf -- "$candidate"
  exit "$status"
}
trap cleanup EXIT

git -C "$SOURCE" archive "$SHA" | tar -xf - -C "$candidate"
for item in src public package.json; do
  [[ -e "$candidate/$item" ]] || fail "Arquivo candidato ausente: $item"
done

# Teste de codigo COM O NODE INSTALADO NA EC2, como usuario nao privilegiado.
# Se a versao do Node local nao suportar a nova versao, abortar SEM implantar.
chmod 0755 "$candidate"
runuser -u pto-oferta -- bash -c '
  set -euo pipefail
  cd "$1"
  for file in src/*.mjs; do node --check "$file"; done
  node --test test/*.test.mjs
' _ "$candidate" || fail "Testes da versao candidata falharam na EC2; deploy bloqueado."

# Backup inclui somente codigo; app.env, data e demais servicos permanecem intactos.
install -d -o root -g root -m 0700 "$STATE/backups"
backup="$(mktemp -d "$STATE/backups/before-$(date -u +%Y%m%dT%H%M%SZ).XXXXXXXX")"
for item in src public package.json; do cp -a -- "$LIVE/$item" "$backup/$item"; done

echo "Implantando commit $SHA exclusivamente em $SERVICE (porta 3201)."
modified=true
for item in src public package.json; do
  rm -rf -- "$LIVE/$item"
  cp -a -- "$candidate/$item" "$LIVE/$item"
done
systemctl restart "$SERVICE"
healthy=false
for attempt in $(seq 1 18); do
  if systemctl is-active --quiet "$SERVICE" &&
    curl --fail --silent --max-time 3 http://127.0.0.1:3201/health | grep -q '"status":"ok"'; then
    healthy=true
    break
  fi
  sleep 2
done
[[ "$healthy" == true ]] || fail "Health local do MCP falhou apos restart."
headers="$(mktemp "$STATE/headers.XXXXXXXX")"
trap 'rm -f "$headers"' RETURN
status="$(curl --silent --show-error --max-time 10 -o /dev/null -D "$headers" -w '%{http_code}' -X OPTIONS \
  http://127.0.0.1:3201/api/c4/client/signup \
  -H "Origin: $ORIGIN" -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: Content-Type")"
[[ "$status" == 204 ]] || fail "CORS OPTIONS local retornou $status (esperado 204)."
tr -d '\r' < "$headers" | grep -Fiqx "Access-Control-Allow-Origin: $ORIGIN" || fail "CORS local nao autorizou o dominio do jogo."
status="$(curl --silent --show-error --max-time 10 -o /dev/null -D "$headers" -w '%{http_code}' \
  http://127.0.0.1:3201/api/c4/client/me -H "Origin: $ORIGIN")"
[[ "$status" == 401 ]] || fail "GET /me local sem token retornou $status (esperado 401)."
tr -d '\r' < "$headers" | grep -Fiqx "Access-Control-Allow-Origin: $ORIGIN" || fail "CORS de /me incorreto."
rm -f "$headers"
modified=false
echo "DEPLOY_COMPLETE $SHA"
echo "Aplicacao atualizada. Dados e app.env preservados. Servicos YoLiga intocados."
