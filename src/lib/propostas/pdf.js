import { readFile } from "node:fs/promises";

import PDFDocument from "pdfkit";
import sharp from "sharp";

import { caminhoDe } from "@/lib/arquivos";
import { logoDaEmpresa } from "@/lib/compras/dadosDoPdf";
import { paraFonteDoPdf } from "@/lib/compras/pdf";
import { conteudoDaProposta } from "@/lib/propostas/conteudo";

/**
 * O PDF da proposta para o CLIENTE (spec 2026-11-12). O conteudo e o de `conteudo.js` (o mesmo do link publico); aqui so
 * o desenho, no molde do PDF do pedido de compra: A4, Helvetica, tabela com separadores que quebra de pagina repetindo
 * o cabecalho, a observacao do item numa faixa amarela logo abaixo da linha.
 */

const TEXTO = "#111827";
const CINZA = "#6b7280";
const LINHA = "#d1d5db";
const FUNDO_DO_CABECALHO = "#f3f4f6";
const FUNDO_DA_OBS = "#fffbeb";
const MARGEM = 36;
const RESPIRO = 4;
const FOTO = 30;
// O logo INTEIRO (o enviado em Dados da empresa) numa caixa a esquerda do cabecalho, como o farol do modelo do dono.
const LOGO_LARGURA = 132;
const LOGO_ALTURA = 54;
const AZUL = "#1f3d6b";
const AZUL_LINK = "#1d4ed8";
const TEXTO_SUAVE = "#374151";
// Validade, Condicoes de pagamento, Prazo de entrega, Metodo de envio, Vendedor.
const PESOS_DA_FAIXA = [102, 120, 80, 143, 78];
const VERDE_WHATSAPP = "#25d366";
// Desenhos 24x24 do lucide (os mesmos icones da tela): telefone e envelope.
const TELEFONE =
  "M13.832 16.568a1 1 0 0 0 1.213-.303l.355-.465A2 2 0 0 1 17 15h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2A18 18 0 0 1 2 4a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v3a2 2 0 0 1-.8 1.6l-.468.351a1 1 0 0 0-.292 1.233 14 14 0 0 0 6.392 6.384";
const ENVELOPE = "m22 7-8.991 5.727a2 2 0 0 1-2.009 0L2 7";

/** O icone do contato no cabecalho: telefone (traco), WhatsApp (balao verde com o telefone branco) e e-mail (envelope). */
function desenharIcone(doc, tipo, x, y, tamanho) {
  doc.save().translate(x, y).scale(tamanho / 24);
  if (tipo === "whatsapp") {
    doc.circle(12.5, 11.5, 10.5).fill(VERDE_WHATSAPP);
    doc.polygon([1.5, 23], [3.6, 15.5], [9, 20.5]).fill(VERDE_WHATSAPP);
    doc.save().translate(6.2, 5.2).scale(0.54).path(TELEFONE).lineWidth(3.4).lineJoin("round").lineCap("round").strokeColor("#ffffff").stroke().restore();
  } else if (tipo === "email") {
    doc.roundedRect(2, 4, 20, 16, 2).lineWidth(2.2).strokeColor(TEXTO_SUAVE).stroke();
    doc.path(ENVELOPE).lineWidth(2.2).lineJoin("round").lineCap("round").strokeColor(TEXTO_SUAVE).stroke();
  } else {
    doc.path(TELEFONE).lineWidth(2.2).lineJoin("round").lineCap("round").strokeColor(TEXTO_SUAVE).stroke();
  }
  doc.restore();
}

const LARGURAS = { item: 22, foto: FOTO + RESPIRO * 2, descricao: 0, codigo: 62, marca: 74, qtde: 36, un: 26, preco: 58, desconto: 34, total: 62, prazo: 68 };
const ALINHAR = { item: "center", foto: "center", qtde: "right", un: "center", preco: "right", desconto: "right", total: "right" };

/** A foto do produto do Rise em JPEG pequeno sobre branco (o pdfkit so desenha JPEG e PNG; a foto pode ser WebP). */
async function fotoDoItem(item) {
  if (!item.sku || !item.foto) return null;
  try {
    const bytes = await readFile(caminhoDe(item.sku, "IMAGEM", item.foto));
    return await sharp(bytes).resize(96, 96, { fit: "contain", background: "#ffffff" }).flatten({ background: "#ffffff" }).jpeg({ quality: 82 }).toBuffer();
  } catch {
    return null;
  }
}

/** Logo e fotos: nada aqui derruba o PDF (foto que falta sai em branco). */
export async function dadosDoPdfDaProposta(proposta) {
  const [logo, ...fotos] = await Promise.all([logoDaEmpresa().catch(() => null), ...proposta.itens.map(fotoDoItem)]);
  return { logo, fotos: Object.fromEntries(proposta.itens.map((item, i) => [item.id, fotos[i]])) };
}

/** @returns {Promise<Buffer>} */
export function pdfDaProposta(proposta, empresa, extras = {}) {
  const bruto = conteudoDaProposta(proposta, empresa);
  const f = paraFonteDoPdf;
  const conteudo = {
    ...bruto,
    titulo: f(bruto.titulo),
    nomeDaEmpresa: f(bruto.nomeDaEmpresa),
    quadro: bruto.quadro.map(([r, v]) => [f(r), f(v)]),
    empresa: bruto.empresa.map(f),
    contatos: bruto.contatos.map((c) => ({ ...c, texto: f(c.texto) })),
    entrega: bruto.entrega.map(f),
    faixa: bruto.faixa.map(([r, v]) => [f(r), f(v)]),
    cliente: { nome: f(bruto.cliente.nome), linhas: bruto.cliente.linhas.map(f), ac: bruto.cliente.ac ? f(bruto.cliente.ac) : null },
    itens: bruto.itens.map((item) => ({ ...item, celulas: Object.fromEntries(Object.entries(item.celulas).map(([k, v]) => [k, f(v)])), obs: item.obs ? f(item.obs) : null })),
    blocos: bruto.blocos.map(([r, v]) => [r, f(v)]),
  };
  const fotos = extras.fotos ?? {};

  return new Promise((resolver, rejeitar) => {
    const doc = new PDFDocument({ size: "A4", margin: MARGEM, info: { Title: conteudo.titulo, Author: empresa?.nomeFantasia ?? "4hobby" } });
    const partes = [];
    doc.on("data", (parte) => partes.push(parte));
    doc.on("end", () => resolver(Buffer.concat(partes)));
    doc.on("error", rejeitar);

    const largura = doc.page.width - MARGEM * 2;
    const fundo = () => doc.page.height - MARGEM;

    // Cabecalho no molde do modelo do dono (13/11/2026, a cotacao da Hope Industrial): o logo inteiro a esquerda; ao lado o
    // nome da empresa, "PROPOSTA" a direita e a linha azul dupla; embaixo dela o endereco/CNPJ/site, os contatos com
    // icone e o quadro com o numero e a data.
    const topo = doc.y;
    if (extras.logo) {
      try {
        doc.image(extras.logo, MARGEM, topo, { fit: [LOGO_LARGURA, LOGO_ALTURA], valign: "top" });
      } catch {
        // Logo ilegivel: o espaco fica em branco.
      }
    }
    const xTexto = MARGEM + LOGO_LARGURA + 12;
    const larguraDoTexto = MARGEM + largura - xTexto;
    doc.font("Helvetica-Bold").fontSize(20).fillColor(TEXTO).text("PROPOSTA", xTexto, topo - 2, { width: larguraDoTexto, align: "right" });
    const larguraDoTitulo = doc.widthOfString("PROPOSTA");
    // O nome numa linha so: a fonte encolhe ate caber ao lado do "PROPOSTA" (o pdfkit quebra a linha mesmo sem lineBreak).
    const espacoDoNome = larguraDoTexto - larguraDoTitulo - 12;
    let tamanhoDoNome = 16;
    doc.font("Helvetica-Bold");
    while (tamanhoDoNome > 10 && doc.fontSize(tamanhoDoNome).widthOfString(conteudo.nomeDaEmpresa) > espacoDoNome) tamanhoDoNome -= 0.5;
    doc.fontSize(tamanhoDoNome).fillColor(TEXTO).text(conteudo.nomeDaEmpresa, xTexto, topo + 3 + (16 - tamanhoDoNome) / 2, { width: espacoDoNome + 4, lineBreak: false });
    const yLinha = topo + 25;
    doc.lineWidth(2.6).strokeColor(AZUL).moveTo(xTexto, yLinha).lineTo(MARGEM + largura, yLinha).stroke();
    doc.lineWidth(0.6).moveTo(xTexto, yLinha + 4).lineTo(MARGEM + largura, yLinha + 4).stroke();

    // O logo da 4hobby e largo (engrenagem + nome): as tres colunas comecam embaixo dele e usam a largura toda.
    const yInfo = Math.max(yLinha + 12, topo + LOGO_ALTURA + 6);
    const larguraDoQuadro = 150;
    const larguraDosContatos = 172;
    const larguraDoEndereco = largura - larguraDoQuadro - larguraDosContatos - 24;
    doc.font("Helvetica").fontSize(7.8).fillColor(TEXTO_SUAVE);
    let yEndereco = yInfo;
    for (const linha of conteudo.empresa) {
      doc.text(linha, MARGEM, yEndereco, { width: larguraDoEndereco });
      yEndereco = doc.y + 1;
    }
    if (conteudo.site) {
      doc.fillColor(AZUL_LINK).text(conteudo.site.texto, MARGEM, yEndereco, { width: larguraDoEndereco, link: conteudo.site.url, underline: true });
      yEndereco = doc.y + 1;
    }
    const xContatos = MARGEM + larguraDoEndereco + 12;
    let yContatos = yInfo;
    for (const contato of conteudo.contatos) {
      desenharIcone(doc, contato.tipo, xContatos, yContatos, 8.5);
      doc.font("Helvetica").fontSize(7.8).fillColor(TEXTO_SUAVE).text(contato.texto, xContatos + 12, yContatos + 0.5, { width: larguraDosContatos - 12, link: contato.url ?? undefined, lineBreak: false, ellipsis: true });
      yContatos += 12.5;
    }
    const xQuadro = MARGEM + largura - larguraDoQuadro;
    let yQuadro = yInfo;
    // "Número da proposta: 2026" com o valor logo depois do rotulo, maior e junto (pedido do dono em 13/11/2026: o valor
    // encostado na margem direita ficava longe do rotulo); o bloco encosta na direita pela linha mais larga.
    const larguraDaLinha = ([rotulo, valor]) => doc.font("Helvetica-Bold").fontSize(10).widthOfString(`${rotulo}: `) + doc.font("Helvetica").fontSize(10).widthOfString(valor);
    const xDoBloco = Math.max(xQuadro, MARGEM + largura - Math.max(...conteudo.quadro.map(larguraDaLinha)));
    for (const [rotulo, valor] of conteudo.quadro) {
      doc.font("Helvetica-Bold").fontSize(10).fillColor(TEXTO).text(`${rotulo}: `, xDoBloco, yQuadro, { continued: true, lineBreak: false });
      doc.font("Helvetica").text(valor, { lineBreak: false });
      yQuadro += 15;
    }
    doc.y = Math.max(topo + LOGO_ALTURA, yEndereco, yContatos, yQuadro) + 14;

    // Cliente e "Entregar em" lado a lado (o "Quoted To / Ship To" do modelo).
    const meia = (largura - 20) / 2;
    const yCliente = doc.y;
    // Titulos maiores e em azul (pedido do dono em 13/11/2026: "mais evidente"), com os nomes que ele escolheu.
    doc.font("Helvetica-Bold").fontSize(12).fillColor(AZUL).text("Dados do cliente", MARGEM, yCliente);
    doc.fillColor(TEXTO);
    doc.font("Helvetica-Bold").fontSize(10.5).text(conteudo.cliente.nome, MARGEM + 10, doc.y + 2, { width: meia - 10 });
    doc.font("Helvetica").fontSize(8.5);
    for (const linha of conteudo.cliente.linhas) doc.text(linha, MARGEM + 10, doc.y, { width: meia - 10 });
    if (conteudo.cliente.ac) doc.font("Helvetica-Bold").text(conteudo.cliente.ac, MARGEM + 10, doc.y, { width: meia - 10 });
    const fimDoCliente = doc.y;
    const xEntrega = MARGEM + meia + 20;
    doc.font("Helvetica-Bold").fontSize(12).fillColor(AZUL).text("Endereço de entrega", xEntrega, yCliente);
    doc.fillColor(TEXTO);
    doc.font("Helvetica").fontSize(8.5).text(conteudo.entrega.join("\n"), xEntrega + 10, doc.y + 2, { width: meia - 10 });
    doc.y = Math.max(fimDoCliente, doc.y) + 12;

    // Faixa de condicoes: validade, pagamento, prazo de entrega, metodo de envio (com o frete por conta) e vendedor.
    const yFaixa = doc.y;
    const totalDosPesos = PESOS_DA_FAIXA.reduce((soma, peso) => soma + peso, 0);
    const larguras = PESOS_DA_FAIXA.map((peso) => (largura * peso) / totalDosPesos);
    const alturaDoTitulo = 17;
    doc.font("Helvetica").fontSize(8.3);
    const alturaDoValor = Math.max(...conteudo.faixa.map(([, valor], i) => doc.heightOfString(valor, { width: larguras[i] - RESPIRO * 2 }))) + RESPIRO * 2 + 2;
    doc.rect(MARGEM, yFaixa, largura, alturaDoTitulo).fill(FUNDO_DO_CABECALHO);
    let xFaixa = MARGEM;
    conteudo.faixa.forEach(([rotulo, valor], i) => {
      doc.font("Helvetica-Bold").fontSize(8.3).fillColor(TEXTO).text(rotulo, xFaixa + RESPIRO, yFaixa + 5, { width: larguras[i] - RESPIRO * 2, align: "center", lineBreak: false });
      doc.font("Helvetica").fontSize(8.3).text(valor, xFaixa + RESPIRO, yFaixa + alturaDoTitulo + RESPIRO + 1, { width: larguras[i] - RESPIRO * 2, align: "center" });
      xFaixa += larguras[i];
    });
    doc.lineWidth(0.5).strokeColor(LINHA).rect(MARGEM, yFaixa, largura, alturaDoTitulo + alturaDoValor).stroke();
    doc.moveTo(MARGEM, yFaixa + alturaDoTitulo).lineTo(MARGEM + largura, yFaixa + alturaDoTitulo).stroke();
    xFaixa = MARGEM;
    for (const larguraDaColuna of larguras.slice(0, -1)) {
      xFaixa += larguraDaColuna;
      doc.moveTo(xFaixa, yFaixa).lineTo(xFaixa, yFaixa + alturaDoTitulo + alturaDoValor).stroke();
    }
    doc.x = MARGEM;
    doc.y = yFaixa + alturaDoTitulo + alturaDoValor + 14;

    // Tabela.
    const fixas = conteudo.colunas.reduce((soma, c) => soma + LARGURAS[c.chave], 0);
    const colunas = conteudo.colunas.map((c) => ({ ...c, largura: LARGURAS[c.chave] || largura - fixas, alinhar: ALINHAR[c.chave] ?? "left" }));
    const INTEIRAS = 2;
    const inicioDaObs = MARGEM + colunas.slice(0, INTEIRAS).reduce((s, c) => s + c.largura, 0);
    const larguraDaObs = MARGEM + largura - inicioDaObs - RESPIRO * 2;
    const separadores = (y, altura, alturaDaObs = 0) => {
      let x = MARGEM;
      doc.lineWidth(0.5).strokeColor(LINHA);
      doc.rect(MARGEM, y, largura, altura + alturaDaObs).stroke();
      colunas.slice(0, -1).forEach((coluna, posicao) => {
        x += coluna.largura;
        doc.moveTo(x, y).lineTo(x, y + altura + (posicao < INTEIRAS ? alturaDaObs : 0)).stroke();
      });
      if (alturaDaObs) doc.moveTo(inicioDaObs, y + altura).lineTo(MARGEM + largura, y + altura).stroke();
    };
    const cabecalho = () => {
      const y = doc.y;
      const altura = 17;
      doc.rect(MARGEM, y, largura, altura).fill(FUNDO_DO_CABECALHO);
      let x = MARGEM;
      doc.font("Helvetica-Bold").fontSize(7.5).fillColor(CINZA);
      for (const coluna of colunas) {
        doc.text(coluna.titulo, x + RESPIRO, y + 5, { width: coluna.largura - RESPIRO * 2, align: coluna.alinhar, lineBreak: false });
        x += coluna.largura;
      }
      separadores(y, altura);
      doc.y = y + altura;
    };
    cabecalho();

    for (const item of conteudo.itens) {
      doc.font("Helvetica").fontSize(8.5);
      const alturaDoTexto = Math.max(...colunas.map((c) => doc.heightOfString(item.celulas[c.chave] || " ", { width: c.largura - RESPIRO * 2 })));
      const altura = Math.max(alturaDoTexto + RESPIRO * 2, FOTO + 8);
      doc.font("Helvetica-Oblique").fontSize(8.5);
      const alturaDaObs = item.obs ? doc.heightOfString(`Obs.: ${item.obs}`, { width: larguraDaObs }) + RESPIRO * 2 : 0;
      if (doc.y + altura + alturaDaObs > fundo()) {
        doc.addPage();
        cabecalho();
      }
      const y = doc.y;
      const bloco = altura + alturaDaObs;
      if (item.obs) doc.rect(inicioDaObs, y + altura, MARGEM + largura - inicioDaObs, alturaDaObs).fill(FUNDO_DA_OBS);
      let x = MARGEM;
      doc.font("Helvetica").fontSize(8.5).fillColor(TEXTO);
      colunas.forEach((coluna, posicao) => {
        const alturaDaCelula = posicao < INTEIRAS ? bloco : altura;
        if (coluna.chave === "foto") {
          if (fotos[item.id]) {
            try {
              doc.image(fotos[item.id], x + RESPIRO, y + (alturaDaCelula - FOTO) / 2, { fit: [FOTO, FOTO], align: "center", valign: "center" });
            } catch {
              // Foto ilegivel: celula em branco.
            }
          }
        } else {
          const texto = item.celulas[coluna.chave] || " ";
          const alturaDoConteudo = doc.heightOfString(texto, { width: coluna.largura - RESPIRO * 2 });
          doc.text(texto, x + RESPIRO, y + (alturaDaCelula - alturaDoConteudo) / 2, { width: coluna.largura - RESPIRO * 2, align: coluna.alinhar });
        }
        x += coluna.largura;
      });
      if (item.obs) {
        doc.font("Helvetica-BoldOblique").fontSize(8.5).fillColor(TEXTO)
          .text("Obs.: ", inicioDaObs + RESPIRO, y + altura + RESPIRO, { width: larguraDaObs, continued: true })
          .font("Helvetica-Oblique").text(item.obs);
      }
      separadores(y, altura, alturaDaObs);
      doc.y = y + bloco;
    }

    // Totais a direita.
    if (doc.y + (conteudo.linhasDeTotal.length + 3) * 14 > fundo()) doc.addPage();
    doc.moveDown(0.8);
    for (const [rotulo, valor] of conteudo.linhasDeTotal) {
      const y = doc.y;
      doc.font("Helvetica").fontSize(9).fillColor(CINZA).text(rotulo, MARGEM + largura - 260, y, { width: 160, align: "right" });
      doc.fillColor(TEXTO).text(valor, MARGEM + largura - 95, y, { width: 95, align: "right" });
      doc.y = y + 13;
    }
    const yTotal = doc.y + 2;
    doc.font("Helvetica-Bold").fontSize(12).fillColor(TEXTO).text("Total da proposta", MARGEM + largura - 260, yTotal, { width: 160, align: "right" });
    doc.text(conteudo.total, MARGEM + largura - 95, yTotal, { width: 95, align: "right" });
    doc.font("Helvetica").fontSize(8).fillColor(CINZA).text(conteudo.impostos, MARGEM + largura - 260, yTotal + 16, { width: 255, align: "right" });
    doc.y = yTotal + 34;

    // Condicoes.
    for (const [rotulo, valor] of conteudo.blocos) {
      doc.font("Helvetica").fontSize(9);
      if (doc.y + doc.heightOfString(valor, { width: largura }) + 16 > fundo()) doc.addPage();
      doc.font("Helvetica-Bold").fontSize(9).fillColor(TEXTO).text(rotulo, MARGEM, doc.y);
      doc.font("Helvetica").fontSize(9).fillColor(TEXTO).text(valor, { width: largura });
      doc.moveDown(0.5);
    }

    doc.end();
  });
}
