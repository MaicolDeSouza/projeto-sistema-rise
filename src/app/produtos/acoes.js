"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { buscarProdutoPorCodigo } from "@/lib/buscaPorCodigo";
import { buscarReferencias } from "@/lib/buscaPorPalavras";
import { lerCamposDasReferencias, lerDetalhesDasReferencias } from "@/lib/camposDasReferencias";
import { gerarDescricao, gerarTitulos } from "@/lib/ia/anuncio";
import { anexarImagens, imagensDaOrigem } from "@/lib/imagensImportadas";
import { importarProximosDoBling } from "@/lib/integracoes/importarBling";
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
export async function buscarPorPalavras(termo) {
  try {
    return { ok: true, ...(await buscarReferencias(termo)) };
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

/**
 * Descricao no modelo da loja, escrita pela IA a partir das referencias marcadas.
 * `produto` leva o Nome e o Codigo do formulario: titulo e "Itens inclusos (Cod:)".
 */
export async function criarDescricaoIA(ids, produto) {
  try {
    return { ok: true, texto: await gerarDescricao(ids, produto) };
  } catch (erro) {
    return { ok: false, erro: erro.message };
  }
}

/** Traz os proximos 5 produtos do Bling, em ordem crescente de codigo. */
export async function importarDoBling() {
  try {
    const resultado = await importarProximosDoBling(5);
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
    if (!id) {
      const produto = await prisma.produto.create({ data: dados });

      // Imagens do produto usado em "Buscar por codigo". So agora ha pasta para
      // elas. Foto recusada (tamanho, formato) nao desfaz o cadastro: e contada
      // e a tela avisa.
      let imagens = null;
      const origem = formData.get("importarImagensDe");
      if (origem) {
        const { fontes } = await imagensDaOrigem(String(origem));
        if (fontes.length > 0) imagens = await anexarImagens(produto.id, produto.sku, fontes);
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

      revalidatePath("/produtos");
      return {
        ok: true,
        id: produto.id,
        imagens: imagens && { salvas: imagens.salvas, recusadas: imagens.recusadas.length },
        avisoArquivos,
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

    revalidatePath("/produtos");
    revalidatePath(`/produtos/${id}`);
    return { ok: true, id: produto.id };
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
    const quantas = await prisma.produtoArquivo.count({
      where: { produtoId, tipo: "IMAGEM" },
    });
    if (quantas >= MAXIMO_IMAGENS) {
      return {
        ok: false,
        erro: `Limite de ${MAXIMO_IMAGENS} imagens por produto. Remova uma antes de enviar outra.`,
      };
    }
  }

  const resultado = await salvarArquivo(produto.sku, tipo, formData.get("arquivo"));
  if (!resultado.ok) return { ok: false, erro: resultado.erro };

  const ultimo = await prisma.produtoArquivo.findFirst({
    where: { produtoId, tipo },
    orderBy: { ordem: "desc" },
    select: { ordem: true },
  });

  // A primeira imagem vira a principal sozinha: sem isso o produto ficaria sem
  // nenhuma marcada e a listagem nao teria o que mostrar.
  const primeira =
    tipo === "IMAGEM" &&
    (await prisma.produtoArquivo.count({
      where: { produtoId, tipo: "IMAGEM" },
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
  if (!registro) return { ok: false, erro: "Arquivo nao encontrado." };

  await prisma.produtoArquivo.delete({ where: { id: arquivoId } });
  await apagarArquivo(registro.produto.sku, registro.tipo, registro.arquivo);

  // Removeu a principal? Outra assume, senao o produto fica sem imagem na lista
  // mesmo tendo fotos.
  if (registro.principal) {
    const proxima = await prisma.produtoArquivo.findFirst({
      where: { produtoId: registro.produtoId, tipo: "IMAGEM" },
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
    select: { id: true, produtoId: true, tipo: true },
  });

  if (!escolhida || escolhida.tipo !== "IMAGEM") {
    return { ok: false, erro: "Imagem nao encontrada." };
  }

  // Uma principal por produto: desmarcar e marcar na mesma transacao, senao
  // uma falha no meio deixaria duas (ou nenhuma).
  await prisma.$transaction([
    prisma.produtoArquivo.updateMany({
      where: { produtoId: escolhida.produtoId, tipo: "IMAGEM" },
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

export async function listarFornecedores() {
  return prisma.fornecedor.findMany({
    orderBy: { nome: "asc" },
    select: { id: true, nome: true },
  });
}

export async function salvarFornecedorDoProduto(produtoId, vinculoId, dados) {
  const resultado = FornecedorSchema.safeParse(dados);
  if (!resultado.success) {
    return { ok: false, erros: errosPorCampo(resultado) };
  }

  const { nome, ...vinculo } = resultado.data;

  try {
    // Reaproveita o fornecedor se ja existir; cria se for nome novo. E o que
    // impede o mesmo fornecedor virar "Ali", "ali" e "AliExpress".
    const fornecedor = await prisma.fornecedor.upsert({
      where: { nome },
      update: {},
      create: { nome },
    });

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
