import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { mascararDadosPessoais } from "@/lib/riseAi/mascarar";

/**
 * O registro de cada chamada que chega pelo /mcp (`ChamadaMcp`): quem, por qual cliente, qual ferramenta, quando, se deu
 * certo e quanto levou. E a garantia de que nada se perde mesmo quando o modelo nao chama `anotarDuvida`.
 */

const LIMITE_DOS_ARGUMENTOS = 2000;
const NOME_DA_ANOTACAO = "anotarDuvida";

/** Telefone, e-mail, CPF e CNPJ saem de todo texto dos argumentos, em qualquer profundidade. */
function mascarar(valor) {
  if (typeof valor === "string") return mascararDadosPessoais(valor).texto;
  if (Array.isArray(valor)) return valor.map(mascarar);
  if (valor && typeof valor === "object") return Object.fromEntries(Object.entries(valor).map(([chave, item]) => [chave, mascarar(item)]));
  return valor;
}

/** Os argumentos como entram no registro: mascarados e, se passarem de 2.000 caracteres em JSON, so o comeco. */
export function argumentosParaRegistro(argumentos) {
  if (argumentos === undefined || argumentos === null) return null;
  const mascarados = mascarar(argumentos);
  const texto = JSON.stringify(mascarados);
  return texto.length <= LIMITE_DOS_ARGUMENTOS ? mascarados : { cortado: true, inicio: texto.slice(0, LIMITE_DOS_ARGUMENTOS) };
}

/** Grava a chamada. Falha ao gravar o registro nunca derruba a resposta ao cliente: vai para o log do servidor. */
export async function registrarChamadaMcp({ login, clienteId = null, clienteNome, ferramenta, argumentos, ok, erro = null, duracaoMs }) {
  try {
    await prisma.chamadaMcp.create({
      data: {
        login,
        clienteId,
        clienteNome: String(clienteNome ?? "").slice(0, 120) || "Cliente MCP",
        ferramenta: String(ferramenta).slice(0, 80),
        argumentos: argumentosParaRegistro(argumentos) ?? Prisma.DbNull,
        ok: Boolean(ok),
        erro: erro ? String(erro).slice(0, 500) : null,
        duracaoMs: Math.max(0, Math.round(duracaoMs ?? 0)),
      },
    });
  } catch (falha) {
    console.error("[mcp] chamada não registrada:", falha?.message ?? falha);
  }
}

/**
 * As ferramentas que o cliente usou desde a ultima `anotarDuvida` dele (no maximo 30 minutos para tras e as 8 mais
 * recentes): vao junto da resposta anotada, para a Revisao mostrar de onde ela veio.
 *
 * @returns {Promise<{ nome: string, argumentos: unknown, ok: boolean, duracaoMs: number }[]>}
 */
export async function chamadasRecentes({ login, clienteId = null }, { agora = Date.now(), janelaMs = 30 * 60 * 1000, limite = 8 } = {}) {
  const ultimaAnotacao = await prisma.chamadaMcp.findFirst({ where: { login, clienteId, ferramenta: NOME_DA_ANOTACAO }, orderBy: { quando: "desc" }, select: { quando: true } });
  const inicioDaJanela = new Date(agora - janelaMs);
  const desde = ultimaAnotacao && ultimaAnotacao.quando > inicioDaJanela ? ultimaAnotacao.quando : inicioDaJanela;
  const linhas = await prisma.chamadaMcp.findMany({
    where: { login, clienteId, ferramenta: { not: NOME_DA_ANOTACAO }, quando: { gt: desde } },
    orderBy: [{ quando: "desc" }, { id: "desc" }],
    take: limite,
    select: { ferramenta: true, argumentos: true, ok: true, duracaoMs: true },
  });
  return linhas.reverse().map((linha) => ({ nome: linha.ferramenta, argumentos: linha.argumentos, ok: linha.ok, duracaoMs: linha.duracaoMs }));
}
