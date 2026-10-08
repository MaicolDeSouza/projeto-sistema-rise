/**
 * Regras puras da conversa com o Mercado Livre na publicacao (fase 3): o corpo da criacao e a
 * leitura das respostas. Sem imports, sem rede: a publicacao, as acoes e o teste leem o mesmo arquivo.
 */

/**
 * O corpo do `POST /items` (e do validador): o item da previa com as fotos ja subidas, por id. A
 * previa guarda so os nomes; o ML so aceita a foto pelo id que o upload devolveu (ou por URL publica,
 * que o Rise no PC nao tem). Devolve um objeto novo: a previa continua com os nomes.
 */
export function corpoDaCriacao(item, idsDasFotos) {
  return { ...item, pictures: (Array.isArray(idsDasFotos) ? idsDasFotos : []).map((id) => ({ id })) };
}

/**
 * O que o ML disse ao recusar: cada causa de `cause[]` (`type` "error" ou "warning") com o codigo
 * entre parenteses, que e o que se procura na documentacao. Sem `cause`, a `message` (ou `error`).
 * @returns {{ erros: string[], avisos: string[] }}
 */
export function causasDoML(dados) {
  const causas = Array.isArray(dados?.cause) ? dados.cause : [];
  const texto = (causa) => {
    const mensagem = String(causa?.message ?? "").trim();
    const codigo = String(causa?.code ?? "").trim();
    return [mensagem, codigo ? `(${codigo})` : ""].filter(Boolean).join(" ");
  };
  const erros = causas.filter((causa) => causa?.type !== "warning").map(texto).filter(Boolean);
  const avisos = causas.filter((causa) => causa?.type === "warning").map(texto).filter(Boolean);
  if (erros.length === 0 && causas.length === 0) {
    const geral = String(dados?.message ?? dados?.error ?? "").trim();
    if (geral) erros.push(geral);
  }
  return { erros, avisos };
}

const SITUACOES = { active: "ATIVA", paused: "PAUSADA", closed: "ENCERRADA" };

/** O `status` do item no ML no enum `SituacaoCanal` do Rise. */
export function situacaoDoItem(statusML) {
  return SITUACOES[statusML] ?? "DESCONHECIDA";
}

/**
 * Recado de uma resposta recusada do ML, para a tela: o que foi recusado, o HTTP e as causas.
 * @param {{ status: number, dados: object }} resposta
 * @param {string} oQue "a criação do anúncio", "a descrição"...
 */
export function textoDaRecusaML(resposta, oQue) {
  const { erros } = causasDoML(resposta?.dados);
  const status = resposta?.status ?? "sem status";
  return erros.length > 0
    ? `O Mercado Livre recusou ${oQue} (HTTP ${status}): ${erros.join("; ")}`
    : `O Mercado Livre recusou ${oQue} (HTTP ${status}).`;
}
