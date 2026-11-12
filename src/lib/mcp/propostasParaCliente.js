import { z } from "zod";

import { lerProposta, listarPropostas, semCusto } from "@/lib/propostas/banco";
import { SITUACOES, MOTIVOS_DE_RECUSA, TEXTO_DO_FRETE, prazoGeral, textoDoPagamento, textoDoPrazo, totalDoItem } from "@/lib/propostas/regras";
import { ErroDeFerramenta } from "@/lib/riseAi/ferramentas/erro";

/**
 * Propostas para cliente pelo MCP (spec 2026-11-12): so leitura, com o acesso da tela (`tela.propostas`); custo e lucro
 * so com `dado.custo`. Dado pessoal do cliente (documento, telefone, e-mail, endereco) NUNCA sai daqui, como nos pedidos
 * de venda: a resposta vai para o Claude/ChatGPT da pessoa, fora do Rise. Fica o nome. Criar pelo MCP fica para depois.
 */

const LEITURA = { readOnlyHint: true, destructiveHint: false, openWorldHint: false };

function exigirAcesso(pode) {
  if (typeof pode !== "function" || !pode("tela.propostas", "ver")) throw new ErroDeFerramenta("Este login não pode ver as propostas para cliente.");
}

export async function listarPropostasParaCliente({ situacoes, contatarHoje = false, termos, limite = 25 } = {}, { pode }) {
  exigirAcesso(pode);
  const { total, linhas } = await listarPropostas({ busca: termos, situacoes: situacoes ?? [], contatar: contatarHoje, porPagina: limite });
  return {
    total,
    propostas: linhas.map((l) => ({
      numero: l.numero,
      cliente: l.cliente,
      semCadastro: l.provisorio,
      situacao: SITUACOES[l.situacao],
      total: l.total,
      itens: l.itens,
      validaAte: l.validadeAte,
      proximoContato: l.proximoContato,
      contatarHoje: l.precisaContato,
      quemFez: l.quem,
    })),
  };
}

export async function lerPropostaParaCliente({ numero }, { pode }) {
  exigirAcesso(pode);
  const lida = await lerProposta(numero);
  if (!lida) throw new ErroDeFerramenta(`A proposta ${numero} não existe.`);
  const veCusto = pode("dado.custo", "ver");
  const p = veCusto ? lida : semCusto(lida);
  return {
    numero: p.numero,
    situacao: SITUACOES[p.situacao],
    motivoDaRecusa: p.motivoRecusa ? [MOTIVOS_DE_RECUSA[p.motivoRecusa], p.motivoRecusaTexto].filter(Boolean).join(": ") : null,
    cliente: p.clienteNome,
    semCadastro: !p.clienteId,
    ac: p.contatoNome,
    criadaEm: p.criadoEm,
    quemFez: p.criadoPorNome || p.criadoPor,
    validaAte: p.validadeAte,
    proximoContato: p.proximoContato,
    contatarHoje: p.precisaContato,
    itens: p.itens.map((i) => ({
      descricaoDoCliente: i.descricaoCliente,
      codigoDoCliente: i.codigoCliente,
      nossoCodigo: i.sku ?? i.codigoInterno,
      nossoNome: i.nomeInterno,
      quantidade: i.quantidade,
      unidade: i.unidade,
      precoUnitario: i.precoUnitario,
      descontoPercentual: i.descontoPercentual,
      total: totalDoItem(i),
      prazo: textoDoPrazo(i),
      observacao: i.observacao,
      ...(veCusto ? { custoUnitario: i.custoUnitario } : {}),
    })),
    totais: veCusto ? p.totais : { subtotal: p.totais.subtotal, desconto: p.totais.desconto, frete: p.totais.frete, total: p.totais.total },
    prazo: prazoGeral(p.itens),
    pagamento: textoDoPagamento(p),
    frete: TEXTO_DO_FRETE[p.fretePorConta],
    transportadora: p.transportadoraNome,
    ocDoCliente: p.ocCliente,
    observacoesParaNotaFiscal: p.observacoesNf,
    observacoesParaOCliente: p.observacoesCliente,
    observacoesInternas: p.observacoesInternas,
    contatos: p.contatos.map((c) => ({ em: c.em, quem: c.quem, texto: c.texto, proximo: c.proximoContato })),
    pedidoDeVendaNoBling: p.pedidoDeVendaBlingId,
  };
}

export const FERRAMENTAS_DE_PROPOSTAS_PARA_CLIENTE = [
  {
    nome: "listarPropostasParaCliente",
    descricao:
      "Lista as propostas comerciais feitas para clientes (tela Propostas), da mais nova para a mais antiga: número, cliente (só o nome), situação, total, validade, próximo contato e se é para contatar hoje. Filtra por situação, pelas que pedem contato hoje e por número, cliente, OC ou item.",
    esquema: z.object({
      situacoes: z.array(z.enum(Object.keys(SITUACOES))).max(6).optional().describe("RASCUNHO, ENVIADA, EM_NEGOCIACAO, APROVADA, RECUSADA, VENCIDA; vazio = todas"),
      contatarHoje: z.boolean().optional().describe("Só as abertas cuja data de contato chegou"),
      termos: z.string().trim().max(120).optional().describe("Número, cliente, OC, descrição ou código do item"),
      limite: z.number().int().min(1).max(100).optional().describe("Quantas devolver (padrão 25). O total vem junto"),
    }),
    anotacoes: LEITURA,
    executar: listarPropostasParaCliente,
  },
  {
    nome: "lerPropostaParaCliente",
    descricao:
      "Lê uma proposta para cliente inteira pelo número (ex.: 2026): itens com a descrição do cliente e o nosso código, preços, prazos, totais, pagamento, frete, observações (inclusive as internas), histórico de contatos e o pedido de venda gerado. Do cliente vem só o nome.",
    esquema: z.object({ numero: z.number().int().min(1).describe("O número da proposta (ex.: 2026)") }),
    anotacoes: LEITURA,
    executar: lerPropostaParaCliente,
  },
];
