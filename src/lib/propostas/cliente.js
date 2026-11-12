import { prisma } from "@/lib/db";
import { clienteBling } from "@/lib/blingSync/cliente";
import { exigirTravaLiberada } from "@/lib/integracoes/config";
import { formatarCep, formatarCnpj, formatarCpf, validarCnpj, validarCpf } from "@/lib/documentos";
import { telefoneParaGravar } from "@/lib/telefone";

/**
 * O cliente da proposta (spec 2026-11-12, "Cliente: buscar, provisorio e cadastro"). Regras do dono:
 * - a busca e uma so: o Rise primeiro, depois o Bling;
 * - cliente SEM CPF/CNPJ nunca entra no cadastro (fica so dentro da proposta, como "provisorio");
 * - com documento valido, o cadastro nasce NA HORA, no Rise e no Bling.
 * Falha no Bling nunca derruba o Rise: o cliente fica criado aqui e volta um aviso, com o "Enviar ao Bling" na tela.
 *
 * Toda funcao recebe o Bling por parametro (`bling`), para o teste usar o Bling falso; e `exigirEscrita` separado,
 * porque o `exigirEscrita(codigo)` do cliente do Bling e a trava por CODIGO DE PRODUTO, que um contato nao tem.
 */

const escritaDoBling = () => exigirTravaLiberada("BLING");

const soDigitos = (texto) => String(texto ?? "").replace(/\D/g, "");
const listaDe = (resposta) => (Array.isArray(resposta?.dados?.data) ? resposta.dados.data : []);
const idOuNull = (valor) => {
  const id = Number(valor);
  return Number.isSafeInteger(id) && id > 0 ? String(id) : null;
};

/** CPF/CNPJ valido, formatado como o cadastro grava; qualquer outra coisa = null. */
export function documentoValido(texto) {
  const digitos = soDigitos(texto);
  if (digitos.length === 11 && validarCpf(digitos)) return { digitos, formatado: formatarCpf(digitos), tipoPessoa: "FISICA" };
  if (digitos.length === 14 && validarCnpj(digitos)) return { digitos, formatado: formatarCnpj(digitos), tipoPessoa: "JURIDICA" };
  return null;
}

class FalhaDoBling extends Error {}

async function lerDoBling(bling, caminho, params, oQue) {
  let resposta;
  try {
    resposta = await bling.get(caminho, params);
  } catch (erro) {
    throw new FalhaDoBling(`Não foi possível concluir ${oQue} no Bling: ${erro?.message ?? erro}`);
  }
  if (!resposta?.ok) throw new FalhaDoBling(`O Bling recusou ${oQue} (HTTP ${resposta?.status ?? "?"}).`);
  return resposta;
}

/** O contato do Bling no formato que a tela mostra. */
function resumoDoContato(contato) {
  const digitos = soDigitos(contato?.numeroDocumento);
  const doc = documentoValido(digitos);
  return {
    blingId: idOuNull(contato?.id),
    nome: String(contato?.nome ?? "").trim(),
    documento: doc?.formatado ?? (digitos || null),
    telefone: telefoneParaGravar(contato?.celular || contato?.telefone || "") ?? null,
    email: String(contato?.email ?? "").trim() || null,
  };
}

/**
 * A busca unica da proposta. Devolve `{ rise, bling, erroBling }`: os clientes do Rise (ate 10) e os contatos do Bling
 * que ainda NAO estao no Rise (pelo documento ou pelo id do contato). Falha no Bling nao some com o Rise: vira
 * `erroBling`. Texto com 11 ou 14 digitos busca no Bling pelo documento; senao, pelo nome (`pesquisa`, a partir de 3
 * letras). `criterio=1` = todos os contatos (o padrao do Bling, 3, so os ultimos incluidos).
 */
export async function buscarClienteParaProposta(texto, { bling = clienteBling(), db = prisma } = {}) {
  const termo = String(texto ?? "").trim();
  if (termo.length < 2) return { rise: [], bling: [], erroBling: null };
  const digitos = soDigitos(termo);
  const ou = [{ nome: { contains: termo, mode: "insensitive" } }, { nomeFantasia: { contains: termo, mode: "insensitive" } }];
  if (digitos.length >= 3) {
    ou.push({ documento: { contains: termo } });
    const doc = documentoValido(digitos);
    if (doc) ou.push({ documento: doc.formatado });
  }
  const rise = await db.cliente.findMany({
    where: { OR: ou, ativo: true },
    orderBy: { nome: "asc" },
    take: 10,
    select: { id: true, nome: true, nomeFantasia: true, documento: true, telefone: true, email: true, blingContatoId: true },
  });

  let doBling = [];
  let erroBling = null;
  const porDocumento = digitos.length === 11 || digitos.length === 14;
  if (porDocumento || termo.length >= 3) {
    try {
      const params = porDocumento ? { numeroDocumento: digitos, criterio: 1 } : { pesquisa: termo, criterio: 1 };
      const lista = listaDe(await lerDoBling(bling, "/contatos", params, "a busca do cliente"));
      const documentosDoRise = new Set(rise.map((c) => soDigitos(c.documento)).filter(Boolean));
      const idsDoRise = new Set(rise.map((c) => c.blingContatoId).filter(Boolean));
      doBling = lista
        .filter((contato) => contato?.situacao !== "E" && idOuNull(contato?.id))
        .map(resumoDoContato)
        .filter((c) => !idsDoRise.has(c.blingId) && !(c.documento && documentosDoRise.has(soDigitos(c.documento))))
        .slice(0, 10);
      // Quem ja esta no Rise com o mesmo documento (mas fora dos 10 do nome) tambem nao e oferecido de novo.
      const docs = doBling.map((c) => documentoValido(c.documento)?.formatado).filter(Boolean);
      if (docs.length) {
        const jaNoRise = new Set((await db.cliente.findMany({ where: { documento: { in: docs } }, select: { documento: true } })).map((c) => c.documento));
        doBling = doBling.filter((c) => !jaNoRise.has(documentoValido(c.documento)?.formatado));
      }
    } catch (erro) {
      if (!(erro instanceof FalhaDoBling)) throw erro;
      erroBling = erro.message;
    }
  }
  return { rise, bling: doBling, erroBling };
}

/** Os dados do Rise a partir do contato COMPLETO do Bling (GET /contatos/{id}). */
function clienteDoContato(contato, doc) {
  const geral = contato?.endereco?.geral ?? {};
  const temEndereco = Boolean(geral.cep || geral.endereco || geral.municipio);
  return {
    nome: String(contato?.nome ?? "").trim() || "Cliente do Bling",
    nomeFantasia: doc.tipoPessoa === "JURIDICA" ? String(contato?.fantasia ?? "").trim() || null : null,
    tipoPessoa: doc.tipoPessoa,
    documento: doc.formatado,
    inscricaoEstadual: doc.tipoPessoa === "JURIDICA" ? String(contato?.ie ?? "").trim() || null : null,
    telefone: telefoneParaGravar(contato?.celular || contato?.telefone || "") ?? null,
    email: String(contato?.email ?? "").trim() || null,
    blingContatoId: idOuNull(contato?.id),
    observacoes: "Copiado do Bling pela proposta",
    enderecos: temEndereco
      ? {
          create: [
            {
              tipo: "GERAL",
              cep: geral.cep ? formatarCep(geral.cep) : null,
              uf: geral.uf || null,
              cidade: geral.municipio || null,
              bairro: geral.bairro || null,
              logradouro: geral.endereco || null,
              numero: geral.numero || null,
              complemento: geral.complemento || null,
            },
          ],
        }
      : undefined,
  };
}

/**
 * "Usar este" num contato do Bling: copia para o Rise e devolve o id. Contato SEM CPF/CNPJ valido nao entra no
 * cadastro (regra do dono): volta `provisorio` com nome, telefone e e-mail, para a proposta usar como provisorio.
 * Documento que ja esta no Rise so liga o id do Bling ao cliente existente (nunca duplica, nunca reescreve o nome).
 */
export async function copiarContatoDoBling(blingId, { bling = clienteBling(), db = prisma } = {}) {
  let contato;
  try {
    contato = (await lerDoBling(bling, `/contatos/${blingId}`, undefined, "a leitura do contato")).dados?.data;
  } catch (erro) {
    if (erro instanceof FalhaDoBling) return { ok: false, erro: erro.message };
    throw erro;
  }
  if (!contato) return { ok: false, erro: "O Bling não devolveu o contato." };
  const doc = documentoValido(contato.numeroDocumento);
  if (!doc) return { ok: true, clienteId: null, provisorio: resumoDoContato(contato) };

  const existente = await db.cliente.findUnique({ where: { documento: doc.formatado }, select: { id: true, blingContatoId: true } });
  if (existente) {
    if (!existente.blingContatoId) await ligarIdDoBling(db, existente.id, idOuNull(contato.id));
    return { ok: true, clienteId: existente.id };
  }
  const criado = await db.cliente.create({ data: clienteDoContato(contato, doc), select: { id: true } });
  return { ok: true, clienteId: criado.id };
}

/** Liga o id do Bling ao cliente, sem estourar o unico se outro cliente ja tem o mesmo id (fica como estava). */
async function ligarIdDoBling(db, clienteId, blingContatoId) {
  if (!blingContatoId) return;
  const dono = await db.cliente.findUnique({ where: { blingContatoId }, select: { id: true } });
  if (dono && dono.id !== clienteId) return;
  await db.cliente.update({ where: { id: clienteId }, data: { blingContatoId } });
}

/** O id do tipo de contato "Cliente" da conta (os ids sao da conta, nunca fixos). */
async function idDoTipoCliente(bling) {
  const tipos = listaDe(await lerDoBling(bling, "/contatos/tipos", undefined, "a leitura dos tipos de contato"));
  const tipo = tipos.find((t) => String(t?.descricao ?? "").normalize("NFD").replace(/\p{M}/gu, "").toLowerCase() === "cliente");
  if (!idOuNull(tipo?.id)) throw new FalhaDoBling("O Bling não tem o tipo de contato Cliente, então o cliente não foi criado lá.");
  return Number(tipo.id);
}

/**
 * Garante o cliente no Bling: acha pelo documento (`numeroDocumento` com os digitos, criterio 1, nunca um excluido)
 * ou cria com o tipo Cliente, e grava o `blingContatoId`. Devolve `{ ok, blingContatoId }` ou `{ ok: false, erro }`;
 * nunca lanca por falha do Bling.
 */
export async function enviarClienteAoBling(clienteId, { bling = clienteBling(), db = prisma, exigirEscrita = escritaDoBling } = {}) {
  const cliente = await db.cliente.findUnique({ where: { id: clienteId }, include: { enderecos: true } });
  if (!cliente) return { ok: false, erro: "Cliente não encontrado." };
  if (cliente.blingContatoId) return { ok: true, blingContatoId: cliente.blingContatoId };
  const doc = documentoValido(cliente.documento);
  if (!doc) return { ok: false, erro: "O cliente não tem CPF/CNPJ válido, então não vai ao Bling." };
  try {
    const achados = listaDe(await lerDoBling(bling, "/contatos", { numeroDocumento: doc.digitos, criterio: 1 }, "a busca do cliente pelo documento"));
    const existente = achados.find((c) => soDigitos(c?.numeroDocumento) === doc.digitos && c?.situacao !== "E" && idOuNull(c?.id));
    let blingContatoId = existente ? idOuNull(existente.id) : null;
    if (!blingContatoId) {
      try {
        exigirEscrita();
      } catch (erro) {
        return { ok: false, erro: erro.message };
      }
      const idDoTipo = await idDoTipoCliente(bling);
      const geral = cliente.enderecos.find((e) => e.tipo === "GERAL");
      const corpo = {
        nome: cliente.nome,
        situacao: "A",
        tipo: doc.tipoPessoa === "JURIDICA" ? "J" : "F",
        numeroDocumento: doc.digitos,
        ...(cliente.nomeFantasia ? { fantasia: cliente.nomeFantasia } : {}),
        ...(cliente.inscricaoEstadual ? { ie: cliente.inscricaoEstadual } : {}),
        ...(cliente.telefone ? { celular: cliente.telefone } : {}),
        ...(cliente.email ? { email: cliente.email } : {}),
        ...(geral
          ? {
              endereco: {
                geral: {
                  endereco: geral.logradouro ?? "",
                  numero: geral.numero ?? "",
                  complemento: geral.complemento ?? "",
                  bairro: geral.bairro ?? "",
                  cep: soDigitos(geral.cep),
                  municipio: geral.cidade ?? "",
                  uf: geral.uf ?? "",
                },
              },
            }
          : {}),
        tiposContato: [{ id: idDoTipo }],
      };
      let resposta;
      try {
        resposta = await bling.post("/contatos", corpo);
      } catch (erro) {
        return { ok: false, erro: `Falha ao criar o cliente no Bling: ${erro?.message ?? erro}. Confira no Bling antes de tentar de novo.` };
      }
      if (!resposta?.ok) return { ok: false, erro: `O Bling recusou a criação do cliente (HTTP ${resposta?.status ?? "?"}).` };
      blingContatoId = idOuNull(resposta.dados?.data?.id);
      if (!blingContatoId) return { ok: false, erro: "O Bling criou o cliente, mas não devolveu o id. Confira no Bling." };
    }
    await ligarIdDoBling(db, cliente.id, blingContatoId);
    return { ok: true, blingContatoId };
  } catch (erro) {
    if (erro instanceof FalhaDoBling) return { ok: false, erro: erro.message };
    throw erro;
  }
}

/**
 * O Salvar da proposta com cliente provisorio. Sem documento: nada (continua provisorio). Com documento invalido:
 * erro (a tela mostra no campo). Com documento valido: acha no Rise, ou copia do Bling, ou cria no Rise; e depois
 * garante no Bling. Devolve `{ clienteId, avisoBling }` ou `{ erro }`.
 */
export async function garantirClienteDaProposta({ nome, documento, telefone, email }, { bling = clienteBling(), db = prisma, exigirEscrita = escritaDoBling } = {}) {
  if (!soDigitos(documento)) return { clienteId: null };
  const doc = documentoValido(documento);
  if (!doc) return { erro: "CPF/CNPJ inválido." };

  let clienteId = (await db.cliente.findUnique({ where: { documento: doc.formatado }, select: { id: true } }))?.id ?? null;
  if (!clienteId) {
    // No Bling primeiro: o contato de la traz endereco e IE, que o provisorio nao tem.
    try {
      const achados = listaDe(await lerDoBling(bling, "/contatos", { numeroDocumento: doc.digitos, criterio: 1 }, "a busca do cliente pelo documento"));
      const contato = achados.find((c) => soDigitos(c?.numeroDocumento) === doc.digitos && c?.situacao !== "E" && idOuNull(c?.id));
      if (contato) {
        const copia = await copiarContatoDoBling(contato.id, { bling, db });
        if (copia.ok && copia.clienteId) clienteId = copia.clienteId;
      }
    } catch (erro) {
      if (!(erro instanceof FalhaDoBling)) throw erro;
    }
  }
  if (!clienteId) {
    const criado = await db.cliente.create({
      data: {
        nome: String(nome ?? "").trim() || "Cliente da proposta",
        tipoPessoa: doc.tipoPessoa,
        documento: doc.formatado,
        telefone: telefoneParaGravar(telefone ?? "") ?? null,
        email: String(email ?? "").trim() || null,
        observacoes: "Criado pela proposta",
      },
      select: { id: true },
    });
    clienteId = criado.id;
  }
  const noBling = await enviarClienteAoBling(clienteId, { bling, db, exigirEscrita });
  return { clienteId, avisoBling: noBling.ok ? null : noBling.erro };
}
