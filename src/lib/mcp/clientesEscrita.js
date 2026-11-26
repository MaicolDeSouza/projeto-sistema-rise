import { z } from "zod";

import { prisma } from "@/lib/db";
import { documentoValido } from "@/lib/propostas/cliente";
import { ErroDeFerramenta } from "@/lib/riseAi/ferramentas/erro";
import { formatarTelefone, telefoneParaGravar } from "@/lib/telefone";

import { CONFIRMO, ESCRITA, acharCliente, exigir, previa } from "./doisPassos.js";

/**
 * Cadastrar e editar cliente pelo MCP (26/11/2026, grupo "Clientes"). So o basico que a conversa traz: nome, CPF/CNPJ,
 * telefone, e-mail e observacoes; endereco, contatos, condicoes comerciais e o portal ficam na tela de Cadastros. Grava so
 * no Rise (o contato do Bling nasce quando a proposta gera o pedido, como hoje). Mesmo acesso da tela: editar Clientes, e
 * o dado pessoal para o documento, o telefone, o e-mail e as observacoes.
 */

const emailValido = (texto) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(texto);

function telefoneConferido(texto) {
  if (texto === undefined) return undefined;
  if (texto === null || texto === "") return null;
  const gravar = telefoneParaGravar(texto);
  if (!gravar) throw new ErroDeFerramenta(`Telefone inválido: ${texto}. Use DDD + número, ex.: (54) 98899-0008.`);
  return gravar;
}

function emailConferido(texto) {
  if (texto === undefined) return undefined;
  const limpo = String(texto ?? "").trim();
  if (!limpo) return null;
  if (!emailValido(limpo)) throw new ErroDeFerramenta(`E-mail inválido: ${limpo}.`);
  return limpo;
}

const paraMostrar = (dados) => ({
  nome: dados.nome,
  ...(dados.documento !== undefined ? { documento: dados.documento } : {}),
  ...(dados.tipoPessoa ? { tipoPessoa: dados.tipoPessoa === "JURIDICA" ? "Pessoa Jurídica" : "Pessoa Física" } : {}),
  ...(dados.telefone !== undefined ? { telefone: dados.telefone ? formatarTelefone(dados.telefone) : null } : {}),
  ...(dados.email !== undefined ? { email: dados.email } : {}),
  ...(dados.observacoes !== undefined ? { observacoes: dados.observacoes } : {}),
});

export async function cadastrarCliente({ nome, documento, telefone, email, observacoes, confirmo }, { pode, usuario }) {
  exigir(pode, "tela.cadastros.clientes", "editar", "cadastrar clientes");
  exigir(pode, "dado.pessoalDoCliente", "editar", "gravar dados pessoais do cliente (o CPF/CNPJ é obrigatório)");
  const doc = documentoValido(documento);
  if (!doc) throw new ErroDeFerramenta(`CPF/CNPJ inválido: ${documento}.`);
  const existente = await prisma.cliente.findUnique({ where: { documento: doc.formatado }, select: { nome: true } });
  if (existente) throw new ErroDeFerramenta(`Já existe cliente com o documento ${doc.formatado}: ${existente.nome}. Use editarCliente para mudar algo.`);

  const dados = {
    nome: nome.trim(),
    tipoPessoa: doc.tipoPessoa,
    documento: doc.formatado,
    telefone: telefoneConferido(telefone) ?? null,
    email: emailConferido(email) ?? null,
    observacoes: observacoes?.trim() || `Criado pelo Claude (MCP) por ${usuario ?? "?"}`,
  };
  if (!confirmo) return previa({ vaiCadastrar: paraMostrar(dados), ondeGrava: "Só no Rise (o contato do Bling nasce quando uma proposta gerar pedido)." });

  try {
    const criado = await prisma.cliente.create({ data: dados, select: { id: true } });
    return { gravado: true, clienteId: criado.id, cliente: paraMostrar(dados) };
  } catch (erro) {
    // Dois pedidos ao mesmo tempo com o mesmo documento: o indice unico segura o segundo.
    if (erro?.code === "P2002") throw new ErroDeFerramenta(`Já existe cliente com o documento ${doc.formatado}.`);
    throw erro;
  }
}

export async function editarCliente({ cliente, nome, telefone, email, observacoes, confirmo }, { pode }) {
  exigir(pode, "tela.cadastros.clientes", "editar", "editar clientes");
  const mexeNoPessoal = telefone !== undefined || email !== undefined || observacoes !== undefined;
  if (mexeNoPessoal) exigir(pode, "dado.pessoalDoCliente", "editar", "mudar telefone, e-mail ou observações do cliente");
  const atual = await acharCliente(cliente);

  const mudancas = {};
  if (nome !== undefined && nome.trim() !== atual.nome) mudancas.nome = nome.trim();
  const tel = telefoneConferido(telefone);
  if (tel !== undefined && tel !== (atual.telefone ?? null)) mudancas.telefone = tel;
  const mail = emailConferido(email);
  if (mail !== undefined && mail !== (atual.email ?? null)) mudancas.email = mail;
  if (observacoes !== undefined && (observacoes.trim() || null) !== (atual.observacoes ?? null)) mudancas.observacoes = observacoes.trim() || null;
  if (!Object.keys(mudancas).length) throw new ErroDeFerramenta("Nada a mudar: os dados informados já são os do cadastro.");

  const antes = Object.fromEntries(Object.keys(mudancas).map((campo) => [campo, atual[campo] ?? null]));
  const mostrar = (valores) => ({ ...valores, ...("telefone" in valores ? { telefone: valores.telefone ? formatarTelefone(valores.telefone) : null } : {}) });
  if (!confirmo) return previa({ cliente: atual.nome, antes: mostrar(antes), depois: mostrar(mudancas) });

  await prisma.cliente.update({ where: { id: atual.id }, data: mudancas });
  return { gravado: true, cliente: mudancas.nome ?? atual.nome, mudou: mostrar(mudancas) };
}

const TEXTO = (maximo) => z.string().trim().max(maximo);

export const FERRAMENTAS_DE_CLIENTES_ESCRITA = [
  {
    nome: "cadastrarCliente",
    descricao:
      "Cadastra um cliente NOVO no Rise com o básico: nome e CPF/CNPJ (obrigatórios), telefone, e-mail e observações. Endereço, contatos e condições ficam na tela de Cadastros. Dois passos: sem confirmo devolve a prévia; com confirmo: true grava. Recusa se o documento já existe (use editarCliente).",
    esquema: z.object({
      nome: TEXTO(200).min(2).describe("Nome completo ou razão social"),
      documento: TEXTO(30).min(11).describe("CPF ou CNPJ, com ou sem pontuação"),
      telefone: TEXTO(40).optional().describe("Com DDD"),
      email: TEXTO(200).optional(),
      observacoes: TEXTO(2000).optional(),
      confirmo: CONFIRMO,
    }),
    anotacoes: ESCRITA,
    executar: cadastrarCliente,
  },
  {
    nome: "editarCliente",
    descricao:
      "Muda o nome, o telefone, o e-mail ou as observações de um cliente do Rise (o CPF/CNPJ não muda por aqui). Passe só o que muda; texto vazio apaga o telefone, o e-mail ou as observações. Dois passos: sem confirmo devolve antes e depois; com confirmo: true grava.",
    esquema: z.object({
      cliente: TEXTO(200).min(1).describe("CPF/CNPJ ou nome do cliente"),
      nome: TEXTO(200).min(2).optional(),
      telefone: TEXTO(40).optional(),
      email: TEXTO(200).optional(),
      observacoes: TEXTO(2000).optional(),
      confirmo: CONFIRMO,
    }),
    anotacoes: ESCRITA,
    executar: editarCliente,
  },
];
