import { formatarTelefone } from "@/lib/telefone";
import { TEXTO_DO_FRETE, dataBR, numeroDaProposta, prazoGeral, textoDoPagamento, textoDoPrazo, totalDoItem } from "@/lib/propostas/regras";

/**
 * O que o CLIENTE le, igual no PDF e no link publico (spec 2026-11-12, "PDF e link publico"). Aqui se decide o que
 * entra; `pdf.js` e `paginaPublica.js` so desenham.
 *
 * NUNCA entra: nosso codigo e nome interno, custo, lucro, observacoes internas, contatos registrados e anexos. O item
 * aparece pela DESCRICAO DO CLIENTE e pelo codigo do cliente (pedido do dono).
 */

const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const unitario = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 4 });
const quantidade = (valor) => Number(valor).toLocaleString("pt-BR", { maximumFractionDigits: 3 });

export const COLUNAS = [
  { chave: "item", titulo: "#" },
  { chave: "foto", titulo: "Foto" },
  { chave: "descricao", titulo: "Descrição" },
  { chave: "codigo", titulo: "Cód. cliente" },
  { chave: "qtde", titulo: "Qtde" },
  { chave: "un", titulo: "Un" },
  { chave: "preco", titulo: "Unitário" },
  { chave: "desconto", titulo: "Desc." },
  { chave: "total", titulo: "Total" },
  { chave: "prazo", titulo: "Prazo" },
];

function linhasDaEmpresa(empresa) {
  if (!empresa) return [];
  const endereco = [empresa.endereco, empresa.numero, empresa.complemento].filter(Boolean).join(", ");
  const cidade = [empresa.bairro, `${empresa.cidade}/${empresa.uf}`, empresa.cep ? `CEP ${empresa.cep}` : null].filter(Boolean).join(" · ");
  const fones = [empresa.telefone, empresa.celular].filter(Boolean).map(formatarTelefone).join(" · ");
  return [
    // Nome fantasia em cima quando difere da razao social: e por ele que o cliente conhece a loja.
    empresa.nomeFantasia && empresa.nomeFantasia !== empresa.razaoSocial ? `${empresa.nomeFantasia} · ${empresa.razaoSocial}` : empresa.razaoSocial,
    [`CNPJ ${empresa.cnpj}`, empresa.inscricaoEstadual ? `IE ${empresa.inscricaoEstadual}` : null].filter(Boolean).join(" · "),
    endereco,
    cidade,
    [fones, empresa.email].filter(Boolean).join(" · "),
  ].filter(Boolean);
}

function linhasDoCliente(proposta) {
  const cliente = proposta.cliente;
  const geral = cliente?.enderecos?.find((e) => e.tipo === "GERAL");
  const endereco = geral
    ? [[geral.logradouro, geral.numero, geral.complemento].filter(Boolean).join(", "), [geral.bairro, geral.cidade && `${geral.cidade}/${geral.uf ?? ""}`, geral.cep && `CEP ${geral.cep}`].filter(Boolean).join(" · ")]
    : [];
  const documento = proposta.clienteDocumento ? `${String(proposta.clienteDocumento).length > 14 ? "CNPJ" : "CPF"} ${proposta.clienteDocumento}` : null;
  return [
    [documento, cliente?.inscricaoEstadual ? `IE ${cliente.inscricaoEstadual}` : null].filter(Boolean).join(" · "),
    ...endereco,
    [proposta.clienteTelefone ? formatarTelefone(proposta.clienteTelefone) : null, proposta.clienteEmail].filter(Boolean).join(" · "),
  ].filter(Boolean);
}

/**
 * @param {object} proposta o retorno de `lerProposta`
 * @param {object|null} empresa `DadosDaEmpresa`
 */
export function conteudoDaProposta(proposta, empresa) {
  const totais = proposta.totais;
  const temDesconto = proposta.itens.some((item) => Number(item.descontoPercentual) > 0);
  const linhasDeTotal = [["Subtotal", moeda.format(totais.subtotal)]];
  if (totais.desconto > 0) linhasDeTotal.push(["Desconto", `− ${moeda.format(totais.desconto)}`]);
  if (totais.frete > 0) linhasDeTotal.push(["Frete", moeda.format(totais.frete)]);

  const frete = [TEXTO_DO_FRETE[proposta.fretePorConta]];
  if (proposta.transportadoraNome && ["CIF", "FOB"].includes(proposta.fretePorConta)) frete.push(`Transportadora: ${proposta.transportadoraNome}`);
  if (proposta.fretePorConta === "FOB" && Number(proposta.frete) > 0) frete.push(`Valor estimado: ${moeda.format(proposta.frete)}`);
  if (proposta.prazoTransporteDias) frete.push(`Prazo de transporte: ${proposta.prazoTransporteDias} dia(s)`);

  const notaFiscal = [proposta.ocCliente ? `Pedido de compra (OC): ${proposta.ocCliente}` : null, proposta.observacoesNf].filter(Boolean).join("\n");

  const blocos = [
    ["Prazo de entrega", prazoGeral(proposta.itens)],
    ["Pagamento", textoDoPagamento(proposta)],
    ["Frete", frete.join("\n")],
    ["Para a nota fiscal", notaFiscal],
    ["Observações", proposta.observacoesCliente],
    ["Garantia", proposta.garantia],
  ].filter(([, valor]) => String(valor ?? "").trim());

  return {
    titulo: numeroDaProposta(proposta.numero),
    data: `Emitida em ${dataBR(new Date(proposta.atualizadoEm ?? proposta.criadoEm))} · Válida até ${dataBR(proposta.validadeAte)}`,
    quemFez: proposta.criadoPorNome ? `Atendimento: ${proposta.criadoPorNome}` : null,
    empresa: linhasDaEmpresa(empresa),
    cliente: { nome: proposta.clienteNome, linhas: linhasDoCliente(proposta), ac: proposta.contatoNome ? `A/C ${proposta.contatoNome}` : null },
    colunas: COLUNAS.filter((c) => c.chave !== "desconto" || temDesconto),
    itens: proposta.itens.map((item, indice) => ({
      id: item.id,
      celulas: {
        item: String(indice + 1),
        descricao: item.descricaoCliente,
        codigo: item.codigoCliente ?? "",
        qtde: quantidade(item.quantidade),
        un: item.unidade,
        preco: unitario.format(item.precoUnitario),
        desconto: Number(item.descontoPercentual) > 0 ? `${String(Number(item.descontoPercentual)).replace(".", ",")}%` : "",
        total: moeda.format(totalDoItem(item)),
        prazo: textoDoPrazo(item),
      },
      obs: item.observacao || null,
    })),
    linhasDeTotal,
    total: moeda.format(totais.total),
    impostos: "Impostos inclusos.",
    blocos,
  };
}
