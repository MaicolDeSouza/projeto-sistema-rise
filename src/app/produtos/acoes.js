"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { buscarProdutoPorCodigo } from "@/lib/buscaPorCodigo";
import { buscarReferencias } from "@/lib/buscaPorPalavras";
import { listarDocumentosDasReferencias } from "@/lib/documentosReferencias";
import { lerCamposDasReferencias, lerDetalhesDasReferencias } from "@/lib/camposDasReferencias";
import { gerarDescricao, gerarTitulos, MAXIMO_REFERENCIAS } from "@/lib/ia/anuncio";
import { normalizar } from "@/lib/texto";
import { descartarLote } from "@/lib/imagens/lote";
import { padronizarImagem } from "@/lib/imagens/padronizar";
import { reconciliarImagensDoProduto } from "@/lib/imagens/produto";
import {
  planejarImportacaoDoBling,
  importarLoteDoBling,
  MAXIMO_POR_LOTE,
} from "@/lib/integracoes/importarBling";
import { UNIDADES } from "@/lib/unidades";
import {
  MAXIMO_IMAGENS,
  apagarArquivo,
  apagarArquivoTemporario,
  apagarPastaProduto,
  moverTemporarios,
  renomearPastaProduto,
  salvarArquivo,
  salvarArquivoTemporario,
  skuValido,
} from "@/lib/arquivos";

/**
 * Server Actions do cadastro de produtos.
 *
 * Grava apenas no banco local e em dados/produtos. Nenhuma ESCRITA em Bling,
 * Mercado Livre ou Loja Integrada — a publicacao entra na etapa seguinte. A
 * importacao so le o Bling, e a IA (titulo e descricao) so recebe dados do banco.
 */

/** Marca, modelo e homologacao das referencias marcadas, para escolher. */
export async function camposDasReferencias(ids) {
  try {
    return { ok: true, ...(await lerCamposDasReferencias(ids)) };
  } catch (erro) {
    return { ok: false, erro: erro.message };
  }
}

/// Faixa dos codigos gerados automaticamente: 25xxxx, pedido do dono em 16/09/2026.
const SKU_AUTOMATICO = /^25\d{4}$/;
const PRIMEIRO_SKU_AUTOMATICO = 250001;
const ULTIMO_SKU_AUTOMATICO = 259999;

/**
 * O proximo codigo livre da faixa 25xxxx: o maior ja usado mais um.
 *
 * "Maior mais um", e nao "primeiro buraco": codigo de produto excluido nao volta
 * a ser usado, senao um anuncio antigo ou uma planilha de fornecedor apontaria
 * para outra peca. Dois cadastros abertos ao mesmo tempo podem receber o mesmo
 * numero; o SKU e unico no banco, e o segundo Salvar e recusado com a mensagem de
 * codigo repetido.
 */
export async function gerarSku() {
  try {
    const usados = await prisma.produto.findMany({
      where: { sku: { startsWith: "25" } },
      select: { sku: true },
    });
    const maior = usados
      .map((produto) => produto.sku)
      .filter((sku) => SKU_AUTOMATICO.test(sku))
      .reduce((atual, sku) => Math.max(atual, Number(sku)), PRIMEIRO_SKU_AUTOMATICO - 1);

    if (maior >= ULTIMO_SKU_AUTOMATICO) {
      return { ok: false, erro: "A faixa 25xxxx acabou (259999 ja existe)." };
    }
    return { ok: true, sku: String(maior + 1) };
  } catch (erro) {
    return { ok: false, erro: erro.message };
  }
}

/** Produtos da Rise, de fornecedores e de concorrentes com este codigo. */
export async function buscarPorCodigo(codigo) {
  try {
    return { ok: true, resultados: await buscarProdutoPorCodigo(codigo) };
  } catch (erro) {
    return { ok: false, erro: erro.message };
  }
}

/** Fornecedores e concorrentes com todas as palavras, para marcar como referencia. */
export async function buscarPorPalavras(termo, vinculos = {}) {
  try {
    return { ok: true, ...(await buscarReferencias(termo, vinculos)) };
  } catch (erro) {
    return { ok: false, erro: erro.message };
  }
}

/** Opcoes de titulo no padrao da loja, escritas pela IA a partir das referencias. */
export async function criarTitulosIA(ids, palavras) {
  try {
    return { ok: true, opcoes: await gerarTitulos(ids, palavras) };
  } catch (erro) {
    return { ok: false, erro: erro.message };
  }
}

/** O texto e a ficha de cada referencia marcada, para a janela "Criar descricao". */
export async function detalhesDasReferencias(ids) {
  try {
    return { ok: true, itens: await lerDetalhesDasReferencias(ids) };
  } catch (erro) {
    return { ok: false, erro: erro.message };
  }
}

/** Busca leve para vincular um item coletado pela coluna Codigo. */
export async function buscarItemColetadoPorCodigo(codigoBruto, tipo) {
  const codigo = String(codigoBruto ?? "").trim().slice(0, 100);
  if (!codigo) return { ok: false, erro: "Informe o codigo antes de buscar." };
  const tipos = tipo === "FORNECEDOR" ? ["FORNECEDOR"] : ["CONCORRENTE", "OUTRO"];
  try {
    const itens = await prisma.produtoColetado.findMany({
      where: {
        OR: ["codigo", "ean", "mpn"].map((campo) => ({ [campo]: { equals: codigo, mode: "insensitive" } })),
        fonte: { tipo: { in: tipos } },
      },
      select: {
        id: true, nome: true, codigo: true, url: true,
        precoNormal: true, precoPromocional: true,
        fonte: { select: { nome: true, tipo: true } },
      },
      orderBy: { vistoEm: "desc" },
      take: 30,
    });
    return { ok: true, itens: itens.map((item) => ({
      id: item.id, fonte: item.fonte.nome, tipo: item.fonte.tipo,
      nome: item.nome, codigo: item.codigo, url: item.url,
      preco: item.fonte.tipo === "FORNECEDOR"
        ? (item.precoNormal == null && item.precoPromocional == null ? null : Number(item.precoNormal ?? item.precoPromocional))
        : (item.precoNormal == null ? null : Number(item.precoNormal)),
    })) };
  } catch (erro) {
    return { ok: false, erro: erro.message };
  }
}

/** Documentos publicados pelas referencias escolhidas na lupa. */
export async function documentosDasReferencias(ids, produtoId = null) {
  try {
    const referencias = new Set();
    if (produtoId) {
      const produto = await prisma.produto.findUnique({
        where: { id: produtoId },
        select: {
          tituloBase: true,
          fornecedores: {
            select: { codigo: true, link: true, fornecedor: { select: { nome: true } } },
          },
          concorrentes: { select: { produtoColetadoId: true } },
        },
      });
      if (!produto) return { ok: false, erro: "Produto nao encontrado." };
      const concorrentes = produto.concorrentes.map((item) => item.produtoColetadoId).filter(Boolean);
      for (const id of concorrentes) referencias.add(id);
      if (produto.tituloBase && produto.fornecedores.length) {
        const ligados = await buscarReferencias(produto.tituloBase, {
          limite: 0,
          fornecedoresLigados: produto.fornecedores.map((item) => ({
            nome: item.fornecedor.nome, codigo: item.codigo, link: item.link,
          })),
          idsConcorrentesLigados: concorrentes,
        });
        for (const item of ligados.itens) if (item.vinculado) referencias.add(item.id);
      }
    }
    // Em produtos salvos, a aba de fornecedores/concorrentes e a fonte atual.
    // Marcacoes antigas da lupa podem permanecer no estado do formulario apos uma exclusao.
    if (!produtoId) {
      for (const id of Array.isArray(ids) ? ids : []) referencias.add(id);
    }
    return { ok: true, itens: await listarDocumentosDasReferencias([...referencias]) };
  } catch (erro) {
    return { ok: false, erro: erro.message };
  }
}

/** Procura no catalogo coletado o produto correspondente em cada loja cadastrada. */
export async function buscarDescricoesParaProduto(titulo, idsMarcados = []) {
  try {
    const marcados = [...new Set((Array.isArray(idsMarcados) ? idsMarcados : []).map(String))]
      .slice(0, MAXIMO_REFERENCIAS);
    const termo = String(titulo ?? "").trim().slice(0, 300);
    const familiaArduino = normalizar(termo).match(/\b(uno|nano|mega)\b/)?.[1];
    const resultados = termo ? (await buscarReferencias(termo, { limite: Infinity })).itens : [];
    // A busca ampla da lupa pode aproximar uma placa UNO de uma MEGA. Para
    // escrever a descricao, essas familias nao sao intercambiaveis.
    const candidatos = resultados.filter((item) =>
      (item.tipo === "FORNECEDOR" || item.tipo === "CONCORRENTE") &&
      (!familiaArduino || new RegExp(`\\b${familiaArduino}\\b`).test(normalizar(item.nome))));
    // Uma loja pode ter varios acessorios parecidos. Ficamos com o produto
    // mais relevante de cada loja para cobrir as fontes sem repetir conteudo.
    const disponibilidade = candidatos.length
      ? await prisma.produtoColetado.findMany({
          where: { id: { in: candidatos.map((item) => item.id) } },
          select: { id: true, descricao: true, especificacoes: true },
        })
      : [];
    const comConteudo = new Set(disponibilidade
      .filter((item) => item.descricao?.trim() ||
        (Array.isArray(item.especificacoes) && item.especificacoes.length > 0))
      .map((item) => item.id));
    const elegiveis = candidatos.filter((item) => comConteudo.has(item.id));
    const escolhidos = [...marcados];
    const vistos = new Set(escolhidos);
    const fontes = new Set();
    for (const item of elegiveis) {
      const fonte = `${item.tipo}:${item.fonte}`;
      if (fontes.has(fonte)) continue;
      fontes.add(fonte);
      if (vistos.has(item.id) || escolhidos.length >= MAXIMO_REFERENCIAS) continue;
      escolhidos.push(item.id);
      vistos.add(item.id);
    }
    return {
      ok: true,
      itens: await lerDetalhesDasReferencias(escolhidos),
      encontrados: elegiveis.length,
      fontes: fontes.size,
      limite: MAXIMO_REFERENCIAS,
    };
  } catch (erro) {
    return { ok: false, erro: erro.message };
  }
}

/**
 * Descricao no modelo da loja, escrita pela IA a partir das referencias marcadas.
 * `produto` leva o Nome e o Codigo do formulario: titulo e "Itens inclusos (Cod:)".
 */
export async function criarDescricaoIA(ids, produto) {
  try {
    return { ok: true, ...(await gerarDescricao(ids, produto)) };
  } catch (erro) {
    return { ok: false, erro: erro.message };
  }
}

/**
 * Planeja a importacao completa do Bling: le o catalogo inteiro e devolve a
 * fila de ids pronta para importarLoteDoBling.
 */
export async function planejarImportacao() {
  try {
    const resultado = await planejarImportacaoDoBling();
    return { ok: true, ...resultado };
  } catch (erro) {
    return { ok: false, erro: erro.message };
  }
}

/**
 * Importa um lote da fila planejada. A tela chama isto em laco ate o fim.
 * `fila` vem do planejarImportacao, `comeco` marca onde retomou, `quantidade`
 * (padrao 10) e o tamanho do lote.
 */
export async function importarLote(fila, comeco = 0, quantidade = MAXIMO_POR_LOTE) {
  try {
    const resultado = await importarLoteDoBling(fila, comeco, quantidade);
    revalidatePath("/produtos");
    return { ok: true, ...resultado };
  } catch (erro) {
    return { ok: false, erro: erro.message };
  }
}

const opcional = (esquema) =>
  z.preprocess((valor) => (valor === "" ? null : valor), esquema.nullable());

const decimal = () =>
  opcional(
    z.coerce
      .number({ message: "Informe um numero valido." })
      .min(0, "Nao pode ser negativo."),
  );

/** Aceita apenas http/https — protocolo perigoso em campo que vira link. */
function ehUrlSegura(valor) {
  if (!valor) return true;
  try {
    return ["http:", "https:"].includes(new URL(valor).protocol);
  } catch {
    return false;
  }
}

const ProdutoSchema = z.object({
  // O SKU vira nome de pasta em dados/produtos: precisa ser seguro como caminho.
  sku: z
    .string()
    .trim()
    .min(1, "O SKU e obrigatorio.")
    .refine(skuValido, "Use apenas letras, numeros, ponto, hifen e sublinhado."),
  tituloBase: z.string().trim().min(1, "O nome do produto e obrigatorio."),
  localizacao: opcional(z.string().trim()),
  precoVenda: decimal(),
  unidade: z.enum(UNIDADES).catch("UN"),
  ativo: z.coerce.boolean(),

  // Sempre em MAIUSCULAS (pedido do dono em 16/09/2026). A tela ja converte ao
  // digitar; aqui e a garantia para o que chegar por outro caminho.
  marca: opcional(z.string().trim().transform((valor) => valor.toLocaleUpperCase("pt-BR"))),
  modelo: opcional(z.string().trim().transform((valor) => valor.toLocaleUpperCase("pt-BR"))),
  descricaoBase: opcional(z.string()),
  numeroHomologacao: opcional(z.string().trim()),
  videoUrl: opcional(z.string().trim()),

  ean: opcional(z.string().trim()),
  garantiaMeses: opcional(z.coerce.number().int().min(0)),

  pesoKg: decimal(),
  alturaCm: decimal(),
  larguraCm: decimal(),
  comprimentoCm: decimal(),

  estoqueMinimo: opcional(z.coerce.number().int().min(0)),
  estoqueMaximo: opcional(z.coerce.number().int().min(0)),

  // So http/https: colar "javascript:" num campo que vira <a> e o caminho
  // classico de injecao.
  urlLojaIntegrada: opcional(
    z.string().trim().refine(ehUrlSegura, "Informe um endereco http ou https."),
  ),

  origem: opcional(z.coerce.number().int().min(0).max(8)),
  ncm: opcional(z.string().trim()),
  cest: opcional(z.string().trim()),
  spedTipoItem: opcional(z.string().trim()),
  percentualTributos: decimal(),
});

function errosPorCampo(resultado) {
  const erros = {};
  for (const problema of resultado.error.issues) {
    const campo = problema.path[0];
    if (campo && !erros[campo]) erros[campo] = problema.message;
  }
  return erros;
}

/**
 * Move os arquivos do lote temporario para o produto recem-criado e registra
 * cada um. A lista (tipo, nome, nome original) vem do navegador; o que decide se
 * o arquivo existe, o tamanho e o formato e o disco (`moverTemporarios`).
 */
async function gravarTemporarios(produto, formData) {
  const lote = String(formData.get("loteTemporario") ?? "");
  if (!lote) return;

  let lista = [];
  try {
    lista = JSON.parse(String(formData.get("arquivosTemporarios") ?? "[]"));
  } catch {
    lista = [];
  }
  if (!Array.isArray(lista) || lista.length === 0) return;

  const nomesOriginais = new Map(
    lista.map((item) => [item?.nome, String(item?.nomeOriginal ?? "").slice(0, 200) || null]),
  );
  const movidos = await moverTemporarios(lote, produto.sku, lista);

  const ordemPorTipo = {};
  for (const item of movidos) {
    const ordem = ordemPorTipo[item.tipo] ?? 0;
    ordemPorTipo[item.tipo] = ordem + 1;
    await prisma.produtoArquivo.create({
      data: {
        produtoId: produto.id,
        tipo: item.tipo,
        arquivo: item.nome,
        nomeOriginal: nomesOriginais.get(item.nome) ?? null,
        mimeType: item.mimeType,
        tamanhoBytes: item.tamanhoBytes,
        ordem,
      },
    });
  }
}

/**
 * As fotos do painel de imagens do cadastro novo: saem do lote temporario (ja padronizadas)
 * para a pasta do produto, NA ORDEM em que o painel mostra, com a principal marcada.
 *
 * O navegador manda so `[{ base, principal, finalizada }]`. Cada `base` e conferida (UUID sem
 * hifens) e so entra a foto que EXISTE no lote; tamanho e tipo sao lidos do disco, nao do que o
 * navegador disse.
 *
 * SO AS VALIDADAS FICAM (pedido do dono em 04/10/2026): foto com `finalizada: false` nao e gravada, e as
 * candidatas que sobram no lote temporario nunca chegam ao produto. Campo ausente mantem a foto.
 *
 * Desde a reserva (Nano Banana, 05/10/2026) o produto novo usa o MESMO Salvar do produto que ja existe
 * (`reconciliarImagensDoProduto`): sem linhas, toda foto e "nova", e as versoes geradas (pagas) que nao foram
 * escolhidas vao para a reserva em vez de sumir. A primeira da lista e a principal.
 */
async function gravarImagensDoLote(produto, formData) {
  const lote = String(formData.get("loteTemporario") ?? "");
  if (!lote) return;

  let lista = [];
  try {
    lista = JSON.parse(String(formData.get("imagensDoLote") ?? "[]"));
  } catch {
    lista = [];
  }
  if (!Array.isArray(lista) || lista.length === 0) return;

  await reconciliarImagensDoProduto({ produto: { id: produto.id, sku: produto.sku }, lote, itens: lista });
}

/**
 * As fotos do painel de um produto que JA EXISTE: o painel de fotos e o mesmo do cadastro novo (pedido do
 * dono em 21/09/2026), e o Salvar aplica o resultado ao produto (ver `reconciliarImagensDoProduto`).
 *
 * So age quando o navegador diz que o painel CARREGOU (`fotosDoPainelProntas`). Sem isso, um painel que
 * falhou ao abrir mandaria uma lista vazia, e o Salvar apagaria todas as fotos do produto.
 */
async function gravarImagensDoPainel(produto, formData) {
  if (String(formData.get("fotosDoPainelProntas") ?? "") !== "1") return null;

  const lote = String(formData.get("loteTemporario") ?? "");
  if (!lote) return null;

  const ler = (campo) => {
    try {
      const valor = JSON.parse(String(formData.get(campo) ?? "[]"));
      return Array.isArray(valor) ? valor : [];
    } catch {
      return [];
    }
  };

  return reconciliarImagensDoProduto({
    produto,
    lote,
    itens: ler("imagensDoLote"),
    preservar: ler("arquivosPreservados").filter((id) => typeof id === "string"),
    // Ids de RESERVA que o dono excluiu na tela; o servidor so aceita os deste produto.
    reservaExcluida: ler("reservaExcluida").filter((id) => typeof id === "string"),
  });
}

/** Envio de documento ou certificado num produto que ainda nao foi salvo. */
export async function enviarArquivoTemporario(lote, tipo, formData) {
  try {
    const resultado = await salvarArquivoTemporario(lote, tipo, formData.get("arquivo"));
    if (!resultado.ok) return resultado;
    return {
      ok: true,
      arquivo: { tipo, nome: resultado.nome, nomeOriginal: resultado.nomeOriginal },
    };
  } catch (erro) {
    return { ok: false, erro: erro.message };
  }
}

export async function removerArquivoTemporario(lote, tipo, nome) {
  try {
    await apagarArquivoTemporario(lote, tipo, nome);
    return { ok: true };
  } catch (erro) {
    return { ok: false, erro: erro.message };
  }
}

export async function salvarProduto(id, _estadoAnterior, formData) {
  const bruto = Object.fromEntries(formData.entries());
  const resultado = ProdutoSchema.safeParse({
    ...bruto,
    ativo: bruto.ativo === "on",
  });

  if (!resultado.success) {
    return { ok: false, erros: errosPorCampo(resultado) };
  }

  const dados = resultado.data;

  try {
    let fornecedoresPendentes = [];
    try {
      fornecedoresPendentes = JSON.parse(String(formData.get("fornecedoresRascunho") ?? "[]"));
    } catch {
      return { ok: false, erro: "Revise os fornecedores antes de salvar." };
    }
    if (!Array.isArray(fornecedoresPendentes)) return { ok: false, erro: "Revise os fornecedores antes de salvar." };
    for (const item of fornecedoresPendentes) {
      const nome = String(item?.nome ?? "").trim();
      if (!nome) continue;
      const cadastrado = await prisma.fornecedor.findFirst({
        where: { nome: { equals: nome, mode: "insensitive" } },
        select: { id: true },
      });
      if (!cadastrado) return { ok: false, erro: `Cadastre o fornecedor "${nome}" antes de salvar o produto.` };
    }
    let concorrentesPendentes = [];
    try {
      concorrentesPendentes = JSON.parse(String(formData.get("concorrentesRascunho") ?? "[]"));
    } catch {
      return { ok: false, erro: "Revise os concorrentes antes de salvar." };
    }
    if (!Array.isArray(concorrentesPendentes)) return { ok: false, erro: "Revise os concorrentes antes de salvar." };
    for (const item of concorrentesPendentes) {
      if (!ConcorrenteSchema.safeParse(item).success) return { ok: false, erro: "Revise os dados dos concorrentes antes de salvar." };
      const coletado = item?.produtoColetadoId
        ? await prisma.produtoColetado.findUnique({
            where: { id: item.produtoColetadoId },
            select: { fonte: { select: { nome: true } } },
          })
        : null;
      if (item?.produtoColetadoId && !coletado) return { ok: false, erro: "Um produto de concorrente nao foi encontrado. Revise a lista." };
      const nome = String(coletado?.fonte.nome ?? item?.fonteManual ?? "").trim();
      const cadastrado = await prisma.concorrente.findFirst({
        where: { nome: { equals: nome, mode: "insensitive" } },
        select: { id: true },
      });
      if (!cadastrado) return { ok: false, erro: `Cadastre o concorrente "${nome}" antes de salvar o produto.` };
    }
    if (!id) {
      const produto = await prisma.produto.create({ data: dados });

      // Fotos do painel de imagens (ja padronizadas, no lote temporario): saem do lote
      // para a pasta do produto, que so agora tem nome (o SKU). Como os documentos abaixo,
      // falha aqui NAO vira erro do Salvar: o produto ja existe.
      let avisoImagens = null;
      try {
        await gravarImagensDoLote(produto, formData);
      } catch (erro) {
        console.error("Falha ao gravar as fotos do cadastro novo:", erro.message);
        avisoImagens = "O produto foi salvo, mas as fotos nao foram gravadas. Envie de novo.";
      }

      // Documentos e certificado enviados antes de salvar: saem da pasta
      // temporaria para a do produto, que so agora tem nome (o SKU).
      //
      // Falha aqui NAO vira erro do Salvar: o produto ja existe. Devolver erro
      // deixava a tela em "Novo produto" com o cadastro criado por tras, e o
      // segundo Salvar batia em "SKU ja existe" (visto em 16/09/2026, com o
      // servidor ainda sem conhecer o tipo DOCUMENTO).
      let avisoArquivos = null;
      try {
        await gravarTemporarios(produto, formData);
      } catch (erro) {
        console.error("Falha ao gravar documentos do cadastro novo:", erro.message);
        avisoArquivos = "O produto foi salvo, mas os documentos enviados antes de salvar nao foram gravados. Envie de novo.";
      }

      // O lote acabou: os originais das fotos, as previas e o que sobrou dos documentos nao
      // servem mais (o original so existe ate o Salvar, decisao do dono em 21/09/2026).
      await descartarLote(String(formData.get("loteTemporario") ?? "")).catch(() => {});

      // Fornecedores adicionados na aba antes de o produto existir: o mesmo
      // motivo do try/catch acima — o produto ja foi criado, entao uma falha
      // aqui vira aviso, nao erro do Salvar.
      let avisoFornecedores = null;
      try {
        await gravarFornecedoresRascunho(produto, formData);
      } catch (erro) {
        console.error("Falha ao gravar fornecedores do cadastro novo:", erro.message);
        avisoFornecedores = "O produto foi salvo, mas os fornecedores adicionados antes de salvar nao foram gravados. Adicione de novo.";
      }

      // Mesmo motivo de fornecedores: o produto ja existe, entao uma falha
      // aqui vira aviso, nao erro do Salvar.
      let avisoConcorrentes = null;
      try {
        await gravarConcorrentesRascunho(produto, formData);
      } catch (erro) {
        console.error("Falha ao gravar concorrentes do cadastro novo:", erro.message);
        avisoConcorrentes = "O produto foi salvo, mas os concorrentes adicionados antes de salvar nao foram gravados. Adicione de novo.";
      }

      revalidatePath("/produtos");
      return {
        ok: true,
        id: produto.id,
        avisoImagens,
        avisoArquivos,
        avisoFornecedores,
        avisoConcorrentes,
      };
    }

    const anterior = await prisma.produto.findUnique({
      where: { id },
      select: { sku: true },
    });

    // Os arquivos moram numa pasta com o nome do SKU. Se o SKU mudou, a pasta
    // precisa acompanhar — e a renomeacao vem ANTES da gravacao: se ela falhar
    // (ja existe pasta com o nome novo), o banco nao fica apontando para uma
    // pasta que nao existe.
    if (anterior && anterior.sku !== dados.sku) {
      const movida = await renomearPastaProduto(anterior.sku, dados.sku);
      if (!movida.ok) return { ok: false, erros: { sku: movida.erro } };
    }

    const produto = await prisma.produto.update({ where: { id }, data: dados });

    // Fotos: o painel (ja padronizado, no lote temporario) vira o que o produto tem. A renomeacao da
    // pasta veio antes, entao `produto.sku` ja e o nome da pasta certa. Diferente do cadastro novo, o
    // produto ja existia, entao uma falha aqui e DEVOLVIDA como erro: o lote fica, e um segundo Salvar
    // tenta de novo (a operacao refaz a comparacao com o que esta gravado, e nao duplica nada).
    try {
      await gravarImagensDoPainel(produto, formData);
    } catch (erro) {
      console.error("Falha ao gravar as fotos do produto:", erro.message);
      return {
        ok: false,
        erro: "Os dados foram salvos, mas as fotos nao foram gravadas. Clique em Salvar de novo.",
      };
    }
    await descartarLote(String(formData.get("loteTemporario") ?? "")).catch(() => {});

    // Fornecedores e concorrentes da aba: pedido do dono em 22/09/2026, "so
    // quero que salve quando eu clicar no botao salvar do produto" — a tabela
    // edita so em memoria, e AQUI e o unico lugar que grava, reconciliando
    // com o que ja existe (soma, atualiza e REMOVE quem saiu da lista; ver as
    // duas funcoes, abaixo). Falha aqui nao derruba o Salvar: o produto e as
    // fotos ja estao gravados.
    let avisoFornecedores = null;
    try {
      await gravarFornecedoresRascunho(produto, formData);
    } catch (erro) {
      console.error("Falha ao gravar os fornecedores do produto:", erro.message);
      avisoFornecedores = "O produto foi salvo, mas os fornecedores nao foram atualizados. Confira a aba e salve de novo.";
    }

    let avisoConcorrentes = null;
    try {
      await gravarConcorrentesRascunho(produto, formData);
    } catch (erro) {
      console.error("Falha ao gravar os concorrentes do produto:", erro.message);
      avisoConcorrentes = "O produto foi salvo, mas os concorrentes nao foram atualizados. Confira a aba e salve de novo.";
    }

    // O fornecedor extraido na importacao do Bling ja foi confirmado pela
    // chamada acima (ele entra no MESMO rascunho, ver `fornecedoresRascunho`
    // em FormularioProduto.jsx) — so falta limpar a marca no Produto, senao
    // ele reaparece na proxima abertura como se ainda estivesse pendente.
    if (produto.fornecedorRascunho) {
      await prisma.produto
        .update({ where: { id }, data: { fornecedorRascunho: Prisma.DbNull } })
        .catch((erro) => console.error("Falha ao limpar o fornecedor em rascunho:", erro.message));
    }

    revalidatePath("/produtos");
    revalidatePath(`/produtos/${id}`);
    return { ok: true, id: produto.id, avisoFornecedores, avisoConcorrentes };
  } catch (erro) {
    // P2002 = violacao de unicidade; o unico campo unico aqui e o SKU.
    if (erro.code === "P2002") {
      return {
        ok: false,
        erros: { sku: `Ja existe um produto com o SKU "${dados.sku}".` },
      };
    }
    return { ok: false, erro: erro.message };
  }
}

export async function enviarArquivo(produtoId, tipo, _estadoAnterior, formData) {
  const produto = await prisma.produto.findUnique({
    where: { id: produtoId },
    select: { sku: true },
  });
  if (!produto) return { ok: false, erro: "Produto nao encontrado." };

  if (tipo === "IMAGEM") {
    // So FOTO conta no limite: a reserva fica guardada a parte (Nano Banana).
    const quantas = await prisma.produtoArquivo.count({
      where: { produtoId, tipo: "IMAGEM", papel: "FOTO" },
    });
    if (quantas >= MAXIMO_IMAGENS) {
      return {
        ok: false,
        erro: `Limite de ${MAXIMO_IMAGENS} imagens por produto. Remova uma antes de enviar outra.`,
      };
    }
  }

  // Foto enviada DEPOIS de o produto existir tambem vai para o padrao (1024x1024, fundo
  // branco, JPEG), decisao do dono em 21/09/2026: o mesmo produto nao pode ter uma foto no
  // padrao e outra fora dele. Documento e certificado seguem sem mexer nos bytes.
  let arquivo = formData.get("arquivo");
  if (tipo === "IMAGEM" && arquivo && typeof arquivo.arrayBuffer === "function" && arquivo.size) {
    const padrao = await padronizarImagem(Buffer.from(await arquivo.arrayBuffer()));
    if (!padrao.ok) return { ok: false, erro: padrao.erro };
    const nome = String(arquivo.name ?? "foto").replace(/\.[^.]+$/, "");
    arquivo = new File([padrao.bytes], `${nome}.jpg`, { type: padrao.mimeType });
  }

  const resultado = await salvarArquivo(produto.sku, tipo, arquivo);
  if (!resultado.ok) return { ok: false, erro: resultado.erro };

  const ultimo = await prisma.produtoArquivo.findFirst({
    where: { produtoId, tipo, papel: "FOTO" },
    orderBy: { ordem: "desc" },
    select: { ordem: true },
  });

  // A primeira imagem vira a principal sozinha: sem isso o produto ficaria sem
  // nenhuma marcada e a listagem nao teria o que mostrar.
  const primeira =
    tipo === "IMAGEM" &&
    (await prisma.produtoArquivo.count({
      where: { produtoId, tipo: "IMAGEM", papel: "FOTO" },
    })) === 0;

  await prisma.produtoArquivo.create({
    data: {
      produtoId,
      tipo,
      principal: primeira,
      arquivo: resultado.nome,
      nomeOriginal: resultado.nomeOriginal,
      mimeType: resultado.mimeType,
      tamanhoBytes: resultado.tamanhoBytes,
      ordem: (ultimo?.ordem ?? -1) + 1,
    },
  });

  revalidatePath("/produtos");
  revalidatePath(`/produtos/${produtoId}`);
  return { ok: true };
}

export async function removerArquivo(arquivoId) {
  const registro = await prisma.produtoArquivo.findUnique({
    where: { id: arquivoId },
    include: { produto: { select: { sku: true } } },
  });
  // A RESERVA nao se exclui por aqui: o arquivo mora em reserva/ (nao em imagens/) e a exclusao e decidida
  // na tela e aplicada pelo Salvar (`reservaExcluida`). Apagar so a linha deixaria o arquivo orfao.
  if (!registro || registro.papel !== "FOTO") return { ok: false, erro: "Arquivo nao encontrado." };

  await prisma.produtoArquivo.delete({ where: { id: arquivoId } });
  await apagarArquivo(registro.produto.sku, registro.tipo, registro.arquivo);

  // Removeu a principal? Outra assume, senao o produto fica sem imagem na lista
  // mesmo tendo fotos.
  if (registro.principal) {
    const proxima = await prisma.produtoArquivo.findFirst({
      where: { produtoId: registro.produtoId, tipo: "IMAGEM", papel: "FOTO" },
      orderBy: { ordem: "asc" },
      select: { id: true },
    });
    if (proxima) {
      await prisma.produtoArquivo.update({
        where: { id: proxima.id },
        data: { principal: true },
      });
    }
  }

  revalidatePath("/produtos");
  revalidatePath(`/produtos/${registro.produtoId}`);
  return { ok: true };
}

/**
 * Marca qual imagem e a principal.
 *
 * NAO reordena nada e NAO chama revalidatePath. Antes, escolher a principal
 * movia a imagem para a posicao 0 e empurrava as outras — o que fazia as
 * miniaturas dancarem e custava de 500ms a 3s por clique, porque forcava o
 * servidor a re-renderizar a pagina inteira.
 *
 * A tela ja trocou a imagem grande em estado de cliente antes de chamar isto;
 * aqui so persiste. E a lista de produtos e force-dynamic, entao reconsulta o
 * banco na proxima visita sem precisar de revalidacao.
 */
export async function definirImagemPrincipal(arquivoId) {
  const escolhida = await prisma.produtoArquivo.findUnique({
    where: { id: arquivoId },
    select: { id: true, produtoId: true, tipo: true, papel: true },
  });

  // A reserva nunca e foto principal.
  if (!escolhida || escolhida.tipo !== "IMAGEM" || escolhida.papel !== "FOTO") {
    return { ok: false, erro: "Imagem nao encontrada." };
  }

  // Uma principal por produto: desmarcar e marcar na mesma transacao, senao
  // uma falha no meio deixaria duas (ou nenhuma).
  await prisma.$transaction([
    prisma.produtoArquivo.updateMany({
      where: { produtoId: escolhida.produtoId, tipo: "IMAGEM", papel: "FOTO" },
      data: { principal: false },
    }),
    prisma.produtoArquivo.update({
      where: { id: arquivoId },
      data: { principal: true },
    }),
  ]);

  return { ok: true };
}

export async function excluirProduto(id) {
  const produto = await prisma.produto.findUnique({
    where: { id },
    include: { anuncios: true },
  });
  if (!produto) return { ok: false, erro: "Produto nao encontrado." };

  // Apagar um produto cujo anuncio esta no ar deixaria o anuncio orfao: vivo la
  // fora e invisivel aqui dentro.
  const publicados = produto.anuncios.filter(
    (anuncio) => anuncio.status === "PUBLICADO",
  );

  if (publicados.length > 0) {
    const canais = publicados.map((anuncio) => anuncio.canal).join(", ");
    return {
      ok: false,
      erro: `Este produto tem anuncio publicado em: ${canais}. Encerre os anuncios antes de excluir, senao eles ficam orfaos no canal.`,
    };
  }

  await prisma.produto.delete({ where: { id } });
  await apagarPastaProduto(produto.sku);

  revalidatePath("/produtos");
  return { ok: true };
}

/**
 * Exclui varios produtos de uma vez (selecao por caixa na lista, pedido do
 * dono em 18/09/2026, no padrao do Bling — substituiu o botao "Excluir
 * produto" de dentro do cadastro). Cada um passa pela MESMA regra de
 * `excluirProduto` (recusa produto com anuncio publicado): um produto
 * bloqueado nao impede os outros de serem excluidos, e a tela recebe quais
 * foram e quais nao, com o motivo.
 */
export async function excluirProdutos(ids) {
  const resultados = [];
  for (const id of ids) {
    const resultado = await excluirProduto(id);
    resultados.push({ id, ...resultado });
  }

  return {
    ok: resultados.every((item) => item.ok),
    excluidos: resultados.filter((item) => item.ok).length,
    falhas: resultados.filter((item) => !item.ok).map(({ ok: _ok, ...falha }) => falha),
  };
}

/**
 * Liga/desliga "produto totalmente conferido" (pedido do dono em 22/09/2026).
 * Antes vivia so no navegador (ConferidoProduto.jsx) e sumia ao recarregar;
 * agora grava de verdade, para a contagem "(N verificados)" da lista ser real.
 */
export async function alternarConferido(id, valor) {
  try {
    await prisma.produto.update({ where: { id }, data: { conferido: Boolean(valor) } });
    revalidatePath("/produtos");
    return { ok: true };
  } catch (erro) {
    return { ok: false, erro: erro.message };
  }
}

// ---------------------------------------------------------------------------
// Fornecedores
// ---------------------------------------------------------------------------

const FornecedorSchema = z.object({
  nome: z.string().trim().min(1, "Informe o fornecedor."),
  descricao: opcional(z.string().trim()),
  codigo: opcional(z.string().trim()),
  precoCusto: decimal(),
  link: opcional(
    z.string().trim().refine(ehUrlSegura, "Informe um endereco http ou https."),
  ),
});

/**
 * O custo do produto vem do fornecedor marcado como padrao.
 *
 * Gravado em vez de calculado na leitura porque `Produto.custo` ja e lido em
 * outros lugares — a validacao do Bling e o editor de anuncios. Calcular ali
 * exigiria mudar todos.
 */
async function recalcularCusto(produtoId) {
  const padrao = await prisma.produtoFornecedor.findFirst({
    where: { produtoId, padrao: true },
    select: { precoCusto: true },
  });

  await prisma.produto.update({
    where: { id: produtoId },
    data: { custo: padrao?.precoCusto ?? null },
  });
}

/**
 * Reconcilia os fornecedores do produto com a lista inteira que veio da aba
 * (`Fornecedores.jsx`, sempre em modo rascunho desde 22/09/2026 — "so quero
 * que salve quando eu clicar no botao salvar do produto"). Nao e mais so
 * "somar": soma, atualiza e REMOVE. A lista enviada e a verdade inteira —
 * fornecedor que saiu dela (o operador clicou na lixeira) e apagado aqui,
 * nao antes; ate o Salvar, a lixeira so tira a linha da tela.
 *
 * Identidade = `fornecedorId` (achado pelo NOME, unico por loja) — nao o id
 * local do vinculo, que pode ser um id de verdade (linha ja existia) ou um
 * uuid do navegador (linha nova). Funciona igual nos dois casos.
 */
async function gravarFornecedoresRascunho(produto, formData) {
  let lista = [];
  try {
    lista = JSON.parse(String(formData.get("fornecedoresRascunho") ?? "[]"));
  } catch {
    lista = [];
  }
  if (!Array.isArray(lista)) return;

  const validos = [];
  for (const item of lista) {
    const resultado = FornecedorSchema.safeParse(item);
    if (resultado.success) validos.push({ dados: resultado.data, padrao: Boolean(item?.padrao) });
  }

  // Nenhum marcado como padrao (a linha marcada caiu na validacao)? O
  // primeiro que sobrou assume, a mesma regra do primeiro fornecedor de um
  // produto em salvarFornecedorDoProduto.
  if (validos.length > 0 && !validos.some((item) => item.padrao)) validos[0].padrao = true;

  const fornecedorIdsMantidos = [];
  for (const { dados, padrao } of validos) {
    const { nome, ...vinculo } = dados;
    const fornecedor = await prisma.fornecedor.findFirst({
      where: { nome: { equals: nome, mode: "insensitive" } },
    });
    if (!fornecedor) throw new Error(`Cadastre o fornecedor "${nome}" antes de vincula-lo ao produto.`);

    // Upsert, e nao create: o mesmo fornecedor marcado duas vezes no rascunho
    // (nome repetido) atualiza o vinculo em vez de esbarrar no
    // unique(produtoId, fornecedorId).
    await prisma.produtoFornecedor.upsert({
      where: { produtoId_fornecedorId: { produtoId: produto.id, fornecedorId: fornecedor.id } },
      update: { ...vinculo, padrao },
      create: { ...vinculo, produtoId: produto.id, fornecedorId: fornecedor.id, padrao },
    });
    fornecedorIdsMantidos.push(fornecedor.id);
  }

  // `notIn: []` (lista vazia — todos os fornecedores foram removidos na
  // tela) apaga TODOS os vinculos do produto: e o comportamento certo, a
  // lista enviada e a verdade inteira.
  await prisma.produtoFornecedor.deleteMany({
    where: { produtoId: produto.id, fornecedorId: { notIn: fornecedorIdsMantidos } },
  });

  await recalcularCusto(produto.id);
}

export async function listarFornecedores() {
  return prisma.fornecedor.findMany({
    orderBy: { nome: "asc" },
    select: { id: true, nome: true },
  });
}

/**
 * Saldo E PRECO da ultima coleta do item exato de cada fornecedor vinculado.
 *
 * O preco aqui e so REFERENCIA (22/09/2026, pedido do dono): "Preco de custo"
 * continua sendo o que o operador negociou, digitado a mao — este preco nunca
 * o sobrescreve, so aparece ao lado num icone (ver `Fornecedores.jsx`),
 * para o operador notar quando o valor coletado mudou desde a negociacao.
 */
export async function consultarEstoqueFornecedores(vinculos) {
  const lista = (Array.isArray(vinculos) ? vinculos : []).slice(0, 100)
    .filter((item) => typeof item?.id === "string" && typeof item?.nome === "string");
  const criterios = lista.flatMap((item) => {
    const filtros = [];
    if (item.link) filtros.push({ url: item.link });
    if (item.codigo) filtros.push({
      codigo: { equals: item.codigo, mode: "insensitive" },
      fonte: { nome: { equals: item.nome, mode: "insensitive" }, tipo: "FORNECEDOR" },
    });
    return filtros;
  });
  if (!criterios.length) return { ok: true, itens: {} };
  try {
    const produtos = await prisma.produtoColetado.findMany({
      where: { OR: criterios, fonte: { tipo: "FORNECEDOR" } },
      select: {
        codigo: true, url: true, quantidade: true, aChegar: true, estoqueStatus: true,
        precoNormal: true, precoComImpostos: true, precoReserva: true, impostos: true,
        precosPorQuantidade: true,
        fonte: { select: { nome: true, dominio: true } },
      },
      orderBy: { vistoEm: "desc" },
      take: 300,
    });
    const itens = Object.fromEntries(lista.map((item) => {
      const nome = item.nome.toLocaleLowerCase("pt-BR");
      const codigo = String(item.codigo ?? "").toLocaleLowerCase("pt-BR");
      const produto = produtos.find((candidato) => item.link && candidato.url === item.link)
        ?? produtos.find((candidato) => codigo && candidato.codigo?.toLocaleLowerCase("pt-BR") === codigo
          && candidato.fonte.nome.toLocaleLowerCase("pt-BR") === nome);
      return [item.id, produto ? {
        quantidade: produto.quantidade,
        aChegar: produto.aChegar,
        disponivel: ["AVAILABLE", "IN_STOCK"].includes(produto.estoqueStatus),
        precoNormal: produto.precoNormal == null ? null : Number(produto.precoNormal),
        precoComImpostos: produto.precoComImpostos == null ? null : Number(produto.precoComImpostos),
        precoReserva: produto.precoReserva == null ? null : Number(produto.precoReserva),
        impostos: produto.impostos ?? [],
        precosPorQuantidade: produto.precosPorQuantidade ?? [],
        // Sem URL propria (Fortek: portal fechado, sem pagina publica) o link
        // da linha cai no dominio da fonte — mesma regra de `linkDaFonte` em
        // Mercados (TabelaMercados.jsx), pedido do dono em 22/09/2026 para as
        // duas telas concordarem.
        fonteDominio: produto.fonte.dominio,
      } : null];
    }));
    return { ok: true, itens };
  } catch (erro) {
    return { ok: false, erro: erro.message };
  }
}

export async function listarConcorrentesCadastrados() {
  return prisma.concorrente.findMany({
    orderBy: { nome: "asc" },
    select: { id: true, nome: true },
  });
}

export async function consultarSituacaoConcorrentes(ids) {
  const lista = [...new Set((Array.isArray(ids) ? ids : []).filter((id) => typeof id === "string"))].slice(0, 100);
  if (!lista.length) return { ok: true, itens: {} };
  try {
    const produtos = await prisma.produtoColetado.findMany({
      where: { id: { in: lista } },
      select: { id: true, ausenteDesde: true, quantidade: true, estoqueStatus: true },
    });
    return { ok: true, itens: Object.fromEntries(produtos.map((item) => [item.id, {
      ativo: item.ausenteDesde === null,
      quantidade: item.quantidade,
      estoqueStatus: item.estoqueStatus,
    }])) };
  } catch (erro) {
    return { ok: false, erro: erro.message };
  }
}

export async function salvarFornecedorDoProduto(produtoId, vinculoId, dados) {
  const resultado = FornecedorSchema.safeParse(dados);
  if (!resultado.success) {
    return { ok: false, erros: errosPorCampo(resultado) };
  }

  const { nome, ...vinculo } = resultado.data;

  try {
    const fornecedor = await prisma.fornecedor.findFirst({
      where: { nome: { equals: nome, mode: "insensitive" } },
    });
    if (!fornecedor) return { ok: false, erros: { nome: "Fornecedor nao cadastrado. Cadastre-o antes de salvar." }, cadastroNecessario: true };

    if (vinculoId) {
      await prisma.produtoFornecedor.update({
        where: { id: vinculoId },
        data: { ...vinculo, fornecedorId: fornecedor.id },
      });
    } else {
      // O primeiro fornecedor vira padrao sozinho, senao o custo do produto
      // nunca se preencheria.
      const quantos = await prisma.produtoFornecedor.count({ where: { produtoId } });

      await prisma.produtoFornecedor.create({
        data: {
          ...vinculo,
          produtoId,
          fornecedorId: fornecedor.id,
          padrao: quantos === 0,
        },
      });
    }

    await recalcularCusto(produtoId);
    revalidatePath(`/produtos/${produtoId}`);
    return { ok: true };
  } catch (erro) {
    if (erro.code === "P2002") {
      return {
        ok: false,
        erros: { nome: `"${nome}" ja esta vinculado a este produto.` },
      };
    }
    return { ok: false, erro: erro.message };
  }
}

export async function definirFornecedorPadrao(vinculoId) {
  const alvo = await prisma.produtoFornecedor.findUnique({
    where: { id: vinculoId },
    select: { produtoId: true },
  });
  if (!alvo) return { ok: false, erro: "Fornecedor nao encontrado." };

  await prisma.$transaction([
    prisma.produtoFornecedor.updateMany({
      where: { produtoId: alvo.produtoId },
      data: { padrao: false },
    }),
    prisma.produtoFornecedor.update({
      where: { id: vinculoId },
      data: { padrao: true },
    }),
  ]);

  await recalcularCusto(alvo.produtoId);
  revalidatePath(`/produtos/${alvo.produtoId}`);
  return { ok: true };
}

export async function removerFornecedorDoProduto(vinculoId) {
  const alvo = await prisma.produtoFornecedor.findUnique({
    where: { id: vinculoId },
    select: { produtoId: true, padrao: true },
  });
  if (!alvo) return { ok: false, erro: "Fornecedor nao encontrado." };

  await prisma.produtoFornecedor.delete({ where: { id: vinculoId } });

  // Removeu o padrao? Outro assume, senao o produto fica sem custo mesmo tendo
  // fornecedor cadastrado.
  if (alvo.padrao) {
    const proximo = await prisma.produtoFornecedor.findFirst({
      where: { produtoId: alvo.produtoId },
      orderBy: { criadoEm: "asc" },
      select: { id: true },
    });
    if (proximo) {
      await prisma.produtoFornecedor.update({
        where: { id: proximo.id },
        data: { padrao: true },
      });
    }
  }

  await recalcularCusto(alvo.produtoId);
  revalidatePath(`/produtos/${alvo.produtoId}`);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Concorrentes
// ---------------------------------------------------------------------------

/**
 * Vindo da lupa (`produtoColetadoId` preenchido) OU digitado a mao (os campos
 * `*Manual`) — pedido do dono em 18/09/2026. So um dos dois; `refine` exige
 * pelo menos o concorrente digitado quando nao ha produto coletado por tras.
 * O preco do que vem da lupa NAO passa por aqui: a tela le sempre o preco de
 * HOJE em ProdutoColetado, para acompanhar a proxima varredura.
 */
const ConcorrenteSchema = z
  .object({
    produtoColetadoId: opcional(z.string().trim()),
    fonteManual: opcional(z.string().trim()),
    nomeManual: opcional(z.string().trim()),
    codigoManual: opcional(z.string().trim()),
    precoManual: decimal(),
    linkManual: opcional(
      z.string().trim().refine(ehUrlSegura, "Informe um endereco http ou https."),
    ),
  })
  .refine((dados) => Boolean(dados.produtoColetadoId || dados.fonteManual), {
    message: "Informe o concorrente.",
    path: ["fonteManual"],
  });

export async function salvarConcorrenteDoProduto(produtoId, vinculoId, dados) {
  const resultado = ConcorrenteSchema.safeParse(dados);
  if (!resultado.success) {
    return { ok: false, erros: errosPorCampo(resultado) };
  }

  try {
    const coletado = resultado.data.produtoColetadoId
      ? await prisma.produtoColetado.findUnique({
          where: { id: resultado.data.produtoColetadoId },
          select: { fonte: { select: { nome: true } } },
        })
      : null;
    if (resultado.data.produtoColetadoId && !coletado) {
      return { ok: false, erro: "Produto coletado nao encontrado." };
    }
    const nomeConcorrente = coletado?.fonte.nome ?? resultado.data.fonteManual;
    const cadastro = await prisma.concorrente.findFirst({
      where: { nome: { equals: nomeConcorrente, mode: "insensitive" } },
      select: { id: true },
    });
    if (!cadastro) return {
      ok: false,
      erros: { fonteManual: `Cadastre o concorrente "${nomeConcorrente}" antes de salvar.` },
      cadastroNecessario: true,
      nomeConcorrente,
    };
    if (vinculoId) {
      await prisma.produtoConcorrente.update({
        where: { id: vinculoId },
        data: resultado.data,
      });
    } else {
      await prisma.produtoConcorrente.create({
        data: { ...resultado.data, produtoId },
      });
    }

    revalidatePath(`/produtos/${produtoId}`);
    return { ok: true };
  } catch (erro) {
    // Unico caso pratico: o mesmo produto coletado marcado duas vezes.
    if (erro.code === "P2002") {
      return { ok: false, erro: "Este concorrente ja esta na lista." };
    }
    return { ok: false, erro: erro.message };
  }
}

export async function removerConcorrenteDoProduto(vinculoId) {
  const alvo = await prisma.produtoConcorrente.findUnique({
    where: { id: vinculoId },
    select: { produtoId: true },
  });
  if (!alvo) return { ok: false, erro: "Concorrente nao encontrado." };

  await prisma.produtoConcorrente.delete({ where: { id: vinculoId } });

  revalidatePath(`/produtos/${alvo.produtoId}`);
  return { ok: true };
}

/**
 * Reconcilia os concorrentes do produto com a lista inteira que veio da aba
 * (`Concorrentes.jsx`, sempre em modo rascunho desde 22/09/2026 — mesmo
 * pedido do dono que mudou Fornecedores: a tela so grava no Salvar do
 * produto). Soma, atualiza e REMOVE quem saiu da lista.
 *
 * Identidade: vindo da lupa (`produtoColetadoId`), o unique(produtoId,
 * produtoColetadoId) resolve upsert sozinho — duas linhas do mesmo
 * concorrente com produtos diferentes continuam legitimas, cada uma com o
 * proprio produtoColetadoId. Digitado a mao, NAO HA chave de negocio (o
 * mesmo concorrente pode ter duas linhas de produtos diferentes tambem) —
 * a identidade e o proprio id do vinculo, e so serve quando ele ja e um id
 * de verdade (a tela semeia o rascunho com os vinculos existentes; linha
 * nova ganha um uuid do navegador, que nunca bate com um id do banco).
 */
async function gravarConcorrentesRascunho(produto, formData) {
  let lista = [];
  try {
    lista = JSON.parse(String(formData.get("concorrentesRascunho") ?? "[]"));
  } catch {
    lista = [];
  }
  if (!Array.isArray(lista)) return;

  const existentes = await prisma.produtoConcorrente.findMany({
    where: { produtoId: produto.id },
    select: { id: true },
  });
  const idsExistentes = new Set(existentes.map((item) => item.id));

  const idsMantidos = [];
  for (const item of lista) {
    const resultado = ConcorrenteSchema.safeParse(item);
    if (!resultado.success) continue;
    const dados = resultado.data;

    if (dados.produtoColetadoId) {
      const gravado = await prisma.produtoConcorrente.upsert({
        where: {
          produtoId_produtoColetadoId: { produtoId: produto.id, produtoColetadoId: dados.produtoColetadoId },
        },
        update: dados,
        create: { ...dados, produtoId: produto.id },
      });
      idsMantidos.push(gravado.id);
      continue;
    }

    if (typeof item?.id === "string" && idsExistentes.has(item.id)) {
      const gravado = await prisma.produtoConcorrente.update({ where: { id: item.id }, data: dados });
      idsMantidos.push(gravado.id);
      continue;
    }

    try {
      const gravado = await prisma.produtoConcorrente.create({
        data: { ...dados, produtoId: produto.id },
      });
      idsMantidos.push(gravado.id);
    } catch (erro) {
      if (erro.code !== "P2002") throw erro;
    }
  }

  // A lista enviada e a verdade inteira: quem sumiu dela (lixeira na tela,
  // ainda nao gravada ate agora) e removido aqui.
  await prisma.produtoConcorrente.deleteMany({
    where: { produtoId: produto.id, id: { notIn: idsMantidos } },
  });
}
