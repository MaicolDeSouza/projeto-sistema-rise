import { validar } from "@/lib/anuncios/canais/bling";
import {
  assinaturaDoRise,
  diferencas,
  fornecedoresSemCnpj,
  normalizarDoBling,
  normalizarDoRise,
  normalizarFornecedoresDoRise,
} from "@/lib/blingSync/campos";
import { clienteBling } from "@/lib/blingSync/cliente";
import { montarCorpoDeCadastro, montarCorpoParcial } from "@/lib/blingSync/corpo";
import { buscarNoBling, lerProdutoDoRise } from "@/lib/blingSync/leitura";
import { prisma } from "@/lib/db";

/**
 * O ENVIO do Rise para o Bling: os campos de um produto que ja exista la (`sincronizarProduto`) e o
 * cadastro de um produto novo (`cadastrarNoBling`), com os fornecedores e a copia de seguranca. E a
 * primeira parte da sincronizacao que ESCREVE no Bling, e a conta e real (1.007 anuncios e estoque
 * de verdade), entao a ordem de cada passo e o que protege:
 *
 * - `cliente.exigirEscrita(sku)` vem ANTES de qualquer chamada: com a trava fechada (BLING_ESCRITA
 *   ou o codigo fora de BLING_ESCRITA_CODIGOS) nada sai, nem leitura, e nao fica meio envio.
 * - O alvo de toda escrita e o id que a busca por codigo DESTE envio achou (Emenda 11), nunca um
 *   `blingId` guardado: o guardado pode ser de um produto apagado e recriado no Bling.
 * - Escrita nunca e repetida aqui: se o Bling processou e a resposta se perdeu, repetir duplicaria.
 * - So depois de tudo dar certo o Rise grava `blingAssinatura` e `blingSincronizadoEm` (o icone
 *   verde). Qualquer falha devolve `ok: false` dizendo o que falhou, e o selo continua aceso.
 *
 * O cliente entra por parametro (`clienteBling()` por padrao), como em toda a sincronizacao: o
 * teste passa o Bling falso. Nenhuma das duas funcoes lanca para a tela: erro vira `ok: false` com
 * `erro` em portugues.
 */

/// O Bling recusa nome com mais de 120 caracteres (`ProdutosDadosDTO`). O Rise recusa antes, com a
/// razao, em vez de cortar: um nome cortado no meio mudaria o anuncio sem ninguem decidir.
const LIMITE_DO_NOME = 120;

/// Copias de seguranca guardadas por produto; as mais velhas saem a cada envio.
const COPIAS_GUARDADAS = 3;

/// Erro cuja mensagem ja esta pronta para a tela.
class FalhaDoEnvio extends Error {}

const mensagemDe = (erro) => erro?.message ?? String(erro);

function textoDaFalha(erro) {
  return erro instanceof FalhaDoEnvio ? erro.message : `Erro inesperado no envio ao Bling: ${mensagemDe(erro)}`;
}

/// So os digitos (o Bling guarda o documento do contato assim).
const digitos = (valor) => String(valor ?? "").replace(/\D/g, "");

/// Sem acento, sem caixa e sem espacos sobrando: e assim que um nome do Rise "e igual" ao do Bling.
function paraComparar(texto) {
  return String(texto ?? "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/// Id do Bling valido (inteiro positivo), ou null.
function idOuNull(valor) {
  const id = Number(valor);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

/// Lista `data` de uma resposta do Bling (vazia se nao veio lista).
const listaDe = (resposta) => (Array.isArray(resposta?.dados?.data) ? resposta.dados.data : []);

// ---------------------------------------------------------------------------
// Um envio por produto de cada vez
// ---------------------------------------------------------------------------

/**
 * Produtos com envio em andamento NESTE processo. O clique duplo que chega junto (antes de o
 * primeiro terminar) leria o Bling antes da escrita do outro e escreveria de novo: no cadastro,
 * dois `POST /produtos` criariam o mesmo codigo duas vezes no Bling, e dai em diante a busca so
 * diria "mais de um". O segundo pedido e recusado na hora, sem chamada nenhuma. (So vale dentro
 * de um processo; a tela tambem desabilita o botao enquanto envia.)
 */
const emAndamento = new Set();

async function umPorVez(produtoId, recusar, executar) {
  const chave = String(produtoId ?? "");
  if (emAndamento.has(chave)) {
    return recusar("Ja ha um envio deste produto ao Bling em andamento. Aguarde terminar e confira o resultado.");
  }
  emAndamento.add(chave);
  try {
    return await executar();
  } finally {
    emAndamento.delete(chave);
  }
}

// ---------------------------------------------------------------------------
// Leitura, trava e escrita, com a mensagem pronta
// ---------------------------------------------------------------------------

async function lerDoRise(produtoId) {
  let produto;
  try {
    produto = await lerProdutoDoRise(produtoId);
  } catch (erro) {
    throw new FalhaDoEnvio(`Nao foi possivel ler o produto no Rise: ${mensagemDe(erro)}`);
  }
  if (!produto) throw new FalhaDoEnvio("Produto nao encontrado no Rise.");
  return produto;
}

/// A trava (BLING_ESCRITA e a lista de codigos liberados). Recusada, nada foi chamado.
function exigirEscrita(cliente, sku) {
  try {
    cliente.exigirEscrita(sku);
  } catch (erro) {
    throw new FalhaDoEnvio(mensagemDe(erro));
  }
}

async function buscar(cliente, sku) {
  try {
    return await buscarNoBling(cliente, sku);
  } catch (erro) {
    // `buscarNoBling` ja traduz o HTTP; aqui so se diz que nada foi enviado.
    throw new FalhaDoEnvio(`Nao foi possivel ler o produto no Bling, e nada foi enviado: ${mensagemDe(erro)}`);
  }
}

function recusaPorDuplicado(sku, quantidade) {
  return new FalhaDoEnvio(
    `Ha mais de um produto com o codigo ${sku} no Bling (${quantidade} encontrados). O Rise nao escolhe um sozinho: ` +
      "deixe so um com esse codigo no Bling e tente de novo. Nada foi enviado.",
  );
}

/// Sem caixa e sem espacos nas pontas, como a busca por codigo (`leitura.js`) e a trava compararam.
const chaveDoCodigo = (codigo) => String(codigo ?? "").trim().toLowerCase();

/**
 * Antes de CRIAR: o codigo pode existir no Bling como produto INATIVO, que a busca por codigo nao ve
 * (`GET /produtos?codigos[]=` so devolve ativos). Criar outro com o mesmo codigo duplicaria o
 * produto, e o novo nasceria sem estoque, sem fotos e sem os anuncios do ML e da Loja Integrada, que
 * continuam ligados ao inativo. O sinal disponivel e o `blingId` guardado (pela importacao): se ele
 * ainda aponta para um produto deste codigo que nao foi excluido (`situacao` diferente de "E"),
 * recusa. 404 (apagado de verdade) ou produto de outro codigo: o codigo esta livre e o cadastro
 * segue. Qualquer outro erro nesta leitura: na duvida, nao cria.
 *
 * O `blingId` aqui e so sinal de recusa, NUNCA alvo de escrita (Emenda 11): o produto criado e os
 * vinculos usam o id que a resposta do POST devolver.
 */
async function recusarSeExisteInativo(cliente, produto) {
  const id = idOuNull(produto.blingId);
  if (!id) return;

  const naoConferido = (motivo) =>
    new FalhaDoEnvio(`Nao foi possivel conferir no Bling o produto ja ligado a este (id ${id}): ${motivo}. Nada foi criado; tente de novo em alguns instantes.`);
  let resposta;
  try {
    resposta = await cliente.get(`/produtos/${id}`);
  } catch (erro) {
    throw naoConferido(mensagemDe(erro));
  }
  if (resposta?.status === 404) return;
  if (!resposta?.ok) throw naoConferido(`o Bling recusou a leitura (${motivoDoBling(resposta)})`);

  const lido = resposta.dados?.data;
  if (lido && chaveDoCodigo(lido.codigo) === chaveDoCodigo(produto.sku) && lido.situacao !== "E") {
    throw new FalhaDoEnvio("Este codigo existe no Bling como produto inativo: reative-o la e use Sincronizar. Nada foi criado.");
  }
}

/// Recusa o nome acima do limite do Bling, com o tamanho (contado em caracteres, nao em bytes).
function exigirNomeNoLimite(nome) {
  const tamanho = Array.from(String(nome ?? "")).length;
  if (tamanho > LIMITE_DO_NOME) {
    throw new FalhaDoEnvio(
      `O nome tem ${tamanho} caracteres e o Bling aceita no maximo ${LIMITE_DO_NOME}. Encurte o nome no Rise e tente de novo. Nada foi enviado.`,
    );
  }
}

/// O que o Bling disse ao recusar: HTTP, descricao e os campos apontados.
function motivoDoBling(resposta) {
  const erro = resposta?.dados?.error;
  const descricao = erro?.description ?? erro?.message ?? null;
  const campos = (Array.isArray(erro?.fields) ? erro.fields : [])
    .map((campo) => [campo?.element, campo?.msg].filter(Boolean).join(": "))
    .filter(Boolean);
  let texto = `HTTP ${resposta?.status ?? "sem status"}`;
  if (descricao) texto += `: ${descricao}`;
  if (campos.length) texto += ` (${campos.join("; ")})`;
  return texto;
}

function dicaDoStatus(status) {
  if (status === 429) return " O Bling limita a 3 chamadas por segundo na conta inteira: tente de novo em alguns instantes.";
  if (status === 401) return " Reconecte o Bling em Integracoes e tente de novo.";
  // O Bling pode ter gravado e a resposta e que falhou: repetir as cegas duplicaria.
  if (status >= 500) return " O Bling pode ter gravado mesmo assim: confira no Bling antes de tentar de novo.";
  return "";
}

/// Leitura do Bling no meio do envio (contatos, vinculos). Falhou: lanca, nunca "nao achei".
async function ler(cliente, caminho, params, oQue) {
  let resposta;
  try {
    resposta = await cliente.get(caminho, params);
  } catch (erro) {
    throw new FalhaDoEnvio(`Nao foi possivel concluir ${oQue} no Bling: ${mensagemDe(erro)}`);
  }
  if (!resposta?.ok) {
    throw new FalhaDoEnvio(`O Bling recusou ${oQue} (${motivoDoBling(resposta)}).${dicaDoStatus(resposta?.status)}`);
  }
  return resposta;
}

/// Uma escrita, uma vez so. Falhou (recusa ou excecao): lanca com o motivo, e quem chama para.
async function escrever(chamada, oQue) {
  let resposta;
  try {
    resposta = await chamada();
  } catch (erro) {
    throw new FalhaDoEnvio(`Falha em ${oQue}: ${mensagemDe(erro)}. Se foi tempo esgotado ou rede, confira no Bling antes de tentar de novo.`);
  }
  if (!resposta?.ok) {
    throw new FalhaDoEnvio(`O Bling recusou ${oQue} (${motivoDoBling(resposta)}).${dicaDoStatus(resposta?.status)}`);
  }
  return resposta;
}

// ---------------------------------------------------------------------------
// Gravacoes no Rise
// ---------------------------------------------------------------------------

/**
 * A copia de seguranca: o produto do Bling como estava ANTES do PATCH e o resumo do que mudou. So
 * e chamada depois de o Bling aceitar (envio recusado nao deixa copia), e na mesma transacao apaga
 * as mais antigas, deixando as `COPIAS_GUARDADAS` mais recentes.
 */
async function gravarCopia(produtoId, conteudo, alteracoes) {
  try {
    await prisma.$transaction(async (tx) => {
      await tx.blingCopiaProduto.create({ data: { produtoId, conteudo, alteracoes } });
      const velhas = await tx.blingCopiaProduto.findMany({
        where: { produtoId },
        orderBy: [{ criadoEm: "desc" }, { id: "desc" }],
        skip: COPIAS_GUARDADAS,
        select: { id: true },
      });
      if (velhas.length) await tx.blingCopiaProduto.deleteMany({ where: { id: { in: velhas.map((copia) => copia.id) } } });
    });
  } catch (erro) {
    throw new FalhaDoEnvio(`Os campos foram enviados ao Bling, mas a copia de seguranca nao foi gravada no Rise: ${mensagemDe(erro)}`);
  }
}

/**
 * Grava no produto o que so muda pelo envio, SEM subir o `atualizadoEm`: passar o valor atual
 * impede o `@updatedAt` do Prisma de trocar a data (sincronizar nao e editar, e a lista ordena por
 * `atualizadoEm`, entao o produto pularia para o topo). O mesmo valor no `where` e a conferencia de
 * que ninguem salvou o produto durante o envio: se salvou, nada e gravado (`count` 0), em vez de
 * apagar a data da edicao ou marcar como enviado o que mudou depois.
 */
async function gravarNoProduto(produto, dados) {
  const gravados = await prisma.produto.updateMany({
    where: { id: produto.id, atualizadoEm: produto.atualizadoEm },
    data: { ...dados, atualizadoEm: produto.atualizadoEm },
  });
  return gravados.count > 0;
}

/// O icone verde: a data e a assinatura do que acabou de ser enviado.
async function gravarSincronizado(produto, campos, fornecedores) {
  let gravou;
  try {
    gravou = await gravarNoProduto(produto, { blingSincronizadoEm: new Date(), blingAssinatura: assinaturaDoRise(campos, fornecedores) });
  } catch (erro) {
    throw new FalhaDoEnvio(`O Bling recebeu o envio, mas o Rise nao gravou que o produto foi sincronizado: ${mensagemDe(erro)}`);
  }
  if (!gravou) {
    throw new FalhaDoEnvio(
      "O Bling recebeu o envio, mas o produto foi alterado (ou excluido) no Rise durante o envio, entao ele nao foi marcado como sincronizado. Sincronize de novo para conferir.",
    );
  }
}

// ---------------------------------------------------------------------------
// Fornecedores: contato (Emenda 3) e vinculo (Emenda 4)
// ---------------------------------------------------------------------------

/// O id do tipo de contato "Fornecedor" desta conta, lido de `GET /contatos/tipos` (os ids sao da
/// conta, nunca fixos) uma vez por envio. Sem o tipo, nada e criado.
async function idDoTipoFornecedor(cliente, memoria) {
  if (memoria.idDoTipo === undefined) {
    const tipos = listaDe(await ler(cliente, "/contatos/tipos", undefined, "a leitura dos tipos de contato"));
    const tipo = tipos.find((candidato) => paraComparar(candidato?.descricao) === "fornecedor");
    memoria.idDoTipo = idOuNull(tipo?.id);
  }
  if (!memoria.idDoTipo) {
    throw new FalhaDoEnvio("o Bling nao tem o tipo de contato Fornecedor (GET /contatos/tipos), entao o contato nao foi criado. Crie o tipo no Bling e tente de novo.");
  }
  return memoria.idDoTipo;
}

/**
 * O contato do Bling deste fornecedor (Emenda 3), nesta ordem:
 * (a) pelo CNPJ (`numeroDocumento` com os 14 digitos);
 * (b) pelo nome: entre os resultados de `pesquisa` com o nome IGUAL ao do Rise (sem acento, caixa e
 *     espacos sobrando) e SEM documento, o primeiro que `GET /contatos/{id}` confirma ser do tipo
 *     Fornecedor. E usado como esta, sem escrever nele. Contato com documento nao entra aqui: se o
 *     documento fosse este CNPJ, (a) o teria achado, entao e outra empresa com o mesmo nome;
 * (c) so entao cria, com o CNPJ e o tipo Fornecedor. Buscar so pelo CNPJ e criar duplicaria quase
 *     todos os fornecedores: 578 dos 603 contatos Fornecedor do Bling nao tem documento.
 * Qualquer leitura que falhe interrompe ESTE fornecedor: "nao achei" por erro criaria um duplicado.
 */
async function contatoDoFornecedor(cliente, fornecedor, memoria) {
  const porDocumento = listaDe(await ler(cliente, "/contatos", { numeroDocumento: fornecedor.cnpj }, "a busca do contato pelo CNPJ"));
  const peloCnpj = porDocumento.find((contato) => digitos(contato?.numeroDocumento) === fornecedor.cnpj && idOuNull(contato?.id));
  if (peloCnpj) return idOuNull(peloCnpj.id);

  const nome = paraComparar(fornecedor.nome);
  if (nome) {
    const porNome = listaDe(await ler(cliente, "/contatos", { pesquisa: fornecedor.nome }, "a busca do contato pelo nome"));
    const candidatos = porNome.filter((contato) => idOuNull(contato?.id) && paraComparar(contato?.nome) === nome && !digitos(contato?.numeroDocumento));
    for (const candidato of candidatos) {
      const id = idOuNull(candidato.id);
      const contato = (await ler(cliente, `/contatos/${id}`, undefined, "a leitura do contato achado pelo nome")).dados?.data;
      const ehFornecedor = (Array.isArray(contato?.tiposContato) ? contato.tiposContato : []).some((tipo) => paraComparar(tipo?.descricao) === "fornecedor");
      if (ehFornecedor) return id;
    }
  }

  const idDoTipo = await idDoTipoFornecedor(cliente, memoria);
  const criado = await escrever(
    () => cliente.post("/contatos", { nome: fornecedor.nome, situacao: "A", tipo: "J", numeroDocumento: fornecedor.cnpj, tiposContato: [{ id: idDoTipo }] }),
    "a criacao do contato",
  );
  const id = idOuNull(criado.dados?.data?.id);
  if (!id) throw new FalhaDoEnvio("o Bling aceitou a criacao do contato, mas nao devolveu o id dele. Confira o contato no Bling antes de tentar de novo.");
  return id;
}

/// O que o Rise manda no vinculo. Campo vazio no Rise nao vai (nunca apaga o do Bling); `padrao`
/// sempre tem valor.
function camposDoVinculo(fornecedor) {
  const campos = {};
  if (fornecedor.descricao !== null && fornecedor.descricao !== undefined) campos.descricao = fornecedor.descricao;
  if (fornecedor.codigo !== null && fornecedor.codigo !== undefined) campos.codigo = fornecedor.codigo;
  if (fornecedor.precoCusto !== null && fornecedor.precoCusto !== undefined) campos.precoCusto = fornecedor.precoCusto;
  campos.padrao = Boolean(fornecedor.padrao);
  return campos;
}

function centavos(valor) {
  if (valor === null || valor === undefined || valor === "") return null;
  const numero = Number(valor);
  return Number.isFinite(numero) ? Math.round(numero * 100) : null;
}

/// O vinculo do Bling ja tem o que o Rise manda? So os campos que o Rise manda contam.
function vinculoIgual(existente, desejado) {
  return Object.entries(desejado).every(([chave, valor]) => {
    if (chave === "precoCusto") return centavos(existente?.precoCusto) === centavos(valor);
    if (chave === "padrao") return Boolean(existente?.padrao) === valor;
    return String(existente?.[chave] ?? "").trim() === valor;
  });
}

/**
 * Cria ou atualiza o vinculo produto-fornecedor (Emenda 4). Os vinculos do produto sao lidos uma
 * vez por envio e casados por `fornecedor.id` (e pelo `produto.id`, para nunca tocar o vinculo de
 * outro produto). Igual: nenhuma chamada. Diferente: `PUT` no mesmo vinculo, com o vinculo INTEIRO
 * como veio do Bling e os campos do Rise por cima (o que o `PUT` faz com o campo omitido nao esta
 * documentado, e o `precoCompra`, que o Rise nao tem, nao pode sumir). Ausente: `POST`.
 * Devolve true quando escreveu.
 */
async function gravarVinculo(cliente, idProduto, contatoId, fornecedor, memoria) {
  if (!memoria.vinculos) {
    memoria.vinculos = listaDe(await ler(cliente, "/produtos/fornecedores", { idProduto }, "a leitura dos fornecedores do produto"));
  }
  const desejado = camposDoVinculo(fornecedor);
  const existente = memoria.vinculos.find((vinculo) => idOuNull(vinculo?.fornecedor?.id) === contatoId && idOuNull(vinculo?.produto?.id) === idProduto);

  if (existente) {
    if (vinculoIgual(existente, desejado)) return false;
    const idVinculo = idOuNull(existente.id);
    if (!idVinculo) throw new FalhaDoEnvio("o vinculo deste fornecedor no Bling veio sem um id valido; nada foi alterado.");
    const corpo = { ...existente, ...desejado, produto: { id: idProduto }, fornecedor: { id: contatoId } };
    delete corpo.id;
    await escrever(() => cliente.put(`/produtos/fornecedores/${idVinculo}`, corpo), "a atualizacao do vinculo do fornecedor com o produto");
    return true;
  }

  await escrever(
    () => cliente.post("/produtos/fornecedores", { ...desejado, produto: { id: idProduto }, fornecedor: { id: contatoId } }),
    "a criacao do vinculo do fornecedor com o produto",
  );
  return true;
}

/**
 * Envia os fornecedores (ja normalizados: so os de CNPJ valido, um por CNPJ) ao produto `idProduto`
 * do Bling. Um fornecedor que falha e anotado e os outros seguem; quem chama decide o que fazer com
 * as falhas (a assinatura so avanca sem nenhuma). `enviados` conta vinculos criados ou atualizados.
 */
async function enviarFornecedores(cliente, idProduto, fornecedores) {
  const resultado = { enviados: 0, falhas: [] };
  const memoria = { vinculos: null, idDoTipo: undefined, contatos: new Map() };

  for (const fornecedor of fornecedores) {
    const nome = fornecedor.nome || fornecedor.cnpj;
    try {
      const contatoId = await contatoDoFornecedor(cliente, fornecedor, memoria);
      // Dois fornecedores do Rise no mesmo contato do Bling: o segundo sobrescreveria o vinculo do
      // primeiro. Fica para o operador corrigir o cadastro.
      if (memoria.contatos.has(contatoId)) {
        throw new FalhaDoEnvio(`cai no mesmo contato do Bling que o fornecedor ${memoria.contatos.get(contatoId)}; confira os dois cadastros.`);
      }
      memoria.contatos.set(contatoId, nome);
      if (await gravarVinculo(cliente, idProduto, contatoId, fornecedor, memoria)) resultado.enviados++;
    } catch (erro) {
      resultado.falhas.push(`Fornecedor ${nome}: ${textoDaFalha(erro)}`);
    }
  }
  return resultado;
}

function falhaDosFornecedores(falhas, antes = "") {
  return new FalhaDoEnvio(
    `${antes}${falhas.length} fornecedor(es) nao foram enviados ao Bling: ${falhas.join(" ")} ` +
      "Os demais foram enviados, mas o produto nao foi marcado como sincronizado: corrija e sincronize de novo.",
  );
}

const avisosSemCnpj = (produto) => fornecedoresSemCnpj(produto.fornecedores).map((nome) => `Fornecedor ${nome}: sem CNPJ valido, nao sera enviado ao Bling.`);

// ---------------------------------------------------------------------------
// Sincronizar um produto que ja existe no Bling
// ---------------------------------------------------------------------------

/**
 * Envia ao Bling os campos que mudaram e os fornecedores do produto do Rise. O produto tem que
 * existir no Bling com o mesmo codigo (SKU); se nao existe, o pop-up oferece "Cadastrar no Bling".
 *
 * Ordem: le o Rise; `exigirEscrita(sku)`; busca por codigo; compara (so o tipo `diferente` vai); se
 * nada difere, NAO chama o PATCH; senao `PATCH /produtos/{id da busca}` so com o que mudou
 * (`montarCorpoParcial`) e, so depois de o Bling aceitar, grava a copia de seguranca; fornecedores;
 * e, so com tudo certo, `blingSincronizadoEm` e `blingAssinatura`.
 *
 * `alterados` = os campos enviados, com `de` (o valor do Bling) e `para` (o do Rise), normalizados.
 * `fornecedores.enviados` = vinculos criados ou atualizados; `avisos` = fornecedores sem CNPJ, que
 * nao vao (nao e falha).
 *
 * @param {string} produtoId id do `Produto` no Rise (nao o SKU).
 * @param {ReturnType<typeof clienteBling>} [cliente]
 * @returns {Promise<{ok: boolean, erro?: string, alterados: {campo: string, de: unknown, para: unknown}[], fornecedores: {enviados: number, avisos: string[]}}>}
 */
export async function sincronizarProduto(produtoId, cliente = clienteBling()) {
  const saida = { alterados: [], fornecedores: { enviados: 0, avisos: [] } };
  const falhou = (erro) => ({ ok: false, erro, ...saida });

  return umPorVez(produtoId, falhou, async () => {
    try {
      const produto = await lerDoRise(produtoId);
      const sku = produto.sku;
      saida.fornecedores.avisos = avisosSemCnpj(produto);

      exigirEscrita(cliente, sku);

      const achado = await buscar(cliente, sku);
      // A busca so ve ativos: o codigo pode estar inativo no Bling, e cadastrar de novo o duplicaria.
      if (achado.situacao === "nao_existe") {
        throw new FalhaDoEnvio(
          "O codigo nao foi achado entre os produtos ativos do Bling. Se ele esta inativo la, reative-o e use Sincronizar; senao use Cadastrar no Bling.",
        );
      }
      if (achado.situacao === "duplicado") throw recusaPorDuplicado(sku, achado.quantidade);

      const campos = normalizarDoRise(produto);
      const mudaram = diferencas(campos, normalizarDoBling(achado.produto)).filter((diferenca) => diferenca.tipo === "diferente");

      if (mudaram.length > 0) {
        const corpo = montarCorpoParcial(achado.produto, campos, mudaram.map((diferenca) => diferenca.campo));
        if ("nome" in corpo) exigirNomeNoLimite(corpo.nome);
        await escrever(() => cliente.patch(`/produtos/${achado.id}`, corpo), "o envio dos campos");
        saida.alterados = mudaram.map((diferenca) => ({ campo: diferenca.campo, de: diferenca.bling, para: diferenca.rise }));
        await gravarCopia(produto.id, achado.produto, saida.alterados);
      }

      const fornecedores = normalizarFornecedoresDoRise(produto.fornecedores);
      const envio = await enviarFornecedores(cliente, achado.id, fornecedores);
      saida.fornecedores.enviados = envio.enviados;
      if (envio.falhas.length) throw falhaDosFornecedores(envio.falhas);

      await gravarSincronizado(produto, campos, fornecedores);
      return { ok: true, ...saida };
    } catch (erro) {
      return falhou(textoDaFalha(erro));
    }
  });
}

// ---------------------------------------------------------------------------
// Cadastrar no Bling um produto que ainda nao existe la
// ---------------------------------------------------------------------------

/**
 * Cria o produto no Bling (`POST /produtos` com `montarCorpoDeCadastro`) e grava o id dele em
 * `Produto.blingId`; depois envia os fornecedores e, com tudo certo, marca como sincronizado.
 *
 * Recusa, sem `POST`: codigo fora da trava; produto que ja existe no Bling ("use Sincronizar") ou
 * que existe mais de uma vez; codigo que existe INATIVO no Bling, pelo `blingId` guardado
 * (`recusarSeExisteInativo`); problema bloqueante de `validar` (sem nome, SKU ou preco); nome acima
 * de 120 caracteres. Se o cadastro deu certo e um fornecedor falhou, devolve `ok: false` COM o
 * `blingId`: o produto ja existe la, e o proximo passo e "Sincronizar".
 *
 * @param {string} produtoId id do `Produto` no Rise (nao o SKU).
 * @param {ReturnType<typeof clienteBling>} [cliente]
 * @returns {Promise<{ok: boolean, erro?: string, blingId?: number}>}
 */
export async function cadastrarNoBling(produtoId, cliente = clienteBling()) {
  const falhou = (erro, blingId) => ({ ok: false, erro, ...(blingId ? { blingId } : {}) });

  return umPorVez(produtoId, falhou, async () => {
    let blingId = null;
    try {
      const produto = await lerDoRise(produtoId);
      const sku = produto.sku;

      exigirEscrita(cliente, sku);

      const achado = await buscar(cliente, sku);
      if (achado.situacao === "existe") throw new FalhaDoEnvio(`O produto ${sku} ja existe no Bling; use Sincronizar.`);
      if (achado.situacao === "duplicado") throw recusaPorDuplicado(sku, achado.quantidade);
      await recusarSeExisteInativo(cliente, produto);

      const bloqueantes = validar(produto).filter((problema) => problema.bloqueante).map((problema) => problema.problema);
      if (bloqueantes.length) throw new FalhaDoEnvio(`Nao da para cadastrar no Bling: ${bloqueantes.join(" ")}`);

      const campos = normalizarDoRise(produto);
      exigirNomeNoLimite(campos.nome);

      const criado = await escrever(() => cliente.post("/produtos", montarCorpoDeCadastro(sku, campos)), "o cadastro do produto");
      blingId = idOuNull(criado.dados?.data?.id);
      if (!blingId) {
        throw new FalhaDoEnvio("O Bling aceitou o cadastro, mas nao devolveu o id do produto. Confira no Bling antes de tentar de novo.");
      }

      let gravou;
      try {
        gravou = await gravarNoProduto(produto, { blingId: String(blingId) });
      } catch (erro) {
        throw new FalhaDoEnvio(`O produto foi cadastrado no Bling (id ${blingId}), mas o Rise nao gravou o id: ${mensagemDe(erro)}. Use Sincronizar.`);
      }
      if (!gravou) {
        throw new FalhaDoEnvio(`O produto foi cadastrado no Bling (id ${blingId}), mas foi alterado no Rise durante o envio e o id nao foi gravado. Use Sincronizar.`);
      }

      const fornecedores = normalizarFornecedoresDoRise(produto.fornecedores);
      const envio = await enviarFornecedores(cliente, blingId, fornecedores);
      if (envio.falhas.length) throw falhaDosFornecedores(envio.falhas, `O produto foi cadastrado no Bling (id ${blingId}), mas `);

      await gravarSincronizado(produto, campos, fornecedores);
      return { ok: true, blingId };
    } catch (erro) {
      return falhou(textoDaFalha(erro), blingId);
    }
  });
}
