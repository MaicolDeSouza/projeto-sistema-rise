import { cotacaoDoDolar, definirCotacaoDoDia, idadeDaCotacaoDoDia } from "@/lib/cotacaoDolar";
import { hojeEmSaoPaulo, lerPtax, somarDias, urlPtax } from "@/lib/ferramentas/cotacao";

/**
 * A cotacao do dolar do dia para o gasto da IA em reais (spec §3: "cotacao pelo PTAX do dia, com a fixa como reserva se
 * o BC nao responder"). So servidor: faz uma consulta ao Banco Central e guarda o resultado em `cotacaoDolar.js`, de onde
 * o resto do sistema (que e sincrono) a le.
 *
 * Nunca lanca: o Banco Central fora do ar, 403 a partir da VPS ou resposta estranha deixam a cotacao como estava (a fixa,
 * ou o PTAX que ja se tinha), e o gasto continua sendo calculado.
 */

const VALE_MS = 60 * 60 * 1000; // o PTAX muda uma vez por dia util
const ESPERA_APOS_FALHA_MS = 5 * 60 * 1000; // BC fora do ar: nao insistir a cada pergunta do chat
const TEMPO_LIMITE_MS = 8000;
const JANELA_EM_DIAS = 7; // sempre acha o ultimo boletim, mesmo depois de fim de semana ou feriado

let falhouEm = null;
let avisou = false;

/**
 * @param {{ buscar?: typeof fetch, agora?: number }} [opcoes]  `buscar` e `agora` so o teste troca
 * @returns {Promise<ReturnType<typeof cotacaoDoDolar>>}
 */
export async function garantirCotacaoDoDia({ buscar = fetch, agora = Date.now() } = {}) {
  const idade = idadeDaCotacaoDoDia(agora);
  if (idade !== null && idade >= 0 && idade < VALE_MS) return cotacaoDoDolar(agora);
  if (falhouEm !== null && agora - falhouEm >= 0 && agora - falhouEm < ESPERA_APOS_FALHA_MS) return cotacaoDoDolar(agora);

  try {
    const hoje = hojeEmSaoPaulo(new Date(agora));
    const resposta = await buscar(urlPtax({ inicio: somarDias(hoje, -JANELA_EM_DIAS), fim: hoje }), {
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(TEMPO_LIMITE_MS),
    });
    if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`);
    const lido = lerPtax(JSON.parse(await resposta.text()));
    if (!lido.ok) throw new Error(lido.erro);
    const ultimo = lido.serie[lido.serie.length - 1];
    definirCotacaoDoDia({ valor: ultimo.venda, data: ultimo.data }, agora);
    falhouEm = null;
    avisou = false;
  } catch (erro) {
    falhouEm = agora;
    if (!avisou) {
      avisou = true;
      console.warn("[cotacao] PTAX do dia indisponivel, valendo a anterior ou a fixa:", erro?.message);
    }
  }
  return cotacaoDoDolar(agora);
}

/** So para o teste: esquece a falha e o aviso. */
export function esquecerFalhaDaCotacao() {
  falhouEm = null;
  avisou = false;
}
