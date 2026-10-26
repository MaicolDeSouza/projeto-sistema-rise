import { clienteBling } from "@/lib/blingSync/cliente";
import { lerSaldosDoBling } from "@/lib/blingSync/saldos";
import { prisma } from "@/lib/db";
import { ligarNoBlingLI } from "./blingLoja";
import { corpoDoEstoqueInicialLI } from "./etapasCadastro";
import {
  anuncioLIDoProduto,
  contextoDoProduto,
  documentosDoProduto,
  fotosDoProduto,
  gravarFotosEnviadasLI,
  rascunhoDoAnuncio,
  salvarRascunhoLI,
  urlPublicaDaFoto,
} from "./banco";
import { fotosDaLoja, fotosDoAnuncio, fotosEnviadas, planoDasFotosLI } from "./fotos";
import { assinaturaLI, diferencasLI, normalizarDaLI, normalizarDoRiseLI } from "./campos";
import { semAncestraisRedundantes } from "./categorias";
import { clienteLI } from "./cliente";
import { mesclarCorpoLI, montarCorpoDeCadastroLI } from "./corpo";
import { montarDescricaoLI } from "./descricao";
import { buscarNaLI, lerDetalheDaLI, lerEstoqueDaLI, listarCategoriasDaLI, listarMarcasDaLI, mesmaMarca, textoDoErroLI, urlNaLoja } from "./leitura";
import { comProgresso } from "./progresso";
import { rascunhoInicialLI } from "./rascunho";
import { validarRascunhoLI } from "./validacao";

/**
 * A escrita do Rise na Loja Integrada: Sincronizar (produto ja vinculado) e Cadastrar (produto que
 * nao existe la). O cliente entra por parametro (`clienteLI()`); o teste passa a LI falsa.
 *
 * Regras que vem da spec e da medicao de 07/10/2026:
 * - so Produto Conferido; as duas travas (`exigirEscrita`) ANTES da primeira escrita;
 * - nunca estoque (o Bling e o dono), salvo UMA vez no cadastro automatico (`etapasDepoisDeCriar`, 24/10/2026: ligar
 *   no Bling nao manda o saldo, e o produto ativo ficaria sem controle de estoque); nunca origem nem tipo de producao;
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
/**
 * As fotos do produto (`fotos.js`): apaga as da loja quando o plano manda trocar e envia as do Rise na ordem
 * (a primeira e a capa), uma por `POST /produto_imagem`. O que foi enviado vai para `dados.fotosLI`, inclusive
 * se o envio parar no meio: o proximo Sincronizar so acrescenta as que faltaram.
 * Sem APP_URL_PUBLICA (o Rise do PC) a loja nao alcanca as fotos: nada e enviado e o resultado diz por que.
 */
async function enviarFotosLI(cliente, { produto, anuncioId, idExterno, produtoLI }) {
  // Todas as fotos validadas, na ordem do cadastro (pedido do dono em 21/10/2026: nao ha escolha por anuncio).
  const fotos = await fotosDoProduto(produto);
  const desejadas = fotosDoAnuncio(fotos.map((foto) => foto.id), fotos);
  const naLoja = fotosDaLoja(produtoLI);
  const atual = await prisma.anuncio.findUnique({ where: { id: anuncioId }, select: { dados: true } });
  const plano = planoDasFotosLI({ desejadas, naLoja, enviadas: fotosEnviadas(atual?.dados) });
  if (plano.acao === "nada") return { acao: "nada", texto: null };
  if (!urlPublicaDaFoto(produto.sku, desejadas[0].arquivo)) {
    return { acao: "nada", texto: "As fotos não foram enviadas: este Rise não tem endereço público (APP_URL_PUBLICA). Sincronize pela VPS." };
  }

  for (const id of plano.apagar) await escrever("fotos", () => cliente.delete(`/produto_imagem/${id}`));
  const registro = plano.acao === "acrescentar" ? fotosEnviadas(atual?.dados) : [];
  if (plano.apagar.length) await gravarFotosEnviadasLI(anuncioId, registro);
  try {
    for (const [indice, foto] of plano.enviar.entries()) {
      const posicao = plano.posicaoInicial + indice;
      const criada = await escrever("fotos", () =>
        cliente.post("/produto_imagem", {
          imagem_url: urlPublicaDaFoto(produto.sku, foto.arquivo),
          produto: `/api/v1/produto/${idExterno}`,
          principal: posicao === 0,
          posicao,
          mime: "image/jpeg",
        }),
      );
      registro.push({ arquivo: foto.arquivo, liId: String(criada?.id ?? "") });
    }
  } finally {
    await gravarFotosEnviadasLI(anuncioId, registro.filter((item) => item.liId));
  }
  const texto =
    plano.acao === "acrescentar"
      ? `Fotos: ${plano.enviar.length} acrescentada(s) na loja.`
      : `Fotos: ${plano.apagar.length ? `${plano.apagar.length} apagada(s) da loja e ` : ""}${plano.enviar.length} enviada(s) do Rise, na ordem do cadastro.`;
  return { acao: plano.acao, texto, apagadas: plano.apagar.length, enviadas: plano.enviar.length };
}

async function garantirMarca(cliente, nome) {
  const marcas = await ler("marca", () => listarMarcasDaLI(cliente));
  const achada = marcas.find((marca) => mesmaMarca(marca.nome, nome));
  if (achada) return { uri: achada.uri, criada: null };
  const nova = await escrever("marca", () => cliente.post("/marca", { nome: String(nome).trim() }));
  return { uri: nova.resource_uri ?? `/api/v1/marca/${nova.id}`, criada: String(nome).trim() };
}

/** Categorias do rascunho que ainda existem na loja; as outras saem do envio (o dono esta renovando). */
async function categoriasVivas(cliente, ids) {
  if (!ids.length) return { validas: [], ignoradas: [], arvore: [] };
  const arvore = await ler("leitura", () => listarCategoriasDaLI(cliente));
  const existentes = new Set(arvore.map((categoria) => categoria.id));
  return { validas: ids.filter((id) => existentes.has(id)), ignoradas: ids.filter((id) => !existentes.has(id)), arvore };
}

async function contextoDoEnvio(produto, rascunho, cliente) {
  const documentos = await documentosDoProduto(produto);
  const rise = normalizarDoRiseLI(produto, rascunho, { documentos });
  const { validas, ignoradas, arvore } = await categoriasVivas(cliente, rise.categorias);
  // So a categoria mais especifica vai (24/10/2026, 100105): o pai marcado junto da filha e redundante, porque a loja
  // agrega as subcategorias, e o painel tambem marca so a filha. O rascunho e a assinatura do icone seguem como estao.
  const enviadas = semAncestraisRedundantes(validas, arvore);
  const descricaoHtml = montarDescricaoLI({ descricao: produto.descricaoBase, documentos });
  return { rise, riseEnvio: { ...rise, categorias: enviadas }, ignoradas, arvore, descricaoHtml, categoriasUris: enviadas.map((id) => `/api/v1/categoria/${id}`) };
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

/**
 * O cadastro parou DEPOIS de o produto existir na loja (ligar no Bling, estoque ou ativar). O `status` nao vira
 * ERRO: o anuncio esta na LI e o conteudo foi enviado. Fica o motivo em `dados.cadastroLI`, que acende o "!" do
 * icone e o "Completar o cadastro" do editor.
 */
async function gravarCadastroIncompleto(anuncioId, etapa, erro) {
  const anuncio = await prisma.anuncio.findUnique({ where: { id: anuncioId }, select: { dados: true } });
  await prisma.anuncio.update({ where: { id: anuncioId }, data: { erro, dados: { ...(anuncio?.dados ?? {}), cadastroLI: { etapa, erro, em: new Date().toISOString() } } } });
}

async function finalizarCadastro(anuncioId, ativo) {
  const anuncio = await prisma.anuncio.findUnique({ where: { id: anuncioId }, select: { dados: true } });
  const { cadastroLI: _, ...dados } = anuncio?.dados ?? {};
  await prisma.anuncio.update({ where: { id: anuncioId }, data: { erro: null, situacaoCanal: ativo ? "ATIVA" : "PAUSADA", dados } });
}

/**
 * Ligar no Bling, gravar o estoque inicial e ativar (pedido do dono em 24/10/2026). Cada etapa LE antes de
 * escrever: o vinculo que ja existe nao e criado de novo, o estoque que o Bling ja abasteceu nao e regravado e o
 * produto ativo nao recebe PUT. E isso que deixa o "Completar o cadastro" repetir sem escrever duas vezes.
 * As travas da LI e do Bling foram conferidas por quem chama. Devolve as etapas que passaram.
 */
async function etapasDepoisDeCriar(cliente, bling, { sku, idExterno, feitas, ativar = true, progresso = null }) {
  progresso?.andando("ligar_bling");
  const ligado = await ligarNoBlingLI(bling, sku, idExterno);
  if (!ligado.ok) throw new FalhaDoEnvio("ligar_bling", ligado.erro ?? "O produto não foi ligado à Loja Integrada no Bling.");
  feitas.push("ligar_bling");
  progresso?.feita("ligar_bling");

  progresso?.andando("estoque");
  const estoque = await ler("estoque", () => lerEstoqueDaLI(cliente, idExterno));
  let detalheDoEstoque = "já na loja";
  if (!estoque.gerenciado) {
    const saldos = await lerSaldosDoBling(bling, [sku]);
    if (!saldos.ok) throw new FalhaDoEnvio("estoque", saldos.erro);
    const doCodigo = saldos.itens.filter((item) => item.codigo.trim().toLowerCase() === String(sku).trim().toLowerCase());
    if (doCodigo.length !== 1) {
      throw new FalhaDoEnvio("estoque", `O Bling não devolveu um saldo único para o código ${sku}: o estoque não foi gravado na Loja Integrada e o anúncio ficou pausado.`);
    }
    const corpoDoEstoque = corpoDoEstoqueInicialLI(doCodigo[0].saldo);
    await escrever("estoque", () => cliente.put(`/produto_estoque/${idExterno}`, corpoDoEstoque));
    detalheDoEstoque = `${corpoDoEstoque.quantidade} un.`;
  }
  feitas.push("estoque");
  progresso?.feita("estoque", detalheDoEstoque);

  // O liga/desliga "Ativo na loja" desligado (26/10/2026): o produto fica pausado, com o vinculo e o estoque no lugar.
  if (!ativar) {
    progresso?.feita("ativar", "mantido pausado");
    return;
  }

  progresso?.andando("ativar");
  const detalhe = await ler("ativar", () => lerDetalheDaLI(cliente, idExterno));
  if (detalhe.produto?.ativo !== true) {
    // O PUT da LI exige o produto inteiro (medido): o GET sem as chaves so de leitura, com `ativo: true`.
    const corpo = { ...mesclarCorpoLI(detalhe.produto, {}, [], {}), ativo: true };
    await escrever("ativar", () => cliente.put(`/produto/${idExterno}`, corpo));
    const relido = await ler("ativar", () => lerDetalheDaLI(cliente, idExterno));
    if (relido.produto?.ativo !== true) throw new FalhaDoEnvio("ativar", "A Loja Integrada aceitou, mas a releitura mostra o produto inativo. Confira na loja.");
  }
  feitas.push("ativar");
  progresso?.feita("ativar");
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

  // O popup de andamento do editor le estas marcas (`progresso.js`); elas nao mudam o envio.
  return umPorVez(produtoId, recusa, () => comProgresso(produtoId, "sincronizar", async (progresso) => {
    progresso.andando("permissao");
    const produto = await contextoDoProduto(produtoId);
    if (!produto) return recusa("Produto não encontrado.");
    if (!produto.conferido) return recusa(`O produto ${produto.sku} não está Conferido. Só produto Conferido vai para a Loja Integrada.`);
    const anuncio = await anuncioLIDoProduto(produtoId);
    if (!anuncio?.idExterno) {
      return recusa("Este produto ainda não está vinculado à Loja Integrada: abra o pop-up para vincular pelo SKU, ou use Cadastrar na LI.");
    }
    const rascunho = rascunhoDoAnuncio(anuncio, produto);
    const bloqueio = primeiroBloqueio(rascunho, produto);
    if (bloqueio) return recusa(bloqueio);
    try {
      cliente.exigirEscrita(produto.sku);
    } catch (erro) {
      return recusa(erro?.message ?? String(erro));
    }

    progresso.feita("permissao");

    const estado = { etapa: "leitura", alterados: [], marcaCriada: null, categoriasIgnoradas: [] };
    try {
      progresso.andando("ler");
      const busca = await ler("leitura", () => buscarNaLI(cliente, produto.sku));
      if (busca.situacao === "removido") throw new FalhaDoEnvio("leitura", `O código ${produto.sku} está na lixeira da Loja Integrada: restaure-o lá antes de sincronizar.`);
      if (busca.situacao === "duplicado") throw new FalhaDoEnvio("leitura", `Há mais de um produto com o código ${produto.sku} na Loja Integrada. Deixe um só antes de sincronizar.`);
      if (busca.situacao === "nao_existe") throw new FalhaDoEnvio("leitura", `O código ${produto.sku} não existe mais na Loja Integrada.`);
      if (String(busca.id) !== String(anuncio.idExterno)) {
        throw new FalhaDoEnvio("leitura", `O produto deste código na Loja Integrada mudou de id (o Rise guardou ${anuncio.idExterno}, a loja tem ${busca.id}). Confira na loja.`);
      }
      const detalhe = await ler("leitura", () => lerDetalheDaLI(cliente, anuncio.idExterno));
      const li = normalizarDaLI(detalhe.produto, detalhe.seo, { marcaNome: detalhe.marcaNome });
      const { rise, riseEnvio, ignoradas, arvore, descricaoHtml, categoriasUris } = await contextoDoEnvio(produto, rascunho, cliente);
      estado.categoriasIgnoradas = ignoradas;
      // A loja com o pai a mais (o 100101 tem pai + filha) e a mesma coisa que so a filha: nada de categoria a enviar.
      const liComparado = { ...li, categorias: semAncestraisRedundantes(li.categorias, arvore) };
      // Cadastro incompleto (parou no estoque, por exemplo): o Sincronizar nao ativa o produto, senao ele iria ao ar sem o
      // estoque na loja. Quem ativa e o "Completar o cadastro".
      const cadastroIncompleto = Boolean(anuncio.dados?.cadastroLI);
      const diferentes = diferencasLI(riseEnvio, liComparado).filter((item) => item.tipo === "diferente" && !(cadastroIncompleto && item.campo === "ativo"));
      estado.alterados = diferentes.map(({ campo, li: de, rise: para }) => ({ campo, de, para }));
      const campos = new Set(diferentes.map((item) => item.campo));
      const payload = {};
      progresso.feita("ler");
      progresso.andando("campos");

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

      const camposEnviados = estado.alterados.filter((item) => item.campo !== "preco").length;
      progresso.feita("campos", camposEnviados > 0 ? `${camposEnviados} campo(s)` : "nada mudou");

      progresso.andando("preco");
      if (campos.has("preco")) {
        estado.etapa = "preco";
        payload.preco = await gravarPreco(cliente, produtoId, anuncio.idExterno, riseEnvio.preco, estado.alterados.filter((item) => item.campo === "preco"));
      }
      progresso.feita("preco", campos.has("preco") ? "atualizado" : "já igual");

      progresso.andando("fotos");
      estado.etapa = "fotos";
      estado.fotos = await enviarFotosLI(cliente, {
        produto,
        anuncioId: anuncio.id,
        idExterno: anuncio.idExterno,
        produtoLI: detalhe.produto,
      });
      if (estado.fotos.enviadas || estado.fotos.apagadas) payload.fotos = { apagadas: estado.fotos.apagadas, enviadas: estado.fotos.enviadas };
      progresso.feita("fotos", estado.fotos.enviadas ? `${estado.fotos.enviadas} foto(s)` : estado.fotos.apagadas ? "trocadas" : "já iguais");

      estado.etapa = "gravacao";
      const final = Object.keys(payload).length ? await ler("gravacao", () => lerDetalheDaLI(cliente, anuncio.idExterno)) : detalhe;
      await gravarSucesso(anuncio.id, produtoId, {
        assinatura: assinaturaLI(rise),
        payload,
        url: urlNaLoja(final.produto.url ?? final.produto.apelido),
        ativo: final.produto.ativo,
      });
      return { ok: true, etapa: "gravacao", alterados: estado.alterados, marcaCriada: estado.marcaCriada, categoriasIgnoradas: estado.categoriasIgnoradas, fotos: estado.fotos?.texto ?? null };
    } catch (erro) {
      const texto = erro instanceof FalhaDoEnvio ? erro.message : `Erro inesperado no envio a Loja Integrada: ${erro?.message ?? erro}`;
      const etapa = erro instanceof FalhaDoEnvio ? erro.etapa : estado.etapa;
      await gravarFalha(anuncio.id, etapa, texto);
      return { ok: false, erro: texto, etapa, alterados: estado.alterados, marcaCriada: estado.marcaCriada, categoriasIgnoradas: estado.categoriasIgnoradas, fotos: estado.fotos?.texto ?? null };
    }
  }));
}

/// As duas travas (LI e Bling) de um codigo, antes da primeira escrita: o recado da que recusar, ou null.
function travaRecusada(cliente, bling, sku) {
  try {
    cliente.exigirEscrita(sku);
    bling.exigirEscrita(sku);
    return null;
  } catch (erro) {
    return erro?.message ?? String(erro);
  }
}

/**
 * Cadastrar (pedido do dono em 24/10/2026: "cria anuncio na LI PAUSADO, sincroniza com Bling, apos sincronizar
 * com Bling ativa o anuncio"): cria na LI o produto que nao existe la, INATIVO, com SEO, preco e fotos; depois
 * liga no Bling, grava o estoque inicial e ativa (`etapasDepoisDeCriar`). Recusa sem NCM (a NF-e da LI exige),
 * produto ja vinculado e SKU que ja existe (ou esta na lixeira). As travas da LI E do Bling vem antes do POST.
 * O vinculo e gravado logo depois do POST: se algo falhar em seguida, o proximo clique nao duplica.
 * Falha depois de criar deixa `dados.cadastroLI` (o "!") e o produto pausado; "Completar o cadastro" continua.
 */
export async function cadastrarNaLI(produtoId, cliente = clienteLI(), bling = clienteBling()) {
  const recusa = (erro) => ({ ok: false, erro });

  // O popup de andamento do editor le estas marcas (`progresso.js`); elas nao mudam o cadastro.
  return umPorVez(produtoId, recusa, () => comProgresso(produtoId, "cadastrar", async (progresso) => {
    progresso.andando("permissao");
    const produto = await contextoDoProduto(produtoId);
    if (!produto) return recusa("Produto não encontrado.");
    if (!produto.conferido) return recusa(`O produto ${produto.sku} não está Conferido. Só produto Conferido vai para a Loja Integrada.`);
    if (!String(produto.ncm ?? "").replace(/\D/g, "")) {
      return recusa("Sem NCM a Loja Integrada não emite NF-e: preencha o NCM no produto antes de cadastrar.");
    }
    let anuncio = await anuncioLIDoProduto(produtoId);
    if (anuncio?.idExterno) return recusa(`Este produto já está na Loja Integrada (id ${anuncio.idExterno}): use Sincronizar.`);
    const rascunho = anuncio ? rascunhoDoAnuncio(anuncio, produto) : rascunhoInicialLI(produto);
    // O liga/desliga do anuncio (nasce ligado): desligado, o produto e cadastrado e fica pausado na loja.
    const ativar = rascunho.ativo !== false;
    const bloqueio = primeiroBloqueio(rascunho, produto);
    if (bloqueio) return recusa(bloqueio);
    const travada = travaRecusada(cliente, bling, produto.sku);
    if (travada) return recusa(travada);
    progresso.feita("permissao");

    let idExterno = null;
    let conteudoEnviado = false;
    const feitas = [];
    try {
      progresso.andando("ler");
      const busca = await ler("leitura", () => buscarNaLI(cliente, produto.sku));
      if (busca.situacao === "existe") return recusa(`O código ${produto.sku} já existe na Loja Integrada: abra o pop-up do ícone para vincular.`);
      if (busca.situacao === "removido") return recusa(`O código ${produto.sku} está na lixeira da Loja Integrada: restaure-o lá em vez de cadastrar de novo.`);
      if (busca.situacao === "duplicado") return recusa(`Há mais de um produto com o código ${produto.sku} na Loja Integrada.`);
      progresso.feita("ler");
      progresso.andando("criar");

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

      progresso.feita("criar", `id ${idExterno}`);

      // O produto acabou de nascer sem foto na loja: o plano so envia.
      progresso.andando("fotos");
      const fotos = await enviarFotosLI(cliente, { produto, anuncioId: anuncio.id, idExterno, produtoLI: criado });
      if (fotos.enviadas) payload.fotos = { apagadas: 0, enviadas: fotos.enviadas };
      progresso.feita("fotos", fotos.enviadas ? `${fotos.enviadas} foto(s)` : "sem fotos");

      await gravarSucesso(anuncio.id, produtoId, { assinatura: assinaturaLI(rise), payload, url, ativo: false, idExterno });
      conteudoEnviado = true;
      feitas.push("criar");

      await etapasDepoisDeCriar(cliente, bling, { sku: produto.sku, idExterno, feitas, ativar, progresso });
      await finalizarCadastro(anuncio.id, ativar);
      feitas.push("gravar");
      return { ok: true, idExterno, urlExterna: url, fotos: fotos.texto, etapas: feitas, ativo: ativar };
    } catch (erro) {
      const texto = erro instanceof FalhaDoEnvio ? erro.message : `Erro inesperado no cadastro na Loja Integrada: ${erro?.message ?? erro}`;
      const etapa = erro?.etapa ?? (conteudoEnviado ? "gravar" : "produto");
      // Antes de o conteudo terminar de ir (SEO, preco, fotos) continua como sempre foi: ERRO, e o Sincronizar
      // manda o resto. Ativar um produto com o conteudo pela metade nao e o que o dono quer.
      if (anuncio && conteudoEnviado) await gravarCadastroIncompleto(anuncio.id, etapa, texto);
      else if (anuncio) await gravarFalha(anuncio.id, etapa, texto);
      return { ok: false, erro: texto, etapa, etapas: feitas, ...(idExterno ? { idExterno } : {}) };
    }
  }));
}

/**
 * "Completar o cadastro": o produto que ja esta na LI recebe as etapas que faltam (ligar no Bling, estoque
 * inicial, ativar), cada uma conferindo antes. Vale para o cadastro que parou no meio e para o produto
 * cadastrado antes disto (o 100108 ficou ativo sem controle de estoque). Nada de conteudo vai: e o Sincronizar.
 */
export async function completarCadastroLI(produtoId, cliente = clienteLI(), bling = clienteBling()) {
  const recusa = (erro) => ({ ok: false, erro, etapas: [] });

  return umPorVez(produtoId, recusa, async () => {
    const produto = await contextoDoProduto(produtoId);
    if (!produto) return recusa("Produto não encontrado.");
    if (!produto.conferido) return recusa(`O produto ${produto.sku} não está Conferido. Só produto Conferido vai para a Loja Integrada.`);
    const anuncio = await anuncioLIDoProduto(produtoId);
    if (!anuncio?.idExterno) return recusa("Este produto ainda não está na Loja Integrada: use Cadastrar na LI.");
    const travada = travaRecusada(cliente, bling, produto.sku);
    if (travada) return recusa(travada);

    const feitas = [];
    const ativar = rascunhoDoAnuncio(anuncio, produto).ativo !== false;
    try {
      await etapasDepoisDeCriar(cliente, bling, { sku: produto.sku, idExterno: anuncio.idExterno, feitas, ativar });
      await finalizarCadastro(anuncio.id, ativar);
      feitas.push("gravar");
      return { ok: true, idExterno: anuncio.idExterno, etapas: feitas, ativo: ativar };
    } catch (erro) {
      const texto = erro instanceof FalhaDoEnvio ? erro.message : `Erro inesperado ao completar o cadastro na Loja Integrada: ${erro?.message ?? erro}`;
      const etapa = erro?.etapa ?? "gravar";
      await gravarCadastroIncompleto(anuncio.id, etapa, texto);
      return { ok: false, erro: texto, etapa, etapas: feitas, idExterno: anuncio.idExterno };
    }
  });
}
