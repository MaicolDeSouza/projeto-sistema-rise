"use server";

import { revalidatePath } from "next/cache";

import { negarSemAcessos, sessaoDeAcessos } from "@/lib/acessos/servidor";
import {
  buscarClientes,
  criarLicenca,
  criarLinha,
  editarLicenca,
  editarLinha,
  encerrarLinha,
  enviarArquivo,
  excluirLicenca,
  excluirLinha,
  excluirSoftware,
  listarLeituras,
  oQueSaiComALicenca,
  pedidosRecentesDoCliente,
  reabrirLinha,
  salvarSoftware,
} from "@/lib/ferramentas/licencas/banco";
import { lerDataIso } from "@/lib/ferramentas/licencas/regras";
import { projetarClientesDaBusca } from "@/lib/pedidos/projecao";

/**
 * As acoes da tela Licencas Softwares (spec 2026-11-05, §6.6). Cada uma confere Acessos na primeira linha: `ver` para
 * as que so leem, `editar` para as que gravam e `excluir` para as que apagam (o nivel de exclusao das telas do Rise).
 * A regra mora em `lib/ferramentas/licencas/banco.js`, onde o teste a alcanca sem o Next. Datas chegam "YYYY-MM-DD".
 */

const VER = ["tela.ferramentas.licencas", "ver"];
const EDITAR = ["tela.ferramentas.licencas", "editar"];
const EXCLUIR = ["tela.ferramentas.licencas", "excluir"];
const INVALIDO = { ok: false, erro: "Pedido inválido." };

const ehId = (valor) => typeof valor === "string" && valor !== "";
const dia = (valor) => (valor ? lerDataIso(String(valor)) : null);
const textoOuVazio = (valor) => (valor == null ? null : String(valor));

async function protegendo(trabalho) {
  try {
    return await trabalho();
  } catch (erro) {
    console.error("[licencas]", erro);
    return { ok: false, erro: "Não foi possível concluir. Tente de novo." };
  }
}

function revalidar(resultado) {
  if (resultado?.ok) revalidatePath("/ferramentas/licencas");
  return resultado;
}

/** O arquivo de um <input type="file"> do FormData; sem arquivo escolhido, null. */
async function arquivoDoFormulario(valor) {
  if (!valor || typeof valor.arrayBuffer !== "function" || !valor.size) return null;
  return { nome: valor.name, bytes: Buffer.from(await valor.arrayBuffer()), tipo: valor.type || null };
}

/** Os campos de uma linha como a janela manda. */
function dadosDaLinha(dados = {}) {
  return {
    clienteId: dados.clienteId || null,
    data: dia(dados.data),
    canal: dados.canal || null,
    pedidoDeVendaId: dados.pedidoDeVendaId || null,
    nomeDoPc: textoOuVazio(dados.nomeDoPc),
    equipamento: textoOuVazio(dados.equipamento),
    observacoes: textoOuVazio(dados.observacoes),
  };
}

// ---------------------------------------------------------------------------
// Licencas
// ---------------------------------------------------------------------------

/** FormData: softwareId, identificador, tipo, compradaEm, renovadaEm, observacoes e, no programa de arquivo, `arquivo`. */
export async function criarLicencaAcao(formData) {
  const negado = await negarSemAcessos(EDITAR);
  if (negado) return negado;
  return protegendo(async () => {
    const { login } = await sessaoDeAcessos();
    return revalidar(
      await criarLicenca({
        softwareId: String(formData.get("softwareId") ?? ""),
        identificador: String(formData.get("identificador") ?? ""),
        tipo: textoOuVazio(formData.get("tipo")),
        compradaEm: dia(formData.get("compradaEm")),
        renovadaEm: dia(formData.get("renovadaEm")),
        observacoes: textoOuVazio(formData.get("observacoes")),
        arquivo: await arquivoDoFormulario(formData.get("arquivo")),
        enviadoPor: login ?? null,
      }),
    );
  });
}

export async function editarLicencaAcao(id, dados = {}) {
  const negado = await negarSemAcessos(EDITAR);
  if (negado) return negado;
  if (!ehId(id)) return INVALIDO;
  return protegendo(async () =>
    revalidar(
      await editarLicenca(id, {
        tipo: textoOuVazio(dados.tipo),
        compradaEm: dia(dados.compradaEm),
        renovadaEm: dia(dados.renovadaEm),
        observacoes: textoOuVazio(dados.observacoes),
        arquivada: Boolean(dados.arquivada),
      }),
    ),
  );
}

export async function oQueSaiComALicencaAcao(id) {
  const negado = await negarSemAcessos(VER);
  if (negado) return negado;
  if (!ehId(id)) return INVALIDO;
  return protegendo(async () => {
    const resumo = await oQueSaiComALicenca(id);
    return resumo ? { ok: true, resumo } : { ok: false, erro: "Licença não encontrada." };
  });
}

export async function excluirLicencaAcao(id) {
  const negado = await negarSemAcessos(EXCLUIR);
  if (negado) return negado;
  if (!ehId(id)) return INVALIDO;
  return protegendo(async () => revalidar(await excluirLicenca(id)));
}

// ---------------------------------------------------------------------------
// Linhas
// ---------------------------------------------------------------------------

export async function criarLinhaAcao(licencaId, dados) {
  const negado = await negarSemAcessos(EDITAR);
  if (negado) return negado;
  if (!ehId(licencaId)) return INVALIDO;
  return protegendo(async () => revalidar(await criarLinha(licencaId, dadosDaLinha(dados))));
}

export async function editarLinhaAcao(id, dados) {
  const negado = await negarSemAcessos(EDITAR);
  if (negado) return negado;
  if (!ehId(id)) return INVALIDO;
  return protegendo(async () => revalidar(await editarLinha(id, dadosDaLinha(dados))));
}

export async function encerrarLinhaAcao(id) {
  const negado = await negarSemAcessos(EDITAR);
  if (negado) return negado;
  if (!ehId(id)) return INVALIDO;
  return protegendo(async () => revalidar(await encerrarLinha(id)));
}

export async function reabrirLinhaAcao(id) {
  const negado = await negarSemAcessos(EDITAR);
  if (negado) return negado;
  if (!ehId(id)) return INVALIDO;
  return protegendo(async () => revalidar(await reabrirLinha(id)));
}

export async function excluirLinhaAcao(id) {
  const negado = await negarSemAcessos(EXCLUIR);
  if (negado) return negado;
  if (!ehId(id)) return INVALIDO;
  return protegendo(async () => revalidar(await excluirLinha(id)));
}

// ---------------------------------------------------------------------------
// Arquivo
// ---------------------------------------------------------------------------

/** FormData: licencaId, arquivo e observacao. Quem enviou e o login da sessao. */
export async function enviarArquivoAcao(formData) {
  const negado = await negarSemAcessos(EDITAR);
  if (negado) return negado;
  return protegendo(async () => {
    const licencaId = String(formData.get("licencaId") ?? "");
    if (!ehId(licencaId)) return INVALIDO;
    const arquivo = await arquivoDoFormulario(formData.get("arquivo"));
    if (!arquivo) return { ok: false, erro: "Escolha o arquivo da licença." };
    const { login } = await sessaoDeAcessos();
    return revalidar(await enviarArquivo(licencaId, { nome: arquivo.nome, bytes: arquivo.bytes, enviadoPor: login ?? null, observacao: textoOuVazio(formData.get("observacao")) }));
  });
}

// ---------------------------------------------------------------------------
// Clientes, pedidos e leituras (so leem)
// ---------------------------------------------------------------------------

/**
 * Os clientes que a janela Vincular cliente oferece. Sem o dado pessoal o CPF/CNPJ nao vai ao navegador, mas a janela
 * ainda precisa saber quem TEM documento (o sem documento nao pode ser escolhido): `temDocumento` sai antes de esconder.
 */
export async function buscarClientesAcao(texto) {
  const negado = await negarSemAcessos(VER);
  if (negado) return { ...negado, clientes: [] };
  return protegendo(async () => {
    const { pode } = await sessaoDeAcessos();
    const achados = await buscarClientes(String(texto ?? "").slice(0, 80));
    const projetados = projetarClientesDaBusca(achados, pode);
    return { ok: true, clientes: projetados.map((cliente, indice) => ({ ...cliente, temDocumento: Boolean(achados[indice].documento) })) };
  });
}

export async function pedidosDoClienteAcao(clienteId) {
  const negado = await negarSemAcessos(VER);
  if (negado) return { ...negado, pedidos: [] };
  if (!ehId(clienteId)) return { ok: true, pedidos: [] };
  return protegendo(async () => ({ ok: true, pedidos: await pedidosRecentesDoCliente(clienteId) }));
}

export async function listarLeiturasAcao(softwareId) {
  const negado = await negarSemAcessos(VER);
  if (negado) return { ...negado, leituras: [] };
  if (!ehId(softwareId)) return INVALIDO;
  return protegendo(async () => ({ ok: true, leituras: await listarLeituras(softwareId) }));
}

// ---------------------------------------------------------------------------
// Programas
// ---------------------------------------------------------------------------

/** FormData do formulario de Programas; `id` vazio cria. O PDF de instrucoes vai em `instrucoes`. */
export async function salvarProgramaAcao(formData) {
  const negado = await negarSemAcessos(EDITAR);
  if (negado) return negado;
  return protegendo(async () => {
    const id = String(formData.get("id") ?? "") || null;
    const resultado = await salvarSoftware(id, {
      nome: String(formData.get("nome") ?? ""),
      identificacao: String(formData.get("identificacao") ?? ""),
      temPortal: formData.get("temPortal") === "on",
      ativacoesPermitidas: String(formData.get("ativacoesPermitidas") ?? ""),
      linhasIniciais: String(formData.get("linhasIniciais") ?? ""),
      linkPortal: textoOuVazio(formData.get("linkPortal")),
      linkSite: textoOuVazio(formData.get("linkSite")),
      ordem: String(formData.get("ordem") ?? "0"),
      ativo: formData.get("ativo") === "on",
      instrucoes: await arquivoDoFormulario(formData.get("instrucoes")),
      apagarInstrucoes: formData.get("apagarInstrucoes") === "on",
    });
    return revalidar(resultado);
  });
}

export async function excluirProgramaAcao(id) {
  const negado = await negarSemAcessos(EXCLUIR);
  if (negado) return negado;
  if (!ehId(id)) return INVALIDO;
  return protegendo(async () => revalidar(await excluirSoftware(id)));
}
