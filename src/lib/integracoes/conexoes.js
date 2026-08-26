import { prisma } from "@/lib/db";
import { cifrar, decifrar } from "@/lib/crypto";

/**
 * Acesso a tabela Conexao.
 *
 * O segredo de cada servico e um objeto livre — cada conector define a forma do
 * proprio. Aqui ele so trafega cifrado para o banco e volta decifrado; esta
 * camada nao interpreta o conteudo.
 */

/** Segredo decifrado de um servico, ou null se ainda nao ha conexao. */
export async function lerSegredo(servico) {
  const conexao = await prisma.conexao.findUnique({ where: { servico } });
  if (!conexao?.segredoCifrado) return null;
  return decifrar(conexao.segredoCifrado);
}

/** Metadados da conexao (sem segredo). Seguro para mandar para a tela. */
export async function lerConexao(servico) {
  return prisma.conexao.findUnique({
    where: { servico },
    select: {
      servico: true,
      status: true,
      contaExterna: true,
      escopos: true,
      expiraEm: true,
      conectadoEm: true,
      ultimoTesteEm: true,
      ultimoTesteOk: true,
      ultimoErro: true,
    },
  });
}

export async function listarConexoes() {
  const linhas = await prisma.conexao.findMany({
    select: {
      servico: true,
      status: true,
      contaExterna: true,
      escopos: true,
      expiraEm: true,
      conectadoEm: true,
      ultimoTesteEm: true,
      ultimoTesteOk: true,
      ultimoErro: true,
    },
  });

  return new Map(linhas.map((linha) => [linha.servico, linha]));
}

/**
 * Grava segredo e metadados numa unica escrita.
 *
 * Isso importa mais do que parece: o refresh token do Bling e do Mercado Livre
 * ROTACIONA — cada renovacao invalida o anterior. Se o token novo fosse gravado
 * em duas etapas e a segunda falhasse, o antigo ja estaria queimado e a conexao
 * morreria, exigindo reautorizacao manual.
 */
export async function salvarConexao(servico, { segredo, ...metadados }) {
  const dados = {
    ...metadados,
    ...(segredo !== undefined ? { segredoCifrado: cifrar(segredo) } : {}),
  };

  return prisma.conexao.upsert({
    where: { servico },
    update: dados,
    create: { servico, ...dados },
  });
}

/** Anota o resultado do ultimo teste de conexao. */
export async function registrarTeste(servico, { ok, conta, erro }) {
  return prisma.conexao.upsert({
    where: { servico },
    update: {
      ultimoTesteEm: new Date(),
      ultimoTesteOk: ok,
      ultimoErro: ok ? null : (erro ?? "Falha desconhecida"),
      ...(ok ? { status: "CONECTADO" } : { status: "ERRO" }),
      ...(conta ? { contaExterna: conta } : {}),
    },
    create: {
      servico,
      status: ok ? "CONECTADO" : "ERRO",
      contaExterna: conta ?? null,
      ultimoTesteEm: new Date(),
      ultimoTesteOk: ok,
      ultimoErro: ok ? null : (erro ?? "Falha desconhecida"),
    },
  });
}

/** Apaga o segredo e volta a conexao para "nao configurado". */
export async function desconectar(servico) {
  return prisma.conexao.upsert({
    where: { servico },
    update: {
      segredoCifrado: null,
      status: "NAO_CONFIGURADO",
      contaExterna: null,
      escopos: null,
      expiraEm: null,
      conectadoEm: null,
      ultimoTesteEm: null,
      ultimoTesteOk: null,
      ultimoErro: null,
    },
    create: { servico, status: "NAO_CONFIGURADO" },
  });
}
