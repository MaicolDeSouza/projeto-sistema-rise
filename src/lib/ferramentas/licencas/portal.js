import { prisma } from "@/lib/db";
import { registrarTeste } from "@/lib/integracoes/conexoes";
import { projetarLicenca } from "./banco.js";
import { normalizarIdentificador, normalizarNomeDoPc, textoDoResumoDaLeitura } from "./regras.js";

/**
 * A leitura do portal aplicada ao banco (spec 2026-11-05, §6.3): cada chave que a extensao leu vira (ou atualiza) a
 * licenca do programa, com os PCs ativados dela. O que o dono digitou (linhas, renovacao, observacoes, arquivos) nunca
 * e tocado; o `tipo` so muda quando o portal o informa.
 *
 * "Sumiu" so e marcado em leitura COMPLETA: uma pagina que falhou na extensao deixaria de trazer PCs e chaves que
 * continuam la, e marcar isso venderia uma vaga ocupada. Sem trava de leitura simultanea: duas leituras ao mesmo
 * tempo so repetem o mesmo upsert.
 */

const SERVICO = "LIGHTBURN";

const data = (texto) => {
  if (!texto) return null;
  const valor = new Date(texto);
  return Number.isNaN(valor.getTime()) ? null : valor;
};
const mesmoInstante = (a, b) => (a ? a.getTime() : null) === (b ? b.getTime() : null);

/** Um PC do portal: a chave e o id dele no portal; sem id, o nome normalizado (a reimportacao continua idempotente). */
const chaveDoPc = (pc) => (pc.idNoPortal ? String(pc.idNoPortal) : normalizarNomeDoPc(pc.hostname));

async function aplicarUmaLicenca(software, item, { lidaEm, completa }) {
  const identificador = normalizarIdentificador(item.chave, software.identificacao);
  return prisma.$transaction(async (tx) => {
    const existente = await tx.licenca.findFirst({
      where: { softwareId: software.id, identificador: { equals: identificador, mode: "insensitive" } },
      include: { ativacoes: { select: { id: true, chave: true, sumiuEm: true } } },
    });
    const situacao = String(item.situacao ?? "").trim().toUpperCase() || null;
    const portal = {
      portalId: item.idNoPortal ?? null,
      portalSituacao: situacao,
      portalExpiraEm: data(item.expiraEm),
      portalCriadaEm: data(item.criadaEm),
      portalAtivacoesUsadas: item.ativacoesUsadas ?? null,
      portalAtivacoesPermitidas: item.ativacoesPermitidas ?? null,
      portalDados: item.dados ?? {},
      portalLidoEm: lidaEm,
      portalSumiuEm: null,
    };
    const tipo = String(item.tipo ?? "").trim();
    if (tipo) portal.tipo = tipo;

    const licenca = existente
      ? await tx.licenca.update({ where: { id: existente.id }, data: portal, select: { id: true } })
      : await tx.licenca.create({ data: { softwareId: software.id, identificador, origem: "portal", ...portal }, select: { id: true } });

    const antes = new Map((existente?.ativacoes ?? []).map((ativacao) => [ativacao.chave, ativacao]));
    const vieram = new Set();
    let ganhou = false;
    for (const pc of item.ativacoes ?? []) {
      const chave = chaveDoPc(pc);
      if (!chave || vieram.has(chave)) continue;
      vieram.add(chave);
      const anterior = antes.get(chave);
      if (!anterior || anterior.sumiuEm) ganhou = true;
      const campos = {
        hostname: String(pc.hostname).trim(),
        so: pc.so ?? null,
        criadaEm: data(pc.criadaEm),
        ultimaSincronizacaoEm: data(pc.ultimaSincronizacaoEm),
        leaseExpiraEm: data(pc.leaseExpiraEm),
        dados: pc.dados ?? {},
        vistaEm: lidaEm,
        sumiuEm: null,
      };
      await tx.ativacaoDeLicenca.upsert({
        where: { licencaId_chave: { licencaId: licenca.id, chave } },
        create: { licencaId: licenca.id, chave, ...campos },
        update: campos,
      });
    }

    let sumiram = 0;
    if (completa) {
      const ausentes = [...antes.values()].filter((ativacao) => !ativacao.sumiuEm && !vieram.has(ativacao.chave));
      if (ausentes.length) {
        const marcadas = await tx.ativacaoDeLicenca.updateMany({ where: { id: { in: ausentes.map((ativacao) => ativacao.id) }, sumiuEm: null }, data: { sumiuEm: lidaEm } });
        sumiram = marcadas.count;
      }
    }

    const alterada =
      Boolean(existente) &&
      (existente.portalSituacao !== situacao ||
        !mesmoInstante(existente.portalExpiraEm, portal.portalExpiraEm) ||
        existente.portalAtivacoesUsadas !== portal.portalAtivacoesUsadas ||
        Boolean(existente.portalSumiuEm) ||
        ganhou ||
        sumiram > 0);
    return { id: licenca.id, nova: !existente, alterada, sumiram, pcs: vieram.size };
  });
}

/**
 * Aplica uma leitura do portal. `licencas` e o corpo que passou pelo esquema (`esquema.js`). Grava a `LeituraDoPortal`
 * e, com `registrar`, a linha de `LogIntegracao` e o "ultimo teste ok" da conexao (o cartao de Integracoes).
 */
export async function aplicarLeituraDoPortal({ softwareSlug = "lightburn", versao = null, lidoEm, completa = true, licencas = [], registrar = true } = {}) {
  const inicio = Date.now();
  const software = await prisma.software.findUnique({ where: { slug: softwareSlug } });
  if (!software) return { ok: false, erro: `O programa "${softwareSlug}" não existe no Rise.` };
  const lidaEm = data(lidoEm) ?? new Date();

  const vistas = new Set();
  const resumo = { licencas: 0, ativacoes: 0, novas: 0, alteradas: 0, sumiram: 0, pcsSemCliente: 0 };
  const tocadas = [];
  for (const item of licencas) {
    const identificador = normalizarIdentificador(item.chave, software.identificacao);
    if (!identificador || vistas.has(identificador)) continue;
    vistas.add(identificador);
    const aplicada = await aplicarUmaLicenca(software, item, { lidaEm, completa });
    tocadas.push(aplicada.id);
    resumo.licencas++;
    resumo.ativacoes += aplicada.pcs;
    if (aplicada.nova) resumo.novas++;
    if (aplicada.alterada) resumo.alteradas++;
    resumo.sumiram += aplicada.sumiram;
  }

  // Chave do programa que a leitura completa nao trouxe: sumiu do portal. Vale tambem para a que veio da planilha ou foi
  // digitada e o portal nunca mostrou (spec §6.5: "e assim que o dono ve as chaves mortas"). A que reaparece volta a nulo
  // no proprio upsert acima.
  if (completa) {
    await prisma.licenca.updateMany({
      where: { softwareId: software.id, portalSumiuEm: null, id: { notIn: tocadas } },
      data: { portalSumiuEm: lidaEm },
    });
  }

  const depois = await prisma.licenca.findMany({
    where: { id: { in: tocadas } },
    include: { linhas: { include: { cliente: { select: { id: true, nome: true, documento: true } } } }, ativacoes: true },
  });
  for (const licenca of depois) resumo.pcsSemCliente += projetarLicenca({ software, licenca }).pcsSemCliente.length;

  const leitura = await prisma.leituraDoPortal.create({
    data: {
      softwareId: software.id,
      lidaEm,
      licencas: resumo.licencas,
      ativacoes: resumo.ativacoes,
      novas: resumo.novas,
      alteradas: resumo.alteradas,
      sumiram: resumo.sumiram,
      completa: Boolean(completa),
      versaoDaExtensao: versao ? String(versao).slice(0, 20) : null,
    },
    select: { id: true },
  });

  if (registrar) {
    await prisma.logIntegracao.create({
      data: {
        servico: SERVICO,
        metodo: "POST",
        endpoint: "importar",
        statusHttp: 200,
        duracaoMs: Date.now() - inicio,
        requestResumo: `${resumo.licencas} chave(s), ${resumo.ativacoes} PC(s), leitura ${completa ? "completa" : "incompleta"}, extensão ${versao ?? "?"}`,
        responseResumo: textoDoResumoDaLeitura(resumo),
      },
    });
    await registrarTeste(SERVICO, { ok: true });
  }
  return { ok: true, leituraId: leitura.id, resumo };
}

/** A ultima leitura do portal para o cartao de Integracoes: quando, se foi completa e o resumo dela. */
export async function ultimaLeituraDoPortal(softwareSlug = "lightburn") {
  const leitura = await prisma.leituraDoPortal.findFirst({
    where: { software: { slug: softwareSlug } },
    orderBy: { lidaEm: "desc" },
    select: { lidaEm: true, completa: true, licencas: true, novas: true, alteradas: true, sumiram: true },
  });
  if (!leitura) return null;
  return { lidaEm: leitura.lidaEm.toISOString(), completa: leitura.completa, resumo: textoDoResumoDaLeitura(leitura) };
}

/** O que a extensao pergunta antes de ler (e o cartao de Integracoes mostra): a ultima leitura e quantas chaves o Rise tem. */
export async function estadoDaLeitura(softwareSlug = "lightburn") {
  const software = await prisma.software.findUnique({ where: { slug: softwareSlug }, select: { id: true } });
  if (!software) return { ultimaLeituraEm: null, licencasNoRise: 0 };
  const [ultima, licencasNoRise] = await Promise.all([
    prisma.leituraDoPortal.findFirst({ where: { softwareId: software.id }, orderBy: { lidaEm: "desc" }, select: { lidaEm: true } }),
    prisma.licenca.count({ where: { softwareId: software.id } }),
  ]);
  return { ultimaLeituraEm: ultima ? ultima.lidaEm.toISOString() : null, licencasNoRise };
}
