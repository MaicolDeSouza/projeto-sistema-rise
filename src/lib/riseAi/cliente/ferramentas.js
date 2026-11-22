import { z } from "zod";

import { normalizar } from "@/lib/texto";

/**
 * As ferramentas do CLIENTE (o chat da loja): o unico caminho do modelo ate os dados, e todos so de LEITURA sobre as
 * visoes publicas (`dados.js`). Nenhuma tem efeito: o pior que uma IA enganada consegue e um texto errado, e o texto
 * ainda passa pelo filtro de saida.
 *
 * Lista propria, separada das ferramentas do Rise AI da equipe (`../ferramentas`): aqui nao existe perfil a esquecer,
 * e o teste confere que `consultarEstoque` e companhia nem chegam ao modelo.
 *
 * O que o modelo recebe de cada produto: `sku, nome, marca, modelo, preco, disponibilidade, link`. A foto e o id da loja
 * vao so para o cartao que o servidor monta, nunca para o modelo.
 *
 * `contexto = { dados, vistos, saida }`: `vistos` guarda os produtos que as buscas DESTA resposta trouxeram (so eles podem
 * virar cartao); `saida` recebe os cartoes, a lista orcada, a passagem para o atendimento e os `valores` que o
 * `calcularTotal` calculou (os unicos valores, alem dos precos, que o texto pode afirmar).
 */

export const MAXIMO_DE_CARTOES = 8;
export const MAXIMO_DA_LISTA = 50;
export const MAXIMO_DA_CONTA = 20;
// `suporte_tecnico` vai para o WhatsApp tecnico da empresa (pedido do dono em 22/11/2026); os demais, para o comercial.
export const MOTIVOS_DA_PASSAGEM = ["pediu_pessoa", "pagamento", "pedido", "troca_ou_garantia", "reclamacao", "nao_encontrei", "suporte_tecnico", "outro"];

const sku = z.string().trim().min(1).max(64).describe("Código (sku) do produto, como veio de uma busca");

const paraOModelo = (produto) => ({
  sku: produto.sku,
  nome: produto.nome,
  marca: produto.marca,
  modelo: produto.modelo,
  preco: produto.preco,
  disponibilidade: produto.faixa,
  link: produto.link,
});

function lembrar(contexto, produtos) {
  for (const produto of produtos) if (produto?.sku) contexto.vistos.set(produto.sku, produto);
}

const centavos = (valor) => Math.round(Number(valor) * 100);

class ErroDeFerramentaDoCliente extends Error {}

export const FERRAMENTAS_DO_CLIENTE = [
  {
    nome: "buscarProdutos",
    descricao:
      "Procura produtos da loja por palavras-chave ou código. Use 2 a 4 palavras (ex.: 'arduino uno', 'resistor 220'). " +
      "Se não achar nada, tente de novo com MENOS palavras ou outro nome. Devolve até 10 produtos com preço, " +
      "disponibilidade e link. Lista vazia = a loja não tem.",
    esquema: z.object({
      termos: z.string().trim().min(1).max(200).describe("Palavras-chave do produto ou o código"),
      apenasDisponiveis: z.boolean().optional().describe("Só produtos disponíveis para compra"),
      precoMaximo: z.coerce.number().positive().optional().describe("Preço máximo, em reais"),
      limite: z.coerce.number().int().min(1).max(10).optional().describe("Quantos produtos devolver (1 a 10)"),
    }),
    async executar({ termos, apenasDisponiveis, precoMaximo, limite }, contexto) {
      const produtos = await contexto.dados.buscarProdutos(termos, { apenasComEstoque: apenasDisponiveis, precoMaximo, limite });
      lembrar(contexto, produtos);
      return produtos.map(paraOModelo);
    },
  },
  {
    nome: "consultarProduto",
    descricao: "Ficha de UM produto da loja pelo código: descrição, características técnicas e, se for kit, as peças. Use para conferir um detalhe antes de afirmar.",
    esquema: z.object({ sku }),
    async executar({ sku: codigo }, contexto) {
      const ficha = await contexto.dados.fichaDoProduto(codigo);
      if (!ficha) throw new ErroDeFerramentaDoCliente(`A loja não tem produto com o código ${codigo}.`);
      lembrar(contexto, [ficha]);
      return { ...paraOModelo(ficha), descricao: ficha.descricao, caracteristicas: ficha.ficha, kit: ficha.kit };
    },
  },
  {
    nome: "compararProdutos",
    descricao: "Compara de 2 a 5 produtos lado a lado pelas características técnicas. Característica que um produto não informa vem como null: não invente o valor.",
    esquema: z.object({ skus: z.array(sku).min(2).max(5) }),
    async executar({ skus }, contexto) {
      const fichas = [];
      for (const codigo of skus) {
        const ficha = await contexto.dados.fichaDoProduto(codigo);
        if (!ficha) throw new ErroDeFerramentaDoCliente(`A loja não tem produto com o código ${codigo}.`);
        fichas.push(ficha);
      }
      lembrar(contexto, fichas);
      // O nome da característica é a chave (sem caixa nem acento); vale a grafia em que apareceu primeiro.
      const caracteristicas = new Map();
      for (const ficha of fichas) {
        for (const { nome, valor } of ficha.ficha) {
          const chave = normalizar(nome);
          if (!caracteristicas.has(chave)) caracteristicas.set(chave, { nome, valores: Object.fromEntries(fichas.map((outra) => [outra.sku, null])) });
          const linha = caracteristicas.get(chave);
          if (linha.valores[ficha.sku] === null) linha.valores[ficha.sku] = valor;
        }
      }
      return { produtos: fichas.map(paraOModelo), caracteristicas: [...caracteristicas.values()] };
    },
  },
  {
    nome: "buscarSimilares",
    descricao: "Produtos parecidos com um (o substituto quando o pedido está em falta, ou a opção mais barata). Devolve até 5.",
    esquema: z.object({ sku, limite: z.coerce.number().int().min(1).max(5).optional() }),
    async executar({ sku: codigo, limite }, contexto) {
      const produtos = await contexto.dados.similares(codigo, { limite });
      lembrar(contexto, produtos);
      return produtos.map(paraOModelo);
    },
  },
  {
    nome: "orcarLista",
    descricao:
      "Orça uma lista de peças: para cada item (termos e quantidade) acha o produto da loja, o subtotal e as alternativas. " +
      "Use quando o visitante colar uma lista. Até 50 itens. A lista orçada aparece para o visitante numa tabela; no texto, só resuma.",
    esquema: z.object({
      itens: z
        .array(z.object({ termos: z.string().trim().min(1).max(200), quantidade: z.coerce.number().int().min(1).max(9999).optional() }))
        .min(1)
        .max(MAXIMO_DA_LISTA),
    }),
    async executar({ itens }, contexto) {
      const linhas = [];
      let total = 0;
      for (const item of itens) {
        const quantidade = item.quantidade ?? 1;
        const achados = await contexto.dados.buscarProdutos(item.termos, { limite: 3 });
        lembrar(contexto, achados);
        const [achado = null, ...alternativas] = achados;
        const subtotal = achado && achado.preco !== null ? (centavos(achado.preco) * quantidade) / 100 : null;
        if (subtotal !== null) total += centavos(subtotal);
        linhas.push({ pedido: item.termos, quantidade, achado, subtotal, alternativas });
      }
      contexto.saida.lista = { linhas, total: total / 100 };
      return {
        linhas: linhas.map((linha) => ({
          pedido: linha.pedido,
          quantidade: linha.quantidade,
          achado: linha.achado ? paraOModelo(linha.achado) : null,
          subtotal: linha.subtotal,
          alternativas: linha.alternativas.map(paraOModelo),
        })),
        total: total / 100,
      };
    },
  },
  {
    nome: "calcularTotal",
    descricao:
      "Faz a conta de produtos que você já buscou: o valor de várias unidades de cada um e o total. Use SEMPRE que for dizer " +
      "no texto um valor que não é o preço de UMA unidade (ex.: '2 placas saem por...', 'o total fica...'). " +
      "Só aceita códigos que vieram de uma busca desta resposta. Nunca faça essa conta de cabeça.",
    esquema: z.object({
      itens: z.array(z.object({ sku, quantidade: z.coerce.number().int().min(1).max(9999) })).min(1).max(MAXIMO_DA_CONTA),
    }),
    async executar({ itens }, contexto) {
      const desconhecidos = itens.map((item) => item.sku).filter((codigo) => !contexto.vistos.has(codigo));
      if (desconhecidos.length) throw new ErroDeFerramentaDoCliente(`Busque antes de calcular: ${desconhecidos.join(", ")} não veio de uma busca desta resposta.`);
      const linhas = [];
      const semPreco = [];
      let total = 0;
      for (const item of itens) {
        const produto = contexto.vistos.get(item.sku);
        if (produto.preco === null) {
          semPreco.push(produto.sku);
          continue;
        }
        const subtotal = centavos(produto.preco) * item.quantidade;
        total += subtotal;
        linhas.push({ sku: produto.sku, nome: produto.nome, quantidade: item.quantidade, preco: produto.preco, subtotal: subtotal / 100 });
      }
      // Nenhum item com preco: nao ha total a afirmar (um "R$ 0,00" liberado seria um valor inventado).
      if (linhas.length === 0) return { linhas, total: null, semPreco };
      // So estes valores (alem dos precos das buscas) o filtro de saida deixa o texto afirmar.
      contexto.saida.valores = [...(contexto.saida.valores ?? []), ...linhas.map((linha) => linha.subtotal), total / 100];
      return { linhas, total: total / 100, ...(semPreco.length ? { semPreco } : {}) };
    },
  },
  {
    nome: "mostrarProdutos",
    descricao:
      "Mostra ao visitante os cartões dos produtos (foto, preço, disponibilidade e botão de comprar), na ordem dada. " +
      "Só aceita códigos que vieram de uma busca desta resposta. `papel` é a função da peça no projeto (ex.: 'placa', 'resistor').",
    esquema: z.object({
      itens: z.array(z.object({ sku, papel: z.string().trim().max(40).optional() })).min(1).max(MAXIMO_DE_CARTOES),
    }),
    async executar({ itens }, contexto) {
      // So o que veio de uma busca desta resposta; e o cartao e lido de novo do banco AGORA (produto que saiu da loja some).
      const pedidos = itens.filter((item) => contexto.vistos.has(item.sku));
      const atuais = await contexto.dados.produtosPorSku(pedidos.map((item) => item.sku));
      const cartoes = [];
      pedidos.forEach((item, indice) => {
        const produto = atuais[indice];
        if (produto && !cartoes.some((cartao) => cartao.sku === produto.sku)) cartoes.push({ ...produto, papel: item.papel || null });
      });
      contexto.saida.cartoes = cartoes;
      const mostrados = cartoes.map((cartao) => cartao.sku);
      return { mostrados, ignorados: itens.map((item) => item.sku).filter((codigo) => !mostrados.includes(codigo)) };
    },
  },
  {
    nome: "passarParaAtendente",
    descricao:
      "Passa a conversa para a equipe da loja pelo WhatsApp. Use quando o visitante pede uma pessoa, ou o assunto é pagamento, " +
      "pedido já feito, troca, garantia ou reclamação, ou quando você não achou o que ele precisa. Use o motivo suporte_tecnico " +
      "quando ele precisa de suporte técnico que você não resolve (produto com defeito, não funciona, ligação, código, instalação): " +
      "esse vai para o WhatsApp do suporte técnico; os outros, para o comercial.",
    esquema: z.object({ motivo: z.enum(MOTIVOS_DA_PASSAGEM) }),
    async executar({ motivo }, contexto) {
      contexto.saida.passagem = { motivo };
      return { ok: true };
    },
  },
];

/** O schema vai ao provedor sem o `$schema` que o zod acrescenta (alguns provedores o recusam). */
function parametrosDe(esquema) {
  const { $schema, ...resto } = z.toJSONSchema(esquema, { io: "input" });
  void $schema;
  return resto;
}

/** @returns {{ nome: string, descricao: string, parametros: object }[]} */
export function definicoesDoCliente() {
  return FERRAMENTAS_DO_CLIENTE.map((ferramenta) => ({ nome: ferramenta.nome, descricao: ferramenta.descricao, parametros: parametrosDe(ferramenta.esquema) }));
}

/**
 * Nunca lança: o resultado (ou o erro) volta ao modelo. Falha interna (banco) vira um aviso genérico; a mensagem de banco
 * fica no log do serviço, não vai ao modelo.
 *
 * @returns {Promise<{ ok: true, resultado: any, duracaoMs: number } | { ok: false, erro: string, duracaoMs: number }>}
 */
export async function executarFerramentaDoCliente(nome, argumentosBrutos, contexto) {
  const inicio = Date.now();
  const falha = (erro) => ({ ok: false, erro, duracaoMs: Date.now() - inicio });
  const ferramenta = FERRAMENTAS_DO_CLIENTE.find((candidata) => candidata.nome === nome);
  if (!ferramenta) return falha(`Ferramenta desconhecida: ${nome}.`);
  const validacao = ferramenta.esquema.safeParse(argumentosBrutos ?? {});
  if (!validacao.success) {
    const problemas = validacao.error.issues.map((problema) => `${problema.path.join(".") || "argumentos"}: ${problema.message}`);
    return falha(`Argumentos inválidos — ${problemas.join("; ")}`);
  }
  try {
    return { ok: true, resultado: await ferramenta.executar(validacao.data, contexto), duracaoMs: Date.now() - inicio };
  } catch (erro) {
    if (erro instanceof ErroDeFerramentaDoCliente) return falha(erro.message);
    console.error(`[ia] falha na ferramenta ${nome}:`, erro?.message ?? erro);
    return falha("Não foi possível consultar agora. Tente de novo em instantes.");
  }
}
