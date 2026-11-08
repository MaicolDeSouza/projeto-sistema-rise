import PDFDocument from "pdfkit";

import { conteudoDoPedido } from "@/lib/compras/conteudoDoPedido";

/**
 * O PDF do pedido de compra para o FORNECEDOR (spec §7.6, refeito a pedido do dono em 06/11/2026). O que entra (e o que
 * nunca entra) e decidido em `conteudoDoPedido.js`, o mesmo do link publico; aqui so o desenho. O cabecalho leva so o
 * logo ("Quero remover os dados da 4hobby, deixar apenas o logo no canto superior esquerdo").
 *
 * Tabela com separador entre todas as colunas e o mesmo respiro em cada lado da celula (o dono nao distinguia o numero
 * do item do codigo). Fonte padrao (Helvetica), A4; a tabela quebra de pagina repetindo o cabecalho. Devolve um Buffer.
 */

const TEXTO = "#111827";
const CINZA = "#6b7280";
const LINHA = "#d1d5db";
const FUNDO_DO_CABECALHO = "#f3f4f6";
const FUNDO_DA_OBS = "#fffbeb";
const MARGEM = 40;
const RESPIRO = 5;
const FOTO = 26;
const LOGO = 46;
const LOGO_LARGURA = 170;

// O que a Helvetica padrao (WinAnsi) desenha alem do Latin-1; o resto sai como "ÿ" (07/11/2026: a lista da NexMind traz
// parenteses de largura total "（B1K…）").
const WINANSI_EXTRA = new Set([..."€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ"]);
const TROCAS = { "【": "[", "】": "]", "「": "[", "」": "]", "『": "[", "』": "]", "〔": "[", "〕": "]", "、": ",", "。": ".", "～": "~", "Ω": "ohm" };

/** O texto como a fonte do PDF consegue desenhar: formas largas viram as comuns (NFKC) e o que nao existe nela sai. */
export function paraFonteDoPdf(texto) {
  return [...String(texto ?? "").normalize("NFKC")]
    .map((letra) => TROCAS[letra] ?? letra)
    .join("")
    .split("")
    .filter((letra) => letra.charCodeAt(0) <= 0xff || WINANSI_EXTRA.has(letra))
    .join("");
}

/** As colunas: a Descricao fica com o que sobra da largura. Sem IPI no estrangeiro. */
function colunasDaTabela(largura, t, comIpi) {
  const fixas = [
    // 30 pt: cabe "999" sem quebrar (com 24, o item 142 saia "14" / "2", 07/11/2026).
    { chave: "item", largura: 30, alinhar: "center" },
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
  const bruto = conteudoDoPedido(pedido, extras);
  // So o PDF passa pela fonte limitada; a pagina do link publico (HTML) mostra o texto como veio.
  const conteudo = {
    ...bruto,
    titulo: paraFonteDoPdf(bruto.titulo),
    fornecedor: { nome: paraFonteDoPdf(bruto.fornecedor.nome), contato: paraFonteDoPdf(bruto.fornecedor.contato) },
    itens: bruto.itens.map((item) => ({
      ...item,
      celulas: Object.fromEntries(Object.entries(item.celulas).map(([chave, valor]) => [chave, paraFonteDoPdf(valor)])),
      obs: item.obs ? paraFonteDoPdf(item.obs) : null,
    })),
    condicoes: bruto.condicoes.map(([rotulo, valor]) => [rotulo, paraFonteDoPdf(valor)]),
  };
  const { t } = conteudo;
  const fotos = extras.fotos ?? {};

  return new Promise((resolver, rejeitar) => {
    const doc = new PDFDocument({
      size: "A4",
      margin: MARGEM,
      info: { Title: conteudo.titulo, Author: empresa?.nomeFantasia ?? "Sistema Rise" },
    });
    const partes = [];
    doc.on("data", (parte) => partes.push(parte));
    doc.on("end", () => resolver(Buffer.concat(partes)));
    doc.on("error", rejeitar);

    const largura = doc.page.width - MARGEM * 2;
    const fundo = () => doc.page.height - MARGEM;

    // Cabecalho: o logo a esquerda, o pedido a direita. O logo inteiro (engrenagem + "4HOBBY", 07/11/2026) e largo: cabe
    // em LOGO de altura e ate LOGO_LARGURA de largura, na proporcao dele; a engrenagem sozinha continua quadrada.
    const topo = doc.y;
    let larguraDoLogo = LOGO;
    let alturaDoLogo = LOGO;
    if (extras.logo) {
      try {
        const imagem = doc.openImage(extras.logo);
        const escala = Math.min(LOGO_LARGURA / imagem.width, LOGO / imagem.height);
        larguraDoLogo = imagem.width * escala;
        alturaDoLogo = imagem.height * escala;
        doc.image(imagem, MARGEM, topo, { width: larguraDoLogo, height: alturaDoLogo });
      } catch {
        // Logo ilegivel nao derruba o PDF.
      }
    }
    doc.font("Helvetica-Bold").fontSize(16).fillColor(TEXTO).text(conteudo.titulo, MARGEM + larguraDoLogo + 12, topo + 4, { width: largura - larguraDoLogo - 12, align: "right" });
    doc.font("Helvetica").fontSize(9).fillColor(CINZA).text(conteudo.data, { width: largura - larguraDoLogo - 12, align: "right" });
    doc.y = Math.max(topo + alturaDoLogo, doc.y) + 16;

    // Fornecedor: so o nome e o A/C (o contato dele).
    doc.font("Helvetica").fontSize(8).fillColor(CINZA).text(t.fornecedor.toUpperCase(), MARGEM, doc.y, { characterSpacing: 0.5 });
    doc.font("Helvetica-Bold").fontSize(12).fillColor(TEXTO).text(conteudo.fornecedor.nome);
    doc.font("Helvetica").fontSize(9.5).fillColor(TEXTO).text(`${t.ac} ${conteudo.fornecedor.contato}`.trim());
    doc.moveDown(1);

    // Tabela de itens, com separador entre as colunas.
    const colunas = colunasDaTabela(largura, t, !conteudo.estrangeiro);
    // Com observacao, o "#" e a Foto ocupam as duas alturas (linha + faixa da Obs.); as demais colunas param na linha.
    const COLUNAS_INTEIRAS = 2;
    const inicioDaObs = MARGEM + colunas.slice(0, COLUNAS_INTEIRAS).reduce((soma, coluna) => soma + coluna.largura, 0);
    const larguraDaObs = MARGEM + largura - inicioDaObs - RESPIRO * 2;
    const separadores = (y, altura, alturaDaObs = 0) => {
      let x = MARGEM;
      doc.lineWidth(0.5).strokeColor(LINHA);
      doc.rect(MARGEM, y, largura, altura + alturaDaObs).stroke();
      colunas.slice(0, -1).forEach((coluna, posicao) => {
        x += coluna.largura;
        doc.moveTo(x, y).lineTo(x, y + altura + (posicao < COLUNAS_INTEIRAS ? alturaDaObs : 0)).stroke();
      });
      if (alturaDaObs) doc.moveTo(inicioDaObs, y + altura).lineTo(MARGEM + largura, y + altura).stroke();
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

    for (const item of conteudo.itens) {
      const { celulas, obs } = item;
      doc.font("Helvetica").fontSize(8.5);
      const alturaDoTexto = Math.max(...colunas.map((coluna) => doc.heightOfString(celulas[coluna.chave] || " ", { width: coluna.largura - RESPIRO * 2 })));
      const altura = Math.max(alturaDoTexto + RESPIRO * 2, FOTO + 8);
      // A observacao do item ("+Obs.", 07/11/2026): faixa logo abaixo da linha, do Codigo ao Total, com "#" e Foto
      // compartilhados, para ficar claro de que item ela e.
      doc.font("Helvetica-Oblique").fontSize(8.5);
      const alturaDaObs = obs ? doc.heightOfString(`${t.obsDoItem} ${obs}`, { width: larguraDaObs }) + RESPIRO * 2 : 0;
      if (doc.y + altura + alturaDaObs > fundo()) {
        doc.addPage();
        cabecalho();
      }
      const y = doc.y;
      const alturaDoBloco = altura + alturaDaObs;
      if (obs) doc.rect(inicioDaObs, y + altura, MARGEM + largura - inicioDaObs, alturaDaObs).fill(FUNDO_DA_OBS);
      let x = MARGEM;
      doc.font("Helvetica").fontSize(8.5).fillColor(TEXTO);
      colunas.forEach((coluna, posicao) => {
        // "#" e Foto centrados no bloco inteiro; o resto, na altura da linha.
        const alturaDaCelula = posicao < COLUNAS_INTEIRAS ? alturaDoBloco : altura;
        if (coluna.chave === "foto") {
          const foto = fotos[item.id];
          if (foto) {
            try {
              doc.image(foto, x + RESPIRO, y + (alturaDaCelula - FOTO) / 2, { fit: [FOTO, FOTO], align: "center", valign: "center" });
            } catch {
              // Foto ilegivel: a celula fica em branco.
            }
          }
        } else {
          // Texto centrado na altura da linha (a foto deixa a linha mais alta que o texto).
          const alturaDoConteudo = doc.heightOfString(celulas[coluna.chave] || " ", { width: coluna.largura - RESPIRO * 2 });
          doc.text(celulas[coluna.chave], x + RESPIRO, y + (alturaDaCelula - alturaDoConteudo) / 2, {
            width: coluna.largura - RESPIRO * 2,
            align: coluna.alinhar ?? "left",
          });
        }
        x += coluna.largura;
      });
      if (obs) {
        doc.font("Helvetica-BoldOblique").fontSize(8.5).fillColor(TEXTO)
          .text(`${t.obsDoItem} `, inicioDaObs + RESPIRO, y + altura + RESPIRO, { width: larguraDaObs, continued: true })
          .font("Helvetica-Oblique").text(obs);
      }
      separadores(y, altura, alturaDaObs);
      doc.y = y + alturaDoBloco;
    }

    // Totais, alinhados a direita. No estrangeiro, em dolar e sem imposto.
    if (doc.y + (conteudo.linhasDeTotal.length + 2) * 14 > fundo()) doc.addPage();
    doc.moveDown(0.8);
    for (const [rotulo, valor] of conteudo.linhasDeTotal) {
      const y = doc.y;
      doc.font("Helvetica").fontSize(9).fillColor(CINZA).text(rotulo, MARGEM + largura - 260, y, { width: 160, align: "right" });
      doc.fillColor(TEXTO).text(valor, MARGEM + largura - 95, y, { width: 95, align: "right" });
      doc.y = y + 13;
    }
    const yTotal = doc.y + 2;
    doc.font("Helvetica-Bold").fontSize(11).fillColor(TEXTO).text(t.totalDoPedido, MARGEM + largura - 260, yTotal, { width: 160, align: "right" });
    doc.text(conteudo.totalDoPedido, MARGEM + largura - 95, yTotal, { width: 95, align: "right" });
    doc.y = yTotal + 22;

    // Condicoes: pagamento, proposta e a "Obs para o fornecedor".
    for (const [rotulo, valor] of conteudo.condicoes) {
      if (doc.y + 30 > fundo()) doc.addPage();
      doc.font("Helvetica-Bold").fontSize(9).fillColor(TEXTO).text(rotulo, MARGEM, doc.y);
      doc.font("Helvetica").fontSize(9).fillColor(TEXTO).text(valor, { width: largura });
      doc.moveDown(0.5);
    }

    doc.end();
  });
}
