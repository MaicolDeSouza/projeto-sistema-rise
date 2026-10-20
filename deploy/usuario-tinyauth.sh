#!/usr/bin/env bash
# Cria, troca a senha ou remove um login do Tinyauth (a tela de login do Rise na VPS), sem editar o .env a mao (pedido do
# dono em 20/10/2026, Opcao 3: ate o Rise ter a tela "Definir senha"). Roda NA VPS, pelo SSH, e pede a senha escondida
# no terminal: ela nunca aparece num comando, no historico do shell nem num processo (vai ao htpasswd pela entrada).
#
#   ssh -t -i ~/.ssh/rise_vps rise@179.199.150.221 "cd /srv/rise/app && git fetch -q origin && git show origin/main:deploy/usuario-tinyauth.sh | bash -s -- andrea"
#
#   <login>             cria o login, ou troca a senha se ele ja existe
#   --remover <login>   tira o login (o ultimo nunca sai: sem usuario o Tinyauth nao sobe e o Rise fica fechado)
#   --listar            so os nomes, nunca os codigos
#   --simular <login>   faz tudo numa copia do .env, com uma senha aleatoria, mostra a linha nova sem os codigos e nao muda nada
#
# O login do Tinyauth e o que chega ao Rise como Remote-User: precisa ser o mesmo login do usuario em Configuracoes ›
# Usuarios (o Rise compara sem diferenciar maiusculas). O .env usa "$$" no lugar de "$" (interpolacao do compose).
set -euo pipefail
# Todo `docker` le de /dev/null: com o script chegando pela entrada do bash (`git show ... | bash -s`), um `docker compose
# exec` leria o resto do script como entrada dele (armadilha anotada no CLAUDE.md na migracao de 09/10/2026).
cd /srv/rise/app 2>/dev/null || cd "$(dirname "$0")/.."
[ -f .env ] || { echo "Sem .env aqui ($(pwd)): rode na VPS, em /srv/rise/app." >&2; exit 1; }

modo="criar"
case "${1:-}" in
  --remover) modo="remover"; login="${2:-}" ;;
  --listar) modo="listar"; login="" ;;
  --simular) modo="simular"; login="${2:-}" ;;
  ""|-h|--help) sed -n '2,15p' "$0" 2>/dev/null || true; exit 1 ;;
  *) login="$1" ;;
esac

linha_atual() { grep -E '^TINYAUTH_AUTH_USERS=' .env | head -1 | cut -d= -f2- || true; }

if [ "$modo" = "listar" ]; then
  linha_atual | tr ',' '\n' | cut -d: -f1 | sed '/^$/d'
  exit 0
fi

# Minusculas, numeros, ponto, hifen e sublinhado: o mesmo que o login do Rise aceita, e nada que quebre a linha do .env.
if ! [[ "$login" =~ ^[a-z0-9][a-z0-9._-]{1,39}$ ]]; then
  echo "Login inválido: use de 2 a 40 letras minúsculas, números, ponto, hífen ou sublinhado (ex.: andrea)." >&2
  exit 1
fi

codigo=""
if [ "$modo" = "criar" ] || [ "$modo" = "simular" ]; then
  if [ "$modo" = "simular" ]; then
    senha="$(openssl rand -hex 16)"
  else
    { true </dev/tty; } 2>/dev/null || { echo "Sem terminal para digitar a senha: rode com ssh -t. Nada foi mudado." >&2; exit 1; }
    read -rsp "Senha nova para $login: " senha < /dev/tty; echo
    read -rsp "Repita a senha: " repetida < /dev/tty; echo
    [ "$senha" = "$repetida" ] || { echo "As senhas não conferem. Nada foi mudado." >&2; exit 1; }
    unset repetida
    # Sem minimo de tamanho (decisao do dono em 20/10/2026); so a senha vazia e recusada.
    [ -n "$senha" ] || { echo "Senha vazia. Nada foi mudado." >&2; exit 1; }
  fi
  # bcrypt custo 10, o formato que o Tinyauth le ($2y$). A senha vai pela entrada (-i), nunca pelos argumentos.
  codigo="$(printf '%s' "$senha" | htpasswd -niBC 10 "$login" | tr -d '\r\n')"
  unset senha
  [[ "$codigo" =~ ^"$login":\$2y\$10\$.{53}$ ]] || { echo "O htpasswd não devolveu o código esperado. Nada foi mudado." >&2; exit 1; }
fi

# A linha nova sai de um python que le o .env, troca SO a linha do Tinyauth e grava ao lado; os dados vao por variavel de
# ambiente (nunca no texto do comando). Codigo com "$" vira "$$".
destino=".env.novo-tinyauth"
# Com set -e, a recusa do python (codigo 2, a frase no stderr) encerra o script sem mudar nada.
LOGIN="$login" CODIGO="$codigo" MODO="$modo" DESTINO="$destino" python3 - <<'PY'
import os, sys
login, codigo, modo, destino = os.environ["LOGIN"], os.environ["CODIGO"], os.environ["MODO"], os.environ["DESTINO"]
with open(".env", encoding="utf-8") as arquivo:
    linhas = arquivo.read().split("\n")
chave = "TINYAUTH_AUTH_USERS="
indices = [i for i, linha in enumerate(linhas) if linha.startswith(chave)]
atual = linhas[indices[0]][len(chave):].strip().strip('"') if indices else ""
entradas = [e for e in atual.split(",") if e]
outras = [e for e in entradas if e.split(":", 1)[0].lower() != login]
existia = len(outras) != len(entradas)
# Trocar a senha mantem o nome como estava escrito ("Maicol" continua "Maicol"): o nome e o Remote-User que o Rise
# recebe, e o RISE_AI_ADMINS do .env foi escrito com ele.
nome = next((e.split(":", 1)[0] for e in entradas if e.split(":", 1)[0].lower() == login), login)
if modo == "remover":
    if not existia:
        print(f"O login {login} não está no Tinyauth. Nada foi mudado.", file=sys.stderr); sys.exit(2)
    if not outras:
        print("Esse é o último login: sem nenhum o Tinyauth não sobe e o Rise fica fechado. Nada foi mudado.", file=sys.stderr); sys.exit(2)
    novas = outras
else:
    novas = outras + [nome + ":" + codigo.split(":", 1)[1].replace("$", "$$")]
nova_linha = chave + ",".join(novas)
if indices:
    linhas[indices[0]] = nova_linha
else:
    linhas.append(nova_linha)
with open(destino, "w", encoding="utf-8") as arquivo:
    arquivo.write("\n".join(linhas))
print("trocou" if existia else "novo")
PY
chmod --reference=.env "$destino"

if [ "$modo" = "simular" ]; then
  echo "Simulação: a linha nova seria (códigos escondidos):"
  grep -E '^TINYAUTH_AUTH_USERS=' "$destino" | sed -E 's/\$\$2y\$\$[0-9]{2}\$\$[A-Za-z0-9.\/]{53}/<código>/g'
  echo "Fora essa linha, o .env não muda: $(diff <(grep -vE '^TINYAUTH_AUTH_USERS=' .env) <(grep -vE '^TINYAUTH_AUTH_USERS=' "$destino") >/dev/null && echo confere || echo DIFERENTE)."
  rm -f "$destino"
  exit 0
fi

copia="$HOME/.env.antes-tinyauth-$(date +%Y%m%d-%H%M%S)"
cp -p .env "$copia"
mv "$destino" .env
echo "Cópia do .env de antes: $copia"

# So o login reinicia (alguns segundos); o Rise, o worker e o banco nao.
if ! docker compose up -d --force-recreate auth </dev/null >/dev/null 2>&1; then
  echo "O Tinyauth não subiu: voltando o .env de antes." >&2
  cp -p "$copia" .env && docker compose up -d --force-recreate auth </dev/null >/dev/null 2>&1 || true
  exit 1
fi
sleep 3
if docker compose exec -T auth sh -c 'echo "$TINYAUTH_AUTH_USERS"' </dev/null | tr ',' '\n' | cut -d: -f1 | grep -qx "$login"; then
  [ "$modo" = "remover" ] && { echo "O Tinyauth ainda tem $login: confira." >&2; exit 1; }
  echo "Pronto: $login entra no Tinyauth."
else
  [ "$modo" = "remover" ] && { echo "Pronto: $login saiu do Tinyauth."; exit 0; }
  echo "O Tinyauth subiu sem o $login: confira o .env (a cópia de antes está acima)." >&2
  exit 1
fi

# O login do Tinyauth sozinho nao abre nada: o Rise precisa do usuario com o mesmo login e uma funcao.
usuario="$(docker compose exec -T db sh -c "psql -U \"\$POSTGRES_USER\" -d \"\$POSTGRES_DB\" -At -c \"SELECT ativo FROM \\\"UsuarioRise\\\" WHERE lower(login) = '$login'\"" < /dev/null 2>/dev/null || true)"
case "$usuario" in
  t) echo "No Rise: o usuário $login existe e está ativo." ;;
  f) echo "Atenção: no Rise o usuário $login está INATIVO (Configurações › Usuários)." ;;
  *) echo "Atenção: no Rise ainda não há o usuário $login. Crie em Configurações › Usuários, com o mesmo login." ;;
esac
