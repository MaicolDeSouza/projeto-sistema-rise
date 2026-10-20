import PDFDocument from "pdfkit";

import { dataDaChave } from "./semana";

/**
 * O PDF do relatorio semanal (20/10/2026). Texto simples e links clicaveis, paginado sozinho. Devolve um Buffer.
 *
 * Fonte padrao do PDF (Helvetica): cobre os acentos do portugues; nome de loja com caractere fora do Latin-1 sai com "?".
 */

const AZUL = "#1d4ed8";
const VERMELHO = "#b91c1c";
const CINZA = "#6b7280";

const dinheiro = (valor) => (typeof valor === "number" ? `R$ ${valor.toFixed(2).replace(".", ",")}` : "sem preço");
const quando = (data) =>
  data
    ? new Date(data).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })
    : "—";

/**
 * @param {object} entrada
 * @param {string} entrada.semana    chave da rodada ("2026-10-24" ou "manual-...")
 * @param {Date} entrada.inicioEm
 * @param {Date} entrada.fimEm
 * @param {object} entrada.dados     o retorno de `montarDadosDoRelatorio`
 * @param {boolean} [entrada.incompleto] a rodada nao terminou antes da geracao
 * @returns {Promise<Buffer>}
 */
export function gerarPdfDoRelatorio({ semana, inicioEm, fimEm, dados, incompleto = false }) {
  return new Promise((resolver, rejeitar) => {
    const doc = new PDFDocument({ size: "A4", margin: 40, info: { Title: "Relatório semanal da coleta", Author: "Sistema Rise" } });
    const partes = [];
    doc.on("data", (parte) => partes.push(parte));
    doc.on("end", () => resolver(Buffer.concat(partes)));
    doc.on("error", rejeitar);

    const titulo = (texto) => {
      doc.moveDown(0.8).font("Helvetica-Bold").fontSize(13).fillColor("#111827").text(texto);
      doc.moveDown(0.3);
    };
    const normal = (texto, cor = "#111827", tamanho = 9) => doc.font("Helvetica").fontSize(tamanho).fillColor(cor).text(texto);
    const link = (url) => {
      if (!url) return normal("sem link", CINZA, 8);
      doc.font("Helvetica").fontSize(8).fillColor(AZUL).text(url, { link: url, underline: true });
      doc.fillColor("#111827");
    };

    const data = dataDaChave(semana);
    doc.font("Helvetica-Bold").fontSize(18).fillColor("#111827").text("Relatório semanal da coleta");
    normal(
      `${data ? `Rodada de sábado, ${data} · ` : "Rodada manual · "}${quando(inicioEm)} a ${quando(fimEm)}`,
      CINZA,
      10,
    );
    if (incompleto) {
      doc.moveDown(0.4);
      normal("Atenção: a rodada não terminou antes da geração deste relatório. As lojas ainda em varredura aparecem como \"não terminou\".", VERMELHO, 9);
    }

    const { totais } = dados;
    doc.moveDown(0.6);
    normal(
      `${totais.lojas} loja(s) · ${totais.comErro} com erro de leitura · ${totais.naoTerminaram} não terminaram · ${totais.novos} produto(s) novo(s) de concorrentes`,
      "#111827",
      10,
    );

    titulo("1. Leitura das lojas");
    for (const loja of dados.lojas) {
      const cor = loja.situacao === "erro" ? VERMELHO : loja.situacao === "ok" ? "#065f46" : CINZA;
      doc.font("Helvetica-Bold").fontSize(9).fillColor("#111827").text(`${loja.nome} `, { continued: true });
      doc.font("Helvetica").fillColor(CINZA).text(`(${loja.tipo === "CONCORRENTE" ? "concorrente" : "fornecedor"}${loja.produtos !== null ? ` · ${loja.produtos.toLocaleString("pt-BR")} produtos na última coleta` : ""})`);
      normal(loja.texto, cor, 9);
      doc.moveDown(0.3);
    }

    titulo("2. Produtos novos dos concorrentes");
    if (dados.lojasNovas.length > 0) {
      normal(`Lojas cadastradas nesta rodada (a primeira coleta delas não entra na lista): ${dados.lojasNovas.join(", ")}.`, CINZA, 8);
      doc.moveDown(0.3);
    }
    if (dados.novos.length === 0) {
      normal("Nenhum produto novo nos concorrentes nesta rodada.", CINZA);
    }
    for (const loja of dados.novos) {
      doc.font("Helvetica-Bold").fontSize(10).fillColor("#111827").text(`${loja.loja} — ${loja.total} novo(s)`);
      if (loja.total > loja.itens.length) normal(`Mostrando os ${loja.itens.length} primeiros.`, CINZA, 8);
      doc.moveDown(0.2);
      for (const item of loja.itens) {
        normal(`${item.codigo && item.codigo !== "N/A" ? `${item.codigo} · ` : ""}${item.nome ?? "(sem nome)"} · ${dinheiro(item.preco)}`);
        link(item.url);
        doc.moveDown(0.15);
      }
      doc.moveDown(0.3);
    }

    titulo("3. Os 10 mais vendidos dos concorrentes (estimativa)");
    normal(
      "Nenhuma loja publica vendas. A estimativa é a queda do saldo em estoque entre a leitura anterior e a desta rodada, e só vale para concorrentes que informam a quantidade. Reposição de estoque na mesma semana faz a estimativa ficar abaixo do real.",
      CINZA,
      8,
    );
    doc.moveDown(0.3);
    if (dados.lojasQueInformamEstoque.length > 0) {
      normal(`Concorrentes que informam estoque: ${dados.lojasQueInformamEstoque.join(", ")}.`, CINZA, 8);
      doc.moveDown(0.3);
    }
    if (dados.maisVendidos.length === 0) {
      normal("Nenhuma queda de estoque medida nesta rodada (as lojas precisam ter sido lidas em duas rodadas seguidas).", CINZA);
    }
    dados.maisVendidos.forEach((item, indice) => {
      doc.font("Helvetica-Bold").fontSize(9).fillColor("#111827").text(`${indice + 1}. ${item.nome ?? "(sem nome)"}`);
      normal(`${item.loja}${item.codigo && item.codigo !== "N/A" ? ` · ${item.codigo}` : ""} · ${dinheiro(item.preco)} · estoque de ${item.de} para ${item.para} = ${item.vendidos} vendido(s) estimado(s)`);
      link(item.url);
      doc.moveDown(0.3);
    });

    doc.end();
  });
}
