import { assinaturaDoRise, normalizarDoRise, normalizarFornecedoresDoRise } from "@/lib/blingSync/campos";

/**
 * Estado do icone do Bling na lista de Produtos: uma cor e, a parte, um selo "?" que diz
 * por que o Rise e o Bling podem estar diferentes. Sem banco e sem rede: a lista, as acoes e
 * o teste leem a mesma regra.
 *
 * Cor e selo sao independentes. A cor diz se o produto ja foi sincronizado alguma vez
 * (cinza = nunca, verde = ja); o selo aparece sobre qualquer das duas.
 *
 * Este arquivo e SO DE SERVIDOR: `iconeBlingDoProduto` usa a assinatura de `campos.js`, que
 * usa `node:crypto`. O navegador recebe o resultado pronto (`{cor, divergente, motivos}`) e o
 * texto do estado mora no proprio componente (`IconeBling.jsx`), que nao importa daqui.
 */

/// Contagem ruim (ausente, texto, NaN) conta 0: o numero vem de um count do banco que a tela
/// passa adiante, e um valor estranho nao pode derrubar a lista inteira com um erro.
function contagemSegura(valor) {
  const numero = Number(valor);
  return Number.isFinite(numero) ? numero : 0;
}

/**
 * @param {object} entrada
 * @param {Date|null} entrada.sincronizadoEm quando o produto foi sincronizado pela ultima vez.
 * @param {string|null} entrada.assinaturaGuardada assinatura dos campos no ultimo envio.
 * @param {string} entrada.assinaturaAtual assinatura dos campos como o Rise os tem agora.
 * @param {number} entrada.pendentes quantos ajustes de estoque ainda nao foram ao Bling.
 * @returns {{cor: "cinza"|"verde", divergente: boolean, motivos: ("campos"|"estoque")[]}}
 */
export function estadoDoIconeBling({ sincronizadoEm, assinaturaGuardada, assinaturaAtual, pendentes }) {
  const sincronizado = Boolean(sincronizadoEm);
  const motivos = [];

  // Sem sincronizacao nao ha o que comparar: nunca enviado nao e "campo mudou".
  if (sincronizado && assinaturaGuardada !== assinaturaAtual) motivos.push("campos");
  if (contagemSegura(pendentes) > 0) motivos.push("estoque");

  return { cor: sincronizado ? "verde" : "cinza", divergente: motivos.length > 0, motivos };
}

/**
 * O que a lista de Produtos carrega a mais, junto da linha do produto, para `iconeBlingDoProduto`:
 * os vinculos de fornecedor (so as colunas que a assinatura le e o CNPJ e o nome do fornecedor) e a
 * CONTAGEM dos ajustes de estoque ainda nao enviados. Sem nenhuma chamada ao Bling: o icone sai so
 * do banco. A ordem dos vinculos e a de `lerProdutoDoRise` (padrao primeiro, depois a criacao):
 * dois vinculos com o mesmo CNPJ viram um so ("fica o primeiro"), e a lista tem que ficar com o
 * MESMO que o envio ficou, senao o icone marcaria divergencia logo depois de sincronizar. Quem mudar
 * a ordem la muda aqui, e o teste "mesmo CNPJ em dois vinculos" avisa.
 */
export const INCLUDE_DO_ICONE_BLING = {
  fornecedores: {
    select: { codigo: true, descricao: true, precoCusto: true, padrao: true, fornecedor: { select: { cnpj: true, nome: true } } },
    orderBy: [{ padrao: "desc" }, { id: "asc" }],
  },
  _count: { select: { movimentosEstoque: { where: { enviadoAoBlingEm: null } } } },
};

/**
 * O estado do icone de UM produto, a partir da linha do Prisma ja carregada com
 * `INCLUDE_DO_ICONE_BLING`. Funcao pura (sem banco e sem rede), e compoe a assinatura do mesmo jeito
 * que o envio a grava (`normalizarDoRise` e `normalizarFornecedoresDoRise` sobre o produto, depois
 * `assinaturaDoRise`): so assim o produto recem sincronizado nao aparece como divergente.
 *
 * Linha sem `fornecedores` conta como sem fornecedor, e sem `_count`, como sem pendente: quem chama
 * tem que carregar os dois, ou o produto que os tem apareceria como divergente.
 *
 * @param {object} produto linha de `Produto` com `fornecedores` e `_count.movimentosEstoque` (so os pendentes).
 * @returns {{cor: "cinza"|"verde", divergente: boolean, motivos: ("campos"|"estoque")[]}}
 */
export function iconeBlingDoProduto(produto) {
  const assinaturaAtual = assinaturaDoRise(normalizarDoRise(produto), normalizarFornecedoresDoRise(produto?.fornecedores));
  return estadoDoIconeBling({
    sincronizadoEm: produto?.blingSincronizadoEm,
    assinaturaGuardada: produto?.blingAssinatura,
    assinaturaAtual,
    pendentes: produto?._count?.movimentosEstoque,
  });
}

// ---------------------------------------------------------------------------
// O que as Server Actions conferem antes de chamar a lib
// ---------------------------------------------------------------------------

/// O id do produto vem do navegador: texto nao vazio. O Prisma le `where: { id: undefined }` como "sem
/// filtro", entao id ausente nao e so um "nao achou"; tipo errado tambem nao pode chegar a consulta.
export function produtoIdValido(valor) {
  return typeof valor === "string" && valor.trim() !== "";
}

/// O deposito vem do navegador: ausente (undefined ou null, o envio escolhe o padrao) ou um inteiro
/// positivo. Texto nao passa, nem o numerico ("12"): quem chama de verdade manda numero, e lancar no
/// deposito errado mexe no saldo de outro lugar sem erro nenhum.
export function depositoIdValido(valor) {
  if (valor === undefined || valor === null) return true;
  return typeof valor === "number" && Number.isSafeInteger(valor) && valor > 0;
}
