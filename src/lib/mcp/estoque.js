import { z } from "zod";

import { prisma } from "@/lib/db";
import { criarColunasPelaLocalizacao, excluirColuna, excluirModelo, lerMapa, salvarCaixinhaDoProduto, salvarColuna, salvarLocal, salvarModelo } from "@/lib/estoque3d/banco";
import { conferirOrdemDasFotos } from "@/lib/estoque3d/fotos";
import { lerParaMover, moverProduto, sugerirLugarParaProduto } from "@/lib/estoque3d/mover";
import { ErroDeFerramenta } from "@/lib/riseAi/ferramentas/erro";

/**
 * O Mapa do estoque pelo chat (spec 2026-11-15-mcp-do-estoque-design.md, pedido do dono: a Andrea "ajustar o estoque 3d,
 * mandar fotos para ajustar em que posicao cada caixinha esta"). Quem le a foto e o Claude da pessoa; aqui so entram os
 * codigos lidos. Tudo chama o MESMO `lib/estoque3d` da tela `/estoque/mapa`, com os mesmos acessos das acoes dela.
 */

const LEITURA = { readOnlyHint: true, destructiveHint: false, openWorldHint: false };
const ESCRITA = { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const EXCLUSAO = { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false };

const MAPA = "tela.estoque.mapa";
const LOCALIZACAO = "dado.localizacao";

/** Confere os pares [recurso, nivel] e recusa dizendo o que falta. */
function exigir(contexto, ...pares) {
  for (const [recurso, nivel] of pares) {
    if (!contexto.pode(recurso, nivel)) {
      const nome = recurso === MAPA ? "o Mapa do estoque" : "a Localização dos produtos";
      throw new ErroDeFerramenta(`Este login não pode ${nivel === "editar" ? "alterar" : "ver"} ${nome}.`);
    }
  }
}
const exigirLeitura = (contexto) => exigir(contexto, [MAPA, "ver"], [LOCALIZACAO, "ver"]);
const exigirArrumacao = (contexto) => exigir(contexto, [MAPA, "editar"], [LOCALIZACAO, "editar"]);
const exigirCadastro = (contexto) => exigir(contexto, [MAPA, "editar"]);

/** O `{ ok: false, erro }` do lib vira erro da ferramenta (a pessoa le a mensagem). */
function semErro(resultado) {
  if (!resultado?.ok) throw new ErroDeFerramenta(resultado?.erro ?? "Não foi possível concluir.");
  return resultado;
}

async function produtoPeloCodigo(sku) {
  const produto = await prisma.produto.findFirst({ where: { sku: { equals: sku, mode: "insensitive" } }, select: { id: true, sku: true, tituloBase: true, ativo: true } });
  if (!produto) throw new ErroDeFerramenta(`Não há produto com o código ${sku}.`);
  return produto;
}

async function localPeloNumero(numero) {
  const local = await prisma.localDeEstoque.findUnique({ where: { numero } });
  if (!local) throw new ErroDeFerramenta(`O Estoque ${numero} não está cadastrado.`);
  return local;
}

async function modeloPeloNome(nome) {
  const modelo = await prisma.modeloDeCaixinha.findFirst({ where: { nome: { equals: nome, mode: "insensitive" } } });
  if (!modelo) throw new ErroDeFerramenta(`Não há modelo de caixinha "${nome}". Veja os modelos em lerMapaDoEstoque.`);
  return modelo;
}

const numeroDe = (valor) => (valor === null || valor === undefined ? null : Number(valor));

const codigo = z.string().trim().min(1).max(60);
const letra = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{1,2}$/, "A coluna é uma ou duas letras.");
const numeroDoEstoque = z.coerce.number().int().min(1).max(99).describe("O número do estoque: 1 = container inferior, 2 = porão, 3 = container superior");
const medida = z.number().positive().max(100000).nullable().optional();

// --- a leitura, enxuta para o chat (sem foto, sem as coordenadas do desenho) ---

const caixinhaParaChat = (caixinha) => ({
  posicao: caixinha.posicao,
  sku: caixinha.sku,
  nome: caixinha.nome,
  estoque: caixinha.estoque,
  modelo: caixinha.modelo,
  cabe: caixinha.capacidade,
  ...(caixinha.avisos.length ? { avisos: caixinha.avisos } : {}),
});

const colunaParaChat = (coluna) => ({
  letra: coluna.letra,
  prateleiras: coluna.prateleiras.length,
  medidas: coluna.medida ? { larguraCm: coluna.larguraCm, profundidadeCm: coluna.profundidadeCm, alturaLivreCm: coluna.alturaLivreCm, pesoMaximoKg: coluna.pesoMaximoKg } : null,
  caixinhas: coluna.caixinhas,
});

export const ROTEIRO_DO_ESTOQUE = [
  "Mapa do estoque da 4hobby: 3 estoques (1 = container inferior, 2 = porão, 3 = container superior). Cada estoque tem colunas (letra única no sistema: A, B... ZZ) com prateleiras numeradas; o lugar do produto é a Localização do cadastro, letra + prateleira (\"M2\" = coluna M, prateleira 2). Na prateleira, as caixinhas têm posição da esquerda para a direita (1ª, 2ª...).",
  "Os Estoques 2 e 3 seguem as regras (pesado embaixo, parecidos nunca vizinhos); o Estoque 1 só ganha o aviso de \"não cabe\". Nada muda de lugar sem a pessoa pedir.",
  "",
  "FOTOS DAS PRATELEIRAS (a pessoa manda as fotos de uma coluna):",
  "1. Pergunte qual é a coluna e, se não estiver claro, qual prateleira é cada foto (a 1 é a de cima, a não ser que o estoque diga primeiraEmbaixo).",
  "2. Chame lerMapaDoEstoque com a coluna para ver o que o Rise acha que está lá.",
  "3. Leia nas fotos os códigos das etiquetas das caixinhas, da ESQUERDA para a DIREITA, prateleira por prateleira. Código que você não consegue ler com certeza vira \"?\" (nunca adivinhe).",
  "4. Chame gravarOrdemPelasFotos SEM confirmar (só simula) e mostre à pessoa: o que será gravado, as dúvidas e os que o Rise tem na coluna e não apareceram nas fotos.",
  "5. Com o ok dela, chame de novo com confirmar: true. Isso grava só a posição de quem já está naquela prateleira no Rise.",
  "6. Para cada dúvida de \"no Rise a Localização é ...\", pergunte se o produto mudou mesmo de lugar; se sim, use moverProdutoNoEstoque (coluna, prateleira e a posição vista na foto).",
  "",
  "OUTRAS TAREFAS:",
  "- Onde está / quanto cabe: lerCaixinhaDoProduto. Onde guardar um produto: sugerirLugarNoEstoque (3 sugestões pelas regras); grave só a escolhida, com moverProdutoNoEstoque.",
  "- Colunas: salvarColunaDeEstoque cria ou altera (estoque, prateleiras, medidas do vão em cm, peso máximo); excluirColunaDeEstoque só a vazia. criarColunasPelaLocalizacao cria no Estoque 1 as letras que as Localizações usam e ainda não existem.",
  "- Caixinhas: salvarModeloDeCaixinha (medidas de FORA em cm; volume útil 0,70 porque é afunilada); definirCaixinhaDoProduto liga o modelo ao produto e, se a pessoa contou, as peças que cabem.",
  "- configurarEstoque: se a prateleira 1 é a de baixo.",
  "",
  "CUIDADOS: excluir só depois de a pessoa confirmar com todas as letras (confirmo: true). Mover muda a Localização do produto: ela vai ao Bling quando a pessoa sincronizar o produto (sincronizarComBling), nunca sozinha; avise isso depois de mover. Mostre sempre o resultado que a ferramenta devolveu.",
].join("\n");

const ROTEIRO_DO_MAPA = {
  nome: "roteiroDoMapaDoEstoque",
  descricao:
    "O roteiro para trabalhar no Mapa do estoque (prateleiras e caixinhas dos 3 estoques): como ler as fotos das prateleiras e acertar a posição das caixinhas, mover produtos, cadastrar colunas e modelos de caixinha. Chame ANTES de qualquer outra ferramenta do mapa.",
  esquema: z.object({}),
  anotacoes: LEITURA,
  async executar(_argumentos, contexto) {
    exigirLeitura(contexto);
    return { roteiro: ROTEIRO_DO_ESTOQUE };
  },
};

const LER_MAPA = {
  nome: "lerMapaDoEstoque",
  descricao: [
    "Lê o Mapa do estoque. Sem nada: o resumo dos estoques e os modelos de caixinha. Com estoque: as colunas dele, o que está fora das prateleiras e as caixinhas fora da regra.",
    "Com coluna: cada prateleira da coluna com as caixinhas na ordem (posição, código, nome, estoque, modelo, quanto cabe e avisos).",
  ].join(" "),
  esquema: z.object({
    estoque: numeroDoEstoque.optional(),
    coluna: letra.optional().describe('A letra da coluna, ex.: "M"'),
  }),
  anotacoes: LEITURA,
  async executar({ estoque, coluna }, contexto) {
    exigirLeitura(contexto);
    const { mapa, modelos } = await lerMapa();
    if (coluna) {
      for (const local of mapa.locais) {
        const achada = local.colunas.find((item) => item.letra === coluna);
        if (!achada) continue;
        return {
          estoque: { numero: local.numero, nome: local.nome, primeiraEmbaixo: local.primeiraEmbaixo, aplicaRegras: local.aplicaRegras },
          coluna: {
            ...colunaParaChat(achada),
            // Na ordem do numero (a cena as guarda de cima para baixo).
            prateleiras: [...achada.prateleiras]
              .sort((a, b) => a.numero - b.numero)
              .map((prateleira) => ({ codigo: prateleira.codigo, caixinhas: prateleira.caixinhas.map(caixinhaParaChat), ...(prateleira.excedeCm ? { passaDoVaoCm: prateleira.excedeCm } : {}) })),
          },
        };
      }
      const semCadastro = mapa.semColuna.find((item) => item.letra === coluna);
      throw new ErroDeFerramenta(
        semCadastro
          ? `A coluna ${coluna} não está cadastrada (${semCadastro.produtos} produto(s) têm essa letra na Localização). Use criarColunasPelaLocalizacao ou salvarColunaDeEstoque.`
          : `A coluna ${coluna} não existe.`,
      );
    }
    if (estoque) {
      const local = mapa.locais.find((item) => item.numero === estoque);
      if (!local) throw new ErroDeFerramenta(`O Estoque ${estoque} não está cadastrado.`);
      const foraDaRegra = local.colunas.flatMap((col) =>
        col.prateleiras.flatMap((prateleira) =>
          prateleira.caixinhas.filter((caixinha) => caixinha.alertas?.length).map((caixinha) => ({ sku: caixinha.sku, lugar: `${prateleira.codigo} ${caixinha.posicao}ª`, avisos: caixinha.alertas.map((alerta) => alerta.texto) })),
        ),
      );
      return {
        estoque: { numero: local.numero, nome: local.nome, descricao: local.descricao, primeiraEmbaixo: local.primeiraEmbaixo, aplicaRegras: local.aplicaRegras, caixinhas: local.caixinhas },
        colunas: local.colunas.map(colunaParaChat),
        foraDasPrateleiras: local.fora.map((item) => ({ sku: item.sku, nome: item.nome, localizacao: item.localizacao })),
        foraDaRegra,
      };
    }
    return {
      estoques: mapa.locais.map((local) => ({
        numero: local.numero,
        nome: local.nome,
        descricao: local.descricao,
        primeiraEmbaixo: local.primeiraEmbaixo,
        aplicaRegras: local.aplicaRegras,
        colunas: local.colunas.map((col) => col.letra),
        caixinhas: local.caixinhas,
        foraDaRegra: local.foraDaRegra ?? 0,
      })),
      letrasSemColuna: mapa.semColuna,
      localizacaoQueNaoEColuna: mapa.semLugar.map((item) => ({ sku: item.sku, localizacao: item.localizacao })),
      modelosDeCaixinha: modelos.map((modelo) => ({
        nome: modelo.nome,
        larguraCm: modelo.larguraCm,
        alturaCm: modelo.alturaCm,
        profundidadeCm: modelo.profundidadeCm,
        volumeUtil: modelo.fatorUtil,
        pesoVazioKg: modelo.pesoVazioKg,
        cor: modelo.cor,
        ativo: modelo.ativo,
        produtos: modelo.produtos,
      })),
    };
  },
};

const LER_CAIXINHA = {
  nome: "lerCaixinhaDoProduto",
  descricao: "Onde está um produto no estoque: a Localização, o estoque e a prateleira, a posição, o modelo da caixinha, quanto cabe, os avisos e as últimas trocas de lugar.",
  esquema: z.object({ sku: codigo.describe("O código do produto") }),
  anotacoes: LEITURA,
  async executar({ sku }, contexto) {
    exigirLeitura(contexto);
    const produto = await produtoPeloCodigo(sku);
    const [paraMover, { mapa }] = await Promise.all([lerParaMover(produto.id), lerMapa()]);
    semErro(paraMover);
    let caixinha = null;
    let lugar = null;
    for (const local of mapa.locais) {
      for (const coluna of local.colunas) {
        for (const prateleira of coluna.prateleiras) {
          const achada = prateleira.caixinhas.find((item) => item.produtoId === produto.id);
          if (achada) {
            caixinha = achada;
            lugar = { estoque: `${local.numero} - ${local.nome}`, prateleira: prateleira.codigo, posicao: achada.posicao };
          }
        }
      }
    }
    return {
      produto: { sku: produto.sku, nome: produto.tituloBase, ativo: produto.ativo, familia: paraMover.produto.familia },
      localizacao: paraMover.produto.localizacao ?? null,
      lugar: lugar ?? (paraMover.produto.localizacao ? "fora das prateleiras do desenho (letra sem coluna, sem prateleira ou texto que não é coluna)" : "sem Localização"),
      caixinha: caixinha ? { modelo: caixinha.modelo, estoque: caixinha.estoque, cabe: caixinha.capacidade, comoCalculou: caixinha.origemDaCapacidade, pesoKg: caixinha.pesoKg, avisos: caixinha.avisos } : null,
      historico: paraMover.historico,
    };
  },
};

const SUGERIR = {
  nome: "sugerirLugarNoEstoque",
  descricao:
    '"Onde guardar este produto?" num estoque: as 3 melhores posições pelas regras (cabe na largura, altura e peso; pesado embaixo; nenhum parecido vizinho), com os motivos. Só lê: para gravar, use moverProdutoNoEstoque com a escolhida.',
  esquema: z.object({ sku: codigo.describe("O código do produto"), estoque: numeroDoEstoque }),
  anotacoes: LEITURA,
  async executar({ sku, estoque }, contexto) {
    exigirLeitura(contexto);
    const produto = await produtoPeloCodigo(sku);
    const local = await localPeloNumero(estoque);
    const resultado = semErro(await sugerirLugarParaProduto(produto.id, local.id));
    return {
      produto: produto.sku,
      estoque: local.nome,
      modeloDaCaixinha: resultado.modelo?.nome ?? null,
      sugestoes: resultado.sugestoes.map(({ localId: _id, ...sugestao }) => sugestao),
      motivo: resultado.motivo,
    };
  },
};

const MOVER = {
  nome: "moverProdutoNoEstoque",
  descricao: [
    "Muda o produto de lugar: grava a Localização (coluna + prateleira, ex.: M2) e a posição na prateleira (as caixinhas dali para a direita andam uma casa), e anota no histórico com o seu login.",
    "Sem posição, o produto vai para a prateleira sem posição marcada. modelo = o nome do modelo de caixinha, se mudou junto.",
    "Só quando a pessoa pedir ou confirmar. A Localização nova vai ao Bling só quando ela sincronizar o produto: avise.",
  ].join(" "),
  esquema: z.object({
    sku: codigo.describe("O código do produto"),
    coluna: letra.describe("A letra da coluna de destino"),
    prateleira: z.coerce.number().int().min(1).max(40).describe("O número da prateleira"),
    posicao: z.coerce.number().int().min(1).max(500).optional().describe("A posição da esquerda para a direita (1 = a primeira)"),
    modelo: z.string().trim().min(1).max(60).optional().describe("O nome do modelo de caixinha, se mudou"),
  }),
  anotacoes: { ...ESCRITA, idempotentHint: false },
  async executar({ sku, coluna, prateleira, posicao, modelo }, contexto) {
    exigirArrumacao(contexto);
    const produto = await produtoPeloCodigo(sku);
    if (!produto.ativo) throw new ErroDeFerramenta(`O produto ${produto.sku} está inativo.`);
    const modeloCaixinhaId = modelo ? (await modeloPeloNome(modelo)).id : undefined;
    const resultado = semErro(await moverProduto(produto.id, { letra: coluna, prateleira, posicao: posicao ?? null, modeloCaixinhaId }, contexto.usuario ?? null));
    return { produto: produto.sku, localizacao: resultado.para, estoque: resultado.estoque, posicao: posicao ?? null, lembrete: "A Localização nova vai ao Bling quando o produto for sincronizado." };
  },
};

const FOTOS = {
  nome: "gravarOrdemPelasFotos",
  descricao: [
    'A ordem das caixinhas lida nas FOTOS de uma coluna: os códigos de cada prateleira da esquerda para a direita ("?" = ilegível). Siga o roteiroDoMapaDoEstoque.',
    "Sem confirmar (o padrão) só simula: devolve o que gravaria, as dúvidas e os produtos da coluna que não apareceram nas fotos. Com confirmar: true grava a posição de quem já está naquela prateleira; NUNCA muda a Localização (quem está em outra prateleira no Rise vira dúvida: use moverProdutoNoEstoque se a pessoa confirmar).",
  ].join(" "),
  esquema: z.object({
    coluna: letra.describe("A letra da coluna fotografada"),
    prateleiras: z
      .record(z.string().regex(/^\d{1,2}$/, "A prateleira é um número."), z.array(z.string().trim().max(60)).max(200))
      .describe('{ "1": ["100225", "?", "220505"], "2": [...] }: o número da prateleira e os códigos da esquerda para a direita'),
    confirmar: z.boolean().optional().describe("true grava; sem ele, só simula"),
  }),
  anotacoes: ESCRITA,
  async executar({ coluna, prateleiras, confirmar }, contexto) {
    exigirArrumacao(contexto);
    const resultado = semErro(await conferirOrdemDasFotos({ coluna, prateleiras }, { gravar: Boolean(confirmar) }));
    return { gravado: Boolean(confirmar), coluna: resultado.coluna, posicoes: resultado.gravar, duvidas: resultado.duvidas, naoApareceramNasFotos: resultado.faltaram };
  },
};

const SALVAR_COLUNA = {
  nome: "salvarColunaDeEstoque",
  descricao: [
    "Cria ou altera uma coluna (a letra é única em todos os estoques). Na coluna nova, estoque e prateleiras são obrigatórios. Na que existe, mande só o que muda; null apaga uma medida.",
    'Medidas do VÃO da prateleira em cm (largura, profundidade, altura livre entre prateleiras) e o peso máximo por prateleira em kg: sem a largura, a coluna não entra no "Onde guardar".',
    "letraNova troca a letra (recusado se a coluna tem produtos). Mudar o estoque leva a coluna inteira para outro estoque.",
  ].join(" "),
  esquema: z.object({
    coluna: letra.describe("A letra da coluna"),
    estoque: numeroDoEstoque.optional(),
    prateleiras: z.coerce.number().int().min(1).max(40).optional().describe("Quantas prateleiras a coluna tem"),
    ordem: z.coerce.number().int().min(0).max(9999).optional().describe("A ordem da coluna no desenho do estoque"),
    larguraCm: medida,
    profundidadeCm: medida,
    alturaLivreCm: medida,
    pesoMaximoKg: medida,
    letraNova: letra.optional(),
  }),
  anotacoes: ESCRITA,
  async executar({ coluna, estoque, prateleiras, ordem, larguraCm, profundidadeCm, alturaLivreCm, pesoMaximoKg, letraNova }, contexto) {
    exigirCadastro(contexto);
    const atual = await prisma.colunaDeEstoque.findUnique({ where: { letra: coluna } });
    if (!atual && (!estoque || !prateleiras)) throw new ErroDeFerramenta(`A coluna ${coluna} não existe: para criá-la, diga o estoque e quantas prateleiras ela tem.`);
    const local = estoque ? await localPeloNumero(estoque) : await prisma.localDeEstoque.findUnique({ where: { id: atual.localId } });
    const proximaOrdem = atual ? atual.ordem : ((await prisma.colunaDeEstoque.aggregate({ _max: { ordem: true } }))._max.ordem ?? 0) + 1;
    const valor = (novo, antigo) => (novo === undefined ? numeroDe(antigo) : novo);
    const dados = {
      localId: local.id,
      letra: letraNova ?? coluna,
      ordem: ordem ?? proximaOrdem,
      prateleiras: prateleiras ?? atual.prateleiras,
      larguraCm: valor(larguraCm, atual?.larguraCm),
      profundidadeCm: valor(profundidadeCm, atual?.profundidadeCm),
      alturaLivreCm: valor(alturaLivreCm, atual?.alturaLivreCm),
      pesoMaximoKg: valor(pesoMaximoKg, atual?.pesoMaximoKg),
    };
    semErro(await salvarColuna(atual?.id ?? null, dados));
    const { localId: _localId, ...semId } = dados;
    return { criada: !atual, coluna: { ...semId, estoque: local.numero } };
  },
};

const EXCLUIR_COLUNA = {
  nome: "excluirColunaDeEstoque",
  descricao: "Exclui uma coluna VAZIA (com produto na Localização, recusa dizendo quantos). Só depois de a pessoa confirmar com todas as letras: confirmo: true.",
  esquema: z.object({ coluna: letra.describe("A letra da coluna"), confirmo: z.literal(true).describe("true: a pessoa confirmou a exclusão") }),
  anotacoes: EXCLUSAO,
  async executar({ coluna }, contexto) {
    exigirCadastro(contexto);
    const atual = await prisma.colunaDeEstoque.findUnique({ where: { letra: coluna }, select: { id: true } });
    if (!atual) throw new ErroDeFerramenta(`A coluna ${coluna} não existe.`);
    semErro(await excluirColuna(atual.id));
    return { excluida: coluna };
  },
};

const SALVAR_MODELO = {
  nome: "salvarModeloDeCaixinha",
  descricao: [
    "Cria ou altera um modelo de caixinha (pelo nome). Medidas de FORA em cm; volumeUtil = a parte do volume que guarda peças (padrão 0,70, porque a caixinha é afunilada).",
    "No modelo novo, largura, altura e profundidade são obrigatórias. No que existe, mande só o que muda; nomeNovo renomeia; ativo: false tira o modelo da escolha sem apagar.",
  ].join(" "),
  esquema: z.object({
    nome: z.string().trim().min(1).max(60).describe('O nome do modelo, ex.: "Pequena 10x8"'),
    nomeNovo: z.string().trim().min(1).max(60).optional(),
    larguraCm: z.number().positive().max(1000).optional(),
    alturaCm: z.number().positive().max(1000).optional(),
    profundidadeCm: z.number().positive().max(1000).optional(),
    volumeUtil: z.number().min(0.1).max(1).optional().describe("De 0,1 a 1; padrão 0,70"),
    pesoVazioKg: z.number().positive().max(100).nullable().optional(),
    cor: z
      .string()
      .trim()
      .regex(/^#[0-9a-fA-F]{6}$/, "A cor é #RRGGBB.")
      .optional()
      .describe("A cor no desenho, #RRGGBB"),
    ativo: z.boolean().optional(),
  }),
  anotacoes: ESCRITA,
  async executar({ nome, nomeNovo, larguraCm, alturaCm, profundidadeCm, volumeUtil, pesoVazioKg, cor, ativo }, contexto) {
    exigirCadastro(contexto);
    const atual = await prisma.modeloDeCaixinha.findFirst({ where: { nome: { equals: nome, mode: "insensitive" } } });
    if (!atual && (!larguraCm || !alturaCm || !profundidadeCm)) throw new ErroDeFerramenta(`O modelo "${nome}" não existe: para criá-lo, diga a largura, a altura e a profundidade em cm.`);
    const dados = {
      nome: nomeNovo ?? atual?.nome ?? nome,
      cor: cor ?? atual?.cor ?? "#60a5fa",
      larguraCm: larguraCm ?? numeroDe(atual.larguraCm),
      alturaCm: alturaCm ?? numeroDe(atual.alturaCm),
      profundidadeCm: profundidadeCm ?? numeroDe(atual.profundidadeCm),
      fatorUtil: volumeUtil ?? numeroDe(atual?.fatorUtil) ?? 0.7,
      pesoVazioKg: pesoVazioKg === undefined ? numeroDe(atual?.pesoVazioKg) : pesoVazioKg,
      ativo: ativo ?? atual?.ativo ?? true,
    };
    semErro(await salvarModelo(atual?.id ?? null, dados));
    const { fatorUtil, ...resto } = dados;
    return { criado: !atual, modelo: { ...resto, volumeUtil: fatorUtil } };
  },
};

const EXCLUIR_MODELO = {
  nome: "excluirModeloDeCaixinha",
  descricao:
    "Exclui um modelo de caixinha SEM uso (em uso, recusa; para tirar da escolha, salvarModeloDeCaixinha com ativo: false). Só depois de a pessoa confirmar com todas as letras: confirmo: true.",
  esquema: z.object({ nome: z.string().trim().min(1).max(60), confirmo: z.literal(true).describe("true: a pessoa confirmou a exclusão") }),
  anotacoes: EXCLUSAO,
  async executar({ nome }, contexto) {
    exigirCadastro(contexto);
    const modelo = await modeloPeloNome(nome);
    semErro(await excluirModelo(modelo.id));
    return { excluido: modelo.nome };
  },
};

const CAIXINHA_DO_PRODUTO = {
  nome: "definirCaixinhaDoProduto",
  descricao:
    "Liga um produto a um modelo de caixinha (modelo: null tira) e grava as peças que cabem, se a pessoa contou (vence a estimativa; null volta à estimativa). Mande só o que muda. Não muda o lugar: para isso, moverProdutoNoEstoque.",
  esquema: z.object({
    sku: codigo.describe("O código do produto"),
    modelo: z.string().trim().min(1).max(60).nullable().optional().describe("O nome do modelo de caixinha; null tira"),
    pecasPorCaixinha: z.number().int().min(1).max(1000000).nullable().optional().describe("Quantas peças cabem, contadas; null volta à estimativa"),
  }),
  anotacoes: ESCRITA,
  async executar({ sku, modelo, pecasPorCaixinha }, contexto) {
    exigirCadastro(contexto);
    const produto = await produtoPeloCodigo(sku);
    const atual = await prisma.produto.findUnique({ where: { id: produto.id }, select: { modeloCaixinhaId: true, pecasPorCaixinha: true, ordemNaPrateleira: true, modeloCaixinha: { select: { nome: true } } } });
    const escolhido = modelo ? await modeloPeloNome(modelo) : null;
    const dados = {
      modeloCaixinhaId: modelo === undefined ? atual.modeloCaixinhaId : (escolhido?.id ?? null),
      pecasPorCaixinha: pecasPorCaixinha === undefined ? atual.pecasPorCaixinha : pecasPorCaixinha,
      ordemNaPrateleira: atual.ordemNaPrateleira,
    };
    semErro(await salvarCaixinhaDoProduto(produto.id, dados));
    return { produto: produto.sku, modelo: modelo === undefined ? (atual.modeloCaixinha?.nome ?? null) : (escolhido?.nome ?? null), pecasPorCaixinha: dados.pecasPorCaixinha };
  },
};

const CONFIGURAR_ESTOQUE = {
  nome: "configurarEstoque",
  descricao: "Diz se a prateleira 1 de um estoque é a de BAIXO (primeiraEmbaixo: true) ou a de cima (false). Muda o desenho e a regra do pesado embaixo.",
  esquema: z.object({ estoque: numeroDoEstoque, primeiraEmbaixo: z.boolean() }),
  anotacoes: ESCRITA,
  async executar({ estoque, primeiraEmbaixo }, contexto) {
    exigirCadastro(contexto);
    const local = await localPeloNumero(estoque);
    semErro(await salvarLocal(local.id, { primeiraEmbaixo }));
    return { estoque: local.nome, primeiraEmbaixo };
  },
};

const CRIAR_COLUNAS = {
  nome: "criarColunasPelaLocalizacao",
  descricao: "Cria no Estoque 1 uma coluna para cada letra que as Localizações dos produtos usam e ainda não tem coluna (com a maior prateleira vista). Repetir não duplica.",
  esquema: z.object({}),
  anotacoes: ESCRITA,
  async executar(_argumentos, contexto) {
    exigir(contexto, [MAPA, "editar"], [LOCALIZACAO, "ver"]);
    const resultado = semErro(await criarColunasPelaLocalizacao());
    return { criadas: resultado.criadas, letras: resultado.letras ?? [] };
  },
};

export const FERRAMENTAS_DO_ESTOQUE = [
  ROTEIRO_DO_MAPA,
  LER_MAPA,
  LER_CAIXINHA,
  SUGERIR,
  MOVER,
  FOTOS,
  SALVAR_COLUNA,
  EXCLUIR_COLUNA,
  SALVAR_MODELO,
  EXCLUIR_MODELO,
  CAIXINHA_DO_PRODUTO,
  CONFIGURAR_ESTOQUE,
  CRIAR_COLUNAS,
];
