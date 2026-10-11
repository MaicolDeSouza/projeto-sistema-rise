/**
 * Lê o corpo de uma resposta Server-Sent Events (`POST /api/rise-ai/conversar`) e entrega um evento por vez:
 * `{ nome, dados }`. Puro (só Web Streams e TextDecoder): o chat roda no navegador e o teste, em Node.
 *
 * O que a rede faz com o fluxo e o leitor precisa aguentar: um evento partido entre dois pedaços (ou um caractere
 * acentuado partido ao meio, daí o `stream: true` do decodificador), vários eventos num pedaço só, fim de linha CRLF
 * (proxy) e linha que não é evento (comentário, JSON quebrado), que é ignorada em vez de derrubar a conversa.
 *
 * @param {ReadableStream<Uint8Array>} corpo
 * @returns {AsyncGenerator<{ nome: string, dados: any }>}
 */
export async function* eventosDoFluxo(corpo) {
  const leitor = corpo.getReader();
  const decodificador = new TextDecoder();
  let pendente = "";
  try {
    for (;;) {
      const { done, value } = await leitor.read();
      if (done) break;
      pendente += decodificador.decode(value, { stream: true }).replace(/\r\n/g, "\n");
      let fim = pendente.indexOf("\n\n");
      while (fim !== -1) {
        const evento = lerBloco(pendente.slice(0, fim));
        pendente = pendente.slice(fim + 2);
        if (evento) yield evento;
        fim = pendente.indexOf("\n\n");
      }
    }
    pendente += decodificador.decode().replace(/\r\n/g, "\n");
    const resto = lerBloco(pendente.trim());
    if (resto) yield resto;
  } finally {
    leitor.releaseLock?.();
  }
}

function lerBloco(bloco) {
  let nome = "message";
  const dados = [];
  for (const linha of bloco.split("\n")) {
    if (linha.startsWith("event:")) nome = linha.slice(6).trim();
    else if (linha.startsWith("data:")) dados.push(linha.slice(5).trimStart());
  }
  if (dados.length === 0) return null;
  try {
    return { nome, dados: JSON.parse(dados.join("\n")) };
  } catch {
    return null;
  }
}
