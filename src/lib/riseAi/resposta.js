import { normalizar, palavrasDoTermo } from "@/lib/texto";

/**
 * Funções puras sobre o texto da conversa: descobrir quais produtos o
 * texto cita, dar título à conversa, cortar o histórico para caber no contexto e achar um JSON no meio de texto.
 * Sem banco, sem rede e sem imports de Next: o laço da conversa, as sugestões e o teste usam o mesmo arquivo.
 */

const compactar = (texto) => texto.replace(/[^a-z0-9]/g, "");

/**
 * Quais dos produtos candidatos o texto cita. Um produto é citado quando o texto traz o CÓDIGO dele, ou metade ou mais
 * das palavras que SÓ ELE tem no nome (entre os candidatos). "placa" e "ch340", que o Uno e o Nano dividem, não provam
 * nada — mas "Nano" prova o Nano. Sem palavra própria (nomes quase iguais), valem todas as palavras do nome.
 *
 * @template {{ sku?: string, nome?: string }} T
 * @param {string} texto
 * @param {T[]} candidatos
 * @returns {{ citados: T[], outros: T[] }}
 */
export function produtosCitados(texto, candidatos) {
  const doTexto = new Set(palavrasDoTermo(texto));
  const palavrasDosNomes = candidatos.map((candidato) => palavrasDoTermo(candidato.nome ?? ""));
  const quantosTem = new Map();
  for (const palavras of palavrasDosNomes) {
    for (const palavra of palavras) quantosTem.set(palavra, (quantosTem.get(palavra) ?? 0) + 1);
  }

  const citados = [];
  const outros = [];
  candidatos.forEach((candidato, indice) => {
    const codigo = compactar(normalizar(candidato.sku ?? ""));
    const porCodigo = Boolean(codigo) && doTexto.has(codigo);

    const proprias = palavrasDosNomes[indice].filter((palavra) => quantosTem.get(palavra) === 1);
    const base = proprias.length ? proprias : palavrasDosNomes[indice];
    const presentes = base.filter((palavra) => doTexto.has(palavra)).length;
    const porNome = base.length > 0 && presentes / base.length >= 0.5;

    (porCodigo || porNome ? citados : outros).push(candidato);
  });
  return { citados, outros };
}

const LIMITE_DO_TITULO = 60;

/** Os 60 primeiros caracteres da pergunta, numa linha só (sem chamar IA para dar nome). */
export function tituloDaConversa(pergunta) {
  const limpo = String(pergunta ?? "").replace(/\s+/g, " ").trim();
  if (!limpo) return "Nova conversa";
  return limpo.length > LIMITE_DO_TITULO ? `${limpo.slice(0, LIMITE_DO_TITULO).trimEnd()}…` : limpo;
}

/** 1 token a cada 4 caracteres: aproximação que basta para cortar histórico (não precisa de tokenizer). */
export const estimarTokens = (texto) => Math.ceil(String(texto ?? "").length / 4);

const tokensDaMensagem = (mensagem) =>
  estimarTokens(String(mensagem.conteudo ?? "") + (mensagem.chamadas?.length ? JSON.stringify(mensagem.chamadas) : ""));

/**
 * As mensagens mais RECENTES que cabem em `maxTokens`. Resultado de ferramenta nunca fica sem a mensagem do assistente
 * que o pediu: o corte que começaria por uma `ferramenta` solta a descarta. Quem monta o pedido ainda garante que a
 * lista comece por uma mensagem do usuário (alguns provedores recusam começar pelo assistente).
 */
export function cortarHistorico(mensagens, maxTokens) {
  let total = 0;
  let inicio = mensagens.length;
  for (let indice = mensagens.length - 1; indice >= 0; indice--) {
    const custo = tokensDaMensagem(mensagens[indice]);
    if (total + custo > maxTokens) break;
    total += custo;
    inicio = indice;
  }
  const corte = mensagens.slice(inicio);
  while (corte.length && corte[0].papel === "ferramenta") corte.shift();
  return corte;
}

/** O primeiro objeto JSON do texto (com ou sem cerca de código ao redor), ou `null`. Respeita `}` dentro de string. */
export function extrairJson(texto) {
  const entrada = String(texto ?? "");
  for (let inicio = entrada.indexOf("{"); inicio !== -1; inicio = entrada.indexOf("{", inicio + 1)) {
    let profundidade = 0;
    let emTexto = false;
    let escapado = false;
    for (let indice = inicio; indice < entrada.length; indice++) {
      const letra = entrada[indice];
      if (emTexto) {
        if (escapado) escapado = false;
        else if (letra === "\\") escapado = true;
        else if (letra === '"') emTexto = false;
        continue;
      }
      if (letra === '"') emTexto = true;
      else if (letra === "{") profundidade++;
      else if (letra === "}") {
        profundidade--;
        if (profundidade === 0) {
          try {
            return JSON.parse(entrada.slice(inicio, indice + 1));
          } catch {
            break; // não era JSON: tenta a partir do próximo "{"
          }
        }
      }
    }
  }
  return null;
}
