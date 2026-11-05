#!/usr/bin/env bash
# Chave do GitHub Actions e restrita a 'deploy <SHA40>'.
set -Eeuo pipefail
[[ -z "${SSH_TTY:-}" ]] || { echo "Sessao interativa nao permitida." >&2; exit 2; }
original="${SSH_ORIGINAL_COMMAND:-}"
if [[ ! "$original" =~ ^deploy\ ([a-f0-9]{40})$ ]]; then
  echo "Acesso SSH restrito: somente deploy de commit aprovado." >&2
  exit 2
fi
printf '%s\n' "${BASH_REMATCH[1]}" | sudo -n /usr/local/sbin/pto-deploy-systemd
