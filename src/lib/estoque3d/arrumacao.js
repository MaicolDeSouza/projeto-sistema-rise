/**
 * Regras de arrumacao do Mapa do estoque, fase 2 (spec 2026-11-12-enderecamento-de-estoque-design.md, secao 11). Puras: leem a
 * cena que `montarMapa` montou e nao tocam no banco.
 *
 * As tres regras do dono (12/11/2026): o pesado embaixo, parecidos nunca vizinhos (para ninguem pegar a peca errada) e a
 * caixinha que cabe no vao. Valem nos estoques com `aplicaRegras` (2 e 3); o Estoque 1 fica como esta e so ganha o aviso de
 * "nao cabe".
 */

import { PADRAO, menorCaixinha, montarMapa, pesoDaCaixinhaCheia, textoDaLocalizacao } from "./regras";

/** Os limites das regras, num lugar so para ajustar depois de ver o estoque de verdade. */
export const LIMITES = Object.freeze({
  /** Semelhanca de nome (trigramas, 0 a 1) a partir da qual dois produtos sem familia contam como parecidos. */
  nomeParecido: 0.45,
  /** "Pesado em cima": a de cima pesa ao menos isto a mais que a de baixo... */
  diferencaDePesoKg: 1,
  /** ...e a de baixo pesa menos que esta fracao da de cima. */
  fracaoDoPeso: 0.5,
  /** Abaixo disto a caixinha e "leve" e a sugestao a prefere nas prateleiras de cima. */
  leveKg: 0.5,
});

/** Palavras que todo nome tem e que nao dizem o que a peca e: sem tira-las, "Modulo X" e "Modulo Y" seriam parecidos. */
const GENERICAS = new Set(
  "modulo modulos kit com para de do da dos das e em sem tipo placa compativel arduino unidade unidades pecas peca pcs un x".split(" "),
);

const normalizar = (texto) =>
  String(texto ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((palavra) => palavra && !GENERICAS.has(palavra));

function trigramas(texto) {
  const conjunto = new Set();
  for (const palavra of normalizar(texto)) {
    const comBorda = `  ${palavra} `;
    for (let i = 0; i < comBorda.length - 2; i++) conjunto.add(comBorda.slice(i, i + 3));
  }
  return conjunto;
}

/** Semelhanca de dois nomes, 0 a 1 (a mesma ideia do pg_trgm: trigramas em comum sobre o total). */
export function semelhancaDeNome(a, b) {
  const x = trigramas(a);
  const y = trigramas(b);
  if (!x.size || !y.size) return 0;
  let comuns = 0;
  for (const trigrama of x) if (y.has(trigrama)) comuns++;
  return comuns / (x.size + y.size - comuns);
}

/**
 * Dois produtos sao "parecidos" (nao podem ser vizinhos) quando sao da mesma familia da arvore de categorias do dono, ou,
 * quando a familia nao diz (produto sem familia), quando o nome e semelhante. O mesmo codigo nunca e parecido de si mesmo.
 * @returns {string|null} o motivo, ou null.
 */
export function motivoDeParecidos(a, b, limites = LIMITES) {
  if (!a || !b || a.produtoId === b.produtoId) return null;
  if (a.familia && b.familia) return a.familia === b.familia ? `mesma família (${a.familia.split(" > ").at(-1)})` : null;
  return semelhancaDeNome(a.nome, b.nome) >= limites.nomeParecido ? "nome parecido" : null;
}

/** "1,5 kg": o peso como a tela escreve. */
const kg = (valor) => `${Number(valor).toLocaleString("pt-BR", { maximumFractionDigits: 3 })} kg`;

const sobrepoe = (a, b) => a.xCm < b.xCm + b.larguraCm - 0.01 && b.xCm < a.xCm + a.larguraCm - 0.01;

/**
 * Os vizinhos de cada caixinha numa coluna: a da esquerda e a da direita na mesma prateleira, e as das prateleiras logo
 * acima e logo abaixo que ficam na mesma faixa da largura.
 */
function vizinhosDaColuna(coluna) {
  const porNivel = new Map(coluna.prateleiras.map((prateleira) => [prateleira.nivel, prateleira]));
  const pares = [];
  for (const prateleira of coluna.prateleiras) {
    prateleira.caixinhas.forEach((caixinha, indice) => {
      const direita = prateleira.caixinhas[indice + 1];
      if (direita) pares.push([caixinha, direita, "ao lado"]);
      const deCima = porNivel.get(prateleira.nivel + 1);
      for (const outra of deCima?.caixinhas ?? []) if (sobrepoe(caixinha, outra)) pares.push([caixinha, outra, "em cima"]);
    });
  }
  return pares;
}

/**
 * Os avisos de cada caixinha de um estoque: `{ [produtoId]: [{ tipo, texto }] }`. Tipos: "parecido", "pesado" e "naoCabe".
 * Sem `aplicaRegras` (o Estoque 1), so "naoCabe".
 */
export function avisosDoLocal(local, limites = LIMITES) {
  const avisos = new Map();
  const anotar = (caixinha, tipo, texto) => {
    if (!avisos.has(caixinha.produtoId)) avisos.set(caixinha.produtoId, []);
    const lista = avisos.get(caixinha.produtoId);
    if (!lista.some((aviso) => aviso.texto === texto)) lista.push({ tipo, texto });
  };
  for (const coluna of local.colunas) {
    for (const prateleira of coluna.prateleiras) {
      for (const caixinha of prateleira.caixinhas) {
        if (prateleira.excedeCm > 0) anotar(caixinha, "naoCabe", `A prateleira ${prateleira.codigo} passa ${prateleira.excedeCm} cm do vão.`);
        if (caixinha.modelo && caixinha.alturaCm > coluna.alturaLivreCm) anotar(caixinha, "naoCabe", `A caixinha é mais alta que a prateleira ${prateleira.codigo}.`);
      }
      if (coluna.pesoMaximoKg && prateleira.pesoKg > coluna.pesoMaximoKg) {
        for (const caixinha of prateleira.caixinhas) anotar(caixinha, "naoCabe", `A prateleira ${prateleira.codigo} passa do peso máximo (${kg(prateleira.pesoKg)} de ${kg(coluna.pesoMaximoKg)}).`);
      }
    }
    if (!local.aplicaRegras) continue;

    for (const [a, b, onde] of vizinhosDaColuna(coluna)) {
      const motivo = motivoDeParecidos(a, b, limites);
      if (!motivo) continue;
      anotar(a, "parecido", `Parecido com ${b.sku} ${onde === "ao lado" ? "ao lado" : "na prateleira de cima"} (${motivo}).`);
      anotar(b, "parecido", `Parecido com ${a.sku} ${onde === "ao lado" ? "ao lado" : "na prateleira de baixo"} (${motivo}).`);
    }

    const todas = coluna.prateleiras.flatMap((prateleira) => prateleira.caixinhas.map((caixinha) => ({ caixinha, nivel: prateleira.nivel, codigo: prateleira.codigo })));
    for (const cima of todas) {
      if (!cima.caixinha.pesoCheiaKg) continue;
      const maisLeveEmbaixo = todas
        .filter((baixo) => baixo.nivel < cima.nivel && baixo.caixinha.pesoCheiaKg !== null && pesadoEmCima(cima.caixinha.pesoCheiaKg, baixo.caixinha.pesoCheiaKg, limites))
        .sort((x, y) => x.caixinha.pesoCheiaKg - y.caixinha.pesoCheiaKg)[0];
      if (maisLeveEmbaixo) anotar(cima.caixinha, "pesado", `Pesada (${kg(cima.caixinha.pesoCheiaKg)}) acima de ${maisLeveEmbaixo.caixinha.sku} em ${maisLeveEmbaixo.codigo} (${kg(maisLeveEmbaixo.caixinha.pesoCheiaKg)}).`);
    }
  }
  return Object.fromEntries(avisos);
}

const pesadoEmCima = (deCima, deBaixo, limites) => deCima - deBaixo >= limites.diferencaDePesoKg && deBaixo < deCima * limites.fracaoDoPeso;

/** A cena com os avisos das regras dentro de cada caixinha (`alertas`) e somados aos avisos de sempre (`avisos`). */
export function montarMapaComAvisos(dados, limites = LIMITES) {
  const mapa = montarMapa(dados);
  for (const local of mapa.locais) {
    const avisos = avisosDoLocal(local, limites);
    let foraDaRegra = 0;
    for (const coluna of local.colunas) {
      for (const prateleira of coluna.prateleiras) {
        for (const caixinha of prateleira.caixinhas) {
          caixinha.alertas = avisos[caixinha.produtoId] ?? [];
          if (caixinha.alertas.length) foraDaRegra++;
          caixinha.avisos = [...caixinha.avisos, ...caixinha.alertas.map((alerta) => alerta.texto)];
        }
      }
    }
    local.foraDaRegra = foraDaRegra;
  }
  return mapa;
}

/**
 * O estoque como fica DEPOIS de o produto sair do lugar de hoje: as caixinhas da prateleira dele andam para a esquerda. Sem
 * isso a sugestao conferia os vizinhos de cima e de baixo com as posicoes antigas (achado na tela em 12/11/2026: o resistor
 * sugerido em ZK1 ficou em cima do outro resistor, que tinha deslizado em ZK2).
 */
function semOProduto(local, produtoId) {
  return {
    ...local,
    colunas: local.colunas.map((coluna) => ({
      ...coluna,
      prateleiras: coluna.prateleiras.map((prateleira) => {
        if (!prateleira.caixinhas.some((caixinha) => caixinha.produtoId === produtoId)) return prateleira;
        let x = 0;
        const caixinhas = prateleira.caixinhas
          .filter((caixinha) => caixinha.produtoId !== produtoId)
          .map((caixinha) => {
            const movida = { ...caixinha, xCm: x };
            x += caixinha.larguraCm;
            return movida;
          });
        return { ...prateleira, caixinhas, ocupadoCm: x };
      }),
    })),
  };
}

/** A caixinha que o produto usaria no lugar novo: a dele se cabe o que precisa guardar; senao, a menor que cabe. */
function caixinhaParaGuardar(produto, modelos) {
  const atual = modelos.find((modelo) => modelo.id === produto.modeloCaixinhaId) ?? null;
  const sugerida = menorCaixinha(modelos, produto);
  if (atual && (!sugerida || sugerida.modelo.id === atual.id || !sugerida.cabe)) return atual;
  return sugerida?.modelo ?? atual;
}

/**
 * Onde guardar o produto num estoque: as `limite` melhores posicoes (coluna, prateleira e posicao na prateleira) em que a
 * caixinha cabe sem deixar um parecido vizinho e sem pesado em cima de leve. O pesado vai o mais baixo possivel e o leve em
 * cima; no empate, a prateleira que fica mais cheia (aproveita o espaco) e a ordem das colunas.
 *
 * @param {object} local o estoque, ja montado por `montarMapa` (sem o produto, ou com ele: ele e ignorado no lugar atual)
 * @param {object} produto { id, sku, nome, familiaEstoque, pesoKg, estoque, estoqueMaximo, medidas, modeloCaixinhaId }
 * @returns {{ sugestoes: object[], modelo: object|null, motivo: string|null }}
 */
export function sugerirLugar(localComOProduto, produto, modelos = [], { limite = 3, limites = LIMITES } = {}) {
  const local = semOProduto(localComOProduto, produto.id);
  const modelo = caixinhaParaGuardar(produto, modelos);
  const largura = Number(modelo?.larguraCm) || PADRAO.caixinha.larguraCm;
  const altura = Number(modelo?.alturaCm) || PADRAO.caixinha.alturaCm;
  const pesoCheia = pesoDaCaixinhaCheia(produto, modelo);
  const nova = { produtoId: produto.id, sku: produto.sku, nome: produto.nome, familia: produto.familiaEstoque ?? null, pesoCheiaKg: pesoCheia, larguraCm: largura };
  const candidatas = [];

  for (const coluna of local.colunas) {
    if (!coluna.medida) continue;
    const porNivel = new Map(coluna.prateleiras.map((prateleira) => [prateleira.nivel, prateleira]));
    const outrasDaColuna = coluna.prateleiras.flatMap((prateleira) => prateleira.caixinhas.filter((c) => c.produtoId !== produto.id).map((caixinha) => ({ caixinha, nivel: prateleira.nivel })));
    for (const prateleira of coluna.prateleiras) {
      const ficam = prateleira.caixinhas.filter((caixinha) => caixinha.produtoId !== produto.id);
      const ocupado = ficam.reduce((soma, caixinha) => soma + caixinha.larguraCm, 0);
      if (ocupado + largura > coluna.larguraCm + 0.01) continue;
      if (altura > coluna.alturaLivreCm) continue;
      const pesoNaPrateleira = ficam.reduce((soma, caixinha) => soma + (caixinha.pesoKg ?? 0), 0) + (pesoCheia ?? 0);
      if (coluna.pesoMaximoKg && pesoNaPrateleira > coluna.pesoMaximoKg) continue;

      // Pesado em cima de leve (ou leve embaixo de pesado), contra toda a coluna.
      const quebraPeso =
        pesoCheia !== null &&
        outrasDaColuna.some(
          ({ caixinha, nivel }) =>
            caixinha.pesoCheiaKg !== null &&
            ((nivel < prateleira.nivel && pesadoEmCima(pesoCheia, caixinha.pesoCheiaKg, limites)) || (nivel > prateleira.nivel && pesadoEmCima(caixinha.pesoCheiaKg, pesoCheia, limites))),
        );

      for (let indice = 0; indice <= ficam.length; indice++) {
        const x = ficam.slice(0, indice).reduce((soma, caixinha) => soma + caixinha.larguraCm, 0);
        const aqui = { ...nova, xCm: x };
        const vizinhas = [ficam[indice - 1], ficam[indice]].filter(Boolean);
        for (const nivel of [prateleira.nivel - 1, prateleira.nivel + 1]) {
          for (const outra of porNivel.get(nivel)?.caixinhas ?? []) if (outra.produtoId !== produto.id && sobrepoe(aqui, outra)) vizinhas.push(outra);
        }
        const parecida = vizinhas.find((outra) => motivoDeParecidos(nova, outra, limites));
        if (parecida || quebraPeso) continue;
        const ocupacao = (ocupado + largura) / coluna.larguraCm;
        const leve = pesoCheia === null || pesoCheia < limites.leveKg;
        // O pesado quer o nivel mais baixo; o leve, o mais alto. O peso desconhecido conta como leve.
        // A altura vem antes do aproveitamento (cada nivel vale mais que uma prateleira inteira de ocupacao): a regra do dono
        // e o pesado embaixo, e o espaco so desempata.
        const pontos = leve ? (local.maiorNivel - prateleira.nivel) * 1.5 - ocupacao : ((pesoCheia ?? 0) + 1) * prateleira.nivel * 1.5 - ocupacao;
        candidatas.push({
          pontos,
          ordemDaColuna: coluna.ordem,
          localId: local.id,
          letra: coluna.letra,
          prateleira: prateleira.numero,
          posicao: indice + 1,
          codigo: textoDaLocalizacao(coluna.letra, prateleira.numero),
          motivos: [
            leve ? (pesoCheia === null ? "sem peso no cadastro" : `leve (${kg(pesoCheia)})`) : `pesada (${kg(pesoCheia)}): fica embaixo`,
            vizinhas.length ? "nenhum vizinho parecido" : "sem vizinhos",
            `prateleira fica ${Math.round(ocupacao * 100)}% ocupada`,
          ],
        });
      }
    }
  }

  candidatas.sort((a, b) => a.pontos - b.pontos || a.ordemDaColuna - b.ordemDaColuna || a.prateleira - b.prateleira || a.posicao - b.posicao);
  // Uma sugestao por prateleira: tres posicoes da mesma prateleira nao sao tres escolhas.
  const vistas = new Set();
  const sugestoes = [];
  for (const candidata of candidatas) {
    if (vistas.has(candidata.codigo)) continue;
    vistas.add(candidata.codigo);
    const { pontos: _pontos, ordemDaColuna: _ordem, ...sugestao } = candidata;
    sugestoes.push(sugestao);
    if (sugestoes.length === limite) break;
  }
  const semMedida = local.colunas.length > 0 && local.colunas.every((coluna) => !coluna.medida);
  const motivo = sugestoes.length
    ? null
    : !local.colunas.length
      ? `O ${local.nome} ainda não tem colunas.`
      : semMedida
        ? `As colunas do ${local.nome} ainda não têm a largura do vão.`
        : `Não há lugar no ${local.nome} que siga as regras.`;
  return { sugestoes, modelo: modelo ? { id: modelo.id, nome: modelo.nome } : null, motivo };
}
