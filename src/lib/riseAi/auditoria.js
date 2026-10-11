import { prisma } from "@/lib/db";
import { SERVICO_DO_PROVEDOR } from "./configuracao";

/**
 * Toda chamada a um provedor de IA é uma linha de `LogIntegracao` (o modelo no `endpoint`, status, duração, uso de
 * tokens e erro): é o que permite depurar uma falha depois, e o que o consumo e a comparação de modelos leem.
 * NUNCA o prompt, a pergunta, a resposta nem a chave — só quantas mensagens e ferramentas foram, e o resultado. A
 * mesma regra da auditoria da IA dos anúncios (`src/lib/ia/anuncio.js`).
 *
 * Nunca lança: perder uma linha de log não pode derrubar uma resposta.
 */
export async function registrarChamadaDoProvedor({ provedor, modelo, tarefa, inicio, uso = null, motivoParada = null, erro = null, mensagens = 0, ferramentas = 0 }) {
  const servico = SERVICO_DO_PROVEDOR[provedor];
  if (!servico) return;
  try {
    await prisma.logIntegracao.create({
      data: {
        servico,
        metodo: "POST",
        endpoint: String(modelo ?? ""),
        statusHttp: erro ? (erro.status ?? null) : 200,
        duracaoMs: Date.now() - inicio,
        requestResumo: JSON.stringify({ tarefa, mensagens, ferramentas }),
        responseResumo: JSON.stringify({ uso, motivoParada }),
        erro: erro ? String(erro.message ?? erro).slice(0, 400) : null,
      },
    });
  } catch (falha) {
    console.error("[rise-ai] falha ao gravar LogIntegracao:", falha.message);
  }
}
