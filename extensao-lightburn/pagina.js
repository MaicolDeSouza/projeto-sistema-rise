/**
 * Roda DENTRO da pagina do portal de licencas da LightBurn (world MAIN), onde estao o token da sessao logada e a
 * permissao de chamar a API do portal. Dirige o clique "Enviar ao Rise" (spec 2026-11-05, §6.4):
 * 1. confere a chave com o Rise (GET .../estado);
 * 2. le TODAS as licencas e TODAS as ativacoes da conta pela mesma API que a pagina usa (extensao-lightburn/MEDICAO.md),
 *    pagina a pagina, de 1 a 2 s entre elas, no maximo 200 chamadas;
 * 3. manda ao Rise (POST .../importar) e mostra o resumo.
 *
 * SO LE: todo pedido ao portal e GET. O token vai so para a API da Cryptlex (`baseDaApi` recusa outro endereco) e nunca
 * ao Rise; o Rise recebe so o corpo montado em leitura.js (sem e-mail, nome nem localizacao). Nada aqui fala com o Rise
 * direto: os pedidos passam pela ponte (ponte.js) e pelo service worker (fundo.js).
 */
(function () {
  if (window.__riseLightBurn) return;
  window.__riseLightBurn = true;

  const L = window.RiseLeituraLB;
  const VERSAO = "1.0.0";
  const TETO_DE_CHAMADAS = 200;
  const POR_PAGINA_LICENCAS = 100;
  // 100 ativacoes por pagina nao responderam em 40 s na medicao; 50 levaram ~16 s.
  const POR_PAGINA_ATIVACOES = 50;
  const ESPERA_POR_PAGINA_MS = 60000;

  const pausa = (ms) => new Promise((resolver) => setTimeout(resolver, ms));
  const entre = () => pausa(1000 + Math.random() * 1000);

  // ---------------------------------------------------------------------------
  // Conversa com a ponte (content script ISOLATED)
  // ---------------------------------------------------------------------------

  let proximoId = 0;
  const esperando = new Map();

  function avisar(tipo, dados = {}) {
    window.postMessage({ rise: "LB-DA-PAGINA", tipo, ...dados }, window.location.origin);
  }

  /** Um pedido ao Rise (pela ponte e pelo service worker). Resolve com `{ status, corpo }`. */
  function rise(metodo, caminho, corpo) {
    const id = ++proximoId;
    return new Promise((resolver) => {
      esperando.set(id, resolver);
      avisar("rise", { id, metodo, caminho, corpo });
    });
  }

  window.addEventListener("message", (evento) => {
    if (evento.source !== window || evento.data?.rise !== "LB-PARA-PAGINA") return;
    if (evento.data.tipo === "resposta") {
      const resolver = esperando.get(evento.data.id);
      esperando.delete(evento.data.id);
      resolver?.(evento.data.resposta);
    } else if (evento.data.tipo === "iniciar") {
      enviarAoRise().catch((erro) => avisar("fim", { ok: false, erro: erro?.message ?? String(erro) }));
    }
  });

  // ---------------------------------------------------------------------------
  // A API do portal (so GET)
  // ---------------------------------------------------------------------------

  class SessaoExpirada extends Error {}

  async function pedirPagina({ base, token, caminho, pagina, limite, ordem }) {
    const endereco = `${base}${caminho}?page=${pagina}&limit=${limite}&query=&sort=${encodeURIComponent(ordem)}&include=`;
    const controle = new AbortController();
    const relogio = setTimeout(() => controle.abort(), ESPERA_POR_PAGINA_MS);
    try {
      const resposta = await fetch(endereco, { method: "GET", headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }, signal: controle.signal, credentials: "omit" });
      if (resposta.status === 401 || resposta.status === 403) throw new SessaoExpirada("sessão expirada");
      if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`);
      const lista = await resposta.json();
      if (!Array.isArray(lista)) throw new Error("resposta fora do formato medido");
      const total = Number(resposta.headers.get("pagination-count"));
      return { lista, total: Number.isFinite(total) && total >= 0 ? total : null };
    } finally {
      clearTimeout(relogio);
    }
  }

  /**
   * Le uma lista inteira, pagina a pagina. A pagina que falha e tentada mais uma vez; falhando de novo, a leitura para
   * ali e volta `completa: false` (o Rise atualiza o que veio e nao marca nada como sumido).
   */
  async function lerTudo({ base, token, caminho, limite, ordem, rotulo, contador }) {
    const itens = [];
    for (let pagina = 1; ; pagina++) {
      let resultado = null;
      for (let tentativa = 1; tentativa <= 2 && !resultado; tentativa++) {
        if (contador.chamadas >= TETO_DE_CHAMADAS) return { itens, completa: false };
        contador.chamadas++;
        avisar("progresso", { texto: `${rotulo}: página ${pagina}${tentativa > 1 ? " (de novo)" : ""}…` });
        try {
          resultado = await pedirPagina({ base, token, caminho, pagina, limite, ordem });
        } catch (erro) {
          if (erro instanceof SessaoExpirada) throw erro;
          await pausa(3000);
        }
      }
      if (!resultado) return { itens, completa: false };
      itens.push(...resultado.lista);
      const acabou = resultado.lista.length < limite || (resultado.total !== null && pagina * limite >= resultado.total);
      if (acabou) return { itens, completa: true };
      await entre();
    }
  }

  // ---------------------------------------------------------------------------
  // O clique "Enviar ao Rise"
  // ---------------------------------------------------------------------------

  async function enviarAoRise() {
    const token = window.localStorage.getItem("CTX_AT");
    if (!token) throw new Error("Entre no portal da LightBurn e tente de novo.");
    const base = L.baseDaApi(window.localStorage.getItem("apiBaseUrl"));

    avisar("progresso", { texto: "Conferindo a chave com o Rise…" });
    const estado = await rise("GET", "/api/licencas/lightburn/estado");
    if (estado?.status !== 200) throw new Error(estado?.corpo?.erro ?? `O Rise respondeu ${estado?.status ?? "sem resposta"}.`);

    const contador = { chamadas: 0 };
    let licencas;
    let ativacoes;
    try {
      licencas = await lerTudo({ base, token, caminho: "/v3/me/licenses", limite: POR_PAGINA_LICENCAS, ordem: "-createdAt", rotulo: "Licenças", contador });
      if (!licencas.itens.length) throw new Error("Não consegui ler as licenças do portal. Recarregue a página e tente de novo.");
      await entre();
      ativacoes = await lerTudo({ base, token, caminho: "/v3/me/activations", limite: POR_PAGINA_ATIVACOES, ordem: "+lastSyncedAt", rotulo: "PCs ativados", contador });
    } catch (erro) {
      if (erro instanceof SessaoExpirada) throw new Error("A sessão do portal expirou: recarregue a página do portal (F5), entre se pedir, e clique de novo.");
      throw erro;
    }

    const corpo = L.montarPayload({ licencas: licencas.itens, ativacoesPorLicenca: L.agruparAtivacoes(ativacoes.itens), completa: licencas.completa && ativacoes.completa, versao: VERSAO });
    avisar("progresso", { texto: `Enviando ${corpo.licencas.length} chave(s) ao Rise…` });
    const resposta = await rise("POST", "/api/licencas/lightburn/importar", corpo);
    if (resposta?.status !== 200) throw new Error(resposta?.corpo?.erro ?? `O Rise respondeu ${resposta?.status ?? "sem resposta"}.`);

    const avisos = corpo.completa ? [] : ["Leitura incompleta: alguma página do portal não respondeu. Rode de novo para marcar o que sumiu."];
    avisar("fim", { ok: true, texto: L.textoDoResumo(resposta.corpo), avisos });
  }
})();
