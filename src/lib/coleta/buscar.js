import { limitar } from "@/lib/integracoes/httpClient";

import { obter } from "./http";

/**
 * Busca educada de paginas para a secao Mercados.
 *
 * NAO usa requisitar() de src/lib/integracoes/httpClient.js de proposito:
 * aquela funcao grava LogIntegracao, cujo campo `servico` e o enum Servico —
 * um valor "SCRAPER" obrigaria a mexer num enum que o registro de conectores e
 * a tela de Integracoes iteram, e apareceria la um "conector" que nao conecta
 * em nada. Alem disso ela pede Accept: application/json e trunca corpo
 * nao-JSON em 1000 caracteres, inutil para HTML.
 *
 * A fila, por outro lado, e reaproveitada: limitar() e chaveada por string
 * qualquer, entao o dominio serve de chave e cada site recebe uma requisicao a
 * cada dois segundos sem codigo novo.
 */

/// Identifica quem esta visitando. Site que quiser nos bloquear precisa saber
/// o que bloquear — user-agent disfarcado de navegador e o oposto de educado.
export const USER_AGENT =
  process.env.COLETA_USER_AGENT ||
  "SistemaRise/1.0 (coleta de precos para uso proprio)";

/// Teto por requisicao, cobrindo cabecalho E corpo. Configuravel porque 20s e
/// pouco para loja lenta: a santanaimport serve 1,4 MB de home por tras da
/// Cloudflare e variou de 0,4s a 26s em quatro tentativas seguidas — o mesmo
/// endereco, no mesmo minuto.
///
/// O TETO VALE ATE O ULTIMO BYTE DO CORPO. Ate 16/09/2026 o relogio era desligado
/// quando chegavam os cabecalhos, e o corpo era lido sem limite: loja que parasse
/// de mandar bytes no meio da pagina prendia o worker PARA SEMPRE, sem erro e sem
/// log. O sinal (AbortSignal.timeout) vale ate o ultimo byte do corpo.
///
/// As requisicoes NAO usam fetch: ver src/lib/coleta/http.js — o undici do Node
/// derrubava o processo inteiro.
const TIMEOUT_MS = Number(process.env.COLETA_TIMEOUT_MS) || 20000;

/**
 * O sinal de uma requisicao: o teto de tempo, somado ao cancelamento de quem
 * pediu (o worker cancela a varredura ao encerrar ou quando ela para de andar).
 */
function sinalDaRequisicao(sinal) {
  const teto = AbortSignal.timeout(TIMEOUT_MS);
  return sinal ? AbortSignal.any([teto, sinal]) : teto;
}

/** Mensagem de erro de fetch, distinguindo tempo esgotado de cancelamento. */
function mensagemDeFalha(erro, sinal) {
  if (sinal?.aborted) return "Cancelado";
  if (erro?.name === "TimeoutError" || erro?.name === "AbortError") return "Tempo esgotado";
  return String(erro?.message ?? erro);
}

/// Teto de 2 MB. Pagina de produto honesta nao chega perto disso; o limite
/// existe para que um endereco que devolva um dump gigante nao consuma a
/// memoria do worker.
const MAXIMO_BYTES = 2 * 1024 * 1024;

/// Sitemap tem teto proprio: 50 MB, o maximo do protocolo (sitemaps.org).
/// Com o teto de pagina, os dois arquivos principais da Mamute Eletronica (10 MB
/// cada, 18 mil produtos) eram recusados, so o terceiro (0,7 MB) era lido, e a
/// colheita caia na navegacao — que no Magento nao pagina categoria (`?p=` e
/// parametro ruim). Em 17/09/2026 a varredura estava ha 4 h sem produto novo.
const MAXIMO_BYTES_SITEMAP = 50 * 1024 * 1024;

/// Uma requisicao a cada 2s por dominio.
const REQUISICOES = 1;
const JANELA_MS = 2000;

/**
 * Quando cada dominio respondeu pela ultima vez — com sucesso, erro ou tempo
 * esgotado, tanto faz: e o sinal de que a varredura ANDA.
 *
 * Existe para o vigia do worker. O andamento em produtos so aparece nos lacos de
 * pagina, e antes deles ha fases longas sem nenhum: a leitura do catalogo e do
 * sitemap levou mais de dois minutos na Smartkits em 16/09/2026, e numa loja que
 * pede 10 s entre visitas passaria dos dez minutos do vigia — que cancelaria uma
 * varredura legitima. Toda requisicao termina em no maximo TIMEOUT_MS, entao
 * varredura viva atualiza isto a cada poucos segundos, em qualquer fase.
 */
const ultimaRespostaPorDominio = new Map();
export const registrarResposta = (hostname) => ultimaRespostaPorDominio.set(hostname, Date.now());

/** Quando o dominio respondeu pela ultima vez (ms), ou 0. */
export function ultimaRespostaDe(hostname) {
  return ultimaRespostaPorDominio.get(hostname) ?? 0;
}

/// robots.txt muda raramente e vale para o dominio inteiro: reler a cada pagina
/// dobraria o numero de requisicoes que fazemos ao site.
const VALIDADE_ROBOTS_MS = 60 * 60 * 1000;
const robotsPorOrigem = new Map();

// ---------------------------------------------------------------------------
// robots.txt
// ---------------------------------------------------------------------------

/**
 * Interpreta o robots.txt.
 *
 * Junta o grupo do nosso user-agent com o grupo "*", e guarda as regras para
 * que o desempate seja por especificidade: entre um Allow e um Disallow que
 * casam com o mesmo caminho, vence a regra de caminho mais longo.
 */
function interpretarRobots(texto) {
  const regras = [];
  const sitemaps = [];
  let atrasoMs = null;

  // Varias linhas "User-agent:" seguidas formam UM grupo, e as regras que vem
  // depois valem para todos eles. Tratando cada linha como um grupo novo, so a
  // ultima contava: num robots.txt real que lista dezessete agentes antes das
  // regras, o grupo era julgado pelo decimo setimo nome e as regras inteiras
  // eram ignoradas — inclusive um "Disallow: /" que valia para nos.
  let agentesDoGrupo = [];
  let lendoAgentes = false;
  let grupoVale = false;

  const euSou = USER_AGENT.toLowerCase();
  const fecharGrupo = () => {
    grupoVale = agentesDoGrupo.some(
      (agente) => agente === "*" || euSou.includes(agente),
    );
    lendoAgentes = false;
  };

  for (const linhaBruta of texto.split(/\r?\n/)) {
    const linha = linhaBruta.split("#")[0].trim();
    if (!linha) continue;

    const separador = linha.indexOf(":");
    if (separador === -1) continue;

    const campo = linha.slice(0, separador).trim().toLowerCase();
    const valor = linha.slice(separador + 1).trim();

    // Sitemap e global: vale mesmo fora de um grupo que nos interesse.
    if (campo === "sitemap") {
      if (valor) sitemaps.push(valor);
      continue;
    }

    if (campo === "user-agent") {
      if (!lendoAgentes) {
        agentesDoGrupo = [];
        lendoAgentes = true;
      }
      agentesDoGrupo.push(valor.toLowerCase());
      continue;
    }

    if (lendoAgentes) fecharGrupo();
    if (!grupoVale) continue;

    // O site pede um ritmo proprio: respeitar e o minimo, e mais barato que ser
    // bloqueado depois.
    if (campo === "crawl-delay") {
      const segundos = Number(valor.replace(",", "."));
      if (Number.isFinite(segundos) && segundos > 0) atrasoMs = segundos * 1000;
      continue;
    }

    if (campo !== "allow" && campo !== "disallow") continue;

    // "Disallow:" vazio libera tudo — e a forma canonica de dizer "pode".
    if (campo === "disallow" && valor === "") continue;
    if (valor) regras.push({ permite: campo === "allow", caminho: valor });
  }

  return { regras, sitemaps, atrasoMs };
}

function caminhoCasa(regra, caminho) {
  // O robots.txt usa "*" como curinga e "$" como fim de linha. O resto e
  // escapado para que um "." ou "?" no caminho nao vire metacaractere.
  // O "?" chegou a ficar de fora da lista, e "Disallow: /*?*" (a Saravati, que
  // so queria barrar endereco com parametro) virava /.*?.* — quantificador
  // preguicoso, que casa com qualquer caminho: a loja inteira aparecia
  // bloqueada, a home inclusive.
  const padrao = regra
    .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/\\\$$/, "$");

  return new RegExp(`^${padrao}`).test(caminho);
}

async function lerRobots(origem) {
  const guardado = robotsPorOrigem.get(origem);
  if (guardado && Date.now() - guardado.em < VALIDADE_ROBOTS_MS) {
    return guardado.dados;
  }

  let dados = { regras: [], sitemaps: [], atrasoMs: null, acessivel: false };

  try {
    await limitar(new URL(origem).hostname, REQUISICOES, JANELA_MS);

    const resposta = await obter(`${origem}/robots.txt`, {
      cabecalhos: { "User-Agent": USER_AGENT, Accept: "text/plain" },
      sinal: AbortSignal.timeout(TIMEOUT_MS),
      tetoDoCorpo: (status) => (status >= 200 && status < 300 ? MAXIMO_BYTES : 0),
    });

    if (resposta.status >= 200 && resposta.status < 300) {
      const texto = new TextDecoder().decode(resposta.bytes ?? new Uint8Array());
      dados = { ...interpretarRobots(texto), acessivel: true };
    } else {
      // 404 em robots.txt significa "sem restricao declarada", que e diferente
      // de "nao consegui ler". Nos dois casos seguimos, mas so o primeiro e uma
      // permissao de fato — e a tela de cadastro mostra a diferenca.
      dados = { regras: [], sitemaps: [], atrasoMs: null, acessivel: resposta.status === 404 };
    }
  } catch {
    dados = { regras: [], sitemaps: [], atrasoMs: null, acessivel: false };
  }

  registrarResposta(new URL(origem).hostname);
  robotsPorOrigem.set(origem, { em: Date.now(), dados });
  return dados;
}

/**
 * O robots.txt deste site permite visitar esta URL?
 *
 * @returns {Promise<{permitido: boolean, motivo: string|null, sitemaps: string[]}>}
 */
export async function podeVisitar(url) {
  const alvo = new URL(url);
  const robots = await lerRobots(alvo.origin);
  const caminho = `${alvo.pathname}${alvo.search}`;

  const casadas = robots.regras.filter((regra) =>
    caminhoCasa(regra.caminho, caminho),
  );

  if (casadas.length === 0) {
    return { permitido: true, motivo: null, sitemaps: robots.sitemaps };
  }

  // Regra mais especifica vence; empate entre Allow e Disallow vai para Allow,
  // que e o desempate recomendado pelo proprio padrao.
  casadas.sort(
    (a, b) =>
      b.caminho.length - a.caminho.length ||
      Number(b.permite) - Number(a.permite),
  );

  const vencedora = casadas[0];
  return {
    permitido: vencedora.permite,
    motivo: vencedora.permite
      ? null
      : `robots.txt bloqueia "${vencedora.caminho}"`,
    sitemaps: robots.sitemaps,
  };
}

/**
 * Janela entre requisicoes para este dominio.
 *
 * Vale o Crawl-delay quando o site declara um, e nunca menos que o nosso
 * proprio ritmo: se a loja pede dez segundos, dez segundos — pedir mais devagar
 * do que combinamos e educado, mais rapido nao.
 */
async function janelaDe(origem) {
  const robots = await lerRobots(origem);
  return Math.max(JANELA_MS, robots.atrasoMs ?? 0);
}

/** O ritmo que este site pede, em ms, ou null quando nao pede nada. */
export async function ritmoPedido(url) {
  const robots = await lerRobots(new URL(url).origin);
  return robots.atrasoMs;
}

/** Enderecos de sitemap declarados no robots.txt do dominio. */
export async function sitemapsDeclarados(url) {
  const robots = await lerRobots(new URL(url).origin);
  return robots.sitemaps;
}

// ---------------------------------------------------------------------------
// Busca
// ---------------------------------------------------------------------------

/**
 * Le o corpo com teto de tamanho.
 *
 * Le em pedacos em vez de chamar response.text() direto porque text() carrega
 * a resposta inteira antes de devolver: uma pagina de 100 MB seria baixada por
 * completo so para depois ser descartada.
 */
/// Marcas das paginas de desafio anti-bot. Servem para EXPLICAR a recusa, nunca
/// para driblar: um 403 seco parece erro de digitacao ou instabilidade, e o
/// operador fica tentando de novo. Dizer o nome da protecao encerra a duvida.
const MARCAS_DESAFIO = [
  [/just a moment|challenge-platform|cf-browser-verification|cdn-cgi\/challenge/i, "Cloudflare"],
  [/_Incapsula_Resource|incapsula incident/i, "Imperva Incapsula"],
  [/datadome/i, "DataDome"],
  [/px-captcha|perimeterx/i, "PerimeterX"],
  [/errors\.edgesuite\.net|akamai reference/i, "Akamai"],
];

/// So estes status carregam desafio. Ler o corpo de todo erro custaria uma
/// leitura extra em 404 e 500, que sao a maioria e nunca sao desafio.
const STATUS_DE_DESAFIO = new Set([401, 403, 429, 503]);

/**
 * Nomeia a protecao anti-bot que barrou a visita, ou devolve null.
 *
 * O cabecalho vem antes do corpo porque e mais barato e mais confiavel: o
 * cf-ray so existe em resposta que passou pela Cloudflare. O corpo cobre os
 * demais provedores, que nao se anunciam em cabecalho.
 */
function protecaoAntiBot(resposta, corpo) {
  if (!STATUS_DE_DESAFIO.has(resposta.status)) return null;

  if (resposta.cabecalhos["cf-ray"]) return "Cloudflare";

  if (typeof corpo === "string") {
    for (const [marca, nome] of MARCAS_DESAFIO) {
      if (marca.test(corpo)) return nome;
    }
  }

  return null;
}

/// Teto para o corpo de uma resposta de erro. A pagina de desafio cabe folgada
/// nisso, e o limite evita baixar um dump inteiro so para classificar a falha.
const MAXIMO_BYTES_ERRO = 64 * 1024;

/// Charset declarado no cabecalho da resposta. E a fonte mais confiavel: vem do
/// servidor, antes de qualquer byte de conteudo.
function charsetDoCabecalho(cabecalhos) {
  const tipo = cabecalhos["content-type"] ?? "";
  return /charset\s*=\s*["']?([\w-]+)/i.exec(tipo)?.[1]?.toLowerCase() ?? null;
}

/**
 * Charset declarado pela propria pagina.
 *
 * A previa e lida em latin1 de proposito: ali TODO byte e caractere valido,
 * entao a leitura nunca falha, e a declaracao que procuramos e ASCII puro —
 * sobrevive intacta a essa decodificacao provisoria.
 */
function charsetDoHtml(bytes) {
  const previa = new TextDecoder("latin1").decode(bytes.subarray(0, 4096));

  return (
    /<meta[^>]+charset\s*=\s*["']?([\w-]+)/i.exec(previa)?.[1]?.toLowerCase() ??
    /content\s*=\s*["'][^"']*charset\s*=\s*([\w-]+)/i.exec(previa)?.[1]?.toLowerCase() ??
    null
  );
}

/**
 * Corpo da resposta como texto, no charset que a pagina realmente usa.
 *
 * Decodificar tudo como UTF-8 era o erro: a Casa da Robotica serve
 * "charset=ISO-8859-1", e "Modulo Rele" chegava com caractere trocado — o texto
 * ficava assim no banco, nao so na tela. Loja brasileira em Latin-1 ainda e comum
 * o bastante para isso nao ser caso raro.
 *
 * Os bytes sao juntados antes de decodificar porque o charset so se descobre
 * depois de olhar o cabecalho e o inicio do documento.
 *
 * Cabecalhos e nomes de cookie vao junto na resposta (http.js) para a
 * identificacao de plataforma: metade das lojas nao se declara no HTML e se
 * entrega no cabecalho ou no cookie — "powered-by: Shopify", "OCSESSID" do
 * OpenCart. So o NOME do cookie e guardado: o valor e sessao alheia.
 */
function textoDoCorpo(resposta) {
  const bytes = resposta.bytes ?? new Uint8Array();
  const declarado = charsetDoCabecalho(resposta.cabecalhos) ?? charsetDoHtml(bytes) ?? "utf-8";

  try {
    return new TextDecoder(declarado).decode(bytes);
  } catch {
    // Charset que o Node nao conhece (ou escrito errado) nao pode derrubar a
    // coleta: UTF-8 e o palpite menos pior.
    return new TextDecoder("utf-8").decode(bytes);
  }
}

/**
 * Busca uma pagina, respeitando robots.txt e a fila do dominio.
 *
 * `etag` e `vistoEm` vem da coleta anterior: quando o servidor colabora, a
 * pagina que nao mudou responde 304 sem corpo nenhum — e o que torna a
 * revarredura diaria barata.
 *
 * @returns {Promise<{ok: boolean, status: number|null, corpo: string|null,
 *   etag: string|null, naoModificado: boolean, erro: string|null,
 *   duracaoMs: number, urlFinal: string|null,
 *   cabecalhos: Record<string,string>, cookies: string[]}>}
 */
export async function buscarPagina(url, { etag, vistoEm, sinal } = {}) {
  const inicio = Date.now();
  const vazio = {
    ok: false,
    status: null,
    corpo: null,
    etag: null,
    naoModificado: false,
    urlFinal: null,
    protecaoAntiBot: null,
    cabecalhos: {},
    cookies: [],
  };

  let alvo;
  try {
    alvo = new URL(url);
  } catch {
    return { ...vazio, erro: "URL invalida", duracaoMs: 0 };
  }

  const permissao = await podeVisitar(alvo.toString());
  if (!permissao.permitido) {
    return { ...vazio, erro: permissao.motivo, duracaoMs: Date.now() - inicio };
  }

  await limitar(alvo.hostname, REQUISICOES, await janelaDe(alvo.origin));
  if (sinal?.aborted) return { ...vazio, erro: "Cancelado", duracaoMs: Date.now() - inicio };

  const sinalDaBusca = sinalDaRequisicao(sinal);

  try {
    return await requisitarPagina(alvo, { etag, vistoEm, sinal, sinalDaBusca, inicio, vazio });
  } finally {
    registrarResposta(alvo.hostname);
  }
}

async function requisitarPagina(alvo, { etag, vistoEm, sinal, sinalDaBusca, inicio, vazio }) {
  try {
    const cabecalhos = {
      "User-Agent": USER_AGENT,
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "pt-BR,pt;q=0.9",
    };
    if (etag) cabecalhos["If-None-Match"] = etag;
    else if (vistoEm) {
      cabecalhos["If-Modified-Since"] = new Date(vistoEm).toUTCString();
    }

    const resposta = await obter(alvo, {
      cabecalhos,
      sinal: sinalDaBusca,
      mesmoDominio: true,
      // So le o corpo que serve: a pagina, ou o trecho que reconhece o desafio.
      tetoDoCorpo: (status) =>
        status >= 200 && status < 300
          ? MAXIMO_BYTES
          : STATUS_DE_DESAFIO.has(status)
            ? MAXIMO_BYTES_ERRO
            : 0,
    });

    const duracaoMs = Date.now() - inicio;

    // Redirecionamento para fora do dominio escaparia do robots.txt que
    // acabamos de checar. Recusar e mais seguro que seguir: a URL nova pode ser
    // cadastrada como fonte propria, com a checagem dela. Nem chega a ser aberto.
    if (resposta.redirecionouPara) {
      return {
        ...vazio,
        status: resposta.status,
        erro: `Redirecionou para outro dominio (${resposta.redirecionouPara})`,
        duracaoMs,
      };
    }

    if (resposta.status === 304) {
      return {
        ok: true,
        status: 304,
        corpo: null,
        etag: etag ?? null,
        naoModificado: true,
        erro: null,
        duracaoMs,
        urlFinal: resposta.urlFinal,
      };
    }

    if (resposta.status < 200 || resposta.status >= 300) {
      // Um trecho do corpo basta para reconhecer o desafio, e so em status que
      // podem carrega-lo — ver STATUS_DE_DESAFIO.
      const inicioDoCorpo = resposta.bytes ? new TextDecoder().decode(resposta.bytes) : null;
      const protecao = protecaoAntiBot(resposta, inicioDoCorpo);

      return {
        ...vazio,
        status: resposta.status,
        erro: protecao
          ? `Protecao anti-bot (${protecao}) — o site exige execucao de JavaScript e nao pode ser coletado`
          : `HTTP ${resposta.status}`,
        protecaoAntiBot: protecao,
        duracaoMs,
        urlFinal: resposta.urlFinal,
      };
    }

    return {
      ok: true,
      status: resposta.status,
      corpo: textoDoCorpo(resposta),
      etag: resposta.cabecalhos.etag ?? null,
      naoModificado: false,
      erro: null,
      duracaoMs,
      urlFinal: resposta.urlFinal,
      cabecalhos: resposta.cabecalhos,
      cookies: resposta.cookies,
    };
  } catch (erro) {
    return {
      ...vazio,
      erro: mensagemDeFalha(erro, sinal),
      duracaoMs: Date.now() - inicio,
    };
  }
}

/**
 * Busca uma URL devolvendo os bytes crus, com a mesma educacao de
 * buscarPagina.
 *
 * Existe para os sitemaps: os grandes sao servidos como .xml.gz, e o fetch nao
 * descompacta isso sozinho (nao e Content-Encoding, e um arquivo compactado).
 * Ler como texto entregaria binario embaralhado, e o site pareceria nao ter
 * sitemap nenhum.
 *
 * @returns {Promise<{ok: boolean, status: number|null, bytes: Buffer|null,
 *   erro: string|null}>}
 */
export async function buscarBytes(url, { sinal } = {}) {
  let alvo;
  try {
    alvo = new URL(url);
  } catch {
    return { ok: false, status: null, bytes: null, erro: "URL invalida" };
  }

  const permissao = await podeVisitar(alvo.toString());
  if (!permissao.permitido) {
    return { ok: false, status: null, bytes: null, erro: permissao.motivo };
  }

  await limitar(alvo.hostname, REQUISICOES, await janelaDe(alvo.origin));
  if (sinal?.aborted) return { ok: false, status: null, bytes: null, erro: "Cancelado" };

  try {
    return await requisitarBytes(alvo, sinal);
  } finally {
    registrarResposta(alvo.hostname);
  }
}

async function requisitarBytes(alvo, sinal) {
  try {
    // Aqui o redirecionamento para outro dominio E seguido, como sempre foi:
    // sitemap servido por CDN e comum, e o robots.txt ja foi lido na origem.
    // Um byte alem do teto basta para saber que passou, sem baixar o resto.
    const resposta = await obter(alvo, {
      cabecalhos: { "User-Agent": USER_AGENT, Accept: "application/xml,text/xml,*/*" },
      sinal: sinalDaRequisicao(sinal),
      tetoDoCorpo: (status) => (status >= 200 && status < 300 ? MAXIMO_BYTES_SITEMAP + 1 : 0),
    });

    if (resposta.status < 200 || resposta.status >= 300) {
      return { ok: false, status: resposta.status, bytes: null, erro: `HTTP ${resposta.status}` };
    }

    if (resposta.truncado || resposta.bytes.byteLength > MAXIMO_BYTES_SITEMAP) {
      return {
        ok: false,
        status: resposta.status,
        bytes: null,
        erro: `Resposta maior que o limite de ${MAXIMO_BYTES_SITEMAP} bytes`,
      };
    }

    return { ok: true, status: resposta.status, bytes: resposta.bytes, erro: null };
  } catch (erro) {
    return { ok: false, status: null, bytes: null, erro: mensagemDeFalha(erro, sinal) };
  }
}
