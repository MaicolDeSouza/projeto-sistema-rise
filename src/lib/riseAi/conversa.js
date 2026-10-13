import { prisma } from "@/lib/db";
import { garantirCotacaoDoDia } from "@/lib/cotacaoDoDia";

import { registrarChamadaDoProvedor } from "./auditoria";
import { lerChave, lerConfiguracao } from "./configuracao";
import { recuperarConhecimento, textoDoConhecimentoParaPrompt } from "./conhecimento";
import { criarConversa, gravarMensagem } from "./conversas";
import { ErroDeUso, OrcamentoEsgotado, RespostaInterrompida } from "./erros";
import { definicoesParaProvedor, executarFerramenta } from "./ferramentas/index";
import { criarLimitador } from "./limite";
import { mascararDadosPessoais } from "./mascarar";
import { custoDaChamada } from "./modelos";
import { estimarCustoMaximoBrl, liquidarReserva, reservarOrcamento } from "./orcamento";
import { limparTextoParaOCliente, pedidoParaOCliente } from "./modoCliente";
import { ehEnderecoSeguro } from "./textoSeguro";
import { mensagemDeConhecimento, montarSistema } from "./prompt";
import { registrarResposta } from "./paradas";
import { ErroDoProvedor, MOTIVO_PARADA, ehErroDeProvedor } from "./provedores/contrato";
import { criarProvedor as criarProvedorReal } from "./provedores/index";
import { provedorDisponivel as provedorDisponivelReal } from "./provedores/saude";
import { cortarHistorico, estimarTokens, produtosCitados, tituloDaConversa } from "./resposta";

/**
 * O laço da conversa do Rise AI (spec §5.4): recebe a pergunta, monta o contexto, escolhe o provedor (o padrão, ou a
 * reserva quando o padrão falha), roda o laço de ferramentas NO RISE e devolve a resposta com os cartões de produto,
 * o modelo que respondeu e o custo.
 *
 * O que este arquivo garante, porque a spec e o dono pediram:
 *  - o texto do usuário é MASCARADO (telefone, e-mail, CPF/CNPJ) antes de ser guardado e antes de sair para qualquer
 *    provedor;
 *  - o modelo só alcança o banco pelas ferramentas validadas (`executarFerramenta`), no máximo `maxChamadasDeFerramenta`
 *    por resposta;
 *  - os cartões de produto saem dos DADOS que as ferramentas devolveram, nunca do texto do modelo;
 *  - nunca duas vozes numa resposta: a reserva só assume enquanto nenhum texto da rodada atual chegou à tela;
 *  - cada mensagem registra provedor, modelo, motivo da reserva, tokens, custo e duração.
 */

const MAXIMO_DA_PERGUNTA = 8000;
/// O que cada resultado de ferramenta pode ocupar no contexto do modelo (um modelo pequeno tem pouco espaço).
const MAXIMO_DO_RESULTADO = 12000;

/// Conversas com uma resposta em andamento neste processo: uma por conversa, senão as duas respostas se embaralham.
const emAndamento = new Set();

let limitadorPadrao = null;
let taxaDoLimitador = 0;
function limitadorDaConfiguracao(config) {
  if (!limitadorPadrao || taxaDoLimitador !== config.taxaPorUsuarioPorMinuto) {
    taxaDoLimitador = config.taxaPorUsuarioPorMinuto;
    limitadorPadrao = criarLimitador({ porMinuto: taxaDoLimitador });
  }
  return limitadorPadrao;
}

const arredondar = (valor, casas) => Math.round(valor * 10 ** casas) / 10 ** casas;

/** Uma falha de provedor, com a informação de que dependem a reserva: algum texto desta rodada já está na tela? */
class FalhaNoProvedor extends Error {
  constructor(causa, textoEmitido) {
    super(causa.message);
    this.causa = causa;
    this.textoEmitido = textoEmitido;
  }
}

/**
 * Os dois relógios de uma tentativa: o do PRIMEIRO TOKEN (rearmado a cada chamada ao provedor, desarmado no primeiro
 * pedaço de texto) e o TOTAL da resposta. Estourar qualquer um cancela a chamada pelo `sinal`, e o adaptador a traduz
 * em erro de `tempo`. A parada pedida pela pessoa (`sinalDeParada`, o botão Parar) aborta o MESMO sinal, mas com o motivo
 * `interrompida`: o adaptador a traduz em erro de `interrompida`, que não aciona a reserva.
 */
function criarRelogio({ primeiroTokenMs, totalMs }, sinalDeParada = null) {
  const controle = new AbortController();
  let doPrimeiro = null;
  const doTotal = setTimeout(() => controle.abort(), totalMs);
  const aoParar = () => controle.abort(MOTIVO_PARADA);
  if (sinalDeParada?.aborted) aoParar();
  else sinalDeParada?.addEventListener("abort", aoParar, { once: true });
  return {
    sinal: controle.signal,
    armarPrimeiroToken() {
      clearTimeout(doPrimeiro);
      doPrimeiro = setTimeout(() => controle.abort(), primeiroTokenMs);
    },
    primeiroTokenChegou() {
      clearTimeout(doPrimeiro);
    },
    encerrar() {
      clearTimeout(doPrimeiro);
      clearTimeout(doTotal);
      sinalDeParada?.removeEventListener("abort", aoParar);
    },
  };
}

/** O produto como a tela mostra: sem custo nem localização, que o cartão de uma ferramenta de administrador pode trazer. */
function cartaoDaTela(item) {
  const { sku, id, nome, marca, modelo, preco, estoque, estoqueLidoEm, temNaLoja, urlLoja, urlRise, tipo } = item;
  return { sku, id, nome, marca, modelo, preco, estoque, estoqueLidoEm, temNaLoja, urlLoja, urlRise, tipo };
}

function limitarTexto(texto) {
  return texto.length > MAXIMO_DO_RESULTADO ? `${texto.slice(0, MAXIMO_DO_RESULTADO)}… (resultado cortado)` : texto;
}

const FERRAMENTAS_QUE_TRAZEM_PRODUTO = new Set(["buscarProdutos", "buscarProdutosSimilares", "consultarProduto"]);

/**
 * Uma tentativa completa com UM provedor: chama, executa as ferramentas que ele pedir, chama de novo, até a resposta
 * final. Lança `FalhaNoProvedor` se o provedor falhar (a reserva decide o que fazer) e o erro cru se o defeito for nosso.
 */
async function rodarLaco({ id, modelo, provedor, config, sistema, mensagens, perfil, usuario, pode, aoEvento, conversaId, agoraDoOrcamento, sinalDeParada, internet = false, pesquisar }) {
  const relogio = criarRelogio(config.tempoLimite, sinalDeParada);
  const trabalho = [...mensagens];
  const ferramentas = definicoesParaProvedor(perfil, { internet });
  const trilha = [];
  const cartoes = new Map();
  // As fontes da pesquisa na internet, sem repetir o endereço: o que a tela mostra embaixo da resposta.
  const fontes = new Map();
  const avisos = new Set();
  let chamadasFeitas = 0;
  let quebradasSeguidas = 0;
  let limiteAtingido = false;
  let buscouSemResultado = false;
  let tokensEntrada = 0;
  let tokensSaida = 0;
  let usd = 0;
  let brl = 0;
  let custoCompleto = true;
  let textoNaTela = false;
  // O texto que a rodada em curso ja escreveu: e o que fica gravado se a pessoa apertar Parar.
  let textoDaRodada = "";
  let final = null;

  /** A resposta cortada pelo Parar: com o texto parcial e o que ja gastou (a chamada cortada nao devolve o uso: estima pelos caracteres). */
  const interromper = (chamadaEmCurso) => {
    let uso = { entrada: tokensEntrada, saida: tokensSaida };
    let custo = custoCompleto ? { usd, brl } : null;
    if (chamadaEmCurso) {
      const entrada = estimarTokens(sistema) + estimarTokens(JSON.stringify(trabalho)) + estimarTokens(JSON.stringify(ferramentas));
      const saida = estimarTokens(textoDaRodada);
      uso = { entrada: tokensEntrada + entrada, saida: tokensSaida + saida };
      const daRodada = custoDaChamada({ provedor: id, modelo, tokensEntrada: entrada, tokensSaida: saida });
      custo = custo && daRodada ? { usd: usd + daRodada.usd, brl: brl + daRodada.brl } : null;
    }
    if (custo) custo = { usd: arredondar(custo.usd, 6), brl: arredondar(custo.brl, 4) };
    return new RespostaInterrompida({ textoParcial: chamadaEmCurso ? textoDaRodada : "", uso, custo, trilha, cartoes: [...cartoes.values()], fontes: [...fontes.values()] });
  };

  try {
    // Margem sobre o limite de ferramentas: depois dele a chamada vai sem ferramentas e o modelo só pode responder.
    const maximoDeRodadas = config.maxChamadasDeFerramenta + 4;
    for (let rodada = 0; rodada < maximoDeRodadas && !final; rodada++) {
      if (sinalDeParada?.aborted) throw interromper(false);
      textoDaRodada = "";
      const inicioDaChamada = Date.now();
      // O dinheiro e separado ANTES de cada chamada paga (spec §3), somando o que as rodadas anteriores DESTA resposta ja custaram
      // (ainda nao gravado na mensagem). Modelo local e sem preco estimam zero e passam sem tocar no banco.
      const estimadoBrl = estimarCustoMaximoBrl({
        provedor: id,
        modelo,
        tokensEntrada: estimarTokens(sistema) + estimarTokens(JSON.stringify(trabalho)) + estimarTokens(JSON.stringify(ferramentas)),
        maxTokensSaida: config.maxTokensResposta,
      });
      const reserva = await reservarOrcamento("INTERNO", estimadoBrl, { dono: conversaId, agora: agoraDoOrcamento, config, jaGastoBrl: brl });
      if (!reserva.ok) {
        throw new OrcamentoEsgotado(reserva.estado, {
          uso: { entrada: tokensEntrada, saida: tokensSaida },
          custo: custoCompleto ? { usd: arredondar(usd, 6), brl: arredondar(brl, 4) } : null,
        });
      }
      relogio.armarPrimeiroToken();
      let resposta;
      try {
        resposta = await provedor.conversar({
          modelo,
          sistema,
          mensagens: trabalho,
          ferramentas: limiteAtingido ? [] : ferramentas,
          maxTokens: config.maxTokensResposta,
          sinal: relogio.sinal,
          aoTexto: (delta) => {
            relogio.primeiroTokenChegou();
            textoNaTela = true;
            textoDaRodada += delta;
            aoEvento("texto", { delta });
          },
        });
      } catch (erro) {
        await registrarChamadaDoProvedor({ provedor: id, modelo, tarefa: "conversa", inicio: inicioDaChamada, erro, mensagens: trabalho.length, ferramentas: ferramentas.length });
        throw erro;
      } finally {
        relogio.primeiroTokenChegou();
        await liquidarReserva(reserva.reservaId);
      }
      await registrarChamadaDoProvedor({
        provedor: id,
        modelo,
        tarefa: "conversa",
        inicio: inicioDaChamada,
        uso: resposta.uso,
        motivoParada: resposta.motivoParada,
        mensagens: trabalho.length,
        ferramentas: ferramentas.length,
      });

      tokensEntrada += resposta.uso?.entrada ?? 0;
      tokensSaida += resposta.uso?.saida ?? 0;
      const custo = custoDaChamada({ provedor: id, modelo, tokensEntrada: resposta.uso?.entrada ?? 0, tokensSaida: resposta.uso?.saida ?? 0 });
      if (custo) {
        usd += custo.usd;
        brl += custo.brl;
      } else {
        custoCompleto = false;
      }

      const chamadas = resposta.chamadasDeFerramenta ?? [];
      if (chamadas.length === 0) {
        final = resposta;
        break;
      }

      // Uma rodada de ferramentas. O que o modelo escreveu antes de chamar não faz parte da resposta: a tela o descarta.
      if (textoNaTela) {
        aoEvento("descartar", {});
        textoNaTela = false;
        textoDaRodada = "";
      }
      quebradasSeguidas = chamadas.some((chamada) => chamada.malformada) ? quebradasSeguidas + 1 : 0;
      if (quebradasSeguidas >= 2) {
        throw new ErroDoProvedor("O modelo errou o formato da ferramenta duas vezes seguidas.", { tipo: "ferramenta_malformada" });
      }

      // `bruto`: o provedor (a Anthropic, com o pensamento assinado) quer a mensagem de volta exatamente como a mandou.
      trabalho.push({
        papel: "assistente",
        conteudo: resposta.texto ?? "",
        chamadas: chamadas.map(({ id: chamadaId, nome, argumentos }) => ({ id: chamadaId, nome, argumentos })),
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
          aoEvento("ferramenta", { nome: chamada.nome, estado: "inicio" });
          // `jaGastoBrl`: o que as rodadas anteriores desta resposta custaram e ainda não está gravado (a pesquisa o soma ao separar o dinheiro).
          const executada = await executarFerramenta(chamada.nome, chamada.argumentos, { perfil, usuario, pode, internet, conversaId, agoraDoOrcamento, config, jaGastoBrl: brl, sinal: sinalDeParada, pesquisar });
          aoEvento("ferramenta", { nome: chamada.nome, estado: "fim", ok: executada.ok });
          trilha.push({ nome: chamada.nome, argumentos: chamada.argumentos, ok: executada.ok, duracaoMs: executada.duracaoMs });
          if (executada.ok) {
            if (chamada.nome === "buscarProdutos" && Array.isArray(executada.resultado) && executada.resultado.length === 0) buscouSemResultado = true;
            if (chamada.nome === "pesquisarNaInternet") {
              for (const fonte of executada.resultado?.fontes ?? []) {
                if (ehEnderecoSeguro(fonte?.url) && !fontes.has(fonte.url)) fontes.set(fonte.url, { titulo: String(fonte.titulo ?? fonte.url).slice(0, 200), url: fonte.url });
              }
            }
            if (FERRAMENTAS_QUE_TRAZEM_PRODUTO.has(chamada.nome)) {
              const itens = Array.isArray(executada.resultado) ? executada.resultado : [executada.resultado];
              for (const item of itens) if (item?.sku && item?.nome) cartoes.set(item.sku, cartaoDaTela(item));
            }
          }
          conteudo = limitarTexto(JSON.stringify(executada.ok ? executada.resultado : { erro: executada.erro }));
        }
        trabalho.push({ papel: "ferramenta", chamadaId: chamada.id, nome: chamada.nome, conteudo });
      }
    }

    if (!final) throw new ErroDoProvedor("O modelo não terminou a resposta depois de várias consultas.", { tipo: "resposta" });
    if (limiteAtingido) avisos.add("limite_de_ferramentas");
    if (final.motivoParada === "max_tokens") avisos.add("resposta_cortada");
    if (final.motivoParada === "recusa") avisos.add("recusa");

    return {
      texto: final.texto ?? "",
      modelo: final.modelo || modelo,
      avisos,
      trilha,
      cartoes: [...cartoes.values()],
      fontes: [...fontes.values()],
      buscouSemResultado,
      uso: { entrada: tokensEntrada, saida: tokensSaida },
      custo: custoCompleto ? { usd: arredondar(usd, 6), brl: arredondar(brl, 4) } : null,
    };
  } catch (erro) {
    // Parar: a chamada em curso foi cortada pela pessoa. Nao e falha do provedor, entao a reserva nao e tentada.
    if (erro?.tipo === "interrompida") throw interromper(true);
    if (ehErroDeProvedor(erro)) throw new FalhaNoProvedor(erro, textoNaTela);
    throw erro;
  } finally {
    relogio.encerrar();
  }
}

/** O texto de erro que a pessoa lê, conforme o que falhou. A mensagem de banco ou de código nunca vai para a tela. */
const emReais = (valor) => `R$ ${Number(valor ?? 0).toFixed(2).replace(".", ",")}`;

function textoDoErro({ erroInesperado, orcamentoEsgotado, semModelo, escolhaReserva, falhaPadrao, falhaReserva }) {
  if (orcamentoEsgotado) {
    const { gastoBrl, tetoBrl } = orcamentoEsgotado.estado;
    return `O orçamento interno do mês acabou (${emReais(gastoBrl)} de ${emReais(tetoBrl)}). Só o administrador pode aumentá-lo em Configurações.`;
  }
  if (erroInesperado) return "Não foi possível responder agora. Tente de novo em instantes.";
  if (semModelo && !escolhaReserva) return "Escolha o modelo padrão do Rise AI em Configurações.";
  if (falhaPadrao?.textoEmitido) return `${falhaPadrao.causa.message} A resposta foi interrompida; tente de novo.`;
  if (falhaReserva) {
    return falhaPadrao
      ? `${falhaPadrao.causa.message} A reserva também falhou: ${falhaReserva.causa.message}`
      : `A reserva falhou: ${falhaReserva.causa.message}`;
  }
  if (falhaPadrao) return `${falhaPadrao.causa.message} Configure um modelo de reserva em Configurações para o Rise AI continuar respondendo.`;
  return "Não foi possível responder agora.";
}

/**
 * @param {{
 *   conversaId?: string | null, texto: string, usuario: string, modo?: "interno" | "cliente" | "auto",
 *   aoEvento?: (nome: string, dados: object) => void,
 *   dependencias?: { configuracao?: object, criarProvedor?: Function, provedorDisponivel?: Function, agora?: () => number, limitador?: { permitir: Function }, agoraDoOrcamento?: () => number, pesquisarNaInternet?: Function }
 * }} pedido
 *   Eventos de `aoEvento`: `inicio`, `texto`, `descartar`, `ferramenta`, `reserva`, `fim`, `erro`.
 * @returns {Promise<{ conversaId: string, mensagem: object }>}  a mensagem do assistente (ou a de erro, com o aviso "erro")
 */
export async function responder({ conversaId = null, texto, usuario, modo = "auto", pode, aoEvento = () => {}, dependencias = {} }) {
  const pergunta = String(texto ?? "").trim();
  // `cliente` = a equipe pediu um texto para ENVIAR a um cliente ("escreva a resposta para o cliente"): roda com o perfil
  // cliente (so dado publico), sem internet e sem as respostas anteriores da IA. `auto` decide pela frase do pedido.
  const modoFinal = modo === "auto" ? (pedidoParaOCliente(pergunta) ? "cliente" : "interno") : modo === "cliente" ? "cliente" : "interno";
  const perfil = modoFinal === "cliente" ? "publico" : "admin";
  if (!pergunta) throw new ErroDeUso("Escreva a pergunta.");
  if (pergunta.length > MAXIMO_DA_PERGUNTA) throw new ErroDeUso("A pergunta passa de 8.000 caracteres.");

  // Síncrono, antes de qualquer espera: duas chamadas seguidas na mesma conversa não passam as duas.
  let ocupada = null;
  let desregistrar = () => {};
  if (conversaId) {
    if (emAndamento.has(conversaId)) throw new ErroDeUso("Espere a resposta anterior terminar.");
    emAndamento.add(conversaId);
    ocupada = conversaId;
  }

  try {
    const inicio = Date.now();
    // A cotacao do dolar do dia (PTAX) entra nas contas de custo e de orcamento; nunca lanca e, sem rede, vale a fixa.
    await garantirCotacaoDoDia();
    const config = dependencias.configuracao ?? (await lerConfiguracao());
    const limitador = dependencias.limitador ?? limitadorDaConfiguracao(config);
    if (!limitador.permitir(usuario, dependencias.agora?.() ?? Date.now())) {
      throw new ErroDeUso("Muitas perguntas seguidas: espere um minuto.");
    }

    const { texto: perguntaMascarada, mascarados } = mascararDadosPessoais(pergunta);

    let conversa;
    let anteriores = [];
    if (conversaId) {
      conversa = await prisma.conversaIA.findUnique({
        where: { id: conversaId },
        include: { mensagens: { orderBy: [{ criadoEm: "asc" }, { id: "asc" }] } },
      });
      // Quem não é dono recebe a mesma resposta de quem pediu uma conversa que não existe.
      if (!conversa || conversa.usuario !== usuario) throw new ErroDeUso("Conversa não encontrada.");
      anteriores = conversa.mensagens;
    } else {
      // A conversa e sempre da equipe (ADMIN no banco); o que muda no modo cliente e o perfil das FERRAMENTAS desta resposta.
      conversa = await criarConversa({ usuario, perfil: "ADMIN", titulo: tituloDaConversa(perguntaMascarada) });
      emAndamento.add(conversa.id);
      ocupada = conversa.id;
    }

    // O histórico que o modelo vê: o texto de cada resposta como o modelo o escreveu, sem as mensagens de erro, cortado
    // para caber no contexto e sempre começando por uma mensagem do usuário.
    // No modo cliente o historico leva SO o que a equipe escreveu: as respostas anteriores da IA podem ter custo e fornecedor,
    // e o texto para o cliente nao pode herdar nada disso.
    const historico = cortarHistorico(
      anteriores
        .filter((mensagem) => !(mensagem.papel === "ASSISTENTE" && (mensagem.avisos?.includes("erro") || modoFinal === "cliente")))
        .map((mensagem) => ({ papel: mensagem.papel === "USUARIO" ? "usuario" : "assistente", conteudo: mensagem.conteudo })),
      config.contextoMaxTokens,
    );
    while (historico.length && historico[0].papel !== "usuario") historico.shift();

    await gravarMensagem(conversa.id, { papel: "USUARIO", conteudo: perguntaMascarada, estruturado: { mascarados } });

    let notas = [];
    try {
      notas = await recuperarConhecimento({ texto: perguntaMascarada, perfil });
    } catch (erro) {
      // Sem o conhecimento a resposta sai pior, mas sai.
      console.error("[rise-ai] falha ao recuperar o conhecimento:", erro);
    }
    const mensagens = [...historico];
    const doConhecimento = mensagemDeConhecimento(textoDoConhecimentoParaPrompt(notas));
    if (doConhecimento) mensagens.push(doConhecimento);
    mensagens.push({ papel: "usuario", conteudo: perguntaMascarada });

    // O botao Parar (`POST /api/rise-ai/parar`) aborta este controle; a conversa so tem id depois de criada.
    const parada = new AbortController();
    desregistrar = registrarResposta(conversa.id, usuario, parada);
    // A internet é do chat da equipe e do interruptor: o modo cliente nunca pesquisa, mesmo com o interruptor ligado.
    const internet = Boolean(config.internet) && modoFinal === "interno";
    const sistema = montarSistema({ modo: modoFinal, promptInterno: config.prompts?.interno ?? null, promptCliente: config.prompts?.atendimento ?? null, internet });
    const criar =
      dependencias.criarProvedor ??
      (async (provedorId) => criarProvedorReal(provedorId, { endpoint: config.endpoints?.[provedorId], chave: await lerChave(provedorId) }));
    const disponivel = dependencias.provedorDisponivel ?? provedorDisponivelReal;

    const escolhaPadrao = config.padrao;
    const escolhaReserva = config.reserva?.modelo ? config.reserva : null;
    let escolhaFinal = escolhaPadrao;

    /** Cria o provedor e roda o laço; `verificarSaude` só no padrão (a reserva é a última saída: tenta mesmo assim). */
    async function tentar(escolha, { motivoDaReserva = null, verificarSaude = false } = {}) {
      escolhaFinal = escolha;
      if (motivoDaReserva) aoEvento("reserva", { motivo: motivoDaReserva, provedor: escolha.provedor, modelo: escolha.modelo });
      let provedor;
      try {
        provedor = await criar(escolha.provedor);
        if (verificarSaude && !(await disponivel(provedor))) {
          throw new ErroDoProvedor("O modelo padrão não respondeu ao teste de conexão.", { tipo: "padrao_indisponivel" });
        }
      } catch (erro) {
        if (ehErroDeProvedor(erro)) throw new FalhaNoProvedor(erro, false);
        throw erro;
      }
      aoEvento("inicio", { conversaId: conversa.id, provedor: escolha.provedor, modelo: escolha.modelo, modo: modoFinal });
      return rodarLaco({ id: escolha.provedor, modelo: escolha.modelo, provedor, config, sistema, mensagens, perfil, usuario, pode, aoEvento, conversaId: conversa.id, agoraDoOrcamento: dependencias.agoraDoOrcamento?.() ?? Date.now(), sinalDeParada: parada.signal, internet, pesquisar: dependencias.pesquisarNaInternet });
    }

    let resultado = null;
    let motivoDaReserva = null;
    let falhaPadrao = null;
    let falhaReserva = null;
    let erroInesperado = null;
    let orcamentoEsgotado = null;
    let interrompida = null;
    const semModelo = !escolhaPadrao.modelo;
    try {
      if (semModelo) {
        motivoDaReserva = "padrao_sem_modelo";
      } else {
        try {
          resultado = await tentar(escolhaPadrao, { verificarSaude: true });
        } catch (erro) {
          if (!(erro instanceof FalhaNoProvedor)) throw erro;
          falhaPadrao = erro;
        }
      }
      // Reserva: só quando o padrão falhou SEM texto na tela (nunca duas vozes numa resposta) ou nem tentou.
      if (!resultado && !falhaPadrao?.textoEmitido) {
        if (falhaPadrao) motivoDaReserva = falhaPadrao.causa.tipo ?? "resposta";
        if (escolhaReserva) {
          try {
            resultado = await tentar(escolhaReserva, { motivoDaReserva });
          } catch (erro) {
            if (!(erro instanceof FalhaNoProvedor)) throw erro;
            falhaReserva = erro;
          }
        }
      }
    } catch (erro) {
      if (erro instanceof OrcamentoEsgotado) {
        orcamentoEsgotado = erro;
      } else if (erro instanceof RespostaInterrompida) {
        interrompida = erro;
      } else {
        console.error("[rise-ai] falha inesperada ao responder:", erro);
        erroInesperado = erro;
      }
    }

    const duracaoMs = Date.now() - inicio;

    // Parar: grava o que a resposta ja escreveu, marcado, com o custo ESTIMADO (a chamada cortada nao devolveu o uso).
    if (interrompida) {
      let textoParcial = interrompida.textoParcial;
      if (modoFinal === "cliente") textoParcial = limparTextoParaOCliente(textoParcial, { linksPermitidos: interrompida.cartoes.map((cartao) => cartao.urlLoja) }).texto;
      const { citados } = produtosCitados(textoParcial, interrompida.cartoes);
      const mensagem = await gravarMensagem(conversa.id, {
        papel: "ASSISTENTE",
        conteudo: textoParcial,
        estruturado: {
          modo: modoFinal,
          produtos: citados.map(({ sku, nome, urlLoja }) => ({ sku, nome, urlLoja })),
          fontes: interrompida.fontes,
          conhecimentoUsado: notas.map(({ id, assunto }) => ({ id, assunto })),
          ferramentas: interrompida.trilha,
          mascarados,
          custoEstimado: true,
        },
        provedor: escolhaFinal.provedor,
        modelo: escolhaFinal.modelo || null,
        motivoDaReserva,
        tokensEntrada: interrompida.uso.entrada,
        tokensSaida: interrompida.uso.saida,
        custoUsd: interrompida.custo?.usd ?? null,
        custoBrl: interrompida.custo?.brl ?? null,
        duracaoMs,
        avisos: [],
        interrompida: true,
      });
      await prisma.conversaIA.update({ where: { id: conversa.id }, data: { atualizadoEm: new Date() } });
      aoEvento("fim", { mensagemId: mensagem.id, uso: interrompida.uso, custo: interrompida.custo, produtos: mensagem.estruturado.produtos, avisos: [], interrompida: true, custoEstimado: true });
      return { conversaId: conversa.id, mensagem };
    }

    if (!resultado) {
      const mensagemDeErro = textoDoErro({ erroInesperado, orcamentoEsgotado, semModelo, escolhaReserva, falhaPadrao, falhaReserva });
      // O que a resposta ja gastou antes de o teto barrar a proxima rodada e dinheiro de verdade: fica registrado.
      const gasto = orcamentoEsgotado?.custo && orcamentoEsgotado.uso?.entrada > 0 ? orcamentoEsgotado : null;
      const mensagem = await gravarMensagem(conversa.id, {
        papel: "ASSISTENTE",
        conteudo: mensagemDeErro,
        estruturado: { erro: true, mascarados },
        provedor: escolhaFinal.provedor,
        modelo: escolhaFinal.modelo || null,
        motivoDaReserva,
        duracaoMs,
        avisos: orcamentoEsgotado ? ["erro", "orcamento_esgotado"] : ["erro"],
        ...(gasto ? { tokensEntrada: gasto.uso.entrada, tokensSaida: gasto.uso.saida, custoUsd: gasto.custo.usd, custoBrl: gasto.custo.brl } : {}),
      });
      await prisma.conversaIA.update({ where: { id: conversa.id }, data: { atualizadoEm: new Date() } });
      aoEvento("erro", { mensagem: mensagemDeErro });
      return { conversaId: conversa.id, mensagem };
    }

    // Texto para o cliente: sem markdown e sem nenhum endereco que nao tenha vindo de uma ferramenta (so o `urlLoja` vale).
    let textoFinal = resultado.texto;
    const avisos = new Set(resultado.avisos);
    if (modoFinal === "cliente") {
      const limpo = limparTextoParaOCliente(resultado.texto, { linksPermitidos: resultado.cartoes.map((cartao) => cartao.urlLoja) });
      textoFinal = limpo.texto;
      for (const aviso of limpo.avisos) avisos.add(aviso);
    }
    const { citados } = produtosCitados(textoFinal, resultado.cartoes);
    if (resultado.buscouSemResultado && citados.length === 0) avisos.add("sem_resultado");

    const mensagem = await gravarMensagem(conversa.id, {
      papel: "ASSISTENTE",
      conteudo: textoFinal,
      // O texto inteiro do modelo fica no `conteudo`. Aqui vai so o que a tela precisa para desenhar com seguranca: os produtos
      // citados (nome, codigo e o link montado pelo codigo a partir do cadastro) e, depois, as fontes da pesquisa.
      estruturado: {
        modo: modoFinal,
        produtos: citados.map(({ sku, nome, urlLoja }) => ({ sku, nome, urlLoja })),
        fontes: resultado.fontes,
        conhecimentoUsado: notas.map(({ id, assunto }) => ({ id, assunto })),
        ferramentas: resultado.trilha,
        mascarados,
      },
      provedor: escolhaFinal.provedor,
      modelo: resultado.modelo,
      motivoDaReserva,
      tokensEntrada: resultado.uso.entrada,
      tokensSaida: resultado.uso.saida,
      custoUsd: resultado.custo?.usd ?? null,
      custoBrl: resultado.custo?.brl ?? null,
      duracaoMs,
      avisos: [...avisos],
    });
    await prisma.conversaIA.update({ where: { id: conversa.id }, data: { atualizadoEm: new Date() } });
    aoEvento("fim", { mensagemId: mensagem.id, uso: resultado.uso, custo: resultado.custo, produtos: mensagem.estruturado.produtos, avisos: [...avisos] });
    return { conversaId: conversa.id, mensagem };
  } finally {
    desregistrar();
    if (ocupada) emAndamento.delete(ocupada);
  }
}
