/**
 * Cadastros (fornecedores e concorrentes) a partir das fontes do Mercados.
 *
 * Pedido do dono em 18/09/2026: coletar uma fonte nova em Mercados ja a coloca
 * em Cadastros, sem digitar o nome duas vezes. Sem import de React nem de Next,
 * para o script de carga poder usar.
 */

/**
 * Os cadastros de EMPRESA (fornecedor, concorrente, transportadora), indexados
 * pelo trecho da URL (`/cadastros/fornecedores/...`). Uma tabela so descreve os
 * tres, porque tela, formulario e acoes sao os mesmos e diferem so nestes dados.
 *
 * `tiposDeFonte`: quais fontes de Mercados podem ser ligadas. `OUTRO` cai com os
 * concorrentes, como na tela de Fontes (a rotina dele e a mesma: varrer o site).
 * Lista vazia = o cadastro nao tem site varrido (transportadora), e a tela nem
 * oferece o campo.
 *
 * `usos`: como se chama a coluna de numero da lista. Do fornecedor e "Produtos":
 * quantos produtos DELE o sistema tem coletados em Mercados (site ou lista), que
 * e o que o dono quer ver ali (pedido de 04/10/2026; antes contava so os vinculos
 * com produtos cadastrados na Rise). Da transportadora e "Clientes": quantos a tem
 * como preferida, e esse e o numero que impede a exclusao. Quem impede a exclusao
 * do fornecedor e `recadoDeUso`, que conta os vinculos por conta propria.
 * Concorrente nao tem coluna de numero.
 *
 * `cnpj`: a lista mostra a coluna CNPJ (so o fornecedor, por enquanto).
 *
 * `artigo` e `novo` existem por causa do genero: "Ja existe uma transportadora",
 * "Nova transportadora".
 */
export const PARCEIROS = {
  fornecedores: {
    slug: "fornecedores",
    modelo: "fornecedor",
    singular: "fornecedor",
    plural: "Fornecedores",
    artigo: "um",
    novo: "Novo",
    tiposDeFonte: ["FORNECEDOR"],
    usos: "Produtos",
    cnpj: true,
  },
  concorrentes: {
    slug: "concorrentes",
    modelo: "concorrente",
    singular: "concorrente",
    plural: "Concorrentes",
    artigo: "um",
    novo: "Novo",
    tiposDeFonte: ["CONCORRENTE", "OUTRO"],
    usos: null,
    cnpj: false,
  },
  transportadoras: {
    slug: "transportadoras",
    modelo: "transportadora",
    singular: "transportadora",
    plural: "Transportadoras",
    artigo: "uma",
    novo: "Nova",
    tiposDeFonte: [],
    usos: "Clientes",
    cnpj: false,
  },
};

/** Modelo do Prisma certo para o tipo da fonte; `OUTRO` nao tem cadastro. */
function modeloDoTipo(cliente, tipo) {
  if (tipo === "FORNECEDOR") return cliente.fornecedor;
  if (tipo === "CONCORRENTE") return cliente.concorrente;
  return null;
}

/**
 * Garante que a fonte tenha o cadastro da empresa e o liga a ela.
 *
 * `cliente` e o `prisma` ou o `tx` de uma transacao — `salvarFonte` chama de
 * dentro de uma, para a fonte e o cadastro nascerem juntos ou nenhum dos dois.
 *
 * **Nome que ja existe so LIGA, nunca sobrescreve.** O fornecedor pode ter
 * nascido antes, digitado no cadastro de um produto (a lupa do Nome usa o nome
 * da fonte), ou o operador pode ja ter preenchido contato e prazo. Recriar
 * falharia no nome unico; atualizar apagaria o que ele escreveu. Cadastro que ja
 * esta ligado a OUTRA fonte tambem fica como esta: duas lojas com o mesmo nome
 * sao um caso para o operador decidir, nao para este codigo adivinhar.
 *
 * Renomear ou excluir a fonte depois NAO mexe no cadastro (`fonteId` e SetNull):
 * ele guarda contato e negociacao, que nao somem com um site.
 */
export async function garantirCadastroDaFonte(cliente, fonte) {
  const modelo = modeloDoTipo(cliente, fonte.tipo);
  if (!modelo) return null;

  const site = `https://${fonte.dominio}`;
  const existente = await modelo.findUnique({ where: { nome: fonte.nome } });

  if (!existente) {
    return modelo.create({ data: { nome: fonte.nome, site, fonteId: fonte.id } });
  }

  if (existente.fonteId) return existente;

  return modelo.update({
    where: { id: existente.id },
    data: { fonteId: fonte.id, site: existente.site ?? site },
  });
}
