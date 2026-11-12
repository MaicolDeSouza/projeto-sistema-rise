import { prisma } from "@/lib/db";
import { urlDe } from "@/lib/arquivos";
import { garantirClienteDaProposta } from "@/lib/propostas/cliente";
import { conferirProposta, conferirSituacao } from "@/lib/propostas/esquema";
import {
  GARANTIA_PADRAO,
  PRIMEIRO_NUMERO,
  SITUACOES,
  SITUACOES_ABERTAS,
  SO_LEITURA,
  dataISO,
  deveVencer,
  hojeEmSaoPaulo,
  podeIrPara,
  precisaContato,
  totaisDaProposta,
  validadePadrao,
} from "@/lib/propostas/regras";

/**
 * Banco das Propostas para cliente (spec 2026-11-12). Sem conferencia de acesso: quem chama (as Server Actions de
 * src/app/propostas/acoes.js) confere, e corta o custo de quem nao ve (`semCusto`). As contas moram em regras.js.
 */

const numero = (valor) => (valor === null || valor === undefined ? null : Number(valor));
const comoData = (iso) => (iso ? new Date(`${iso}T00:00:00Z`) : null);

/**
 * O proximo numero. Sob trava do Postgres: duas propostas criadas no mesmo instante leriam o mesmo MAX. Roda DENTRO da
 * transacao que cria a proposta (a trava vale ate o commit). A primeira e a 2026 (decisao do dono).
 */
export async function proximoNumero(tx) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('propostas.numero'))`;
  const maior = await tx.propostaParaCliente.aggregate({ _max: { numero: true } });
  return Math.max(PRIMEIRO_NUMERO, (maior._max.numero ?? PRIMEIRO_NUMERO - 1) + 1);
}

/** "Nova proposta": nasce em Rascunho, com validade de 15 dias e a garantia padrao. */
export async function criarProposta({ login = "pc", nome = null } = {}, { hoje = hojeEmSaoPaulo() } = {}) {
  const criada = await prisma.$transaction(async (tx) =>
    tx.propostaParaCliente.create({
      data: {
        numero: await proximoNumero(tx),
        clienteNome: "",
        validadeAte: comoData(validadePadrao(hoje)),
        garantia: GARANTIA_PADRAO,
        criadoPor: login,
        criadoPorNome: nome,
      },
      select: { id: true, numero: true },
    }),
  );
  return { ok: true, ...criada };
}

const INCLUIR = {
  itens: {
    orderBy: { ordem: "asc" },
    include: { produto: { select: { sku: true, ativo: true } } },
  },
  contatos: { orderBy: { em: "desc" } },
  anexos: { orderBy: { criadoEm: "asc" } },
  cliente: {
    select: {
      id: true,
      nome: true,
      nomeFantasia: true,
      documento: true,
      tipoPessoa: true,
      telefone: true,
      email: true,
      inscricaoEstadual: true,
      blingContatoId: true,
      enderecos: true,
      contatos: { orderBy: { nome: "asc" }, select: { id: true, nome: true, cargo: true, telefone: true, email: true } },
    },
  },
  condicaoPagamento: { select: { id: true, nome: true } },
  transportadora: { select: { id: true, nome: true, nomeFantasia: true } },
};

/** A proposta no formato da tela e do PDF: Decimal vira numero, datas viram AAAA-MM-DD, com os totais e os avisos. */
export function propostaParaTela(proposta, { hoje = hojeEmSaoPaulo() } = {}) {
  const itens = proposta.itens.map((item) => ({
    id: item.id,
    produtoId: item.produtoId,
    sku: item.produto?.sku ?? null,
    descricaoCliente: item.descricaoCliente,
    codigoCliente: item.codigoCliente,
    codigoInterno: item.codigoInterno,
    nomeInterno: item.nomeInterno,
    foto: item.foto,
    fotoUrl: item.foto && item.produto?.sku ? urlDe(item.produto.sku, "IMAGEM", item.foto) : null,
    quantidade: numero(item.quantidade),
    unidade: item.unidade,
    precoUnitario: numero(item.precoUnitario),
    descontoPercentual: numero(item.descontoPercentual),
    prontaEntrega: item.prontaEntrega,
    prazoDiasUteis: item.prazoDiasUteis,
    observacao: item.observacao,
    custoUnitario: numero(item.custoUnitario),
  }));
  const base = {
    descontoTipo: proposta.descontoTipo,
    descontoValor: numero(proposta.descontoValor),
    fretePorConta: proposta.fretePorConta,
    frete: numero(proposta.frete),
  };
  return {
    id: proposta.id,
    numero: proposta.numero,
    situacao: proposta.situacao,
    motivoRecusa: proposta.motivoRecusa,
    motivoRecusaTexto: proposta.motivoRecusaTexto,
    clienteId: proposta.clienteId,
    cliente: proposta.cliente ?? null,
    clienteNome: proposta.clienteNome,
    clienteTelefone: proposta.clienteTelefone,
    clienteEmail: proposta.clienteEmail,
    clienteDocumento: proposta.clienteDocumento,
    contatoId: proposta.contatoId,
    contatoNome: proposta.contatoNome,
    condicaoPagamentoId: proposta.condicaoPagamentoId,
    condicaoNome: proposta.condicaoPagamento?.nome ?? null,
    formaPagamento: proposta.formaPagamento,
    parcelas: proposta.parcelas,
    entradaPercentual: numero(proposta.entradaPercentual),
    pagamentoTexto: proposta.pagamentoTexto,
    ...base,
    transportadoraId: proposta.transportadoraId,
    transportadoraNome: proposta.transportadoraNome,
    prazoTransporteDias: proposta.prazoTransporteDias,
    ocCliente: proposta.ocCliente,
    observacoesNf: proposta.observacoesNf,
    observacoesCliente: proposta.observacoesCliente,
    garantia: proposta.garantia,
    observacoesInternas: proposta.observacoesInternas,
    validadeAte: dataISO(proposta.validadeAte),
    proximoContato: dataISO(proposta.proximoContato),
    enviadaEm: proposta.enviadaEm,
    aprovadaEm: proposta.aprovadaEm,
    recusadaEm: proposta.recusadaEm,
    vencidaEm: proposta.vencidaEm,
    criadoPor: proposta.criadoPor,
    criadoPorNome: proposta.criadoPorNome,
    criadoEm: proposta.criadoEm,
    atualizadoEm: proposta.atualizadoEm,
    linkPublico: proposta.linkPublico,
    pedidoDeVendaBlingId: proposta.pedidoDeVendaBlingId,
    pedidoDeVendaEm: proposta.pedidoDeVendaEm,
    itens,
    contatos: proposta.contatos ?? [],
    anexos: proposta.anexos ?? [],
    totais: totaisDaProposta({ itens, ...base }),
    precisaContato: precisaContato(proposta, hoje),
    soLeitura: SO_LEITURA.includes(proposta.situacao),
  };
}

/** Para quem nao ve `dado.custo`: some o custo de cada item e o custo/lucro dos totais. */
export function semCusto(proposta) {
  if (!proposta) return proposta;
  return {
    ...proposta,
    itens: proposta.itens.map((item) => ({ ...item, custoUnitario: null })),
    totais: { ...proposta.totais, custo: null, lucro: null, markup: null },
    custoCortado: true,
  };
}

export async function lerProposta(numeroDaProposta, opcoes = {}) {
  const valor = Number(numeroDaProposta);
  if (!Number.isInteger(valor)) return null;
  const proposta = await prisma.propostaParaCliente.findUnique({ where: { numero: valor }, include: INCLUIR });
  return proposta ? propostaParaTela(proposta, opcoes) : null;
}

/** Os dados que o item copia do produto do Rise ao entrar: foto, codigo, nome, unidade, preco de venda e custo. */
export async function produtoParaProposta(produtoId) {
  const produto = await prisma.produto.findUnique({
    where: { id: String(produtoId ?? "") },
    select: {
      id: true,
      sku: true,
      tituloBase: true,
      unidade: true,
      precoVenda: true,
      custo: true,
      arquivos: { where: { tipo: "IMAGEM", papel: "FOTO" }, orderBy: { ordem: "asc" }, take: 1, select: { arquivo: true } },
    },
  });
  if (!produto) return null;
  const foto = produto.arquivos[0]?.arquivo ?? null;
  return {
    produtoId: produto.id,
    sku: produto.sku,
    codigoInterno: produto.sku,
    nomeInterno: produto.tituloBase,
    foto,
    fotoUrl: foto ? urlDe(produto.sku, "IMAGEM", foto) : null,
    unidade: produto.unidade || "UN",
    precoUnitario: numero(produto.precoVenda) ?? 0,
    custoUnitario: numero(produto.custo),
  };
}

/** "+ Adicionar item": todas as palavras no codigo ou no nome do produto (ate 15, ativos primeiro). */
export async function buscarProdutosParaProposta(texto) {
  const palavras = String(texto ?? "").trim().split(/\s+/).filter(Boolean).slice(0, 6);
  if (!palavras.length || palavras.join("").length < 2) return [];
  const produtos = await prisma.produto.findMany({
    where: { AND: palavras.map((p) => ({ OR: [{ sku: { contains: p, mode: "insensitive" } }, { tituloBase: { contains: p, mode: "insensitive" } }] })) },
    orderBy: [{ ativo: "desc" }, { sku: "asc" }],
    take: 15,
    select: {
      id: true,
      sku: true,
      tituloBase: true,
      precoVenda: true,
      estoque: true,
      ativo: true,
      arquivos: { where: { tipo: "IMAGEM", papel: "FOTO" }, orderBy: { ordem: "asc" }, take: 1, select: { arquivo: true } },
    },
  });
  return produtos.map((p) => ({
    produtoId: p.id,
    sku: p.sku,
    nome: p.tituloBase,
    preco: numero(p.precoVenda),
    estoque: p.estoque ?? null,
    ativo: p.ativo,
    fotoUrl: p.arquivos[0] ? urlDe(p.sku, "IMAGEM", p.arquivos[0].arquivo) : null,
  }));
}

/**
 * Salvar. Recusa Aprovada e Recusada (so "Reabrir"). O cliente: ligado (`clienteId`) copia nome, telefone, e-mail e
 * documento do cadastro; provisorio com CPF/CNPJ valido vira cliente NA HORA no Rise e no Bling (regra do dono), e a
 * falha do Bling volta como `avisoBling` sem perder a proposta. Os itens sao trocados inteiros (a tela manda a lista).
 * `manterCusto`: quem nao ve custo manda os itens sem ele; o custo gravado de cada item (pelo id) fica.
 * Vencida com a validade de volta ao futuro passa a Em negociacao.
 */
export async function salvarProposta(numeroDaProposta, entrada, { manterCusto = false, hoje = hojeEmSaoPaulo(), bling, exigirEscrita } = {}) {
  const atual = await prisma.propostaParaCliente.findUnique({
    where: { numero: Number(numeroDaProposta) || 0 },
    include: { itens: { select: { id: true, custoUnitario: true, produtoId: true } } },
  });
  if (!atual) return { ok: false, erro: "Proposta não encontrada." };
  if (SO_LEITURA.includes(atual.situacao)) return { ok: false, erro: `A proposta está ${SITUACOES[atual.situacao].toLowerCase()}: reabra para editar.` };

  const { dados, erros } = conferirProposta(entrada);
  if (erros) return { ok: false, erro: "Confira os campos destacados.", erros };

  let avisoBling = null;
  let clienteId = dados.clienteId;
  if (clienteId && !(await prisma.cliente.findUnique({ where: { id: clienteId }, select: { id: true } }))) clienteId = null;
  if (!clienteId && dados.clienteDocumento) {
    const garantido = await garantirClienteDaProposta(
      { nome: dados.clienteNome, documento: dados.clienteDocumento, telefone: dados.clienteTelefone, email: dados.clienteEmail },
      { ...(bling ? { bling } : {}), ...(exigirEscrita ? { exigirEscrita } : {}) },
    );
    if (garantido.erro) return { ok: false, erro: "Confira os campos destacados.", erros: { clienteDocumento: garantido.erro } };
    clienteId = garantido.clienteId;
    avisoBling = garantido.avisoBling ?? null;
  }
  if (!clienteId && !dados.clienteNome) return { ok: false, erro: "Confira os campos destacados.", erros: { clienteNome: "Informe o cliente." } };

  // Copia do cadastro: o PDF de amanha tem de dizer o que foi enviado hoje, mesmo que o cadastro mude.
  let copiaDoCliente = {
    clienteNome: dados.clienteNome ?? "",
    clienteTelefone: dados.clienteTelefone,
    clienteEmail: dados.clienteEmail,
    clienteDocumento: dados.clienteDocumento,
  };
  let contatoId = null;
  let contatoNome = null;
  if (clienteId) {
    const cliente = await prisma.cliente.findUnique({ where: { id: clienteId }, select: { nome: true, telefone: true, email: true, documento: true } });
    copiaDoCliente = { clienteNome: cliente.nome, clienteTelefone: cliente.telefone, clienteEmail: cliente.email, clienteDocumento: cliente.documento };
    if (dados.contatoId) {
      const contato = await prisma.clienteContato.findFirst({ where: { id: dados.contatoId, clienteId }, select: { id: true, nome: true } });
      if (contato) [contatoId, contatoNome] = [contato.id, contato.nome];
    }
  }

  const transportadora = dados.transportadoraId
    ? await prisma.transportadora.findUnique({ where: { id: dados.transportadoraId }, select: { id: true, nome: true, nomeFantasia: true } })
    : null;
  const condicao = dados.condicaoPagamentoId
    ? await prisma.condicaoPagamento.findUnique({ where: { id: dados.condicaoPagamentoId }, select: { id: true } })
    : null;

  const custoGravado = new Map(atual.itens.map((item) => [item.id, item.custoUnitario]));
  const produtosExistem = new Set(
    (await prisma.produto.findMany({ where: { id: { in: dados.itens.map((i) => i.produtoId).filter(Boolean) } }, select: { id: true } })).map((p) => p.id),
  );

  const voltaDeVencida = atual.situacao === "VENCIDA" && dados.validadeAte >= hoje;

  await prisma.$transaction(async (tx) => {
    await tx.itemDaPropostaParaCliente.deleteMany({ where: { propostaId: atual.id } });
    if (dados.itens.length) {
      await tx.itemDaPropostaParaCliente.createMany({
        data: dados.itens.map((item, ordem) => ({
          propostaId: atual.id,
          produtoId: item.produtoId && produtosExistem.has(item.produtoId) ? item.produtoId : null,
          descricaoCliente: item.descricaoCliente,
          codigoCliente: item.codigoCliente,
          codigoInterno: item.codigoInterno,
          nomeInterno: item.nomeInterno,
          foto: item.produtoId && produtosExistem.has(item.produtoId) ? item.foto : null,
          quantidade: item.quantidade,
          unidade: item.unidade,
          precoUnitario: item.precoUnitario,
          descontoPercentual: item.descontoPercentual,
          prontaEntrega: item.prontaEntrega,
          prazoDiasUteis: item.prazoDiasUteis,
          observacao: item.observacao,
          custoUnitario: manterCusto ? (item.id ? custoGravado.get(item.id) ?? null : null) : item.custoUnitario,
          ordem,
        })),
      });
    }
    await tx.propostaParaCliente.update({
      where: { id: atual.id },
      data: {
        clienteId,
        ...copiaDoCliente,
        contatoId,
        contatoNome,
        condicaoPagamentoId: condicao?.id ?? null,
        formaPagamento: dados.formaPagamento,
        parcelas: dados.parcelas,
        entradaPercentual: dados.entradaPercentual,
        pagamentoTexto: dados.pagamentoTexto,
        fretePorConta: dados.fretePorConta,
        transportadoraId: transportadora?.id ?? null,
        transportadoraNome: transportadora ? transportadora.nomeFantasia || transportadora.nome : null,
        frete: dados.fretePorConta === "CIF" || dados.fretePorConta === "FOB" ? dados.frete : 0,
        prazoTransporteDias: dados.prazoTransporteDias,
        descontoTipo: dados.descontoTipo,
        descontoValor: dados.descontoValor,
        ocCliente: dados.ocCliente,
        observacoesNf: dados.observacoesNf,
        observacoesCliente: dados.observacoesCliente,
        garantia: dados.garantia,
        observacoesInternas: dados.observacoesInternas,
        validadeAte: comoData(dados.validadeAte),
        proximoContato: comoData(dados.proximoContato),
        ...(voltaDeVencida ? { situacao: "EM_NEGOCIACAO", vencidaEm: null } : {}),
      },
    });
  });
  return { ok: true, numero: atual.numero, avisoBling };
}

/** Os botoes Aprovar, Recusar (com motivo), Reabrir e o "Enviada" automatico do PDF/link/WhatsApp. */
export async function mudarSituacao(numeroDaProposta, para, extras = {}, { agora = new Date() } = {}) {
  const atual = await prisma.propostaParaCliente.findUnique({ where: { numero: Number(numeroDaProposta) || 0 }, select: { id: true, situacao: true } });
  if (!atual) return { ok: false, erro: "Proposta não encontrada." };
  if (atual.situacao === para) return { ok: true };
  if (!podeIrPara(atual.situacao, para)) return { ok: false, erro: `Não dá para ir de ${SITUACOES[atual.situacao]} para ${SITUACOES[para] ?? para}.` };
  const conferido = conferirSituacao(para, extras);
  if (conferido.erro) return { ok: false, erro: conferido.erro };
  const datas = {
    ENVIADA: { enviadaEm: agora },
    APROVADA: { aprovadaEm: agora },
    RECUSADA: { recusadaEm: agora },
    EM_NEGOCIACAO: {},
  };
  await prisma.propostaParaCliente.update({
    where: { id: atual.id },
    data: {
      situacao: para,
      motivoRecusa: conferido.motivo,
      motivoRecusaTexto: conferido.motivoTexto,
      ...(datas[para] ?? {}),
      // Reabrir uma vencida com a validade ainda no passado a faria vencer de novo na proxima leitura: ganha 15 dias.
      ...(atual.situacao === "VENCIDA" ? { vencidaEm: null, validadeAte: comoData(validadePadrao()) } : {}),
    },
  });
  return { ok: true };
}

/** Gerar PDF, copiar o link ou abrir o WhatsApp de um Rascunho a marca Enviada (as outras situacoes ficam). */
export async function marcarEnviada(numeroDaProposta, { agora = new Date() } = {}) {
  await prisma.propostaParaCliente.updateMany({
    where: { numero: Number(numeroDaProposta) || 0, situacao: "RASCUNHO" },
    data: { situacao: "ENVIADA", enviadaEm: agora },
  });
}

/** "Registrar contato": a linha do historico e a proxima data, que apaga o "!" quando fica no futuro. */
export async function registrarContato(numeroDaProposta, { texto, proximoContato, quem }) {
  const limpo = String(texto ?? "").trim();
  if (!limpo) return { ok: false, erro: "Escreva o que foi falado." };
  const data = /^\d{4}-\d{2}-\d{2}$/.test(String(proximoContato ?? "")) ? proximoContato : null;
  const proposta = await prisma.propostaParaCliente.findUnique({ where: { numero: Number(numeroDaProposta) || 0 }, select: { id: true } });
  if (!proposta) return { ok: false, erro: "Proposta não encontrada." };
  await prisma.$transaction([
    prisma.contatoDaProposta.create({ data: { propostaId: proposta.id, texto: limpo.slice(0, 2000), quem: String(quem ?? "pc"), proximoContato: comoData(data) } }),
    prisma.propostaParaCliente.update({ where: { id: proposta.id }, data: { proximoContato: comoData(data) } }),
  ]);
  return { ok: true };
}

/** Exclui so o Rascunho (proposta que nunca foi ao cliente). */
export async function excluirProposta(numeroDaProposta) {
  const proposta = await prisma.propostaParaCliente.findUnique({ where: { numero: Number(numeroDaProposta) || 0 }, select: { id: true, situacao: true } });
  if (!proposta) return { ok: false, erro: "Proposta não encontrada." };
  if (proposta.situacao !== "RASCUNHO") return { ok: false, erro: "Só o rascunho pode ser excluído; as demais ficam como histórico." };
  await prisma.propostaParaCliente.delete({ where: { id: proposta.id } });
  return { ok: true, id: proposta.id };
}

/**
 * Vence sozinha: aberta com a validade antes de hoje vira Vencida. Roda de hora em hora no worker e antes de toda
 * leitura da lista (para nao depender do worker). Devolve quantas venceram.
 */
export async function vencerPropostas({ hoje = hojeEmSaoPaulo(), agora = new Date() } = {}) {
  const { count } = await prisma.propostaParaCliente.updateMany({
    where: { situacao: { in: SITUACOES_ABERTAS }, validadeAte: { lt: comoData(hoje) } },
    data: { situacao: "VENCIDA", vencidaEm: agora },
  });
  return count;
}

const ORDEM = {
  numero: (l) => l.numero,
  cliente: (l) => l.cliente.toLocaleLowerCase("pt-BR"),
  situacao: (l) => Object.keys(SITUACOES).indexOf(l.situacao),
  total: (l) => l.total,
  validade: (l) => l.validadeAte,
  contato: (l) => l.proximoContato,
  quem: (l) => (l.quem ?? "").toLocaleLowerCase("pt-BR"),
  atualizada: (l) => new Date(l.atualizadoEm).getTime(),
};
export const COLUNAS_DAS_PROPOSTAS = Object.keys(ORDEM);

/**
 * A lista. Busca pelo numero, cliente (nome ou documento), descricao ou codigo do cliente e nosso codigo. Filtros:
 * situacoes, "abertas" e "contatar" (o "!"). O total e calculado, entao a lista do filtro vem inteira, ordena em
 * memoria e so depois pagina (sao dezenas ou centenas de propostas).
 */
export async function listarPropostas({ busca, situacoes = [], abertas = false, contatar = false, ordenar = null, direcao = "asc", pagina = 1, porPagina = 25, hoje = hojeEmSaoPaulo() } = {}) {
  await vencerPropostas({ hoje });
  const texto = String(busca ?? "").trim();
  const numeroBuscado = /^\d{1,9}$/.test(texto) ? Number(texto) : null;
  const filtroSituacao = contatar || abertas ? SITUACOES_ABERTAS.filter((s) => !situacoes.length || situacoes.includes(s)) : situacoes;
  const where = {
    ...(filtroSituacao.length ? { situacao: { in: filtroSituacao } } : {}),
    ...(contatar ? { proximoContato: { lte: comoData(hoje) } } : {}),
    ...(texto
      ? {
          OR: [
            ...(numeroBuscado ? [{ numero: numeroBuscado }] : []),
            { clienteNome: { contains: texto, mode: "insensitive" } },
            { clienteDocumento: { contains: texto } },
            { ocCliente: { contains: texto, mode: "insensitive" } },
            { itens: { some: { descricaoCliente: { contains: texto, mode: "insensitive" } } } },
            { itens: { some: { codigoCliente: { contains: texto, mode: "insensitive" } } } },
            { itens: { some: { codigoInterno: { contains: texto, mode: "insensitive" } } } },
          ],
        }
      : {}),
  };
  const propostas = await prisma.propostaParaCliente.findMany({
    where,
    orderBy: { numero: "desc" },
    include: { itens: { select: { quantidade: true, precoUnitario: true, descontoPercentual: true } } },
  });
  const linhas = propostas.map((p) => ({
    numero: p.numero,
    cliente: p.clienteNome || "—",
    provisorio: !p.clienteId,
    situacao: p.situacao,
    total: totaisDaProposta({
      itens: p.itens.map((i) => ({ quantidade: numero(i.quantidade), precoUnitario: numero(i.precoUnitario), descontoPercentual: numero(i.descontoPercentual) })),
      descontoTipo: p.descontoTipo,
      descontoValor: numero(p.descontoValor),
      fretePorConta: p.fretePorConta,
      frete: numero(p.frete),
    }).total,
    itens: p.itens.length,
    validadeAte: dataISO(p.validadeAte),
    vencida: deveVencer(p, hoje),
    proximoContato: dataISO(p.proximoContato),
    precisaContato: precisaContato(p, hoje),
    quem: p.criadoPorNome || p.criadoPor,
    atualizadoEm: p.atualizadoEm,
  }));
  const chave = ORDEM[ordenar] ? ordenar : null;
  if (chave) {
    const valor = ORDEM[chave];
    const sinal = direcao === "desc" ? -1 : 1;
    linhas.sort((a, b) => {
      const [x, y] = [valor(a), valor(b)];
      if (x === null || x === undefined) return y === null || y === undefined ? b.numero - a.numero : 1;
      if (y === null || y === undefined) return -1;
      if (typeof x === "number" && typeof y === "number") return x !== y ? (x - y) * sinal : b.numero - a.numero;
      return String(x).localeCompare(String(y), "pt-BR", { numeric: true }) * sinal || b.numero - a.numero;
    });
  }
  const inicio = (Math.max(1, pagina) - 1) * porPagina;
  return { total: linhas.length, linhas: linhas.slice(inicio, inicio + porPagina) };
}

/** Quantas propostas por situacao e quantas pedem contato hoje (os numeros dos filtros). */
export async function contarPropostas({ hoje = hojeEmSaoPaulo() } = {}) {
  const grupos = await prisma.propostaParaCliente.groupBy({ by: ["situacao"], _count: { _all: true } });
  const contagem = Object.fromEntries(Object.keys(SITUACOES).map((s) => [s, 0]));
  for (const g of grupos) contagem[g.situacao] = g._count._all;
  const contatar = await prisma.propostaParaCliente.count({ where: { situacao: { in: SITUACOES_ABERTAS }, proximoContato: { lte: comoData(hoje) } } });
  return { ...contagem, contatar };
}
