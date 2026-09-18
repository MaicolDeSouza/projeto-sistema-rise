"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/lib/db";
import {
  UFS,
  formatarCep,
  formatarCnpj,
  formatarCpf,
  validarCnpj,
  validarCpf,
} from "@/lib/documentos";
import { errosPorCampo, lerCampos, opcional } from "@/lib/validacao";

/**
 * Acoes do cadastro de Clientes.
 *
 * Este arquivo so exporta funcao assincrona: num modulo "use server", uma
 * constante exportada faz o Next recusar o modulo inteiro.
 *
 * Grava so no banco local. A unica chamada para fora e a consulta de CEP
 * (`buscarCep`), que manda so o CEP.
 */

const REGIMES = ["SIMPLES_NACIONAL", "SIMPLES_EXCESSO_SUBLIMITE", "REGIME_NORMAL"];

const ClienteSchema = z
  .object({
    nome: z.string().min(1, "Informe o nome."),
    tipoPessoa: z.enum(["FISICA", "JURIDICA"]).catch("FISICA"),
    documento: opcional(z.string()),
    clienteDesde: opcional(
      z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Informe uma data valida."),
    ),

    sexo: opcional(z.enum(["MASCULINO", "FEMININO"], { message: "Escolha uma opcao." })),
    naturalidade: opcional(z.string()),

    nomeFantasia: opcional(z.string()),
    regimeTributario: opcional(z.enum(REGIMES, { message: "Escolha uma opcao." })),
    inscricaoEstadual: opcional(z.string()),
    inscricaoMunicipal: opcional(z.string()),

    telefone: opcional(z.string()),
    email: opcional(z.string().email("Informe um e-mail valido.")),
    observacoes: opcional(z.string()),
    transportadoraId: opcional(z.string()),
  })
  // Documento conferido pelo tipo escolhido: um CNPJ digitado como pessoa fisica
  // nao e CPF, e a mensagem diz qual dos dois estava sendo esperado.
  .superRefine((dados, contexto) => {
    if (!dados.documento) return;
    const fisica = dados.tipoPessoa === "FISICA";
    if (fisica ? !validarCpf(dados.documento) : !validarCnpj(dados.documento)) {
      contexto.addIssue({
        code: "custom",
        path: ["documento"],
        message: fisica ? "CPF invalido." : "CNPJ invalido.",
      });
    }
  });

const ContatoSchema = z.object({
  nome: z.string().trim().min(1, "Todo contato precisa de nome."),
  cargo: opcional(z.string().trim()),
  telefone: opcional(z.string().trim()),
  email: opcional(z.string().trim().email("E-mail de contato invalido.")),
});

/**
 * Um dos dois enderecos, lido dos campos `<prefixo>_cep`, `_uf`... do formulario.
 * Devolve `dados` nulo quando o endereco esta em branco (nao se grava linha
 * vazia) e `erros` com a chave do campo ja prefixada, como a tela a usa.
 */
function lerEndereco(campos, prefixo) {
  const pegar = (nome) => campos[`${prefixo}_${nome}`] || null;
  const dados = {
    cep: pegar("cep"),
    uf: pegar("uf"),
    cidade: pegar("cidade"),
    bairro: pegar("bairro"),
    logradouro: pegar("logradouro"),
    numero: pegar("numero"),
    complemento: pegar("complemento"),
  };
  const erros = {};

  if (dados.cep) {
    if (dados.cep.replace(/\D/g, "").length !== 8) erros[`${prefixo}_cep`] = "O CEP tem 8 digitos.";
    else dados.cep = formatarCep(dados.cep);
  }
  if (dados.uf && !UFS.includes(dados.uf)) erros[`${prefixo}_uf`] = "Escolha um estado da lista.";

  const vazio = Object.values(dados).every((valor) => valor === null);
  return { dados: vazio ? null : dados, erros };
}

/**
 * Cria (`id` nulo) ou atualiza um cliente, com seus enderecos, contatos e
 * condicoes preferidas, numa transacao so.
 *
 * O servidor ZERA o que nao pertence ao tipo escolhido: a tela mantem montados os
 * campos dos dois tipos (trocar Fisica por Juridica e voltar nao perde o que foi
 * digitado), entao o formulario chega com os dois conjuntos e so um vale.
 */
export async function salvarCliente(id, _anterior, formData) {
  const campos = lerCampos(formData);

  const analise = ClienteSchema.safeParse(campos);
  const erros = analise.success ? {} : errosPorCampo(analise);

  const geral = lerEndereco(campos, "geral");
  const entrega = lerEndereco(campos, "entrega");
  const entregaIgualGeral = campos.entregaIgualGeral === "on";
  Object.assign(erros, geral.erros, entregaIgualGeral ? {} : entrega.erros);

  // A lista de contatos e montada na tela e vem como JSON num campo oculto.
  let contatos = [];
  try {
    const bruto = JSON.parse(campos.contatos || "[]");
    if (!Array.isArray(bruto) || bruto.length > 50) throw new Error("lista invalida");
    const lido = z.array(ContatoSchema).safeParse(bruto);
    if (lido.success) contatos = lido.data;
    else erros.contatos = lido.error.issues[0].message;
  } catch {
    erros.contatos = "A lista de contatos veio invalida. Recarregue a pagina.";
  }

  if (Object.keys(erros).length > 0) return { ok: false, erros };

  const dados = { ...analise.data };
  const fisica = dados.tipoPessoa === "FISICA";

  if (dados.documento) {
    dados.documento = fisica ? formatarCpf(dados.documento) : formatarCnpj(dados.documento);
  }

  // Campos de um tipo nao ficam gravados no outro.
  if (fisica) {
    Object.assign(dados, {
      nomeFantasia: null,
      regimeTributario: null,
      inscricaoEstadual: null,
      inscricaoMunicipal: null,
      ieIsento: false,
    });
  } else {
    Object.assign(dados, { sexo: null, naturalidade: null, ieIsento: campos.ieIsento === "on" });
    // IE isento e o oposto de ter inscricao: os dois juntos se contradizem.
    if (dados.ieIsento) dados.inscricaoEstadual = null;
  }
  dados.ativo = campos.ativo === "on";

  // Data de "cliente desde": vazia no cadastro novo vale hoje (padrao do banco);
  // vazia na edicao mantem a que ja estava.
  if (dados.clienteDesde) dados.clienteDesde = new Date(`${dados.clienteDesde}T00:00:00.000Z`);
  else delete dados.clienteDesde;

  // Ids vindos do navegador: so entra condicao que existe.
  const idsCondicoes = [...new Set(formData.getAll("condicoes").map(String))];
  const condicoes = idsCondicoes.length
    ? await prisma.condicaoPagamento.findMany({
        where: { id: { in: idsCondicoes } },
        select: { id: true },
      })
    : [];
  const preferidas = condicoes.map((condicao) => ({ id: condicao.id }));

  try {
    const cliente = await prisma.$transaction(async (tx) => {
      const salvo = id
        ? await tx.cliente.update({
            where: { id },
            data: { ...dados, condicoesPreferidas: { set: preferidas } },
          })
        : await tx.cliente.create({
            data: { ...dados, condicoesPreferidas: { connect: preferidas } },
          });

      // Geral: grava, atualiza ou apaga se ficou em branco.
      // Entrega: "mesmo endereco do Geral" NAO grava nada — uma copia ficaria velha
      // quando o Geral mudasse.
      const gravar = (tipo, endereco) =>
        endereco
          ? tx.clienteEndereco.upsert({
              where: { clienteId_tipo: { clienteId: salvo.id, tipo } },
              create: { clienteId: salvo.id, tipo, ...endereco },
              update: endereco,
            })
          : tx.clienteEndereco.deleteMany({ where: { clienteId: salvo.id, tipo } });

      await gravar("GERAL", geral.dados);
      await gravar("ENTREGA", entregaIgualGeral ? null : entrega.dados);

      // Contatos: a tela manda a lista inteira, e a lista gravada passa a ser
      // exatamente essa.
      await tx.clienteContato.deleteMany({ where: { clienteId: salvo.id } });
      if (contatos.length > 0) {
        await tx.clienteContato.createMany({
          data: contatos.map((contato) => ({ ...contato, clienteId: salvo.id })),
        });
      }

      return salvo;
    });

    revalidatePath("/cadastros", "layout");
    return { ok: true, id: cliente.id };
  } catch (erro) {
    if (erro?.code === "P2002") {
      return {
        ok: false,
        erros: { documento: `Ja existe um cliente com este ${fisica ? "CPF" : "CNPJ"}.` },
      };
    }
    if (erro?.code === "P2003") {
      return { ok: false, erros: { transportadoraId: "Esta transportadora nao existe mais." } };
    }
    if (erro?.code === "P2025") {
      return { ok: false, erro: "Este cliente nao existe mais. Volte para a lista." };
    }
    return { ok: false, erro: erro?.message ?? "Nao foi possivel salvar." };
  }
}

/** Exclui o cliente; enderecos e contatos vao junto (`Cascade`). */
export async function excluirCliente(id) {
  try {
    await prisma.cliente.delete({ where: { id } });
  } catch (erro) {
    // Ja excluido por outra aba: o resultado que o operador queria.
    if (erro?.code !== "P2025") {
      return { ok: false, erro: erro?.message ?? "Nao foi possivel excluir." };
    }
  }

  revalidatePath("/cadastros", "layout");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// CEP
// ---------------------------------------------------------------------------

/**
 * Preenche o endereco a partir do CEP, pela consulta publica do ViaCEP (pedido do
 * dono em 18/09/2026).
 *
 * **So o CEP sai daqui** — nenhum outro dado do cliente. O valor vem do navegador,
 * entao e reduzido a 8 digitos ANTES de entrar na URL: sem isso, um texto qualquer
 * escolheria o caminho da requisicao. O endereco base e fixo.
 *
 * Toda chamada externa e auditada em `LogIntegracao`. O CEP em si NAO vai no log
 * (o endpoint registrado e o modelo `/ws/{cep}/json/`): e dado de onde alguem mora.
 * Falha nunca trava o cadastro — devolve o recado e o operador digita a mao.
 */
export async function buscarCep(cep) {
  const digitos = String(cep ?? "").replace(/\D/g, "");
  if (digitos.length !== 8) return { ok: false, erro: "Informe um CEP com 8 digitos." };

  const inicio = Date.now();
  let statusHttp = null;
  let resumo = null;
  let falha = null;

  try {
    const resposta = await fetch(`https://viacep.com.br/ws/${digitos}/json/`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });
    statusHttp = resposta.status;
    if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`);

    const corpo = await resposta.json();

    // O ViaCEP responde 200 com {"erro": true} quando o CEP tem formato certo e
    // nao existe.
    if (corpo?.erro) {
      resumo = "CEP nao encontrado";
      return { ok: false, erro: "CEP nao encontrado. Confira o numero ou preencha a mao." };
    }

    resumo = "CEP encontrado";
    return {
      ok: true,
      endereco: {
        cep: formatarCep(digitos),
        uf: UFS.includes(corpo.uf) ? corpo.uf : "",
        cidade: corpo.localidade ?? "",
        bairro: corpo.bairro ?? "",
        logradouro: corpo.logradouro ?? "",
      },
    };
  } catch (erro) {
    falha = erro?.message ?? "erro desconhecido";
    return { ok: false, erro: "Nao foi possivel consultar o CEP agora. Preencha a mao." };
  } finally {
    // Auditoria nao pode derrubar a consulta: se o log falhar, segue.
    await prisma.logIntegracao
      .create({
        data: {
          servico: "VIACEP",
          metodo: "GET",
          endpoint: "/ws/{cep}/json/",
          statusHttp,
          duracaoMs: Date.now() - inicio,
          responseResumo: resumo,
          erro: falha,
        },
      })
      .catch(() => {});
  }
}
