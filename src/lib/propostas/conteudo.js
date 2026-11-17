import { formatarTelefone } from "@/lib/telefone";
import { TEXTO_DO_FRETE, dataBR, garantiaCurta, itensComFreteDiluido, nomeDoItemParaOCliente, numeroDaProposta, prazoDaFaixa, textoDoFaturamentoMinimo, textoDoPagamento, textoDoPrazo, totalDoItem } from "@/lib/propostas/regras";

/**
 * O que o CLIENTE le, igual no PDF e no link publico (spec 2026-11-12, "PDF e link publico"). Aqui se decide o que
 * entra; `pdf.js` e `paginaPublica.js` so desenham.
 *
 * NUNCA entra: custo, lucro, observacoes internas, contatos registrados e anexos. O item aparece pela descricao do
 * cliente quando preenchida, senao pelo nome do Rise, e sempre pelo CODIGO DO RISE (decisao do dono em 17/11/2026; ate
 * ali eram a descricao e o codigo do cliente, e o nosso nome e codigo nunca saiam).
 */

const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const unitario = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 4 });
const quantidade = (valor) => Number(valor).toLocaleString("pt-BR", { maximumFractionDigits: 3 });

export const COLUNAS = [
  { chave: "item", titulo: "#" },
  { chave: "foto", titulo: "Foto" },
  { chave: "descricao", titulo: "Descrição" },
  { chave: "codigo", titulo: "Código 4hobby" },
  { chave: "marca", titulo: "Marca / Modelo" },
  { chave: "qtde", titulo: "Qtde" },
  { chave: "un", titulo: "Un" },
  { chave: "preco", titulo: "Unitário" },
  { chave: "desconto", titulo: "Desc." },
  { chave: "total", titulo: "Total" },
  { chave: "prazo", titulo: "Prazo" },
];

/** O nome no topo do PDF (pedido do dono em 13/11/2026: "pode usar 4hobby indústria, comércio e importação"). */
// Sem "Importação" (pedido do dono em 17/11/2026, para caber numa linha na caixa "4hobby" com a fonte nova).
export const NOME_NO_CABECALHO = "4hobby Indústria e Comércio";

const soDigitos = (texto) => String(texto ?? "").replace(/\D/g, "");

/** Endereco, CNPJ/IE e o site da 4hobby (a coluna da esquerda do cabecalho). */
function dadosDaEmpresa(empresa) {
  if (!empresa) return { linhas: [], site: null };
  const endereco = [empresa.endereco, empresa.numero, empresa.complemento].filter(Boolean).join(", ");
  // O CEP numa linha propria (melhoria 5 aprovada em 17/11/2026): no fim da linha da cidade ele quebrava ("CEP" numa linha
  // e o numero na outra), e a fonte do PDF troca o espaco que nao quebra por um espaco comum.
  const cidade = [empresa.bairro, `${empresa.cidade} - ${empresa.uf}`].filter(Boolean).join(" · ");
  const site = String(empresa.site ?? "").trim();
  return {
    linhas: [
      endereco,
      cidade,
      // "CEP:", "CNPJ:" e "IE:" com dois pontos (pedido do dono em 17/11/2026).
      empresa.cep ? `CEP: ${empresa.cep}` : null,
      [`CNPJ: ${empresa.cnpj}`, empresa.inscricaoEstadual ? `IE: ${empresa.inscricaoEstadual}` : null].filter(Boolean).join(" · "),
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

/**
 * A coluna "Dados bancários" do cabecalho (pedido do dono em 17/11/2026: "mostrando o nome do banco por primeiro e
 * depois os demais dados e tambem a chave pix"). Campo vazio nao entra; sem nenhum, a coluna some.
 */
function bancariosDaEmpresa(empresa) {
  if (!empresa) return [];
  const limpo = (valor) => String(valor ?? "").trim();
  return [
    limpo(empresa.bancoNome) || null,
    limpo(empresa.bancoCodigo) ? `Banco: ${limpo(empresa.bancoCodigo)}` : null,
    limpo(empresa.agencia) ? `Agência: ${limpo(empresa.agencia)}` : null,
    limpo(empresa.conta) ? `Conta: ${limpo(empresa.conta)}` : null,
    limpo(empresa.chavePix) ? `Chave Pix: ${limpo(empresa.chavePix)}` : null,
  ].filter(Boolean);
}

function linhasDoEndereco(endereco) {
  if (!endereco) return [];
  return [
    [endereco.logradouro, endereco.numero, endereco.complemento].filter(Boolean).join(", "),
    [endereco.bairro, endereco.cidade && `${endereco.cidade}${endereco.uf ? ` - ${endereco.uf}` : ""}`, endereco.cep && `CEP: ${endereco.cep}`].filter(Boolean).join(" · "),
  ].filter(Boolean);
}

/** As linhas de "Dados do cliente" (documento e IE, endereco Geral, telefone e e-mail); a tela da proposta mostra as mesmas. */
export function linhasDoCliente(proposta) {
  const cliente = proposta.cliente;
  const geral = cliente?.enderecos?.find((e) => e.tipo === "GERAL");
  const documento = proposta.clienteDocumento ? `${String(proposta.clienteDocumento).length > 14 ? "CNPJ" : "CPF"}: ${proposta.clienteDocumento}` : null;
  return [
    [documento, cliente?.inscricaoEstadual ? `IE: ${cliente.inscricaoEstadual}` : null].filter(Boolean).join(" · "),
    ...linhasDoEndereco(geral),
    [proposta.clienteTelefone ? formatarTelefone(proposta.clienteTelefone) : null, proposta.clienteEmail].filter(Boolean).join(" · "),
  ].filter(Boolean);
}

/**
 * O A/C logo abaixo de "Dados do cliente": SO o nome do contato escolhido na proposta (pedido do dono em 13/11/2026, na
 * proposta da Coppetec: "deixar apenas o nome do contato", sem cargo, telefone nem e-mail; ate ali vinham numa linha).
 */
function contatoDoCliente(proposta) {
  // "Aos cuidados de:" no lugar de "A/C:" (o dono sugeriu e concordamos em 17/11/2026: mais claro para o cliente).
  return { ac: proposta.contatoNome ? `Aos cuidados de: ${proposta.contatoNome}` : null, acLinha: null };
}

/**
 * "Entregar em" (ao lado do cliente, como o "Ship To" do modelo do dono): o endereco de Entrega do cadastro, senao o
 * Geral; cliente que retira, a frase; sem endereco nenhum (provisorio), "A combinar".
 */
export function linhasDaEntrega(proposta) {
  if (proposta.fretePorConta === "RETIRA") return ["Retirada pelo cliente na 4hobby"];
  const enderecos = proposta.cliente?.enderecos ?? [];
  const linhas = linhasDoEndereco(enderecos.find((e) => e.tipo === "ENTREGA"));
  if (linhas.length) return linhas;
  const geral = linhasDoEndereco(enderecos.find((e) => e.tipo === "GERAL"));
  return geral.length ? geral : ["A combinar"];
}

/**
 * O "Endereço de entrega" como o cliente le (PDF, link e a tela da proposta, pedido do dono em 17/11/2026): igual ao
 * endereco do cliente vira "O mesmo do cliente" (melhoria 4: repetia 4 linhas); senao, as linhas da entrega.
 */
export function entregaParaMostrar(proposta) {
  const entrega = linhasDaEntrega(proposta);
  const enderecoDoCliente = linhasDoEndereco(proposta.cliente?.enderecos?.find((e) => e.tipo === "GERAL"));
  return enderecoDoCliente.length > 0 && entrega.join("\n") === enderecoDoCliente.join("\n") ? ["O mesmo do cliente"] : entrega;
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
  // Com a data embaixo (melhoria 1 aprovada em 17/11/2026: o cliente nao precisa fazer a conta).
  return `${dias} ${dias === 1 ? "dia" : "dias"}\naté ${dataBR(ate)}`;
}

/**
 * A coluna Garantia da faixa so com o prazo (pedido do dono em 13/11/2026: "apenas os dias, por exemplo, 90 dias"): o
 * primeiro "N dias/meses/anos" do texto da garantia; texto sem prazo sai inteiro.
 */
export function prazoDaGarantia(garantia) {
  return garantiaCurta(garantia) || "—";
}

/**
 * A linha "Frete" do quadro do total diz o tipo (pedido do dono em 17/11/2026): CIF diluido nos produtos "CIF (Incluso)",
 * CIF sem valor "CIF (Grátis)", CIF cobrado a parte "CIF R$ 50,00" (o valor soma no total, entao nao pode dizer gratis) e
 * "FOB". Ate ali: "Incluso nos produtos", "Por nossa conta", o valor solto e "Por conta do cliente".
 */
function freteDoTotal(proposta, totais, diluido) {
  if (proposta.fretePorConta === "CIF") {
    if (diluido) return "CIF (Incluso)";
    return totais.frete > 0 ? `CIF ${moeda.format(totais.frete)}` : "CIF (Grátis)";
  }
  if (proposta.fretePorConta === "FOB") return "FOB";
  if (proposta.fretePorConta === "RETIRA") return "Cliente retira";
  return "A combinar";
}

/**
 * O "Método de envio" da faixa (pedido do dono em 17/11/2026): so "CIF" ou "FOB" e, na linha de baixo, a transportadora
 * ("A combinar" sem ela). Sem os dias de transporte nem o valor estimado do FOB (ate ali "CIF (frete por nossa conta)",
 * a transportadora, o valor e "Transporte: N dia(s)"). Retira e A combinar seguem com o texto deles.
 */
function metodoDeEnvio(proposta) {
  if (!["CIF", "FOB"].includes(proposta.fretePorConta)) return TEXTO_DO_FRETE[proposta.fretePorConta] ?? "A combinar";
  // Sem transportadora, so "CIF"/"FOB" (melhoria 2 aprovada em 17/11/2026: "A combinar" embaixo parecia o frete a combinar).
  return [proposta.fretePorConta, String(proposta.transportadoraNome ?? "").trim()].filter(Boolean).join("\n");
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
  // Frete diluido (17/11/2026): o cliente ve os precos com o frete dentro e o quadro diz "Incluso nos produtos".
  const diluido = Boolean(proposta.freteDiluido) && proposta.fretePorConta === "CIF" && totais.frete > 0;
  const itensDoCliente = diluido ? itensComFreteDiluido(proposta.itens, totais.frete) : proposta.itens;
  const subtotalDoCliente = diluido ? Math.round((totais.subtotal + totais.frete) * 100) / 100 : totais.subtotal;
  const linhasDeTotal = [["Subtotal", moeda.format(subtotalDoCliente)]];
  const prazosVariam = new Set(proposta.itens.map((item) => textoDoPrazo(item))).size > 1;
  // Entrega igual ao endereco do cliente: "O mesmo do cliente" (melhoria 4 aprovada em 17/11/2026: repetia 4 linhas).
  if (totais.desconto > 0) linhasDeTotal.push(["Desconto", `− ${moeda.format(totais.desconto)}`]);
  // Frete e impostos sempre no quadro do total (pedido do dono em 13/11/2026, no molde da cotacao da Hope): o valor so
  // soma no CIF (regra do total); nos outros tipos a linha diz quem paga.
  linhasDeTotal.push(["Frete", freteDoTotal(proposta, totais, diluido)]);
  linhasDeTotal.push(["Impostos", "Inclusos"]);

  const notaFiscal = [proposta.ocCliente ? `Pedido de compra (OC): ${proposta.ocCliente}` : null, proposta.observacoesNf].filter(Boolean).join("\n");

  // Prazo, pagamento e frete foram para a faixa de baixo do cabecalho (13/11/2026); aqui fica o resto. As observacoes ao
  // cliente sairam daqui para a caixa "Observações" (pedido do dono em 17/11/2026).
  const blocos = [
    ["Para a nota fiscal", notaFiscal],
    // So para cliente com padrao personalizado (SENAI); o cliente comum, sem padrao, nao ve (o dono em 13/11/2026).
    ["Faturamento mínimo", proposta.padrao ? textoDoFaturamentoMinimo(empresa?.faturamentoMinimo) : null],
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
    bancarios: bancariosDaEmpresa(empresa),
    observacoes: String(proposta.observacoesCliente ?? "").trim() || null,
    cliente: { nome: proposta.clienteNome, linhas: linhasDoCliente(proposta), ...contatoDoCliente(proposta) },
    entrega: entregaParaMostrar(proposta),
    // A faixa de colunas embaixo do cabecalho (o "Valid Until / Payment Terms / ..." do modelo do dono, 13/11/2026).
    faixa: [
      ["Validade da proposta", validadeEmDias(proposta)],
      // "7 dias após emissão da NF" e embaixo "Método: Transferência" (pedido do dono em 17/11/2026).
      ["Condições de pagamento", textoDoPagamento({ ...proposta, formaNaLinhaDeBaixo: true }) || "A combinar"],
      ["Prazo de entrega", prazoDaFaixa(proposta.itens)],
      ["Método de envio", metodoDeEnvio(proposta)],
      // Garantia ao lado do metodo de envio (pedido do dono em 13/11/2026); saiu dos blocos de baixo.
      ["Garantia", prazoDaGarantia(proposta.garantia)],
      ["Vendedor", proposta.vendedor || proposta.criadoPorNome || "—"],
    ],
    // A coluna Prazo so aparece com prazos diferentes (melhoria 3 aprovada em 17/11/2026): iguais, a faixa ja diz.
    colunas: COLUNAS.filter((c) => (c.chave !== "desconto" || temDesconto) && (c.chave !== "marca" || temMarca) && (c.chave !== "prazo" || prazosVariam)),
    itens: itensDoCliente.map((item, indice) => ({
      id: item.id,
      celulas: {
        item: String(indice + 1),
        descricao: nomeDoItemParaOCliente(item),
        // Coluna Codigo sempre (pedido do dono em 17/11/2026): o codigo do produto do Rise, o digitado no avulso, senao "-".
        // Ate ali so o `codigoInterno`, vazio no item que veio do produto, e a coluna sumia.
        // Sem codigo: um travessao (o PDF o centraliza na celula; pedido do dono em 17/11/2026, "um traço um pouco maior").
        codigo: item.sku || item.codigoInterno || "—",
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
