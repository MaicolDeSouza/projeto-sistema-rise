import { readFile } from "node:fs/promises";

import PDFDocument from "pdfkit";
import sharp from "sharp";

import { caminhoDe } from "@/lib/arquivos";
import { logoDaEmpresa } from "@/lib/compras/dadosDoPdf";
import { paraFonteDoPdf } from "@/lib/compras/pdf";
import { lerFotoDoItem } from "@/lib/propostas/arquivos";
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
// Foto e fontes das tabelas um passo acima (pedido do dono em 17/11/2026, "mantendo a proporcionalidade").
const FOTO = 38;
const FONTE_DA_FAIXA = 9.3;
const FONTE_DO_TITULO = 8.5;
const FONTE_DO_ITEM = 9.5;
// As areas da empresa e do cliente com a MESMA fonte (pedido do dono em 17/11/2026: a da empresa estava menor, 7,8 contra
// 8,5): titulo de cada bloco, nome (empresa e cliente) e as linhas de dado.
const FONTE_DO_TITULO_DO_BLOCO = 10.5;
const FONTE_DO_NOME = 9.5;
const FONTE_DO_DADO = 8.5;
// O logo INTEIRO (o enviado em Dados da empresa) numa caixa a esquerda do cabecalho, como o farol do modelo do dono. A
// altura termina na linha azul dupla (pedido do dono em 17/11/2026: o logo "passava muito para baixo").
const LOGO_LARGURA = 132;
const LOGO_ALTURA = 56;
// Espaco entre os blocos (17/11/2026: o dono pediu mais respiro entre cabecalho, cliente, condicoes e itens).
const ENTRE_BLOCOS = 22;
// O titulo do documento (pedido do dono em 17/11/2026; ate ali "PROPOSTA").
const TITULO = "PROPOSTA COMERCIAL";
const AZUL = "#1f3d6b";
const AZUL_LINK = "#1d4ed8";
const TEXTO_SUAVE = "#374151";
// Validade, Condicoes de pagamento, Prazo de entrega, Metodo de envio, Garantia, Vendedor (o titulo cabe numa linha).
// Larguras medidas no pdfkit (17/11/2026): "30/60/90 dias após emissão da NF" (144 pt) e cada titulo cabem numa linha.
const PESOS_DA_FAIXA = [102, 152, 83, 81, 55, 50];
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

const LARGURAS = { item: 22, foto: FOTO + RESPIRO * 2, descricao: 0, codigo: 72, marca: 74, qtde: 34, un: 26, preco: 62, desconto: 36, total: 66, prazo: 76 };
// Tudo a esquerda, titulo e dado (pedido do dono em 17/11/2026: "manter um padrao, todas a esquerda"); ate ali numero a
// direita e #, foto e unidade ao centro.
const ALINHAR = {};

/**
 * A foto do item em JPEG pequeno sobre branco (o pdfkit so desenha JPEG e PNG; a foto pode ser WebP): a do produto do
 * Rise ou, no item avulso, a enviada a mao na pasta da proposta.
 */
async function fotoDoItem(item, propostaId) {
  if (!item.foto) return null;
  try {
    const bytes = item.sku ? await readFile(caminhoDe(item.sku, "IMAGEM", item.foto)) : !item.produtoId ? await lerFotoDoItem(propostaId, item.foto) : null;
    if (!bytes) return null;
    return await sharp(bytes).resize(96, 96, { fit: "contain", background: "#ffffff" }).flatten({ background: "#ffffff" }).jpeg({ quality: 82 }).toBuffer();
  } catch {
    return null;
  }
}

/** Logo e fotos: nada aqui derruba o PDF (foto que falta sai em branco). */
export async function dadosDoPdfDaProposta(proposta) {
  const [logo, ...fotos] = await Promise.all([logoDaEmpresa().catch(() => null), ...proposta.itens.map((item) => fotoDoItem(item, proposta.id))]);
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
    bancarios: bruto.bancarios.map(f),
    observacoes: bruto.observacoes ? f(bruto.observacoes) : null,
    entrega: bruto.entrega.map(f),
    faixa: bruto.faixa.map(([r, v]) => [f(r), f(v)]),
    cliente: { nome: f(bruto.cliente.nome), linhas: bruto.cliente.linhas.map(f), ac: bruto.cliente.ac ? f(bruto.cliente.ac) : null, acLinha: bruto.cliente.acLinha ? f(bruto.cliente.acLinha) : null },
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
    // Acima da linha azul (pedido do dono em 17/11/2026): o titulo "PROPOSTA COMERCIAL" no lugar do nome da empresa (o
    // nome ficou so na coluna "Dados da empresa") e, a direita, o numero e a data um embaixo do outro, alinhados a
    // esquerda entre si, o bloco encostado na margem direita pela linha mais larga.
    const yLinha = topo + LOGO_ALTURA - 4;
    const larguraDaLinha = ([rotulo, valor]) => doc.font("Helvetica-Bold").fontSize(10).widthOfString(`${rotulo}: `) + doc.font("Helvetica").fontSize(10).widthOfString(valor);
    const larguraDoQuadro = Math.max(...conteudo.quadro.map(larguraDaLinha));
    const xDoQuadro = MARGEM + largura - larguraDoQuadro;
    let yQuadro = yLinha - 8 - conteudo.quadro.length * 13;
    for (const [rotulo, valor] of conteudo.quadro) {
      doc.font("Helvetica-Bold").fontSize(10).fillColor(TEXTO).text(`${rotulo}: `, xDoQuadro, yQuadro, { continued: true, lineBreak: false });
      doc.font("Helvetica").text(valor, { lineBreak: false });
      yQuadro += 13;
    }
    // O titulo numa linha so: a fonte encolhe ate caber ao lado do numero e da data (o pdfkit quebra a linha mesmo sem lineBreak).
    const espacoDoTitulo = larguraDoTexto - larguraDoQuadro - 14;
    let tamanhoDoTitulo = 20;
    doc.font("Helvetica-Bold");
    while (tamanhoDoTitulo > 12 && doc.fontSize(tamanhoDoTitulo).widthOfString(TITULO) > espacoDoTitulo) tamanhoDoTitulo -= 0.5;
    doc.fontSize(tamanhoDoTitulo).fillColor(TEXTO).text(TITULO, xTexto, yLinha - tamanhoDoTitulo - 6, { width: espacoDoTitulo + 4, lineBreak: false });
    doc.lineWidth(2.6).strokeColor(AZUL).moveTo(xTexto, yLinha).lineTo(MARGEM + largura, yLinha).stroke();
    doc.lineWidth(0.6).moveTo(xTexto, yLinha + 4).lineTo(MARGEM + largura, yLinha + 4).stroke();
    // O A/C embaixo do titulo "PROPOSTA COMERCIAL" (pedido do dono em 17/11/2026; saiu da caixa do cliente).
    let yDoAc = yLinha + 4;
    if (conteudo.cliente.ac) {
      doc.font("Helvetica-Bold").fontSize(FONTE_DO_NOME).fillColor(TEXTO).text(conteudo.cliente.ac, xTexto, yLinha + 10, { width: larguraDoTexto, lineBreak: false });
      yDoAc = yLinha + 10 + FONTE_DO_NOME + 2;
    }

    // As duas areas em caixas com faixa de titulo, no estilo da faixa de condicoes (pedido do dono em 17/11/2026: "dividir
    // melhor essas duas areas"): "4hobby" com as colunas empresa, contato e banco; "Cliente" com os dados e a entrega. A
    // borda e desenhada depois do texto, quando a altura ja e conhecida.
    const PADDING = 8;
    const ALTURA_DA_FAIXA = 19;
    const abrirCaixa = (titulo, y) => {
      doc.rect(MARGEM, y, largura, ALTURA_DA_FAIXA).fill(FUNDO_DO_CABECALHO);
      doc.font("Helvetica-Bold").fontSize(FONTE_DA_FAIXA).fillColor(TEXTO).text(titulo, MARGEM + PADDING, y + 5.5, { lineBreak: false });
      return y + ALTURA_DA_FAIXA + PADDING;
    };
    const fecharCaixa = (yTopo, yFim) => {
      doc.lineWidth(0.5).strokeColor(LINHA).rect(MARGEM, yTopo, largura, yFim - yTopo).stroke();
      doc.moveTo(MARGEM, yTopo + ALTURA_DA_FAIXA).lineTo(MARGEM + largura, yTopo + ALTURA_DA_FAIXA).stroke();
    };
    const xDentro = MARGEM + PADDING;
    const larguraDentro = largura - PADDING * 2;

    // Caixa "4hobby": tres colunas com titulo, "Dados da empresa" (o nome na 1a linha), "Dados para contato" e "Dados
    // bancários"; sem dado bancario a terceira some e as outras duas ficam no lugar.
    const yCaixaDaEmpresa = Math.max(yDoAc, topo + LOGO_ALTURA) + 12;
    // Titulo da caixa "Dados da 4hobby" e sem o "Dados da empresa" dentro (pedido do dono em 17/11/2026): o nome abre a coluna.
    const yInfo = abrirCaixa("Dados da 4hobby", yCaixaDaEmpresa);
    // Colunas 37/33/30 (17/11/2026): com a margem da caixa, em tercos iguais o endereco da empresa quebrava ("2135" sozinho).
    const larguraDaEmpresa = larguraDentro * 0.37;
    const larguraDoContato = larguraDentro * 0.33;
    const larguraDoBanco = larguraDentro - larguraDaEmpresa - larguraDoContato;
    const tituloDaColuna = (texto, x) =>
      doc.font("Helvetica-Bold").fontSize(FONTE_DO_TITULO_DO_BLOCO).fillColor(AZUL).text(texto, x, yInfo, { width: larguraDoContato - 10, lineBreak: false });
    const yDasLinhas = yInfo + 16;
    doc.font("Helvetica-Bold").fontSize(FONTE_DO_NOME).fillColor(TEXTO).text(conteudo.nomeDaEmpresa, xDentro, yInfo, { width: larguraDaEmpresa - 10 });
    let yEndereco = doc.y + 1;
    doc.font("Helvetica").fontSize(FONTE_DO_DADO).fillColor(TEXTO);
    for (const linha of conteudo.empresa) {
      doc.text(linha, xDentro, yEndereco, { width: larguraDaEmpresa - 10 });
      yEndereco = doc.y + 1;
    }
    if (conteudo.site) {
      doc.fillColor(AZUL_LINK).text(conteudo.site.texto, xDentro, yEndereco, { width: larguraDaEmpresa - 10, link: conteudo.site.url, underline: true });
      yEndereco = doc.y + 1;
    }
    const xContatos = xDentro + larguraDaEmpresa;
    tituloDaColuna("Dados para contato", xContatos);
    let yContatos = yDasLinhas;
    for (const contato of conteudo.contatos) {
      desenharIcone(doc, contato.tipo, xContatos, yContatos, 9);
      doc.font("Helvetica").fontSize(FONTE_DO_DADO).fillColor(TEXTO).text(contato.texto, xContatos + 13, yContatos + 0.5, { width: larguraDoContato - 23, link: contato.url ?? undefined, lineBreak: false, ellipsis: true });
      yContatos += 13.5;
    }
    let yBancarios = yDasLinhas;
    if (conteudo.bancarios.length) {
      const xBancarios = xDentro + larguraDaEmpresa + larguraDoContato;
      tituloDaColuna("Dados bancários", xBancarios);
      doc.font("Helvetica").fontSize(FONTE_DO_DADO).fillColor(TEXTO);
      for (const linha of conteudo.bancarios) {
        doc.text(linha, xBancarios, yBancarios, { width: larguraDoBanco - 4 });
        yBancarios = doc.y + 1;
      }
    }
    // A caixa no lugar da linha fina que separava o cabecalho (17/11/2026).
    const yFimDaEmpresa = Math.max(yEndereco, yContatos, yBancarios) + PADDING - 2;
    fecharCaixa(yCaixaDaEmpresa, yFimDaEmpresa);
    doc.y = yFimDaEmpresa + ENTRE_BLOCOS * 0.7;

    // Caixa "Cliente": os dados e o "Endereço de entrega" lado a lado (o "Quoted To / Ship To" do modelo).
    const meia = (larguraDentro - 20) / 2;
    const yCaixaDoCliente = doc.y;
    // Titulo da caixa "Dados do cliente" e sem o "Dados do cliente" dentro (pedido do dono em 17/11/2026).
    const yCliente = abrirCaixa("Dados do cliente", yCaixaDoCliente);
    // Titulos maiores e em azul (pedido do dono em 13/11/2026: "mais evidente"), com os nomes que ele escolheu.
    doc.fillColor(TEXTO);
    doc.font("Helvetica-Bold").fontSize(FONTE_DO_NOME).text(conteudo.cliente.nome, xDentro, yCliente, { width: meia });
    doc.font("Helvetica").fontSize(FONTE_DO_DADO);
    for (const linha of conteudo.cliente.linhas) doc.text(linha, xDentro, doc.y, { width: meia });
    const fimDoCliente = doc.y;
    const xEntrega = xDentro + meia + 20;
    doc.font("Helvetica-Bold").fontSize(FONTE_DO_TITULO_DO_BLOCO).fillColor(AZUL).text("Endereço de entrega", xEntrega, yCliente);
    doc.fillColor(TEXTO);
    doc.font("Helvetica").fontSize(FONTE_DO_DADO).text(conteudo.entrega.join("\n"), xEntrega, doc.y + 2, { width: meia });
    const yFimDoCliente = Math.max(fimDoCliente, doc.y) + PADDING - 2;
    fecharCaixa(yCaixaDoCliente, yFimDoCliente);
    doc.x = MARGEM;
    doc.y = yFimDoCliente + ENTRE_BLOCOS;

    // Faixa de condicoes: validade, pagamento, prazo de entrega, metodo de envio (com o frete por conta) e vendedor.
    const yFaixa = doc.y;
    const totalDosPesos = PESOS_DA_FAIXA.reduce((soma, peso) => soma + peso, 0);
    const larguras = PESOS_DA_FAIXA.map((peso) => (largura * peso) / totalDosPesos);
    const alturaDoTitulo = 19;
    doc.font("Helvetica").fontSize(FONTE_DA_FAIXA);
    const alturaDoValor = Math.max(...conteudo.faixa.map(([, valor], i) => doc.heightOfString(valor, { width: larguras[i] - RESPIRO * 2 }))) + RESPIRO * 2 + 2;
    doc.rect(MARGEM, yFaixa, largura, alturaDoTitulo).fill(FUNDO_DO_CABECALHO);
    let xFaixa = MARGEM;
    conteudo.faixa.forEach(([rotulo, valor], i) => {
      // O titulo encolhe so se nao couber numa linha (com a fonte maior, "Condições de pagamento" fica justo).
      let tamanho = FONTE_DA_FAIXA;
      doc.font("Helvetica-Bold");
      while (tamanho > 7.5 && doc.fontSize(tamanho).widthOfString(rotulo) > larguras[i] - RESPIRO * 2) tamanho -= 0.25;
      doc.fontSize(tamanho).fillColor(TEXTO).text(rotulo, xFaixa + RESPIRO, yFaixa + 5.5, { width: larguras[i] - RESPIRO * 2, align: "center", lineBreak: false });
      doc.font("Helvetica").fontSize(FONTE_DA_FAIXA).text(valor, xFaixa + RESPIRO, yFaixa + alturaDoTitulo + RESPIRO + 1, { width: larguras[i] - RESPIRO * 2, align: "center" });
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
    doc.y = yFaixa + alturaDoTitulo + alturaDoValor + ENTRE_BLOCOS;

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
      const altura = 19;
      doc.rect(MARGEM, y, largura, altura).fill(FUNDO_DO_CABECALHO);
      let x = MARGEM;
      doc.font("Helvetica-Bold").fontSize(FONTE_DO_TITULO).fillColor(CINZA);
      for (const coluna of colunas) {
        doc.text(coluna.titulo, x + RESPIRO, y + 5, { width: coluna.largura - RESPIRO * 2, align: coluna.alinhar, lineBreak: false });
        x += coluna.largura;
      }
      separadores(y, altura);
      doc.y = y + altura;
    };
    cabecalho();

    for (const item of conteudo.itens) {
      doc.font("Helvetica").fontSize(FONTE_DO_ITEM);
      const alturaDoTexto = Math.max(...colunas.map((c) => doc.heightOfString(item.celulas[c.chave] || " ", { width: c.largura - RESPIRO * 2 })));
      const altura = Math.max(alturaDoTexto + RESPIRO * 2, FOTO + 8);
      doc.font("Helvetica-Oblique").fontSize(FONTE_DO_ITEM);
      const alturaDaObs = item.obs ? doc.heightOfString(`Obs.: ${item.obs}`, { width: larguraDaObs }) + RESPIRO * 2 : 0;
      if (doc.y + altura + alturaDaObs > fundo()) {
        doc.addPage();
        cabecalho();
      }
      const y = doc.y;
      const bloco = altura + alturaDaObs;
      if (item.obs) doc.rect(inicioDaObs, y + altura, MARGEM + largura - inicioDaObs, alturaDaObs).fill(FUNDO_DA_OBS);
      let x = MARGEM;
      doc.font("Helvetica").fontSize(FONTE_DO_ITEM).fillColor(TEXTO);
      colunas.forEach((coluna, posicao) => {
        const alturaDaCelula = posicao < INTEIRAS ? bloco : altura;
        if (coluna.chave === "foto") {
          if (fotos[item.id]) {
            try {
              doc.image(fotos[item.id], x + RESPIRO, y + (alturaDaCelula - FOTO) / 2, { fit: [FOTO, FOTO], align: "left", valign: "center" });
            } catch {
              // Foto ilegivel: celula em branco.
            }
          }
        } else {
          const texto = item.celulas[coluna.chave] || " ";
          const alturaDoConteudo = doc.heightOfString(texto, { width: coluna.largura - RESPIRO * 2 });
          // O travessao do item sem codigo fica no centro da celula (pedido do dono em 17/11/2026).
          const alinhar = texto === "—" ? "center" : coluna.alinhar;
          doc.text(texto, x + RESPIRO, y + (alturaDaCelula - alturaDoConteudo) / 2, { width: coluna.largura - RESPIRO * 2, align: alinhar });
        }
        x += coluna.largura;
      });
      if (item.obs) {
        doc.font("Helvetica-BoldOblique").fontSize(FONTE_DO_ITEM).fillColor(TEXTO)
          .text("Obs.: ", inicioDaObs + RESPIRO, y + altura + RESPIRO, { width: larguraDaObs, continued: true })
          .font("Helvetica-Oblique").text(item.obs);
      }
      separadores(y, altura, alturaDaObs);
      doc.y = y + bloco;
    }

    // Quadro do total a direita, no molde da cotacao que o dono mandou (13/11/2026): caixa com Subtotal, Desconto, Frete e
    // Impostos, uma linha por valor, e o Total em destaque no fim.
    const LINHA_DO_TOTAL = 19;
    // Caixa estreita e tudo alinhado a esquerda (pedido do dono em 13/11/2026: "tirar aquele espacamento"): rotulo numa
    // coluna, valor na outra, sem sobra antes do rotulo.
    // A caixa do tamanho do conteudo (o dono em 13/11/2026: sobrava espaco a direita dos valores): rotulo mais largo, 12 pt e o
    // valor mais largo, com 10 pt de cada lado.
    const larguraDoMaior = (textos, fonte, tamanho) => Math.max(...textos.map((texto) => doc.font(fonte).fontSize(tamanho).widthOfString(texto)));
    const COLUNA_DO_VALOR = 10 + Math.max(larguraDoMaior(conteudo.linhasDeTotal.map(([r]) => r), "Helvetica-Bold", 9.5), larguraDoMaior(["Total"], "Helvetica-Bold", 12)) + 14;
    const larguraDaCaixa = COLUNA_DO_VALOR + Math.max(larguraDoMaior(conteudo.linhasDeTotal.map(([, v]) => v), "Helvetica", 9.5), larguraDoMaior([conteudo.total], "Helvetica-Bold", 12)) + 12;
    const xCaixa = MARGEM + largura - larguraDaCaixa;
    const alturaDaCaixa = conteudo.linhasDeTotal.length * LINHA_DO_TOTAL + 26;
    doc.y += 12;
    if (doc.y + alturaDaCaixa > fundo()) doc.addPage();
    const yCaixa = doc.y;
    const linhaDoQuadro = (rotulo, valor, y, altura, tamanho) => {
      doc.font("Helvetica-Bold").fontSize(tamanho).fillColor(TEXTO).text(rotulo, xCaixa + 10, y + (altura - tamanho) / 2 + 1, { width: COLUNA_DO_VALOR - 14, lineBreak: false });
      doc.font(tamanho > 10 ? "Helvetica-Bold" : "Helvetica").text(valor, xCaixa + COLUNA_DO_VALOR, y + (altura - tamanho) / 2 + 1, { width: larguraDaCaixa - COLUNA_DO_VALOR - 10, lineBreak: false });
    };
    conteudo.linhasDeTotal.forEach(([rotulo, valor], i) => linhaDoQuadro(rotulo, valor, yCaixa + i * LINHA_DO_TOTAL, LINHA_DO_TOTAL, 9.5));
    const yDoTotal = yCaixa + conteudo.linhasDeTotal.length * LINHA_DO_TOTAL;
    doc.rect(xCaixa, yDoTotal, larguraDaCaixa, 26).fill(FUNDO_DO_CABECALHO);
    // "Total" (melhoria 8 aprovada em 17/11/2026: "Total (R$) R$ 758,94" repetia o R$).
    linhaDoQuadro("Total", conteudo.total, yDoTotal, 26, 12);
    doc.lineWidth(0.5).strokeColor(LINHA);
    for (let i = 1; i <= conteudo.linhasDeTotal.length; i++) doc.moveTo(xCaixa, yCaixa + i * LINHA_DO_TOTAL).lineTo(xCaixa + larguraDaCaixa, yCaixa + i * LINHA_DO_TOTAL).stroke();
    doc.rect(xCaixa, yCaixa, larguraDaCaixa, alturaDaCaixa).stroke();
    doc.x = MARGEM;
    doc.y = yCaixa + alturaDaCaixa + 16;

    // Observacoes ao cliente numa caixa com titulo (pedido do dono em 17/11/2026); sem observacao, nada.
    if (conteudo.observacoes) {
      doc.font("Helvetica").fontSize(9);
      const alturaDoTexto = doc.heightOfString(conteudo.observacoes, { width: largura - 20 });
      const alturaDaCaixa = alturaDoTexto + 34;
      if (doc.y + Math.min(alturaDaCaixa, 120) > fundo()) doc.addPage();
      const yObs = doc.y;
      doc.font("Helvetica-Bold").fontSize(10).fillColor(AZUL).text("Observações", MARGEM + 10, yObs + 9, { width: largura - 20 });
      doc.font("Helvetica").fontSize(9).fillColor(TEXTO).text(conteudo.observacoes, MARGEM + 10, yObs + 25, { width: largura - 20 });
      // A caixa e desenhada depois do texto (a altura real, mesmo se o texto quebrou de pagina so vale nesta).
      if (doc.y > yObs) doc.lineWidth(0.5).strokeColor(LINHA).rect(MARGEM, yObs, largura, doc.y - yObs + 8).stroke();
      doc.x = MARGEM;
      doc.y += 8 + 14;
    }

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
