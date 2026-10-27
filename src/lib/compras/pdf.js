import PDFDocument from "pdfkit";

import { totaisDoPedido } from "@/lib/compras/regras";
import { formatarTelefone } from "@/lib/telefone";

/**
 * O PDF do pedido de compra para o FORNECEDOR (spec §7.6). So o que interessa a ele: o codigo e o nome DELE para cada
 * item, quantidades, precos, totais, pagamento, proposta e observacoes. Nunca o SKU do Rise, foto, estoque ou
 * prazo interno. Fonte padrao (Helvetica), A4; a tabela quebra de pagina repetindo o cabecalho. Devolve um Buffer.
 */

const TEXTO = "#111827";
const CINZA = "#6b7280";
const LINHA = "#e5e7eb";
const MARGEM = 40;

const reais = (valor) => Number(valor ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const unitario = (valor) =>
  valor === null || valor === undefined
    ? "—"
    : Number(valor).toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 4 });
const data = (valor) => (valor ? new Date(valor).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—");

const COLUNAS = [
  { titulo: "#", largura: 22, alinhar: "right" },
  { titulo: "Código", largura: 78 },
  { titulo: "Descrição", largura: 196 },
  { titulo: "Qtde", largura: 40, alinhar: "right" },
  { titulo: "Un", largura: 24 },
  { titulo: "Preço un.", largura: 60, alinhar: "right" },
  { titulo: "IPI %", largura: 33, alinhar: "right" },
  { titulo: "Total", largura: 62, alinhar: "right" },
];

function textoDoPagamento(pedido) {
  const forma = { PIX: "Pix", BOLETO: "Boleto", CARTAO: "Cartão" }[pedido.formaPagamento];
  const comParcelas = forma && pedido.formaPagamento !== "PIX" && pedido.parcelas > 1 ? `${forma} em ${pedido.parcelas}x` : forma;
  // A entrada vai no PDF: o fornecedor precisa saber o que ja recebeu.
  const entrada = Number(pedido.entrada) > 0 ? `Entrada paga: ${reais(pedido.entrada)}` : null;
  return [comParcelas, entrada].filter(Boolean).join(" · ") || null;
}

/**
 * @param {object} pedido  o retorno de `lerPedido` (com fornecedor e itens)
 * @param {object} empresa o retorno de `lerDadosDaEmpresa`
 * @returns {Promise<Buffer>}
 */
export function pdfDoPedido(pedido, empresa) {
  return new Promise((resolver, rejeitar) => {
    const doc = new PDFDocument({ size: "A4", margin: MARGEM, info: { Title: `Pedido de compra ${pedido.codigo}`, Author: empresa?.nomeFantasia ?? "Sistema Rise" } });
    const partes = [];
    doc.on("data", (parte) => partes.push(parte));
    doc.on("end", () => resolver(Buffer.concat(partes)));
    doc.on("error", rejeitar);

    const largura = doc.page.width - MARGEM * 2;
    const fundo = () => doc.page.height - MARGEM;

    // Cabecalho: a loja a esquerda, o pedido a direita.
    const topo = doc.y;
    doc.font("Helvetica-Bold").fontSize(15).fillColor(TEXTO).text(empresa?.nomeFantasia || empresa?.razaoSocial || "", MARGEM, topo, { width: 300 });
    doc.font("Helvetica").fontSize(9).fillColor(CINZA);
    const enderecoDaEmpresa = [
      [empresa?.endereco, empresa?.numero].filter(Boolean).join(", "),
      empresa?.bairro,
      [empresa?.cidade, empresa?.uf].filter(Boolean).join(" – "),
      empresa?.cep ? `CEP ${empresa.cep}` : null,
    ]
      .filter(Boolean)
      .join(" · ");
    for (const linha of [empresa?.razaoSocial, empresa?.cnpj ? `CNPJ ${empresa.cnpj}` : null, enderecoDaEmpresa, empresa?.telefone ? `Telefone ${formatarTelefone(empresa.telefone)}` : null]) {
      if (linha) doc.text(linha, { width: 300 });
    }
    const fimDaEmpresa = doc.y;
    doc.font("Helvetica-Bold").fontSize(15).fillColor(TEXTO).text(`Pedido de compra ${pedido.codigo}`, MARGEM + 300, topo, { width: largura - 300, align: "right" });
    doc.font("Helvetica").fontSize(9).fillColor(CINZA).text(
      pedido.enviadoEm ? `Enviado em ${data(pedido.enviadoEm)}` : `Rascunho de ${data(pedido.criadoEm)}`,
      { width: largura - 300, align: "right" },
    );
    doc.y = Math.max(fimDaEmpresa, doc.y) + 14;

    // Fornecedor.
    const f = pedido.fornecedor ?? {};
    doc.font("Helvetica-Bold").fontSize(10).fillColor(TEXTO).text("Fornecedor", MARGEM, doc.y);
    doc.font("Helvetica").fontSize(9).fillColor(TEXTO).text(f.nome ?? "");
    const contato = [f.cnpj ? `CNPJ ${f.cnpj}` : null, f.contato, f.telefone ? formatarTelefone(f.telefone) : null, f.email].filter(Boolean).join(" · ");
    if (contato) doc.fillColor(CINZA).text(contato);
    doc.moveDown(1);

    // Tabela de itens.
    const cabecalho = () => {
      const y = doc.y;
      doc.rect(MARGEM, y, largura, 16).fill("#f3f4f6");
      let x = MARGEM;
      doc.font("Helvetica-Bold").fontSize(8).fillColor(CINZA);
      for (const coluna of COLUNAS) {
        doc.text(coluna.titulo, x + 3, y + 4, { width: coluna.largura - 6, align: coluna.alinhar ?? "left" });
        x += coluna.largura;
      }
      doc.y = y + 18;
    };
    cabecalho();

    pedido.itens.forEach((item, indice) => {
      const celulas = [
        String(indice + 1),
        item.codigoNoFornecedor || "—",
        item.nomeNoFornecedor || item.nome,
        String(item.quantidade),
        "UN",
        unitario(item.precoUnitario),
        String(Number(item.ipiPercentual ?? 0).toLocaleString("pt-BR")),
        reais(Math.round(Number(item.quantidade) * Number(item.precoUnitario ?? 0) * 100) / 100),
      ];
      doc.font("Helvetica").fontSize(8.5);
      const altura = Math.max(...celulas.map((texto, posicao) => doc.heightOfString(texto, { width: COLUNAS[posicao].largura - 6 }))) + 6;
      if (doc.y + altura > fundo()) {
        doc.addPage();
        cabecalho();
      }
      const y = doc.y;
      let x = MARGEM;
      doc.fillColor(TEXTO);
      celulas.forEach((texto, posicao) => {
        doc.text(texto, x + 3, y + 3, { width: COLUNAS[posicao].largura - 6, align: COLUNAS[posicao].alinhar ?? "left" });
        x += COLUNAS[posicao].largura;
      });
      doc.moveTo(MARGEM, y + altura).lineTo(MARGEM + largura, y + altura).strokeColor(LINHA).lineWidth(0.5).stroke();
      doc.y = y + altura;
    });

    // Totais, alinhados a direita.
    const totais = totaisDoPedido(pedido);
    const linhasDeTotal = [
      ["Total dos produtos", reais(totais.produtos)],
      totais.ipi > 0 ? ["Total do IPI", reais(totais.ipi)] : null,
      Number(pedido.icmsSt) > 0 ? ["ICMS ST", reais(pedido.icmsSt)] : null,
      totais.desconto > 0 ? [pedido.descontoTipo === "PERCENTUAL" ? `Desconto (${pedido.descontoValor}%)` : "Desconto", `− ${reais(totais.desconto)}`] : null,
      Number(pedido.frete) > 0 ? ["Frete", reais(pedido.frete)] : null,
    ].filter(Boolean);
    if (doc.y + (linhasDeTotal.length + 2) * 14 > fundo()) doc.addPage();
    doc.moveDown(0.8);
    for (const [rotulo, valor] of linhasDeTotal) {
      const y = doc.y;
      doc.font("Helvetica").fontSize(9).fillColor(CINZA).text(rotulo, MARGEM + largura - 260, y, { width: 160, align: "right" });
      doc.fillColor(TEXTO).text(valor, MARGEM + largura - 95, y, { width: 95, align: "right" });
      doc.y = y + 13;
    }
    const yTotal = doc.y + 2;
    doc.font("Helvetica-Bold").fontSize(11).fillColor(TEXTO).text("Total do pedido", MARGEM + largura - 260, yTotal, { width: 160, align: "right" });
    doc.text(reais(totais.total), MARGEM + largura - 95, yTotal, { width: 95, align: "right" });
    doc.y = yTotal + 22;

    // Condicoes.
    // O campo Frete (transportadora, CIF/FOB) nao vai ao fornecedor (pedido do dono em 26/10/2026); o valor do frete
    // continua na soma dos totais, senao o total do PDF nao fecharia.
    const condicoes = [
      ["Pagamento", textoDoPagamento(pedido)],
      ["Proposta nº", pedido.propostaNumero],
      ["Observações", pedido.observacoes],
    ].filter(([, valor]) => valor);
    for (const [rotulo, valor] of condicoes) {
      if (doc.y + 30 > fundo()) doc.addPage();
      doc.font("Helvetica-Bold").fontSize(9).fillColor(TEXTO).text(rotulo, MARGEM, doc.y);
      doc.font("Helvetica").fontSize(9).fillColor(TEXTO).text(valor, { width: largura });
      doc.moveDown(0.5);
    }

    doc.end();
  });
}
