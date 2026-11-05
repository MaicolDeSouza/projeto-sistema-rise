/**
 * Pagina para o dono VINCULAR os produtos nao conferidos aos itens da Fortek e da Nightech (pedido de 05/11/2026; spec em
 * docs/superpowers/specs/2026-11-05-vincular-fornecedores-fortek-nightech-design.md).
 *
 * Le os produtos `ativo` e nao `conferido`, os coletados das duas fontes, e monta por produto: os vinculos que ja existem
 * (marcados e travados), o codigo do rascunho do Bling quando ele existe na fonte (marcado) e os parecidos pela regra da
 * lupa (`buscaPorPalavras`: metade do peso do titulo; com ate 2 palavras todas exigidas; nome de 3+ palavras dentro do
 * titulo tambem entra), ate 4 por fornecedor. Escreve `dados/vincular-fornecedores/index.html` e as fotos pequenas em
 * `fotos/` (sharp, 120 px). A pagina abre do disco, guarda as marcacoes no localStorage e salva
 * `vinculos-fortek-nightech.json`, que `scripts/vincular-fornecedores-aplicar.js` grava no Rise.
 *
 * COMO RODA NA VPS (o arquivo viaja pela entrada do comando; a pasta volta num tar, tudo numa conexao so):
 *
 *   ssh -i ~/.ssh/rise_vps rise@179.199.150.221 "cd /srv/rise/app \
 *     && docker compose exec -T app node --input-type=module - 1>&2 \
 *     && docker compose exec -T app tar -czf - -C /app/dados vincular-fornecedores" \
 *     < scripts/vincular-fornecedores-gerar.js > dados/vincular-fornecedores.tgz
 *
 * No PC: `node scripts/vincular-fornecedores-gerar.js` (usa o .env; a copia do banco do PC pode estar atras da VPS).
 * Opcoes: `--por-fonte=4` (candidatos por fornecedor), `--saida=<pasta>`.
 *
 * Nada e gravado no banco aqui. `VINCULAR_SO_FUNCOES=1` so exporta as funcoes (teste sem banco).
 */
import { existsSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { register } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";

// Na VPS o codigo mora em /app; no PC, na pasta atual.
const RAIZ = existsSync("/app/scripts/resolver-alias.js") ? "/app" : process.cwd();
register(pathToFileURL(`${RAIZ}/scripts/resolver-alias.js`), pathToFileURL(`${RAIZ}/`));

const { casaPalavra, indiceDePalavras, normalizar, notasDeRelevancia, palavrasDoTermo } = await import(pathToFileURL(`${RAIZ}/src/lib/texto.js`).href);
const { custoDoFornecedor } = await import(pathToFileURL(`${RAIZ}/src/lib/coleta/impostos.js`).href);

export { normalizar };

/// A regra da lupa (src/lib/buscaPorPalavras.js): metade do peso do titulo.
export const NOTA_MINIMA = 0.5;
export const POR_FONTE = 4;
/// Sem nenhum parecido pela regra da lupa (e so com 3+ palavras no titulo), a pagina mostra ate 2 por fonte com pelo
/// menos 30% do peso, com o selo "parecido fraco": melhor o dono descartar um palpite do que o produto cair na lista do
/// fim sem nada para marcar (no PC, 743 dos 1.318 nao conferidos ficavam sem candidato).
export const NOTA_FRACA = 0.3;
export const FRACOS_POR_FONTE = 2;

/// O rascunho do Bling as vezes chama a Fortek pelo portal dela (Benser): e a mesma empresa.
const ALIAS_DA_FONTE = { benser: "fortek" };

const texto = (valor) => String(valor ?? "").trim();
const numero = (valor) => (valor == null ? null : Number(valor));
const chaveDe = (fonte, codigo) => `${normalizar(fonte)}|${texto(codigo).toLowerCase()}`;

/** A fonte (pelo nome como esta no banco) que o nome de um fornecedor cita, ou null. */
export function fonteDoNome(nome, fontes) {
  const n = normalizar(nome);
  if (!n) return null;
  const direta = fontes.find((fonte) => n.includes(normalizar(fonte)));
  if (direta) return direta;
  for (const [alias, alvo] of Object.entries(ALIAS_DA_FONTE)) {
    if (n.includes(alias)) {
      const fonte = fontes.find((candidata) => normalizar(candidata) === alvo);
      if (fonte) return fonte;
    }
  }
  return null;
}

/** O fornecedor em rascunho do Bling, quando e uma das fontes: `{ fonte, codigo }`. */
export function codigoDoBling(rascunho, fontes) {
  const codigo = texto(rascunho?.codigo);
  const fonte = fonteDoNome(rascunho?.nome, fontes);
  return fonte && codigo ? { fonte, codigo } : null;
}

/**
 * O acervo das fontes, pronto para a comparacao: cada item com o indice de palavras (`indiceDePalavras` do buscaTexto,
 * como a lupa) e o mapa fonte|codigo -> item. `linhas` sao as linhas de ProdutoColetado com `fonte.nome`.
 */
export function montarAcervo(fontes, linhas) {
  const itens = linhas.map((linha) => ({
    id: linha.id,
    fonte: linha.fonte.nome,
    codigo: texto(linha.codigo) || null,
    nome: texto(linha.nome),
    url: linha.url ?? null,
    // O custo com os impostos, como a lupa mostra (pedido do dono em 23/10/2026).
    preco: custoDoFornecedor(
      { comImpostos: numero(linha.precoComImpostos), normal: numero(linha.precoNormal), promotional: numero(linha.precoPromocional) },
      linha.impostos ?? [],
    ),
    estoque: { pronta: linha.quantidade ?? null, aChegar: linha.aChegar ?? null, previsao: linha.aChegarPrevisao ?? null, montagem: linha.emMontagem ?? null },
    formas: indiceDePalavras(linha.buscaTexto || normalizar(`${linha.nome ?? ""} ${linha.codigo ?? ""}`)),
    palavrasDoNome: palavrasDoTermo(linha.nome),
  }));
  const porChave = new Map();
  for (const item of itens) if (item.codigo) porChave.set(chaveDe(item.fonte, item.codigo), item);
  return { fontes, itens, porChave };
}

/// Fortek: `02-268-A` e o `02-268` com o sufixo da carga (regra `sufixoDeCarga` de src/lib/coleta/fornecedores.js).
function acharNoAcervo(acervo, fonte, codigo) {
  return acervo.porChave.get(chaveDe(fonte, codigo)) ?? acervo.porChave.get(chaveDe(fonte, texto(codigo).replace(/-[A-Z0-9]{1,2}$/i, ""))) ?? null;
}

const ORDEM_DA_ORIGEM = { vinculado: 0, bling: 1, parecido: 2, fraco: 3 };

function candidato(item, extra) {
  return {
    id: item.id ?? null,
    fonte: item.fonte,
    codigo: item.codigo ?? null,
    nome: item.nome ?? "",
    url: item.url ?? null,
    preco: item.preco ?? null,
    estoque: item.estoque ?? { pronta: null, aChegar: null, previsao: null, montagem: null },
    foto: null,
    nota: 0,
    ...extra,
  };
}

/**
 * Os candidatos de um produto, por fonte: primeiro os vinculos que ja existem (travados), depois o codigo do rascunho do
 * Bling (marcado), depois os parecidos pela nota da lupa, ate `porFonte` por fonte no total.
 *
 * `produto`: { sku, tituloBase, fornecedorRascunho, fornecedores: [{ fornecedorNome, codigo, descricao, link }] }.
 */
export function candidatosDoProduto(produto, acervo, { porFonte = POR_FONTE } = {}) {
  const candidatos = [];
  const usados = new Set();
  const contagem = new Map();
  const cabeNaFonte = (fonte) => (contagem.get(fonte) ?? 0) < porFonte;
  const incluir = (item, extra) => {
    if (item.id != null) usados.add(item.id);
    contagem.set(item.fonte, (contagem.get(item.fonte) ?? 0) + 1);
    candidatos.push(candidato(item, extra));
  };

  // 1. O que ja esta vinculado no Rise: aparece marcado e travado, mesmo quando a varredura nao tem mais o codigo.
  for (const vinculo of produto.fornecedores ?? []) {
    const fonte = acervo.fontes.find((nome) => normalizar(nome) === normalizar(vinculo.fornecedorNome));
    if (!fonte) continue;
    const item = vinculo.codigo ? acharNoAcervo(acervo, fonte, vinculo.codigo) : null;
    if (item && usados.has(item.id)) continue;
    incluir(item ?? { id: null, fonte, codigo: texto(vinculo.codigo) || null, nome: texto(vinculo.descricao), url: vinculo.link ?? null }, { origem: "vinculado", marcado: true, travado: true });
  }

  // 2. O fornecedor em rascunho do Bling: ja entra marcado (o dono desmarca se nao for).
  const bling = codigoDoBling(produto.fornecedorRascunho, acervo.fontes);
  const itemDoBling = bling ? acharNoAcervo(acervo, bling.fonte, bling.codigo) : null;
  if (itemDoBling && !usados.has(itemDoBling.id) && cabeNaFonte(itemDoBling.fonte)) {
    incluir(itemDoBling, { origem: "bling", marcado: true, travado: false });
  }

  // 3. Os parecidos, pela regra da lupa.
  const palavras = palavrasDoTermo(produto.tituloBase);
  const notas = new Map();
  if (palavras.length > 0) {
    const { notas: lista } = notasDeRelevancia(palavras, acervo.itens.map((item) => item.formas));
    acervo.itens.forEach((item, indice) => notas.set(item.id, lista[indice]));
    // Com ate duas palavras todas precisam aparecer: "sensor" sozinho casaria com metade do acervo.
    const minima = palavras.length <= 2 ? 1 : NOTA_MINIMA;
    const formasDoTermo = indiceDePalavras(normalizar(produto.tituloBase));
    const nomeCabeNoTermo = (item) => item.palavrasDoNome.length >= 3 && item.palavrasDoNome.every((palavra) => casaPalavra(formasDoTermo, palavra));
    const achados = acervo.itens
      .map((item) => ({ item, nota: notas.get(item.id) }))
      .filter(({ item, nota }) => nota >= minima - 1e-9 || (palavras.length > 2 && nota > 0 && nomeCabeNoTermo(item)))
      .sort((a, b) => b.nota - a.nota || a.item.nome.localeCompare(b.item.nome, "pt-BR"));
    for (const { item, nota } of achados) {
      if (usados.has(item.id) || !cabeNaFonte(item.fonte)) continue;
      incluir(item, { origem: "parecido", marcado: false, travado: false, nota });
    }
    if (candidatos.length === 0 && palavras.length > 2) {
      const fracos = acervo.itens
        .map((item) => ({ item, nota: notas.get(item.id) }))
        .filter(({ nota }) => nota >= NOTA_FRACA - 1e-9 && nota < minima - 1e-9)
        .sort((a, b) => b.nota - a.nota || a.item.nome.localeCompare(b.item.nome, "pt-BR"));
      const porFonteFraco = new Map();
      for (const { item, nota } of fracos) {
        const quantos = porFonteFraco.get(item.fonte) ?? 0;
        if (quantos >= FRACOS_POR_FONTE) continue;
        porFonteFraco.set(item.fonte, quantos + 1);
        incluir(item, { origem: "fraco", marcado: false, travado: false, nota });
      }
    }
  }

  for (const item of candidatos) if (item.id != null && notas.has(item.id)) item.nota = notas.get(item.id);
  const posicaoDaFonte = (fonte) => acervo.fontes.indexOf(fonte);
  return candidatos.sort(
    (a, b) =>
      posicaoDaFonte(a.fonte) - posicaoDaFonte(b.fonte) ||
      ORDEM_DA_ORIGEM[a.origem] - ORDEM_DA_ORIGEM[b.origem] ||
      b.nota - a.nota ||
      a.nome.localeCompare(b.nome, "pt-BR"),
  );
}

/** Os dados da pagina: um produto por linha (so quem tem candidato), e a lista de quem nao tem no fim. */
export function montarDados(produtos, acervo, { geradoEm = "", porFonte = POR_FONTE } = {}) {
  const lista = [];
  const semCandidato = [];
  const ordenados = [...produtos].sort((a, b) => String(a.sku).localeCompare(String(b.sku), "pt-BR", { numeric: true }));
  for (const produto of ordenados) {
    const nome = texto(produto.tituloBase);
    const candidatos = candidatosDoProduto(produto, acervo, { porFonte });
    if (candidatos.length === 0) {
      semCandidato.push({ sku: produto.sku, nome });
      continue;
    }
    const minimo = produto.estoqueMinimo ?? null;
    const estoque = Number(produto.estoque) || 0;
    const rascunho = produto.fornecedorRascunho;
    lista.push({
      sku: produto.sku,
      nome,
      foto: produto.foto ?? null,
      estoque,
      minimo,
      // A regra do Compras (src/lib/compras/regras.js): abaixo = estoque menor que o minimo.
      abaixo: minimo != null && estoque < minimo,
      rascunho: texto(rascunho?.nome) || texto(rascunho?.codigo) ? { nome: texto(rascunho?.nome) || null, codigo: texto(rascunho?.codigo) || null } : null,
      candidatos,
    });
  }
  return { geradoEm, fontes: acervo.fontes, produtos: lista, semCandidato };
}

/** A pagina inteira, com os dados embutidos. `<` vira `<` no JSON: um nome com `</script>` nao fecha o script. */
export function paginaHtml(dados) {
  const json = JSON.stringify(dados).replace(/</g, "\\u003c");
  return PAGINA.replace("/*DADOS*/", json);
}

// A pagina e String.raw: as barras invertidas do JS dela ficam como estao. Sem crase e sem ${ } dentro, de proposito.
const PAGINA = String.raw`<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Vincular fornecedores</title>
<style>
:root{--b:#e5e7eb;--t:#111827;--s:#6b7280;--v:#059669;--a:#2563eb;--r:#dc2626}
*{box-sizing:border-box}
[hidden]{display:none!important}
body{margin:0;font:13px/1.35 system-ui,"Segoe UI",Arial,sans-serif;color:var(--t);background:#f9fafb}
.barra{position:sticky;top:0;z-index:5;display:flex;flex-wrap:wrap;gap:8px 14px;align-items:center;padding:8px 14px;background:#fff;border-bottom:1px solid var(--b)}
.barra h1{font-size:15px;margin:0 8px 0 0}
.barra .gerado,#contador,#visiveis,#salvoEm{color:var(--s)}
.barra input[type=search]{padding:5px 8px;border:1px solid var(--b);border-radius:6px;min-width:260px;font:inherit}
.barra label{display:flex;gap:4px;align-items:center}
button,.botao{padding:5px 10px;border:1px solid var(--b);border-radius:6px;background:#fff;cursor:pointer;font:inherit;color:var(--t)}
button.principal{background:var(--a);color:#fff;border-color:var(--a);font-weight:600}
.linha{display:grid;grid-template-columns:270px 1fr;gap:12px;padding:10px 14px;border-bottom:1px solid var(--b);background:#fff;border-left:4px solid transparent}
.linha.revisado{background:#f3f4f6}
.linha.com-marca{border-left-color:var(--v)}
.linha.nenhum{border-left-color:var(--s)}
.produto{display:grid;grid-template-columns:72px 1fr;gap:3px 8px;align-content:start}
.fotop{width:72px;height:72px;object-fit:contain;grid-row:1/span 6;border:1px solid var(--b);border-radius:6px;background:#fff}
.vazia{background:#f3f4f6}
.sku{font-weight:700}
.nomep{font-size:12px}
.est{color:var(--s);font-size:12px}
.est.abaixo{color:var(--r);font-weight:600}
.bling{color:var(--a);font-size:12px}
.acoes{display:flex;gap:6px;margin-top:4px}
.acoes button{padding:2px 8px;font-size:12px}
.situacao{color:var(--v);font-size:12px;min-height:14px}
.fontes{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.fonte h3{margin:0 0 6px;font-size:11px;text-transform:uppercase;color:var(--s);letter-spacing:.05em}
.cartao{display:grid;grid-template-columns:auto 56px 1fr;gap:8px;align-items:center;padding:6px;border:1px solid var(--b);border-radius:6px;margin-bottom:6px;cursor:pointer;background:#fff}
.cartao.marcado{border-color:var(--v);background:#ecfdf5}
.cartao.travado{cursor:default;opacity:.85}
.fotoc{width:56px;height:56px;object-fit:contain;border-radius:4px}
.texto{min-width:0}
.cod{font-weight:600}
.nomec{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:12px}
.info{color:var(--s);font-size:12px}
.selo{font-size:11px;padding:1px 6px;border-radius:999px;margin-left:4px;font-weight:500}
.selo.bling{background:#dbeafe;color:#1e40af}
.selo.vinculado{background:#d1fae5;color:#065f46}
.selo.fraco{background:#fef3c7;color:#92400e}
.nota{float:right;color:var(--s);font-weight:400;font-size:11px}
.semf{color:var(--s);font-size:12px}
#semCandidato{padding:14px}
#semCandidato h2{font-size:14px;margin:0 0 8px}
#semCandidato ul{columns:3;font-size:12px;margin:0;padding-left:18px}
@media (max-width:1100px){.linha{grid-template-columns:1fr}.fontes{grid-template-columns:1fr}}
</style>
</head>
<body>
<header class="barra">
  <h1>Vincular fornecedores</h1>
  <span class="gerado" id="gerado"></span>
  <input type="search" id="busca" placeholder="Buscar por código ou nome" autocomplete="off">
  <label><input type="checkbox" id="soAbaixo"> Só abaixo do mínimo</label>
  <label><input type="checkbox" id="soNaoRevisados"> Só não revisados</label>
  <span id="visiveis"></span>
  <span id="contador"></span>
  <label class="botao">Carregar arquivo <input type="file" id="carregar" accept=".json,application/json" hidden></label>
  <button type="button" class="principal" id="salvar">Salvar escolhas</button>
  <span id="salvoEm"></span>
</header>
<main id="lista"></main>
<section id="semCandidato"></section>
<script>
const DADOS = /*DADOS*/;
</script>
<script>
(function () {
  var CHAVE = "rise:vincular-fornecedores:v1";
  var ARQUIVO = "vinculos-fortek-nightech.json";
  var produtos = DADOS.produtos;
  var porSku = {};
  produtos.forEach(function (p) { porSku[p.sku] = p; });

  function ler() {
    try { var t = localStorage.getItem(CHAVE); var e = t ? JSON.parse(t) : null; if (e && e.produtos) return e; } catch (erro) {}
    return { produtos: {} };
  }
  function gravar() { try { localStorage.setItem(CHAVE, JSON.stringify(estado)); } catch (erro) {} }
  function normalizar(t) { return String(t || "").normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase(); }
  function h(t) { return String(t == null ? "" : t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  function moeda(v) { return v == null ? "sem preço" : "R$ " + Number(v).toFixed(2).replace(".", ","); }
  function chave(c) { return c.fonte + "|" + c.codigo; }
  function iniciais(p) { return p.candidatos.filter(function (c) { return c.marcado && !c.travado; }).map(chave); }

  var estado = ler();
  function estadoDe(sku) {
    var e = estado.produtos[sku];
    if (!e) { e = { marcados: iniciais(porSku[sku]), nenhum: false, revisado: false }; estado.produtos[sku] = e; }
    return e;
  }
  produtos.forEach(function (p) { estadoDe(p.sku); });
  gravar();

  function estoqueTexto(e) {
    var partes = [];
    if (e.pronta != null) partes.push(e.pronta + " pronta entrega");
    if (e.aChegar) partes.push(e.aChegar + " a chegar" + (e.previsao ? " (" + e.previsao + ")" : ""));
    if (e.montagem) partes.push(e.montagem + " em montagem");
    return partes.length ? partes.join(" · ") : "estoque não informado";
  }
  function foto(src, classe) {
    return src ? '<img class="' + classe + '" src="' + h(src) + '" loading="lazy" alt="">' : '<div class="' + classe + ' vazia"></div>';
  }
  function cartao(c, e) {
    var k = chave(c);
    var marcado = c.travado || e.marcados.indexOf(k) >= 0;
    var selo = c.origem === "bling" ? '<span class="selo bling">código do Bling</span>' : c.origem === "vinculado" ? '<span class="selo vinculado">já vinculado</span>' : c.origem === "fraco" ? '<span class="selo fraco">parecido fraco</span>' : "";
    return '<label class="cartao' + (marcado ? " marcado" : "") + (c.travado ? " travado" : "") + '">' +
      '<input type="checkbox" data-chave="' + h(k) + '"' + (marcado ? " checked" : "") + (c.travado ? " disabled" : "") + '>' +
      foto(c.foto, "fotoc") +
      '<div class="texto"><div class="cod">' + h(c.codigo || "sem código") + selo + '<span class="nota">' + Math.round((c.nota || 0) * 100) + '%</span></div>' +
      '<div class="nomec" title="' + h(c.nome) + '">' + h(c.nome) + '</div>' +
      '<div class="info">' + moeda(c.preco) + ' · ' + h(estoqueTexto(c.estoque)) + (c.url ? ' · <a href="' + h(c.url) + '" target="_blank" rel="noopener">abrir</a>' : "") + '</div></div></label>';
  }
  function linha(p) {
    var e = estadoDe(p.sku);
    var fontes = DADOS.fontes.map(function (f) {
      var cs = p.candidatos.filter(function (c) { return c.fonte === f; });
      return '<div class="fonte"><h3>' + h(f) + '</h3>' + (cs.length ? cs.map(function (c) { return cartao(c, e); }).join("") : '<div class="semf">nenhum parecido</div>') + '</div>';
    }).join("");
    var busca = normalizar(p.sku + " " + p.nome + " " + p.candidatos.map(function (c) { return c.codigo || ""; }).join(" "));
    return '<article class="linha" id="p-' + h(p.sku) + '" data-sku="' + h(p.sku) + '" data-busca="' + h(busca) + '">' +
      '<div class="produto">' + foto(p.foto, "fotop") +
      '<div class="sku">' + h(p.sku) + '</div><div class="nomep">' + h(p.nome) + '</div>' +
      '<div class="est' + (p.abaixo ? " abaixo" : "") + '">est. ' + p.estoque + (p.minimo != null ? " · mín. " + p.minimo : "") + '</div>' +
      (p.rascunho ? '<div class="bling">Bling: ' + h(((p.rascunho.nome || "") + " " + (p.rascunho.codigo || "")).trim()) + '</div>' : "") +
      '<div class="acoes"><button type="button" class="ok" title="Revisado, sem mudar nada">OK</button><button type="button" class="nenhum" title="Nenhum destes é o produto">Nenhum serve</button></div>' +
      '<div class="situacao"></div></div>' +
      '<div class="fontes">' + fontes + '</div></article>';
  }

  var lista = document.getElementById("lista");
  lista.innerHTML = produtos.map(linha).join("");
  var semc = DADOS.semCandidato || [];
  document.getElementById("semCandidato").innerHTML = semc.length
    ? '<h2>Sem candidato na ' + DADOS.fontes.join(" nem na ") + " (" + semc.length + ')</h2><ul>' + semc.map(function (s) { return "<li><b>" + h(s.sku) + "</b> " + h(s.nome) + "</li>"; }).join("") + "</ul>"
    : "";
  document.getElementById("gerado").textContent = DADOS.geradoEm ? "gerado em " + DADOS.geradoEm : "";

  function pintar(sku) {
    var art = document.getElementById("p-" + sku);
    if (!art) return;
    var e = estadoDe(sku);
    art.classList.toggle("revisado", !!e.revisado);
    art.classList.toggle("nenhum", !!e.nenhum);
    art.classList.toggle("com-marca", e.marcados.length > 0);
    art.querySelector(".situacao").textContent = e.nenhum ? "nenhum serve" : e.marcados.length ? e.marcados.length + " marcado(s)" + (e.revisado ? " · revisado" : "") : e.revisado ? "revisado" : "";
    art.querySelectorAll("input[type=checkbox]").forEach(function (cb) {
      if (cb.disabled) return;
      var m = e.marcados.indexOf(cb.dataset.chave) >= 0;
      cb.checked = m;
      cb.closest(".cartao").classList.toggle("marcado", m);
    });
  }
  function contar() {
    var rev = 0, comMarca = 0, vinculos = 0;
    produtos.forEach(function (p) { var e = estadoDe(p.sku); if (e.revisado) rev++; if (e.marcados.length) { comMarca++; vinculos += e.marcados.length; } });
    document.getElementById("contador").textContent = rev + " de " + produtos.length + " revisados · " + comMarca + " produtos com marcação · " + vinculos + " vínculos";
  }
  var busca = document.getElementById("busca"), soAbaixo = document.getElementById("soAbaixo"), soNao = document.getElementById("soNaoRevisados");
  function aplicarFiltros() {
    var palavras = normalizar(busca.value).split(/\s+/).filter(Boolean);
    var n = 0;
    produtos.forEach(function (p) {
      var art = document.getElementById("p-" + p.sku);
      var e = estadoDe(p.sku);
      var mostra = palavras.every(function (w) { return art.dataset.busca.indexOf(w) >= 0; }) && (!soAbaixo.checked || p.abaixo) && (!soNao.checked || !e.revisado);
      art.hidden = !mostra;
      if (mostra) n++;
    });
    document.getElementById("visiveis").textContent = n + " na tela";
  }
  busca.addEventListener("input", aplicarFiltros);
  soAbaixo.addEventListener("change", aplicarFiltros);
  soNao.addEventListener("change", aplicarFiltros);

  lista.addEventListener("change", function (ev) {
    var cb = ev.target;
    if (cb.type !== "checkbox") return;
    var sku = cb.closest(".linha").dataset.sku;
    var e = estadoDe(sku);
    var k = cb.dataset.chave;
    var i = e.marcados.indexOf(k);
    if (cb.checked && i < 0) e.marcados.push(k);
    if (!cb.checked && i >= 0) e.marcados.splice(i, 1);
    if (cb.checked) e.nenhum = false;
    e.revisado = true;
    gravar(); pintar(sku); contar();
  });
  lista.addEventListener("click", function (ev) {
    var b = ev.target.closest("button");
    if (!b) return;
    var sku = b.closest(".linha").dataset.sku;
    var e = estadoDe(sku);
    if (b.classList.contains("ok")) { e.revisado = true; }
    else if (b.classList.contains("nenhum")) { e.nenhum = !e.nenhum; if (e.nenhum) e.marcados = []; e.revisado = true; }
    gravar(); pintar(sku); contar(); aplicarFiltros();
  });

  document.getElementById("salvar").addEventListener("click", function () {
    var saida = { geradoEm: DADOS.geradoEm, salvoEm: new Date().toISOString(), produtos: {} };
    produtos.forEach(function (p) {
      var e = estadoDe(p.sku);
      if (!e.marcados.length && !e.nenhum && !e.revisado) return;
      saida.produtos[p.sku] = {
        fornecedores: e.marcados.map(function (k) { var i = k.indexOf("|"); return { fonte: k.slice(0, i), codigo: k.slice(i + 1) }; }),
        nenhum: !!e.nenhum,
        revisado: !!e.revisado,
      };
    });
    var blob = new Blob([JSON.stringify(saida, null, 1)], { type: "application/json" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = ARQUIVO;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    document.getElementById("salvoEm").textContent = "salvo às " + new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  });
  document.getElementById("carregar").addEventListener("change", function (ev) {
    var f = ev.target.files[0];
    if (!f) return;
    var r = new FileReader();
    r.onload = function () {
      try {
        var j = JSON.parse(r.result);
        var n = 0;
        Object.keys(j.produtos || {}).forEach(function (sku) {
          if (!porSku[sku]) return;
          var x = j.produtos[sku];
          estado.produtos[sku] = { marcados: (x.fornecedores || []).map(function (v) { return v.fonte + "|" + v.codigo; }), nenhum: !!x.nenhum, revisado: !!x.revisado };
          pintar(sku);
          n++;
        });
        gravar(); contar(); aplicarFiltros();
        alert(n + " produto(s) carregado(s) do arquivo.");
      } catch (erro) { alert("Não consegui ler o arquivo: " + erro.message); }
      ev.target.value = "";
    };
    r.readAsText(f);
  });

  produtos.forEach(function (p) { pintar(p.sku); });
  contar();
  aplicarFiltros();
})();
</script>
</body>
</html>
`;

// ---------------------------------------------------------------------------------------------------------------------
// O gerador de verdade (le o banco e as fotos). So roda quando chamado como script.

const opcao = (nome) => process.argv.find((arg) => arg.startsWith(`--${nome}=`))?.split("=").slice(1).join("=") ?? null;

async function main() {
  if (RAIZ !== "/app") await import("dotenv/config");
  const { prisma } = await import(pathToFileURL(`${RAIZ}/src/lib/db.js`).href);
  const { caminhoDe } = await import(pathToFileURL(`${RAIZ}/src/lib/arquivos.js`).href);
  const sharp = (await import("sharp")).default;
  const porFonte = Number(opcao("por-fonte")) || POR_FONTE;
  const saida = opcao("saida") ?? path.join(RAIZ, "dados", "vincular-fornecedores");
  const log = (...partes) => console.error(...partes);
  const inicio = Date.now();

  // As fontes, na ordem fixa da pagina; o cadastro Fornecedor de mesmo nome e o que `marcarReferencias` exige.
  const NOMES = ["Fortek", "Nightech"];
  const fontes = [];
  for (const nome of NOMES) {
    const fonte = await prisma.fonteColeta.findFirst({ where: { tipo: "FORNECEDOR", nome: { equals: nome, mode: "insensitive" } }, select: { id: true, nome: true } });
    if (!fonte) { log(`AVISO: a fonte "${nome}" não existe neste banco; fica de fora.`); continue; }
    const cadastro = await prisma.fornecedor.findFirst({ where: { nome: { equals: fonte.nome, mode: "insensitive" } }, select: { id: true } });
    if (!cadastro) log(`AVISO: o fornecedor "${fonte.nome}" não tem cadastro em Cadastros: a gravação dos vínculos dele vai ser recusada.`);
    fontes.push(fonte);
  }
  if (fontes.length === 0) throw new Error("Nenhuma das fontes existe no banco.");

  // Os coletados SEM a miniatura (base64 pesado): ela e lida depois, so dos candidatos que aparecem.
  const linhas = await prisma.produtoColetado.findMany({
    where: { fonteId: { in: fontes.map((fonte) => fonte.id) } },
    select: {
      id: true, codigo: true, nome: true, url: true, precoNormal: true, precoPromocional: true, precoComImpostos: true, impostos: true,
      quantidade: true, aChegar: true, aChegarPrevisao: true, emMontagem: true, buscaTexto: true, fonte: { select: { nome: true } },
    },
  });
  const acervo = montarAcervo(fontes.map((fonte) => fonte.nome), linhas);
  log(`Acervo: ${linhas.length} itens (${fontes.map((fonte) => `${fonte.nome} ${linhas.filter((linha) => linha.fonte.nome === fonte.nome).length}`).join(", ")}).`);

  const produtos = await prisma.produto.findMany({
    where: { ativo: true, conferido: false },
    select: {
      sku: true, tituloBase: true, estoque: true, estoqueMinimo: true, fornecedorRascunho: true,
      fornecedores: { select: { codigo: true, descricao: true, link: true, fornecedor: { select: { nome: true } } } },
      arquivos: { where: { tipo: "IMAGEM", papel: "FOTO" }, orderBy: [{ principal: "desc" }, { ordem: "asc" }], take: 1, select: { arquivo: true } },
    },
  });
  const geradoEm = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date());
  const dados = montarDados(
    produtos.map((produto) => ({ ...produto, fornecedores: produto.fornecedores.map((vinculo) => ({ fornecedorNome: vinculo.fornecedor.nome, codigo: vinculo.codigo, descricao: vinculo.descricao, link: vinculo.link })) })),
    acervo,
    { geradoEm, porFonte },
  );
  log(`Produtos não conferidos: ${produtos.length}; com candidato: ${dados.produtos.length}; sem candidato: ${dados.semCandidato.length} (${Math.round((Date.now() - inicio) / 1000)} s).`);

  // Fotos pequenas: a principal do produto (do disco) e a miniatura do coletado (base64 no banco), 120 px.
  await rm(saida, { recursive: true, force: true });
  await mkdir(path.join(saida, "fotos"), { recursive: true });
  const reduzir = (entrada) => sharp(entrada).rotate().resize(120, 120, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 75 }).toBuffer();
  let fotosDeProduto = 0;
  const arquivoPorSku = new Map(produtos.map((produto) => [produto.sku, produto.arquivos[0]?.arquivo ?? null]));
  for (const produto of dados.produtos) {
    const arquivo = arquivoPorSku.get(produto.sku);
    const caminho = arquivo ? caminhoDe(produto.sku, "IMAGEM", arquivo) : null;
    if (!caminho || !/^[A-Za-z0-9._-]+$/.test(produto.sku)) continue;
    try {
      await writeFile(path.join(saida, "fotos", `p-${produto.sku}.jpg`), await reduzir(caminho));
      produto.foto = `fotos/p-${produto.sku}.jpg`;
      fotosDeProduto++;
    } catch (erro) {
      log(`foto do ${produto.sku} ignorada: ${erro.message}`);
    }
  }
  const idsDosCandidatos = [...new Set(dados.produtos.flatMap((produto) => produto.candidatos.map((item) => item.id)).filter(Boolean))];
  const fotoPorId = new Map();
  for (let posicao = 0; posicao < idsDosCandidatos.length; posicao += 25) {
    const lote = await prisma.produtoColetado.findMany({ where: { id: { in: idsDosCandidatos.slice(posicao, posicao + 25) } }, select: { id: true, miniatura: true } });
    for (const { id, miniatura } of lote) {
      // A Nightech guarda o link da foto do site (a planilha so tem a miniatura de conferencia): o navegador do dono a carrega.
      if (/^https?:\/\//i.test(miniatura ?? "")) { fotoPorId.set(id, miniatura); continue; }
      const base64 = /^data:image\/[a-z0-9.+-]+;base64,(.+)$/i.exec(miniatura ?? "")?.[1];
      if (!base64) continue;
      try {
        await writeFile(path.join(saida, "fotos", `c-${id}.jpg`), await reduzir(Buffer.from(base64, "base64")));
        fotoPorId.set(id, `fotos/c-${id}.jpg`);
      } catch (erro) {
        log(`miniatura ${id} ignorada: ${erro.message}`);
      }
    }
  }
  for (const produto of dados.produtos) for (const item of produto.candidatos) item.foto = fotoPorId.get(item.id) ?? null;

  await writeFile(path.join(saida, "index.html"), paginaHtml(dados));
  log(`Página em ${path.join(saida, "index.html")}: ${fotosDeProduto} fotos de produto e ${fotoPorId.size} de candidatos (${Math.round((Date.now() - inicio) / 1000)} s).`);
  await prisma.$disconnect();
}

if (!process.env.VINCULAR_SO_FUNCOES) {
  await main().catch((erro) => {
    console.error(erro);
    process.exit(1);
  });
}
