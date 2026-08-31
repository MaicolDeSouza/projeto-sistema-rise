"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { podeVisitar } from "@/lib/coleta/buscar";
import { coletarUrl } from "@/lib/coleta/coletar";
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
