import { z } from "zod";

import { entradaDoFormulario, formularioDaProposta } from "@/components/propostas/formato";
import { criarProposta, excluirProposta, lerProposta, mudarSituacao, produtoParaProposta, salvarProposta } from "@/lib/propostas/banco";
import { documentoValido } from "@/lib/propostas/cliente";
import { conferirProposta } from "@/lib/propostas/esquema";
import { conferirPedidoDeVenda, gerarPedidoDeVenda } from "@/lib/propostas/pedidoDeVenda";
import {
  MOTIVOS_DE_RECUSA,
  SITUACOES,
  TEXTO_DO_FRETE,
  hojeEmSaoPaulo,
  lerDesconto,
  podeIrPara,
  totaisDaProposta,
  totalDoItem,
  validadePadrao,
} from "@/lib/propostas/regras";
import { ErroDeFerramenta } from "@/lib/riseAi/ferramentas/erro";

import { CONFIRMO, ESCRITA, ESCRITA_FORA, acharCliente, acharProdutoPorSku, clienteParaMostrar, exigir, exigirOk, previa } from "./doisPassos.js";

/**
 * Propostas para cliente pelo MCP, a escrita (26/11/2026, grupo "Propostas e pedido de venda"; a leitura mora em
 * propostasParaCliente.js). Montar ou mudar a proposta, mudar a situacao e gerar o pedido de venda no Bling, pelas MESMAS
 * funcoes da tela (`salvarProposta`, `mudarSituacao`, `gerarPedidoDeVenda`), com o acesso dela (`tela.propostas` editar;
 * o pedido tambem `acao.propostas.pedidoDeVenda`). O caso que puxou: o servico de LightBurn da Andrelina (999906, R$100
 * com 30% de desconto), que o dono queria lancar pela conversa.
 */

const centavos = (valor) => Math.round(Number(valor ?? 0) * 100) / 100;

/** Os itens pedidos na conversa, como o editor da proposta os monta: o produto do Rise pelo codigo, ou um avulso. */
async function montarItens(itens) {
  const montados = [];
  for (const [indice, item] of itens.entries()) {
    const quantidade = item.quantidade;
    const prazo = item.prazoDiasUteis ?? null;
    const comum = {
      quantidade,
      descontoPercentual: item.descontoPercentual ?? 0,
      descricaoCliente: item.descricaoCliente ?? "",
      codigoCliente: item.codigoCliente ?? null,
      prontaEntrega: !(prazo > 0),
      prazoDiasUteis: prazo > 0 ? prazo : null,
      observacao: item.observacao ?? null,
    };
    if (item.sku) {
      const achado = await acharProdutoPorSku(item.sku, { id: true, sku: true, blingId: true });
      const produto = await produtoParaProposta(achado.id);
      montados.push({
        ...comum,
        produtoId: produto.produtoId,
        codigoInterno: produto.codigoInterno,
        nomeInterno: produto.nomeInterno,
        foto: produto.foto,
        unidade: produto.unidade,
        marca: produto.marca,
        modelo: produto.modelo,
        fator: 1,
        precoUnitario: item.precoUnitario ?? produto.precoUnitario,
        // O custo vai sempre (fica so no Rise, para o lucro); a previa so o mostra a quem ve custo.
        custoUnitario: produto.custoUnitario,
        _sku: produto.sku,
        _noBling: Boolean(achado.blingId),
      });
    } else {
      if (!item.descricao) throw new ErroDeFerramenta(`Item ${indice + 1}: informe o código do produto (sku) ou a descrição do item avulso.`);
      if (item.precoUnitario === undefined) throw new ErroDeFerramenta(`Item ${indice + 1} (avulso): informe o preço unitário.`);
      montados.push({ ...comum, produtoId: null, nomeInterno: item.descricao, unidade: "UN", fator: 1, precoUnitario: item.precoUnitario, custoUnitario: null, _sku: null, _noBling: false });
    }
  }
  return montados;
}

const semMarcas = (item) => Object.fromEntries(Object.entries(item).filter(([chave]) => !chave.startsWith("_")));

/** De quem e a proposta: o cliente do Rise achado, um novo pelo CPF/CNPJ (a proposta o cadastra ao salvar) ou sem cadastro. */
async function clienteDaConversa({ cliente, nomeDoCliente, telefone, email }) {
  const achado = await acharCliente(cliente, { opcional: true });
  if (achado) return { campos: { clienteId: achado.id, clienteNome: achado.nome, clienteDocumento: achado.documento ?? "", clienteTelefone: "", clienteEmail: "" }, achado, novo: false };
  const doc = documentoValido(cliente);
  if (doc) {
    if (!nomeDoCliente) throw new ErroDeFerramenta(`Não há cliente com o documento ${doc.formatado}: informe o nomeDoCliente para cadastrá-lo junto com a proposta.`);
    return { campos: { clienteId: null, clienteNome: nomeDoCliente, clienteDocumento: doc.formatado, clienteTelefone: telefone ?? "", clienteEmail: email ?? "" }, achado: null, novo: true };
  }
  return { campos: { clienteId: null, clienteNome: nomeDoCliente ?? cliente, clienteDocumento: "", clienteTelefone: telefone ?? "", clienteEmail: email ?? "" }, achado: null, novo: false };
}

/** Os campos da conversa por cima do formulario da proposta (o mesmo objeto que a tela manda ao Salvar). */
function aplicar(base, campos, cliente, itens) {
  const formulario = { ...base };
  if (cliente) Object.assign(formulario, cliente.campos, { contatoId: "", contatoNome: "" });
  if (itens) formulario.itens = itens.map(semMarcas);
  if (campos.desconto !== undefined) formulario.desconto = campos.desconto;
  for (const chave of ["fretePorConta", "formaPagamento", "observacoesCliente", "observacoesNf", "observacoesInternas", "ocCliente", "validadeAte"]) {
    if (campos[chave] !== undefined) formulario[chave] = campos[chave];
  }
  if (campos.frete !== undefined) formulario.frete = campos.frete;
  if (campos.parcelas !== undefined) formulario.parcelas = campos.parcelas;
  const entrada = entradaDoFormulario(formulario);
  // Ausente = o Salvar aplica as condicoes do cadastro do cliente uma vez (a tela manda o que ja aplicou; aqui ninguem aplicou).
  delete entrada.condicoesDoClienteId;
  return entrada;
}

function resumoDaEntrada(entrada, { veCusto }) {
  const desconto = lerDesconto(entrada.desconto);
  const itens = entrada.itens.map((item) => ({
    codigo: item.codigoInterno ?? null,
    nome: item.nomeInterno,
    descricaoDoCliente: item.descricaoCliente || null,
    quantidade: Number(item.quantidade),
    precoUnitario: Number(item.precoUnitario),
    descontoPercentual: Number(item.descontoPercentual ?? 0),
    total: totalDoItem({ quantidade: Number(item.quantidade), precoUnitario: Number(item.precoUnitario), descontoPercentual: Number(item.descontoPercentual ?? 0) }),
  }));
  const totais = totaisDaProposta({
    itens: entrada.itens.map((item) => ({ ...item, quantidade: Number(item.quantidade), precoUnitario: Number(item.precoUnitario), descontoPercentual: Number(item.descontoPercentual ?? 0), custoUnitario: item.custoUnitario })),
    descontoTipo: desconto.erro ? null : desconto.tipo,
    descontoValor: desconto.erro ? 0 : desconto.valor,
    fretePorConta: entrada.fretePorConta,
    frete: Number(String(entrada.frete ?? 0).replace(",", ".")) || 0,
    freteDiluido: Boolean(entrada.freteDiluido),
  });
  return {
    itens,
    totais: veCusto ? totais : { subtotal: totais.subtotal, desconto: totais.desconto, frete: totais.frete, total: totais.total },
    frete: TEXTO_DO_FRETE[entrada.fretePorConta] ?? entrada.fretePorConta,
    validaAte: entrada.validadeAte,
  };
}

function exigirSemErros(entrada) {
  const { erros } = conferirProposta(entrada);
  if (erros) throw new ErroDeFerramenta(`Confira: ${Object.entries(erros).map(([campo, mensagem]) => `${campo}: ${mensagem}`).join("; ")}`);
}

export async function gravarPropostaParaCliente(argumentos, { pode, usuario }) {
  exigir(pode, "tela.propostas", "editar", "criar ou mudar propostas");
  const veCusto = pode("dado.custo", "ver");
  const { numero, itens, confirmo } = argumentos;

  let atual = null;
  if (numero) {
    atual = await lerProposta(numero);
    if (!atual) throw new ErroDeFerramenta(`A proposta ${numero} não existe.`);
    if (atual.soLeitura) throw new ErroDeFerramenta(`A proposta ${numero} está ${SITUACOES[atual.situacao].toLowerCase()}: volte-a para Em negociação para mudar.`);
  } else {
    if (!argumentos.cliente) throw new ErroDeFerramenta("Proposta nova: informe o cliente (CPF/CNPJ ou nome).");
    if (!itens?.length) throw new ErroDeFerramenta("Proposta nova: informe ao menos um item.");
  }

  const cliente = argumentos.cliente ? await clienteDaConversa(argumentos) : null;
  const montados = itens ? await montarItens(itens) : null;
  // Proposta nova: o formulario de uma em branco com os padroes que `criarProposta` grava (validade de 15 dias).
  const base = atual ? formularioDaProposta(atual) : formularioDaProposta({ itens: [], validadeAte: validadePadrao(hojeEmSaoPaulo()), parcelas: 1 });
  const entrada = aplicar(base, argumentos, cliente, montados);
  exigirSemErros(entrada);

  const avisos = [];
  if (cliente?.novo) avisos.push("Cliente novo: ao gravar, a proposta procura o CPF/CNPJ no Bling (se achar, copia de lá) e senão cadastra o cliente no Rise e no Bling.");
  if (cliente && !cliente.achado && !cliente.novo) avisos.push("Sem CPF/CNPJ: a proposta fica sem cadastro de cliente e não gera pedido de venda até ter o documento.");
  for (const item of montados ?? []) {
    if (!item.produtoId) avisos.push(`"${item.nomeInterno}" é avulso (sem produto do Rise): não entra num pedido de venda.`);
    else if (!item._noBling) avisos.push(`${item._sku} não tem cadastro no Bling: o pedido de venda vai recusar.`);
  }
  if (numero && montados) avisos.push(`Os itens da proposta ${numero} serão TROCADOS pelos desta lista.`);

  const resumo = {
    proposta: numero ?? "nova",
    cliente: cliente ? (cliente.achado ? clienteParaMostrar(cliente.achado, pode) : { nome: cliente.campos.clienteNome, cadastro: cliente.novo ? "novo" : "sem cadastro" }) : atual.clienteNome,
    ...resumoDaEntrada(entrada, { veCusto }),
    ...(avisos.length ? { avisos } : {}),
  };
  if (!confirmo) return previa(resumo);

  let alvo = numero;
  if (!alvo) {
    const criada = await criarProposta({ login: usuario ?? "mcp", nome: null });
    alvo = criada.numero;
    const nova = await lerProposta(alvo);
    // A em branco de verdade (garantia, vendedor e contato padrao), com os mesmos campos da conversa por cima.
    const entradaFinal = aplicar(formularioDaProposta(nova), argumentos, cliente, montados);
    const salvo = await salvarProposta(alvo, entradaFinal, { manterCusto: false });
    if (!salvo.ok) {
      await excluirProposta(alvo).catch(() => {});
      throw new ErroDeFerramenta(salvo.erros ? `Confira: ${Object.values(salvo.erros).join("; ")}` : salvo.erro);
    }
  } else {
    const salvo = await salvarProposta(alvo, entrada, { manterCusto: false });
    if (!salvo.ok) throw new ErroDeFerramenta(salvo.erros ? `Confira: ${Object.values(salvo.erros).join("; ")}` : salvo.erro);
  }
  const gravada = await lerProposta(alvo);
  return {
    gravado: true,
    numero: gravada.numero,
    situacao: SITUACOES[gravada.situacao],
    cliente: gravada.clienteNome,
    clienteCadastrado: Boolean(gravada.clienteId),
    total: gravada.totais.total,
    ...(avisos.length ? { avisos } : {}),
    proximo: "Para fechar: mudarSituacaoDaProposta para APROVADA e depois gerarPedidoDeVendaDaProposta.",
  };
}

export async function mudarSituacaoDaProposta({ numero, para, motivo, motivoTexto, confirmo }, { pode }) {
  exigir(pode, "tela.propostas", "editar", "mudar a situação das propostas");
  const atual = await lerProposta(numero);
  if (!atual) throw new ErroDeFerramenta(`A proposta ${numero} não existe.`);
  if (atual.situacao === para) throw new ErroDeFerramenta(`A proposta ${numero} já está ${SITUACOES[para].toLowerCase()}.`);
  if (!podeIrPara(atual.situacao, para)) throw new ErroDeFerramenta(`Não dá para ir de ${SITUACOES[atual.situacao]} para ${SITUACOES[para]}.`);
  if (para === "RECUSADA" && !motivo) throw new ErroDeFerramenta(`Informe o motivo da recusa: ${Object.keys(MOTIVOS_DE_RECUSA).join(", ")}.`);
  const resumo = { proposta: numero, cliente: atual.clienteNome, total: atual.totais.total, de: SITUACOES[atual.situacao], para: SITUACOES[para] };
  if (!confirmo) return previa(resumo);
  exigirOk(await mudarSituacao(numero, para, { motivo, motivoTexto }));
  return { gravado: true, ...resumo, ...(para === "APROVADA" ? { proximo: "Para o pedido no Bling: gerarPedidoDeVendaDaProposta." } : {}) };
}

export async function gerarPedidoDeVendaDaProposta({ numero, totalConfirmado, confirmo }, { pode }) {
  exigir(pode, "tela.propostas", "editar", "gerar pedido de venda pela proposta");
  exigir(pode, "acao.propostas.pedidoDeVenda", "executar", "gerar pedido de venda no Bling");
  const proposta = await lerProposta(numero);
  if (!proposta) throw new ErroDeFerramenta(`A proposta ${numero} não existe.`);
  if (proposta.pedidoDeVendaBlingId) throw new ErroDeFerramenta(`A proposta ${numero} já gerou o pedido ${proposta.pedidoDeVendaBlingId} no Bling.`);
  const conferido = exigirOk(await conferirPedidoDeVenda(numero));
  const total = centavos(proposta.totais.total);
  const resumo = {
    proposta: numero,
    cliente: proposta.clienteNome,
    itens: proposta.itens.map((i) => ({ codigo: i.sku ?? i.codigoInterno, nome: i.nomeInterno, quantidade: i.quantidade, precoUnitario: i.precoUnitario, descontoPercentual: i.descontoPercentual, total: totalDoItem(i) })),
    total,
    ondeGrava: "Cria o pedido de venda no Bling (ERP real) e o cliente lá, se ainda não existir.",
  };
  if (conferido.impedimentos.length) return { ...previa(resumo), podeGerar: false, impedimentos: conferido.impedimentos, proximoPasso: "Resolva os impedimentos antes; nada foi gravado." };
  if (!confirmo) return { ...previa(resumo), podeGerar: true, proximoPasso: "Prévia: nada foi gravado. Mostre à pessoa e, com o ok dela, chame de novo com totalConfirmado (o total mostrado) e confirmo: true." };
  if (totalConfirmado === undefined || centavos(totalConfirmado) !== total) {
    throw new ErroDeFerramenta(`O total da proposta é R$${total.toFixed(2).replace(".", ",")}${totalConfirmado !== undefined ? `, e não R$${centavos(totalConfirmado).toFixed(2).replace(".", ",")}` : ""}: mostre a prévia de novo e confirme com totalConfirmado igual a ele.`);
  }
  const gerado = exigirOk(await gerarPedidoDeVenda(numero));
  return { gravado: true, ...resumo, pedidoNoBling: gerado.blingPedidoId ?? null, ...(gerado.aviso ? { aviso: gerado.aviso } : {}) };
}

const TEXTO = (maximo) => z.string().trim().max(maximo);
const ITEM = z.object({
  sku: TEXTO(60).optional().describe("Código do produto do Rise (o preço e o nome vêm do cadastro)"),
  descricao: TEXTO(300).optional().describe("Só para item avulso, sem produto do Rise (não entra no pedido de venda)"),
  quantidade: z.number().positive().max(9_999_999),
  precoUnitario: z.number().min(0).max(9_999_999).optional().describe("Sem ele, o preço de venda do cadastro"),
  descontoPercentual: z.number().min(0).max(100).optional().describe("Desconto do item em %, que aparece no pedido"),
  descricaoCliente: TEXTO(2000).optional().describe("Como o cliente chama o item"),
  codigoCliente: TEXTO(100).optional(),
  prazoDiasUteis: z.number().int().min(0).max(3650).optional().describe("Vazio ou 0 = pronta entrega"),
  observacao: TEXTO(2000).optional(),
});

export const FERRAMENTAS_DE_PROPOSTAS_ESCRITA = [
  {
    nome: "gravarPropostaParaCliente",
    descricao:
      "Cria uma proposta para cliente (sem número) ou muda uma aberta (com número): cliente, itens (pelo código do Rise, com preço e desconto % por item), desconto geral, frete, pagamento e observações. Cliente pelo CPF/CNPJ ou nome; CPF/CNPJ que não está no Rise vira cadastro novo (informe nomeDoCliente). Itens passados TROCAM os da proposta. Dois passos: sem confirmo devolve a prévia com os totais; com confirmo: true grava como rascunho. Para fechar: mudarSituacaoDaProposta (APROVADA) e gerarPedidoDeVendaDaProposta.",
    esquema: z.object({
      numero: z.number().int().min(1).optional().describe("Vazio = proposta nova"),
      cliente: TEXTO(200).optional().describe("CPF/CNPJ ou nome do cliente (obrigatório na nova)"),
      nomeDoCliente: TEXTO(200).optional().describe("Nome para o cliente novo (quando o CPF/CNPJ não está no Rise)"),
      telefone: TEXTO(40).optional(),
      email: TEXTO(200).optional(),
      itens: z.array(ITEM).min(1).max(300).optional(),
      desconto: TEXTO(20).optional().describe('Desconto geral: "5%" ou em R$ ("50")'),
      fretePorConta: z.enum(Object.keys(TEXTO_DO_FRETE)).optional(),
      frete: z.number().min(0).max(999_999).optional().describe("Valor do frete (só no CIF)"),
      formaPagamento: TEXTO(60).optional(),
      parcelas: z.number().int().min(1).max(48).optional(),
      validadeAte: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("AAAA-MM-DD; sem ela, 15 dias"),
      ocCliente: TEXTO(60).optional(),
      observacoesCliente: TEXTO(4000).optional(),
      observacoesNf: TEXTO(2000).optional(),
      observacoesInternas: TEXTO(4000).optional(),
      confirmo: CONFIRMO,
    }),
    // Cliente novo pelo CPF/CNPJ e cadastrado tambem no Bling (regra da proposta): escreve fora do Rise.
    anotacoes: ESCRITA_FORA,
    executar: gravarPropostaParaCliente,
  },
  {
    nome: "mudarSituacaoDaProposta",
    descricao:
      "Muda a situação de uma proposta para cliente: ENVIADA, EM_NEGOCIACAO, APROVADA ou RECUSADA (com motivo). Aprovada e recusada ficam só leitura (volte para EM_NEGOCIACAO para mudar). Dois passos: sem confirmo devolve de/para; com confirmo: true grava. Só quando a pessoa pedir.",
    esquema: z.object({
      numero: z.number().int().min(1),
      para: z.enum(["ENVIADA", "EM_NEGOCIACAO", "APROVADA", "RECUSADA"]),
      motivo: z.enum(Object.keys(MOTIVOS_DE_RECUSA)).optional().describe("Obrigatório na recusa"),
      motivoTexto: TEXTO(500).optional(),
      confirmo: CONFIRMO,
    }),
    anotacoes: ESCRITA,
    executar: mudarSituacaoDaProposta,
  },
  {
    nome: "gerarPedidoDeVendaDaProposta",
    descricao:
      "Gera no BLING (ERP real) o pedido de venda de uma proposta APROVADA, com o cliente e os itens (desconto % por item incluso); não duplica. Dois passos: sem confirmo devolve os itens, o total e o que impede; com totalConfirmado (o total mostrado) e confirmo: true, gera. Só com o ok da pessoa.",
    esquema: z.object({
      numero: z.number().int().min(1),
      totalConfirmado: z.number().min(0).max(99_999_999).optional().describe("O total que a pessoa viu na prévia, em R$"),
      confirmo: CONFIRMO,
    }),
    anotacoes: ESCRITA_FORA,
    executar: gerarPedidoDeVendaDaProposta,
  },
];
