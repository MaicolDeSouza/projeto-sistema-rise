import { randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import { apagarPastaDaProposta, caminhoDaProposta, PASTA_PROPOSTA, pastaDoProduto, urlDaProposta, urlDe } from "@/lib/arquivos";
import { prisma } from "@/lib/db";
import { gerarEanDoSku } from "@/lib/eanInterno";
import { padronizarImagem } from "@/lib/imagens/padronizar";

import { decisoesDosCampos, SECOES_APLICAVEIS } from "./aplicar";
import { assinaturaDaSecao, secoesNaoAplicadas } from "./aplicadas";
import { conferirLinksDosDocumentos } from "./links";
import { precoCalculadoDaProposta } from "./preco";
import { validarPlano } from "./plano";
import { VERSAO_DO_ROTEIRO } from "./roteiro";

/**
 * Gravacao da proposta automatica de produto (spec 2026-10-16). Uma secao por chamada: cria a proposta ou SUBSTITUI a
 * secao, e nunca toca em `Produto` nem em `ProdutoArquivo`. Usada pelo script da sessao (`proposta <sku> --plano=`) e,
 * na Parte 2, pela tela e pelo Conferido.
 *
 * Arquivos (fotos candidatas e PDFs) vao para dados/produtos/<SKU>/proposta/ com nome gerado por nos, ANTES do banco;
 * se o banco falhar, os novos sao apagados. Os arquivos que a secao substituida deixou de citar saem DEPOIS do banco.
 */

const ehPdf = (bytes) => bytes.subarray(0, 5).toString("latin1") === "%PDF-";
const novoNome = (extensao) => `${randomUUID().replaceAll("-", "")}.${extensao}`;

/** Nomes de arquivo da pasta proposta/ que uma secao cita (fotos: candidatas; documentos: itens). */
function arquivosDaSecao(secao, conteudo) {
  if (secao === "fotos") return (conteudo?.candidatas ?? []).map((c) => c.arquivo).filter(Boolean);
  if (secao === "documentos") return (conteudo?.itens ?? []).map((i) => i.arquivo).filter(Boolean);
  return [];
}

/*
 * As fotos baixadas pelo MCP (`baixarCandidatas`, spec 2026-10-21) ficam na pasta proposta/ antes de qualquer secao as
 * citar, e o indice `candidatas.json` diz de que foto da oferta cada uma veio (o mesmo id de novo nao baixa de novo).
 */
const INDICE_DE_CANDIDATAS = "candidatas.json";
const ehFotoDaProposta = (nome) => /^[0-9a-f]{32}\.jpg$/.test(nome);

function caminhoDoIndice(sku) {
  const pasta = pastaDoProduto(sku);
  return pasta ? path.join(pasta, PASTA_PROPOSTA, INDICE_DE_CANDIDATAS) : null;
}

/** As fotos guardadas na pasta proposta/ (citadas ou nao), pelo nome. Sem pasta, nenhuma. */
export async function fotosNaPasta(sku) {
  const pasta = pastaDoProduto(sku);
  if (!pasta) return [];
  return (await readdir(path.join(pasta, PASTA_PROPOSTA)).catch(() => [])).filter(ehFotoDaProposta);
}

/** `{ "<id da foto da oferta>": { arquivo, loja, largura, altura } }`; sem indice (ou ilegivel), vazio. */
export async function lerIndiceDeCandidatas(sku) {
  const caminho = caminhoDoIndice(sku);
  if (!caminho) return {};
  try {
    const lido = JSON.parse(await readFile(caminho, "utf8"));
    return lido && typeof lido === "object" && !Array.isArray(lido) ? lido : {};
  } catch {
    return {};
  }
}

export async function gravarIndiceDeCandidatas(sku, indice) {
  const caminho = caminhoDoIndice(sku);
  if (!caminho) throw new Error(`SKU inválido: ${sku}`);
  await mkdir(path.dirname(caminho), { recursive: true });
  await writeFile(caminho, JSON.stringify(indice));
}

async function gravarArquivo(sku, nome, bytes, criados) {
  const destino = caminhoDaProposta(sku, nome);
  await mkdir(path.dirname(destino), { recursive: true });
  await writeFile(destino, bytes);
  criados.push(destino);
}

/**
 * @param {string} sku
 * @param {{ secao: string, conteudo: any }} plano
 * @param {{ bytes?: Map<string, Buffer> }} [opcoes] bytes das fotos e PDFs novos, pelo id da candidata ou do documento
 * @returns {Promise<{ ok: true, secoes: string[], aviso: string|null } | { ok: false, erro: string }>}
 */
export async function gravarProposta(sku, plano, { bytes = new Map(), testarLink = null } = {}) {
  // Preco: quem calcula e o Rise (roteiro unico, 21/10/2026); da conversa so fica a observacao.
  if (plano?.secao === "preco") {
    const alvo = await prisma.produto.findUnique({ where: { sku: String(sku ?? "") }, select: { id: true } });
    if (alvo) {
      const observacao = typeof plano.conteudo?.observacao === "string" ? plano.conteudo.observacao : undefined;
      plano = { ...plano, conteudo: { ...(await precoCalculadoDaProposta(alvo.id)), ...(observacao ? { observacao } : {}) } };
    }
  }
  const validado = validarPlano(plano);
  if (!validado.ok) return validado;
  const produto = await prisma.produto.findUnique({
    where: { sku },
    select: { id: true, conferido: true, fornecedorRascunho: true, _count: { select: { fornecedores: true } } },
  });
  if (!produto) return { ok: false, erro: `Produto ${sku} não existe.` };
  if (produto.conferido) return { ok: false, erro: `${sku} está Conferido: a proposta não é gravada (o dono já aprovou).` };

  // Produto com fornecedor (vinculado ou o rascunho do Bling): Origem 2 e Tipo do item 00, sempre (pedido do dono em
  // 24/10/2026, "caso item tenha fornecedor os campos marcados devem receber aqueles valores"). Quem decide e o Rise,
  // como no preco e no EAN: o que a conversa mandou nesses dois campos e trocado.
  if (validado.secao === "campos" && (produto._count.fornecedores > 0 || produto.fornecedorRascunho)) {
    const doFornecedor = "Rise: produto com fornecedor (mercadoria de revenda adquirida no mercado interno)";
    plano = {
      ...plano,
      conteudo: { ...plano.conteudo, origem: { valor: 2, origem: doFornecedor }, spedTipoItem: { valor: "00", origem: doFornecedor } },
    };
  }

  // O EAN da proposta e SEMPRE o interno do Rise (dono, 23/10/2026: "sempre gerar EAN, independente se tem ou nao"): a
  // conversa manda "interno" e quem calcula e o Rise, pelo codigo, como ja faz com o preco. Codigo com letras nao cabe.
  if (validado.secao === "ean" && plano.conteudo?.escolhido?.valor === "interno") {
    const gerado = gerarEanDoSku(sku);
    if (!gerado.ok) return { ok: false, erro: `ean: ${gerado.erro} Grave escolhido null com o motivo nos descartados.` };
    plano = { ...plano, conteudo: { ...plano.conteudo, escolhido: { valor: gerado.ean, origem: "EAN interno do Rise (prefixo 2, derivado do código)" } } };
  }

  // EAN de OUTRO produto do Rise nunca e proposto: o Salvar recusaria o mesmo GTIN em dois produtos.
  if (validado.secao === "ean" && plano.conteudo?.escolhido?.valor) {
    const dono = await prisma.produto.findFirst({ where: { ean: String(plano.conteudo.escolhido.valor), NOT: { id: produto.id } }, select: { sku: true } });
    if (dono) return { ok: false, erro: `ean: ${plano.conteudo.escolhido.valor} já é o EAN do produto ${dono.sku} no Rise; ponha nos descartados.` };
  }

  const anterior = await prisma.propostaDeProduto.findUnique({ where: { produtoId: produto.id } });
  const conteudo = structuredClone(plano.conteudo);
  const { secao } = validado;
  const citadosAntes = new Set(arquivosDaSecao(secao, anterior?.secoes?.[secao]));
  const criados = [];
  let baixadas = null;
  let avisoDosLinks = null;

  try {
    if (secao === "fotos") {
      baixadas = new Set(await fotosNaPasta(sku));
      const fotosAtuais = new Set(
        (await prisma.produtoArquivo.findMany({ where: { produtoId: produto.id, tipo: "IMAGEM", papel: "FOTO" }, select: { arquivo: true } })).map((f) => f.arquivo),
      );
      for (const candidata of conteudo.candidatas) {
        const recebidos = bytes.get(candidata.id);
        if (recebidos) {
          const padrao = await padronizarImagem(recebidos);
          if (!padrao.ok) throw new Error(`foto ${candidata.id}: ${padrao.erro}`);
          candidata.arquivo = novoNome("jpg");
          await gravarArquivo(sku, candidata.arquivo, padrao.bytes, criados);
        } else if (candidata.fotoAtual) {
          // Foto que o produto ja tem: fica onde esta (imagens/), a proposta so a cita.
          if (!fotosAtuais.has(candidata.fotoAtual)) throw new Error(`a foto atual ${candidata.fotoAtual} não é foto deste produto.`);
        } else if (!(candidata.arquivo && (citadosAntes.has(candidata.arquivo) || baixadas.has(candidata.arquivo)))) {
          throw new Error(`a candidata ${candidata.id} veio sem a imagem (nem foto atual, nem arquivo já baixado com baixarCandidatas).`);
        }
      }
    }
    if (secao === "documentos") {
      for (const item of conteudo.itens) {
        const recebidos = bytes.get(item.id);
        if (!recebidos) continue; // so o link, sem baixar
        if (!ehPdf(recebidos)) throw new Error(`documento ${item.id}: não é um PDF.`);
        item.arquivo = novoNome("pdf");
        await gravarArquivo(sku, item.arquivo, recebidos, criados);
      }
      // Documento so com link: o Rise testa se abre e marca o que nao abre (o 404 da Eletrogate de 21/10/2026).
      const { testados, quebrados } = await conferirLinksDosDocumentos(conteudo.itens, testarLink ? { testar: testarLink } : {});
      if (quebrados) avisoDosLinks = `${quebrados} de ${testados} ${testados === 1 ? "link não abre" : "links não abrem"} (marcados na proposta).`;
    }

    const secoes = { ...(anterior?.secoes ?? {}), [secao]: conteudo };
    // Conteudo novo ainda nao foi aplicado pelo dono: a marca da secao sai.
    const aplicadas = { ...(anterior?.aplicadas ?? {}) };
    delete aplicadas[secao];
    await prisma.propostaDeProduto.upsert({
      where: { produtoId: produto.id },
      // Cada secao gravada carimba a versao do roteiro em vigor (roteiro unico de 21/10/2026).
      create: { produtoId: produto.id, secoes, aplicadas, versaoDoRoteiro: VERSAO_DO_ROTEIRO },
      update: { secoes, aplicadas, versaoDoRoteiro: VERSAO_DO_ROTEIRO },
    });

    const citadosAgora = new Set(arquivosDaSecao(secao, conteudo));
    for (const nome of citadosAntes) {
      if (!citadosAgora.has(nome)) await unlink(caminhoDaProposta(sku, nome)).catch(() => {});
    }
    if (baixadas) {
      // A secao fotos decidiu: a baixada que ela nao cita sai (do disco e do indice) e pode ser baixada de novo depois.
      for (const nome of baixadas) {
        if (!citadosAgora.has(nome)) await unlink(caminhoDaProposta(sku, nome)).catch(() => {});
      }
      const indice = await lerIndiceDeCandidatas(sku);
      const restante = Object.fromEntries(Object.entries(indice).filter(([, item]) => citadosAgora.has(item?.arquivo)));
      if (Object.keys(restante).length !== Object.keys(indice).length) await gravarIndiceDeCandidatas(sku, restante);
    }
    return { ok: true, secoes: Object.keys(secoes), aviso: [validado.aviso, avisoDosLinks].filter(Boolean).join(" ") || null };
  } catch (falha) {
    for (const arquivo of criados) await unlink(arquivo).catch(() => {});
    return { ok: false, erro: falha.message };
  }
}

/** A proposta do produto (com o SKU e o id do produto), ou null. */
export async function lerProposta(sku) {
  const produto = await prisma.produto.findUnique({ where: { sku }, select: { id: true, sku: true, proposta: true } });
  return produto?.proposta ? { ...produto.proposta, sku: produto.sku } : null;
}

/** O produto gravado como `assinaturaDaSecao` o le: os campos e os nomes das fotos FOTO, na ordem. */
async function produtoParaAssinatura(produtoId) {
  const produto = await prisma.produto.findUnique({
    where: { id: produtoId },
    include: { arquivos: { where: { tipo: "IMAGEM", papel: "FOTO" }, orderBy: { ordem: "asc" }, select: { arquivo: true } } },
  });
  return produto ? { ...produto, fotos: produto.arquivos.map((foto) => foto.arquivo) } : null;
}

/**
 * A proposta como a tela do cadastro a recebe (so dados simples), com as secoes ainda nao aplicadas e o endereco de
 * cada foto candidata e documento baixado. Sem proposta, null.
 */
export async function propostaParaFormulario(produtoId) {
  const proposta = await prisma.propostaDeProduto.findUnique({ where: { produtoId: String(produtoId ?? "") } });
  if (!proposta) return null;
  const produto = await produtoParaAssinatura(proposta.produtoId);
  if (!produto) return null;
  // Candidata que aponta para uma foto atual que ja saiu do produto (foi para a reserva, com outro nome): a baixada
  // volta a ser so a baixada, e a que so existia como foto sai (o arquivo nao existe mais; sem isto ela aparecia
  // quebrada na janela e sumia sem aviso ao aplicar).
  const nomesDasFotos = new Set(produto.fotos);
  const secoes = proposta.secoes?.fotos?.candidatas
    ? {
        ...proposta.secoes,
        fotos: {
          ...proposta.secoes.fotos,
          candidatas: proposta.secoes.fotos.candidatas.flatMap((candidata) => {
            if (!candidata.fotoAtual || nomesDasFotos.has(candidata.fotoAtual)) return [candidata];
            if (!candidata.arquivo) return [];
            const { fotoAtual, ...baixada } = candidata;
            void fotoAtual;
            return [baixada];
          }),
        },
      }
    : proposta.secoes;
  const urls = {};
  for (const candidata of secoes?.fotos?.candidatas ?? []) {
    if (candidata.arquivo) urls[`foto:${candidata.id}`] = urlDaProposta(produto.sku, candidata.arquivo);
    else if (candidata.fotoAtual) urls[`foto:${candidata.id}`] = urlDe(produto.sku, "IMAGEM", candidata.fotoAtual);
  }
  for (const item of proposta.secoes?.documentos?.itens ?? []) {
    if (item.arquivo) urls[`documento:${item.id}`] = urlDaProposta(produto.sku, item.arquivo);
  }
  // A candidata que e foto atual cita o NOME do arquivo; o painel conhece a foto pelo id da linha.
  const linhas = await prisma.produtoArquivo.findMany({
    where: { produtoId: proposta.produtoId, tipo: "IMAGEM", papel: "FOTO" },
    select: { id: true, arquivo: true },
  });
  return {
    secoes,
    naoAplicadas: secoesNaoAplicadas(proposta, produto),
    aplicadas: proposta.aplicadas ?? {},
    urls,
    idsDasFotosAtuais: Object.fromEntries(linhas.map((linha) => [linha.arquivo, linha.id])),
    versaoDoRoteiro: proposta.versaoDoRoteiro,
    atualizadaEm: proposta.atualizadaEm.toISOString(),
  };
}

/**
 * Depois do Salvar do cadastro: as secoes que o dono aplicou ao formulario ficam marcadas com a assinatura do produto
 * GRAVADO (se ele mexer no campo depois, a secao volta a ficar pendente). Sem proposta, nao faz nada.
 */
export async function marcarSecoesAplicadas(produtoId, secoes) {
  // Fotos tem o "Aplicar" proprio (aba Imagens), mas e aplicada e marcada do mesmo jeito.
  const validas = (secoes ?? []).filter((secao) => SECOES_APLICAVEIS.includes(secao) || secao === "fotos");
  if (validas.length === 0) return;
  const proposta = await prisma.propostaDeProduto.findUnique({ where: { produtoId: String(produtoId ?? "") } });
  if (!proposta) return;
  const produto = await produtoParaAssinatura(proposta.produtoId);
  const aplicadas = { ...(proposta.aplicadas ?? {}) };
  for (const secao of validas) if (proposta.secoes?.[secao]) aplicadas[secao] = assinaturaDaSecao(secao, produto);
  await prisma.propostaDeProduto.update({ where: { id: proposta.id }, data: { aplicadas } });
}

/**
 * Depois do Salvar, campo a campo (pedido do dono em 23/10/2026): o que ficou com o valor da proposta e o que o dono
 * mudou (`decisoesDosCampos`), guardado em `aplicadas.daProposta` e `aplicadas.editados`. E o que impede a proposta de
 * recarregar, na abertura seguinte, um campo que o dono editou. Sem proposta, nao faz nada.
 *
 * @param {string} produtoId
 * @param {string[]} preenchidosAgora os campos que a proposta preencheu ao abrir esta edicao
 * @param {Record<string, unknown>} [antes] o produto como estava ANTES deste Salvar (o valor original dos campos que a
 *   proposta trocou vai para `aplicadas.originais` e volta na lista do icone com a etiqueta "Original")
 */
export async function registrarDecisoesDoSalvar(produtoId, preenchidosAgora, antes = {}) {
  const proposta = await prisma.propostaDeProduto.findUnique({ where: { produtoId: String(produtoId ?? "") } });
  if (!proposta) return;
  const produto = await prisma.produto.findUnique({ where: { id: proposta.produtoId } });
  if (!produto) return;
  const anteriores = proposta.aplicadas ?? {};
  const decididos = decisoesDosCampos(proposta.secoes, valoresSimples(produto), anteriores, preenchidosAgora, valoresSimples(antes));
  await prisma.propostaDeProduto.update({ where: { id: proposta.id }, data: { aplicadas: { ...anteriores, ...decididos } } });
}

/**
 * O produto como o banco devolve vira valores simples (numero, texto ou nulo): o Decimal do Prisma (preco, peso,
 * % tributos) nao cabe no JSON de `aplicadas.originais` e compararia errado com o valor do formulario.
 */
export function valoresSimples(produto) {
  const simples = {};
  for (const [campo, valor] of Object.entries(produto ?? {})) {
    if (valor === null || valor === undefined || typeof valor !== "object") simples[campo] = valor ?? null;
    else if (typeof valor.toFixed === "function" && typeof valor.toString === "function") simples[campo] = Number(valor.toString());
  }
  return simples;
}

/**
 * Depois do Salvar, as fotos (pedido do dono em 23/10/2026: a janela "Fotos da proposta" voltava a mostrar a escolha e
 * a ordem da proposta, e nao as que ele aplicou). Quando o dono ja aplicou as fotos da proposta (nesta edicao ou antes),
 * a secao passa a refletir o que ficou no produto: cada candidata que virou foto fica escolhida, na posicao dela, e
 * aponta para o arquivo gravado (`fotoAtual`); as outras ficam sem escolha. Candidata que era foto atual e saiu do
 * produto (foi para a reserva, com outro nome) sai da lista: o arquivo dela nao existe mais. O Salvar grava as fotos
 * validadas na ordem do painel, entao a i-esima validada do painel e a foto de ordem i.
 *
 * @param {string} produtoId
 * @param {Array<{ base: string, arquivoId?: string|null, candidataId?: string|null, finalizada?: boolean }>} itens o painel
 * @param {Map<string, string>} nomesAntes id da linha FOTO -> nome do arquivo ANTES do Salvar
 * @param {boolean} aplicouAgora o dono clicou em "Aplicar fotos" nesta edicao
 */
export async function fotosDaPropostaDepoisDoSalvar(produtoId, itens, nomesAntes, aplicouAgora) {
  const proposta = await prisma.propostaDeProduto.findUnique({ where: { produtoId: String(produtoId ?? "") } });
  const candidatas = proposta?.secoes?.fotos?.candidatas;
  if (!Array.isArray(candidatas) || candidatas.length === 0) return;
  if (!aplicouAgora && !proposta.aplicadas?.fotos) return;

  const vistas = new Set();
  const validadas = [];
  for (const item of Array.isArray(itens) ? itens : []) {
    if (!item?.base || vistas.has(item.base) || item.finalizada === false) continue;
    vistas.add(item.base);
    validadas.push(item);
  }
  const fotos = await prisma.produtoArquivo.findMany({
    where: { produtoId: proposta.produtoId, tipo: "IMAGEM", papel: "FOTO" },
    orderBy: { ordem: "asc" },
    select: { arquivo: true },
  });
  // Contagem diferente = o Salvar deixou alguma de fora (arquivo sumido do lote): sem como casar, nao mexe.
  if (fotos.length !== validadas.length) return;

  const escolha = new Map();
  validadas.forEach((item, posicao) => {
    const nomeAntes = item.arquivoId ? nomesAntes.get(item.arquivoId) : null;
    const candidata = item.candidataId
      ? candidatas.find((c) => c.id === item.candidataId)
      : nomeAntes
        ? candidatas.find((c) => c.fotoAtual === nomeAntes)
        : null;
    if (candidata && !escolha.has(candidata.id)) escolha.set(candidata.id, { posicao, arquivo: fotos[posicao].arquivo });
  });
  const nomesAgora = new Set(fotos.map((foto) => foto.arquivo));
  const novas = [];
  for (const candidata of candidatas) {
    const escolhida = escolha.get(candidata.id);
    if (escolhida) {
      novas.push({ ...candidata, escolhida: true, ordem: escolhida.posicao, fotoAtual: escolhida.arquivo });
      continue;
    }
    const { ordem, ...semOrdem } = candidata;
    void ordem;
    if (candidata.fotoAtual && !nomesAgora.has(candidata.fotoAtual)) {
      // Foto atual que saiu do produto: a candidata baixada volta a ser so a baixada; a que so existia como foto sai.
      if (!candidata.arquivo) continue;
      delete semOrdem.fotoAtual;
    }
    novas.push({ ...semOrdem, escolhida: false });
  }
  await prisma.propostaDeProduto.update({
    where: { id: proposta.id },
    data: { secoes: { ...proposta.secoes, fotos: { ...proposta.secoes.fotos, candidatas: novas } } },
  });
}

/** Apaga a proposta (linha e pasta proposta/). Sem proposta, nao faz nada. */
export async function apagarProposta(produtoId, sku) {
  await prisma.propostaDeProduto.deleteMany({ where: { produtoId } });
  await apagarPastaDaProposta(sku);
}
