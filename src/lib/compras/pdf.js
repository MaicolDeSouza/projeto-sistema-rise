import PDFDocument from "pdfkit";

import { totaisDoPedido } from "@/lib/compras/regras";

/**
 * O PDF do pedido de compra para o FORNECEDOR (spec §7.6, refeito a pedido do dono em 06/11/2026). So o que interessa a
 * ele: o codigo, o nome e a FOTO dele para cada item, quantidades, precos, totais, pagamento, proposta e a "Obs para o
 * fornecedor". Nunca o SKU do Rise, estoque, prazo interno, as observacoes internas nem os dados da 4hobby (o cabecalho
 * leva so o logo: "Quero remover os dados da 4hobby, deixar apenas o logo no canto superior esquerdo").
 *
 * Fornecedor estrangeiro (moeda da lista diferente de R$, NexMind): o PDF sai em INGLES, em DOLAR e sem o fator de
 * importacao (o custo em reais do Rise e dolar x cotacao x fator; o fornecedor cobra o dolar), e sem IPI nem impostos.
 *
 * Tabela com separador entre todas as colunas e o mesmo respiro em cada lado da celula (o dono nao distinguia o numero
 * do item do codigo). Fonte padrao (Helvetica), A4; a tabela quebra de pagina repetindo o cabecalho. Devolve um Buffer.
 */

const TEXTO = "#111827";
const CINZA = "#6b7280";
const LINHA = "#d1d5db";
const FUNDO_DO_CABECALHO = "#f3f4f6";
const MARGEM = 40;
const RESPIRO = 5;
const FOTO = 26;
const LOGO = 46;

const TEXTOS = {
  pt: {
    titulo: "Pedido de compra",
    enviado: "Enviado em",
    rascunho: "Rascunho de",
    fornecedor: "Fornecedor",
    ac: "A/C:",
    colunas: { item: "#", foto: "Foto", codigo: "Código", descricao: "Descrição", qtde: "Qtde", un: "Un", preco: "Preço un.", ipi: "IPI %", total: "Total" },
    unidade: "UN",
    produtos: "Total dos produtos",
    ipi: "Total do IPI",
    icmsSt: "ICMS ST",
    imposto: "Imposto",
    desconto: "Desconto",
    frete: "Frete",
    totalDoPedido: "Total do pedido",
    pagamento: "Pagamento",
    proposta: "Proposta nº",
    obs: "Observações",
    formas: { PIX: "Pix", BOLETO: "Boleto", CARTAO: "Cartão" },
    parcelado: (forma, parcelas) => `${forma} em ${parcelas}x`,
    entrada: "Entrada paga:",
  },
  en: {
    titulo: "Purchase Order",
    enviado: "Sent on",
    rascunho: "Draft of",
    fornecedor: "Supplier",
    ac: "Attn:",
    colunas: { item: "#", foto: "Photo", codigo: "Code", descricao: "Description", qtde: "Qty", un: "Unit", preco: "Unit price", ipi: "", total: "Total" },
    unidade: "pcs",
    produtos: "Products total",
    ipi: "",
    icmsSt: "",
    imposto: "",
    desconto: "Discount",
    frete: "Freight",
    totalDoPedido: "Order total",
    pagamento: "Payment",
    proposta: "Proposal no.",
    obs: "Notes",
    formas: { PIX: "Pix", BOLETO: "Bank slip", CARTAO: "Credit card" },
    parcelado: (forma, parcelas) => `${forma} in ${parcelas} installments`,
    entrada: "Down payment:",
  },
};

function formatadores(estrangeiro, moeda) {
  const local = estrangeiro ? "en-US" : "pt-BR";
  const codigo = estrangeiro ? moeda : "BRL";
  const dinheiro = (valor, casas = 2) =>
    Number(valor ?? 0).toLocaleString(local, { style: "currency", currency: codigo, minimumFractionDigits: 2, maximumFractionDigits: casas });
  return {
    dinheiro,
    unitario: (valor) => (valor === null || valor === undefined ? "—" : dinheiro(valor, 4)),
    numero: (valor) => Number(valor ?? 0).toLocaleString(local),
    data: (valor) =>
      valor
        ? new Date(valor).toLocaleDateString(local, estrangeiro
          ? { timeZone: "America/Sao_Paulo", month: "short", day: "numeric", year: "numeric" }
          : { timeZone: "America/Sao_Paulo" })
        : "—",
  };
}

/** As colunas: a Descricao fica com o que sobra da largura. Sem IPI no estrangeiro. */
function colunasDaTabela(largura, t, comIpi) {
  const fixas = [
    { chave: "item", largura: 24, alinhar: "center" },
    { chave: "foto", largura: FOTO + RESPIRO * 2, alinhar: "center" },
    { chave: "codigo", largura: 64 },
    { chave: "descricao", largura: 0 },
    { chave: "qtde", largura: 38, alinhar: "right" },
    { chave: "un", largura: 30, alinhar: "center" },
    { chave: "preco", largura: 66, alinhar: "right" },
    ...(comIpi ? [{ chave: "ipi", largura: 38, alinhar: "right" }] : []),
    { chave: "total", largura: 72, alinhar: "right" },
  ];
  const ocupada = fixas.reduce((soma, coluna) => soma + coluna.largura, 0);
  return fixas.map((coluna) => ({ ...coluna, titulo: t.colunas[coluna.chave], largura: coluna.largura || largura - ocupada }));
}

/**
 * @param {object} pedido  o retorno de `lerPedido` (com fornecedor e itens)
 * @param {object} empresa o retorno de `lerDadosDaEmpresa` (so o nome, nos metadados do arquivo)
 * @param {{ logo?: Buffer|null, estrangeiro?: boolean, moeda?: string, cotacao?: number|null,
 *   fotos?: Record<string, Buffer|null>, dolar?: Record<string, number|null> }} [extras] o retorno de `dadosDoPdf`
 * @returns {Promise<Buffer>}
 */
export function pdfDoPedido(pedido, empresa, extras = {}) {
  const estrangeiro = Boolean(extras.estrangeiro);
  const t = TEXTOS[estrangeiro ? "en" : "pt"];
  const f = formatadores(estrangeiro, extras.moeda ?? "USD");
  const fotos = extras.fotos ?? {};
  // Estrangeiro: o preco de cada item em dolar sem o fator; os valores do pedido em reais (frete, desconto em R$,
  // entrada) voltam pela cotacao, sem fator (nao sao custo de importacao).
  const cotacao = extras.cotacao > 0 ? extras.cotacao : null;
  const emMoeda = (reais) => (estrangeiro ? (cotacao ? Math.round((Number(reais ?? 0) / cotacao) * 100) / 100 : 0) : Number(reais ?? 0));
  const itens = pedido.itens.map((item) => ({
    ...item,
    precoUnitario: estrangeiro ? (extras.dolar?.[item.id] ?? null) : item.precoUnitario,
    ipiPercentual: estrangeiro ? 0 : item.ipiPercentual,
  }));

  return new Promise((resolver, rejeitar) => {
    const doc = new PDFDocument({
      size: "A4",
      margin: MARGEM,
      info: { Title: `${t.titulo} ${pedido.codigo}`, Author: empresa?.nomeFantasia ?? "Sistema Rise" },
    });
    const partes = [];
    doc.on("data", (parte) => partes.push(parte));
    doc.on("end", () => resolver(Buffer.concat(partes)));
    doc.on("error", rejeitar);

    const largura = doc.page.width - MARGEM * 2;
    const fundo = () => doc.page.height - MARGEM;

    // Cabecalho: o logo a esquerda, o pedido a direita.
    const topo = doc.y;
    if (extras.logo) {
      try {
        doc.image(extras.logo, MARGEM, topo, { fit: [LOGO, LOGO] });
      } catch {
        // Logo ilegivel nao derruba o PDF.
      }
    }
    doc.font("Helvetica-Bold").fontSize(16).fillColor(TEXTO).text(`${t.titulo} ${pedido.codigo}`, MARGEM + LOGO + 12, topo + 4, { width: largura - LOGO - 12, align: "right" });
    doc.font("Helvetica").fontSize(9).fillColor(CINZA).text(
      pedido.enviadoEm ? `${t.enviado} ${f.data(pedido.enviadoEm)}` : `${t.rascunho} ${f.data(pedido.criadoEm)}`,
      { width: largura - LOGO - 12, align: "right" },
    );
    doc.y = Math.max(topo + LOGO, doc.y) + 16;

    // Fornecedor: so o nome e o A/C (o contato dele).
    const fornecedor = pedido.fornecedor ?? {};
    doc.font("Helvetica").fontSize(8).fillColor(CINZA).text(t.fornecedor.toUpperCase(), MARGEM, doc.y, { characterSpacing: 0.5 });
    doc.font("Helvetica-Bold").fontSize(12).fillColor(TEXTO).text(fornecedor.nome ?? "");
    doc.font("Helvetica").fontSize(9.5).fillColor(TEXTO).text(`${t.ac} ${fornecedor.contato ?? ""}`.trim());
    doc.moveDown(1);

    // Tabela de itens, com separador entre as colunas.
    const colunas = colunasDaTabela(largura, t, !estrangeiro);
    const separadores = (y, altura) => {
      let x = MARGEM;
      doc.lineWidth(0.5).strokeColor(LINHA);
      doc.rect(MARGEM, y, largura, altura).stroke();
      for (const coluna of colunas.slice(0, -1)) {
        x += coluna.largura;
        doc.moveTo(x, y).lineTo(x, y + altura).stroke();
      }
    };
    const cabecalho = () => {
      const y = doc.y;
      const altura = 18;
      doc.rect(MARGEM, y, largura, altura).fill(FUNDO_DO_CABECALHO);
      let x = MARGEM;
      doc.font("Helvetica-Bold").fontSize(8).fillColor(CINZA);
      for (const coluna of colunas) {
        doc.text(coluna.titulo, x + RESPIRO, y + 5.5, { width: coluna.largura - RESPIRO * 2, align: coluna.alinhar ?? "left", lineBreak: false });
        x += coluna.largura;
      }
      separadores(y, altura);
      doc.y = y + altura;
    };
    cabecalho();

    itens.forEach((item, indice) => {
      const codigo = item.codigoNoFornecedor && item.codigoNoFornecedor !== "N/A" ? item.codigoNoFornecedor : "—";
      const total = item.precoUnitario === null ? null : Math.round(Number(item.quantidade) * Number(item.precoUnitario) * 100) / 100;
      const celulas = {
        item: String(indice + 1),
        foto: "",
        codigo,
        descricao: item.nomeNoFornecedor || item.nome,
        qtde: f.numero(item.quantidade),
        un: t.unidade,
        preco: f.unitario(item.precoUnitario),
        ipi: f.numero(item.ipiPercentual ?? 0),
        total: total === null ? "—" : f.dinheiro(total),
      };
      doc.font("Helvetica").fontSize(8.5);
      const alturaDoTexto = Math.max(...colunas.map((coluna) => doc.heightOfString(celulas[coluna.chave] || " ", { width: coluna.largura - RESPIRO * 2 })));
      const altura = Math.max(alturaDoTexto + RESPIRO * 2, FOTO + 8);
      if (doc.y + altura > fundo()) {
        doc.addPage();
        cabecalho();
      }
      const y = doc.y;
      let x = MARGEM;
      doc.fillColor(TEXTO);
      for (const coluna of colunas) {
        if (coluna.chave === "foto") {
          const foto = fotos[item.id];
          if (foto) {
            try {
              doc.image(foto, x + RESPIRO, y + (altura - FOTO) / 2, { fit: [FOTO, FOTO], align: "center", valign: "center" });
            } catch {
              // Foto ilegivel: a celula fica em branco.
            }
          }
        } else {
          // Texto centrado na altura da linha (a foto deixa a linha mais alta que o texto).
          const alturaDaCelula = doc.heightOfString(celulas[coluna.chave] || " ", { width: coluna.largura - RESPIRO * 2 });
          doc.text(celulas[coluna.chave], x + RESPIRO, y + (altura - alturaDaCelula) / 2, {
            width: coluna.largura - RESPIRO * 2,
            align: coluna.alinhar ?? "left",
          });
        }
        x += coluna.largura;
      }
      separadores(y, altura);
      doc.y = y + altura;
    });

    // Totais, alinhados a direita. No estrangeiro, em dolar e sem imposto.
    const totais = totaisDoPedido({
      itens,
      icmsSt: estrangeiro ? 0 : pedido.icmsSt,
      imposto: estrangeiro ? 0 : pedido.imposto,
      descontoTipo: pedido.descontoTipo,
      descontoValor: pedido.descontoTipo === "PERCENTUAL" ? pedido.descontoValor : emMoeda(pedido.descontoValor),
      frete: emMoeda(pedido.frete),
      entrada: emMoeda(pedido.entrada),
    });
    const linhasDeTotal = [
      [t.produtos, f.dinheiro(totais.produtos)],
      !estrangeiro && totais.ipi > 0 ? [t.ipi, f.dinheiro(totais.ipi)] : null,
      !estrangeiro && Number(pedido.icmsSt) > 0 ? [t.icmsSt, f.dinheiro(pedido.icmsSt)] : null,
      !estrangeiro && Number(pedido.imposto) > 0 ? [t.imposto, f.dinheiro(pedido.imposto)] : null,
      totais.desconto > 0
        ? [pedido.descontoTipo === "PERCENTUAL" ? `${t.desconto} (${pedido.descontoValor}%)` : t.desconto, `− ${f.dinheiro(totais.desconto)}`]
        : null,
      Number(pedido.frete) > 0 ? [t.frete, f.dinheiro(emMoeda(pedido.frete))] : null,
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
    doc.font("Helvetica-Bold").fontSize(11).fillColor(TEXTO).text(t.totalDoPedido, MARGEM + largura - 260, yTotal, { width: 160, align: "right" });
    doc.text(f.dinheiro(totais.total), MARGEM + largura - 95, yTotal, { width: 95, align: "right" });
    doc.y = yTotal + 22;

    // Condicoes. O campo Frete (transportadora, CIF/FOB) nao vai ao fornecedor (pedido do dono em 26/10/2026); o valor
    // do frete continua na soma dos totais. As observacoes INTERNAS nunca vao (06/11/2026): so a "Obs para o fornecedor".
    const forma = t.formas[pedido.formaPagamento];
    const pagamento = [
      forma && pedido.formaPagamento !== "PIX" && pedido.parcelas > 1 ? t.parcelado(forma, pedido.parcelas) : forma,
      Number(pedido.entrada) > 0 ? `${t.entrada} ${f.dinheiro(emMoeda(pedido.entrada))}` : null,
    ].filter(Boolean).join(" · ");
    const condicoes = [
      [t.pagamento, pagamento],
      [t.proposta, pedido.propostaNumero],
      [t.obs, pedido.observacoesFornecedor],
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
