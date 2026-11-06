import { UFS, formatarCep, formatarCnpj, formatarCpf, validarCnpj, validarCpf } from "@/lib/documentos";
import { normalizarIdentificador } from "./regras.js";

/**
 * Leitura das planilhas antigas de licencas (spec 2026-11-05-licencas-softwares-design.md, §6.5), pura sobre
 * `string[][]` (cada aba ja convertida pelo script `scripts/importar-licencas.js`). Monta o PLANO da importacao; quem
 * grava e `aplicarPlanoDeImportacao` (banco.js). Fiel a planilha, nunca "inteligente": linhas identicas entram todas
 * (o dono apaga o que sobrar), e o que nao se le com certeza vai para a observacao da linha, com o texto original.
 *
 * Nunca recebe a aba "Link controle licencas": ela guarda a senha do portal, e o script nao a abre.
 */

const semAcento = (texto) => String(texto ?? "").normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();

// ---------------------------------------------------------------------------
// Celulas
// ---------------------------------------------------------------------------

function indiceDaColuna(letras) {
  let numero = 0;
  for (const letra of letras.toUpperCase()) numero = numero * 26 + (letra.charCodeAt(0) - 64);
  return numero - 1;
}

/**
 * A planilha mescla Key, Tipo, Equipamento, Canal e Renovacao de uma chave: so a celula de cima tem o valor. Copia o
 * valor do canto superior esquerdo de cada faixa ("A2:A5") para as demais celulas dela.
 */
export function preencherMescladas(linhas, mesclas = []) {
  const copia = (linhas ?? []).map((linha) => [...(linha ?? [])]);
  for (const faixa of mesclas ?? []) {
    const casado = /^([A-Z]+)(\d+):([A-Z]+)(\d+)$/i.exec(String(faixa).trim());
    if (!casado) continue;
    const [coluna1, linha1, coluna2, linha2] = [indiceDaColuna(casado[1]), Number(casado[2]) - 1, indiceDaColuna(casado[3]), Number(casado[4]) - 1];
    const valor = copia[linha1]?.[coluna1] ?? "";
    for (let l = linha1; l <= linha2; l++) {
      copia[l] ??= [];
      for (let c = coluna1; c <= coluna2; c++) if (l !== linha1 || c !== coluna1) copia[l][c] = valor;
    }
  }
  return copia;
}

/** "#" e celula vazia valem "sem valor". Tira o `\t\r` que a planilha deixou ("USUARIO-PC\t\r"). */
export function valorDaCelula(texto) {
  if (texto == null) return null;
  const limpo = String(texto).replace(/[\t\r\n]+/g, " ").replace(/\s+/g, " ").trim();
  return !limpo || limpo === "#" ? null : limpo;
}

function dataIso(ano, mes, dia) {
  const data = new Date(Date.UTC(ano, mes - 1, dia));
  if (data.getUTCFullYear() !== ano || data.getUTCMonth() !== mes - 1 || data.getUTCDate() !== dia) return null;
  return data.toISOString().slice(0, 10);
}

/** dd/mm/aaaa e dd/mm/aa viram data; "06/20", "2023" e outro texto ficam sem data, com o texto na observacao. */
export function lerDataDaPlanilha(texto) {
  const valor = valorDaCelula(texto);
  if (!valor) return { data: null, observacao: null };
  let casado = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(valor);
  if (casado) {
    const ano = casado[3].length === 2 ? 2000 + Number(casado[3]) : Number(casado[3]);
    const data = dataIso(ano, Number(casado[2]), Number(casado[1]));
    if (data) return { data, observacao: null };
  }
  casado = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valor);
  if (casado) {
    const data = dataIso(Number(casado[1]), Number(casado[2]), Number(casado[3]));
    if (data) return { data, observacao: null };
  }
  return { data: null, observacao: `Data na planilha: ${valor}` };
}

/** Os digitos do documento como a conta precisa: o Excel comeu o zero da esquerda de CPF (10 digitos) e de CNPJ (13). */
export function digitosDoDocumento(texto) {
  const valor = valorDaCelula(texto);
  if (!valor) return "";
  let digitos = valor.replace(/\D/g, "");
  if (digitos.length === 10) digitos = `0${digitos}`;
  else if (digitos.length === 13 && /cnpj/i.test(valor)) digitos = `0${digitos}`;
  return digitos;
}

/** "CPF 28625462839", "CNPJ 30031524000100", so digitos ou formatado; conferido pelos digitos verificadores. */
export function lerDocumentoDaPlanilha(texto) {
  const valor = valorDaCelula(texto);
  const digitos = digitosDoDocumento(texto);
  if (!valor || !digitos) return { documento: null, motivo: "sem CPF na planilha" };
  if (digitos.length === 11 && validarCpf(digitos)) return { documento: formatarCpf(digitos), motivo: null };
  if (digitos.length === 14 && validarCnpj(digitos)) return { documento: formatarCnpj(digitos), motivo: null };
  const rotulo = digitos.length === 14 || /cnpj/i.test(valor) ? "CNPJ" : "CPF";
  return { documento: null, motivo: `${rotulo} inválido na planilha: ${valor}` };
}

/** Os 27 estados pelo nome (sem acento, minusculo), para o endereco "..., <cidade> - CEP: <cep>, <estado>". */
export const UF_POR_NOME = {
  acre: "AC", alagoas: "AL", amapa: "AP", amazonas: "AM", bahia: "BA", ceara: "CE", "distrito federal": "DF",
  "espirito santo": "ES", goias: "GO", maranhao: "MA", "mato grosso": "MT", "mato grosso do sul": "MS",
  "minas gerais": "MG", para: "PA", paraiba: "PB", parana: "PR", pernambuco: "PE", piaui: "PI",
  "rio de janeiro": "RJ", "rio grande do norte": "RN", "rio grande do sul": "RS", rondonia: "RO", roraima: "RR",
  "santa catarina": "SC", "sao paulo": "SP", sergipe: "SE", tocantins: "TO",
};

/** O endereco no molde da planilha; fora do molde, o texto inteiro vai em `logradouro` (nada e adivinhado). */
export function lerEnderecoDaPlanilha(texto) {
  const valor = valorDaCelula(texto);
  if (!valor) return null;
  const casado = /^(.+), (.+) - CEP: ?(\d{5}-?\d{3}), (.+)$/.exec(valor);
  if (!casado) return { logradouro: valor, cidade: null, uf: null, cep: null };
  const estado = casado[4].trim();
  const uf = UF_POR_NOME[semAcento(estado)] ?? (UFS.includes(estado.toUpperCase()) ? estado.toUpperCase() : null);
  return { logradouro: casado[1].trim(), cidade: casado[2].trim(), uf, cep: formatarCep(casado[3]) };
}

/** ML, ML4H e ML3H sao Mercado Livre; 4H, Loja e Direta sao venda direta. O texto vai a observacao se nao for "ML". */
export function canalDaPlanilha(texto) {
  const valor = valorDaCelula(texto);
  if (!valor) return { canal: null, observacao: null };
  const chave = semAcento(valor).replace(/\s+/g, "").toUpperCase();
  const canal = ["ML", "ML4H", "ML3H", "MERCADOLIVRE"].includes(chave) ? "MERCADO_LIVRE" : ["4H", "LOJA", "DIRETA"].includes(chave) ? "DIRETA" : null;
  return { canal, observacao: valor === "ML" ? null : `Canal na planilha: ${valor}` };
}

/** "Não usa mais", "nao usa +" encerram a linha; "Em uso", "Ajustado" e vazio deixam ativa. */
export function situacaoDaPlanilha(texto) {
  return /n[aã]o usa/i.test(String(texto ?? "")) ? "ENCERRADA" : "ATIVA";
}

/** A observacao que so diz a situacao ("Em uso", "Nao usa mais") vira a situacao da linha e nao repete na observacao. */
const soSituacao = (texto) => /^(em uso|n[aã]o usa( mais| \+)?)$/i.test(String(texto ?? "").trim());

// ---------------------------------------------------------------------------
// Abas
// ---------------------------------------------------------------------------

/** Coluna de cada campo pelo PREFIXO do titulo sem acento ("Tipo(Core ou Pro)", "Renovação?"). Prefixo longo primeiro. */
function mapearColunas(cabecalho, campos) {
  const mapa = {};
  (cabecalho ?? []).forEach((celula, indice) => {
    const titulo = semAcento(valorDaCelula(celula) ?? "");
    if (!titulo) return;
    const achado = campos.find(([, prefixo]) => titulo.startsWith(prefixo));
    if (achado && mapa[achado[0]] === undefined) mapa[achado[0]] = indice;
  });
  return mapa;
}

/** As colunas sem titulo depois da ultima com titulo (a "M" da aba geral, a "I" da antiga) sao observacao. */
function inicioDasObservacoes(cabecalho) {
  let ultima = -1;
  (cabecalho ?? []).forEach((celula, indice) => {
    if (valorDaCelula(celula)) ultima = indice;
  });
  return ultima + 1;
}

function lerLinhas(linhas, inicio, cabecalho, campos, montar) {
  const colunas = mapearColunas(cabecalho, campos);
  const comecoDaObservacao = inicioDasObservacoes(cabecalho);
  const entradas = [];
  for (let i = inicio; i < (linhas ?? []).length; i++) {
    const linha = linhas[i] ?? [];
    const pegar = (campo) => (colunas[campo] === undefined ? null : valorDaCelula(linha[colunas[campo]]));
    const chave = pegar("chave");
    if (!chave) continue;
    const observacoes = linha.slice(comecoDaObservacao).map(valorDaCelula).filter(Boolean);
    const entrada = montar(pegar, observacoes, i + 1);
    // Linha so com a chave (e o que veio mesclado de cima) e "#": e o lugar vazio da mescla, nao uma venda.
    const temVenda = [entrada.data, entrada.dataObservacao, entrada.nome, entrada.documentoTexto, entrada.telefone, entrada.email, entrada.nomeDoPc, entrada.endereco, entrada.observacoes.length ? "x" : null].some(Boolean);
    if (temVenda) entradas.push(entrada);
  }
  return entradas;
}

function entradaBase(pegar, observacoes, linha, origem) {
  const { data, observacao } = lerDataDaPlanilha(pegar("data"));
  return {
    origem,
    linha,
    chave: pegar("chave"),
    tipo: pegar("tipo"),
    data,
    dataObservacao: observacao,
    nome: pegar("nome"),
    documentoTexto: pegar("documento"),
    telefone: pegar("telefone"),
    email: pegar("email"),
    equipamento: pegar("equipamento"),
    nomeDoPc: pegar("nomeDoPc"),
    canalTexto: pegar("canal"),
    renovadaEm: null,
    endereco: pegar("endereco"),
    observacoes,
  };
}

const CAMPOS_GERAL = [
  ["nomeDoPc", "nome do pc"],
  ["chave", "key"],
  ["tipo", "tipo"],
  ["data", "data"],
  ["nome", "nome"],
  ["documento", "dados"],
  ["telefone", "telefone"],
  ["email", "email"],
  ["equipamento", "equipamento"],
  ["canal", "canal"],
  ["renovacao", "renovac"],
  ["endereco", "endereco"],
];

/** "Licencas em geral": cabecalho na linha 1; a coluna M (sem titulo) e a observacao. */
export function lerAbaGeral(linhas) {
  return lerLinhas(linhas, 1, linhas?.[0], CAMPOS_GERAL, (pegar, observacoes, linha) => {
    const entrada = entradaBase(pegar, observacoes, linha, "geral");
    entrada.renovadaEm = lerDataDaPlanilha(pegar("renovacao")).data;
    return entrada;
  });
}

const CAMPOS_MAQUINAS = [
  ["data", "data"],
  ["nome", "nome"],
  ["documento", "cpf"],
  ["telefone", "tel"],
  ["email", "email"],
  ["chave", "key"],
  ["loja", "loja"],
  ["equipamento", "pedido"],
];

/**
 * "Licencas maquinas 4hobby" (a aba antiga): o cabecalho esta na linha 2. A coluna "Loja" e o canal, menos quando diz
 * "Renovada dia 30/11/22" (vira a renovacao da chave e fica na observacao); o "Pedido Bling" e o equipamento.
 */
export function lerAbaMaquinas(linhas) {
  const indice = (linhas ?? []).findIndex((linha) => {
    const titulos = (linha ?? []).map((celula) => semAcento(valorDaCelula(celula) ?? ""));
    return titulos.includes("data") && titulos.includes("key");
  });
  if (indice < 0) return [];
  return lerLinhas(linhas, indice + 1, linhas[indice], CAMPOS_MAQUINAS, (pegar, observacoes, linha) => {
    const entrada = entradaBase(pegar, observacoes, linha, "maquinas");
    const loja = pegar("loja");
    if (loja && /renovad|renovac/i.test(loja)) {
      const data = /(\d{1,2}\/\d{1,2}\/\d{2,4})/.exec(loja)?.[1];
      entrada.renovadaEm = data ? lerDataDaPlanilha(data).data : null;
      entrada.observacoes = [loja, ...entrada.observacoes];
    } else {
      entrada.canalTexto = loja;
    }
    return entrada;
  });
}

const CAMPOS_MACH3 = [
  ["chave", "key"],
  ["software", "software"],
  ["data", "data"],
  ["nome", "nome"],
  ["documento", "dados"],
  ["telefone", "telefone"],
  ["email", "email"],
  ["canal", "canal"],
  ["endereco", "endereco"],
];

/** A planilha do Mach3: a "Key" e o nome da pasta da licenca ("Mach3 VD60"). */
export function lerAbaMach3(linhas) {
  return lerLinhas(linhas, 1, linhas?.[0], CAMPOS_MACH3, (pegar, observacoes, linha) => entradaBase(pegar, observacoes, linha, "mach3"));
}

// ---------------------------------------------------------------------------
// Plano
// ---------------------------------------------------------------------------

/**
 * O documento de cada entrada da chave. Mesmo nome com documentos que so mudam no ultimo digito (060, 061, 062: o
 * Excel arrastou a celula) usam o primeiro valido nas linhas todas.
 */
function documentosDasEntradas(entradas) {
  const lidos = new Map(entradas.map((entrada) => [entrada, lerDocumentoDaPlanilha(entrada.documentoTexto)]));
  const porNome = new Map();
  for (const entrada of entradas) {
    if (!entrada.nome) continue;
    const nome = semAcento(entrada.nome);
    porNome.set(nome, [...(porNome.get(nome) ?? []), entrada]);
  }
  for (const grupo of porNome.values()) {
    const comDigitos = grupo.filter((entrada) => digitosDoDocumento(entrada.documentoTexto));
    const digitos = comDigitos.map((entrada) => digitosDoDocumento(entrada.documentoTexto));
    if (new Set(digitos).size < 2) continue;
    const raiz = digitos[0].slice(0, -1);
    if (!digitos.every((d) => d.length === digitos[0].length && d.slice(0, -1) === raiz)) continue;
    const primeiro = comDigitos.map((entrada) => lidos.get(entrada)).find((lido) => lido.documento);
    if (!primeiro) continue;
    for (const entrada of comDigitos) lidos.set(entrada, primeiro);
  }
  return lidos;
}

function linhaDoPlano(entrada, ordem, documento) {
  const canal = canalDaPlanilha(entrada.canalTexto);
  const situacao = entrada.observacoes.some((texto) => situacaoDaPlanilha(texto) === "ENCERRADA") ? "ENCERRADA" : "ATIVA";
  const observacoes = [entrada.dataObservacao, canal.observacao, ...entrada.observacoes.filter((texto) => !soSituacao(texto)), documento.documento ? null : documento.motivo].filter(Boolean);
  const cliente = documento.documento
    ? { nome: entrada.nome ?? documento.documento, documento: documento.documento, telefone: entrada.telefone, email: entrada.email, endereco: lerEnderecoDaPlanilha(entrada.endereco) }
    : null;
  return {
    ordem,
    cliente,
    nomeAnotado: cliente ? null : entrada.nome,
    data: entrada.data,
    canal: canal.canal,
    nomeDoPc: entrada.nomeDoPc,
    equipamento: entrada.equipamento,
    observacoes: observacoes.length ? observacoes.join("; ") : null,
    situacao,
  };
}

function licencaDoPlano(software, identificador, entradas, arquivo) {
  const documentos = documentosDasEntradas(entradas);
  const datasDeRenovacao = entradas.map((entrada) => entrada.renovadaEm).filter(Boolean).sort();
  return {
    software,
    identificador,
    tipo: entradas.map((entrada) => entrada.tipo).find(Boolean) ?? null,
    renovadaEm: datasDeRenovacao.at(-1) ?? null,
    observacoes: null,
    arquivo,
    linhas: entradas.map((entrada, indice) => linhaDoPlano(entrada, indice + 1, documentos.get(entrada))),
  };
}

/** "ALTAVE V53T" -> "ALTAVE"; "ASSOCIACAO SAO BENTO DE ENSINO/Mach3 2FHX" -> "ASSOCIACAO SAO BENTO DE ENSINO". */
export function nomeAnotadoDaPasta(identificador) {
  const texto = String(identificador ?? "").trim();
  if (texto.includes("/")) return texto.split("/")[0].trim();
  return texto.replace(/\s+[A-Za-z0-9]{4}$/, "").trim() || texto;
}

const codigoDaLicenca = (texto) => /\s([A-Za-z0-9]{4})$/.exec(String(texto ?? "").trim())?.[1]?.toUpperCase() ?? null;
const chaveDeBusca = (texto) => semAcento(texto).replace(/\s+/g, " ");

/**
 * O plano: uma licenca por chave do LightBurn (as duas abas juntas, a geral primeiro) e uma por pasta/zip do Mach3.
 * A licenca do Mach3 casa com a linha da planilha pelo nome inteiro ou, na falta, pelo codigo do fim ("VD60"); pasta
 * sem linha na planilha entra com o nome anotado; linha da planilha sem pasta vira aviso (sem arquivo nao ha licenca).
 */
export function montarPlano({ geral = [], maquinas = [], mach3 = [], arquivosMach3 = [] } = {}) {
  const licencas = [];
  const avisos = [];

  const porChave = new Map();
  for (const entrada of [...geral, ...maquinas]) {
    const identificador = normalizarIdentificador(entrada.chave, "CHAVE");
    porChave.set(identificador, [...(porChave.get(identificador) ?? []), entrada]);
  }
  for (const [identificador, entradas] of porChave) licencas.push(licencaDoPlano("lightburn", identificador, entradas, null));

  const mach3PorNome = new Map();
  for (const entrada of mach3) {
    const nome = chaveDeBusca(entrada.chave);
    mach3PorNome.set(nome, [...(mach3PorNome.get(nome) ?? []), entrada]);
  }
  const usadas = new Set();
  for (const arquivo of arquivosMach3) {
    const identificador = normalizarIdentificador(arquivo.identificador, "ARQUIVO");
    let nome = chaveDeBusca(identificador);
    if (!mach3PorNome.has(nome)) {
      const codigo = codigoDaLicenca(identificador.split("/").pop());
      const pelosCodigos = codigo ? [...mach3PorNome.keys()].filter((chave) => codigoDaLicenca(chave) === codigo) : [];
      if (pelosCodigos.length === 1) nome = pelosCodigos[0];
    }
    const entradas = mach3PorNome.get(nome) ?? [];
    if (entradas.length) usadas.add(nome);
    const licenca = licencaDoPlano("mach3", identificador, entradas, { nomeOriginal: arquivo.nomeOriginal, bytes: arquivo.bytes });
    if (!entradas.length) {
      licenca.linhas = [{ ordem: 1, cliente: null, nomeAnotado: nomeAnotadoDaPasta(identificador), data: null, canal: null, nomeDoPc: null, equipamento: null, observacoes: "sem CPF na planilha", situacao: "ATIVA" }];
    }
    licencas.push(licenca);
  }
  for (const [nome, entradas] of mach3PorNome) {
    if (!usadas.has(nome)) avisos.push(`Mach3: "${entradas[0].chave}" está na planilha e não tem pasta nem zip.`);
  }
  return { licencas, avisos };
}
