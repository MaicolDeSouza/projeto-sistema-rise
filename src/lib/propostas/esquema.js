import { lerDesconto, SITUACOES, UNIDADES_DA_PROPOSTA, TEXTO_DO_FRETE, MOTIVOS_DE_RECUSA } from "@/lib/propostas/regras";

/**
 * Confere e converte o que a tela da proposta manda ao Salvar. Os campos chegam como texto (o operador digita "10,50"):
 * aqui viram numero ou null. Devolve `{ dados }` ou `{ erros: { campo: mensagem } }`; as mensagens vao para a tela, com
 * acento. Item com erro usa a chave `itens.<indice>.<campo>`.
 */

/** "10,50", "1.000,50", "10.5", 10.5 -> numero; vazio -> null; lixo -> NaN. */
export function numeroDoTexto(valor) {
  if (valor === null || valor === undefined) return null;
  if (typeof valor === "number") return valor;
  const texto = String(valor).trim().replace(/\s+/g, "").replace(/^R\$/i, "");
  if (!texto) return null;
  return Number(texto.includes(",") ? texto.replace(/\./g, "").replace(",", ".") : texto);
}

const texto = (valor, maximo) => {
  const limpo = String(valor ?? "").trim();
  return limpo ? limpo.slice(0, maximo) : null;
};

const dataValida = (valor) => /^\d{4}-\d{2}-\d{2}$/.test(String(valor ?? "")) && !Number.isNaN(Date.parse(`${valor}T00:00:00Z`));

function conferirNumero(erros, campo, valor, { minimo = 0, maximo = 9_999_999, inteiro = false, mensagem }) {
  const numero = numeroDoTexto(valor);
  if (numero === null) return null;
  if (!Number.isFinite(numero) || numero < minimo || numero > maximo || (inteiro && !Number.isInteger(numero))) {
    erros[campo] = mensagem;
    return null;
  }
  return numero;
}

export function conferirProposta(entrada = {}) {
  const erros = {};
  const dados = {};

  dados.clienteId = texto(entrada.clienteId, 40);
  dados.clienteNome = texto(entrada.clienteNome, 200);
  dados.clienteTelefone = texto(entrada.clienteTelefone, 40);
  dados.clienteEmail = texto(entrada.clienteEmail, 200);
  dados.clienteDocumento = texto(entrada.clienteDocumento, 30);
  if (dados.clienteEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(dados.clienteEmail)) erros.clienteEmail = "E-mail inválido.";
  dados.contatoId = texto(entrada.contatoId, 40);
  dados.padraoId = texto(entrada.padraoId, 40);

  dados.condicaoPagamentoId = texto(entrada.condicaoPagamentoId, 40);
  dados.formaPagamento = texto(entrada.formaPagamento, 60);
  dados.parcelas = conferirNumero(erros, "parcelas", entrada.parcelas, { minimo: 1, maximo: 48, inteiro: true, mensagem: "Parcelas de 1 a 48." }) ?? 1;
  dados.entradaPercentual = conferirNumero(erros, "entradaPercentual", entrada.entradaPercentual, { maximo: 100, mensagem: "Entrada de 0 a 100%." }) ?? 0;
  dados.pagamentoTexto = texto(entrada.pagamentoTexto, 2000);

  dados.fretePorConta = TEXTO_DO_FRETE[entrada.fretePorConta] ? entrada.fretePorConta : "A_COMBINAR";
  dados.transportadoraId = texto(entrada.transportadoraId, 40);
  dados.frete = conferirNumero(erros, "frete", entrada.frete, { mensagem: "Frete inválido." }) ?? 0;
  dados.prazoTransporteDias = conferirNumero(erros, "prazoTransporteDias", entrada.prazoTransporteDias, { maximo: 365, inteiro: true, mensagem: "Prazo em dias inteiros." });

  const desconto = lerDesconto(entrada.desconto);
  if (desconto.erro) erros.desconto = desconto.erro;
  dados.descontoTipo = desconto.erro || !desconto.valor ? null : desconto.tipo;
  dados.descontoValor = desconto.erro ? 0 : desconto.valor;

  dados.ocCliente = texto(entrada.ocCliente, 60);
  dados.observacoesNf = texto(entrada.observacoesNf, 2000);
  dados.observacoesCliente = texto(entrada.observacoesCliente, 4000);
  dados.garantia = texto(entrada.garantia, 2000);
  dados.observacoesInternas = texto(entrada.observacoesInternas, 4000);

  if (!dataValida(entrada.validadeAte)) erros.validadeAte = "Informe a validade.";
  else dados.validadeAte = entrada.validadeAte;
  if (entrada.proximoContato && !dataValida(entrada.proximoContato)) erros.proximoContato = "Data inválida.";
  dados.proximoContato = dataValida(entrada.proximoContato) ? entrada.proximoContato : null;

  const itens = Array.isArray(entrada.itens) ? entrada.itens : [];
  if (itens.length > 300) erros.itens = "No máximo 300 itens.";
  dados.itens = itens.slice(0, 300).map((item, indice) => {
    const chave = (campo) => `itens.${indice}.${campo}`;
    const quantidade = conferirNumero(erros, chave("quantidade"), item.quantidade, { maximo: 9_999_999, mensagem: "Quantidade inválida." });
    if (!(quantidade > 0) && !erros[chave("quantidade")]) erros[chave("quantidade")] = "Informe a quantidade.";
    const prazo = conferirNumero(erros, chave("prazoDiasUteis"), item.prazoDiasUteis, { maximo: 3650, inteiro: true, mensagem: "Prazo em dias úteis inteiros." });
    const prontaEntrega = item.prontaEntrega === true || item.prontaEntrega === "true" || !(prazo > 0);
    return {
      id: texto(item.id, 40),
      produtoId: texto(item.produtoId, 40),
      descricaoCliente: texto(item.descricaoCliente, 2000) ?? "",
      codigoCliente: texto(item.codigoCliente, 100),
      marca: texto(item.marca, 100),
      modelo: texto(item.modelo, 150),
      codigoInterno: texto(item.codigoInterno, 100),
      nomeInterno: texto(item.nomeInterno, 300),
      foto: texto(item.foto, 300),
      quantidade: quantidade ?? 0,
      unidade: UNIDADES_DA_PROPOSTA.includes(item.unidade) ? item.unidade : "UN",
      precoUnitario: conferirNumero(erros, chave("precoUnitario"), item.precoUnitario, { mensagem: "Preço inválido." }) ?? 0,
      descontoPercentual: conferirNumero(erros, chave("descontoPercentual"), item.descontoPercentual, { maximo: 100, mensagem: "Desconto de 0 a 100%." }) ?? 0,
      prontaEntrega,
      prazoDiasUteis: prontaEntrega ? null : prazo,
      observacao: texto(item.observacao, 2000),
      custoUnitario: conferirNumero(erros, chave("custoUnitario"), item.custoUnitario, { mensagem: "Custo inválido." }),
    };
  });

  return Object.keys(erros).length ? { erros } : { dados };
}

export function conferirSituacao(para, { motivo, motivoTexto } = {}) {
  if (!SITUACOES[para]) return { erro: "Situação inválida." };
  if (para === "RECUSADA" && !MOTIVOS_DE_RECUSA[motivo]) return { erro: "Escolha o motivo da recusa." };
  return { motivo: para === "RECUSADA" ? motivo : null, motivoTexto: para === "RECUSADA" ? texto(motivoTexto, 500) : null };
}
