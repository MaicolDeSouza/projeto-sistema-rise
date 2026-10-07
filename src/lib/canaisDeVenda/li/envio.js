import { prisma } from "@/lib/db";
import { anuncioLIDoProduto, contextoDoProduto, documentosDoProduto, rascunhoDoAnuncio, salvarRascunhoLI } from "./banco";
import { assinaturaLI, diferencasLI, normalizarDaLI, normalizarDoRiseLI } from "./campos";
import { clienteLI } from "./cliente";
import { mesclarCorpoLI, montarCorpoDeCadastroLI } from "./corpo";
import { montarDescricaoLI } from "./descricao";
import { buscarNaLI, lerDetalheDaLI, listarCategoriasDaLI, listarMarcasDaLI, mesmaMarca, textoDoErroLI, urlNaLoja } from "./leitura";
import { rascunhoInicialLI } from "./rascunho";
import { validarRascunhoLI } from "./validacao";

/**
 * A escrita do Rise na Loja Integrada: Sincronizar (produto ja vinculado) e Cadastrar (produto que
 * nao existe la). O cliente entra por parametro (`clienteLI()`); o teste passa a LI falsa.
 *
 * Regras que vem da spec e da medicao de 07/10/2026:
 * - so Produto Conferido; as duas travas (`exigirEscrita`) ANTES da primeira escrita;
 * - nunca estoque (o Bling e o dono); nunca origem nem tipo de producao (a API nao grava);
 * - o preco de venda vai pelo /produto_preco/{id} (decisao do dono em 07/10/2026: o Sincronizar do Rise ja muda
 *   o preco no Bling, e o Bling nao mandava preco a LI). So o `cheio`: custo e promocional voltam como a LI tem;
 * - o PUT leva o produto inteiro, mesclado sobre o GET, e antes dele o GET vai para CopiaProdutoCanal;
 * - SEO pelo /seo/{id}, so quando mudou;
 * - a URL de produto que ja esta na loja NUNCA muda (decisao do dono em 07/10/2026: o Google ja a indexou):
 *   o slug do nome so vale no Cadastrar, como `apelido`. O /alias nao e mais chamado;
 * - nenhuma escrita repete sozinha (o cliente usa `tentativas: 1`): resposta perdida nao quer dizer
 *   que a LI nao gravou, e repetir poderia escrever duas vezes.
 */

const CANAL = "LOJA_INTEGRADA";
const COPIAS_GUARDADAS = 3;
const CAMPOS_FORA_DO_PUT = new Set(["seoTitulo", "seoDescription", "preco"]);

/// Falha com a mensagem pronta e a etapa em que o envio parou.
class FalhaDoEnvio extends Error {
  constructor(etapa, mensagem) {
    super(mensagem);
    this.etapa = etapa;
  }
}

// Um envio por produto por vez, neste processo (o site e um script nao se enxergam).
const emAndamento = new Set();
async function umPorVez(produtoId, recusar, executar) {
  const chave = String(produtoId ?? "");
  if (emAndamento.has(chave)) return recusar("Já há um envio deste produto à Loja Integrada em andamento. Aguarde terminar e confira o resultado.");
  emAndamento.add(chave);
  try {
    return await executar();
  } finally {
    emAndamento.delete(chave);
  }
}

/** A recusa da LI em portugues; o 400 traz `error: [{campo: mensagem}]`. */
function textoDaRecusa(resposta) {
  const { status, dados } = resposta ?? {};
  if (status === 429) return "A Loja Integrada recusou por limite de chamadas (100 por minuto). Confira na loja o que já foi gravado antes de tentar de novo.";
  if (status === 401 || status === 403) return "A Loja Integrada recusou o acesso: confira ou renove o Personal Token em Integrações.";
  if (status >= 500) return `A Loja Integrada está com problema (HTTP ${status}). Confira na loja o que já foi gravado antes de tentar de novo.`;
  const campos = Array.isArray(dados?.error) ? dados.error.flatMap((item) => Object.entries(item ?? {}).map(([campo, msg]) => `${campo}: ${msg}`)) : [];
  if (campos.length) return `A Loja Integrada recusou o envio (HTTP ${status}): ${campos.join("; ")}`;
  if (status === 400 && !dados) return "A Loja Integrada recusou o envio (HTTP 400, sem detalhe). Confira as medidas (cm inteiros) e o nome (até 255 caracteres).";
  return `A Loja Integrada recusou o envio (HTTP ${status}${dados?.error_message ? `): ${dados.error_message}` : ")"}.`;
}

/** Uma escrita: sem resposta vira "confira antes de tentar de novo"; recusa vira o texto da LI. */
async function escrever(etapa, chamada) {
  let resposta;
  try {
    resposta = await chamada();
  } catch (erro) {
    throw new FalhaDoEnvio(etapa, `A Loja Integrada não respondeu (${erro?.message ?? erro}). Ela pode ter gravado: confira na Loja Integrada antes de tentar de novo.`);
  }
  if (!resposta?.ok) throw new FalhaDoEnvio(etapa, textoDaRecusa(resposta));
  return resposta.dados;
}

/** Leitura dentro do envio: o erro ja traduzido, com a etapa. */
async function ler(etapa, chamada) {
  try {
    return await chamada();
  } catch (erro) {
    throw erro instanceof FalhaDoEnvio ? erro : new FalhaDoEnvio(etapa, textoDoErroLI(erro));
  }
}

const idDaUri = (uri) => String(uri ?? "").split("/").filter(Boolean).at(-1) ?? null;

/**
 * O preco cheio pelo /produto_preco/{id}: le o que a LI tem, guarda copia e devolve custo, promocional e
 * "sob consulta" como estavam (o PUT pode zerar chave ausente; nao medido). Devolve o corpo enviado.
 */
async function gravarPreco(cliente, produtoId, idExterno, preco, alterados) {
  const atual = await ler("preco", async () => {
    const resposta = await cliente.get(`/produto_preco/${idExterno}`);
    if (!resposta?.ok) throw new FalhaDoEnvio("preco", textoDaRecusa(resposta));
    return resposta.dados ?? {};
  });
  await guardarCopia(produtoId, { produto_preco: atual }, alterados);
  const corpo = { cheio: preco, custo: atual.custo ?? null, promocional: atual.promocional ?? null, sob_consulta: Boolean(atual.sob_consulta) };
  await escrever("preco", () => cliente.put(`/produto_preco/${idExterno}`, corpo));
  return corpo;
}

/** A marca pelo nome, sem caixa e sem acento; so cria (POST /marca) quando nao ha nenhuma igual. */
async function garantirMarca(cliente, nome) {
  const marcas = await ler("marca", () => listarMarcasDaLI(cliente));
  const achada = marcas.find((marca) => mesmaMarca(marca.nome, nome));
  if (achada) return { uri: achada.uri, criada: null };
  const nova = await escrever("marca", () => cliente.post("/marca", { nome: String(nome).trim() }));
  return { uri: nova.resource_uri ?? `/api/v1/marca/${nova.id}`, criada: String(nome).trim() };
}

/** Categorias do rascunho que ainda existem na loja; as outras saem do envio (o dono esta renovando). */
async function categoriasVivas(cliente, ids) {
  if (!ids.length) return { validas: [], ignoradas: [] };
  const existentes = new Set((await ler("leitura", () => listarCategoriasDaLI(cliente))).map((categoria) => categoria.id));
  return { validas: ids.filter((id) => existentes.has(id)), ignoradas: ids.filter((id) => !existentes.has(id)) };
}

async function contextoDoEnvio(produto, rascunho, cliente) {
  const documentos = await documentosDoProduto(produto);
  const rise = normalizarDoRiseLI(produto, rascunho, { documentos });
  const { validas, ignoradas } = await categoriasVivas(cliente, rise.categorias);
  const descricaoHtml = montarDescricaoLI({ descricao: produto.descricaoBase, documentos });
  return { rise, riseEnvio: { ...rise, categorias: validas }, ignoradas, descricaoHtml, categoriasUris: validas.map((id) => `/api/v1/categoria/${id}`) };
}

async function guardarCopia(produtoId, conteudo, alteracoes) {
  await prisma.copiaProdutoCanal.create({ data: { canal: CANAL, produtoId, conteudo, alteracoes } });
  const velhas = await prisma.copiaProdutoCanal.findMany({ where: { produtoId, canal: CANAL }, orderBy: { criadoEm: "desc" }, skip: COPIAS_GUARDADAS, select: { id: true } });
  if (velhas.length) await prisma.copiaProdutoCanal.deleteMany({ where: { id: { in: velhas.map((copia) => copia.id) } } });
}

async function gravarFalha(anuncioId, etapa, erro) {
  const anuncio = await prisma.anuncio.findUnique({ where: { id: anuncioId }, select: { dados: true } });
  await prisma.anuncio.update({ where: { id: anuncioId }, data: { status: "ERRO", erro, dados: { ...(anuncio?.dados ?? {}), etapa } } });
}

async function gravarSucesso(anuncioId, produtoId, { assinatura, payload, url, ativo, idExterno }) {
  const anuncio = await prisma.anuncio.findUnique({ where: { id: anuncioId }, select: { dados: true } });
  await prisma.$transaction([
    prisma.anuncio.update({
      where: { id: anuncioId },
      data: {
        status: "PUBLICADO",
        hashConteudo: assinatura,
        sincronizadoEm: new Date(),
        payloadEnviado: payload,
        erro: null,
        ...(idExterno ? { idExterno: String(idExterno) } : {}),
        ...(url ? { urlExterna: url } : {}),
        ...(ativo === undefined ? {} : { situacaoCanal: ativo ? "ATIVA" : "PAUSADA" }),
        dados: { ...(anuncio?.dados ?? {}), etapa: null },
      },
    }),
    ...(url ? [prisma.produto.update({ where: { id: produtoId }, data: { urlLojaIntegrada: url } })] : []),
  ]);
}

function primeiroBloqueio(rascunho, produto) {
  return validarRascunhoLI(rascunho, { produto, categoriasDaLI: null }).find((problema) => problema.bloqueante)?.problema ?? null;
}

/**
 * Sincronizar: o produto ja vinculado (`idExterno`) recebe do Rise os campos que mudaram. Etapas, em
 * ordem: trava, leitura, marca, produto, seo, preco, gravacao. Falha depois da trava deixa o anuncio
 * em ERRO com a etapa, e a assinatura nao muda (o icone continua dizendo que ha o que enviar).
 */
export async function sincronizarProdutoLI(produtoId, cliente = clienteLI()) {
  const vazio = { alterados: [], marcaCriada: null, categoriasIgnoradas: [] };
  const recusa = (erro, etapa = "trava") => ({ ok: false, erro, etapa, ...vazio });

  return umPorVez(produtoId, recusa, async () => {
    const produto = await contextoDoProduto(produtoId);
    if (!produto) return recusa("Produto não encontrado.");
    if (!produto.conferido) return recusa(`O produto ${produto.sku} não está Conferido. Só produto Conferido vai para a Loja Integrada.`);
    const anuncio = await anuncioLIDoProduto(produtoId);
    if (!anuncio?.idExterno) {
      return recusa("Este produto ainda não está vinculado à Loja Integrada: abra o pop-up para vincular pelo SKU, ou use Cadastrar na LI.");
    }
    const rascunho = rascunhoDoAnuncio(anuncio);
    const bloqueio = primeiroBloqueio(rascunho, produto);
    if (bloqueio) return recusa(bloqueio);
    try {
      cliente.exigirEscrita(produto.sku);
    } catch (erro) {
      return recusa(erro?.message ?? String(erro));
    }

    const estado = { etapa: "leitura", alterados: [], marcaCriada: null, categoriasIgnoradas: [] };
    try {
      const busca = await ler("leitura", () => buscarNaLI(cliente, produto.sku));
      if (busca.situacao === "removido") throw new FalhaDoEnvio("leitura", `O código ${produto.sku} está na lixeira da Loja Integrada: restaure-o lá antes de sincronizar.`);
      if (busca.situacao === "duplicado") throw new FalhaDoEnvio("leitura", `Há mais de um produto com o código ${produto.sku} na Loja Integrada. Deixe um só antes de sincronizar.`);
      if (busca.situacao === "nao_existe") throw new FalhaDoEnvio("leitura", `O código ${produto.sku} não existe mais na Loja Integrada.`);
      if (String(busca.id) !== String(anuncio.idExterno)) {
        throw new FalhaDoEnvio("leitura", `O produto deste código na Loja Integrada mudou de id (o Rise guardou ${anuncio.idExterno}, a loja tem ${busca.id}). Confira na loja.`);
      }
      const detalhe = await ler("leitura", () => lerDetalheDaLI(cliente, anuncio.idExterno));
      const li = normalizarDaLI(detalhe.produto, detalhe.seo, { marcaNome: detalhe.marcaNome });
      const { rise, riseEnvio, ignoradas, descricaoHtml, categoriasUris } = await contextoDoEnvio(produto, rascunho, cliente);
      estado.categoriasIgnoradas = ignoradas;
      const diferentes = diferencasLI(riseEnvio, li).filter((item) => item.tipo === "diferente");
      estado.alterados = diferentes.map(({ campo, li: de, rise: para }) => ({ campo, de, para }));
      const campos = new Set(diferentes.map((item) => item.campo));
      const payload = {};

      let marcaUri = null;
      if (campos.has("marca")) {
        estado.etapa = "marca";
        const marca = await garantirMarca(cliente, rascunho.marca);
        marcaUri = marca.uri;
        estado.marcaCriada = marca.criada;
      }

      const camposDoPut = [...campos].filter((campo) => !CAMPOS_FORA_DO_PUT.has(campo));
      if (camposDoPut.length) {
        estado.etapa = "produto";
        await guardarCopia(produtoId, detalhe.produto, estado.alterados);
        const corpo = mesclarCorpoLI(detalhe.produto, riseEnvio, camposDoPut, { descricaoHtml, marcaUri, categoriasUris });
        await escrever("produto", () => cliente.put(`/produto/${anuncio.idExterno}`, corpo));
        payload.produto = corpo;
      }

      if (campos.has("seoTitulo") || campos.has("seoDescription")) {
        estado.etapa = "seo";
        // Lado vazio no Rise fica com o valor da LI: o envio nunca apaga.
        const seo = { title: riseEnvio.seoTitulo ?? li.seoTitulo ?? "", description: riseEnvio.seoDescription ?? li.seoDescription ?? "" };
        await escrever("seo", () => cliente.put(`/seo/${idDaUri(detalhe.produto.seo)}`, seo));
        payload.seo = seo;
      }

      if (campos.has("preco")) {
        estado.etapa = "preco";
        payload.preco = await gravarPreco(cliente, produtoId, anuncio.idExterno, riseEnvio.preco, estado.alterados.filter((item) => item.campo === "preco"));
      }

      estado.etapa = "gravacao";
      const final = Object.keys(payload).length ? await ler("gravacao", () => lerDetalheDaLI(cliente, anuncio.idExterno)) : detalhe;
      await gravarSucesso(anuncio.id, produtoId, {
        assinatura: assinaturaLI(rise),
        payload,
        url: urlNaLoja(final.produto.url ?? final.produto.apelido),
        ativo: final.produto.ativo,
      });
      return { ok: true, etapa: "gravacao", alterados: estado.alterados, marcaCriada: estado.marcaCriada, categoriasIgnoradas: estado.categoriasIgnoradas };
    } catch (erro) {
      const texto = erro instanceof FalhaDoEnvio ? erro.message : `Erro inesperado no envio a Loja Integrada: ${erro?.message ?? erro}`;
      const etapa = erro instanceof FalhaDoEnvio ? erro.etapa : estado.etapa;
      await gravarFalha(anuncio.id, etapa, texto);
      return { ok: false, erro: texto, etapa, alterados: estado.alterados, marcaCriada: estado.marcaCriada, categoriasIgnoradas: estado.categoriasIgnoradas };
    }
  });
}

/**
 * Cadastrar: cria na LI o produto que nao existe la, INATIVO (o dono confere na loja e ativa). Recusa
 * sem NCM (a NF-e da LI exige), produto ja vinculado e SKU que ja existe (ou esta na lixeira). O
 * vinculo e gravado logo depois do POST: se o SEO falhar em seguida, o proximo clique nao duplica.
 */
export async function cadastrarNaLI(produtoId, cliente = clienteLI()) {
  const recusa = (erro) => ({ ok: false, erro });

  return umPorVez(produtoId, recusa, async () => {
    const produto = await contextoDoProduto(produtoId);
    if (!produto) return recusa("Produto não encontrado.");
    if (!produto.conferido) return recusa(`O produto ${produto.sku} não está Conferido. Só produto Conferido vai para a Loja Integrada.`);
    if (!String(produto.ncm ?? "").replace(/\D/g, "")) {
      return recusa("Sem NCM a Loja Integrada não emite NF-e: preencha o NCM no produto antes de cadastrar.");
    }
    let anuncio = await anuncioLIDoProduto(produtoId);
    if (anuncio?.idExterno) return recusa(`Este produto já está na Loja Integrada (id ${anuncio.idExterno}): use Sincronizar.`);
    const rascunho = anuncio ? rascunhoDoAnuncio(anuncio) : rascunhoInicialLI(produto);
    const bloqueio = primeiroBloqueio(rascunho, produto);
    if (bloqueio) return recusa(bloqueio);
    try {
      cliente.exigirEscrita(produto.sku);
    } catch (erro) {
      return recusa(erro?.message ?? String(erro));
    }

    let idExterno = null;
    try {
      const busca = await ler("leitura", () => buscarNaLI(cliente, produto.sku));
      if (busca.situacao === "existe") return recusa(`O código ${produto.sku} já existe na Loja Integrada: abra o pop-up do ícone para vincular.`);
      if (busca.situacao === "removido") return recusa(`O código ${produto.sku} está na lixeira da Loja Integrada: restaure-o lá em vez de cadastrar de novo.`);
      if (busca.situacao === "duplicado") return recusa(`Há mais de um produto com o código ${produto.sku} na Loja Integrada.`);

      if (!anuncio) {
        const salvo = await salvarRascunhoLI(null, rascunho);
        if (!salvo.ok) return recusa(salvo.erro);
        anuncio = await anuncioLIDoProduto(produtoId);
      }

      const { rise, riseEnvio, descricaoHtml, categoriasUris } = await contextoDoEnvio(produto, rascunho, cliente);
      const marca = riseEnvio.marca ? await garantirMarca(cliente, rascunho.marca) : { uri: null };
      const corpo = montarCorpoDeCadastroLI({ sku: produto.sku, rise: riseEnvio, descricaoHtml, marcaUri: marca.uri, categoriasUris });
      const criado = await escrever("produto", () => cliente.post("/produto", corpo));
      idExterno = String(criado.id);
      const url = urlNaLoja(criado.url ?? criado.apelido);
      // O vinculo vai ja: o produto existe na LI a partir daqui, falhe o que falhar depois.
      await prisma.$transaction([
        prisma.anuncio.update({ where: { id: anuncio.id }, data: { idExterno, urlExterna: url, situacaoCanal: "PAUSADA" } }),
        ...(url ? [prisma.produto.update({ where: { id: produtoId }, data: { urlLojaIntegrada: url } })] : []),
      ]);

      const payload = { produto: corpo };
      if (riseEnvio.seoTitulo || riseEnvio.seoDescription) {
        const seo = { title: riseEnvio.seoTitulo ?? "", description: riseEnvio.seoDescription ?? "" };
        await escrever("seo", () => cliente.put(`/seo/${idDaUri(criado.seo)}`, seo));
        payload.seo = seo;
      }

      if (riseEnvio.preco !== null) {
        payload.preco = await gravarPreco(cliente, produtoId, idExterno, riseEnvio.preco, [{ campo: "preco", de: null, para: riseEnvio.preco }]);
      }

      await gravarSucesso(anuncio.id, produtoId, { assinatura: assinaturaLI(rise), payload, url, ativo: false, idExterno });
      return { ok: true, idExterno, urlExterna: url };
    } catch (erro) {
      const texto = erro instanceof FalhaDoEnvio ? erro.message : `Erro inesperado no cadastro na Loja Integrada: ${erro?.message ?? erro}`;
      if (anuncio) await gravarFalha(anuncio.id, erro?.etapa ?? "produto", texto);
      return { ok: false, erro: texto, ...(idExterno ? { idExterno } : {}) };
    }
  });
}
