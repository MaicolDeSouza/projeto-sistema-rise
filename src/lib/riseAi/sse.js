import { ErroDeUso } from "./erros";

/**
 * Server-Sent Events do chat (spec §5.4): `POST /api/rise-ai/conversar` responde um fluxo de eventos (`inicio`, `texto`,
 * `descartar`, `ferramenta`, `reserva`, `fim`, `erro`). Mora aqui, fora da rota, para o teste conferir o encanamento
 * sem subir o Next: formato do evento, erro de uso x erro inesperado e o cliente que fecha a conexão no meio.
 */

/** Um evento SSE. O JSON vai numa linha só (quebra de linha vira `\n` escapado), como o formato exige. */
export function eventoSSE(nome, dados) {
  return `event: ${nome}\ndata: ${JSON.stringify(dados)}\n\n`;
}

const AVISO_GENERICO = "Não foi possível responder agora. Tente de novo em instantes.";

/**
 * O corpo de uma resposta SSE. `executar(enviar)` faz o trabalho e chama `enviar(nome, dados)` a cada evento.
 *
 *  - `ErroDeUso` vira o evento `erro` com a mensagem (a tela mostra o que fazer); qualquer outro erro vira o aviso
 *    genérico e vai ao `aoErroInesperado` (o log do servidor).
 *  - Cliente que fechou a conexão: `enviar` passa a não fazer nada e `executar` TERMINA — a resposta é gravada do mesmo
 *    jeito, e a pessoa a encontra no histórico.
 *
 * @param {(enviar: (nome: string, dados: object) => void) => Promise<void>} executar
 * @param {{ aoErroInesperado?: (erro: unknown) => void }} [opcoes]
 */
export function fluxoDeEventos(executar, { aoErroInesperado = (erro) => console.error("[rise-ai] erro no fluxo da conversa:", erro) } = {}) {
  const codificador = new TextEncoder();
  return new ReadableStream({
    async start(controle) {
      let aberto = true;
      const enviar = (nome, dados) => {
        if (!aberto) return;
        try {
          controle.enqueue(codificador.encode(eventoSSE(nome, dados)));
        } catch {
          aberto = false; // o cliente fechou
        }
      };
      try {
        await executar(enviar);
      } catch (erro) {
        if (erro instanceof ErroDeUso) {
          enviar("erro", { mensagem: erro.message });
        } else {
          aoErroInesperado(erro);
          enviar("erro", { mensagem: AVISO_GENERICO });
        }
      } finally {
        aberto = false;
        try {
          controle.close();
        } catch {
          // já fechado pelo cliente
        }
      }
    },
  });
}
