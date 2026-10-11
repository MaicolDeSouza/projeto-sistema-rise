import { z } from "zod";

import { recuperarConhecimento } from "../conhecimento";

/**
 * Ferramenta do modelo para o conhecimento aprovado. A recuperação principal já entra no prompt antes de a resposta
 * começar (conversa.js); esta cobre o que ela não trouxe — o modelo pode pedir de novo com outras palavras. Serve aos
 * dois perfis: o público só enxerga nota de visibilidade pública.
 */
export const FERRAMENTAS_DE_CONHECIMENTO = [
  {
    nome: "buscarConhecimento",
    descricao:
      "Procura no conhecimento aprovado pela loja (regras, orientações e correções que o dono ensinou) notas sobre um " +
      "assunto. Use quando a pergunta envolver uma recomendação, compatibilidade ou regra da loja. A nota aprovada tem " +
      "prioridade sobre o que você já sabe.",
    perfis: ["admin", "publico"],
    esquema: z.object({ termos: z.string().trim().min(1).max(200).describe("Assunto, em poucas palavras") }),
    async executar({ termos }, contexto) {
      const notas = await recuperarConhecimento({ texto: termos, perfil: contexto.perfil, limite: 5 });
      return notas.map(({ id, assunto, conteudo, produtos }) => ({ id, assunto, conteudo, produtos }));
    },
  },
];
