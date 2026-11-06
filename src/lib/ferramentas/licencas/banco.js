import { prisma } from "@/lib/db";
import { buscarClientesParaVincular } from "@/lib/pedidos/banco";
import { telefoneParaGravar } from "@/lib/telefone";
import { lerArquivoEnviado, sha256Hex } from "./arquivos.js";
import {
  CANAIS_DA_LICENCA,
  casarLinhasComAtivacoes,
  frescorDaLeitura,
  lerDataIso,
  normalizarIdentificador,
  ordenarLicencas,
  situacaoDaLicenca,
  ultimoUso,
  vagasLivres,
} from "./regras.js";

/**
 * Banco das Licencas Softwares (spec 2026-11-05-licencas-softwares-design.md, §6.2 e §6.3): os programas, as licencas
 * de cada um e as linhas (a vaga entregue a um cliente). As contas moram em `regras.js`; aqui so se le, grava e projeta.
 *
 * A lista e montada em memoria (le todas as licencas do programa, projeta, filtra, ordena e pagina): um programa tem no
 * maximo algumas centenas de chaves, e "vagas livres" e "ultimo uso" saem das ativacoes, que o SQL nao ordenaria sem
 * repetir as regras.
 */

const TETO_INSTRUCOES = 5 * 1024 * 1024;
const CANAIS = new Set(CANAIS_DA_LICENCA.map((canal) => canal.valor));

const textoOuNulo = (valor) => {
  const texto = String(valor ?? "").replace(/[\t\r]/g, " ").trim();
  return texto || null;
};
const semAcento = (texto) => String(texto ?? "").normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/** "LightBurn Pro" -> "lightburn-pro": a URL e a aba do programa (?programa=). */
export function slugDoNome(nome) {
  return semAcento(nome).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "programa";
}

// ---------------------------------------------------------------------------
// Programas
// ---------------------------------------------------------------------------

const CAMPOS_DO_PROGRAMA = {
  id: true,
  nome: true,
  slug: true,
  identificacao: true,
  temPortal: true,
  ativacoesPermitidas: true,
  linhasIniciais: true,
  linkPortal: true,
  linkSite: true,
  instrucoesNome: true,
  ordem: true,
  ativo: true,
};

/** Os programas, sem os bytes do PDF (`temInstrucoes` diz se ele existe). */
export async function listarSoftwares({ soAtivos = true } = {}) {
  const programas = await prisma.software.findMany({
    where: soAtivos ? { ativo: true } : {},
    orderBy: [{ ordem: "asc" }, { nome: "asc" }],
    select: { ...CAMPOS_DO_PROGRAMA, _count: { select: { licencas: true } } },
  });
  return programas.map(({ _count, ...programa }) => ({ ...programa, temInstrucoes: Boolean(programa.instrucoesNome), totalLicencas: _count.licencas }));
}

function inteiroOuNulo(valor) {
  if (valor === null || valor === undefined || valor === "") return null;
  const numero = Number(valor);
  return Number.isInteger(numero) ? numero : NaN;
}

/**
 * Cria ou edita um programa. O slug nasce do nome e nao muda depois (e a URL que o dono salvou). Campo ausente na edicao
 * fica como estava.
 */
export async function salvarSoftware(id, dados = {}) {
  const atual = id ? await prisma.software.findUnique({ where: { id }, select: { ...CAMPOS_DO_PROGRAMA, _count: { select: { licencas: true } } } }) : null;
  if (id && !atual) return { ok: false, erros: { nome: "Programa não encontrado." } };
  const valor = (campo, padrao) => (dados[campo] !== undefined ? dados[campo] : atual ? atual[campo] : padrao);

  const erros = {};
  const nome = textoOuNulo(valor("nome", null));
  if (!nome) erros.nome = "Informe o nome do programa.";
  else {
    const repetido = await prisma.software.findFirst({ where: { nome: { equals: nome, mode: "insensitive" }, ...(id ? { NOT: { id } } : {}) }, select: { id: true } });
    if (repetido) erros.nome = "Já existe um programa com esse nome.";
  }
  const identificacao = valor("identificacao", null);
  if (!["CHAVE", "ARQUIVO"].includes(identificacao)) erros.identificacao = "Escolha como a licença se identifica.";
  else if (atual && atual.identificacao !== identificacao && atual._count.licencas > 0) {
    erros.identificacao = "Este programa já tem licenças: a forma de identificar não muda.";
  }
  const ativacoesPermitidas = inteiroOuNulo(valor("ativacoesPermitidas", null));
  if (Number.isNaN(ativacoesPermitidas) || (ativacoesPermitidas !== null && ativacoesPermitidas < 1)) erros.ativacoesPermitidas = "Use um número inteiro a partir de 1, ou deixe vazio.";
  const linhasIniciais = inteiroOuNulo(valor("linhasIniciais", 1));
  if (!Number.isInteger(linhasIniciais) || linhasIniciais < 1 || linhasIniciais > 10) erros.linhasIniciais = "Entre 1 e 10.";
  const ordem = inteiroOuNulo(valor("ordem", 0)) ?? 0;
  if (Number.isNaN(ordem)) erros.ordem = "Use um número inteiro.";

  const instrucoes = dados.instrucoes ?? null;
  if (instrucoes?.bytes) {
    const tamanho = instrucoes.bytes.length ?? instrucoes.bytes.byteLength ?? 0;
    const ehPdf = /\.pdf$/i.test(instrucoes.nome ?? "") || instrucoes.tipo === "application/pdf";
    if (!ehPdf) erros.instrucoes = "Envie um PDF.";
    else if (tamanho > TETO_INSTRUCOES) erros.instrucoes = "PDF acima de 5 MB.";
  }
  if (Object.keys(erros).length) return { ok: false, erros };

  const campos = {
    nome,
    identificacao,
    temPortal: Boolean(valor("temPortal", false)),
    ativacoesPermitidas,
    linhasIniciais,
    linkPortal: textoOuNulo(valor("linkPortal", null)),
    linkSite: textoOuNulo(valor("linkSite", null)),
    ordem,
    ativo: Boolean(valor("ativo", true)),
  };
  if (instrucoes?.bytes) {
    Object.assign(campos, { instrucoesNome: String(instrucoes.nome || "instrucoes.pdf").split(/[\\/]/).pop(), instrucoesBytes: Buffer.from(instrucoes.bytes), instrucoesTipo: "application/pdf" });
  } else if (dados.apagarInstrucoes) {
    Object.assign(campos, { instrucoesNome: null, instrucoesBytes: null, instrucoesTipo: null });
  }

  if (atual) {
    await prisma.software.update({ where: { id }, data: campos });
    return { ok: true, id };
  }
  // Slug repetido por outro nome ("LightBurn!" e "LightBurn"): ganha um numero, para a URL continuar unica.
  const base = slugDoNome(nome);
  let slug = base;
  for (let n = 2; await prisma.software.findUnique({ where: { slug }, select: { id: true } }); n++) slug = `${base}-${n}`;
  const criado = await prisma.software.create({ data: { ...campos, slug }, select: { id: true } });
  return { ok: true, id: criado.id };
}

export async function excluirSoftware(id) {
  const total = await prisma.licenca.count({ where: { softwareId: id } });
  if (total > 0) return { ok: false, erro: `Este programa tem ${total} licença(s).` };
  const apagado = await prisma.software.deleteMany({ where: { id } });
  return apagado.count ? { ok: true } : { ok: false, erro: "Programa não encontrado." };
}

// ---------------------------------------------------------------------------
// Licencas: leitura e projecao
// ---------------------------------------------------------------------------

const INCLUIR_NA_LICENCA = {
  linhas: {
    include: {
      cliente: { select: { id: true, nome: true, documento: true } },
      pedidoDeVenda: { select: { id: true, numero: true, canal: true } },
    },
  },
  ativacoes: true,
  arquivos: {
    select: { id: true, versao: true, nomeOriginal: true, tamanhoBytes: true, sha256: true, atual: true, enviadoEm: true, enviadoPor: true, observacao: true },
    orderBy: { versao: "desc" },
  },
};

const projetarPc = (pc) => ({ id: pc.id, hostname: pc.hostname, so: pc.so, criadaEm: pc.criadaEm, ultimaSincronizacaoEm: pc.ultimaSincronizacaoEm });

function projetarLinha(linha, ativacao = null) {
  return {
    id: linha.id,
    ordem: linha.ordem,
    cliente: linha.cliente ? { id: linha.cliente.id, nome: linha.cliente.nome, documento: linha.cliente.documento } : null,
    nomeAnotado: linha.nomeAnotado,
    data: linha.data,
    canal: linha.canal,
    pedido: linha.pedidoDeVenda ? { id: linha.pedidoDeVenda.id, numero: linha.pedidoDeVenda.numero, canal: linha.pedidoDeVenda.canal } : null,
    nomeDoPc: linha.nomeDoPc,
    equipamento: linha.equipamento,
    observacoes: linha.observacoes,
    situacao: linha.situacao,
    encerradaEm: linha.encerradaEm,
    ativacao: ativacao ? { hostname: ativacao.hostname, so: ativacao.so, criadaEm: ativacao.criadaEm, ultimaSincronizacaoEm: ativacao.ultimaSincronizacaoEm } : null,
  };
}

/** A licenca como a tela a usa: as contas das regras aplicadas as linhas, ativacoes e arquivos dela. */
export function projetarLicenca({ software, licenca, agora = new Date() }) {
  const ativacoes = licenca.ativacoes ?? [];
  const linhas = licenca.linhas ?? [];
  const { porLinha, semCliente, empates } = casarLinhasComAtivacoes(linhas, ativacoes);
  const ativas = linhas.filter((linha) => linha.situacao === "ATIVA").sort((a, b) => a.ordem - b.ordem);
  const encerradas = linhas
    .filter((linha) => linha.situacao !== "ATIVA")
    .sort((a, b) => (b.encerradaEm?.getTime?.() ?? 0) - (a.encerradaEm?.getTime?.() ?? 0));

  const clientes = [];
  const vistos = new Set();
  for (const linha of ativas) {
    const cliente = linha.cliente ? { id: linha.cliente.id, nome: linha.cliente.nome } : linha.nomeAnotado ? { id: null, nome: linha.nomeAnotado } : null;
    const chave = cliente ? cliente.id ?? `anotado:${cliente.nome}` : null;
    if (cliente && !vistos.has(chave)) {
      vistos.add(chave);
      clientes.push(cliente);
    }
  }

  const avisos = [];
  if (licenca.portalSumiuEm) avisos.push("Sumiu do portal");
  if (semCliente.length) avisos.push(semCliente.length === 1 ? "1 PC sem cliente" : `${semCliente.length} PCs sem cliente`);
  for (const empate of empates) avisos.push(`Nome de PC repetido: ${empate.hostname}`);

  let ultimaEntrega = null;
  for (const linha of linhas) if (linha.data && (!ultimaEntrega || linha.data > ultimaEntrega)) ultimaEntrega = linha.data;

  const arquivos = (licenca.arquivos ?? []).map((arquivo) => ({ ...arquivo }));
  return {
    id: licenca.id,
    softwareId: licenca.softwareId,
    identificador: licenca.identificador,
    tipo: licenca.tipo,
    compradaEm: licenca.compradaEm,
    renovadaEm: licenca.renovadaEm,
    observacoes: licenca.observacoes,
    origem: licenca.origem,
    arquivada: licenca.arquivada,
    portalSituacao: licenca.portalSituacao,
    portalExpiraEm: licenca.portalExpiraEm,
    portalCriadaEm: licenca.portalCriadaEm,
    portalLidoEm: licenca.portalLidoEm,
    portalSumiuEm: licenca.portalSumiuEm,
    situacao: situacaoDaLicenca({ licenca, software, agora }),
    vagas: vagasLivres({ software, licenca, ativacoes }),
    ultimoUso: ultimoUso(ativacoes),
    clientes,
    avisos,
    linhas: ativas.map((linha) => projetarLinha(linha, porLinha.get(linha.id))),
    historico: encerradas.map((linha) => projetarLinha(linha)),
    pcsSemCliente: semCliente.map(projetarPc),
    arquivos,
    arquivoAtual: arquivos.find((arquivo) => arquivo.atual) ?? null,
    ultimaEntrega,
  };
}

/** O texto em que a busca procura: chave, clientes (nome e digitos do documento), nomes de PC e nomes anotados. */
function textoDaBusca(projetada) {
  const partes = [projetada.identificador, projetada.tipo];
  for (const linha of [...projetada.linhas, ...projetada.historico]) {
    partes.push(linha.cliente?.nome, linha.cliente?.documento, linha.cliente?.documento?.replace(/\D/g, ""), linha.nomeAnotado, linha.nomeDoPc, linha.equipamento);
    if (linha.ativacao) partes.push(linha.ativacao.hostname);
  }
  for (const pc of projetada.pcsSemCliente) partes.push(pc.hostname);
  return semAcento(partes.filter(Boolean).join(" \n "));
}

export async function listarLicencas({ softwareId, busca = "", soComVagaLivre = false, mostrarArquivadas = false, ordenar = null, direcao = "asc", pagina = 1, porPagina = 25 } = {}) {
  const software = await prisma.software.findUnique({ where: { id: softwareId } });
  if (!software) return { total: 0, pagina: 1, porPagina, linhas: [] };
  const licencas = await prisma.licenca.findMany({
    where: { softwareId, ...(mostrarArquivadas ? {} : { arquivada: false }) },
    include: INCLUIR_NA_LICENCA,
  });
  const agora = new Date();
  let projetadas = licencas.map((licenca) => projetarLicenca({ software, licenca, agora }));

  // Todas as palavras, em qualquer ordem e sem acento (o padrao das buscas do Rise).
  const palavras = semAcento(busca).split(/\s+/).filter(Boolean);
  if (palavras.length) projetadas = projetadas.filter((projetada) => {
    const texto = textoDaBusca(projetada);
    return palavras.every((palavra) => texto.includes(palavra));
  });
  if (soComVagaLivre) projetadas = projetadas.filter((projetada) => (projetada.vagas.livres ?? 0) > 0);

  const ordenadas = ordenarLicencas(projetadas, { ordenar, direcao });
  const total = ordenadas.length;
  const paginas = Math.max(1, Math.ceil(total / porPagina));
  const atual = Math.min(Math.max(1, Number(pagina) || 1), paginas);
  return { total, pagina: atual, porPagina, linhas: ordenadas.slice((atual - 1) * porPagina, atual * porPagina) };
}

/** Os tipos ja usados no programa ("Core", "Pro"...), as sugestoes do campo Tipo. */
export async function tiposDoPrograma(softwareId) {
  const tipos = await prisma.licenca.findMany({ where: { softwareId, tipo: { not: null } }, distinct: ["tipo"], select: { tipo: true }, orderBy: { tipo: "asc" } });
  return tipos.map((linha) => linha.tipo);
}

export async function lerLicenca(id) {
  if (!id) return null;
  const licenca = await prisma.licenca.findUnique({ where: { id }, include: { ...INCLUIR_NA_LICENCA, software: true } });
  if (!licenca) return null;
  const { software, ...resto } = licenca;
  return projetarLicenca({ software, licenca: resto });
}

// ---------------------------------------------------------------------------
// Licencas: escrita
// ---------------------------------------------------------------------------

const ehRepetida = (erro) => erro?.code === "P2002";

export async function criarLicenca({ softwareId, identificador, tipo = null, compradaEm = null, renovadaEm = null, observacoes = null, arquivo = null, enviadoPor = null } = {}) {
  const software = await prisma.software.findUnique({ where: { id: softwareId ?? "" }, select: { id: true, identificacao: true } });
  if (!software) return { ok: false, erro: "Programa não encontrado." };
  const normalizado = normalizarIdentificador(identificador, software.identificacao);
  if (!normalizado) return { ok: false, erro: software.identificacao === "CHAVE" ? "Informe a chave da licença." : "Informe o nome da licença." };

  const jaExiste = await prisma.licenca.findFirst({ where: { softwareId, identificador: { equals: normalizado, mode: "insensitive" } }, select: { id: true } });
  const repetida = { ok: false, erro: `A licença ${normalizado} já existe neste programa.` };
  if (jaExiste) return repetida;

  let lido = null;
  if (software.identificacao === "ARQUIVO") {
    if (!arquivo?.bytes) return { ok: false, erro: "Envie o arquivo da licença." };
    lido = lerArquivoEnviado({ nome: arquivo.nome, bytes: arquivo.bytes });
    if (!lido.ok) return lido;
  } else if (arquivo?.bytes) {
    return { ok: false, erro: "Este programa não usa arquivo de licença." };
  }

  try {
    const criada = await prisma.$transaction(async (tx) => {
      const licenca = await tx.licenca.create({
        data: { softwareId, identificador: normalizado, tipo: textoOuNulo(tipo), compradaEm, renovadaEm, observacoes: textoOuNulo(observacoes), origem: "manual" },
        select: { id: true },
      });
      if (lido) {
        await tx.arquivoDeLicenca.create({
          data: { licencaId: licenca.id, versao: 1, nomeOriginal: lido.nomeOriginal, bytes: lido.bytes, sha256: lido.sha256, tamanhoBytes: lido.tamanhoBytes, mimeType: lido.mimeType, atual: true, enviadoPor },
        });
      }
      return licenca;
    });
    return { ok: true, id: criada.id };
  } catch (erro) {
    if (ehRepetida(erro)) return repetida;
    throw erro;
  }
}

/** Edita o que o dono digita. Campo ausente fica como estava; o que o portal leu nao passa por aqui. */
export async function editarLicenca(id, dados = {}) {
  const existe = await prisma.licenca.findUnique({ where: { id: id ?? "" }, select: { id: true } });
  if (!existe) return { ok: false, erro: "Licença não encontrada." };
  const campos = {};
  if (dados.tipo !== undefined) campos.tipo = textoOuNulo(dados.tipo);
  if (dados.compradaEm !== undefined) campos.compradaEm = dados.compradaEm;
  if (dados.renovadaEm !== undefined) campos.renovadaEm = dados.renovadaEm;
  if (dados.observacoes !== undefined) campos.observacoes = textoOuNulo(dados.observacoes);
  if (dados.arquivada !== undefined) campos.arquivada = Boolean(dados.arquivada);
  await prisma.licenca.update({ where: { id }, data: campos });
  return { ok: true };
}

/** O que o popup de exclusao lista antes do dono confirmar. */
export async function oQueSaiComALicenca(id) {
  const licenca = await prisma.licenca.findUnique({
    where: { id: id ?? "" },
    select: {
      identificador: true,
      _count: { select: { linhas: true, ativacoes: true } },
      arquivos: { select: { versao: true, nomeOriginal: true }, orderBy: { versao: "asc" } },
    },
  });
  if (!licenca) return null;
  return { identificador: licenca.identificador, linhas: licenca._count.linhas, ativacoes: licenca._count.ativacoes, arquivos: licenca.arquivos };
}

/** Apaga a licenca, os arquivos (as versoes todas) e, pela cascata, as linhas e as ativacoes. So pelo popup do dono. */
export async function excluirLicenca(id) {
  const resumo = await oQueSaiComALicenca(id);
  if (!resumo) return { ok: false, erro: "Licença não encontrada." };
  await prisma.$transaction([prisma.arquivoDeLicenca.deleteMany({ where: { licencaId: id } }), prisma.licenca.delete({ where: { id } })]);
  return { ok: true, resumo };
}

// ---------------------------------------------------------------------------
// Arquivo da licenca (Mach3): versoes que nunca sao apagadas
// ---------------------------------------------------------------------------

/**
 * Grava o arquivo como a versao seguinte e move a marca de "atual" para ela; as anteriores ficam. A versao e calculada
 * dentro da transacao, e dois envios ao mesmo tempo esbarram no indice unico (licenca, versao): o que perdeu tenta UMA
 * vez de novo e vira a seguinte.
 */
export async function enviarArquivo(licencaId, { nome, bytes, enviadoPor = null, observacao = null } = {}) {
  const licenca = await prisma.licenca.findUnique({ where: { id: licencaId ?? "" }, select: { id: true, software: { select: { identificacao: true } } } });
  if (!licenca) return { ok: false, erro: "Licença não encontrada." };
  if (licenca.software.identificacao !== "ARQUIVO") return { ok: false, erro: "Este programa não usa arquivo de licença." };
  const lido = lerArquivoEnviado({ nome, bytes });
  if (!lido.ok) return lido;

  const gravar = () =>
    prisma.$transaction(async (tx) => {
      const atual = await tx.arquivoDeLicenca.findFirst({ where: { licencaId, atual: true }, select: { sha256: true } });
      if (atual?.sha256 === lido.sha256) return { ok: false, erro: "Este arquivo já é a versão atual (mesmo conteúdo)." };
      const maior = await tx.arquivoDeLicenca.aggregate({ where: { licencaId }, _max: { versao: true } });
      const versao = (maior._max.versao ?? 0) + 1;
      await tx.arquivoDeLicenca.updateMany({ where: { licencaId, atual: true }, data: { atual: false } });
      await tx.arquivoDeLicenca.create({
        data: { licencaId, versao, nomeOriginal: lido.nomeOriginal, bytes: lido.bytes, sha256: lido.sha256, tamanhoBytes: lido.tamanhoBytes, mimeType: lido.mimeType, atual: true, enviadoPor, observacao: textoOuNulo(observacao) },
      });
      return { ok: true, versao };
    });
  try {
    return await gravar();
  } catch (erro) {
    if (!ehRepetida(erro)) throw erro;
    return gravar();
  }
}

/**
 * O arquivo para o Baixar: a versao atual, ou a pedida. A soma e recalculada sobre os bytes lidos: arquivo que nao
 * confere com o sha256 gravado nunca e entregue (`status` 500 para a rota; 404 quando nao ha o que baixar).
 */
export async function lerArquivoParaBaixar(licencaId, versao = null) {
  const licenca = await prisma.licenca.findUnique({ where: { id: licencaId ?? "" }, select: { identificador: true } });
  if (!licenca) return { ok: false, status: 404, erro: "Licença não encontrada." };
  const arquivo = await prisma.arquivoDeLicenca.findFirst({
    where: { licencaId, ...(versao != null ? { versao: Number(versao) } : { atual: true }) },
    select: { nomeOriginal: true, bytes: true, sha256: true },
  });
  if (!arquivo) return { ok: false, status: 404, erro: versao != null ? `A versão ${versao} não existe.` : "Esta licença não tem arquivo." };
  const bytes = Buffer.from(arquivo.bytes);
  if (sha256Hex(bytes) !== arquivo.sha256) return { ok: false, status: 500, erro: "Soma de verificação não confere: avise antes de entregar." };
  return { ok: true, identificador: licenca.identificador, nomeOriginal: arquivo.nomeOriginal, bytes, sha256: arquivo.sha256 };
}

/** O PDF de instrucoes do programa (o que o dono manda ao cliente junto do arquivo). */
export async function lerInstrucoes(softwareId) {
  const programa = await prisma.software.findUnique({ where: { id: softwareId ?? "" }, select: { instrucoesNome: true, instrucoesBytes: true, instrucoesTipo: true } });
  if (!programa?.instrucoesBytes) return null;
  return { nome: programa.instrucoesNome || "instrucoes.pdf", bytes: Buffer.from(programa.instrucoesBytes), tipo: programa.instrucoesTipo || "application/pdf" };
}

// ---------------------------------------------------------------------------
// Linhas (a vaga entregue a um cliente)
// ---------------------------------------------------------------------------

/**
 * Confere e monta os campos de uma linha. `linhaAtual` vem na edicao: a linha importada sem CPF (so `nomeAnotado`)
 * pode ser editada sem escolher cliente; escolhido o cliente, o nome anotado sai.
 */
async function camposDaLinha(licenca, dados, linhaAtual = null) {
  if (licenca.arquivada) return { erro: "Licença arquivada." };
  const campos = {};
  if (dados.clienteId) {
    const cliente = await prisma.cliente.findUnique({ where: { id: dados.clienteId }, select: { id: true, documento: true } });
    if (!cliente) return { erro: "Cliente não encontrado." };
    if (!cliente.documento) return { erro: "O cliente precisa ter CPF ou CNPJ." };
    campos.clienteId = cliente.id;
    campos.nomeAnotado = null;
  } else if (!(linhaAtual && !linhaAtual.clienteId && linhaAtual.nomeAnotado)) {
    return { erro: "Escolha o cliente." };
  }

  if (dados.pedidoDeVendaId) {
    const pedido = await prisma.pedidoDeVenda.findUnique({ where: { id: dados.pedidoDeVendaId }, select: { id: true, clienteId: true } });
    if (!pedido) return { erro: "Pedido não encontrado." };
    const clienteDaLinha = campos.clienteId ?? linhaAtual?.clienteId ?? null;
    if (!clienteDaLinha || pedido.clienteId !== clienteDaLinha) return { erro: "O pedido não é deste cliente." };
    campos.pedidoDeVendaId = pedido.id;
  } else if (dados.pedidoDeVendaId !== undefined) {
    campos.pedidoDeVendaId = null;
  }

  if (dados.canal !== undefined) {
    if (dados.canal && !CANAIS.has(dados.canal)) return { erro: "Canal desconhecido." };
    campos.canal = dados.canal || null;
  }
  if (dados.data !== undefined) campos.data = dados.data || null;
  // O nome do PC e gravado como veio (so aparado): a comparacao com o portal normaliza na hora.
  if (dados.nomeDoPc !== undefined) campos.nomeDoPc = textoOuNulo(dados.nomeDoPc);
  if (dados.equipamento !== undefined) campos.equipamento = textoOuNulo(dados.equipamento);
  if (dados.observacoes !== undefined) campos.observacoes = textoOuNulo(dados.observacoes);
  return { campos };
}

export async function criarLinha(licencaId, dados = {}) {
  const licenca = await prisma.licenca.findUnique({ where: { id: licencaId ?? "" }, select: { id: true, arquivada: true } });
  if (!licenca) return { ok: false, erro: "Licença não encontrada." };
  const { erro, campos } = await camposDaLinha(licenca, dados);
  if (erro) return { ok: false, erro };
  const maior = await prisma.linhaDeLicenca.aggregate({ where: { licencaId }, _max: { ordem: true } });
  const linha = await prisma.linhaDeLicenca.create({ data: { ...campos, licencaId, ordem: (maior._max.ordem ?? 0) + 1 }, select: { id: true } });
  return { ok: true, id: linha.id };
}

export async function editarLinha(id, dados = {}) {
  const linha = await prisma.linhaDeLicenca.findUnique({ where: { id: id ?? "" }, include: { licenca: { select: { id: true, arquivada: true } } } });
  if (!linha) return { ok: false, erro: "Linha não encontrada." };
  const { erro, campos } = await camposDaLinha(linha.licenca, dados, linha);
  if (erro) return { ok: false, erro };
  await prisma.linhaDeLicenca.update({ where: { id }, data: campos });
  return { ok: true };
}

async function mudarSituacaoDaLinha(id, data) {
  const mudou = await prisma.linhaDeLicenca.updateMany({ where: { id: id ?? "" }, data });
  return mudou.count ? { ok: true } : { ok: false, erro: "Linha não encontrada." };
}

export const encerrarLinha = (id) => mudarSituacaoDaLinha(id, { situacao: "ENCERRADA", encerradaEm: new Date() });
export const reabrirLinha = (id) => mudarSituacaoDaLinha(id, { situacao: "ATIVA", encerradaEm: null });

export async function excluirLinha(id) {
  const apagada = await prisma.linhaDeLicenca.deleteMany({ where: { id: id ?? "" } });
  return apagada.count ? { ok: true } : { ok: false, erro: "Linha não encontrada." };
}

// ---------------------------------------------------------------------------
// Clientes, pedidos e leituras
// ---------------------------------------------------------------------------

/** A mesma busca da janela Vincular cliente dos Pedidos; a tela desabilita quem nao tem CPF/CNPJ. */
export function buscarClientes(texto) {
  return buscarClientesParaVincular(texto);
}

export async function pedidosRecentesDoCliente(clienteId, dias = 180) {
  if (!clienteId) return [];
  const desde = new Date(Date.now() - dias * 24 * 60 * 60 * 1000);
  return prisma.pedidoDeVenda.findMany({
    where: { clienteId, dataDaVenda: { gte: desde } },
    orderBy: { dataDaVenda: "desc" },
    take: 20,
    select: { id: true, numero: true, canal: true, dataDaVenda: true },
  });
}

/** As licencas de um cliente (aba "Licenças" do cadastro): as ativas primeiro, depois a entrega mais recente. */
export async function licencasDoCliente(clienteId) {
  if (!clienteId) return [];
  const linhas = await prisma.linhaDeLicenca.findMany({
    where: { clienteId },
    orderBy: [{ situacao: "asc" }, { data: { sort: "desc", nulls: "last" } }],
    include: { licenca: { select: { id: true, identificador: true, software: { select: { nome: true, slug: true } } } } },
  });
  return linhas.map((linha) => ({
    linhaId: linha.id,
    licencaId: linha.licenca.id,
    software: { nome: linha.licenca.software.nome, slug: linha.licenca.software.slug },
    identificador: linha.licenca.identificador,
    data: linha.data,
    nomeDoPc: linha.nomeDoPc,
    equipamento: linha.equipamento,
    situacao: linha.situacao,
    encerradaEm: linha.encerradaEm,
  }));
}

/** Quao recente e a ultima leitura COMPLETA do portal deste programa (a incompleta nao garante as vagas). */
export async function frescorDoPrograma(softwareId) {
  const ultima = await prisma.leituraDoPortal.findFirst({ where: { softwareId, completa: true }, orderBy: { lidaEm: "desc" }, select: { lidaEm: true } });
  const lidaEm = ultima?.lidaEm ?? null;
  return { lidaEm, ...frescorDaLeitura(lidaEm) };
}

export function listarLeituras(softwareId, limite = 30) {
  return prisma.leituraDoPortal.findMany({ where: { softwareId }, orderBy: { lidaEm: "desc" }, take: limite });
}

// ---------------------------------------------------------------------------
// Importacao das planilhas e da pasta (uma vez; o plano vem de importacao.js)
// ---------------------------------------------------------------------------

/** O motivo de a linha ficar sem cliente, tirado da observacao que o plano escreveu. */
function motivoSemCliente(observacoes) {
  return /(CPF|CNPJ) inválido na planilha: .*$|sem CPF na planilha/.exec(String(observacoes ?? ""))?.[0] ?? "sem cliente";
}

/** O cliente da linha: o existente pelo documento e ligado SEM mexer em nada (pode ter vindo dos Pedidos); senao criado. */
async function clienteDaLinha(db, cliente, { simulado, criados, ligados, resumo }) {
  const documento = cliente.documento;
  if (criados.has(documento)) return criados.get(documento);
  const existente = await db.cliente.findUnique({ where: { documento }, select: { id: true } });
  if (existente) {
    ligados.add(existente.id);
    return existente.id;
  }
  resumo.clientes.criados++;
  if (simulado) {
    criados.set(documento, null);
    return null;
  }
  const endereco = cliente.endereco;
  const criado = await db.cliente.create({
    data: {
      nome: textoOuNulo(cliente.nome) ?? documento,
      tipoPessoa: documento.replace(/\D/g, "").length === 14 ? "JURIDICA" : "FISICA",
      documento,
      telefone: telefoneParaGravar(cliente.telefone),
      email: textoOuNulo(cliente.email)?.toLowerCase() ?? null,
      ...(endereco ? { enderecos: { create: { tipo: "GERAL", logradouro: endereco.logradouro, cidade: endereco.cidade, uf: endereco.uf, cep: endereco.cep } } } : {}),
    },
    select: { id: true },
  });
  criados.set(documento, criado.id);
  return criado.id;
}

/**
 * Grava o plano da importacao (spec §6.5). Idempotente: licenca por (programa, chave), linha por (licenca, ordem),
 * cliente por documento e arquivo por (licenca, sha256); rodar duas vezes nao cria nada. Da licenca que ja existe so
 * preenche tipo, renovacao e observacoes vazios. Arquivo novo de uma licenca que ja tem arquivo entra como versao
 * seguinte SEM virar a atual: a atual pode ser uma que o dono enviou depois da planilha. `simular` le tudo e nao grava.
 */
export async function aplicarPlanoDeImportacao(plano, { simular = false } = {}) {
  const resumo = {
    licencas: { novas: 0, existentes: 0 },
    linhas: { novas: 0, existentes: 0 },
    clientes: { criados: 0, ligados: 0 },
    semCliente: [],
    arquivos: { novos: 0, existentes: 0 },
    avisos: [...(plano?.avisos ?? [])],
  };
  const programas = new Map();
  const criados = new Map();
  const ligados = new Set();

  for (const item of plano?.licencas ?? []) {
    if (!programas.has(item.software)) programas.set(item.software, await prisma.software.findUnique({ where: { slug: String(item.software ?? "") } }));
    const software = programas.get(item.software);
    const identificador = software ? normalizarIdentificador(item.identificador, software.identificacao) : String(item.identificador ?? "").trim();
    if (!software) {
      resumo.avisos.push(`Programa "${item.software}" não existe no Rise: ${identificador} ficou de fora.`);
      continue;
    }
    if (!identificador) continue;

    const aplicar = async (db, simulado) => {
      const existente = await db.licenca.findFirst({
        where: { softwareId: software.id, identificador: { equals: identificador, mode: "insensitive" } },
        select: { id: true, tipo: true, renovadaEm: true, observacoes: true },
      });
      let licencaId = existente?.id ?? null;
      const renovadaEm = lerDataIso(item.renovadaEm);
      if (existente) {
        resumo.licencas.existentes++;
        const vazios = {};
        if (!existente.tipo && textoOuNulo(item.tipo)) vazios.tipo = textoOuNulo(item.tipo);
        if (!existente.renovadaEm && renovadaEm) vazios.renovadaEm = renovadaEm;
        if (!existente.observacoes && textoOuNulo(item.observacoes)) vazios.observacoes = textoOuNulo(item.observacoes);
        if (!simulado && Object.keys(vazios).length) await db.licenca.update({ where: { id: existente.id }, data: vazios });
      } else {
        resumo.licencas.novas++;
        if (!simulado) {
          const criada = await db.licenca.create({
            data: { softwareId: software.id, identificador, tipo: textoOuNulo(item.tipo), renovadaEm, observacoes: textoOuNulo(item.observacoes), origem: "planilha" },
            select: { id: true },
          });
          licencaId = criada.id;
        }
      }

      if (item.arquivo?.bytes) {
        if (software.identificacao !== "ARQUIVO") {
          resumo.avisos.push(`${identificador}: o programa não usa arquivo; o arquivo ficou de fora.`);
        } else {
          const lido = lerArquivoEnviado({ nome: item.arquivo.nomeOriginal, bytes: item.arquivo.bytes });
          if (!lido.ok) {
            resumo.avisos.push(`${identificador}: ${lido.erro}`);
          } else if (licencaId && (await db.arquivoDeLicenca.findFirst({ where: { licencaId, sha256: lido.sha256 }, select: { id: true } }))) {
            resumo.arquivos.existentes++;
          } else {
            resumo.arquivos.novos++;
            if (!simulado) {
              const maior = await db.arquivoDeLicenca.aggregate({ where: { licencaId }, _max: { versao: true } });
              const temAtual = await db.arquivoDeLicenca.findFirst({ where: { licencaId, atual: true }, select: { id: true } });
              await db.arquivoDeLicenca.create({
                data: { licencaId, versao: (maior._max.versao ?? 0) + 1, nomeOriginal: lido.nomeOriginal, bytes: lido.bytes, sha256: lido.sha256, tamanhoBytes: lido.tamanhoBytes, mimeType: lido.mimeType, atual: !temAtual, enviadoPor: "importação da planilha" },
              });
            }
          }
        }
      }

      for (const linha of item.linhas ?? []) {
        if (licencaId && (await db.linhaDeLicenca.findFirst({ where: { licencaId, ordem: linha.ordem }, select: { id: true } }))) {
          resumo.linhas.existentes++;
          continue;
        }
        resumo.linhas.novas++;
        const clienteId = linha.cliente?.documento ? await clienteDaLinha(db, linha.cliente, { simulado, criados, ligados, resumo }) : null;
        if (!linha.cliente?.documento) resumo.semCliente.push({ identificador, nome: linha.nomeAnotado ?? null, motivo: motivoSemCliente(linha.observacoes) });
        if (simulado) continue;
        await db.linhaDeLicenca.create({
          data: {
            licencaId,
            ordem: linha.ordem,
            clienteId,
            nomeAnotado: linha.cliente?.documento ? null : textoOuNulo(linha.nomeAnotado),
            data: lerDataIso(linha.data),
            canal: CANAIS.has(linha.canal) ? linha.canal : null,
            nomeDoPc: textoOuNulo(linha.nomeDoPc),
            equipamento: textoOuNulo(linha.equipamento),
            observacoes: textoOuNulo(linha.observacoes),
            situacao: linha.situacao === "ENCERRADA" ? "ENCERRADA" : "ATIVA",
          },
        });
      }
    };

    if (simular) await aplicar(prisma, true);
    else await prisma.$transaction((tx) => aplicar(tx, false), { timeout: 60000 });
  }
  resumo.clientes.ligados = ligados.size;
  return resumo;
}
