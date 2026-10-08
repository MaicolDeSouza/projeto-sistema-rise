import { montarCorpoDeCadastro } from "@/lib/blingSync/corpo";
import { buscarNoBling, codigosDasPecasNoBling } from "@/lib/blingSync/leitura";

/**
 * O Bling do anuncio do Mercado Livre (fase 3): o vinculo do anuncio com o produto na loja do ML e o
 * produto de composicao (kit) do anuncio de kit. Tudo recebe o cliente do Bling por parametro
 * (`clienteBling()` ou o Bling falso do teste) e NUNCA lanca: devolve `{ situacao, erro? }` ou
 * `{ ok, erro? }`, com o recado pronto para a tela.
 *
 * O alvo e sempre achado pelo CODIGO, na hora (`buscarNoBling`, Emenda 11 da sincronizacao): um
 * `blingId` guardado pode ser de um produto apagado e recriado la.
 */

/**
 * O canal "ML_4h" do Bling. Ha 8 canais do tipo Mercado Livre e so este esta ativo: vincular em outro
 * quebra a sincronia de estoque SEM dar erro (CLAUDE.md, "Bling").
 */
export const LOJA_ML_NO_BLING = "203593931";

/// O nome do Bling tem no maximo 120 caracteres (o mesmo limite da sincronizacao do produto).
const LIMITE_DO_NOME = 120;

const centavos = (valor) => (Number.isFinite(Number(valor)) ? Math.round(Number(valor) * 100) / 100 : 0);
const chave = (codigo) => String(codigo ?? "").trim().toUpperCase();

/// O que o Bling disse ao recusar: HTTP e descricao.
function motivoDoBling(resposta) {
  const erro = resposta?.dados?.error;
  const descricao = erro?.description ?? erro?.message ?? null;
  return `HTTP ${resposta?.status ?? "sem status"}${descricao ? `: ${descricao}` : ""}`;
}

const mensagem = (erro, padrao) => erro?.message ?? padrao;

/** O recado do vinculo unico: o produto ja esta ligado a outro anuncio na loja do ML, no Bling. */
export function recadoDoVinculoUnico(codigo, outros) {
  return `No Bling, o produto ${codigo} já está vinculado ao anúncio ${outros.join(", ")} na loja do Mercado Livre, e o Bling aceita um só anúncio por produto em cada loja. Um segundo anúncio do mesmo produto não teria o estoque controlado pelo Bling.`;
}

// ---------------------------------------------------------------------------
// Vinculo do anuncio (MLB) com o produto, na loja do ML
// ---------------------------------------------------------------------------

/**
 * O anuncio `itemId` ja esta vinculado ao produto `codigo` na loja do ML? `outros` sao os MLB de outros
 * anuncios do mesmo produto na mesma loja (Classico e Premium, anuncios antigos): nao impedem, so
 * informam. Situacoes: "ligado", "sem_vinculo", "sem_produto_no_bling", "duplicado", "erro".
 */
export async function vinculoNoBlingML(bling, codigo, itemId) {
  try {
    const busca = await buscarNoBling(bling, codigo);
    if (busca.situacao === "nao_existe") return { situacao: "sem_produto_no_bling" };
    if (busca.situacao === "duplicado") return { situacao: "duplicado" };

    const resposta = await bling.get("/produtos/lojas", { idProduto: busca.id });
    if (!resposta?.ok || !Array.isArray(resposta.dados?.data)) {
      return { situacao: "erro", erro: `Não foi possível ler os vínculos do produto no Bling (HTTP ${resposta?.status ?? "?"}).` };
    }
    const daLoja = resposta.dados.data.filter((vinculo) => String(vinculo?.loja?.id) === LOJA_ML_NO_BLING);
    const codigos = daLoja.map((vinculo) => String(vinculo?.codigo ?? "").trim()).filter(Boolean);
    const outros = codigos.filter((outro) => outro !== String(itemId));
    return { situacao: codigos.includes(String(itemId)) ? "ligado" : "sem_vinculo", outros, idProduto: busca.id };
  } catch (erro) {
    return { situacao: "erro", erro: `Bling: ${mensagem(erro, "não foi possível ler o produto.")}` };
  }
}

/**
 * Cria no Bling o vinculo do anuncio com o produto (`POST /produtos/lojas`, so na loja do ML), com o
 * `codigo` = MLB e o `preco` = preco do anuncio. Ja ligado nao cria de novo. A trava do Bling
 * (`exigirEscrita`) vem antes da escrita; uma tentativa so; depois do POST le de novo para confirmar.
 */
export async function vincularNoBlingML(bling, codigo, itemId, preco) {
  const antes = await vinculoNoBlingML(bling, codigo, itemId);
  if (antes.situacao === "ligado") return { ok: true, ...antes, jaEstava: true };
  if (antes.situacao === "sem_produto_no_bling") {
    return { ok: false, ...antes, erro: `O produto ${codigo} não está entre os produtos ativos do Bling: não há a que vincular o anúncio.` };
  }
  if (antes.situacao === "duplicado") return { ok: false, ...antes, erro: `O código ${codigo} aparece mais de uma vez no Bling: deixe só um.` };
  if (antes.situacao !== "sem_vinculo") return { ok: false, ...antes };
  // O Bling aceita UM vinculo por produto em cada loja (medido no primeiro Publicar real, 08/10/2026:
  // "Para esta loja ja existe um produto loja vinculado ao produto informado"). Nem tenta.
  if (antes.outros?.length > 0) return { ok: false, ...antes, erro: recadoDoVinculoUnico(codigo, antes.outros) };

  try {
    bling.exigirEscrita(codigo);
  } catch (erro) {
    return { ok: false, situacao: "erro", erro: mensagem(erro, "Escrita no Bling bloqueada.") };
  }

  const corpo = { codigo: String(itemId), preco: centavos(preco), produto: { id: antes.idProduto }, loja: { id: Number(LOJA_ML_NO_BLING) } };
  let resposta;
  try {
    resposta = await bling.post("/produtos/lojas", corpo);
  } catch (erro) {
    return { ok: false, situacao: "erro", erro: `Falha ao vincular no Bling: ${mensagem(erro, "erro de rede")}. Confira no Bling antes de tentar de novo.` };
  }
  if (!resposta?.ok) {
    const dica = resposta?.status >= 500 ? " O Bling pode ter gravado mesmo assim: confira no Bling antes de tentar de novo." : "";
    return { ok: false, situacao: "erro", erro: `O Bling recusou o vínculo do anúncio ${itemId} (${motivoDoBling(resposta)}).${dica}` };
  }

  const depois = await vinculoNoBlingML(bling, codigo, itemId);
  return depois.situacao === "ligado"
    ? { ok: true, ...depois }
    : { ok: false, ...depois, erro: "O Bling aceitou o vínculo, mas a releitura não o mostrou. Confira no Bling antes de tentar de novo." };
}

// ---------------------------------------------------------------------------
// Kit (anuncio de composicao)
// ---------------------------------------------------------------------------

/**
 * As pecas do kit achadas no Bling pelo codigo, agora. Cada uma tem que existir uma vez so, ativa, e
 * ser produto simples (kit dentro de kit nao): senao o kit baixaria estoque do que nao existe.
 * @returns {Promise<{ pecas: {sku, id, quantidade}[] } | { erro: string }>}
 */
async function pecasNoBling(bling, itens) {
  const pecas = [];
  for (const item of Array.isArray(itens) ? itens : []) {
    const busca = await buscarNoBling(bling, item.sku);
    if (busca.situacao === "nao_existe") return { erro: `A peça ${item.sku} não foi achada entre os produtos ativos do Bling: cadastre-a lá antes do kit.` };
    if (busca.situacao === "duplicado") return { erro: `A peça ${item.sku} aparece ${busca.quantidade} vezes no Bling: deixe só uma com esse código.` };
    if (busca.produto?.formato === "E") return { erro: `A peça ${item.sku} é um kit no Bling, e kit dentro de kit não é aceito.` };
    pecas.push({ sku: item.sku, id: busca.id, quantidade: Number(item.quantidade) });
  }
  if (pecas.length === 0) return { erro: "O kit está sem peças." };
  return { pecas };
}

/// "codigo -> quantidade" das duas listas, comparadas sem ordem e sem caixa.
function diferencasDasPecas(doAnuncio, doBling) {
  const codigos = [...new Set([...doAnuncio.keys(), ...doBling.keys()])].sort();
  const diferencas = [];
  for (const codigo of codigos) {
    const noAnuncio = doAnuncio.get(codigo);
    const noBling = doBling.get(codigo);
    if (noAnuncio === undefined) diferencas.push(`${codigo}: só no Bling`);
    else if (noBling === undefined) diferencas.push(`${codigo}: só no anúncio`);
    else if (noAnuncio !== noBling) diferencas.push(`${codigo}: ${noAnuncio} no anúncio, ${noBling} no Bling`);
  }
  return diferencas;
}

/**
 * O kit do anuncio no Bling, so lendo: "criar" (o codigo esta livre), "igual" (ja existe com as mesmas
 * pecas e quantidades: reaproveita), "diferente" (existe com OUTRAS pecas: vincular baixaria o estoque
 * dos produtos errados) ou "erro" (peca que falta, codigo repetido, codigo de produto simples...).
 *
 * @param {{ codigo: string, itens: { sku: string, quantidade: number }[] }} kit
 */
export async function conferirKitNoBling(bling, { codigo, itens }) {
  try {
    const achadas = await pecasNoBling(bling, itens);
    if (achadas.erro) return { situacao: "erro", erro: achadas.erro };

    const busca = await buscarNoBling(bling, codigo);
    if (busca.situacao === "nao_existe") return { situacao: "criar" };
    if (busca.situacao === "duplicado") return { situacao: "erro", erro: `O código ${codigo} aparece ${busca.quantidade} vezes no Bling: deixe só um.` };
    if (busca.produto?.formato !== "E") {
      return { situacao: "erro", erro: `O código ${codigo} é um produto simples no Bling, não um kit: o estoque das peças não baixaria. Use outro código.` };
    }

    const codigosDoBling = await codigosDasPecasNoBling(bling, busca.produto);
    const doBling = new Map();
    for (const componente of busca.produto?.estrutura?.componentes ?? []) {
      const codigoDaPeca = chave(codigosDoBling.get(Number(componente?.produto?.id)));
      doBling.set(codigoDaPeca, (doBling.get(codigoDaPeca) ?? 0) + Number(componente?.quantidade ?? 0));
    }
    const doAnuncio = new Map();
    for (const peca of achadas.pecas) doAnuncio.set(chave(peca.sku), (doAnuncio.get(chave(peca.sku)) ?? 0) + peca.quantidade);

    const diferencas = diferencasDasPecas(doAnuncio, doBling);
    return diferencas.length === 0 ? { situacao: "igual", id: busca.id } : { situacao: "diferente", id: busca.id, diferencas };
  } catch (erro) {
    return { situacao: "erro", erro: `Bling: ${mensagem(erro, "não foi possível conferir o kit.")}` };
  }
}

/**
 * Corpo do `POST /produtos` do kit, no molde dos kits reais do Bling (investigacao B4): formato "E",
 * estoque virtual (o Bling calcula o saldo pelas pecas e baixa cada uma na venda), nome terminado em
 * ` *codigo` (a convencao do dono), unidade "UN", o preco do anuncio, peso e medidas da embalagem do
 * anuncio e o NCM/CEST/origem do produto principal (`principal`, ja normalizado). Puro.
 */
export function corpoDoKitDoAnuncio({ codigo, titulo, preco, envio, principal, pecasNoBling }) {
  const sufixo = ` *${codigo}`;
  const cabe = Math.max(0, LIMITE_DO_NOME - Array.from(sufixo).length);
  const nome = `${Array.from(String(titulo ?? "").trim()).slice(0, cabe).join("").trimEnd()}${sufixo}`;
  const rise = {
    nome,
    preco: Number.isFinite(Number(preco)) && Number(preco) > 0 ? centavos(preco) : null,
    unidade: "UN",
    peso: envio?.pesoKg ?? null,
    altura: envio?.alturaCm ?? null,
    largura: envio?.larguraCm ?? null,
    comprimento: envio?.comprimentoCm ?? null,
    ncm: principal?.ncm ?? null,
    cest: principal?.cest ?? null,
    origem: principal?.origem ?? null,
    // So o "tem composicao": a lista de pecas vai pelos ids achados no Bling (`pecasNoBling`).
    composicao: "kit",
  };
  return montarCorpoDeCadastro(codigo, rise, { pecasNoBling });
}

/**
 * Cria o kit do anuncio no Bling: acha as pecas pelo codigo, confere a trava (`exigirEscrita` do
 * codigo do kit), faz o `POST /produtos` e le de novo para confirmar que nasceu como kit.
 *
 * @param {{ codigo, titulo, preco, envio, principal, itens: { sku, quantidade }[] }} dados
 */
export async function criarKitNoBling(bling, { codigo, titulo, preco, envio, principal, itens }) {
  try {
    const achadas = await pecasNoBling(bling, itens);
    if (achadas.erro) return { ok: false, erro: achadas.erro };

    try {
      bling.exigirEscrita(codigo);
    } catch (erro) {
      return { ok: false, erro: mensagem(erro, "Escrita no Bling bloqueada.") };
    }

    const corpo = corpoDoKitDoAnuncio({ codigo, titulo, preco, envio, principal, pecasNoBling: achadas.pecas });
    let resposta;
    try {
      resposta = await bling.post("/produtos", corpo);
    } catch (erro) {
      return { ok: false, erro: `Falha ao criar o kit ${codigo} no Bling: ${mensagem(erro, "erro de rede")}. Confira no Bling antes de tentar de novo.` };
    }
    if (!resposta?.ok) {
      const dica = resposta?.status >= 500 ? " O Bling pode ter criado mesmo assim: confira antes de tentar de novo." : "";
      return { ok: false, erro: `O Bling recusou o kit ${codigo} (${motivoDoBling(resposta)}).${dica}` };
    }

    const depois = await buscarNoBling(bling, codigo);
    if (depois.situacao !== "existe" || depois.produto?.formato !== "E") {
      return { ok: false, erro: `O Bling aceitou o kit ${codigo}, mas a releitura não o mostrou como kit. Confira no Bling.` };
    }
    return { ok: true, id: depois.id };
  } catch (erro) {
    return { ok: false, erro: `Bling: ${mensagem(erro, "não foi possível criar o kit.")}` };
  }
}
