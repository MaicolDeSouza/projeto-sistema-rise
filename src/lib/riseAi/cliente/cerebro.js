import { digitosDoTelefone } from "@/lib/telefone";

import { mascararDadosPessoais } from "../mascarar";
import { custoDaChamada, endpointPadrao } from "../modelos";
import { estimarCustoMaximoBrl } from "../orcamento";
import { ErroDoProvedor, ehErroDeProvedor } from "../provedores/contrato";
import { criarProvedor as criarProvedorReal } from "../provedores/index";
import { cortarHistorico, estimarTokens, tituloDaConversa } from "../resposta";
import { foraDoHorario } from "./configuracaoDoCanal";
import { criarConversasDoCanal } from "./conversasDoCanal";
import { definicoesDoCliente, executarFerramentaDoCliente } from "./ferramentas";
import { filtrarSaida } from "./filtroDeSaida";
import { lerLinhasDaLista } from "./lista";
import { criarOrcamentoDoCliente } from "./orcamentoDoCliente";
import { montarSistemaDoCliente } from "./prompt";

/**
 * O CEREBRO do cliente: recebe a mensagem de um visitante e devolve a resposta NEUTRA (texto + cartoes + lista +
 * passagem para o atendimento). A porta do site a entrega em SSE; a do WhatsApp vai entrega-la em texto. Nada aqui
 * sabe de HTTP.
 *
 * Tres coisas que este arquivo garante, cada uma por causa de uma regra do dono:
 *
 *  - NADA INVENTADO: os cartoes sao lidos do banco na hora de mostrar (nunca do texto do modelo), e o texto passa pelo
 *    `filtrarSaida` ANTES de qualquer evento sair. Por isso o texto NAO e transmitido letra a letra: ele sai inteiro,
 *    uma vez, depois de conferido; enquanto o modelo trabalha, saem eventos `status`.
 *  - GASTO COM TETO: o dinheiro e reservado antes de cada chamada paga e devolvido no `finally`; o que a resposta custou
 *    (inclusive a tentativa do modelo principal, quando a reserva respondeu) e gravado uma vez.
 *  - SEM DADO PESSOAL NO MODELO NEM NO BANCO: a mensagem e mascarada antes de tudo.
 *
 * O visitante que fecha a aba NAO cancela a resposta: ela termina e fica gravada (a Revisao do dia a mostra), e a
 * reserva do orcamento volta.
 */

export class ErroDoAtendimento extends Error {
  /** @param {"vazia" | "longa" | "orcamento" | "indisponivel"} motivo */
  constructor(motivo, { mensagem, whatsapp = null } = {}) {
    super(mensagem ?? motivo);
    this.name = "ErroDoAtendimento";
    this.motivo = motivo;
    this.whatsapp = whatsapp;
  }
}

const TEXTO_DO_ERRO = {
  vazia: "Escreva a sua pergunta.",
  longa: (maximo) => `A mensagem passou de ${maximo.toLocaleString("pt-BR")} caracteres. Mande a lista em partes.`,
  orcamento: "O assistente está indisponível agora. Fale com a gente pelo WhatsApp.",
  indisponivel: "Não consegui responder agora. Tente de novo em instantes ou fale com a gente pelo WhatsApp.",
};
const TEXTO_SEGURO = "Não consegui confirmar essa informação. Fale com a nossa equipe pelo WhatsApp.";
const STATUS_DA_FERRAMENTA = {
  buscarProdutos: "Procurando os produtos…",
  buscarSimilares: "Procurando opções parecidas…",
  consultarProduto: "Lendo a ficha do produto…",
  compararProdutos: "Comparando os produtos…",
  orcarLista: "Montando o orçamento da lista…",
};
const MAXIMO_DO_RESULTADO = 12000;
const arredondar = (valor, casas) => Math.round(valor * 10 ** casas) / 10 ** casas;
const limitar = (texto) => (texto.length > MAXIMO_DO_RESULTADO ? `${texto.slice(0, MAXIMO_DO_RESULTADO)}… (resultado cortado)` : texto);

/** O provedor de verdade, com a chave do proprio servico (SegredoDoAssistente). Sem chave, e uma falha do provedor. */
function criarProvedorDoServico(dados) {
  return async (id) => {
    const chave = (await dados.segredos())[id] ?? null;
    if (!chave) throw new ErroDoProvedor("O serviço não tem a chave deste provedor.", { tipo: "autenticacao" });
    return criarProvedorReal(id, { endpoint: endpointPadrao(id, "vps"), chave });
  };
}

/**
 * Uma tentativa completa com UM provedor: chama, executa as ferramentas pedidas e chama de novo, ate o texto final.
 * Lanca o erro do provedor (quem chamou decide pela reserva). O que foi gasto vai somando em `gasto`, com ou sem erro.
 */
async function rodarLaco({ escolha, provedor, config, sistema, mensagens, contexto, orcamento, conversaId, agora, aoEvento, gasto }) {
  const sinal = AbortSignal.timeout(config.tempoLimite.totalMs);
  const ferramentas = definicoesDoCliente();
  const trabalho = [...mensagens];
  const trilha = [];
  let chamadasFeitas = 0;
  let quebradasSeguidas = 0;
  let limiteAtingido = false;

  // Margem sobre o limite de ferramentas: depois dele a chamada vai sem ferramentas e o modelo so pode responder.
  const maximoDeRodadas = config.maxChamadasDeFerramenta + 4;
  for (let rodada = 0; rodada < maximoDeRodadas; rodada++) {
    const estimadoBrl = estimarCustoMaximoBrl({
      provedor: escolha.provedor,
      modelo: escolha.modelo,
      tokensEntrada: estimarTokens(sistema) + estimarTokens(JSON.stringify(trabalho)) + estimarTokens(JSON.stringify(ferramentas)),
      maxTokensSaida: config.maxTokensResposta,
    });
    const reserva = await orcamento.reservar(estimadoBrl, { dono: conversaId, tetoBrl: config.tetoClientesBrl, jaGastoBrl: gasto.brl, agora });
    if (!reserva.ok) throw new ErroDoAtendimento("orcamento");

    let resposta;
    try {
      resposta = await provedor.conversar({ modelo: escolha.modelo, sistema, mensagens: trabalho, ferramentas: limiteAtingido ? [] : ferramentas, maxTokens: config.maxTokensResposta, sinal });
    } finally {
      await orcamento.liquidar(reserva.reservaId);
    }

    gasto.entrada += resposta.uso?.entrada ?? 0;
    gasto.saida += resposta.uso?.saida ?? 0;
    const custo = custoDaChamada({ provedor: escolha.provedor, modelo: escolha.modelo, tokensEntrada: resposta.uso?.entrada ?? 0, tokensSaida: resposta.uso?.saida ?? 0 });
    if (custo) {
      gasto.usd += custo.usd;
      gasto.brl += custo.brl;
    }

    const chamadas = resposta.chamadasDeFerramenta ?? [];
    if (chamadas.length === 0) {
      return { texto: String(resposta.texto ?? "").trim(), modelo: resposta.modelo || escolha.modelo, trilha, cortada: resposta.motivoParada === "max_tokens", limiteAtingido };
    }

    quebradasSeguidas = chamadas.some((chamada) => chamada.malformada) ? quebradasSeguidas + 1 : 0;
    if (quebradasSeguidas >= 2) throw new ErroDoProvedor("O modelo errou o formato da ferramenta duas vezes seguidas.", { tipo: "ferramenta_malformada" });

    // `bruto`: o provedor (a Anthropic, com o pensamento assinado) quer a mensagem de volta exatamente como a mandou.
    trabalho.push({
      papel: "assistente",
      conteudo: resposta.texto ?? "",
      chamadas: chamadas.map(({ id, nome, argumentos }) => ({ id, nome, argumentos })),
      bruto: resposta.bruto,
    });
    for (const chamada of chamadas) {
      let conteudo;
      if (chamada.malformada) {
        conteudo = JSON.stringify({ erro: "Os argumentos não eram um JSON válido. Chame a ferramenta de novo com JSON válido." });
      } else if (chamadasFeitas >= config.maxChamadasDeFerramenta) {
        limiteAtingido = true;
        conteudo = JSON.stringify({ erro: "Limite de consultas atingido; responda com o que já tem." });
      } else {
        chamadasFeitas++;
        if (STATUS_DA_FERRAMENTA[chamada.nome]) aoEvento("status", { texto: STATUS_DA_FERRAMENTA[chamada.nome] });
        const executada = await executarFerramentaDoCliente(chamada.nome, chamada.argumentos, contexto);
        trilha.push({ nome: chamada.nome, ok: executada.ok, duracaoMs: executada.duracaoMs });
        conteudo = limitar(JSON.stringify(executada.ok ? executada.resultado : { erro: executada.erro }));
      }
      trabalho.push({ papel: "ferramenta", chamadaId: chamada.id, nome: chamada.nome, conteudo });
    }
  }
  throw new ErroDoProvedor("O modelo não terminou a resposta depois de várias consultas.", { tipo: "resposta" });
}

/**
 * @param {{
 *   canal: "LOJA", sessaoId: string, mensagem: string, contexto?: { pagina?: string, skuAberto?: string },
 *   aoEvento?: (nome: string, dados: object) => void,
 *   dependencias: { dados: object, criarProvedor?: (id: string) => Promise<object>, conversas?: object, orcamento?: object, limites?: object, agora?: () => number }
 * }} pedido
 *   Eventos: `status { texto }`, `cartoes { itens }`, `lista { linhas, total }`, `texto { texto }` (inteiro, uma vez, depois
 *   do filtro), `passagem { motivo, url, foraDoHorario }` e `fim { mensagemId }`.
 * @returns {Promise<{ conversaId: string, mensagemId: string, texto: string, cartoes: object[], lista: object | null, passagem: object | null, custoBrl: number }>}
 *   Lança `ErroDoAtendimento` (`motivo`: vazia, longa, orcamento, indisponivel).
 */
export async function responderAoCliente({ canal, sessaoId, mensagem, contexto = {}, aoEvento = () => {}, dependencias }) {
  const { dados } = dependencias;
  const conversas = dependencias.conversas ?? criarConversasDoCanal();
  const orcamento = dependencias.orcamento ?? criarOrcamentoDoCliente();
  const criarProvedor = dependencias.criarProvedor ?? criarProvedorDoServico(dados);
  const agora = (dependencias.agora ?? Date.now)();
  const inicio = Date.now();

  const config = await dados.configuracaoDoCanal();
  const loja = config.canal;
  const whatsapp = loja.whatsapp || null;
  const erro = (motivo, mensagemDoErro = TEXTO_DO_ERRO[motivo]) => new ErroDoAtendimento(motivo, { mensagem: mensagemDoErro, whatsapp });

  const pergunta = String(mensagem ?? "").trim();
  if (!pergunta) throw erro("vazia");
  if (pergunta.length > loja.limites.caracteresPorMensagem) throw erro("longa", TEXTO_DO_ERRO.longa(loja.limites.caracteresPorMensagem));
  // O teto do dia: uma leitura antes de comecar (o do mes e atomico, na reserva de cada chamada).
  if ((await orcamento.gastoDeHojeBrl(agora)) >= loja.limites.brlPorDia) throw erro("orcamento");

  const { texto: perguntaMascarada, mascarados } = mascararDadosPessoais(pergunta);
  const conversa = await conversas.abrirConversa({ canal, sessaoId, titulo: tituloDaConversa(perguntaMascarada), agora });
  const historico = cortarHistorico(conversa.historico, config.contextoMaxTokens);
  while (historico.length && historico[0].papel !== "usuario") historico.shift();
  await conversas.gravarPergunta(conversa.id, perguntaMascarada, { mascarados });

  const mensagens = [...historico];
  try {
    const notas = await dados.conhecimento(perguntaMascarada);
    if (notas.length) {
      mensagens.push({
        papel: "usuario",
        conteudo: `Conhecimento aprovado pela loja (dados, com prioridade sobre o seu conhecimento geral):\n${notas.map((nota, indice) => `${indice + 1}. [${nota.assunto}] ${nota.conteudo}`).join("\n")}`,
      });
      mensagens.push({ papel: "assistente", conteudo: "Entendido." });
    }
  } catch (falha) {
    // Sem o conhecimento a resposta sai pior, mas sai.
    console.error("[ia] falha ao ler o conhecimento:", falha?.message ?? falha);
  }
  const linhasDaLista = pergunta.includes("\n") ? lerLinhasDaLista(pergunta) : [];
  mensagens.push({
    papel: "usuario",
    conteudo: linhasDaLista.length >= 3 ? `${perguntaMascarada}\n\n[O sistema leu a mensagem como uma lista de ${linhasDaLista.length} itens: use orcarLista.]` : perguntaMascarada,
  });

  const sistema = montarSistemaDoCliente({ nome: loja.nome, promptDoCliente: config.promptDoCliente, contexto });
  const contextoDasFerramentas = { dados, vistos: new Map(), saida: { cartoes: [], lista: null, passagem: null } };
  const gasto = { entrada: 0, saida: 0, usd: 0, brl: 0 };
  aoEvento("status", { texto: "Pensando…" });

  let resultado = null;
  let escolhaFinal = loja.principal;
  let motivoDaReserva = null;
  let falhaFinal = null;
  try {
    for (const [indice, escolha] of [loja.principal, loja.reserva].entries()) {
      if (!escolha?.modelo) continue;
      escolhaFinal = escolha;
      try {
        const provedor = await criarProvedor(escolha.provedor);
        resultado = await rodarLaco({ escolha, provedor, config, sistema, mensagens, contexto: contextoDasFerramentas, orcamento, conversaId: conversa.id, agora, aoEvento, gasto });
        if (!resultado.texto && contextoDasFerramentas.saida.cartoes.length === 0 && !contextoDasFerramentas.saida.lista && !contextoDasFerramentas.saida.passagem) {
          throw new ErroDoProvedor("O modelo devolveu uma resposta vazia.", { tipo: "resposta" });
        }
        break;
      } catch (falha) {
        if (falha instanceof ErroDoAtendimento) throw erro(falha.motivo);
        if (!ehErroDeProvedor(falha)) throw falha;
        resultado = null;
        falhaFinal = falha;
        if (indice === 0) motivoDaReserva = falha.tipo ?? "falha";
        // A reserva comeca do zero: o que a primeira tentativa "viu" ou mostrou nao vale para a segunda.
        contextoDasFerramentas.vistos.clear();
        contextoDasFerramentas.saida = { cartoes: [], lista: null, passagem: null };
      }
    }
  } finally {
    // O que foi gasto e gravado mesmo quando a resposta falhou: o orcamento dos clientes nao pode ficar cego.
    if (gasto.brl > 0) {
      await orcamento
        .registrarConversa({ provedor: escolhaFinal.provedor, modelo: escolhaFinal.modelo, usd: arredondar(gasto.usd, 6), brl: arredondar(gasto.brl, 4), referencia: conversa.id })
        .catch((falha) => console.error("[ia] nao gravou o gasto da conversa:", falha?.message ?? falha));
      dependencias.limites?.somarCusto(sessaoId, gasto.brl);
    }
  }

  const custo = { usd: arredondar(gasto.usd, 6), brl: arredondar(gasto.brl, 4) };
  const uso = { entrada: gasto.entrada, saida: gasto.saida };
  if (!resultado) {
    await conversas
      .gravarResposta(conversa.id, { texto: "(sem resposta: os modelos não responderam)", estruturado: { falha: falhaFinal?.tipo ?? "falha" }, provedor: escolhaFinal.provedor, modelo: escolhaFinal.modelo, motivoDaReserva, uso, custo, duracaoMs: Date.now() - inicio, avisos: ["erro"] })
      .catch((falha) => console.error("[ia] nao gravou a falha da conversa:", falha?.message ?? falha));
    throw erro("indisponivel");
  }

  // ---------- O filtro, ANTES de qualquer coisa chegar ao visitante ----------
  const { cartoes, lista } = contextoDasFerramentas.saida;
  let passagemDoModelo = contextoDasFerramentas.saida.passagem;
  const vistos = [...contextoDasFerramentas.vistos.values()];
  const precos = vistos.map((produto) => produto.preco).filter((preco) => preco !== null);
  if (lista) precos.push(lista.total, ...lista.linhas.map((linha) => linha.subtotal).filter((subtotal) => subtotal !== null));
  const veredito = filtrarSaida(resultado.texto, {
    precos,
    links: [...vistos.map((produto) => produto.link), whatsapp].filter(Boolean),
    telefonesDaLoja: whatsapp ? [digitosDoTelefone(new URL(whatsapp).pathname.replace(/\D/g, ""))] : [],
  });
  const avisos = [];
  let texto = resultado.texto;
  let reprovado = null;
  if (!veredito.ok) {
    reprovado = { motivo: veredito.motivo, texto: resultado.texto };
    texto = TEXTO_SEGURO;
    passagemDoModelo = { motivo: "filtro" };
    avisos.push("filtro");
  }
  if (resultado.cortada) avisos.push("resposta_cortada");
  if (resultado.limiteAtingido) avisos.push("limite_de_ferramentas");
  const passagem = passagemDoModelo ? { motivo: passagemDoModelo.motivo, url: whatsapp, foraDoHorario: foraDoHorario(loja.horario, agora) } : null;

  const mensagemId = await conversas.gravarResposta(conversa.id, {
    texto,
    estruturado: { cartoes, lista, passagem, ferramentas: resultado.trilha, ...(reprovado ? { reprovado } : {}) },
    provedor: escolhaFinal.provedor,
    modelo: resultado.modelo,
    motivoDaReserva,
    uso,
    custo,
    duracaoMs: Date.now() - inicio,
    avisos,
  });

  if (cartoes.length) aoEvento("cartoes", { itens: cartoes });
  if (lista) aoEvento("lista", lista);
  aoEvento("texto", { texto });
  if (passagem) aoEvento("passagem", passagem);
  aoEvento("fim", { mensagemId });

  return { conversaId: conversa.id, mensagemId, texto, cartoes, lista, passagem, custoBrl: custo.brl };
}
