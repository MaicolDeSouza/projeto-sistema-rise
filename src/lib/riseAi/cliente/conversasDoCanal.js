import { prisma } from "@/lib/db";

/**
 * A conversa de um CLIENTE (canal LOJA) no banco. Usa as mesmas tabelas do Rise AI (`ConversaIA`, `MensagemIA`), para a
 * Revisao do dia e as sugestoes valerem tambem aqui; o usuario de banco do servico so alcanca as linhas deste canal
 * (politicas em sqlDoPapel.js), e nao apaga nem reescreve mensagem.
 *
 * O visitante nao tem login: a conversa e da SESSAO do navegador (`usuario = loja:<sessaoId>`), e uma sessao parada ha
 * mais de 24 horas abre outra conversa.
 */

const UM_DIA_MS = 24 * 60 * 60 * 1000;
const usuarioDe = (sessaoId) => `loja:${sessaoId}`;

/**
 * O que o modelo le das mensagens gravadas: so os PARES pergunta + resposta valida, na ordem. Fica de fora a resposta
 * marcada com erro e a pergunta que ficou sem resposta (os dois modelos falharam, o orcamento acabou no meio): com ela,
 * a rodada seguinte mandaria ao modelo duas mensagens do visitante seguidas, e a segunda responderia tambem a primeira.
 * Na tela da Revisao as duas continuam aparecendo; isto e so o que volta ao modelo.
 *
 * @param {{ papel: "USUARIO" | "ASSISTENTE", conteudo: string, avisos?: string[], estruturado?: object }[]} mensagens em ordem
 * @returns {{ papel: "usuario" | "assistente", conteudo: string }[]}
 */
export function historicoParaOModelo(mensagens) {
  const validas = mensagens.filter((mensagem) => !(mensagem.papel === "ASSISTENTE" && mensagem.avisos?.includes("erro")));
  const historico = [];
  validas.forEach((mensagem, indice) => {
    if (mensagem.papel === "USUARIO") {
      if (validas[indice + 1]?.papel === "ASSISTENTE") historico.push({ papel: "usuario", conteudo: mensagem.conteudo });
      return;
    }
    if (historico.at(-1)?.papel !== "usuario") return;
    // Os codigos que a resposta mostrou: e o que deixa o modelo entender "tem um mais barato?" na mensagem seguinte.
    const mostrados = (mensagem.estruturado?.cartoes ?? []).map((cartao) => cartao.sku).filter(Boolean);
    historico.push({ papel: "assistente", conteudo: mostrados.length ? `${mensagem.conteudo}\n[produtos mostrados: ${mostrados.join(", ")}]` : mensagem.conteudo });
  });
  return historico;
}

export function criarConversasDoCanal() {
  return {
    /**
     * A conversa em curso da sessao (ou uma nova) e o historico que o modelo vai ler.
     * @returns {Promise<{ id: string, nova: boolean, historico: { papel: "usuario" | "assistente", conteudo: string }[] }>}
     */
    async abrirConversa({ canal, sessaoId, titulo, agora = Date.now() }) {
      const usuario = usuarioDe(sessaoId);
      const emCurso = await prisma.conversaIA.findFirst({
        where: { canal, usuario, atualizadoEm: { gte: new Date(agora - UM_DIA_MS) } },
        orderBy: { atualizadoEm: "desc" },
        include: { mensagens: { orderBy: [{ criadoEm: "asc" }, { id: "asc" }] } },
      });
      if (!emCurso) {
        const criada = await prisma.conversaIA.create({ data: { canal, usuario, perfil: "PUBLICO", titulo: String(titulo || "Visitante da loja").slice(0, 80) } });
        return { id: criada.id, nova: true, historico: [] };
      }
      return { id: emCurso.id, nova: false, historico: historicoParaOModelo(emCurso.mensagens) };
    },

    /** A pergunta, JA mascarada: o original nunca e gravado. */
    async gravarPergunta(conversaId, textoMascarado, { mascarados = [] } = {}) {
      const mensagem = await prisma.mensagemIA.create({ data: { conversaId, papel: "USUARIO", conteudo: textoMascarado, estruturado: { mascarados } } });
      await prisma.conversaIA.update({ where: { id: conversaId }, data: { atualizadoEm: new Date() } });
      return mensagem.id;
    },

    /** @returns {Promise<string>} o id da mensagem (o visitante avalia por ele) */
    async gravarResposta(conversaId, { texto, estruturado = {}, provedor = null, modelo = null, motivoDaReserva = null, uso = null, custo = null, duracaoMs = null, avisos = [] }) {
      const mensagem = await prisma.mensagemIA.create({
        data: {
          conversaId,
          papel: "ASSISTENTE",
          conteudo: texto,
          estruturado,
          provedor,
          modelo,
          motivoDaReserva,
          tokensEntrada: uso?.entrada ?? null,
          tokensSaida: uso?.saida ?? null,
          custoUsd: custo?.usd ?? null,
          custoBrl: custo?.brl ?? null,
          duracaoMs,
          avisos,
        },
      });
      return mensagem.id;
    },

    /** 👍 ou 👎 do visitante numa resposta DA SESSAO DELE. `false` (sem dizer por que) em qualquer outro caso. */
    async avaliar(mensagemId, sessaoId, nota) {
      if (nota !== 1 && nota !== -1) return false;
      const mensagem = await prisma.mensagemIA.findFirst({
        where: { id: String(mensagemId ?? ""), papel: "ASSISTENTE", conversa: { usuario: usuarioDe(sessaoId) } },
        select: { id: true },
      });
      if (!mensagem) return false;
      await prisma.mensagemIA.update({ where: { id: mensagem.id }, data: { avaliacao: nota, avaliadoPor: "visitante", avaliadoEm: new Date() } });
      return true;
    },
  };
}
