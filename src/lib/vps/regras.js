/**
 * Regras do cartao "Servidor VPS" (Integracoes): atualizar a VPS (deploy) e atualizar o banco do PC a partir dela.
 *
 * SEM imports: lido pela tela, pelas Server Actions, pelo ajudante `scripts/vps-copiar-banco.js` e pelo teste
 * (`npm run teste:vps`). Aqui mora tudo o que e decisao ou leitura de texto; quem fala com o git, o ssh, os processos
 * do Windows e o disco e `executar.js`.
 */

export const VPS_PADRAO = {
  ssh: "rise@179.199.150.221",
  pasta: "/srv/rise/app",
  chave: ".ssh/rise_vps",
};

/// Passo do deploy que o dono ve, na ordem em que o script da VPS os escreve ("== ..." no `deploy-vps.sh`).
export const PASSOS_DO_DEPLOY = [
  { marca: null, rotulo: "Baixando o código" },
  { marca: "== Deploy ", rotulo: "Construindo a imagem e trocando os contêineres" },
  { marca: "== Migration pendente", rotulo: "Aplicando a migration do banco" },
  { marca: "== Conferindo o site", rotulo: "Conferindo o site" },
  { marca: "== De fora:", rotulo: "Conferindo o login de fora" },
  { marca: "== No ar:", rotulo: "Concluído" },
];

/// Passos do "Atualizar banco do PC", na ordem: o ajudante (`scripts/vps-copiar-banco.js`) grava estes textos, e a
/// tela os lista. Um texto so, nos dois lados.
export const PASSOS_DA_COPIA = {
  dump: "Tirando um backup de agora na VPS",
  parar: "Parando o servidor do PC",
  restaurar: "Restaurando o banco do PC",
  migrations: "Aplicando as migrations deste código no banco do PC",
  religar: "Religando o servidor do PC",
};

const SEM_COR = /\u001b\[[0-9;]*[A-Za-z]/g;

// ---------------------------------------------------------------- onde o botao pode funcionar

const HOSTS_LOCAIS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

/// O host do cabecalho `Host` sem a porta. `[::1]:3000` mantem os colchetes.
export function hostSemPorta(host) {
  const texto = String(host ?? "").trim().toLowerCase();
  if (texto.startsWith("[")) {
    const fim = texto.indexOf("]");
    return fim === -1 ? texto : texto.slice(0, fim + 1);
  }
  return texto.split(":")[0];
}

/// A imagem de producao carrega RISE_PRODUCAO=1 (Dockerfile). O cartao nunca aparece nela, e as acoes recusam:
/// a producao nao pode oferecer atualizar a si mesma nem apagar o proprio banco.
export function emProducao(env) {
  const valor = String(env?.RISE_PRODUCAO ?? "").trim();
  return valor !== "" && valor !== "0";
}

/// So o Rise de desenvolvimento aberto em localhost. O servidor do PC tambem escuta na rede local, entao um
/// acesso por `192.168.x.x` ou por nome nao pode acionar estes botoes.
export function ehOPcDeDesenvolvimento(env, host) {
  return !emProducao(env) && HOSTS_LOCAIS.has(hostSemPorta(host));
}

// ---------------------------------------------------------------- git

/**
 * Le a saida de `git status --porcelain=v1 -b --untracked-files=no`.
 * Arquivo novo sem acompanhar fica de fora de proposito: nao muda o que sobe para a VPS.
 */
export function lerStatusDoGit(texto) {
  const linhas = String(texto ?? "").split(/\r?\n/).filter((linha) => linha.length > 0);
  const cabecalho = linhas.find((linha) => linha.startsWith("## ")) ?? "";
  const alterados = linhas.filter((linha) => !linha.startsWith("## ")).map((linha) => linha.slice(3).trim());

  const corpo = cabecalho.slice(3);
  const semRamo = /^HEAD \(no branch\)/.test(corpo) || corpo.startsWith("No commits yet");
  const [ramoETrilha, contas = ""] = corpo.split(/ \[(.*)\]$/);
  const [ramo, upstream = null] = ramoETrilha.split("...");
  const numero = (nome) => Number(new RegExp(`${nome} (\\d+)`).exec(contas)?.[1] ?? 0);

  return {
    ramo: semRamo ? null : ramo.trim() || null,
    upstream: upstream ? upstream.trim() : null,
    aFrente: numero("ahead"),
    atras: numero("behind"),
    alterados,
  };
}

/// Nomes das pastas de migration que aparecem numa lista de arquivos (`git diff --name-only`).
export function migrationsNovas(arquivos) {
  const nomes = new Set();
  for (const caminho of arquivos ?? []) {
    const partes = String(caminho).replace(/\\/g, "/").split("/");
    if (partes[0] === "prisma" && partes[1] === "migrations" && partes.length >= 4) nomes.add(partes[2]);
  }
  return [...nomes].sort();
}

// ---------------------------------------------------------------- a VPS

/// A resposta do comando de leitura da VPS: uma linha `chave=valor` por dado.
export function lerSaidaDaVps(texto) {
  const dados = {};
  for (const linha of String(texto ?? "").split(/\r?\n/)) {
    const posicao = linha.indexOf("=");
    if (posicao <= 0) continue;
    const chave = linha.slice(0, posicao).trim();
    if (!/^[a-z_]+$/.test(chave)) continue;
    dados[chave] = linha.slice(posicao + 1).trim();
  }
  const inteiro = (valor) => (/^\d+$/.test(valor ?? "") ? Number(valor) : null);
  // ~/logs/deploy.log guarda "<versao> <commit curto>" por deploy; a ultima linha e o que esta no ar.
  const [versaoNoAr = null, commitNoAr = null] = String(dados.ultimo_deploy ?? "").split(/\s+/);
  return {
    commit: /^[0-9a-f]{7,40}$/.test(dados.commit ?? "") ? dados.commit : null,
    versaoNoAr: versaoNoAr || null,
    commitNoAr: commitNoAr || null,
    varreduras: inteiro(dados.varreduras),
    naFila: inteiro(dados.na_fila),
    disco: dados.disco || null,
    deployEmAndamento: dados.deploy_rodando === "1",
  };
}

/**
 * O que a VPS responde, num `ssh ... bash -s` so: o commit do codigo, a ultima linha do deploy.log, se ha deploy
 * rodando, o disco e as varreduras. O psql roda DENTRO do conteiner do banco, com o usuario dele, e le o SQL de um
 * heredoc: sem isso o `docker compose exec` engoliria o resto deste script, que chega pelo stdin do ssh.
 * `[d]eploy-vps.sh`: o colchete impede o pgrep de achar a si mesmo.
 */
export function scriptDeLeituraDaVps(pasta = VPS_PADRAO.pasta) {
  return [
    `cd ${pasta} || exit 1`,
    `echo "commit=$(git rev-parse --short HEAD 2>/dev/null)"`,
    `echo "ultimo_deploy=$(tail -n 1 "$HOME/logs/deploy.log" 2>/dev/null)"`,
    `if pgrep -f '[d]eploy-vps.sh' >/dev/null; then echo deploy_rodando=1; else echo deploy_rodando=0; fi`,
    `echo "disco=$(df -h / | awk 'NR==2{print $5}')"`,
    `docker compose exec -T db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tA -F=' <<'SQL'`,
    `SELECT 'varreduras', count(*) FROM "Job" WHERE tipo = 'coleta' AND status = 'PROCESSANDO';`,
    `SELECT 'na_fila', count(*) FROM "Job" WHERE tipo = 'coleta' AND status = 'PENDENTE';`,
    `SQL`,
    // O codigo de saida e o do ultimo comando: um psql que falhe nao pode fazer a VPS parecer fora do ar.
    `true`,
  ].join("\n");
}

/**
 * Liga o deploy NA VPS, em segundo plano e desligado do SSH (`setsid nohup`): o build leva minutos, e a conexao do PC
 * pode cair sem derruba-lo. O codigo e baixado ANTES de rodar o script, porque o proprio script pode ter mudado. O
 * log vai para ~/logs (do host, fora de `dados/`), e a ultima linha `== FIM codigo=N` diz como terminou.
 */
export function scriptDoDeploy(pasta = VPS_PADRAO.pasta) {
  return [
    `mkdir -p "$HOME/logs"`,
    `if pgrep -f '[d]eploy-vps.sh' >/dev/null; then echo "erro=ja ha um deploy rodando"; exit 0; fi`,
    `LOG="$HOME/logs/deploy-botao-$(date +%Y%m%d-%H%M%S).log"`,
    `setsid nohup bash -c 'cd ${pasta} && git fetch -q --tags origin && git checkout -q --detach origin/main && ./deploy/deploy-vps.sh; echo "== FIM codigo=$?"' > "$LOG" 2>&1 < /dev/null &`,
    `echo "log=$LOG"`,
  ].join("\n");
}

/// O dump de AGORA do banco da VPS, pela saida padrao do ssh (nada fica gravado na VPS). `< /dev/null`: o mesmo
/// motivo do heredoc acima.
export function scriptDoDump(pasta = VPS_PADRAO.pasta) {
  return [
    `cd ${pasta} || exit 1`,
    `docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom --no-owner' < /dev/null`,
  ].join("\n");
}

/// O log de deploy que o PC le de volta: so o nome que `scriptDoDeploy` gera, numa pasta `logs` de um usuario.
export function caminhoDeLogValido(caminho) {
  return /^\/home\/[a-z_][a-z0-9_-]*\/logs\/deploy-botao-\d{8}-\d{6}\.log$/.test(String(caminho ?? ""));
}

/// As linhas do `npm run copia:atualizar` que a tela mostra no fim.
export function resumoDaCopia(texto) {
  const linhas = String(texto ?? "").split(/\r?\n/).map((linha) => linha.trim());
  return {
    pronta: linhas.find((linha) => linha.startsWith("Copia pronta em ")) ?? null,
    recusa: linhas.find((linha) => /^Recusado|recusad/i.test(linha)) ?? null,
  };
}

// ---------------------------------------------------------------- decisoes

/// Dois commits curtos sao o mesmo quando um comeca pelo outro (o git encurta para 7, ou mais se houver ambiguidade).
export function mesmoCommit(a, b) {
  const x = String(a ?? "").trim().toLowerCase();
  const y = String(b ?? "").trim().toLowerCase();
  return x.length >= 7 && y.length >= 7 && (x.startsWith(y) || y.startsWith(x));
}

/**
 * Pode atualizar a VPS agora? Devolve os `bloqueios` (impedem), os `avisos` (o dono confirma sabendo) e `nada`
 * (a VPS ja roda o que esta no GitHub). A VPS sempre recebe `origin/main` do GitHub, nunca o que esta so no PC.
 *
 * O que esta so no PC (arquivo sem commit, commit nao enviado) e AVISO, nao bloqueio: varias sessoes trabalham nesta
 * pasta ao mesmo tempo, quase sempre ha arquivo de alguma delas pela metade, e ele simplesmente nao sobe. O aviso diz
 * isso, para ninguem achar que a mudanca de agora foi junto.
 */
export function decidirDeploy({ git, commitDoGithub, githubLido = true, vps, outraOperacao = null, migrations = [] }) {
  const bloqueios = [];
  const avisos = [];
  let nada = false;

  if (outraOperacao) bloqueios.push(outraOperacao);
  if (!commitDoGithub) bloqueios.push("Não consegui ler a origin/main do GitHub neste PC.");
  if (!githubLido) avisos.push("Não consegui atualizar a leitura do GitHub agora: a lista do que sobe pode estar velha.");

  if (git) {
    if (git.alterados.length > 0) {
      const mostra = git.alterados.slice(0, 5).join(", ");
      const resto = git.alterados.length > 5 ? ` e mais ${git.alterados.length - 5}` : "";
      avisos.push(
        `${git.alterados.length} arquivo(s) alterado(s) neste PC sem commit NÃO vão para a VPS (só vai o que está no GitHub): ${mostra}${resto}.`,
      );
    }
    if (git.aFrente > 0) {
      avisos.push(`${git.aFrente} commit(s) deste PC ainda não estão no GitHub e NÃO vão. Peça ao Claude para enviar.`);
    }
  }

  if (!vps?.alcancavel) {
    bloqueios.push(`Não consegui falar com a VPS${vps?.erro ? `: ${vps.erro}` : "."}`);
  } else {
    if (vps.deployEmAndamento) bloqueios.push("Já há um deploy rodando na VPS.");
    if (commitDoGithub && mesmoCommit(vps.commitNoAr, commitDoGithub)) {
      nada = true;
      bloqueios.push("A VPS já roda o que está no GitHub. Não há o que atualizar.");
    }
    if (vps.varreduras > 0) {
      avisos.push(
        `${vps.varreduras} varredura(s) em andamento na VPS: o worker reinicia e retoma de onde parou, perdendo no máximo 9 produtos por loja.`,
      );
    }
  }
  if (migrations.length > 0) {
    avisos.push(
      `Esta atualização traz ${migrations.length} mudança(s) no banco (migration): ${migrations.join(", ")}. Migration não tem volta; o deploy tira um backup antes.`,
    );
  }

  return { pode: bloqueios.length === 0, bloqueios, avisos, nada };
}

/**
 * Pode trazer o banco da VPS para o PC? O dump e tirado na hora, na VPS: ela tem que responder, e um deploy rodando
 * pode estar no meio de uma migration.
 */
export function decidirCopia({ vps, outraOperacao = null }) {
  const bloqueios = [];
  if (outraOperacao) bloqueios.push(outraOperacao);
  if (!vps?.alcancavel) bloqueios.push(`Não consegui falar com a VPS${vps?.erro ? `: ${vps.erro}` : "."}`);
  else if (vps.deployEmAndamento) bloqueios.push("Há um deploy rodando na VPS: espere ele terminar.");
  return { pode: bloqueios.length === 0, bloqueios };
}

// ---------------------------------------------------------------- saida do deploy

/**
 * Le o texto que o `deploy-vps.sh` escreveu ate agora: em que passo esta, se terminou bem, a versao no ar e,
 * se parou, o passo e os comandos de volta atras que a trap do script imprime.
 */
export function lerSaidaDoDeploy(texto) {
  const linhas = String(texto ?? "").replace(SEM_COR, "").split(/\r?\n/);
  let passo = PASSOS_DO_DEPLOY[0].rotulo;
  let versao = null;
  let commit = null;
  let externos = null;
  let parou = null;
  let voltar = [];

  linhas.forEach((linha, indice) => {
    for (const item of PASSOS_DO_DEPLOY) {
      if (item.marca && linha.startsWith(item.marca)) passo = item.rotulo;
    }
    const noAr = /^== No ar: Versao (\S+) \(commit (\S+)\)/.exec(linha);
    if (noAr) [, versao, commit] = noAr;
    if (linha.startsWith("== De fora:")) externos = linha.slice("== De fora:".length).trim();
    const falha = /^== O DEPLOY PAROU no passo: (.+) \(linha (\d+)\)/.exec(linha);
    if (falha) {
      parou = { passo: falha[1], linha: Number(falha[2]) };
      voltar = [];
      for (const seguinte of linhas.slice(indice + 1)) {
        if (/^\s{2,}\S/.test(seguinte)) voltar.push(seguinte.trim());
        else break;
      }
    }
  });

  return { passo, ok: Boolean(versao) && !parou, versao, commit, externos, parou, voltar };
}

/// O codigo de saida do deploy rodando em segundo plano na VPS: a ultima linha `== FIM codigo=N` do arquivo de log.
export function codigoDeSaidaDoLog(texto) {
  const todas = [...String(texto ?? "").matchAll(/^== FIM codigo=(\d+)\s*$/gm)];
  return todas.length > 0 ? Number(todas[todas.length - 1][1]) : null;
}

// ---------------------------------------------------------------- estado gravado em disco

/// Um estado "rodando" cujo ajudante parou de dar sinal (morreu, ou o PC dormiu) nao pode bloquear para sempre.
/// O deploy nao tem ajudante no PC (roda na VPS): quem diz se ele acabou e o log dele, lido a cada consulta.
export function estadoDaOperacao(estado, agora = Date.now(), limiteMs = 90_000) {
  if (!estado) return null;
  if (estado.fase !== "rodando" || estado.tipo === "deploy") return estado;
  const ultimo = Date.parse(estado.batimento ?? estado.inicio ?? "");
  if (Number.isFinite(ultimo) && agora - ultimo <= limiteMs) return estado;
  return { ...estado, fase: "travado", mensagem: "O ajudante parou de responder. Confira o log." };
}

// ---------------------------------------------------------------- processos (Windows)

/**
 * Quem matar para parar o servidor do PC. `tabela` e a lista `{pid, ppid}` de todos os processos, `raizes` os
 * pids que escutam nas portas do Rise, `proteger` os pids que NAO podem morrer (o proprio ajudante, que nasceu
 * do servidor, e tudo o que veio dele). Devolve os filhos antes dos pais.
 */
export function pidsParaParar(tabela, raizes, proteger = []) {
  const filhosDe = new Map();
  for (const { pid, ppid } of tabela ?? []) {
    if (!filhosDe.has(ppid)) filhosDe.set(ppid, []);
    filhosDe.get(ppid).push(pid);
  }
  const salvos = new Set();
  const salvar = (pid) => {
    if (salvos.has(pid)) return;
    salvos.add(pid);
    for (const filho of filhosDe.get(pid) ?? []) salvar(filho);
  };
  for (const pid of proteger) salvar(pid);

  const ordem = [];
  const visto = new Set();
  const descer = (pid) => {
    if (visto.has(pid) || salvos.has(pid)) return;
    visto.add(pid);
    for (const filho of filhosDe.get(pid) ?? []) descer(filho);
    ordem.push(pid);
  };
  for (const pid of raizes ?? []) descer(pid);
  return ordem;
}

/**
 * A tabela de processos do Windows, do `Get-CimInstance Win32_Process | ConvertTo-Json` (lista, ou um objeto so):
 * `{pid, ppid, nome, comando}`.
 */
export function lerTabelaDeProcessos(json) {
  let dados;
  try {
    dados = JSON.parse(String(json ?? ""));
  } catch {
    return [];
  }
  const lista = Array.isArray(dados) ? dados : dados ? [dados] : [];
  return lista
    .map((item) => ({
      pid: Number(item?.ProcessId),
      ppid: Number(item?.ParentProcessId),
      nome: String(item?.Name ?? ""),
      comando: String(item?.CommandLine ?? ""),
    }))
    .filter((item) => Number.isInteger(item.pid) && item.pid > 0);
}

/// Processo que faz parte do servidor de desenvolvimento: o node ou o cmd do `npm run dev` / `next dev`.
const ehDoServidor = (processo) =>
  /^(node|cmd)\.exe$/i.test(processo.nome) && /next|npm|start-server/i.test(processo.comando);

/**
 * A raiz de cada servidor do Rise: de quem escuta na porta, sobe pelos pais enquanto eles forem o `npm run dev` e o
 * `next dev` (node ou cmd). Para no primeiro que nao e (o Claude, o PowerShell, o Explorer), que NAO pode morrer.
 * Matar so quem escuta deixaria o `next dev` pai vivo, e ele religaria o servidor no meio da copia.
 */
export function raizesDoServidor(tabela, escutando) {
  const porPid = new Map((tabela ?? []).map((processo) => [processo.pid, processo]));
  const raizes = new Set();
  for (const pid of escutando ?? []) {
    let atual = porPid.get(pid);
    if (!atual) continue;
    for (let passos = 0; passos < 10; passos++) {
      const pai = porPid.get(atual.ppid);
      if (!pai || !ehDoServidor(pai)) break;
      atual = pai;
    }
    raizes.add(atual.pid);
  }
  return [...raizes];
}

/**
 * Quem NAO pode morrer junto com o servidor: o proprio ajudante e os workers (o `worker-pc.js` do botao "Varrer
 * agora" nasce do servidor e varre gravando na VPS; o banco do PC nao e dele). `pidsParaParar` protege tambem os
 * filhos de cada um (o supervisor, o tunel SSH).
 */
export function protegidosDoServidor(tabela, ajudante) {
  const protegidos = new Set([ajudante]);
  for (const processo of tabela ?? []) {
    if (/scripts[\\/]+(worker|worker-pc|worker-processo)\.js/i.test(processo.comando)) protegidos.add(processo.pid);
  }
  return [...protegidos];
}

/// Quem escuta nas portas do Rise de desenvolvimento (as tres pastas de trabalho), pelo `netstat -ano` do Windows.
export function pidsEscutando(textoDoNetstat, portas = [3000, 3001, 3002]) {
  const pids = new Set();
  for (const linha of String(textoDoNetstat ?? "").split(/\r?\n/)) {
    const campos = linha.trim().split(/\s+/);
    if (campos.length < 5 || !/^LISTENING$/i.test(campos[3])) continue;
    const porta = Number(campos[1].slice(campos[1].lastIndexOf(":") + 1));
    if (portas.includes(porta) && /^\d+$/.test(campos[4])) pids.add(Number(campos[4]));
  }
  return [...pids];
}
