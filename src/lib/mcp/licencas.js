import { z } from "zod";

import { prisma } from "@/lib/db";
import { criarLinha, lerLicenca, listarLicencas, listarSoftwares } from "@/lib/ferramentas/licencas/banco";
import { CANAIS_DA_LICENCA, lerDataIso, rotuloDoCanal } from "@/lib/ferramentas/licencas/regras";
import { ErroDeFerramenta } from "@/lib/riseAi/ferramentas/erro";

import { CONFIRMO, ESCRITA, LEITURA, acharCliente, clienteParaMostrar, exigir, exigirOk, previa } from "./doisPassos.js";
import { acharPedido } from "./pedidosDeVenda.js";

/**
 * Licencas Softwares pelo MCP (26/11/2026, grupo "Licencas"): ver as chaves do LightBurn e os arquivos do Mach3 com os
 * clientes e as vagas livres, e registrar a entrega de uma licenca a um cliente (a "linha" da licenca, como o "+ Cliente"
 * da tela). Pelas MESMAS funcoes de `lib/ferramentas/licencas/banco.js` e com o acesso da tela
 * (`tela.ferramentas.licencas`: ver para ler, editar para registrar). O documento do cliente so com o dado pessoal.
 */

const TEXTO = (maximo) => z.string().trim().max(maximo);
const CANAIS = CANAIS_DA_LICENCA.map((canal) => canal.valor);

async function acharPrograma(referencia) {
  const programas = await listarSoftwares();
  if (!programas.length) throw new ErroDeFerramenta("Nenhum programa cadastrado em Licenças Softwares.");
  if (!referencia) return programas;
  const texto = String(referencia).trim().toLowerCase();
  const achados = programas.filter((p) => p.nome.toLowerCase().includes(texto) || p.slug === texto);
  if (!achados.length) throw new ErroDeFerramenta(`Programa "${referencia}" não encontrado. Os cadastrados: ${programas.map((p) => p.nome).join(", ")}.`);
  return achados;
}

function licencaParaMostrar(licenca, pode, programa) {
  return {
    programa,
    licenca: licenca.identificador,
    tipo: licenca.tipo ?? null,
    situacao: licenca.situacao?.texto ?? null,
    vagas: licenca.vagas?.lida ? { permitidas: licenca.vagas.permitidas, usadas: licenca.vagas.usadas, livres: licenca.vagas.livres } : "não lida do portal",
    ultimoUso: licenca.ultimoUso ?? null,
    clientes: licenca.linhas.map((linha) => ({
      cliente: linha.cliente ? clienteParaMostrar(linha.cliente, pode) : { nome: linha.nomeAnotado ?? null },
      entregueEm: linha.data ?? null,
      canal: linha.canal ? rotuloDoCanal(linha.canal) : null,
      pedido: linha.pedido?.numero ?? null,
      nomeDoPc: linha.nomeDoPc ?? null,
      equipamento: linha.equipamento ?? null,
    })),
    avisos: licenca.avisos,
  };
}

export async function listarLicencasDeSoftware({ programa, busca, soComVagaLivre = false, limite = 25 }, { pode }) {
  exigir(pode, "tela.ferramentas.licencas", "ver", "ver as licenças de software");
  const programas = await acharPrograma(programa);
  const resultado = [];
  let total = 0;
  for (const p of programas) {
    const lista = await listarLicencas({ softwareId: p.id, busca: busca ?? "", soComVagaLivre, porPagina: limite });
    total += lista.total;
    resultado.push(...lista.linhas.map((licenca) => licencaParaMostrar(licenca, pode, p.nome)));
  }
  return { total, licencas: resultado.slice(0, limite) };
}

async function acharLicenca(referencia, programa) {
  const programas = await acharPrograma(programa);
  const texto = String(referencia ?? "").trim();
  const achadas = await prisma.licenca.findMany({
    where: { softwareId: { in: programas.map((p) => p.id) }, identificador: { equals: texto, mode: "insensitive" } },
    select: { id: true, software: { select: { nome: true } } },
    take: 3,
  });
  if (!achadas.length) throw new ErroDeFerramenta(`Licença "${texto}" não encontrada. Procure com listarLicencasDeSoftware.`);
  if (achadas.length > 1) throw new ErroDeFerramenta(`A licença "${texto}" existe em mais de um programa (${achadas.map((a) => a.software.nome).join(", ")}): informe o programa.`);
  return { id: achadas[0].id, programa: achadas[0].software.nome };
}

export async function registrarLicencaDoCliente({ licenca, programa, cliente, data, canal, pedido, nomeDoPc, equipamento, observacoes, confirmo }, { pode }) {
  exigir(pode, "tela.ferramentas.licencas", "editar", "registrar licenças para clientes");
  const alvo = await acharLicenca(licenca, programa);
  const lida = await lerLicenca(alvo.id);
  if (lida.arquivada) throw new ErroDeFerramenta("Licença arquivada.");
  const escolhido = await acharCliente(cliente);
  if (!escolhido.documento) throw new ErroDeFerramenta(`O cliente ${escolhido.nome} precisa ter CPF ou CNPJ (editarCliente não muda documento: complete na tela de Cadastros).`);
  const pedidoId = pedido ? await acharPedido(pedido) : null;
  const dia = data ? lerDataIso(data) : null;
  if (data && !dia) throw new ErroDeFerramenta("Data inválida: use AAAA-MM-DD.");

  const resumo = {
    programa: alvo.programa,
    licenca: lida.identificador,
    vagasLivres: lida.vagas?.lida ? lida.vagas.livres : "não lida do portal",
    cliente: clienteParaMostrar(escolhido, pode),
    entregueEm: data ?? null,
    canal: canal ? rotuloDoCanal(canal) : null,
    pedido: pedido ?? null,
    nomeDoPc: nomeDoPc ?? null,
    equipamento: equipamento ?? null,
    ...(lida.vagas?.lida && lida.vagas.livres === 0 ? { aviso: "Esta licença não tem vaga livre no portal." } : {}),
  };
  if (!confirmo) return previa(resumo);
  exigirOk(await criarLinha(alvo.id, { clienteId: escolhido.id, data: dia, canal: canal ?? null, pedidoDeVendaId: pedidoId, nomeDoPc: nomeDoPc ?? null, equipamento: equipamento ?? null, observacoes: observacoes ?? null }));
  return { gravado: true, ...resumo };
}

export const FERRAMENTAS_DE_LICENCAS_LEITURA = [
  {
    nome: "listarLicencasDeSoftware",
    descricao:
      "As licenças de software que a loja revende (LightBurn, Mach3, ...) da tela Licenças Softwares: chave, tipo, situação no portal, vagas (permitidas, usadas, livres), último uso e os clientes de cada uma (entrega, canal, pedido, nome do PC). Filtra por programa, por texto (chave, cliente, PC) e pelas com vaga livre.",
    esquema: z.object({
      programa: TEXTO(60).optional().describe("Nome do programa (ex.: LightBurn); vazio = todos"),
      busca: TEXTO(120).optional(),
      soComVagaLivre: z.boolean().optional(),
      limite: z.number().int().min(1).max(100).optional(),
    }),
    anotacoes: LEITURA,
    executar: listarLicencasDeSoftware,
  },
];

export const FERRAMENTAS_DE_LICENCAS_ESCRITA = [
  {
    nome: "registrarLicencaDoCliente",
    descricao:
      "Registra que uma licença (pela chave) foi entregue a um cliente do Rise (precisa de CPF/CNPJ), com data, canal, pedido de venda, nome do PC e equipamento: o '+ Cliente' da tela Licenças Softwares. Dois passos: sem confirmo devolve a prévia com as vagas livres; com confirmo: true grava.",
    esquema: z.object({
      licenca: TEXTO(200).min(1).describe("A chave/identificação da licença"),
      programa: TEXTO(60).optional().describe("Só se a mesma chave existir em dois programas"),
      cliente: TEXTO(200).min(1).describe("CPF/CNPJ ou nome do cliente"),
      data: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("Dia da entrega, AAAA-MM-DD"),
      canal: z.enum(CANAIS).optional(),
      pedido: TEXTO(60).optional().describe("Número do pedido de venda do cliente"),
      nomeDoPc: TEXTO(120).optional().describe("O nome do PC, como aparece no portal"),
      equipamento: TEXTO(200).optional(),
      observacoes: TEXTO(2000).optional(),
      confirmo: CONFIRMO,
    }),
    anotacoes: ESCRITA,
    executar: registrarLicencaDoCliente,
  },
];
