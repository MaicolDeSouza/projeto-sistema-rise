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
 *
 * Alguns servicos (os dados fiscais, 09/11/2026: "Many errors. 1 embedded errors, see errorlist property for details")
 * mandam o motivo de verdade em `errorlist` (ou `errors`), com `cause` vazio: lido igual a `cause`, aceitando texto
 * puro ou um objeto de forma desconhecida (entra como JSON curto, para o motivo nunca se perder).
 * @returns {{ erros: string[], avisos: string[] }}
 */
export function causasDoML(dados) {
  const embutidas = [dados?.errorlist, dados?.error_list, dados?.errors].find((lista) => Array.isArray(lista) && lista.length > 0) ?? [];
  const causas = [...(Array.isArray(dados?.cause) ? dados.cause : []), ...embutidas];
  const texto = (causa) => {
    if (typeof causa === "string") return causa.trim();
    const mensagem = String(causa?.message ?? causa?.description ?? "").trim();
    const codigo = String(causa?.code ?? "").trim();
    const campo = String(causa?.field ?? causa?.path ?? "").trim();
    const lido = [mensagem, codigo ? `(${codigo})` : "", campo && !mensagem.includes(campo) ? `[${campo}]` : ""].filter(Boolean).join(" ");
    return lido || (causa && typeof causa === "object" ? JSON.stringify(causa).slice(0, 200) : "");
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
