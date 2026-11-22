import { z } from "zod";

import { prisma } from "@/lib/db";
import { listarCaixas } from "@/lib/frete/caixas";
import { cotarFrete, pacoteSugerido } from "@/lib/frete/cotacao";
import { reenviarEmail } from "@/lib/frete/aviso";
import {
  cancelarEtiqueta,
  comprarEtiqueta,
  conferirPacote,
  cotacaoDaPropostaDoPedido,
  lerEnvio,
  lerEnvioDoPedido,
  linkDaEtiqueta,
  listarEnvios,
  salvarRascunhoDoPedido,
} from "@/lib/frete/envios";
import { recalcularLucroDoPedido } from "@/lib/pedidos/banco";
import { obterProvedor, PROVEDOR_PADRAO } from "@/lib/frete/provedores/registro";
import { numeroDoEnvio, servicoCompravel, SITUACAO_DO_ENVIO } from "@/lib/frete/regras";
import { ErroDeFerramenta } from "@/lib/riseAi/ferramentas/erro";

import { acharPedido } from "./pedidosDeVenda.js";

/**
 * O frete pelo MCP (spec 2026-11-20-mcp-do-frete-design.md, pedido do dono em 19/11/2026: "cotação, gerar etiqueta,
 * buscar rastreio do pedido"). A regra mora em `lib/frete/`; aqui so se confere o acesso, acha o pedido ou o envio e
 * monta a resposta.
 *
 * Dado pessoal do cliente NUNCA sai daqui (a mesma regra dos pedidos de venda): do destinatario so o nome e a cidade. A
 * resposta vai para o Claude/ChatGPT da pessoa, fora do Rise; o link do WhatsApp (leva o telefone) fica so na tela.
 */

const LEITURA = { readOnlyHint: true, destructiveHint: false, openWorldHint: false };
const SITUACOES = Object.keys(SITUACAO_DO_ENVIO);

const emTexto = (data) => (data instanceof Date ? data.toISOString() : data ?? null);
const numero = (valor) => (valor === null || valor === undefined ? null : Number(valor));
const cidadeDe = (endereco) => (endereco?.cidade ? `${endereco.cidade}${endereco.uf ? ` (${endereco.uf})` : ""}` : null);
const situacaoDe = (status) => SITUACAO_DO_ENVIO[status]?.texto ?? status;
const servicoDe = (envio) => [envio.transportadoraNome, envio.servicoNome].filter(Boolean).join(" ") || null;
/** O erro do servidor de e-mail pode citar o endereco do cliente ("x@y rejected"): ele nao sai pelo MCP. */
const semEmail = (texto) => (texto ? String(texto).replace(/[^\s<>"'(),;:]+@[^\s<>"'(),;:]+/g, "[e-mail]") : null);

/** Quem ve a lista de Envios ou o pedido de venda le, cota e imprime (o mesmo da tela). */
export function exigirVerEnvios(pode) {
  if (typeof pode === "function" && (pode("tela.envios", "ver") || pode("tela.pedidos", "ver"))) return;
  throw new ErroDeFerramenta("Este login não pode ver os envios.");
}

// ---------------------------------------------------------------------------
// Achar o envio, a caixa e o pedido
// ---------------------------------------------------------------------------

const NAO_ACHADO = "Envio não encontrado: use o número do envio, do pedido ou o rastreio.";

/**
 * O envio por "ENV-0012", pelo rastreio, pelo pedido (o envio vivo dele) ou pelo numero puro do envio, nessa ordem: um
 * numero puro e antes um pedido do Bling (5001) que um envio, e o "ENV-" tira a duvida.
 */
export async function acharEnvio(referencia) {
  const texto = String(referencia ?? "").trim();
  if (!texto) throw new ErroDeFerramenta("Informe o número do envio, do pedido ou o rastreio.");
  const comPrefixo = /^env-?0*(\d{1,9})$/i.exec(texto)?.[1];
  if (comPrefixo) {
    const envio = await prisma.envio.findUnique({ where: { numero: Number(comPrefixo) }, select: { id: true } });
    if (!envio) throw new ErroDeFerramenta(NAO_ACHADO);
    return lerEnvio(envio.id);
  }
  const peloRastreio = await prisma.envio.findFirst({ where: { rastreio: { equals: texto, mode: "insensitive" } }, orderBy: { criadoEm: "desc" }, select: { id: true } });
  if (peloRastreio) return lerEnvio(peloRastreio.id);

  let pedidoId = null;
  try {
    pedidoId = await acharPedido(texto);
  } catch {
    pedidoId = null;
  }
  if (pedidoId) {
    const doPedido = await lerEnvioDoPedido(pedidoId);
    if (!doPedido) throw new ErroDeFerramenta(`O pedido ${texto} não tem envio pelo Rise.`);
    return lerEnvio(doPedido.id);
  }
  if (/^\d{1,9}$/.test(texto)) {
    const envio = await prisma.envio.findUnique({ where: { numero: Number(texto) }, select: { id: true } });
    if (envio) return lerEnvio(envio.id);
  }
  throw new ErroDeFerramenta(NAO_ACHADO);
}

const nomeSemEspaco = (nome) => String(nome ?? "").replace(/\s+/g, "").toLowerCase();

/** A caixa ativa pelo nome ("cx 16x11x3" = "CX 16x11x3"). */
async function caixaPeloNome(nome) {
  const caixas = await listarCaixas({ soAtivas: true });
  const caixa = caixas.find((item) => nomeSemEspaco(item.nome) === nomeSemEspaco(nome));
  if (!caixa) throw new ErroDeFerramenta(`Caixa ${nome} não cadastrada. Caixas: ${caixas.map((item) => item.nome).join(", ") || "nenhuma"}.`);
  return caixa;
}

/** O pedido do Bling com o que a cotacao usa (o ML vai pelo Mercado Envios e a LI pelo Enviali). */
async function pedidoDoBling(referencia) {
  const pedido = await prisma.pedidoDeVenda.findUnique({ where: { id: await acharPedido(referencia) }, include: { itens: { orderBy: { ordem: "asc" } } } });
  if (pedido.origem !== "BLING") throw new ErroDeFerramenta("O envio pelo Rise é só para pedido do Bling.");
  return pedido;
}

// ---------------------------------------------------------------------------
// Cotar
// ---------------------------------------------------------------------------

/** A cotacao de `lib/frete/cotacao.js` como o MCP responde: os que atendem (com o valor a cobrar) e os que nao. */
async function cotar(entrada) {
  const resultado = await cotarFrete(entrada);
  if (!resultado.ok) throw new ErroDeFerramenta(resultado.erros ? Object.values(resultado.erros).join(" ") : resultado.erro);
  const p = resultado.pacote;
  return {
    cotadoEm: resultado.cotadoEm,
    pacote: { caixa: p.caixaNome, pesoKg: p.pesoKg, medidasCm: [p.comprimentoCm, p.larguraCm, p.alturaCm].map(numero), valorDeclarado: p.valorDeclarado },
    servicos: resultado.atendem.map((servico) => ({
      servicoId: servico.servicoId,
      transportadora: servico.transportadora,
      servico: servico.servicoNome,
      preco: servico.preco,
      valorACobrar: servico.valorACobrar,
      prazoDias: servico.prazoDias ?? null,
      compravel: servicoCompravel({ transportadora: servico.transportadora }).ok,
    })),
    naoAtendem: resultado.recusados.map((servico) => ({ transportadora: servico.transportadora, servico: servico.servicoNome, motivo: servico.motivoDaRecusa ?? null })),
  };
}

/** O pacote digitado na chamada: a caixa pelo nome, ou as tres medidas. */
async function pacoteDaChamada({ caixa, comprimentoCm, larguraCm, alturaCm, pesoKg }) {
  if (caixa) return { caixaId: (await caixaPeloNome(caixa)).id, pesoKg };
  return { comprimentoCm, larguraCm, alturaCm, pesoKg };
}

export async function cotarFreteMcp(argumentos, { pode }) {
  exigirVerEnvios(pode);
  const { cep, valor, ...pacote } = argumentos;
  return cotar({ cepDestino: cep, valorDeclarado: valor, ...(await pacoteDaChamada(pacote)) });
}

/**
 * O pacote do pedido, nesta ordem: o da chamada, o do envio que ja existe, o da cotacao da proposta de origem, o sugerido
 * pelos itens (o mesmo caminho da janela de cotar do pedido).
 */
async function pacoteDoPedido(pedido, argumentos) {
  const daChamada = argumentos.caixa || argumentos.comprimentoCm;
  if (daChamada || argumentos.pesoKg) {
    if (!daChamada || !argumentos.pesoKg) throw new ErroDeFerramenta("Informe a caixa (ou as três medidas) e o peso juntos.");
    return { de: "chamada", valor: Number(pedido.totalProdutos), ...(await pacoteDaChamada(argumentos)) };
  }
  const envio = await lerEnvioDoPedido(pedido.id);
  if (envio) {
    const medidas = envio.caixaDeEnvioId ? { caixaId: envio.caixaDeEnvioId } : { comprimentoCm: envio.comprimentoCm, larguraCm: envio.larguraCm, alturaCm: envio.alturaCm };
    return { de: "rascunho", valor: envio.valorDeclarado, pesoKg: envio.pesoKg, ...medidas };
  }
  const daProposta = await cotacaoDaPropostaDoPedido(pedido);
  if (daProposta?.pesoKg && (daProposta.caixaId || daProposta.caixaNome)) {
    const caixaId = daProposta.caixaId ?? (await caixaPeloNome(daProposta.caixaNome)).id;
    return { de: "proposta", valor: Number(pedido.totalProdutos), caixaId, pesoKg: daProposta.pesoKg };
  }
  const itens = pedido.itens.filter((item) => item.produtoId).map((item) => ({ produtoId: item.produtoId, quantidade: item.quantidade, valorUnitario: Number(item.precoUnitario) }));
  const sugerido = itens.length ? await pacoteSugerido(itens) : null;
  if (!sugerido?.caixaId || !sugerido.pesoKg) {
    const faltam = sugerido?.incompletos ? ` (${sugerido.incompletos} item(ns) sem peso ou medida)` : "";
    throw new ErroDeFerramenta(`Diga a caixa e o peso: o Rise não conseguiu sugerir${faltam}.`);
  }
  return { de: "itens", valor: Number(pedido.totalProdutos), caixaId: sugerido.caixaId, pesoKg: sugerido.pesoKg };
}

export async function cotarFreteDoPedido(argumentos, { pode }) {
  exigirVerEnvios(pode);
  const pedido = await pedidoDoBling(argumentos.pedido);
  const cep = String(pedido.enderecoDeEntrega?.cep ?? "").replace(/\D/g, "");
  if (cep.length !== 8) throw new ErroDeFerramenta(`O pedido ${pedido.numero} não tem CEP de entrega.`);
  const { de, valor, ...pacote } = await pacoteDoPedido(pedido, argumentos);
  const cotacao = await cotar({ cepDestino: cep, valorDeclarado: valor, ...pacote });
  return { pedido: pedido.numero, destino: cidadeDe(pedido.enderecoDeEntrega), pacoteDe: de, ...cotacao };
}

// ---------------------------------------------------------------------------
// Ler, listar e imprimir
// ---------------------------------------------------------------------------

const PASSOS = [
  ["compradoEm", "Etiqueta comprada"],
  ["postadoEm", "Postado"],
  ["entregueEm", "Entregue"],
  ["canceladoEm", "Cancelado"],
];

/** O envio como o MCP responde: sem remetente nem destinatario inteiros (so o nome e a cidade de quem recebe). */
export function envioParaOMcp(envio) {
  const parte = envio.direcao === "REVERSO" ? envio.remetente : envio.destinatario;
  return {
    numero: numeroDoEnvio(envio.numero),
    situacao: situacaoDe(envio.status),
    direcao: envio.direcao === "REVERSO" ? "reverso" : "ida",
    pedido: envio.pedidoDeVenda?.numero ?? null,
    destinatario: { nome: parte?.nome ?? null, cidade: cidadeDe(parte?.endereco) },
    servico: servicoDe(envio),
    prazoDias: envio.prazoDias ?? null,
    pacote: { caixa: envio.caixaDeEnvio?.nome ?? null, pesoKg: numero(envio.pesoKg), medidaConferida: envio.medidaConferida },
    precoCotado: numero(envio.precoCotado),
    custo: numero(envio.custo),
    rastreio: envio.rastreio ?? null,
    link: envio.linkDoRastreio ?? null,
    postarAte: emTexto(envio.validoAte),
    linhaDoTempo: PASSOS.filter(([campo]) => envio[campo]).map(([campo, rotulo]) => ({ rotulo, em: emTexto(envio[campo]) })),
    aviso: { emailEnviadoEm: emTexto(envio.avisoEmailEm), erroDoEmail: semEmail(envio.avisoEmailErro), whatsappEm: emTexto(envio.avisoWhatsappEm) },
    ultimaConsultaEm: emTexto(envio.ultimaConsultaEm),
    ultimoErro: envio.ultimoErro ?? null,
  };
}

export async function lerEnvioMcp({ envio }, { pode }) {
  exigirVerEnvios(pode);
  return envioParaOMcp(await acharEnvio(envio));
}

export async function listarEnviosMcp({ situacao, termos, limite = 25 } = {}, { pode }) {
  exigirVerEnvios(pode);
  const [{ linhas, total, contagemPorStatus }, saldo] = await Promise.all([
    listarEnvios({ status: situacao ?? [], busca: termos ?? "", por: limite }),
    obterProvedor(PROVEDOR_PADRAO)
      .saldo()
      .then((lido) => lido.saldo)
      .catch(() => null),
  ]);
  return {
    saldo,
    total,
    porSituacao: Object.fromEntries(Object.entries(contagemPorStatus).map(([status, quantos]) => [situacaoDe(status), quantos])),
    envios: linhas.map((linha) => ({
      numero: numeroDoEnvio(linha.numero),
      situacao: situacaoDe(linha.status),
      criadoEm: emTexto(linha.criadoEm),
      pedido: linha.pedido?.numero ?? null,
      destinatario: { nome: linha.nome, cidade: linha.cidade },
      servico: servicoDe(linha),
      rastreio: linha.rastreio,
      custo: linha.custo,
      postadoEm: emTexto(linha.postadoEm),
      semAviso: linha.pendenteDeAviso,
    })),
  };
}

export async function imprimirEtiquetaMcp({ envio }, { pode }) {
  exigirVerEnvios(pode);
  const achado = await acharEnvio(envio);
  const resultado = await linkDaEtiqueta(achado.id);
  if (!resultado.ok) throw new ErroDeFerramenta(resultado.erro);
  return { numero: numeroDoEnvio(achado.numero), url: resultado.url };
}

// ---------------------------------------------------------------------------
// Preparar, comprar, cancelar e avisar (escrevem; a compra gasta o saldo da carteira)
// ---------------------------------------------------------------------------

/** Comprar e cancelar mexem no saldo da carteira: so quem compra pela tela (o dono pediu "so ele e a Andrea"). */
function exigirComprar(pode) {
  if (typeof pode === "function" && pode("acao.envios.comprarEtiqueta", "executar")) return;
  throw new ErroDeFerramenta("Este login não pode comprar etiquetas.");
}

function exigirAvisar(pode) {
  if (typeof pode === "function" && pode("acao.envios.avisarCliente", "executar")) return;
  throw new ErroDeFerramenta("Este login não pode avisar o cliente.");
}

/** A confirmacao da pessoa vale por pouco tempo: o preco do Melhor Envio muda, e o preparado de ontem nao e o de hoje. */
const VALIDADE_DA_PREPARACAO_MS = 30 * 60 * 1000;
const moeda = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const reais = (valor) => `R$${moeda.format(Number(valor))}`;
const centavos = (valor) => Math.round(valor * 100) / 100;
const erroDaLib = (resultado) => (resultado.erros ? Object.values(resultado.erros).join(" ") : resultado.erro);

/**
 * O primeiro dos dois passos da compra: grava o rascunho com o servico escolhido e cota de novo com o pacote MEDIDO
 * (`conferirPacote`, o mesmo da janela de compra). Nao compra: devolve o preco e o saldo para a pessoa confirmar.
 */
export async function prepararEtiqueta(argumentos, { pode, usuario }) {
  exigirComprar(pode);
  const pedido = await pedidoDoBling(argumentos.pedido);
  if (!argumentos.caixa && !(argumentos.comprimentoCm && argumentos.larguraCm && argumentos.alturaCm)) throw new ErroDeFerramenta("Informe a caixa ou as três medidas.");
  // O documento e conferido antes de gravar qualquer coisa: sem a chave, o rascunho ficaria pela metade.
  let chaveNfe = null;
  if (argumentos.documento === "NFE") {
    chaveNfe = String(argumentos.chaveNfe ?? pedido.nf?.chave ?? "").replace(/\D/g, "");
    if (!chaveNfe) throw new ErroDeFerramenta("O pedido não tem NF-e: informe a chave ou use declaração.");
  }
  const cep = String(pedido.enderecoDeEntrega?.cep ?? "").replace(/\D/g, "");
  if (cep.length !== 8) throw new ErroDeFerramenta(`O pedido ${pedido.numero} não tem CEP de entrega.`);

  const medido = await pacoteDaChamada(argumentos);
  const cotacao = await cotarFrete({ cepDestino: cep, valorDeclarado: Number(pedido.totalProdutos), ...medido });
  if (!cotacao.ok) throw new ErroDeFerramenta(erroDaLib(cotacao));
  const servico = cotacao.atendem.find((item) => String(item.servicoId) === String(argumentos.servicoId));
  if (!servico) throw new ErroDeFerramenta(`O serviço ${argumentos.servicoId} não atende este pacote: cote de novo.`);

  const rascunho = await salvarRascunhoDoPedido(pedido.id, { pacote: cotacao.pacote, servico, cotadoEm: cotacao.cotadoEm }, usuario);
  if (!rascunho.ok) throw new ErroDeFerramenta(rascunho.erro);
  const conferido = await conferirPacote(rascunho.envio.id, { ...medido, tipoDeDocumento: argumentos.documento, chaveNfe }, usuario);
  if (!conferido.ok) throw new ErroDeFerramenta(erroDaLib(conferido));

  const { envio, preco, saldo, motivos } = conferido;
  return {
    envio: numeroDoEnvio(envio.numero),
    pedido: pedido.numero,
    servico: servicoDe(envio),
    prazoDias: envio.prazoDias ?? null,
    pacote: { caixa: envio.caixaDeEnvio?.nome ?? null, pesoKg: numero(envio.pesoKg) },
    documento: argumentos.documento === "NFE" ? "NF-e" : "Declaração de conteúdo",
    preco,
    saldo,
    saldoDepois: saldo === null ? null : centavos(saldo - preco),
    podeComprar: motivos.length === 0,
    motivos,
    confirmarAte: new Date(new Date(envio.cotadoEm).getTime() + VALIDADE_DA_PREPARACAO_MS).toISOString(),
  };
}

/**
 * O segundo passo: compra so o que a pessoa viu. O valor confirmado tem de ser o preco preparado, e a preparacao, recente;
 * a compra em si e a de `lib/frete/envios.js` (sem dobra, com retomada), e o lucro do pedido e refeito como na tela.
 */
export async function comprarEtiquetaMcp({ envio, valorConfirmado }, { pode, usuario }) {
  exigirComprar(pode);
  const achado = await acharEnvio(envio);
  if (!["RASCUNHO", "COMPRANDO"].includes(achado.status)) throw new ErroDeFerramenta("Esta etiqueta já foi comprada.");
  if (!achado.medidaConferida) throw new ErroDeFerramenta("Prepare a etiqueta antes (prepararEtiqueta).");
  if (Math.abs(Number(achado.precoCotado) - Number(valorConfirmado)) > 0.005) {
    throw new ErroDeFerramenta(`O preço preparado é ${reais(achado.precoCotado)}, não ${reais(valorConfirmado)}: confira com a pessoa.`);
  }
  // Com o carrinho ja criado (compra que caiu no meio), preparar de novo e recusado: a retomada nao pode exigir isso.
  const velha = Date.now() - new Date(achado.cotadoEm).getTime() > VALIDADE_DA_PREPARACAO_MS;
  if (velha && !achado.idNoProvedor) throw new ErroDeFerramenta("A preparação passou de 30 minutos: prepare de novo.");

  const resultado = await comprarEtiqueta(achado.id, usuario, { aoComprar: recalcularLucroDoPedido });
  if (!resultado.ok) throw new ErroDeFerramenta(resultado.erro);
  const comprado = resultado.envio;
  return {
    numero: numeroDoEnvio(comprado.numero),
    situacao: situacaoDe(comprado.status),
    servico: servicoDe(comprado),
    custo: numero(comprado.custo),
    rastreio: comprado.rastreio ?? null,
    link: comprado.linkDoRastreio ?? null,
    postarAte: emTexto(comprado.validoAte),
  };
}

export async function cancelarEtiquetaMcp({ envio, motivo }, { pode, usuario }) {
  exigirComprar(pode);
  const achado = await acharEnvio(envio);
  const resultado = await cancelarEtiqueta(achado.id, String(motivo ?? "").slice(0, 255), usuario, { aoMudarCusto: recalcularLucroDoPedido });
  if (!resultado.ok) throw new ErroDeFerramenta(resultado.erro);
  return { numero: numeroDoEnvio(achado.numero), situacao: situacaoDe(resultado.envio.status), aviso: "O valor volta à carteira em até 12 horas." };
}

export async function reenviarAvisoMcp({ envio }, { pode }) {
  exigirAvisar(pode);
  const achado = await acharEnvio(envio);
  const resultado = await reenviarEmail(achado.id);
  return { numero: numeroDoEnvio(achado.numero), enviado: Boolean(resultado.enviado), erro: semEmail(resultado.erro) };
}

// ---------------------------------------------------------------------------
// Registro
// ---------------------------------------------------------------------------

const DIMENSAO = z.number().positive().max(200);
const PACOTE = {
  caixa: z.string().trim().min(1).max(40).optional().describe("Nome da caixa cadastrada (ex.: CX 16x11x3). Sem ela, as três medidas"),
  comprimentoCm: DIMENSAO.optional().describe("Comprimento em cm (sem caixa)"),
  larguraCm: DIMENSAO.optional().describe("Largura em cm (sem caixa)"),
  alturaCm: DIMENSAO.optional().describe("Altura em cm (sem caixa)"),
};
const REFERENCIA_DO_ENVIO = z.string().trim().min(1).max(60).describe("ENV-0012, o número do pedido ou o código de rastreio");

export const FERRAMENTAS_DE_FRETE_LEITURA = [
  {
    nome: "cotarFrete",
    descricao:
      "Cota o frete pelo Melhor Envio para um CEP: caixa cadastrada (ou as três medidas), peso e valor dos produtos. Devolve os serviços que atendem (preço, valor a cobrar do cliente com a embalagem, prazo em dias úteis, se dá para comprar a etiqueta pelo Rise) e os que não atendem. Não grava nada.",
    esquema: z.object({
      cep: z.string().trim().min(8).max(9).describe("CEP de destino"),
      ...PACOTE,
      pesoKg: z.number().positive().max(30).describe("Peso do pacote em kg"),
      valor: z.number().min(0).max(1000000).describe("Valor dos produtos (seguro)"),
    }),
    anotacoes: LEITURA,
    executar: cotarFreteMcp,
  },
  {
    nome: "cotarFreteDoPedido",
    descricao:
      "Cota o frete de um pedido de venda do Bling. Sem caixa e peso na chamada, usa o pacote do envio do pedido, o da proposta de origem ou o sugerido pelos itens (pacoteDe diz qual). Do destino vem só a cidade. Não grava nada.",
    esquema: z.object({
      pedido: z.string().trim().min(1).max(60).describe("O número do pedido (o do Bling ou o do canal)"),
      ...PACOTE,
      pesoKg: z.number().positive().max(30).optional().describe("Peso do pacote em kg (junto com a caixa ou as medidas)"),
    }),
    anotacoes: LEITURA,
    executar: cotarFreteDoPedido,
  },
  {
    nome: "lerEnvio",
    descricao:
      "Lê um envio do Rise (etiqueta do Melhor Envio) pelo número do envio (ENV-0012), pelo número do pedido ou pelo rastreio: situação, serviço, rastreio com link, prazo, data-limite para postar, linha do tempo, custo, aviso ao cliente e a hora da última consulta ao Melhor Envio (feita a cada 15 minutos). Do destinatário vêm só o nome e a cidade.",
    esquema: z.object({ envio: REFERENCIA_DO_ENVIO }),
    anotacoes: LEITURA,
    executar: lerEnvioMcp,
  },
  {
    nome: "listarEnvios",
    descricao:
      "Lista os envios do Rise do mais novo ao mais antigo, com o saldo da carteira do Melhor Envio: número, situação, pedido, destinatário (nome e cidade), serviço, rastreio, custo, data de postagem e se o cliente ainda não foi avisado. Filtra por situação (ex.: A_POSTAR para os que faltam postar) e por número, rastreio, nome, serviço ou pedido.",
    esquema: z.object({
      situacao: z.array(z.enum(SITUACOES)).max(SITUACOES.length).optional().describe(`${SITUACOES.join(", ")}; vazio = todas`),
      termos: z.string().trim().max(80).optional().describe("Número do envio ou do pedido, rastreio, nome de quem recebe ou serviço"),
      limite: z.number().int().min(1).max(100).optional().describe("Quantos devolver (padrão 25). O total vem junto"),
    }),
    anotacoes: LEITURA,
    executar: listarEnviosMcp,
  },
  {
    nome: "imprimirEtiqueta",
    descricao: "Devolve o link da página de impressão da etiqueta no Melhor Envio (lá se escolhe 10×15 ou A4). Só para etiqueta comprada, a postar ou postada.",
    esquema: z.object({ envio: REFERENCIA_DO_ENVIO }),
    anotacoes: LEITURA,
    executar: imprimirEtiquetaMcp,
  },
];

const PREPARO = { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true };
const COMPRA = { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true };
const AVISO = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true };

export const FERRAMENTAS_DE_FRETE_ESCRITA = [
  {
    nome: "prepararEtiqueta",
    descricao:
      "PRIMEIRO PASSO da etiqueta de um pedido do Bling: com o serviço escolhido (servicoId de cotarFreteDoPedido) e a caixa e o peso que a pessoa MEDIU, cota de novo e devolve o preço final, o prazo, o saldo antes e depois e o que impede a compra. NÃO compra. Mostre tudo à pessoa e só com o ok dela chame comprarEtiqueta. NF-e usa a chave do pedido quando não vier na chamada; sem nota, documento DECLARACAO.",
    esquema: z.object({
      pedido: z.string().trim().min(1).max(60).describe("O número do pedido (o do Bling ou o do canal)"),
      servicoId: z.string().trim().min(1).max(20).describe("O servicoId que veio na cotação"),
      ...PACOTE,
      pesoKg: z.number().positive().max(30).describe("Peso do pacote medido, em kg"),
      documento: z.enum(["NFE", "DECLARACAO"]).describe("NFE (com a chave) ou DECLARACAO (declaração de conteúdo)"),
      chaveNfe: z.string().trim().max(60).optional().describe("Chave da NF-e (44 dígitos); sem ela, a do pedido"),
    }),
    anotacoes: PREPARO,
    executar: prepararEtiqueta,
  },
  {
    nome: "comprarEtiqueta",
    descricao:
      "SEGUNDO PASSO: compra a etiqueta preparada, gastando o saldo da carteira do Melhor Envio. Só depois de a pessoa ver o preço de prepararEtiqueta e confirmar com todas as letras; valorConfirmado é o preço que ela viu (se o preço mudou ou a preparação passou de 30 minutos, recusa). Devolve o rastreio e a data-limite para postar.",
    esquema: z.object({
      envio: REFERENCIA_DO_ENVIO,
      valorConfirmado: z.number().positive().max(100000).describe("O preço que a pessoa viu e confirmou, em R$"),
      confirmo: z.literal(true).describe("true: a pessoa confirmou a compra"),
    }),
    anotacoes: COMPRA,
    executar: comprarEtiquetaMcp,
  },
  {
    nome: "cancelarEtiqueta",
    descricao: "Cancela a etiqueta ainda não postada (o valor volta à carteira em até 12 horas e o pedido pode ser cotado de novo). Só quando a pessoa pedir com todas as letras.",
    esquema: z.object({
      envio: REFERENCIA_DO_ENVIO,
      motivo: z.string().trim().min(1).max(200).describe("Por que cancelar"),
      confirmo: z.literal(true).describe("true: a pessoa confirmou o cancelamento"),
    }),
    anotacoes: COMPRA,
    executar: cancelarEtiquetaMcp,
  },
  {
    nome: "reenviarAvisoAoCliente",
    descricao: "Manda de novo ao cliente o e-mail de pedido postado (só quando o anterior não saiu). O aviso pelo WhatsApp é só na tela do Rise.",
    esquema: z.object({ envio: REFERENCIA_DO_ENVIO }),
    anotacoes: AVISO,
    executar: reenviarAvisoMcp,
  },
];