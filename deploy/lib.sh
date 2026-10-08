# Funcoes comuns dos scripts de backup (deploy/backup-*.sh). Carregado com `source deploy/lib.sh`, DEPOIS do `cd`
# para a raiz do projeto: o .env e lido daqui. Uma copia so: antes cada script tinha a sua, e uma correcao numa
# delas precisava ser lembrada na outra.

# Le uma variavel do .env sem `source`: o bcrypt do TINYAUTH_AUTH_USERS tem "$$", que o bash expandiria.
ler_env() { grep -E "^$1=" .env | head -1 | cut -d= -f2- || true; }

# Avisa o healthchecks.io (a URL esta em $AVISO; sufixo "" = deu certo, "/fail" = falhou). Sem URL nao faz nada, e um
# aviso que nao sai nunca derruba o backup.
avisar() { [ -n "${AVISO:-}" ] && curl -fsS -m 10 --retry 3 "${AVISO}$1" >/dev/null || true; }
