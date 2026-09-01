"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { podeVisitar } from "@/lib/coleta/buscar";
import { coletarUrl } from "@/lib/coleta/coletar";
import { juntarListas, lerArquivo } from "@/lib/coleta/arquivos";
import { regrasDoFornecedor } from "@/lib/coleta/fornecedores";
import { testarFonte } from "@/lib/coleta/testar";

/**
 * Acoes da secao Mercados.
 *
 * Este arquivo so exporta funcao assincrona: num modulo "use server", uma
 * constante exportada faz o Next recusar o modulo inteiro.
 */

/// Um Job parado por mais que isso quer dizer que ninguem o pegou.
const ESPERA_MAXIMA_MS = 60 * 1000;

const FonteSchema = z.object({
  nome: z.string().trim().min(1, "Informe um nome para a fonte."),
  url: z.string().trim().min(1, "Informe o endereco do site."),
  tipo: z.enum(["CONCORRENTE", "FORNECEDOR", "OUTRO"]),
  secao: z.string().trim().optional().nullable(),
});

// ---------------------------------------------------------------------------
// Teste da fonte
// ---------------------------------------------------------------------------

/**
 * Testa se uma fonte serve, sem gravar nada.
 *
 * Nao basta o site responder 200 — toda loja responde 200 na home. O teste
 * abre paginas de verdade e so aprova se conseguir montar produto com nome,
 * endereco e preco.
 */
export async function testarFonteAcao({ url, secao, nome, tipo }) {
  try {
    return await testarFonte({ url, secao, nome, tipo });
  } catch (erro) {
    return {
      resultado: "FALHA",
      motivo: erro?.message ?? "Falha inesperada ao testar a fonte.",
      passos: [],
      produtos: [],
      campos: null,
      plataforma: null,
      catalogoPublico: null,
    };
  }
}

/**
 * Indice do arquivo inteiro, por codigo, para a tela poder mesclar.
 *
 * A previa devolve tres produtos; o arquivo tem centenas. Sem este indice, a
 * mesclagem com o site so aconteceria se um dos tres sorteados casasse com um
 * dos tres do site — o que quase nunca acontece, e foi por isso que a
 * mesclagem parecia nao funcionar.
 *
 * Vai SEM imagem e SEM descricao de proposito: sao os campos pesados, e o
 * arquivo da Fortek tem 10 MB so de foto. O que atravessa e o que o site nao
 * tem — preco, saldo e os codigos fiscais.
 */
function resumoPorCodigo(produtos) {
  const indice = {};

  for (const produto of produtos) {
    if (!produto.code || produto.code === "N/A") continue;
    if (indice[produto.code]) continue;

    indice[produto.code] = {
      code: produto.code,
      prices: produto.prices,
      stock: produto.stock,
      taxes: produto.taxes,
      ncm: produto.ncm,
      ean: produto.ean,
      category: produto.category,
      specifications: produto.specifications,
      images: [],
      origens: produto.origens,
    };
  }

  return indice;
}
/**
 * Escolhe os produtos que a previa mostra.
 *
 * Nao sao os tres primeiros: num catalogo de mil itens, os primeiros costumam
 * ser todos parecidos, e o operador nao ve o caso que precisa conferir. A
 * amostra tenta comecar por quem tem PRONTA ENTREGA E RESERVA — e o produto
 * que mostra as duas caixas e prova que as listas se juntaram.
 *
 * Depois completa com o resto, na ordem do arquivo.
 */
function amostraRepresentativa(produtos, quantos = 3) {
  const temAmbos = (produto) =>
    typeof produto.stock?.quantity === "number" &&
    typeof produto.stock?.aChegar === "number";

  const escolhidos = produtos.filter(temAmbos).slice(0, quantos);

  for (const produto of produtos) {
    if (escolhidos.length >= quantos) break;
    if (!escolhidos.includes(produto)) escolhidos.push(produto);
  }

  return escolhidos;
}
/**
 * Testa a fonte por um ARQUIVO trazido do fornecedor, em vez do site.
 *
 * Tem prioridade sobre a navegacao quando o operador sobe um arquivo: se ele
 * ja trouxe o catalogo, abrir o site seria trabalho repetido — e, no caso que
 * motivou isto, impossivel, porque o portal exige login.
 *
 * Recebe FormData porque Server Action nao aceita Uint8Array direto. O teto do
 * corpo esta em 24 MB no next.config.mjs; acima disso o 413 vem ANTES daqui.
 */
export async function testarArquivoAcao(dados) {
  const arquivos = dados.getAll("arquivo").filter((item) => typeof item !== "string");

  if (arquivos.length === 0) {
    return { resultado: "FALHA", motivo: "Nenhum arquivo recebido.", passos: [], produtos: [] };
  }

  const nome = dados.get("nome") || arquivos[0].name;
  const tipo = dados.get("tipo") || "FORNECEDOR";

  try {
    const lidos = [];
    const passos = [];
    const avisos = [];

    for (const arquivo of arquivos) {
      const bytes = new Uint8Array(await arquivo.arrayBuffer());
      const leitura = await lerArquivo({
        nome: arquivo.name,
        bytes,
        fonte: { name: nome, type: tipo },
      });

      lidos.push(leitura);
      avisos.push(...leitura.avisos);

      const modalidade =
        leitura.modalidade === "RESERVA"
          ? " · lista de RESERVA"
          : leitura.modalidade === "PRONTA_ENTREGA"
            ? " · pronta entrega"
            : "";

      passos.push({
        nome: "Arquivo recebido",
        ok: true,
        detalhe: `${arquivo.name} · ${(arquivo.size / 1024 / 1024).toFixed(1)} MB · ${leitura.formato.toUpperCase()}${modalidade}`,
      });

      passos.push({
        nome: "Produtos lidos",
        ok: leitura.produtos.length > 0,
        detalhe:
          leitura.produtos.length > 0
            ? `${leitura.produtos.length} produto(s) · ${leitura.origem}`
            : "nenhum produto reconhecido no arquivo",
      });
    }

    // A pronta entrega vem primeiro: em juntarListas quem chega antes vence, e
    // o preco a manter e o dela.
    const ordenados = [...lidos].sort((a, b) =>
      (a.modalidade === "RESERVA" ? 1 : 0) - (b.modalidade === "RESERVA" ? 1 : 0),
    );

    // Particularidades declaradas para este fornecedor, se houver. E onde mora
    // a regra do sufixo de carga da Fortek ("02-268-A" e "02-268" sao o mesmo
    // item), que nao vale como palpite geral.
    const regras = regrasDoFornecedor({ nome, url: dados.get("url") });

    const somados = ordenados.map((leitura) => leitura.produtos);
    const produtos =
      somados.length > 1
        ? juntarListas(somados, { sufixoDeCarga: regras.sufixoDeCarga })
        : somados[0] ?? [];

    const formato = lidos[0]?.formato ?? "desconhecido";
    const origem = lidos[0]?.origem ?? "arquivo do fornecedor";

    if (somados.length > 1) {
      const total = somados.reduce((soma, lista) => soma + lista.length, 0);
      passos.push({
        nome: "Listas juntadas",
        ok: true,
        detalhe:
          `${total} linha(s) viraram ${produtos.length} produto(s)` +
          (regras.sufixoDeCarga
            ? ` — regra da ${regras.nome}: o sufixo do codigo e a carga, nao o produto`
            : " — o mesmo codigo nas duas listas e um produto so"),
      });
    }

    for (const aviso of avisos) {
      passos.push({ nome: "Aviso", ok: false, detalhe: aviso });
    }

    if (produtos.length === 0) {
      return {
        resultado: "FALHA",
        motivo:
          "Nao foi possivel reconhecer produtos neste arquivo. " +
          "Formatos lidos hoje: pagina salva (HTML), catalogo em PDF e JSON.",
        passos,
        produtos: [],
        campos: null,
        formatos: [formato],
      };
    }

    // Os mesmos campos que o teste do site relata, para a tela nao precisar
    // saber se o produto veio de arquivo ou de navegacao.
    const { camposPreenchidos, ROTULOS_CAMPOS } = await import("@/lib/coleta/campos");

    const presentes = {};
    for (const produto of produtos) {
      for (const [campo, tem] of Object.entries(camposPreenchidos(produto))) {
        presentes[campo] = presentes[campo] || tem;
      }
    }

    const encontrados = Object.entries(presentes)
      .filter(([, tem]) => tem)
      .map(([campo]) => ROTULOS_CAMPOS[campo]);
    const ausentes = Object.entries(presentes)
      .filter(([, tem]) => !tem)
      .map(([campo]) => ROTULOS_CAMPOS[campo]);

    return {
      resultado: ausentes.length === 0 ? "SUCESSO" : "PARCIAL",
      motivo: null,
      passos,
      // A previa mostra uma amostra escolhida; o arquivo inteiro entra na
      // coleta. Ver so os tres primeiros esconderia o caso interessante.
      produtos: amostraRepresentativa(produtos),
      // O arquivo inteiro, so com o que a tela precisa para mesclar.
      porCodigo: resumoPorCodigo(produtos),
      totalNoArquivo: produtos.length,
      campos: { encontrados, ausentes },
      formatos: [formato],
      produtosNoSite: produtos.length,
      produtosNoSiteParcial: false,
    };
  } catch (erro) {
    return {
      resultado: "FALHA",
      motivo: `Falha ao ler o arquivo: ${erro?.message ?? erro}`,
      passos: [],
      produtos: [],
      campos: null,
    };
  }
}
// ---------------------------------------------------------------------------
// Cadastro
// ---------------------------------------------------------------------------

/**
 * Grava a fonte. So deve ser chamada depois de um teste aprovado.
 *
 * O robots.txt e reconferido aqui — e barato, porque a leitura fica em cache
 * por uma hora — para que a permissao seja verificada no servidor e nao apenas
 * acreditada a partir do que a tela mandou.
 */
export async function salvarFonte({
  nome,
  url,
  tipo,
  secao,
  resumo,
  produtosNoSite,
  produtosNoSiteParcial,
}) {
  const analise = FonteSchema.safeParse({ nome, url, tipo, secao });
  if (!analise.success) {
    return { ok: false, erro: analise.error.issues[0].message };
  }

  let alvo;
  try {
    alvo = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`);
  } catch {
    return { ok: false, erro: "Endereco invalido." };
  }

  const permissao = await podeVisitar(alvo.toString());
  if (!permissao.permitido) {
    return { ok: false, erro: `O robots.txt deste site nos bloqueia: ${permissao.motivo}` };
  }

  const prefixoUrl = analise.data.secao?.trim() || null;

  const existente = await prisma.fonteColeta.findFirst({
    where: { dominio: alvo.hostname, prefixoUrl },
  });

  if (existente) {
    return {
      ok: false,
      erro: `"${existente.nome}" ja acompanha ${alvo.hostname}${prefixoUrl ?? ""}.`,
    };
  }

  const fonte = await prisma.fonteColeta.create({
    data: {
      nome: analise.data.nome,
      dominio: alvo.hostname,
      tipo: analise.data.tipo,
      prefixoUrl,
      robotsPermite: true,
      amostraResumo: resumo ?? null,
      // Quantos produtos o site declarou ter no momento do teste. Guardado no
      // cadastro para a tela dizer o quanto do catalogo ja foi coletado sem
      // precisar reabrir o sitemap a cada renderizacao.
      produtosNoSite: produtosNoSite ?? null,
      produtosNoSiteParcial: produtosNoSiteParcial ?? false,
      // Cadastrada PAUSADA: a coleta periodica nao faz parte desta etapa, e uma
      // fonte que comeca a varrer sozinha ao ser salva seria uma surpresa.
      ativa: false,
      proximaVarreduraEm: new Date(Date.now() + 100 * 365 * 24 * 60 * 60 * 1000),
    },
  });

  revalidatePath("/mercados/fontes");
  revalidatePath("/mercados");
  return { ok: true, id: fonte.id };
}

/**
 * Corrige nome e endereco de uma fonte ja cadastrada.
 *
 * Trocar o dominio e mais que renomear: as paginas ja coletadas continuam
 * apontando para o endereco antigo, e a unicidade dominio+trecho pode colidir
 * com outra fonte. Por isso o dominio novo passa pelas MESMAS conferencias do
 * cadastro — robots.txt e duplicidade —, e nao por um caminho mais curto so
 * porque a fonte ja existe.
 */
export async function editarFonte(id, { nome, url }) {
  const fonte = await prisma.fonteColeta.findUnique({ where: { id } });
  if (!fonte) return { ok: false, erro: "Fonte nao encontrada." };

  const nomeLimpo = (nome ?? "").trim();
  if (!nomeLimpo) return { ok: false, erro: "Informe um nome para a fonte." };

  const dados = { nome: nomeLimpo };

  const urlLimpa = (url ?? "").trim();
  if (urlLimpa) {
    let alvo;
    try {
      alvo = new URL(/^https?:\/\//i.test(urlLimpa) ? urlLimpa : `https://${urlLimpa}`);
    } catch {
      return { ok: false, erro: "Endereco invalido." };
    }

    if (alvo.hostname !== fonte.dominio) {
      const permissao = await podeVisitar(alvo.toString());
      if (!permissao.permitido) {
        return {
          ok: false,
          erro: `O robots.txt deste site nos bloqueia: ${permissao.motivo}`,
        };
      }

      const existente = await prisma.fonteColeta.findFirst({
        where: {
          dominio: alvo.hostname,
          prefixoUrl: fonte.prefixoUrl,
          id: { not: id },
        },
      });

      if (existente) {
        return {
          ok: false,
          erro: `"${existente.nome}" ja acompanha ${alvo.hostname}.`,
        };
      }

      dados.dominio = alvo.hostname;
      dados.robotsPermite = true;
    }
  }

  await prisma.fonteColeta.update({ where: { id }, data: dados });

  revalidatePath("/mercados/fontes");
  revalidatePath("/mercados");
  return { ok: true };
}
export async function alternarFonte(id) {
  const fonte = await prisma.fonteColeta.findUnique({ where: { id } });
  if (!fonte) return { ok: false, erro: "Fonte nao encontrada." };

  if (!fonte.robotsPermite && !fonte.ativa) {
    return { ok: false, erro: "O robots.txt deste site nos bloqueia." };
  }

  await prisma.fonteColeta.update({
    where: { id },
    data: { ativa: !fonte.ativa },
  });

  revalidatePath("/mercados/fontes");
  return { ok: true };
}

/** Quantas paginas se perdem ao excluir — a tela avisa antes de apagar. */
export async function contarPaginas(id) {
  return prisma.paginaColetada.count({ where: { fonteId: id } });
}

export async function excluirFonte(id) {
  await prisma.fonteColeta.delete({ where: { id } });
  revalidatePath("/mercados/fontes");
  revalidatePath("/mercados");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Detalhe da pagina coletada
// ---------------------------------------------------------------------------

/**
 * Dados completos de uma pagina, buscados no clique da linha.
 *
 * A descricao nao vem na listagem de proposito: sao uns 10 KB por linha, meio
 * megabyte para cinquenta resultados, e quase nada disso chega a ser lido.
 */
export async function detalhePagina(id) {
  const pagina = await prisma.paginaColetada.findUnique({
    where: { id },
    include: {
      fonte: { select: { nome: true, tipo: true, dominio: true } },
      precos: { orderBy: { coletadoEm: "desc" }, take: 2 },
    },
  });

  if (!pagina) return null;

  return {
    id: pagina.id,
    url: pagina.url,
    titulo: pagina.titulo,
    descricao: pagina.descricao,
    marca: pagina.marca,
    modelo: pagina.modelo,
    mpn: pagina.mpn,
    skuFonte: pagina.skuFonte,
    ean: pagina.ean,
    atributos: pagina.atributos ?? null,
    imagens: Array.isArray(pagina.imagens) ? pagina.imagens : [],
    // Decimal do Prisma nao atravessa a fronteira servidor/cliente.
    precoAtual: pagina.precoAtual === null ? null : Number(pagina.precoAtual),
    disponivel: pagina.disponivel,
    vistoEm: pagina.vistoEm,
    erro: pagina.erro,
    fonte: pagina.fonte,
    precoAnterior:
      pagina.precos[1]?.preco === undefined || pagina.precos[1]?.preco === null
        ? null
        : Number(pagina.precos[1].preco),
    mudouEm: pagina.precos[0]?.coletadoEm ?? null,
  };
}

// ---------------------------------------------------------------------------
// Varredura (fora do escopo desta etapa; a fila fica pronta para depois)
// ---------------------------------------------------------------------------

export async function atualizarTabelas(fonteId) {
  const emAndamento = await prisma.job.count({
    where: { tipo: "coleta", status: { in: ["PENDENTE", "PROCESSANDO"] } },
  });

  // Sem esta guarda, cinco cliques viram cinco varreduras completas.
  if (emAndamento > 0) {
    return { ok: false, erro: "Ja ha uma varredura em andamento." };
  }

  const fontes = await prisma.fonteColeta.findMany({
    where: fonteId ? { id: fonteId } : { ativa: true, robotsPermite: true },
    select: { id: true, nome: true },
  });

  if (fontes.length === 0) {
    return { ok: false, erro: "Nenhuma fonte ativa para varrer." };
  }

  await prisma.job.createMany({
    data: fontes.map((fonte) => ({
      tipo: "coleta",
      payload: { fonteId: fonte.id, fonteNome: fonte.nome, total: 0, feitas: 0 },
    })),
  });

  revalidatePath("/mercados");
  return { ok: true, enfileiradas: fontes.length };
}

export async function situacaoVarredura() {
  const jobs = await prisma.job.findMany({
    where: { tipo: "coleta", status: { in: ["PENDENTE", "PROCESSANDO"] } },
    orderBy: { criadoEm: "asc" },
  });

  const agora = Date.now();
  const semWorker = jobs.some(
    (job) =>
      job.status === "PENDENTE" && agora - job.criadoEm.getTime() > ESPERA_MAXIMA_MS,
  );

  return {
    emAndamento: jobs.length > 0,
    semWorker,
    jobs: jobs.map((job) => ({
      id: job.id,
      status: job.status,
      fonteNome: job.payload?.fonteNome ?? "?",
      total: job.payload?.total ?? 0,
      feitas: job.payload?.feitas ?? 0,
    })),
    ultimo: null,
  };
}

/** Coleta uma URL avulsa, para conferir uma pagina especifica. */
export async function coletarUma(fonteId, url) {
  const fonte = await prisma.fonteColeta.findUnique({ where: { id: fonteId } });
  if (!fonte) return { ok: false, erro: "Fonte nao encontrada." };

  const resultado = await coletarUrl({ fonte, url });
  revalidatePath("/mercados");
  return { ok: true, ...resultado };
}
