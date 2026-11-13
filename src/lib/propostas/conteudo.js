import { formatarTelefone } from "@/lib/telefone";
import { TEXTO_DO_FRETE, dataBR, numeroDaProposta, prazoGeral, textoDoFaturamentoMinimo, textoDoPagamento, textoDoPrazo, totalDoItem } from "@/lib/propostas/regras";

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
  { chave: "marca", titulo: "Marca / Modelo" },
  { chave: "qtde", titulo: "Qtde" },
  { chave: "un", titulo: "Un" },
  { chave: "preco", titulo: "Unitário" },
  { chave: "desconto", titulo: "Desc." },
  { chave: "total", titulo: "Total" },
  { chave: "prazo", titulo: "Prazo" },
];

/** O nome no topo do PDF (pedido do dono em 13/11/2026: "pode usar 4hobby indústria, comércio e importação"). */
export const NOME_NO_CABECALHO = "4hobby Indústria, Comércio e Importação";

const soDigitos = (texto) => String(texto ?? "").replace(/\D/g, "");

/** Endereco, CNPJ/IE e o site da 4hobby (a coluna da esquerda do cabecalho). */
function dadosDaEmpresa(empresa) {
  if (!empresa) return { linhas: [], site: null };
  const endereco = [empresa.endereco, empresa.numero, empresa.complemento].filter(Boolean).join(", ");
  const cidade = [empresa.bairro, `${empresa.cidade} - ${empresa.uf}`, empresa.cep ? `CEP ${empresa.cep}` : null].filter(Boolean).join(" · ");
  const site = String(empresa.site ?? "").trim();
  return {
    linhas: [
      endereco,
      cidade,
      [`CNPJ ${empresa.cnpj}`, empresa.inscricaoEstadual ? `IE ${empresa.inscricaoEstadual}` : null].filter(Boolean).join(" · "),
    ].filter(Boolean),
    site: site ? { texto: site, url: /^https?:\/\//i.test(site) ? site : `https://${site}` } : null,
  };
}

/**
 * Telefone fixo, os dois WhatsApp (comercial = `celular`, tecnico = `whatsappTecnico`) e o e-mail, cada um com o seu
 * icone (coluna do meio do cabecalho, pedido do dono em 13/11/2026). So o WhatsApp tem link (o dono: "o fixo e o e-mail
 * nao devem ser via link"). Campo vazio nao entra.
 */
function contatosDaEmpresa(empresa) {
  if (!empresa) return [];
  const whatsapp = (numero, rotulo) =>
    soDigitos(numero) ? { tipo: "whatsapp", texto: `${formatarTelefone(numero)} (${rotulo})`, url: `https://wa.me/55${soDigitos(numero)}` } : null;
  return [
    soDigitos(empresa.telefone) ? { tipo: "fone", texto: formatarTelefone(empresa.telefone), url: null } : null,
    whatsapp(empresa.celular, "Contato comercial"),
    whatsapp(empresa.whatsappTecnico, "Contato técnico"),
    empresa.email ? { tipo: "email", texto: empresa.email, url: null } : null,
  ].filter(Boolean);
}

function linhasDoEndereco(endereco) {
  if (!endereco) return [];
  return [
    [endereco.logradouro, endereco.numero, endereco.complemento].filter(Boolean).join(", "),
    [endereco.bairro, endereco.cidade && `${endereco.cidade}${endereco.uf ? ` - ${endereco.uf}` : ""}`, endereco.cep && `CEP ${endereco.cep}`].filter(Boolean).join(" · "),
  ].filter(Boolean);
}

function linhasDoCliente(proposta) {
  const cliente = proposta.cliente;
  const geral = cliente?.enderecos?.find((e) => e.tipo === "GERAL");
  const documento = proposta.clienteDocumento ? `${String(proposta.clienteDocumento).length > 14 ? "CNPJ" : "CPF"} ${proposta.clienteDocumento}` : null;
  return [
    [documento, cliente?.inscricaoEstadual ? `IE ${cliente.inscricaoEstadual}` : null].filter(Boolean).join(" · "),
    ...linhasDoEndereco(geral),
    [proposta.clienteTelefone ? formatarTelefone(proposta.clienteTelefone) : null, proposta.clienteEmail].filter(Boolean).join(" · "),
  ].filter(Boolean);
}

/**
 * O A/C logo abaixo de "Dados do cliente" (pedido do dono em 13/11/2026): o contato escolhido na proposta, que vem dos
 * contatos do cadastro do cliente no Rise, com o cargo, o telefone e o e-mail dele numa linha.
 */
function contatoDoCliente(proposta) {
  if (!proposta.contatoNome) return { ac: null, acLinha: null };
  const contato = proposta.cliente?.contatos?.find((ct) => ct.id === proposta.contatoId);
  const acLinha = [contato?.cargo, contato?.telefone ? formatarTelefone(contato.telefone) : null, contato?.email].filter(Boolean).join(" · ");
  return { ac: `A/C: ${proposta.contatoNome}`, acLinha: acLinha || null };
}

/**
 * "Entregar em" (ao lado do cliente, como o "Ship To" do modelo do dono): o endereco de Entrega do cadastro, senao o
 * Geral; cliente que retira, a frase; sem endereco nenhum (provisorio), "A combinar".
 */
function linhasDaEntrega(proposta) {
  if (proposta.fretePorConta === "RETIRA") return ["Retirada pelo cliente na 4hobby"];
  const enderecos = proposta.cliente?.enderecos ?? [];
  const linhas = linhasDoEndereco(enderecos.find((e) => e.tipo === "ENTREGA"));
  if (linhas.length) return linhas;
  const geral = linhasDoEndereco(enderecos.find((e) => e.tipo === "GERAL"));
  return geral.length ? geral : ["A combinar"];
}

/**
 * "Validade da proposta" em dias (pedido do dono em 13/11/2026: "15 dias"), contados da "Data da proposta" que o PDF mostra
 * ate a data de validade; a proposta que ja venceu mostra a data.
 */
export function validadeEmDias(proposta) {
  const emitida = new Date(proposta.atualizadoEm ?? proposta.criadoEm).toISOString().slice(0, 10);
  const ate = String(proposta.validadeAte instanceof Date ? proposta.validadeAte.toISOString() : proposta.validadeAte ?? "").slice(0, 10);
  if (!ate) return "";
  const dias = Math.round((Date.parse(ate) - Date.parse(emitida)) / 86_400_000);
  if (dias < 1) return `Vencida em ${dataBR(ate)}`;
  return `${dias} ${dias === 1 ? "dia" : "dias"}`;
}

/**
 * A coluna Garantia da faixa so com o prazo (pedido do dono em 13/11/2026: "apenas os dias, por exemplo, 90 dias"): o
 * primeiro "N dias/meses/anos" do texto da garantia; texto sem prazo sai inteiro.
 */
export function prazoDaGarantia(garantia) {
  const texto = String(garantia ?? "").trim();
  if (!texto) return "—";
  const achado = texto.match(/(\d+)\s*(dias?|m[eê]s|meses|anos?)(?![a-zà-ú])/i);
  return achado ? `${achado[1]} ${achado[2].toLowerCase()}` : texto;
}

/** A linha "Frete" do quadro do total: o valor no CIF (zero = por nossa conta) e quem paga nos outros tipos. */
function freteDoTotal(proposta, totais) {
  if (proposta.fretePorConta === "CIF") return totais.frete > 0 ? moeda.format(totais.frete) : "Por nossa conta";
  if (proposta.fretePorConta === "FOB") return "Por conta do cliente";
  if (proposta.fretePorConta === "RETIRA") return "Cliente retira";
  return "A combinar";
}

/** O "Método de envio" da faixa: o tipo de frete (com a explicacao), a transportadora, o valor no FOB e o prazo. */
function metodoDeEnvio(proposta) {
  const partes = [TEXTO_DO_FRETE[proposta.fretePorConta]];
  if (proposta.transportadoraNome && ["CIF", "FOB"].includes(proposta.fretePorConta)) partes.push(proposta.transportadoraNome);
  if (proposta.fretePorConta === "FOB" && Number(proposta.frete) > 0) partes.push(`Valor estimado: ${moeda.format(proposta.frete)}`);
  if (proposta.prazoTransporteDias) partes.push(`Transporte: ${proposta.prazoTransporteDias} dia(s)`);
  return partes.filter(Boolean).join("\n");
}

/**
 * @param {object} proposta o retorno de `lerProposta`
 * @param {object|null} empresa `DadosDaEmpresa`
 */
export function conteudoDaProposta(proposta, empresa) {
  const totais = proposta.totais;
  const temDesconto = proposta.itens.some((item) => Number(item.descontoPercentual) > 0);
  // Marca / Modelo: quando o padrao do cliente exige (SENAI) ou algum item tem; senao a coluna nao ocupa espaco.
  const temMarca = Boolean(proposta.padrao?.exigeMarcaModelo) || proposta.itens.some((item) => item.marca || item.modelo);
  const temCodigo = proposta.itens.some((item) => item.codigoCliente);
  const linhasDeTotal = [["Subtotal", moeda.format(totais.subtotal)]];
  if (totais.desconto > 0) linhasDeTotal.push(["Desconto", `− ${moeda.format(totais.desconto)}`]);
  // Frete e impostos sempre no quadro do total (pedido do dono em 13/11/2026, no molde da cotacao da Hope): o valor so
  // soma no CIF (regra do total); nos outros tipos a linha diz quem paga.
  linhasDeTotal.push(["Frete", freteDoTotal(proposta, totais)]);
  linhasDeTotal.push(["Impostos", "Inclusos"]);

  const notaFiscal = [proposta.ocCliente ? `Pedido de compra (OC): ${proposta.ocCliente}` : null, proposta.observacoesNf].filter(Boolean).join("\n");

  // Prazo, pagamento e frete foram para a faixa de baixo do cabecalho (13/11/2026); aqui fica o resto.
  const blocos = [
    ["Para a nota fiscal", notaFiscal],
    ["Observações", proposta.observacoesCliente],
    ["Faturamento mínimo", textoDoFaturamentoMinimo(empresa?.faturamentoMinimo)],
  ].filter(([, valor]) => String(valor ?? "").trim());

  const empresaNoCabecalho = dadosDaEmpresa(empresa);
  return {
    titulo: numeroDaProposta(proposta.numero),
    nomeDaEmpresa: NOME_NO_CABECALHO,
    quadro: [
      ["Número da proposta", String(proposta.numero)],
      ["Data da proposta", dataBR(new Date(proposta.atualizadoEm ?? proposta.criadoEm))],
    ],
    empresa: empresaNoCabecalho.linhas,
    site: empresaNoCabecalho.site,
    contatos: contatosDaEmpresa(empresa),
    cliente: { nome: proposta.clienteNome, linhas: linhasDoCliente(proposta), ...contatoDoCliente(proposta) },
    entrega: linhasDaEntrega(proposta),
    // A faixa de colunas embaixo do cabecalho (o "Valid Until / Payment Terms / ..." do modelo do dono, 13/11/2026).
    faixa: [
      ["Validade da proposta", validadeEmDias(proposta)],
      ["Condições de pagamento", textoDoPagamento(proposta) || "A combinar"],
      ["Prazo de entrega", prazoGeral(proposta.itens)],
      ["Método de envio", metodoDeEnvio(proposta)],
      // Garantia ao lado do metodo de envio (pedido do dono em 13/11/2026); saiu dos blocos de baixo.
      ["Garantia", prazoDaGarantia(proposta.garantia)],
      ["Vendedor", proposta.criadoPorNome || "—"],
    ],
    colunas: COLUNAS.filter((c) => (c.chave !== "desconto" || temDesconto) && (c.chave !== "marca" || temMarca) && (c.chave !== "codigo" || temCodigo)),
    itens: proposta.itens.map((item, indice) => ({
      id: item.id,
      celulas: {
        item: String(indice + 1),
        descricao: item.descricaoCliente,
        codigo: item.codigoCliente ?? "",
        marca: [item.marca, item.modelo].filter(Boolean).join(" / "),
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
    blocos,
  };
}
