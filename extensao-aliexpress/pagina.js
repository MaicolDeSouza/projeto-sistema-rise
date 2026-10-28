/**
 * Roda DENTRO da pagina "Meus pedidos" do AliExpress (world MAIN), onde a biblioteca do proprio site (`lib.mtop`)
 * existe e assina as chamadas. Dirige a leitura do clique "Enviar ao Rise" (spec 2026-10-28, §6.1):
 * 1. pergunta ao Rise ate que data ler;
 * 2. le as abas "Processando" e "Processado" inteiras e a "Ver tudo" ate o corte, clicando como a pessoa clicaria
 *    (a lista so responde quando e a propria pagina que pede: chamada montada por fora volta vazia, medido em 28/10);
 * 3. manda a lista ao Rise, que devolve de quais pedidos quer detalhe e rastreio;
 * 4. busca esses (no maximo 80 chamadas, uma a cada 1,5 a 3 s) e manda ao Rise.
 * Nada aqui fala com o Rise direto: os pedidos passam pela ponte (ponte.js) e pelo service worker (fundo.js).
 */
(function () {
  if (window.__riseAliExpress) return;
  window.__riseAliExpress = true;

  const L = window.RiseLeitura;
  const LISTA = "mtop.aliexpress.trade.buyer.order.list";
  const PAGINAS_POR_ABA = 30;
  const CHAMADAS_DIRETAS = 80;
  const ESPERA_LISTA_MS = 15000;

  const pausa = (ms) => new Promise((resolver) => setTimeout(resolver, ms));
  const entre = () => pausa(1500 + Math.random() * 1500);

  // ---------------------------------------------------------------------------
  // Conversa com a ponte (content script ISOLATED)
  // ---------------------------------------------------------------------------

  let proximoId = 0;
  const esperando = new Map();

  function avisar(tipo, dados = {}) {
    window.postMessage({ rise: "ALI-DA-PAGINA", tipo, ...dados }, window.location.origin);
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
    if (evento.source !== window || evento.data?.rise !== "ALI-PARA-PAGINA") return;
    if (evento.data.tipo === "resposta") {
      const resolver = esperando.get(evento.data.id);
      esperando.delete(evento.data.id);
      resolver?.(evento.data.resposta);
    } else if (evento.data.tipo === "iniciar") {
      enviarAoRise().catch((erro) => avisar("fim", { ok: false, erro: erro?.message ?? String(erro) }));
    }
  });

  // ---------------------------------------------------------------------------
  // A biblioteca do site: gancho para capturar as respostas da lista
  // ---------------------------------------------------------------------------

  let capturas = [];
  function instalarGancho() {
    const mtop = window.lib?.mtop;
    if (!mtop?.request) throw new Error("Esta página não é Meus pedidos do AliExpress (ou você não está logado).");
    if (mtop.__riseOriginal) return mtop;
    mtop.__riseOriginal = mtop.request;
    mtop.request = function (params, ...resto) {
      const promessa = mtop.__riseOriginal.call(this, params, ...resto);
      if (params?.api === LISTA) {
        Promise.resolve(promessa).then(
          (resposta) => capturas.push({ ok: true, resposta }),
          () => capturas.push({ ok: false }),
        );
      }
      return promessa;
    };
    return mtop;
  }

  async function esperarLista(antes) {
    const fim = Date.now() + ESPERA_LISTA_MS;
    while (Date.now() < fim) {
      if (capturas.length > antes) return capturas[capturas.length - 1];
      await pausa(250);
    }
    return null;
  }

  /** O elemento mais interno cujo texto casa (as abas trazem a contagem: "Processando (2)"). */
  function acharPorTexto(regex) {
    const candidatos = [...document.querySelectorAll("div, span, a, button, li")].filter((elemento) => regex.test(elemento.textContent.trim()));
    return candidatos.filter((elemento) => !candidatos.some((outro) => outro !== elemento && elemento.contains(outro))).pop() ?? null;
  }

  async function clicarEEsperar(elemento) {
    const antes = capturas.length;
    elemento.click();
    const capturada = await esperarLista(antes);
    if (!capturada?.ok) throw new Error("A lista de pedidos não respondeu. O AliExpress mudou a página?");
    return L.pedidosDaResposta(capturada.resposta?.data);
  }

  /** Le uma aba inteira (ou ate o corte, na "Ver tudo"). */
  async function lerAba(rotulo, { lerDesde = null } = {}) {
    const aba = acharPorTexto(new RegExp(`^${rotulo}(\\s*\\(\\d+\\))?$`));
    if (!aba) throw new Error(`Não achei a aba "${rotulo}". A página está em português?`);
    const pedidos = [];
    let pagina = await clicarEEsperar(aba);
    for (let numero = 1; numero <= PAGINAS_POR_ABA; numero++) {
      pedidos.push(...pagina.pedidos);
      avisar("progresso", { texto: `${rotulo}: ${pedidos.length} pedido(s), página ${numero}` });
      if (!pagina.hasMore || (lerDesde && L.devePararDeLer(pagina.pedidos, lerDesde))) break;
      window.scrollTo(0, document.body.scrollHeight);
      await entre();
      const mais = acharPorTexto(/^Ver mais pedidos$/);
      if (!mais) break;
      pagina = await clicarEEsperar(mais);
    }
    return pedidos;
  }

  async function chamar(mtop, api, tradeOrderId) {
    const resposta = await mtop.__riseOriginal.call(mtop, { api, v: "1.0", type: "GET", data: { tradeOrderId, clientPlatform: "pc", _lang: "pt_BR" } });
    return resposta?.data;
  }

  // ---------------------------------------------------------------------------
  // O clique "Enviar ao Rise"
  // ---------------------------------------------------------------------------

  async function enviarAoRise() {
    const mtop = instalarGancho();
    capturas = [];
    avisar("progresso", { texto: "Perguntando ao Rise até que data ler…" });
    const estado = await rise("GET", "/api/compras/aliexpress/estado");
    if (estado?.status !== 200) throw new Error(estado?.corpo?.erro ?? `O Rise respondeu ${estado?.status ?? "sem resposta"}.`);
    const lerDesde = estado.corpo.lerDesde;

    const porId = new Map();
    // Processando e Processado sao o que esta em andamento: vao inteiras. Da Ver tudo, so a partir do corte.
    for (const [rotulo, opcoes] of [["Processando", {}], ["Processado", {}], ["Ver tudo", { lerDesde }]]) {
      const lidos = await lerAba(rotulo, opcoes);
      for (const pedido of opcoes.lerDesde ? L.aPartirDoCorte(lidos, opcoes.lerDesde) : lidos) porId.set(pedido.orderId, pedido);
      await entre();
    }
    const pedidos = [...porId.values()];
    const emOutraMoeda = pedidos.find((pedido) => pedido.moeda && pedido.moeda !== "BRL");
    if (emOutraMoeda) throw new Error(`A página está em ${emOutraMoeda.moeda}: troque para reais (R$) no AliExpress e tente de novo.`);

    avisar("progresso", { texto: `Enviando ${pedidos.length} pedido(s) ao Rise…` });
    const lista = await rise("POST", "/api/compras/aliexpress/importar", { fase: "lista", lidoEm: new Date().toISOString(), pedidos });
    if (lista?.status !== 200) throw new Error(lista?.corpo?.erro ?? `O Rise respondeu ${lista?.status ?? "sem resposta"}.`);

    // Detalhe e rastreio: o Rise manda os mais novos primeiro; o que passar do teto vai no proximo clique.
    const tarefas = [
      ...lista.corpo.precisaDetalhe.map((id) => ["detalhe", id]),
      ...lista.corpo.precisaRastreio.map((id) => ["rastreio", id]),
    ].slice(0, CHAMADAS_DIRETAS);
    const detalhes = [];
    const rastreios = [];
    let falhas = 0;
    for (const [indice, [tipo, id]] of tarefas.entries()) {
      avisar("progresso", { texto: `Detalhe e rastreio: ${indice + 1} de ${tarefas.length}` });
      try {
        if (tipo === "detalhe") detalhes.push({ orderId: id, ...L.detalheDaResposta(await chamar(mtop, "mtop.aliexpress.trade.buyer.order.detail", id)) });
        else rastreios.push({ orderId: id, ...L.rastreioDaResposta((await chamar(mtop, "mtop.ae.ld.querydetail", id))?.module) });
      } catch {
        falhas++;
      }
      await entre();
    }
    let resumoDetalhes = null;
    if (detalhes.length || rastreios.length) {
      const resposta = await rise("POST", "/api/compras/aliexpress/importar", { fase: "detalhes", detalhes, rastreios });
      if (resposta?.status !== 200) throw new Error(resposta?.corpo?.erro ?? `O Rise respondeu ${resposta?.status ?? "sem resposta"}.`);
      resumoDetalhes = resposta.corpo;
    }

    const r = lista.corpo;
    const partes = [
      `${pedidos.length} pedido(s) lidos`,
      `${r.novos} novo(s)`,
      `${resumoDetalhes?.rastreados ?? 0} rastreio(s)`,
      r.pendentes ? `${r.pendentes} item(ns) sem produto (abra o Rise)` : null,
      r.virtualPendentes ? `${r.virtualPendentes} sem o depósito Virtual` : null,
      falhas ? `${falhas} leitura(s) falharam` : null,
    ].filter(Boolean);
    avisar("fim", { ok: true, texto: partes.join(" · "), avisos: [...(r.avisos ?? []), ...(resumoDetalhes?.avisos ?? [])] });
  }
})();
