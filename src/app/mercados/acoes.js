"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { apagarArquivosOriginais, guardarArquivosOriginais } from "@/lib/coleta/arquivo";
import { detalheDoProduto } from "@/lib/coleta/banco";
import { enfileirar, jobLargado, workerNoAr } from "@/lib/coleta/fila";
import { podeVisitar } from "@/lib/coleta/buscar";
import { juntarListas, lerArquivo } from "@/lib/coleta/arquivos";
import { portalDoEndereco, regrasDoFornecedor } from "@/lib/coleta/fornecedores";
import { testarFonte } from "@/lib/coleta/testar";
import { parametrosDaCategoria, testarPortal } from "@/lib/coleta/portal-addsuite";
import { cifrar } from "@/lib/crypto";
import { garantirCadastroDaFonte } from "@/lib/cadastros";

/**
 * Acoes da secao Mercados.
 *
 * Este arquivo so exporta funcao assincrona: num modulo "use server", uma
 * constante exportada faz o Next recusar o modulo inteiro.
 */

const FonteSchema = z.object({
  nome: z.string().trim().min(1, "Informe um nome para a fonte."),
  url: z.string().trim().min(1, "Informe o endereco do site."),
  tipo: z.enum(["CONCORRENTE", "FORNECEDOR", "OUTRO"]),
  secao: z.string().trim().optional().nullable(),
});

// ---------------------------------------------------------------------------
// Teste da fonte
// ---------------------------------------------------------------------------

/**
 * Testa se uma fonte serve, sem gravar nada.
 *
 * Nao basta o site responder 200 — toda loja responde 200 na home. O teste
 * abre paginas de verdade e so aprova se conseguir montar produto com nome,
 * endereco e preco.
 */
export async function testarFonteAcao({ url, secao, nome, tipo }) {
  try {
    return await testarFonte({ url, secao, nome, tipo });
  } catch (erro) {
    return {
      resultado: "FALHA",
      motivo: erro?.message ?? "Falha inesperada ao testar a fonte.",
      passos: [],
      produtos: [],
      campos: null,
      plataforma: null,
      catalogoPublico: null,
    };
  }
}

/**
 * "Buscar dados" de fornecedor com PORTAL DE LOGIN (a Santana). O link e o de
 * uma categoria, e o login vai so ate aqui: nada e gravado no teste, e a senha
 * nao volta para a tela.
 */
export async function testarPortalAcao({ url, usuario, senha, nome, tipo }) {
  try {
    return await testarPortal({ url, usuario, senha, nome, tipo });
  } catch (erro) {
    return {
      resultado: "FALHA",
      motivo: erro?.message ?? "Falha inesperada ao testar o portal.",
      passos: [],
      produtos: [],
      campos: null,
      plataforma: null,
      catalogoPublico: null,
    };
  }
}

/**
 * Indice do arquivo inteiro, por codigo, para a tela poder mesclar.
 *
 * A previa devolve tres produtos; o arquivo tem centenas. Sem este indice, a
 * mesclagem com o site so aconteceria se um dos tres sorteados casasse com um
 * dos tres do site — o que quase nunca acontece, e foi por isso que a
 * mesclagem parecia nao funcionar.
 *
 * Vai SEM imagem e SEM descricao de proposito: sao os campos pesados, e o
 * arquivo da Fortek tem 10 MB so de foto. O que atravessa e o que o site nao
 * tem — preco, saldo e os codigos fiscais.
 */
function resumoPorCodigo(produtos) {
  const indice = {};

  for (const produto of produtos) {
    if (!produto.code || produto.code === "N/A") continue;
    if (indice[produto.code]) continue;

    indice[produto.code] = {
      code: produto.code,
      prices: produto.prices,
      stock: produto.stock,
      taxes: produto.taxes,
      ncm: produto.ncm,
      ean: produto.ean,
      category: produto.category,
      specifications: produto.specifications,
      images: [],
      origens: produto.origens,
    };
  }

  return indice;
}
/**
 * Escolhe os produtos que a previa mostra.
 *
 * Nao sao os tres primeiros: num catalogo de mil itens, os primeiros costumam
 * ser todos parecidos, e o operador nao ve o caso que precisa conferir. A
 * amostra tenta comecar por quem tem PRONTA ENTREGA E RESERVA — e o produto
 * que mostra as duas caixas e prova que as listas se juntaram.
 *
 * Depois completa com o resto, na ordem do arquivo.
 */
function amostraRepresentativa(produtos, quantos = 3) {
  const temAmbos = (produto) =>
    typeof produto.stock?.quantity === "number" &&
    typeof produto.stock?.aChegar === "number";

  const escolhidos = produtos.filter(temAmbos).slice(0, quantos);

  for (const produto of produtos) {
    if (escolhidos.length >= quantos) break;
    if (!escolhidos.includes(produto)) escolhidos.push(produto);
  }

  return escolhidos;
}
/**
 * Testa a fonte por um ARQUIVO trazido do fornecedor, em vez do site.
 *
 * Tem prioridade sobre a navegacao quando o operador sobe um arquivo: se ele
 * ja trouxe o catalogo, abrir o site seria trabalho repetido — e, no caso que
 * motivou isto, impossivel, porque o portal exige login.
 *
 * Recebe FormData porque Server Action nao aceita Uint8Array direto. O teto do
 * corpo esta em 24 MB no next.config.mjs; acima disso o 413 vem ANTES daqui.
 */
export async function testarArquivoAcao(dados) {
  const arquivos = dados.getAll("arquivo").filter((item) => typeof item !== "string");

  if (arquivos.length === 0) {
    return { resultado: "FALHA", motivo: "Nenhum arquivo recebido.", passos: [], produtos: [] };
  }

  const nome = dados.get("nome") || arquivos[0].name;
  const tipo = dados.get("tipo") || "FORNECEDOR";

  try {
    const lidos = [];
    const passos = [];
    const avisos = [];

    for (const arquivo of arquivos) {
      const bytes = new Uint8Array(await arquivo.arrayBuffer());
      const leitura = await lerArquivo({
        nome: arquivo.name,
        bytes,
        fonte: { name: nome, type: tipo },
      });

      lidos.push(leitura);
      avisos.push(...leitura.avisos);

      const modalidade =
        leitura.modalidade === "RESERVA"
          ? " · lista de RESERVA"
          : leitura.modalidade === "PRONTA_ENTREGA"
            ? " · pronta entrega"
            : "";

      passos.push({
        nome: "Arquivo recebido",
        ok: true,
        detalhe: `${arquivo.name} · ${(arquivo.size / 1024 / 1024).toFixed(1)} MB · ${leitura.formato.toUpperCase()}${modalidade}`,
      });

      passos.push({
        nome: "Produtos lidos",
        ok: leitura.produtos.length > 0,
        detalhe:
          leitura.produtos.length > 0
            ? `${leitura.produtos.length} produto(s) · ${leitura.origem}`
            : "nenhum produto reconhecido no arquivo",
      });
    }

    // A pronta entrega vem primeiro: em juntarListas quem chega antes vence, e
    // o preco a manter e o dela.
    const ordenados = [...lidos].sort((a, b) =>
      (a.modalidade === "RESERVA" ? 1 : 0) - (b.modalidade === "RESERVA" ? 1 : 0),
    );

    // Particularidades declaradas para este fornecedor, se houver. E onde mora
    // a regra do sufixo de carga da Fortek ("02-268-A" e "02-268" sao o mesmo
    // item), que nao vale como palpite geral.
    const regras = regrasDoFornecedor({ nome, url: dados.get("url") });

    const somados = ordenados.map((leitura) => leitura.produtos);
    const produtos =
      somados.length > 1
        ? juntarListas(somados, { sufixoDeCarga: regras.sufixoDeCarga })
        : somados[0] ?? [];

    const formato = lidos[0]?.formato ?? "desconhecido";
    const origem = lidos[0]?.origem ?? "arquivo do fornecedor";

    if (somados.length > 1) {
      const total = somados.reduce((soma, lista) => soma + lista.length, 0);
      passos.push({
        nome: "Listas juntadas",
        ok: true,
        detalhe:
          `${total} linha(s) viraram ${produtos.length} produto(s)` +
          (regras.sufixoDeCarga
            ? ` — regra da ${regras.nome}: o sufixo do codigo e a carga, nao o produto`
            : " — o mesmo codigo nas duas listas e um produto so"),
      });
    }

    for (const aviso of avisos) {
      passos.push({ nome: "Aviso", ok: false, detalhe: aviso });
    }

    if (produtos.length === 0) {
      return {
        resultado: "FALHA",
        motivo:
          "Nao foi possivel reconhecer produtos neste arquivo. " +
          "Formatos lidos hoje: pagina salva (HTML), catalogo em PDF e JSON.",
        passos,
        produtos: [],
        campos: null,
        formatos: [formato],
      };
    }

    // Os mesmos campos que o teste do site relata, para a tela nao precisar
    // saber se o produto veio de arquivo ou de navegacao.
    const { camposPreenchidos, ROTULOS_CAMPOS } = await import("@/lib/coleta/campos");

    const presentes = {};
    for (const produto of produtos) {
      for (const [campo, tem] of Object.entries(camposPreenchidos(produto))) {
        presentes[campo] = presentes[campo] || tem;
      }
    }

    const encontrados = Object.entries(presentes)
      .filter(([, tem]) => tem)
      .map(([campo]) => ROTULOS_CAMPOS[campo]);
    const ausentes = Object.entries(presentes)
      .filter(([, tem]) => !tem)
      .map(([campo]) => ROTULOS_CAMPOS[campo]);

    return {
      resultado: ausentes.length === 0 ? "SUCESSO" : "PARCIAL",
      motivo: null,
      passos,
      // A previa mostra uma amostra escolhida; o arquivo inteiro entra na
      // coleta. Ver so os tres primeiros esconderia o caso interessante.
      produtos: amostraRepresentativa(produtos),
      // O arquivo inteiro, so com o que a tela precisa para mesclar.
      porCodigo: resumoPorCodigo(produtos),
      totalNoArquivo: produtos.length,
      campos: { encontrados, ausentes },
      formatos: [formato],
      produtosNoSite: produtos.length,
      produtosNoSiteParcial: false,
    };
  } catch (erro) {
    return {
      resultado: "FALHA",
      motivo: `Falha ao ler o arquivo: ${erro?.message ?? erro}`,
      passos: [],
      produtos: [],
      campos: null,
    };
  }
}
// ---------------------------------------------------------------------------
// Cadastro
// ---------------------------------------------------------------------------

/**
 * Grava a fonte. So deve ser chamada depois de um teste aprovado.
 *
 * O robots.txt e reconferido aqui — e barato, porque a leitura fica em cache
 * por uma hora — para que a permissao seja verificada no servidor e nao apenas
 * acreditada a partir do que a tela mandou.
 */
export async function salvarFonte({
  nome,
  url,
  tipo,
  secao,
  resumo,
  produtosNoSite,
  produtosNoSiteParcial,
  usuario,
  senha,
}) {
  const analise = FonteSchema.safeParse({ nome, url, tipo, secao });
  if (!analise.success) {
    return { ok: false, erro: analise.error.issues[0].message };
  }

  let alvo;
  try {
    alvo = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`);
  } catch {
    return { ok: false, erro: "Endereco invalido." };
  }

  const permissao = await podeVisitar(alvo.toString());
  if (!permissao.permitido) {
    return { ok: false, erro: `O robots.txt deste site nos bloqueia: ${permissao.motivo}` };
  }

  const prefixoUrl = analise.data.secao?.trim() || null;

  /*
    PORTAL COM LOGIN (Santana): o link salvo e a PRIMEIRA categoria, e o login vai
    cifrado. Sem login nao ha fonte — o portal nao mostra preco a ninguem.
  */
  let doPortal = {};
  if (portalDoEndereco(url)) {
    const categoria = parametrosDaCategoria(url);
    if (!categoria) return { ok: false, erro: "Informe o link de uma categoria do portal (terminado em .html)." };
    if (!String(usuario ?? "").trim() || !senha) {
      return { ok: false, erro: "Informe o e-mail e a senha do portal." };
    }
    doPortal = {
      categorias: [
        {
          url: categoria.url,
          total: typeof produtosNoSite === "number" ? produtosNoSite : null,
          adicionadaEm: new Date().toISOString(),
        },
      ],
      credencialCifrada: cifrar({ usuario: String(usuario).trim(), senha: String(senha) }),
      credencialAtualizadaEm: new Date(),
    };
  }

  const existente = await prisma.fonteColeta.findFirst({
    where: { dominio: alvo.hostname, prefixoUrl },
  });

  if (existente) {
    return {
      ok: false,
      erro: `"${existente.nome}" ja acompanha ${alvo.hostname}${prefixoUrl ?? ""}.`,
    };
  }

  // Numa transacao so: a fonte e o cadastro da empresa em Cadastros (pedido do
  // dono em 18/09/2026) nascem juntos ou nenhum dos dois — fonte sem cadastro
  // seria o buraco que este pedido veio fechar.
  const fonte = await prisma.$transaction(async (tx) => {
    const criada = await tx.fonteColeta.create({
      data: {
        nome: analise.data.nome,
        dominio: alvo.hostname,
        tipo: analise.data.tipo,
        prefixoUrl,
        robotsPermite: true,
        amostraResumo: resumo ?? null,
        ...doPortal,
        // Quantos produtos o site declarou ter no momento do teste. Guardado no
        // cadastro para a tela dizer o quanto do catalogo ja foi coletado sem
        // precisar reabrir o sitemap a cada renderizacao.
        produtosNoSite: produtosNoSite ?? null,
        produtosNoSiteParcial: produtosNoSiteParcial ?? false,
        // Cadastrada PAUSADA: a coleta periodica nao faz parte desta etapa, e uma
        // fonte que comeca a varrer sozinha ao ser salva seria uma surpresa.
        ativa: false,
        proximaVarreduraEm: new Date(Date.now() + 100 * 365 * 24 * 60 * 60 * 1000),
      },
    });

    await garantirCadastroDaFonte(tx, criada);
    return criada;
  });

  revalidatePath("/mercados/fontes");
  revalidatePath("/mercados");
  revalidatePath("/cadastros", "layout");
  return { ok: true, id: fonte.id };
}

/**
 * Corrige nome e endereco de uma fonte ja cadastrada.
 *
 * Trocar o dominio e mais que renomear: as paginas ja coletadas continuam
 * apontando para o endereco antigo, e a unicidade dominio+trecho pode colidir
 * com outra fonte. Por isso o dominio novo passa pelas MESMAS conferencias do
 * cadastro — robots.txt e duplicidade —, e nao por um caminho mais curto so
 * porque a fonte ja existe.
 */
export async function editarFonte(id, { nome, url }) {
  const fonte = await prisma.fonteColeta.findUnique({ where: { id } });
  if (!fonte) return { ok: false, erro: "Fonte nao encontrada." };

  const nomeLimpo = (nome ?? "").trim();
  if (!nomeLimpo) return { ok: false, erro: "Informe um nome para a fonte." };

  const dados = { nome: nomeLimpo };

  const urlLimpa = (url ?? "").trim();
  if (urlLimpa) {
    let alvo;
    try {
      alvo = new URL(/^https?:\/\//i.test(urlLimpa) ? urlLimpa : `https://${urlLimpa}`);
    } catch {
      return { ok: false, erro: "Endereco invalido." };
    }

    if (alvo.hostname !== fonte.dominio) {
      const permissao = await podeVisitar(alvo.toString());
      if (!permissao.permitido) {
        return {
          ok: false,
          erro: `O robots.txt deste site nos bloqueia: ${permissao.motivo}`,
        };
      }

      const existente = await prisma.fonteColeta.findFirst({
        where: {
          dominio: alvo.hostname,
          prefixoUrl: fonte.prefixoUrl,
          id: { not: id },
        },
      });

      if (existente) {
        return {
          ok: false,
          erro: `"${existente.nome}" ja acompanha ${alvo.hostname}.`,
        };
      }

      dados.dominio = alvo.hostname;
      dados.robotsPermite = true;
    }
  }

  await prisma.fonteColeta.update({ where: { id }, data: dados });

  revalidatePath("/mercados/fontes");
  revalidatePath("/mercados");
  return { ok: true };
}
export async function alternarFonte(id) {
  const fonte = await prisma.fonteColeta.findUnique({ where: { id } });
  if (!fonte) return { ok: false, erro: "Fonte nao encontrada." };

  if (!fonte.robotsPermite && !fonte.ativa) {
    return { ok: false, erro: "O robots.txt deste site nos bloqueia." };
  }

  const retomando = !fonte.ativa;

  await prisma.fonteColeta.update({
    where: { id },
    data: {
      ativa: retomando,
      /*
        RETOMAR TAMBEM DEVOLVE A DATA DA PROXIMA VARREDURA.

        A fonte nasce pausada com `proximaVarreduraEm` a cem anos, para que
        salvar um cadastro nao dispare varredura sozinho. Mas "Retomar" so
        ligava o `ativa` e deixava a data la em 2126 — e o ciclo automatico
        filtra por ela. Resultado: fonte retomada aparecia "Ativa" na tela e
        nunca era varrida. Foi o que aconteceu com a Fortek e a Nightech, que
        passaram a sessao inteira ativas e com "ultima varredura: nunca"
        enquanto as cinco concorrentes rodavam.

        Pausar nao mexe na data: quem pausa quer parar, e a promessa da tela e
        que pausar mantem tudo como esta.
      */
      ...(retomando ? { proximaVarreduraEm: new Date() } : {}),
    },
  });

  revalidatePath("/mercados/fontes");
  return { ok: true };
}

/**
 * Varredura manual de UMA fonte, pelo botao "Varrer agora" da linha (pedido do
 * dono em 16/09/2026). So enfileira: quem varre e o worker, pelo mesmo caminho do
 * ciclo automatico, e ela entra ao lado das outras lojas em andamento.
 *
 * Fonte pausada ou barrada pelo robots.txt e recusada aqui, e nao no worker:
 * enfileirada, ela viraria uma varredura "falhou: fonte pausada" na fila.
 */
export async function varrerFonteAgora(fonteId) {
  const fonte = await prisma.fonteColeta.findUnique({
    where: { id: fonteId },
    select: { id: true, nome: true, ativa: true, robotsPermite: true },
  });
  if (!fonte) return { ok: false, erro: "Fonte nao encontrada." };
  if (!fonte.robotsPermite) return { ok: false, erro: "O robots.txt deste site nos bloqueia." };
  if (!fonte.ativa) return { ok: false, erro: "Fonte pausada. Use Retomar antes de varrer." };

  // Fonte com job aberto fica de fora pelo indice unico da fila.
  const enfileiradas = await enfileirar([fonte]);

  revalidatePath("/mercados/fontes");
  revalidatePath("/mercados");
  if (enfileiradas === 0) return { ok: false, erro: "Esta fonte ja esta na fila ou em varredura." };
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Portal com login: categorias e login da fonte
// ---------------------------------------------------------------------------

async function fonteDePortal(fonteId) {
  const fonte = await prisma.fonteColeta.findUnique({ where: { id: fonteId } });
  if (!fonte) return { erro: "Fonte nao encontrada." };
  if (!portalDoEndereco(fonte.dominio)) {
    return { erro: "Esta fonte nao e um portal varrido por categoria." };
  }
  return { fonte, categorias: Array.isArray(fonte.categorias) ? fonte.categorias : [] };
}

/**
 * Acrescenta uma categoria ao portal. Nao abre o site: a conferencia de verdade
 * e a proxima varredura, que registra quantos produtos a categoria tem. Aqui so
 * se garante que o link e de categoria e do MESMO portal.
 */
export async function adicionarCategoria(fonteId, url) {
  const { fonte, categorias, erro } = await fonteDePortal(fonteId);
  if (erro) return { ok: false, erro };

  const categoria = parametrosDaCategoria(String(url ?? "").trim());
  if (!categoria) return { ok: false, erro: "Use o link de uma categoria, terminado em .html." };

  const host = new URL(categoria.url).hostname.replace(/^www\./, "");
  if (host !== fonte.dominio.replace(/^www\./, "")) {
    return { ok: false, erro: `O link e de ${host}, e esta fonte e ${fonte.dominio}.` };
  }
  if (categorias.some((item) => item.url === categoria.url)) {
    return { ok: false, erro: "Esta categoria ja esta na fonte." };
  }

  await prisma.fonteColeta.update({
    where: { id: fonte.id },
    data: {
      categorias: [...categorias, { url: categoria.url, total: null, adicionadaEm: new Date().toISOString() }],
    },
  });
  revalidatePath("/mercados/fontes");
  return { ok: true };
}

/**
 * Tira a categoria da varredura. Os produtos ja coletados dela FICAM: saem da
 * tabela so quando a proxima varredura fechar sem eles.
 */
export async function removerCategoria(fonteId, url) {
  const { fonte, categorias, erro } = await fonteDePortal(fonteId);
  if (erro) return { ok: false, erro };
  if (categorias.length <= 1) {
    return { ok: false, erro: "A fonte precisa de pelo menos uma categoria. Para parar de varrer, use Pausar." };
  }

  await prisma.fonteColeta.update({
    where: { id: fonte.id },
    data: { categorias: categorias.filter((item) => item.url !== url) },
  });
  revalidatePath("/mercados/fontes");
  return { ok: true };
}

/** Troca o login guardado. A senha entra aqui e nunca mais sai para a tela. */
export async function salvarLoginDaFonte(fonteId, { usuario, senha }) {
  const { fonte, erro } = await fonteDePortal(fonteId);
  if (erro) return { ok: false, erro };
  if (!String(usuario ?? "").trim() || !senha) return { ok: false, erro: "Informe o e-mail e a senha." };

  await prisma.fonteColeta.update({
    where: { id: fonte.id },
    data: {
      credencialCifrada: cifrar({ usuario: String(usuario).trim(), senha: String(senha) }),
      credencialAtualizadaEm: new Date(),
    },
  });
  revalidatePath("/mercados/fontes");
  return { ok: true };
}

/** Quantos produtos se perdem ao excluir — a tela avisa antes de apagar. */
export async function contarProdutos(id) {
  return prisma.produtoColetado.count({ where: { fonteId: id } });
}

export async function excluirFonte(id) {
  await prisma.fonteColeta.delete({ where: { id } });
  revalidatePath("/mercados/fontes");
  revalidatePath("/mercados");
  return { ok: true };
}

/**
 * Guarda a lista que o fornecedor mandou.
 *
 * NAO PROCESSA AGORA. Guardar e reprocessar sao momentos diferentes: o envio
 * termina em segundos e a leitura de uma planilha de 15 MB com 459 imagens
 * ancoradas leva bem mais que isso. Quem le e o worker, em "Atualizar tabelas",
 * pelo mesmo caminho da varredura — um caminho so.
 *
 * Recebe FormData porque Server Action nao aceita Uint8Array direto. O teto do
 * corpo esta em 24 MB no next.config.mjs; acima disso o 413 vem ANTES daqui, e
 * por isso a tela confere o tamanho antes de enviar.
 */
export async function enviarArquivosDaFonte(fonteId, dados) {
  const fonte = await prisma.fonteColeta.findUnique({ where: { id: fonteId } });
  if (!fonte) return { ok: false, erro: "Fonte nao encontrada." };

  if (fonte.tipo !== "FORNECEDOR") {
    return {
      ok: false,
      erro: "So fornecedor manda lista. Concorrente tem vitrine, e e por ela que se varre.",
    };
  }

  const arquivos = dados.getAll("arquivo").filter((item) => typeof item !== "string");
  if (arquivos.length === 0) return { ok: false, erro: "Nenhum arquivo recebido." };

  const guardar = [];
  for (const arquivo of arquivos) {
    guardar.push({
      nome: arquivo.name,
      bytes: new Uint8Array(await arquivo.arrayBuffer()),
    });
  }

  // Os originais vao para o disco; QUAIS sao e QUANDO chegaram, para a fonte.
  // A data e a do envio, que nao e a do reprocessamento: um preco de tres
  // semanas atras parece atual na tela sem ela.
  const listaArquivos = await guardarArquivosOriginais(fonte.dominio, guardar);
  const listaEnviadaEm = new Date();

  await prisma.fonteColeta.update({
    where: { id: fonte.id },
    data: { listaArquivos, listaEnviadaEm },
  });

  revalidatePath("/mercados/fontes");
  return {
    ok: true,
    manifesto: { arquivos: listaArquivos, enviadoEm: listaEnviadaEm.toISOString() },
  };
}

/**
 * Guarda a anotacao do operador sobre como obter a lista desta fonte.
 *
 * E conhecimento que hoje mora na cabeca de quem faz — a Fortek exige entrar no
 * portal e salvar a pagina, a Nightech manda a planilha por e-mail — e some
 * quando outra pessoa assume a tarefa.
 */
export async function salvarInstrucoes(fonteId, texto) {
  const limpo = String(texto ?? "").trim().slice(0, 4000);

  await prisma.fonteColeta.update({
    where: { id: fonteId },
    // Vazio vira null, e nao string vazia: a tela pergunta "tem anotacao?", e
    // "" responderia que sim.
    data: { instrucoes: limpo || null },
  });

  revalidatePath("/mercados/fontes");
  return { ok: true };
}

/** Descarta a lista guardada, para a fonte voltar a ser varrida pelo site. */
export async function apagarArquivosAcao(fonteId) {
  const fonte = await prisma.fonteColeta.findUnique({ where: { id: fonteId } });
  if (!fonte) return { ok: false, erro: "Fonte nao encontrada." };

  // Descarta so os arquivos. Os produtos que vieram da lista continuam no banco:
  // apagar custaria codigo, descricao e fotos por causa de uma lista trocada.
  await apagarArquivosOriginais(fonte.dominio);
  await prisma.fonteColeta.update({
    where: { id: fonte.id },
    data: { listaArquivos: Prisma.DbNull, listaEnviadaEm: null },
  });
  revalidatePath("/mercados/fontes");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Detalhe do produto coletado
// ---------------------------------------------------------------------------

/**
 * O detalhe de um produto coletado, buscado no clique da linha.
 *
 * Nao vem junto com a listagem: descricao, ficha e galeria somam alguns KB por
 * produto — na Fortek, fotos em base64 —, e trazer isso para cem linhas seria
 * quase tudo nunca lido.
 */
export async function detalhePagina(id) {
  const detalhe = await detalheDoProduto(id);
  if (!detalhe) return null;

  const { produto } = detalhe;

  return {
    id: detalhe.id,
    url: produto.url,
    titulo: produto.name,
    descricao: produto.description,
    marca: produto.brand,
    modelo: produto.model,
    mpn: produto.mpn,
    skuFonte: produto.code,
    ean: produto.ean,
    categoria: produto.category,
    ncm: produto.ncm,
    // Como o concorrente se apresenta ao buscador. E o texto que disputa a
    // posicao com o nosso anuncio, entao vale ver o conteudo, e nao so saber
    // que ele existe.
    seo: produto.seo ?? null,
    precoComImpostos: produto.prices?.comImpostos ?? null,
    // O preco do que ainda vai chegar. Medido na Fortek: o 65-276 custa 79,90
    // na reserva e 82,90 na pronta entrega — num campo so essa inversao sumiria.
    precoReserva: produto.prices?.reserva ?? null,
    taxes: produto.taxes ?? [],
    // Pronta entrega e o que ja da para despachar; a chegar e o que esta
    // comprado e em transito. NUNCA somados — um numero so prometeria entrega
    // que nao existe.
    quantidade:
      typeof produto.stock?.quantity === "number" ? produto.stock.quantity : null,
    aChegar: typeof produto.stock?.aChegar === "number" ? produto.stock.aChegar : null,
    semEstoque: produto.stock?.status === "OUT_OF_STOCK",
    // Os dois nomes do mesmo fato: o raspador grava AVAILABLE, os leitores de
    // arquivo IN_STOCK. A lista ja aceitava os dois; o painel so o primeiro.
    estoqueConhecido: ["AVAILABLE", "IN_STOCK"].includes(produto.stock?.status),
    // LISTA ORDENADA, nao objeto: a ficha tem linha sem rotulo, que objeto
    // nenhum comporta sem inventar uma chave.
    especificacoes: produto.specifications ?? [],
    documentos: produto.documentos ?? [],
    imagens: Array.isArray(produto.images) ? produto.images : [],
    precoAtual: produto.prices?.normal ?? null,
    precoPromocional: produto.prices?.promotional ?? null,
    disponivel: produto.stock?.status !== "OUT_OF_STOCK",
    vistoEm: detalhe.vistoEm,
    erro: null,
    fonte: detalhe.fonte,
    // Da serie de preco: o ultimo preco DIFERENTE do atual, e quando mudou.
    // Produto com uma coleta so nao tem anterior, e a seta nao aparece — nao se
    // inventa movimento sem base.
    precoAnterior: detalhe.precoAnterior,
    mudouEm: detalhe.mudouEm,
    origens: produto.origens ?? null,
    // Regras de compra do fornecedor, com caixa propria (nao sao caracteristica).
    precosPorQuantidade: produto.precosPorQuantidade ?? [],
    multiploVenda: produto.multiploVenda ?? null,
  };
}

// ---------------------------------------------------------------------------
// Varredura: enfileira e acompanha. Quem varre e o worker (scripts/worker.js).
// ---------------------------------------------------------------------------

/**
 * Poe na fila as fontes pedidas (uma, ou todas as ativas).
 *
 * Fonte que ja esta na fila fica de fora, e as outras entram: com o worker
 * varrendo tres lojas ao mesmo tempo, uma varredura em andamento nao e motivo para
 * recusar as demais. Quem garante que a mesma loja nao entra duas vezes e o banco
 * (indice "Job_fonte_aberta"), e nao esta conferencia — cinco cliques seguidos
 * continuam sendo uma varredura so.
 */
export async function atualizarTabelas(fonteId) {
  const fontes = await prisma.fonteColeta.findMany({
    where: fonteId ? { id: fonteId } : { ativa: true, robotsPermite: true },
    select: { id: true, nome: true },
  });

  if (fontes.length === 0) {
    // Dizer so "nenhuma fonte ativa" mandava o operador procurar o que fazer.
    // Fonte pausada e o caso comum aqui, e o botao de retomar esta na mesma
    // tela, uma linha abaixo.
    const pausadas = await prisma.fonteColeta.count({ where: { ativa: false } });

    return {
      ok: false,
      erro: pausadas
        ? `Nenhuma fonte ativa. ${pausadas} esta(o) pausada(s) — use "Retomar" na linha da fonte.`
        : "Nenhuma fonte cadastrada para varrer.",
    };
  }

  const enfileiradas = await enfileirar(fontes);

  revalidatePath("/mercados");
  if (enfileiradas === 0) {
    return { ok: false, erro: "Ja ha uma varredura em andamento." };
  }
  return { ok: true, enfileiradas };
}

export async function situacaoVarredura() {
  const agora = Date.now();
  const [jobs, worker, ultimoJob] = await Promise.all([
    prisma.job.findMany({
      where: { tipo: "coleta", status: { in: ["PENDENTE", "PROCESSANDO"] } },
      orderBy: { criadoEm: "asc" },
    }),
    /*
      HA QUEM ATENDA A FILA? Pergunta ao registro do worker, que da sinal por
      relogio a cada 15 s.

      Antes a tela deduzia isso da idade dos jobs, e errou para os dois lados: com
      o worker varrendo uma loja lenta, mandou rodar `npm run worker` (o que subiria
      um segundo processo); com um job largado "em andamento", calou o aviso por
      treze dias.
    */
    workerNoAr(agora),
    // A ULTIMA VARREDURA TERMINADA, pela hora em que TERMINOU: um job devolvido a
    // fila depois de dias largado terminava agora e a tela anunciava como "ultima"
    // uma varredura de horas antes.
    prisma.job.findFirst({
      where: { tipo: "coleta", status: { in: ["CONCLUIDO", "FALHOU"] } },
      orderBy: { atualizadoEm: "desc" },
    }),
  ]);

  const semWorker = !worker && jobs.length > 0;

  return {
    emAndamento: jobs.length > 0,
    semWorker,
    worker: worker ? { paralelo: worker.paralelo, iniciadoEm: worker.iniciadoEm.getTime() } : null,
    jobs: jobs.map((job) => ({
      id: job.id,
      status: job.status,
      fonteNome: job.payload?.fonteNome ?? "?",
      total: job.payload?.total ?? 0,
      feitas: job.payload?.feitas ?? 0,
      visitadas: job.payload?.visitadas ?? 0,
      // Ja gravados antes de uma interrupcao, contados sem reabrir a pagina.
      retomados: job.payload?.retomados ?? 0,
      // Medido pelo worker entre produtos NOVOS desta passada.
      segundosPorProduto: job.payload?.segundosPorProduto ?? null,
      // Largado por worker que parou de dar sinal: a tela nao o mostra como
      // varredura em curso, e o worker o devolve a fila em ate dois minutos.
      largado: jobLargado(job, agora),
      iniciadoEm: job.iniciadoEm?.getTime() ?? null,
      // Tentativa anterior que falhou: o motivo aparece enquanto espera a vez.
      erro: job.status === "PENDENTE" ? job.erro : null,
      tentativas: job.tentativas,
    })),
    ultimo: ultimoJob
      ? {
          fonteNome: ultimoJob.payload?.fonteNome ?? "?",
          status: ultimoJob.status,
          produtos: ultimoJob.payload?.produtos ?? null,
          erro: ultimoJob.erro ?? null,
        }
      : null,
  };
}
