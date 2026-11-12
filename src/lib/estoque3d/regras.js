/**
 * Regras puras do Mapa do estoque (spec 2026-11-12-enderecamento-de-estoque-design.md). Sem imports: o teste roda sem
 * banco e a tela (cliente) usa as mesmas contas.
 *
 * O lugar do produto e a `localizacao` do cadastro ("M2" = coluna M, prateleira 2). Aqui se le esse texto, se estima
 * quantas pecas cabem na caixinha e se monta a cena (em cm) que o 3D e a vista de frente desenham.
 */

/** Medidas usadas no desenho enquanto o dono nao mede o vao nem escolhe a caixinha. So desenho: nenhuma conta de "cabe". */
export const PADRAO = Object.freeze({
  larguraDoVaoCm: 90,
  profundidadeDoVaoCm: 40,
  alturaLivreCm: 20,
  espessuraCm: 3,
  caixinha: Object.freeze({ larguraCm: 15, alturaCm: 11, profundidadeCm: 25 }),
  corSemModelo: "#8a94a3",
});

/** Enquanto o dono nao diz onde cada coluna fica, o desenho as poe em filas deste tamanho, com um corredor entre elas. */
export const COLUNAS_POR_FILA = 8;
const CORREDOR_CM = 120;

/** Folga da peca solta dentro da caixinha: nao se enche ate a borda nem se encaixa peca a peca. */
export const FOLGA_DAS_PECAS = 0.85;

const numero = (valor) => {
  const lido = Number(valor);
  return Number.isFinite(lido) && lido > 0 ? lido : null;
};

/**
 * "M2", "m 2", "M-02" -> { letra: "M", numero: 2 }. So a letra ("X") -> numero null (coluna sem prateleira dita).
 * Qualquer outra coisa ("CHAO", vazio) -> null: o produto fica fora das prateleiras.
 */
export function lerLocalizacao(texto) {
  const limpo = String(texto ?? "").trim().toUpperCase();
  if (!limpo) return null;
  const comNumero = /^([A-Z]{1,2})[ -]?([0-9]{1,2})$/.exec(limpo);
  if (comNumero) return { letra: comNumero[1], numero: Number(comNumero[2]) };
  if (/^[A-Z]{1,2}$/.test(limpo)) return { letra: limpo, numero: null };
  return null;
}

/** O texto da localizacao de uma coluna + prateleira (o que se grava no produto e vai ao Bling). */
export function textoDaLocalizacao(letra, prateleira) {
  const coluna = String(letra ?? "").trim().toUpperCase();
  if (!coluna) return null;
  return prateleira ? `${coluna}${Number(prateleira)}` : coluna;
}

/** As tres medidas da caixinha (de fora), ou null se faltar alguma. */
function medidasDaCaixinha(modelo) {
  const largura = numero(modelo?.larguraCm);
  const altura = numero(modelo?.alturaCm);
  const profundidade = numero(modelo?.profundidadeCm);
  return largura && altura && profundidade ? { largura, altura, profundidade } : null;
}

/** As tres medidas da PECA (as de envio do cadastro), ou null se faltar alguma. */
function medidasDaPeca(produto) {
  const largura = numero(produto?.larguraCm);
  const altura = numero(produto?.alturaCm);
  const comprimento = numero(produto?.comprimentoCm);
  return largura && altura && comprimento ? [largura, altura, comprimento] : null;
}

/**
 * Quantas pecas cabem na caixinha, ESTIMADO: volume util da caixinha (afunilada: `fatorUtil`) com a folga da peca solta,
 * dividido pelo volume da peca. A peca precisa PASSAR na caixinha em alguma rotacao (a maior medida dela na maior da
 * caixinha, e assim por diante); senao e 0.
 * @returns {{ pecas: number|null, motivo: string|null }} pecas null = sem como estimar (motivo diz o que falta).
 */
export function pecasQueCabem(modelo, produto) {
  const caixinha = medidasDaCaixinha(modelo);
  if (!caixinha) return { pecas: null, motivo: "Caixinha sem medidas." };
  const peca = medidasDaPeca(produto);
  if (!peca) return { pecas: null, motivo: "Produto sem medidas no cadastro." };
  const daCaixinha = [caixinha.largura, caixinha.altura, caixinha.profundidade].sort((a, b) => b - a);
  const daPeca = [...peca].sort((a, b) => b - a);
  if (daPeca.some((medida, indice) => medida > daCaixinha[indice])) return { pecas: 0, motivo: "A peça não entra nesta caixinha." };
  const fator = numero(modelo?.fatorUtil) ?? 0.7;
  const volumeUtil = caixinha.largura * caixinha.altura * caixinha.profundidade * Math.min(fator, 1) * FOLGA_DAS_PECAS;
  const volumeDaPeca = peca[0] * peca[1] * peca[2];
  // A peca que passa cabe ao menos uma vez, mesmo quando o volume util (com as folgas) da menos de 1.
  return { pecas: Math.max(1, Math.floor(volumeUtil / volumeDaPeca + 1e-9)), motivo: null };
}

/**
 * A capacidade que VALE para o produto na caixinha: o numero digitado pelo dono vence a estimativa.
 * @returns {{ pecas: number|null, origem: "digitado"|"estimado"|null, motivo: string|null }}
 */
export function capacidadeDoProduto(produto, modelo) {
  const digitado = Number(produto?.pecasPorCaixinha);
  if (Number.isInteger(digitado) && digitado > 0) return { pecas: digitado, origem: "digitado", motivo: null };
  const estimativa = pecasQueCabem(modelo, produto);
  return { pecas: estimativa.pecas, origem: estimativa.pecas === null ? null : "estimado", motivo: estimativa.motivo };
}

/** Quanto o produto precisa guardar: o estoque maximo; na falta dele, o estoque de hoje. */
export function quantidadeAGuardar(produto) {
  const maximo = Number(produto?.estoqueMaximo);
  if (Number.isFinite(maximo) && maximo > 0) return maximo;
  return Math.max(0, Number(produto?.estoque) || 0);
}

/**
 * A caixinha certa para o produto: o MENOR modelo (em volume) em que cabe o que ele precisa guardar. Uma caixinha por
 * codigo (decisao do dono): nao coube em nenhuma, devolve a maior com `cabe: false`.
 * @returns {{ modelo: object, pecas: number, cabe: boolean }|null} null = sem modelo ou sem medida para estimar.
 */
export function menorCaixinha(modelos, produto) {
  const precisa = quantidadeAGuardar(produto);
  const candidatos = (modelos ?? [])
    .filter((modelo) => modelo?.ativo !== false)
    .map((modelo) => ({ modelo, medidas: medidasDaCaixinha(modelo), pecas: pecasQueCabem(modelo, produto).pecas }))
    .filter((item) => item.medidas && item.pecas !== null)
    .sort((a, b) => a.medidas.largura * a.medidas.altura * a.medidas.profundidade - b.medidas.largura * b.medidas.altura * b.medidas.profundidade);
  if (!candidatos.length) return null;
  const serve = candidatos.find((item) => item.pecas >= precisa && item.pecas > 0);
  const escolhido = serve ?? candidatos[candidatos.length - 1];
  return { modelo: escolhido.modelo, pecas: escolhido.pecas, cabe: Boolean(serve) };
}

/** Peso da caixinha cheia com o estoque de hoje (peso da peca x estoque + a caixinha vazia), em kg. null sem peso. */
export function pesoDaCaixinha(produto, modelo) {
  const daPeca = numero(produto?.pesoKg);
  if (!daPeca) return null;
  const pecas = Math.max(0, Number(produto?.estoque) || 0);
  return Math.round((daPeca * pecas + (numero(modelo?.pesoVazioKg) ?? 0)) * 1000) / 1000;
}

/** O nivel (0 = o de baixo) de uma prateleira numerada, conforme o estoque conta de baixo ou de cima. */
export function nivelDaPrateleira(numeroDaPrateleira, prateleiras, primeiraEmbaixo) {
  return primeiraEmbaixo ? numeroDaPrateleira - 1 : prateleiras - numeroDaPrateleira;
}

function ordenarCaixinhas(a, b) {
  const ordemA = a.ordemNaPrateleira ?? Number.MAX_SAFE_INTEGER;
  const ordemB = b.ordemNaPrateleira ?? Number.MAX_SAFE_INTEGER;
  return ordemA - ordemB || String(a.sku).localeCompare(String(b.sku), "pt-BR", { numeric: true });
}

/**
 * Poe as caixinhas de UMA prateleira lado a lado, da esquerda para a direita. Com modelo, a largura e a de verdade e o
 * que passa do vao e avisado; sem modelo, o desenho divide o vao (esquematico, sem aviso de largura).
 */
function disporNaPrateleira(produtos, larguraDoVao, modelosPorId) {
  const ordenados = [...produtos].sort(ordenarCaixinhas);
  const semModelo = ordenados.filter((produto) => !modelosPorId.get(produto.modeloCaixinhaId)).length;
  const ocupadoPorModelo = ordenados.reduce((soma, produto) => soma + (numero(modelosPorId.get(produto.modeloCaixinhaId)?.larguraCm) ?? 0), 0);
  const sobra = Math.max(0, larguraDoVao - ocupadoPorModelo);
  const larguraSemModelo = semModelo ? Math.min(PADRAO.caixinha.larguraCm, sobra / semModelo || PADRAO.caixinha.larguraCm) : 0;
  let x = 0;
  const caixinhas = ordenados.map((produto, indice) => {
    const modelo = modelosPorId.get(produto.modeloCaixinhaId) ?? null;
    const largura = numero(modelo?.larguraCm) ?? Math.max(2, larguraSemModelo);
    const capacidade = capacidadeDoProduto(produto, modelo);
    const estoque = Math.max(0, Number(produto.estoque) || 0);
    const avisos = [];
    if (!modelo) avisos.push("Sem modelo de caixinha.");
    else if (capacidade.pecas === null) avisos.push(capacidade.motivo);
    else if (estoque > capacidade.pecas) avisos.push(`Estoque (${estoque}) maior que o que cabe (${capacidade.pecas}): caixinha maior.`);
    const caixinha = {
      produtoId: produto.id,
      sku: produto.sku,
      nome: produto.nome,
      foto: produto.foto ?? null,
      estoque,
      posicao: indice + 1,
      xCm: Math.round(x * 100) / 100,
      larguraCm: largura,
      alturaCm: numero(modelo?.alturaCm) ?? PADRAO.caixinha.alturaCm,
      profundidadeCm: numero(modelo?.profundidadeCm) ?? PADRAO.caixinha.profundidadeCm,
      cor: modelo?.cor ?? PADRAO.corSemModelo,
      modelo: modelo?.nome ?? null,
      capacidade: capacidade.pecas,
      origemDaCapacidade: capacidade.origem,
      pesoKg: pesoDaCaixinha(produto, modelo),
      avisos,
    };
    x += largura;
    return caixinha;
  });
  const ocupado = Math.round(x * 100) / 100;
  return { caixinhas, ocupadoCm: ocupado, excedeCm: semModelo === ordenados.length ? 0 : Math.max(0, Math.round((ocupado - larguraDoVao) * 100) / 100) };
}

/**
 * A cena inteira: cada estoque com as colunas (em fila pela ordem, ou onde o cadastro diz), cada coluna com as prateleiras
 * (nivel 0 = a de baixo) e as caixinhas ja posicionadas, mais o que esta FORA das prateleiras. Tudo em cm.
 *
 * @param {{ locais: object[], colunas: object[], modelos: object[], produtos: object[] }} dados produtos = { id, sku, nome,
 *   localizacao, estoque, estoqueMaximo, pesoKg, larguraCm, alturaCm, comprimentoCm, modeloCaixinhaId, pecasPorCaixinha,
 *   ordemNaPrateleira, foto }
 * @returns {{ locais: object[], semColuna: { letra: string, produtos: number }[] }} `semColuna` = letras usadas na
 *   localizacao que ainda nao tem coluna cadastrada (o botao "Criar colunas pela Localização" as cria).
 */
export function montarMapa({ locais = [], colunas = [], modelos = [], produtos = [] }) {
  const modelosPorId = new Map(modelos.map((modelo) => [modelo.id, modelo]));
  const colunaPorLetra = new Map(colunas.map((coluna) => [String(coluna.letra).toUpperCase(), coluna]));
  const porColuna = new Map();
  const foraPorLocal = new Map();
  const semColuna = new Map();
  const semLugar = [];

  for (const produto of produtos) {
    const lida = lerLocalizacao(produto.localizacao);
    const coluna = lida ? colunaPorLetra.get(lida.letra) : null;
    if (!lida) {
      if (String(produto.localizacao ?? "").trim()) semLugar.push(produto);
      continue;
    }
    if (!coluna) {
      semColuna.set(lida.letra, (semColuna.get(lida.letra) ?? 0) + 1);
      continue;
    }
    if (lida.numero === null || lida.numero < 1) {
      if (!foraPorLocal.has(coluna.localId)) foraPorLocal.set(coluna.localId, []);
      foraPorLocal.get(coluna.localId).push(produto);
      continue;
    }
    if (!porColuna.has(coluna.id)) porColuna.set(coluna.id, new Map());
    const prateleiras = porColuna.get(coluna.id);
    if (!prateleiras.has(lida.numero)) prateleiras.set(lida.numero, []);
    prateleiras.get(lida.numero).push(produto);
  }

  const resumoDeFora = (produto) => ({ produtoId: produto.id, sku: produto.sku, nome: produto.nome, foto: produto.foto ?? null, localizacao: String(produto.localizacao ?? "").trim(), estoque: Math.max(0, Number(produto.estoque) || 0) });

  const locaisDaCena = [...locais]
    .sort((a, b) => a.numero - b.numero)
    .map((local) => {
      let xDaFila = 0;
      let naFila = 0;
      let fila = 0;
      const colunasDoLocal = colunas
        .filter((coluna) => coluna.localId === local.id)
        .sort((a, b) => a.ordem - b.ordem || String(a.letra).localeCompare(String(b.letra)))
        .map((coluna) => {
          const ocupadas = porColuna.get(coluna.id) ?? new Map();
          // A prateleira citada numa localizacao existe, mesmo que o cadastro da coluna diga menos.
          const quantas = Math.max(Number(coluna.prateleiras) || 1, ...ocupadas.keys());
          const largura = numero(coluna.larguraCm) ?? PADRAO.larguraDoVaoCm;
          const profundidade = numero(coluna.profundidadeCm) ?? PADRAO.profundidadeDoVaoCm;
          const alturaLivre = numero(coluna.alturaLivreCm) ?? PADRAO.alturaLivreCm;
          const prateleiras = [];
          for (let numeroDaPrateleira = 1; numeroDaPrateleira <= quantas; numeroDaPrateleira++) {
            const nivel = nivelDaPrateleira(numeroDaPrateleira, quantas, local.primeiraEmbaixo);
            const disposicao = disporNaPrateleira(ocupadas.get(numeroDaPrateleira) ?? [], largura, modelosPorId);
            const pesoKg = disposicao.caixinhas.reduce((soma, caixinha) => soma + (caixinha.pesoKg ?? 0), 0);
            prateleiras.push({
              numero: numeroDaPrateleira,
              codigo: textoDaLocalizacao(coluna.letra, numeroDaPrateleira),
              nivel,
              yCm: PADRAO.espessuraCm + nivel * (alturaLivre + PADRAO.espessuraCm),
              pesoKg: Math.round(pesoKg * 1000) / 1000,
              ...disposicao,
            });
          }
          prateleiras.sort((a, b) => b.nivel - a.nivel);
          const posta = coluna.xCm !== null && coluna.xCm !== undefined && coluna.zCm !== null && coluna.zCm !== undefined;
          // Sem lugar cadastrado: filas de COLUNAS_POR_FILA, uma atras da outra com um corredor, todas de frente.
          if (!posta && naFila === COLUNAS_POR_FILA) {
            naFila = 0;
            xDaFila = 0;
            fila += 1;
          }
          const x = posta ? Number(coluna.xCm) : xDaFila;
          const z = posta ? Number(coluna.zCm) : -fila * (PADRAO.profundidadeDoVaoCm + CORREDOR_CM);
          if (!posta) {
            xDaFila += largura + PADRAO.espessuraCm;
            naFila += 1;
          }
          return {
            id: coluna.id,
            letra: coluna.letra,
            ordem: coluna.ordem,
            xCm: x,
            zCm: z,
            giroGraus: posta ? Number(coluna.giroGraus) || 0 : 0,
            larguraCm: largura,
            profundidadeCm: profundidade,
            alturaLivreCm: alturaLivre,
            alturaCm: quantas * (alturaLivre + PADRAO.espessuraCm) + PADRAO.espessuraCm,
            medida: Boolean(numero(coluna.larguraCm)),
            prateleiras,
            caixinhas: prateleiras.reduce((soma, prateleira) => soma + prateleira.caixinhas.length, 0),
          };
        });
      const fora = (foraPorLocal.get(local.id) ?? []).sort(ordenarCaixinhas).map(resumoDeFora);
      return {
        id: local.id,
        numero: local.numero,
        nome: local.nome,
        descricao: local.descricao ?? null,
        aplicaRegras: Boolean(local.aplicaRegras),
        primeiraEmbaixo: Boolean(local.primeiraEmbaixo),
        colunas: colunasDoLocal,
        fora,
        caixinhas: colunasDoLocal.reduce((soma, coluna) => soma + coluna.caixinhas, 0),
      };
    });

  return {
    locais: locaisDaCena,
    semColuna: [...semColuna.entries()].map(([letra, quantos]) => ({ letra, produtos: quantos })).sort((a, b) => a.letra.localeCompare(b.letra)),
    semLugar: semLugar.sort(ordenarCaixinhas).map(resumoDeFora),
  };
}

/**
 * As colunas que faltam criar a partir das localizacoes em uso: uma por letra, com tantas prateleiras quanto o maior
 * numero visto (minimo 1). Pura: quem grava e o banco.
 */
export function colunasPelaLocalizacao(localizacoes, letrasQueJaExistem = []) {
  const existentes = new Set(letrasQueJaExistem.map((letra) => String(letra).toUpperCase()));
  const maiores = new Map();
  for (const texto of localizacoes ?? []) {
    const lida = lerLocalizacao(texto);
    if (!lida || existentes.has(lida.letra)) continue;
    maiores.set(lida.letra, Math.max(maiores.get(lida.letra) ?? 1, lida.numero ?? 1));
  }
  return [...maiores.entries()]
    .map(([letra, prateleiras]) => ({ letra, prateleiras }))
    .sort((a, b) => a.letra.length - b.letra.length || a.letra.localeCompare(b.letra));
}
