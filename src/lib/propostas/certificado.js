import { cifrar, decifrar } from "@/lib/crypto";
import { prisma } from "@/lib/db";
import { lerCertificado } from "@/lib/propostas/assinatura";

/**
 * O certificado digital da empresa (e-CNPJ A1) no cofre (spec 2026-11-17-assinatura-digital-proposta-design.md): a
 * `Conexao` CERTIFICADO_DIGITAL guarda o .pfx e a senha cifrados (AES-256-GCM, `src/lib/crypto.js`); a razao social e o
 * CNPJ vao em `contaExterna` ("RAZAO|cnpj") e a validade em `expiraEm`, para a tela e a Saude lerem sem decifrar nada.
 */

const SERVICO = "CERTIFICADO_DIGITAL";
const DIA = 24 * 60 * 60 * 1000;

function separarConta(contaExterna) {
  const [razaoSocial, cnpj] = String(contaExterna ?? "").split("|");
  return { razaoSocial: razaoSocial || "", cnpj: cnpj || null };
}

/** Confere (senha, validade, chave) e grava. Lanca com a mensagem para a tela; nada e gravado se nao abrir. */
export async function gravarCertificado({ pfx, senha }) {
  const lido = lerCertificado(pfx, senha);
  const dados = {
    segredoCifrado: cifrar({ pfx: Buffer.from(pfx).toString("base64"), senha: String(senha ?? "") }),
    contaExterna: `${lido.razaoSocial}|${lido.cnpj ?? ""}`,
    expiraEm: lido.validoAte,
    status: "CONECTADO",
    conectadoEm: new Date(),
    ultimoErro: null,
  };
  await prisma.conexao.upsert({ where: { servico: SERVICO }, update: dados, create: { servico: SERVICO, ...dados } });
  return { razaoSocial: lido.razaoSocial, cnpj: lido.cnpj, validoAte: lido.validoAte.toISOString() };
}

export async function removerCertificado() {
  await prisma.conexao.deleteMany({ where: { servico: SERVICO } });
}

/** Para a tela e a Saude: quem assina e ate quando. Nunca o segredo. */
export async function situacaoDoCertificado(agora = new Date()) {
  const linha = await prisma.conexao.findUnique({ where: { servico: SERVICO }, select: { contaExterna: true, expiraEm: true } });
  if (!linha?.expiraEm) return null;
  const validoAte = new Date(linha.expiraEm);
  return {
    ...separarConta(linha.contaExterna),
    validoAte: validoAte.toISOString(),
    vencido: validoAte <= agora,
    diasParaVencer: Math.ceil((validoAte.getTime() - agora.getTime()) / DIA),
  };
}

/**
 * O que a assinatura precisa, ou null (sem certificado, vencido, ou o segredo nao decifra: `ENCRYPTION_KEY` trocada,
 * linha corrompida). Nunca lanca: a proposta sai sem assinatura em vez de dar erro.
 */
export async function certificadoParaAssinar(agora = new Date()) {
  try {
    const linha = await prisma.conexao.findUnique({ where: { servico: SERVICO } });
    if (!linha?.segredoCifrado || !linha.expiraEm || new Date(linha.expiraEm) <= agora) return null;
    const segredo = decifrar(linha.segredoCifrado);
    if (!segredo?.pfx) return null;
    return { pfx: Buffer.from(segredo.pfx, "base64"), senha: segredo.senha ?? "", ...separarConta(linha.contaExterna) };
  } catch (erro) {
    console.error(`[certificado] não foi possível abrir o certificado guardado: ${erro?.message ?? erro}`);
    return null;
  }
}
