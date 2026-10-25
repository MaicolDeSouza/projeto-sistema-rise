import { mascararDadosPessoais } from "@/lib/riseAi/mascarar";

/**
 * O texto dos avisos do Telegram (spec do agente, §5a.7): texto puro, sem `parse_mode`, no maximo 4 linhas, com o
 * trecho de dado de cliente mascarado e cortado, e com `@`, `://` e a barra no comeco da linha neutralizados, para o
 * aviso nunca virar um comando, uma mencao ou um link que nao e nosso. Regras puras: a tela, o worker e o teste leem.
 */

export const LIMITE_DE_LINHAS = 4;
export const LIMITE_DO_TRECHO = 120;

/**
 * `@` vira U+FF20 (o Telegram nao faz mencao), `://` vira `:∕∕` (U+2215, nao vira link) e `/` no comeco de uma
 * linha vira `∕` (nao vira comando). O resto do texto fica como esta.
 */
export function neutralizar(texto) {
  return String(texto ?? "")
    .replace(/@/g, "＠")
    .replace(/:\/\//g, ":∕∕")
    .replace(/(^|\n)\//g, "$1∕");
}

/** Um trecho de texto de terceiro (nome de produto, erro, mensagem): mascarado, numa linha so, cortado e neutralizado. */
export function trechoSeguro(texto, limite = LIMITE_DO_TRECHO) {
  const { texto: mascarado } = mascararDadosPessoais(String(texto ?? ""));
  const numaLinha = mascarado.replace(/\s*\r?\n\s*/g, " ").trim();
  const cortado = numaLinha.length > limite ? `${numaLinha.slice(0, limite)}…` : numaLinha;
  return neutralizar(cortado);
}

/** `1234.5` -> `1.234,50`. */
function formatarReais(valor) {
  const numero = Number(valor);
  if (!Number.isFinite(numero)) return "0,00";
  const [inteiro, centavos] = numero.toFixed(2).split(".");
  return `${inteiro.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${centavos}`;
}

const ESCOPO = { CLIENTES: "dos clientes", INTERNO: "interno" };

/** Cada tipo monta as linhas e diz para onde o botao "Abrir no Rise" leva. `dados` vem de quem calculou o aviso. */
const TIPOS = {
  produtoZerou: ({ id, sku, nome }) => ({
    linhas: [`Produto zerou: ${sku}`, trechoSeguro(nome, 60)],
    caminho: `/produtos/${id}`,
  }),
  orcamento: ({ escopo, estado, percentual, tetoBrl }) => ({
    linhas: [
      `IA: orçamento ${ESCOPO[escopo] ?? escopo} em ${Math.round(Number(percentual))}% do teto de R$ ${formatarReais(tetoBrl)}`,
      ...(estado === "esgotado" ? ["Respostas pagas param até o teto subir."] : []),
    ],
    caminho: "/rise-ai/configuracoes",
  }),
  varreduraPeloPc: ({ fonteNome, pedidoHa }) => ({
    linhas: [`Varredura pelo PC esperando: ${trechoSeguro(fonteNome, 60)}`, `Pedida há ${pedidoHa}; o Rise do PC não responde.`],
    caminho: "/mercados/fontes",
  }),
  varreduraFalhou: ({ fonteNome, erro }) => ({
    linhas: [`Varredura falhou: ${trechoSeguro(fonteNome, 60)}`, trechoSeguro(erro)],
    caminho: "/mercados/fontes",
  }),
  saudeDoRise: ({ rotulo, detalhe }) => ({
    linhas: [`Saúde do Rise: ${trechoSeguro(rotulo, 60)}`, trechoSeguro(detalhe)],
    caminho: "/configuracoes/saude",
  }),
  resumoDoDia: ({ dia, consultas, anotadas, zerados, varreduras, ia }) => ({
    linhas: [
      `Resumo de ${dia}`,
      `Consultas pelo Claude/ChatGPT: ${consultas} (${anotadas} anotadas) · Produtos que zeraram: ${zerados}`,
      `Varreduras: ${varreduras.concluidas} concluídas, ${varreduras.falhas} com erro`,
      `IA no mês: R$ ${formatarReais(ia.gastoBrl)} de R$ ${formatarReais(ia.tetoBrl)}`,
    ],
    caminho: "/rise-ai/revisao",
  }),
};

/**
 * @param {keyof typeof TIPOS} tipo
 * @returns {{ texto: string, caminho: string }} o texto pronto (ja neutralizado inteiro: o `@` de um nome de loja
 *   tambem sai neutro) e o caminho do Rise do botao.
 */
export function mensagemDoAviso(tipo, dados) {
  const montar = TIPOS[tipo];
  if (!montar) throw new Error(`Tipo de aviso desconhecido: ${tipo}`);
  const { linhas, caminho } = montar(dados ?? {});
  const texto = neutralizar(linhas.filter((linha) => linha !== "").slice(0, LIMITE_DE_LINHAS).join("\n"));
  return { texto, caminho };
}

/** O endereco do botao "Abrir no Rise": a `APP_URL_PUBLICA` mais o caminho; `null` sem base (o PC nao tem). */
export function linkAbrirNoRise(base, caminho) {
  const raiz = String(base ?? "").trim().replace(/\/+$/, "");
  if (!raiz) return null;
  return `${raiz}${caminho.startsWith("/") ? "" : "/"}${caminho}`;
}
