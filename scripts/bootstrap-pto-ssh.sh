#!/usr/bin/env bash
# Executar UMA VEZ na EC2 como: sudo bash scripts/bootstrap-pto-ssh.sh /home/ubuntu/.ssh/pto-ghdeploy-actions.pub
# Nao para, altera nem reinicia nenhum servico.
set -Eeuo pipefail
umask 077
[[ "$(id -u)" -eq 0 ]] || { echo "Use sudo para executar bootstrap." >&2; exit 2; }
[[ "$#" -eq 1 && -f "$1" ]] || { echo "Informe o caminho para a chave PUBLICA .pub do GitHub Actions." >&2; exit 2; }

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
[[ -f "$script_dir/pto-deploy-systemd.sh" && -f "$script_dir/pto-ssh-gate.sh" ]] || { echo "Scripts de deploy nao encontrados na mesma pasta." >&2; exit 2; }
[[ "$(systemctl show -p User --value por-tras-da-oferta.service)" == "pto-oferta" ]] || { echo "Servico nao pertence a pto-oferta; abortando." >&2; exit 2; }
[[ "$(systemctl show -p WorkingDirectory --value por-tras-da-oferta.service)" == "/opt/por-tras-da-oferta/app" ]] || { echo "Pasta de producao diferente; abortando." >&2; exit 2; }
[[ -f /opt/por-tras-da-oferta/config/app.env ]] || { echo "Config privada ausente; abortando." >&2; exit 2; }
systemctl is-active --quiet por-tras-da-oferta.service || { echo "MCP nao esta ativo; abortando." >&2; exit 2; }
command -v visudo >/dev/null || { echo "visudo nao encontrado; abortando." >&2; exit 2; }
for file in "$script_dir/pto-deploy-systemd.sh" "$script_dir/pto-ssh-gate.sh"; do bash -n "$file"; done

public_line="$(head -n 1 "$1")"
if [[ ! "$public_line" =~ ^ssh-ed25519[[:space:]]+[A-Za-z0-9+/=]+([[:space:]].*)?$ ]]; then
  echo "Chave publica invalida: esperado ssh-ed25519." >&2
  exit 2
fi
ssh-keygen -lf "$1" >/dev/null || { echo "Chave publica SSH nao validada." >&2; exit 2; }

user=pto-ghdeploy
if ! id -u "$user" >/dev/null 2>&1; then
  useradd --system --create-home --home-dir /var/lib/pto-ghdeploy --shell /bin/bash "$user"
fi
[[ "$(getent passwd "$user" | cut -d: -f6)" == "/var/lib/pto-ghdeploy" ]] || { echo "Usuario dedicado tem home inesperada; abortando." >&2; exit 2; }
[[ "$(getent passwd "$user" | cut -d: -f7)" == "/bin/bash" ]] || { echo "Shell do usuario dedicado inesperado; abortando." >&2; exit 2; }
install -d -m 0700 -o "$user" -g "$user" "/var/lib/pto-ghdeploy/.ssh"

auth_file=/var/lib/pto-ghdeploy/.ssh/authorized_keys
if [[ -s "$auth_file" ]] && ! grep -q '^restrict,command="/usr/local/bin/pto-ssh-gate" ' "$auth_file"; then
  echo "authorized_keys ja tem configuracao diferente; abortando sem substituir." >&2
  exit 2
fi

install -o root -g root -m 0755 "$script_dir/pto-ssh-gate.sh" /usr/local/bin/pto-ssh-gate
install -o root -g root -m 0755 "$script_dir/pto-deploy-systemd.sh" /usr/local/sbin/pto-deploy-systemd

sudoers_line='pto-ghdeploy ALL=(root) NOPASSWD: /usr/local/sbin/pto-deploy-systemd ""'
sudoers_tmp="$(mktemp)"
trap 'rm -f "$sudoers_tmp"' EXIT
printf '%s\n' "$sudoers_line" > "$sudoers_tmp"
chmod 0440 "$sudoers_tmp"
visudo -cf "$sudoers_tmp" >/dev/null || { echo "Falha ao validar permissao sudo restrita." >&2; exit 2; }
install -o root -g root -m 0440 "$sudoers_tmp" /etc/sudoers.d/pto-ghdeploy
visudo -cf /etc/sudoers.d/pto-ghdeploy >/dev/null

printf 'restrict,command="/usr/local/bin/pto-ssh-gate" %s\n' "$public_line" > "$auth_file"
chown "$user:$user" "$auth_file"
chmod 0600 "$auth_file"
usermod -L "$user" >/dev/null 2>&1 || true

echo "OK: usuario isolado $user com chave publica restrita ao deploy do PTO."
echo "OK: sudo restrito ao instalador de /opt/por-tras-da-oferta."
echo "Nenhum servico foi reiniciado. Nenhuma configuracao do YoLiga foi modificada."
echo "Fingerprint do host SSH (comparar com coleta independente):"
ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub -E sha256
