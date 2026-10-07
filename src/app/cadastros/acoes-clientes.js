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
import { lerContatos, lerEmails, lerEndereco, lerTelefones } from "@/lib/formularios";
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
      z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Informe uma data válida."),
    ),

    sexo: opcional(z.enum(["MASCULINO", "FEMININO"], { message: "Escolha uma opção." })),
    naturalidade: opcional(z.string()),

    nomeFantasia: opcional(z.string()),
    regimeTributario: opcional(z.enum(REGIMES, { message: "Escolha uma opção." })),
    inscricaoEstadual: opcional(z.string()),
    inscricaoMunicipal: opcional(z.string()),

    // Telefones e e-mails vem em listas (`telefones`, `emails`), lidas a parte em
    // `lerLista`: o formulario manda um campo por linha, com o mesmo nome.
    observacoes: opcional(z.string()),
    transportadoraId: opcional(z.string()),
  })
  // Documento OBRIGATORIO (19/09/2026) e conferido pelo tipo escolhido: um CNPJ
  // digitado como pessoa fisica nao e CPF, e a mensagem diz qual dos dois estava
  // sendo esperado. A coluna continua aceitando nulo: a regra e do cadastro, e
  // cliente antigo sem documento nao deve quebrar a leitura.
  .superRefine((dados, contexto) => {
    const fisica = dados.tipoPessoa === "FISICA";
    if (!dados.documento) {
      contexto.addIssue({
        code: "custom",
        path: ["documento"],
        message: fisica ? "Informe o CPF." : "Informe o CNPJ.",
      });
      return;
    }
    if (fisica ? !validarCpf(dados.documento) : !validarCnpj(dados.documento)) {
      contexto.addIssue({
        code: "custom",
        path: ["documento"],
        message: fisica ? "CPF inválido." : "CNPJ inválido.",
      });
    }
  });

/**
 * Cria (`id` nulo) ou atualiza um cliente, com seus enderecos e contatos, numa
 * transacao so.
 *
 * O servidor ZERA o que nao pertence ao tipo escolhido: a tela mantem montados os
 * campos dos dois tipos (trocar Fisica por Juridica e voltar nao perde o que foi
 * digitado), entao o formulario chega com os dois conjuntos e so um vale. Isso
 * inclui as pessoas de contato, que so existem para pessoa juridica.
 */
export async function salvarCliente(id, _anterior, formData) {
  const campos = lerCampos(formData);

  const analise = ClienteSchema.safeParse(campos);
  const erros = analise.success ? {} : errosPorCampo(analise);

  const geral = lerEndereco(campos, "geral");
  const entrega = lerEndereco(campos, "entrega");
  const entregaIgualGeral = campos.entregaIgualGeral === "on";
  Object.assign(erros, geral.erros, entregaIgualGeral ? {} : entrega.erros);

  // O primeiro valor de cada lista e o principal e fica em `telefone`/`email`; os
  // demais vao para as listas. Assim quem le so o principal continua funcionando.
  // Telefone: grava so os digitos (ver `src/lib/telefone.js`).
  const { telefones, erro: erroTelefones } = lerTelefones(formData);
  if (erroTelefones) erros.telefones = erroTelefones;
  const { emails, erro: erroEmails } = lerEmails(formData);
  if (erroEmails) erros.emails = erroEmails;

  // So a pessoa juridica tem pessoas de contato: para fisica a lista nem e lida (ela
  // pode chegar com o que ficou montado e oculto na tela), e a que estava gravada e
  // apagada.
  let contatos = [];
  if (campos.tipoPessoa === "JURIDICA") {
    const lido = lerContatos(campos.contatos);
    contatos = lido.contatos;
    if (lido.erro) erros.contatos = lido.erro;
  }

  if (Object.keys(erros).length > 0) return { ok: false, erros };

  const dados = {
    ...analise.data,
    telefone: telefones[0] ?? null,
    telefonesAdicionais: telefones.slice(1),
    email: emails[0] ?? null,
    emailsAdicionais: emails.slice(1),
  };
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

  // As condicoes de pagamento preferidas SAIRAM da tela (21/09/2026), mas a relacao
  // continua no banco: nao mexer nela aqui. Gravar `set: []` apagaria em silencio o
  // que ja estivesse ligado ao cliente.
  try {
    const cliente = await prisma.$transaction(async (tx) => {
      const salvo = id
        ? await tx.cliente.update({ where: { id }, data: dados })
        : await tx.cliente.create({ data: dados });

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
        erros: { documento: `Já existe um cliente com este ${fisica ? "CPF" : "CNPJ"}.` },
      };
    }
    if (erro?.code === "P2003") {
      return { ok: false, erros: { transportadoraId: "Esta transportadora não existe mais." } };
    }
    if (erro?.code === "P2025") {
      return { ok: false, erro: "Este cliente não existe mais. Volte para a lista." };
    }
    return { ok: false, erro: erro?.message ?? "Não foi possível salvar." };
  }
}

/** Exclui o cliente; enderecos e contatos vao junto (`Cascade`). */
export async function excluirCliente(id) {
  try {
    await prisma.cliente.delete({ where: { id } });
  } catch (erro) {
    // Ja excluido por outra aba: o resultado que o operador queria.
    if (erro?.code !== "P2025") {
      return { ok: false, erro: erro?.message ?? "Não foi possível excluir." };
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
  if (digitos.length !== 8) return { ok: false, erro: "Informe um CEP com 8 dígitos." };

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
      resumo = "CEP não encontrado";
      return { ok: false, erro: "CEP não encontrado. Confira o número ou preencha à mão." };
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
    return { ok: false, erro: "Não foi possível consultar o CEP agora. Preencha à mão." };
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
