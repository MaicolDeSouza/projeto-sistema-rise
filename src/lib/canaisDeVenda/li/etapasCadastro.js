/**
 * As etapas do cadastro automatico na Loja Integrada (pedido do dono em 24/10/2026: "cria anuncio na LI
 * PAUSADO, sincroniza com Bling, apos sincronizar com Bling ativa o anuncio; caso algum passo fique falho
 * mostra '!'"). Sem imports: a tela, o envio e o teste leem o mesmo arquivo.
 *
 * Cada etapa LE o estado antes de escrever (o vinculo no Bling, o estoque e o `ativo` da loja): e isso,
 * e nao uma lista de etapas feitas, que torna o "Completar o cadastro" seguro sem repetir escrita.
 *
 * O estoque inicial e uma excecao consciente a regra "o Rise nunca escreve estoque na LI": ligar o
 * produto a loja no Bling NAO faz o Bling mandar o saldo (medido em 07/10/2026; so um movimento de
 * estoque dispara), e o 100108 ficou ativo na loja sem controle de estoque. O Rise grava o saldo do Bling
 * UMA vez; dai em diante o Bling manda a cada movimento.
 */

export const ETAPAS_DO_CADASTRO_LI = ["criar", "ligar_bling", "estoque", "ativar", "gravar"];

export const ROTULO_DA_ETAPA_LI = {
  criar: "Criar o anúncio pausado",
  ligar_bling: "Ligar à Loja Integrada no Bling",
  estoque: "Gravar o estoque na Loja Integrada",
  ativar: "Ativar o anúncio",
  gravar: "Gravar no Rise",
};

/**
 * O corpo do `PUT /produto_estoque/{id}` (medido em 24/10/2026). `situacao_sem_estoque: -1` e o que os
 * produtos cujo estoque o Bling mandou tem (indisponivel quando zera); o PUT sem ela mantem o valor que
 * estava, e o produto novo nasce com 0. Saldo negativo do Bling (reservas) vira 0.
 */
export function corpoDoEstoqueInicialLI(saldo) {
  const numero = Number(saldo);
  const quantidade = saldo === null || saldo === undefined || !Number.isFinite(numero) ? 0 : Math.max(0, Math.round(numero));
  return { gerenciado: true, quantidade, situacao_sem_estoque: -1 };
}

/**
 * O que falta num produto que ja esta na LI, pelo que se leu da loja e do Bling. `ligar_bling` so com o
 * produto no Bling sem o canal da LI: ligado a OUTRO produto da loja, ou fora do Bling, o dono resolve no
 * Bling (o editor ja avisa). Sem leitura do Bling (`situacaoNoBling` nulo), o vinculo nao entra.
 */
export function faltaNoCadastroLI({ idExterno, ativo, estoqueGerenciado, situacaoNoBling }) {
  if (!idExterno) return [];
  const falta = [];
  if (situacaoNoBling === "sem_vinculo") falta.push("ligar_bling");
  if (estoqueGerenciado === false) falta.push("estoque");
  if (ativo === false) falta.push("ativar");
  return falta;
}

/**
 * O editor oferece "Completar o cadastro" quando o cadastro falhou numa etapa, ou quando falta o vinculo
 * no Bling ou o estoque. Faltar SO a ativacao nao basta: o dono pode ter pausado o produto de proposito.
 */
export function ofereceCompletar({ falta = [], falhou = false } = {}) {
  return Boolean(falhou) || falta.includes("ligar_bling") || falta.includes("estoque");
}
