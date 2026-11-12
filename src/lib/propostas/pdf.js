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
const LOGO = 46;
const LOGO_LARGURA = 170;

const LARGURAS = { item: 22, foto: FOTO + RESPIRO * 2, descricao: 0, codigo: 62, qtde: 36, un: 26, preco: 58, desconto: 34, total: 62, prazo: 68 };
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
    empresa: bruto.empresa.map(f),
    cliente: { nome: f(bruto.cliente.nome), linhas: bruto.cliente.linhas.map(f), ac: bruto.cliente.ac ? f(bruto.cliente.ac) : null },
    quemFez: bruto.quemFez ? f(bruto.quemFez) : null,
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

    // Cabecalho: logo e dados da 4hobby a esquerda; a proposta, as datas e quem fez a direita.
    const topo = doc.y;
    let alturaDoLogo = 0;
    if (extras.logo) {
      try {
        const imagem = doc.openImage(extras.logo);
        const escala = Math.min(LOGO_LARGURA / imagem.width, LOGO / imagem.height);
        alturaDoLogo = imagem.height * escala;
        doc.image(imagem, MARGEM, topo, { width: imagem.width * escala, height: alturaDoLogo });
      } catch {
        alturaDoLogo = 0;
      }
    }
    const colunaDaEmpresa = largura * 0.55;
    doc.font("Helvetica").fontSize(7.5).fillColor(CINZA);
    let yEmpresa = topo + (alturaDoLogo ? alturaDoLogo + 6 : 0);
    for (const linha of conteudo.empresa) {
      doc.text(linha, MARGEM, yEmpresa, { width: colunaDaEmpresa });
      yEmpresa = doc.y;
    }
    doc.font("Helvetica-Bold").fontSize(18).fillColor(TEXTO).text(conteudo.titulo, MARGEM + colunaDaEmpresa, topo, { width: largura - colunaDaEmpresa, align: "right" });
    doc.font("Helvetica").fontSize(8.5).fillColor(CINZA).text(conteudo.data, { width: largura - colunaDaEmpresa, align: "right" });
    if (conteudo.quemFez) doc.text(conteudo.quemFez, { width: largura - colunaDaEmpresa, align: "right" });
    doc.y = Math.max(yEmpresa, doc.y) + 14;

    // Cliente.
    doc.font("Helvetica").fontSize(7.5).fillColor(CINZA).text("CLIENTE", MARGEM, doc.y, { characterSpacing: 0.5 });
    doc.font("Helvetica-Bold").fontSize(12).fillColor(TEXTO).text(conteudo.cliente.nome, { width: largura });
    doc.font("Helvetica").fontSize(8.5).fillColor(TEXTO);
    for (const linha of conteudo.cliente.linhas) doc.text(linha, { width: largura });
    if (conteudo.cliente.ac) doc.font("Helvetica-Bold").text(conteudo.cliente.ac, { width: largura });
    doc.moveDown(0.9);

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
