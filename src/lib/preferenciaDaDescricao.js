import { MODELOS_DA_DESCRICAO } from "@/lib/ia/modelosDaDescricao";

/**
 * A ultima escolha de PROMPT e de MODELO na janela "Criar descricao" (pedido do dono em 13/10/2026: "fique salvo no
 * local storage a ultima escolha do prompt e modelo usado para gerar a descricao"). Guardada no navegador, e nao no
 * produto: e preferencia de quem usa, e vale para todo produto. Ao abrir a janela, ela volta com o que ele usou da
 * ultima vez em vez de voltar ao padrao.
 *
 * Cada acesso tem try/catch (janela privada ou armazenamento cheio so tiram a memoria; a janela funciona igual).
 * Lido ao ABRIR a janela (um evento), nao na renderizacao: `localStorage` nao existe no servidor, e o valor inicial
 * do estado tem de ser o mesmo nos dois lados.
 */
const CHAVE = "rise:descricao:preferencia";

const ehTexto = (valor) => typeof valor === "string" && valor.length > 0 && valor.length <= 100;

/**
 * Confere o que veio do armazenamento: um id de modelo so vale se estiver na lista atual (o modelo pode ter saido), e o
 * do prompt e so um texto curto (quem decide se ele ainda existe e a lista de prompts, na hora de aplicar).
 * Qualquer outra coisa vira `null`, e a janela usa o padrao.
 */
export function conferirPreferenciaDaDescricao(bruto) {
  const dados = bruto && typeof bruto === "object" && !Array.isArray(bruto) ? bruto : {};
  return {
    promptId: ehTexto(dados.promptId) ? dados.promptId : null,
    modeloId: MODELOS_DA_DESCRICAO.some((modelo) => modelo.id === dados.modeloId) ? dados.modeloId : null,
  };
}

/** O que o dono usou da ultima vez, ou `{ promptId: null, modeloId: null }` (nunca escolheu, ou sem armazenamento). */
export function lerPreferenciaDaDescricao() {
  try {
    return conferirPreferenciaDaDescricao(JSON.parse(window.localStorage.getItem(CHAVE) ?? "null"));
  } catch {
    return conferirPreferenciaDaDescricao(null);
  }
}

/** Guarda a escolha. `parcial` leva so o que mudou (`{ promptId }` ou `{ modeloId }`); o outro fica como estava. */
export function gravarPreferenciaDaDescricao(parcial) {
  try {
    const atual = lerPreferenciaDaDescricao();
    window.localStorage.setItem(CHAVE, JSON.stringify(conferirPreferenciaDaDescricao({ ...atual, ...parcial })));
  } catch {
    // Sem armazenamento a janela so nao lembra da escolha.
  }
}
