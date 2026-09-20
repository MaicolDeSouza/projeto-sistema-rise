"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { lerContatos, lerEmails, lerEndereco, lerTelefones } from "@/lib/formularios";
import { cnpjOpcional, ehUrlSegura, errosPorCampo, lerCampos, opcional } from "@/lib/validacao";

/**
 * Acao de salvar da transportadora. Fornecedor e concorrente seguem em `acoes.js`;
 * a transportadora ganhou formulario em abas (Dados cadastrais, Endereco, Contato)
 * e por isso tem a sua, no molde de `acoes-clientes.js`.
 *
 * Este arquivo so exporta funcao assincrona: num modulo "use server", uma constante
 * exportada faz o Next recusar o modulo inteiro.
 *
 * Grava so no banco local.
 */

const MODALIDADES = ["CORREIOS", "RODOVIARIA", "ENTREGA_LOCAL", "OUTRA"];

const enderecoWeb = (mensagem) => opcional(z.string().refine(ehUrlSegura, mensagem));

const TransportadoraSchema = z.object({
  nome: z.string().min(1, "Informe o nome."),
  nomeFantasia: opcional(z.string()),
  // CNPJ opcional, mas conferido quando vem: ha quem entregue sem CNPJ (motoboy
  // autonomo). Decidido com o dono em 19/09/2026.
  cnpj: cnpjOpcional(),
  inscricaoEstadual: opcional(z.string()),
  modalidade: opcional(z.enum(MODALIDADES, { message: "Escolha uma opcao." })),
  urlRastreamento: enderecoWeb("Informe um endereco http ou https."),
  site: enderecoWeb("Informe um endereco http ou https."),
  observacoes: opcional(z.string()),
});

/**
 * Cria (`id` nulo) ou atualiza uma transportadora, com endereco, telefones,
 * e-mails e pessoas de contato, numa transacao so.
 *
 * O primeiro telefone e e-mail ficam em `telefone`/`email` e os demais nas listas,
 * como no cliente. IE isenta e o oposto de ter inscricao: as duas juntas se
 * contradizem, entao a inscricao e apagada.
 */
export async function salvarTransportadora(id, _anterior, formData) {
  const campos = lerCampos(formData);

  const analise = TransportadoraSchema.safeParse(campos);
  const erros = analise.success ? {} : errosPorCampo(analise);

  const endereco = lerEndereco(campos, "endereco");
  Object.assign(erros, endereco.erros);

  const { telefones, erro: erroTelefones } = lerTelefones(formData);
  if (erroTelefones) erros.telefones = erroTelefones;
  const { emails, erro: erroEmails } = lerEmails(formData);
  if (erroEmails) erros.emails = erroEmails;
  const lido = lerContatos(campos.contatos);
  if (lido.erro) erros.contatos = lido.erro;

  if (Object.keys(erros).length > 0) return { ok: false, erros };

  const ieIsento = campos.ieIsento === "on";
  const dados = {
    ...analise.data,
    ieIsento,
    inscricaoEstadual: ieIsento ? null : analise.data.inscricaoEstadual,
    // Endereco em branco grava tudo nulo, em vez de deixar o que estava.
    cep: endereco.dados?.cep ?? null,
    uf: endereco.dados?.uf ?? null,
    cidade: endereco.dados?.cidade ?? null,
    bairro: endereco.dados?.bairro ?? null,
    logradouro: endereco.dados?.logradouro ?? null,
    numero: endereco.dados?.numero ?? null,
    complemento: endereco.dados?.complemento ?? null,
    telefone: telefones[0] ?? null,
    telefonesAdicionais: telefones.slice(1),
    email: emails[0] ?? null,
    emailsAdicionais: emails.slice(1),
    ativo: campos.ativo === "on",
  };

  try {
    const salva = await prisma.$transaction(async (tx) => {
      const transportadora = id
        ? await tx.transportadora.update({ where: { id }, data: dados })
        : await tx.transportadora.create({ data: dados });

      // A tela manda a lista inteira: a lista gravada passa a ser exatamente essa.
      await tx.transportadoraContato.deleteMany({ where: { transportadoraId: transportadora.id } });
      if (lido.contatos.length > 0) {
        await tx.transportadoraContato.createMany({
          data: lido.contatos.map((contato) => ({ ...contato, transportadoraId: transportadora.id })),
        });
      }

      return transportadora;
    });

    revalidatePath("/cadastros", "layout");
    return { ok: true, id: salva.id };
  } catch (erro) {
    if (erro?.code === "P2002") {
      return { ok: false, erros: { nome: "Ja existe uma transportadora com este nome." } };
    }
    if (erro?.code === "P2025") {
      return { ok: false, erro: "Esta transportadora nao existe mais. Volte para a lista." };
    }
    return { ok: false, erro: erro?.message ?? "Nao foi possivel salvar." };
  }
}
