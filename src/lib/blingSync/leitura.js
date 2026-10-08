import { prisma } from "@/lib/db";
import { config } from "@/lib/integracoes/config";
import {
  CAMPOS_DE_ENVIO,
  diferencas,
  fornecedoresSemCnpj,
  idsDasPecasDoBling,
  normalizarDoBling,
  normalizarDoRise,
} from "@/lib/blingSync/campos";
import { clienteBling, exigirCodigoLiberado } from "@/lib/blingSync/cliente";

/**
 * Leitura do produto para o pop-up da sincronizacao: o que o Bling tem sob o codigo (SKU)
 * do produto do Rise, comparado campo a campo. So le: nao escreve no Bling, nao grava no
 * Rise e nao chama `cliente.exigirEscrita` (escrita e coisa da sincronizacao; aqui a trava
 * so e consultada para a tela dizer se o envio esta liberado).
 *
 * O cliente do Bling entra por parametro (`clienteBling()` por padrao), como em todas as
 * funcoes da sincronizacao: o teste passa o Bling falso.
 */

/// Erro cuja mensagem ja esta pronta para a tela (HTTP do Bling traduzido). Qualquer outro erro
/// (token ausente, rede) ganha o prefixo "Nao foi possivel ler o Bling" em `textoDoErro`.
class ErroDoBling extends Error {}

/**
 * O que o Bling respondeu de errado, em portugues e sem acento. A tela mostra o texto como esta,
 * entao cada caso diz o que o operador pode fazer (esperar, reconectar) em vez de um HTTP seco.
 */
function erroDoBling(status, dados) {
  const descricao = dados?.error?.description ?? dados?.error?.message ?? null;
  if (status === 429) {
    return new ErroDoBling("O Bling recusou a leitura por limite de chamadas (3 por segundo na conta inteira). Tente de novo em alguns instantes.");
  }
  if (status === 401 || status === 403) {
    return new ErroDoBling("O Bling recusou o acesso (token inválido, expirado ou sem permissão de leitura). Reconecte o Bling em Integrações e tente de novo.");
  }
  if (status >= 500) {
    return new ErroDoBling(`O Bling está com problema (HTTP ${status}). Tente de novo em alguns instantes.`);
  }
  return new ErroDoBling(`O Bling recusou a leitura (HTTP ${status}${descricao ? `): ${descricao}` : ")"}.`);
}

/// A resposta do Bling, se deu certo; senao lanca o erro ja em portugues.
function exigirResposta(resposta) {
  if (resposta?.ok) return resposta;
  throw erroDoBling(resposta?.status, resposta?.dados);
}

function textoDoErro(erro) {
  return erro instanceof ErroDoBling ? erro.message : `Não foi possível ler o Bling: ${erro?.message ?? erro}`;
}

/// Sem caixa e sem espacos nas pontas: o Bling e o Rise nem sempre guardam o SKU com a mesma caixa
/// (a mesma regra da lista BLING_ESCRITA_CODIGOS).
const chaveDoCodigo = (codigo) => String(codigo ?? "").trim().toLowerCase();

// ---------------------------------------------------------------------------
// O Bling: a busca por codigo
// ---------------------------------------------------------------------------

/**
 * Procura no Bling o produto com este codigo: `GET /produtos?codigos[]=<codigo>` (Emenda 8; o
 * `?codigo=` funciona mas nao esta documentado). Com UM resultado le o produto completo por
 * `GET /produtos/{id}`, com o id que a propria busca devolveu. Com DOIS ou mais devolve
 * `duplicado` SEM escolher: o Rise nao tem como saber qual deles e o certo, e escolher errado
 * sincronizaria (e depois escreveria) no produto de outra pessoa.
 *
 * Confere o codigo do que o Bling devolveu contra o pedido (sem caixa), na lista e no produto
 * lido: um item de outro codigo nao e o produto do sku e conta como inexistente (Emenda 11).
 * Codigo vazio nem chega ao Bling: `urlDoBling` tira parametro vazio, e um `GET /produtos` sem
 * filtro listaria o catalogo inteiro.
 *
 * Falha do Bling (token, limite, HTTP) LANCA, com a mensagem pronta; quem chama decide o que
 * mostrar. Devolver `nao_existe` num erro faria o pop-up oferecer "Cadastrar no Bling" um
 * produto que talvez ja exista.
 *
 * @param {ReturnType<typeof clienteBling>} cliente
 * @param {string} codigo
 * @returns {Promise<{situacao: "nao_existe"|"existe"|"duplicado", id?: number, produto?: object, quantidade?: number}>}
 */
export async function buscarNoBling(cliente, codigo) {
  const pedido = String(codigo ?? "").trim();
  if (!pedido) return { situacao: "nao_existe" };

  const busca = exigirResposta(await cliente.get("/produtos", { "codigos[]": [pedido] }));
  // Falha fechada: `nao_existe` e a porta do "Cadastrar no Bling", e um 200 com corpo inesperado lido
  // como lista vazia criaria de novo um produto que pode existir.
  if (!Array.isArray(busca.dados?.data)) throw new ErroDoBling("O Bling respondeu a busca sem a lista de produtos. Tente de novo.");
  const lista = busca.dados.data;
  const achados = lista.filter((item) => chaveDoCodigo(item?.codigo) === chaveDoCodigo(pedido));

  if (achados.length === 0) return { situacao: "nao_existe" };
  if (achados.length > 1) return { situacao: "duplicado", quantidade: achados.length };

  const id = Number(achados[0].id);
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new ErroDoBling("O Bling devolveu o produto sem um id válido. Tente de novo.");
  }

  const completo = await cliente.get(`/produtos/${id}`);
  // O produto sumiu entre a busca e a leitura: para o pop-up, ele nao existe mais.
  if (completo?.status === 404) return { situacao: "nao_existe" };

  const produto = exigirResposta(completo).dados?.data;
  if (!produto || chaveDoCodigo(produto.codigo) !== chaveDoCodigo(pedido)) return { situacao: "nao_existe" };

  return { situacao: "existe", id, produto, quantidade: 1 };
}

/// Quantas pecas de um kit do Bling a leitura resolve (uma chamada por peca, a 3 por segundo na conta).
const MAXIMO_PECAS_LIDAS = 20;

/**
 * O codigo de cada peca de um kit do Bling (formato "E"), por `GET /produtos/{id}`: a `estrutura` so
 * traz o id, e a comparacao com o Rise e por codigo. Produto que nao e kit devolve um Map vazio sem
 * chamar nada.
 *
 * Falha de UMA peca (HTTP, 404, sem codigo) LANCA: a composicao ficaria incompleta, e um kit lido pela
 * metade pareceria diferente do Rise (e o envio trocaria pecas que estao certas).
 *
 * @param {ReturnType<typeof clienteBling>} cliente
 * @param {object} bling o produto completo do Bling
 * @returns {Promise<Map<number, string>>} id da peca -> codigo
 */
export async function codigosDasPecasNoBling(cliente, bling) {
  const ids = idsDasPecasDoBling(bling);
  const codigos = new Map();
  if (ids.length > MAXIMO_PECAS_LIDAS) {
    throw new ErroDoBling(`O kit tem ${ids.length} peças no Bling, e o Rise lê no máximo ${MAXIMO_PECAS_LIDAS}.`);
  }
  for (const id of ids) {
    const resposta = await cliente.get(`/produtos/${id}`);
    if (resposta?.status === 404) throw new ErroDoBling(`Uma peça do kit (id ${id} no Bling) não existe mais lá. Confira a composição no Bling.`);
    const codigo = String(exigirResposta(resposta).dados?.data?.codigo ?? "").trim();
    if (!codigo) throw new ErroDoBling(`Uma peça do kit (id ${id} no Bling) está sem código. Confira a composição no Bling.`);
    codigos.set(id, codigo);
  }
  return codigos;
}

// ---------------------------------------------------------------------------
// O Rise: o produto, em ordem fixa
// ---------------------------------------------------------------------------

/**
 * O produto do Rise com o que a sincronizacao le dele: os vinculos de fornecedor (so CNPJ e
 * nome do fornecedor) e os ajustes de estoque ainda PENDENTES (`enviadoAoBlingEm` nulo).
 *
 * A ordem e fixa de proposito. Dois vinculos com o mesmo CNPJ viram um so em
 * `normalizarFornecedoresDoRise` ("fica o primeiro"), entao o padrao tem que vir antes e o
 * resto na ordem de criacao, senao a mesma tela daria um fornecedor hoje e outro amanha. Os
 * pendentes seguem do mais antigo ao mais novo, a ordem em que o Bling os recebera: um balanco
 * depois de uma saida nao e o mesmo que o contrario.
 *
 * Exportada porque o envio (Tarefas 8 e 9) le o produto do mesmo jeito.
 */
export async function lerProdutoDoRise(produtoId) {
  if (!produtoId) return null;
  return prisma.produto.findUnique({
    where: { id: String(produtoId) },
    include: {
      fornecedores: {
        include: { fornecedor: { select: { cnpj: true, nome: true } } },
        orderBy: [{ padrao: "desc" }, { id: "asc" }],
      },
      movimentosEstoque: {
        where: { enviadoAoBlingEm: null },
        orderBy: [{ criadoEm: "asc" }, { id: "asc" }],
      },
      // As pecas do kit (so o codigo e a quantidade): a composicao e comparada e enviada por codigo.
      componentes: {
        select: { quantidade: true, componente: { select: { sku: true } } },
        orderBy: [{ ordem: "asc" }, { criadoEm: "asc" }],
      },
    },
  });
}

// ---------------------------------------------------------------------------
// O pop-up
// ---------------------------------------------------------------------------

/**
 * As duas travas de escrita, so para a tela dizer se o envio esta liberado (nao chama
 * `exigirEscrita`: ler nao escreve). `liberada` pede a trava geral ligada E o codigo na lista de
 * liberados (lista vazia libera todos); `motivo` diz qual das duas barra.
 */
function escritaDoProduto(sku) {
  if (!config.travas.blingEscrita) {
    return {
      liberada: false,
      motivo: "A escrita no Bling está desligada (BLING_ESCRITA está false no .env): a leitura funciona, mas nada será enviado.",
    };
  }
  try {
    // A mesma regra da trava real (sem caixa, lista vazia libera): uma copia dela aqui divergiria.
    exigirCodigoLiberado(sku, config.travas.blingCodigosLiberados);
    return { liberada: true, motivo: null };
  } catch {
    return {
      liberada: false,
      motivo: `O código ${sku} não está na lista de códigos liberados para escrita (BLING_ESCRITA_CODIGOS no .env).`,
    };
  }
}

/// O resultado na forma que a tela espera. Quando falha, `erro` entra logo depois de `ok`.
function resultado({ ok, erro, sku = "", situacao = null, diferencasLidas = [], iguais = 0, avisos = [], estoque, escrita }) {
  return {
    ok,
    ...(erro ? { erro } : {}),
    sku,
    situacao,
    diferencas: diferencasLidas,
    iguais,
    avisos,
    estoque: estoque ?? { blingSaldo: null, riseEstoque: 0, pendentes: 0 },
    escrita: escrita ?? { liberada: false, motivo: null },
  };
}

/**
 * Tudo o que o pop-up mostra, numa leitura: situacao do codigo no Bling, diferencas campo a
 * campo (Rise x Bling), quantos campos sao iguais, avisos, o bloco de estoque e se o envio esta
 * liberado. Nunca lanca: falha (produto que nao existe no Rise, token, limite, HTTP) volta como
 * `ok: false` com `erro` em portugues, e a tela mostra o texto. Mesmo com `ok: false` o que ja
 * se sabia do Rise (estoque, avisos, trava) vai junto.
 *
 * `situacao` e null quando a leitura falhou antes de saber; `duplicado` tambem e `ok: false`
 * (nao ha um produto certo para comparar). `nao_existe` e `ok: true`: o pop-up oferece
 * "Cadastrar no Bling" e nao ha diferencas para listar.
 *
 * `iguais` = campos de `CAMPOS_DE_ENVIO` que NAO aparecem em `diferencas` (inclui os que estao
 * vazios dos dois lados); `vazioNoRise` aparece em `diferencas` e por isso nao conta como igual.
 *
 * `estoque.blingSaldo` e o `saldoVirtualTotal` do produto lido (pode ser negativo: o virtual
 * desconta reservas), e na falta dele o ultimo saldo guardado no Rise (`Produto.blingSaldo`), ou
 * null se nunca foi lido. Esta funcao NAO grava esse saldo: so o botao da lista o atualiza.
 *
 * @param {string} produtoId id do `Produto` no Rise (nao o SKU).
 * @param {ReturnType<typeof clienteBling>} [cliente]
 */
export async function lerParaPopup(produtoId, cliente = clienteBling()) {
  let produto;
  try {
    produto = await lerProdutoDoRise(produtoId);
  } catch (erro) {
    return resultado({ ok: false, erro: `Não foi possível ler o produto no Rise: ${erro?.message ?? erro}` });
  }
  if (!produto) return resultado({ ok: false, erro: "Produto não encontrado no Rise." });

  const sku = produto.sku;
  const avisos = fornecedoresSemCnpj(produto.fornecedores).map((nome) => `Fornecedor ${nome} sem CNPJ válido: não será enviado ao Bling.`);
  const estoqueCom = (saldoLido) => ({
    blingSaldo: saldoLido ?? produto.blingSaldo ?? null,
    riseEstoque: produto.estoque,
    pendentes: produto.movimentosEstoque.length,
  });
  // O que ja se sabe sem o Bling: vale tambem quando a leitura do Bling falha.
  const doRise = { sku, avisos, estoque: estoqueCom(null), escrita: escritaDoProduto(sku) };

  let achado;
  try {
    achado = await buscarNoBling(cliente, sku);
  } catch (erro) {
    return resultado({ ...doRise, ok: false, erro: textoDoErro(erro) });
  }

  if (achado.situacao === "duplicado") {
    return resultado({
      ...doRise,
      ok: false,
      situacao: "duplicado",
      erro:
        `Há mais de um produto com o código ${sku} no Bling (${achado.quantidade} encontrados). ` +
        "O Rise não escolhe um sozinho: deixe só um com esse código no Bling e tente de novo.",
    });
  }

  if (achado.situacao === "nao_existe") {
    return resultado({ ...doRise, ok: true, situacao: "nao_existe" });
  }

  // Kit no Bling: os codigos das pecas, para a composicao ser comparada com a do Rise.
  let codigosDasPecas;
  try {
    codigosDasPecas = await codigosDasPecasNoBling(cliente, achado.produto);
  } catch (erro) {
    return resultado({ ...doRise, ok: false, situacao: "existe", erro: textoDoErro(erro) });
  }

  const lista = diferencas(normalizarDoRise(produto), normalizarDoBling(achado.produto, { codigosDasPecas }));
  // `Number(null)` e 0: sem o saldo no produto lido, fica null (cai no ultimo guardado), nunca 0.
  const bruto = achado.produto.estoque?.saldoVirtualTotal;
  const saldoLido = bruto === null || bruto === undefined || bruto === "" ? null : Number(bruto);
  return resultado({
    ...doRise,
    ok: true,
    situacao: "existe",
    diferencasLidas: lista,
    iguais: CAMPOS_DE_ENVIO.length - lista.length,
    estoque: estoqueCom(Number.isFinite(saldoLido) ? saldoLido : null),
  });
}
