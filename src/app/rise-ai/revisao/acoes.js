"use server";

import { revalidatePath } from "next/cache";

import { aprovarConhecimento, criarConhecimento, editarConhecimento, rejeitarConhecimento } from "@/lib/riseAi/conhecimento";
import { carregarConversa, mensagemParaTela } from "@/lib/riseAi/conversas";
import { ErroDeUso } from "@/lib/riseAi/erros";
import { camposDoFormulario, codigosDoTexto } from "@/lib/riseAi/formularios";
import { marcarRevisada } from "@/lib/riseAi/revisao";
import { aprovarSugestao, gerarSugestaoParaMensagem, proporCorrecao, rejeitarSugestao } from "@/lib/riseAi/sugestoes";
import { executarComoAdministrador } from "../administrador";

/**
 * Ações da Revisão e do conhecimento. TODAS passam por `executarComoAdministrador` (que confere o administrador no
 * servidor antes de qualquer leitura). Finas: a regra mora em `src/lib/riseAi/`, que já é testado.
 */

const atualizarTelas = () => revalidatePath("/rise-ai/revisao");

/** `assunto`, `conteudo`, `produtos` (códigos separados por vírgula) e `fonte` são opcionais: em branco = não editou. */
export async function aprovarSugestaoAcao(id, formData) {
  return executarComoAdministrador(async (sessao) => {
    const { produtos, ...textos } = camposDoFormulario(formData, ["assunto", "conteudo", "fonte", "produtos"]);
    const edicao = { ...textos, ...(produtos ? { produtos: codigosDoTexto(produtos) } : {}) };
    await aprovarSugestao(id, { usuario: sessao.usuario, edicao: Object.keys(edicao).length ? edicao : null });
    atualizarTelas();
    return {};
  });
}

export async function rejeitarSugestaoAcao(id, formData) {
  return executarComoAdministrador(async (sessao) => {
    await rejeitarSugestao(id, { usuario: sessao.usuario, motivo: formData.get("motivo") });
    atualizarTelas();
    return {};
  });
}

/** Pede a sugestão da IA para uma resposta sinalizada (a automática pode ter falhado). Reaproveita a pendente. */
export async function gerarSugestaoAcao(mensagemId) {
  return executarComoAdministrador(async () => {
    await gerarSugestaoParaMensagem(mensagemId);
    atualizarTelas();
    return {};
  });
}

export async function proporCorrecaoAcao(formData) {
  return executarComoAdministrador(async (sessao) => {
    await proporCorrecao({
      mensagemId: String(formData.get("mensagemId") ?? "").trim() || null,
      problema: formData.get("problema"),
      regra: formData.get("regra"),
      produtos: codigosDoTexto(formData.get("produtos")),
      fonte: formData.get("fonte"),
      usuario: sessao.usuario,
    });
    atualizarTelas();
    return {};
  });
}

export async function marcarRevisadaAcao(id) {
  return executarComoAdministrador(async (sessao) => {
    await marcarRevisada(id, sessao.usuario);
    atualizarTelas();
    return {};
  });
}

/** A conversa de qualquer pessoa, com as mensagens prontas para a tela: o administrador lê tudo na Revisão. */
export async function carregarConversaParaRevisaoAcao(id) {
  return executarComoAdministrador(async (sessao) => {
    const conversa = await carregarConversa(id, { usuario: sessao.usuario, administrador: true });
    if (!conversa) throw new ErroDeUso("Conversa não encontrada.");
    return {
      conversa: { id: conversa.id, titulo: conversa.titulo, usuario: conversa.usuario, criadaEm: conversa.criadoEm.toISOString() },
      mensagens: conversa.mensagens.map(mensagemParaTela),
    };
  });
}

/** "Novo conhecimento": o dono escreve a nota. Com "aprovar" marcado já vale nas respostas; sem, fica como rascunho. */
export async function criarConhecimentoAcao(formData) {
  return executarComoAdministrador(async (sessao) => {
    const aprovar = formData.get("aprovar") === "on";
    await criarConhecimento({
      assunto: formData.get("assunto"),
      conteudo: formData.get("conteudo"),
      categoria: formData.get("categoria"),
      fonte: formData.get("fonte"),
      produtos: codigosDoTexto(formData.get("produtos")),
      visibilidade: formData.get("visibilidade") === "PUBLICO" ? "PUBLICO" : "ADMIN",
      status: aprovar ? "APROVADO" : "RASCUNHO",
      criadoPor: sessao.usuario,
      aprovadoPor: aprovar ? sessao.usuario : null,
    });
    atualizarTelas();
    return {};
  });
}

/** Editar sobe a versão; numa nota aprovada, quem edita passa a ser quem a aprova (`editarConhecimento`). */
export async function editarConhecimentoAcao(id, formData) {
  return executarComoAdministrador(async (sessao) => {
    await editarConhecimento(
      id,
      {
        assunto: String(formData.get("assunto") ?? ""),
        conteudo: String(formData.get("conteudo") ?? ""),
        categoria: String(formData.get("categoria") ?? ""),
        fonte: String(formData.get("fonte") ?? ""),
        produtos: codigosDoTexto(formData.get("produtos")),
        visibilidade: formData.get("visibilidade") === "PUBLICO" ? "PUBLICO" : "ADMIN",
      },
      { usuario: sessao.usuario },
    );
    atualizarTelas();
    return {};
  });
}

export async function aprovarConhecimentoAcao(id) {
  return executarComoAdministrador(async (sessao) => {
    await aprovarConhecimento(id, { usuario: sessao.usuario });
    atualizarTelas();
    return {};
  });
}

export async function rejeitarConhecimentoAcao(id) {
  return executarComoAdministrador(async () => {
    await rejeitarConhecimento(id);
    atualizarTelas();
    return {};
  });
}
