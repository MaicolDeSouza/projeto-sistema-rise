"use server";

import { revalidatePath } from "next/cache";

import { executarComAcesso } from "@/lib/acessos/servidor";
import { TAMANHO_MAXIMO_DO_CERTIFICADO } from "@/lib/propostas/assinatura";
import { gravarCertificado, removerCertificado, situacaoDoCertificado } from "@/lib/propostas/certificado";

/**
 * O certificado digital da empresa (e-CNPJ A1) em Configuracoes > Dados da empresa (17/11/2026). So o Administrador, como o
 * logo e os dados da empresa. A senha e o arquivo nunca voltam na resposta, nem no erro.
 */
export async function enviarCertificadoAcao(formData) {
  return executarComAcesso("tela.configuracoes.usuarios", "editar", async () => {
    const arquivo = formData?.get("arquivo");
    const senha = String(formData?.get("senha") ?? "");
    if (!arquivo || typeof arquivo.arrayBuffer !== "function" || !arquivo.size) return { ok: false, erro: "Escolha o arquivo do certificado (.pfx ou .p12)." };
    if (arquivo.size > TAMANHO_MAXIMO_DO_CERTIFICADO) return { ok: false, erro: "Arquivo maior que 50 KB." };
    if (!senha) return { ok: false, erro: "Digite a senha do certificado." };
    try {
      await gravarCertificado({ pfx: Buffer.from(await arquivo.arrayBuffer()), senha });
    } catch (erro) {
      return { ok: false, erro: erro?.message ?? "Não foi possível ler o certificado." };
    }
    revalidatePath("/configuracoes/empresa");
    return { ok: true, situacao: await situacaoDoCertificado() };
  });
}

export async function removerCertificadoAcao() {
  return executarComAcesso("tela.configuracoes.usuarios", "editar", async () => {
    await removerCertificado();
    revalidatePath("/configuracoes/empresa");
    return { ok: true };
  });
}
