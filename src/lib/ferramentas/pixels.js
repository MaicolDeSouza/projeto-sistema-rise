/**
 * Operacoes sobre pixels RGBA do conversor de imagem para SVG. Sem imports:
 * roda em Node puro e e testada sozinha (`npm run teste:svg`).
 *
 * Existem por dois pedidos do dono (20/09/2026) para logos:
 *  - o SVG sai com FUNDO TRANSPARENTE, mesmo quando o arquivo enviado tem fundo
 *    de uma cor so (o logo do Mercado Livre vem num quadrado amarelo);
 *  - as CORES saem EXATAS, sem campo na tela. O vtracer, sozinho, aproxima: o
 *    branco sai #FCFCFD e o amarelo #FEE500, e uma marca tem cor definida.
 */

/** Distancia RGB (euclidiana) ate a cor do fundo para um pixel contar como fundo. */
export const TOLERANCIA_FUNDO = 36;

/** Um logo raramente passa de meia duzia de cores; acima disso vira ruido. */
export const MAXIMO_CORES_DETECTADAS = 16;

const quadrado = (n) => n * n;

function distancia2(rgba, i, cor) {
  return quadrado(rgba[i] - cor[0]) + quadrado(rgba[i + 1] - cor[1]) + quadrado(rgba[i + 2] - cor[2]);
}

export function paraHex(r, g, b) {
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("").toUpperCase()}`;
}

/**
 * A imagem JA tem transparencia de verdade? Conta pixels quase transparentes:
 * um PNG opaco pode trazer alguns pixels de borda com alfa baixo, e isso nao
 * quer dizer que o fundo ja foi tirado.
 */
export function temTransparencia(rgba) {
  let claros = 0;
  for (let i = 3; i < rgba.length; i += 4) if (rgba[i] < 200) claros++;
  return claros / (rgba.length / 4) >= 0.005;
}

/**
 * Cor do fundo, se a BORDA da imagem for de uma cor so (>= 85% dos pixels da
 * borda perto da mais comum). Foto, degrade e fundo cheio de detalhe dao null:
 * nesses casos nao ha "cor de fundo" a apagar, e apagar as cegas comeria o logo.
 *
 * @returns {[number, number, number] | null}
 */
export function detectarFundo(rgba, w, h) {
  const indices = [];
  for (let x = 0; x < w; x++) indices.push(x, (h - 1) * w + x);
  for (let y = 1; y < h - 1; y++) indices.push(y * w, y * w + w - 1);

  const contagem = new Map();
  for (const p of indices) {
    const i = p * 4;
    if (rgba[i + 3] < 200) continue;
    const chave = ((rgba[i] >> 4) << 8) | ((rgba[i + 1] >> 4) << 4) | (rgba[i + 2] >> 4);
    contagem.set(chave, (contagem.get(chave) ?? 0) + 1);
  }
  if (contagem.size === 0) return null;

  const [chaveMaisComum] = [...contagem.entries()].sort((a, b) => b[1] - a[1])[0];
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  for (const p of indices) {
    const i = p * 4;
    if (rgba[i + 3] < 200) continue;
    const chave = ((rgba[i] >> 4) << 8) | ((rgba[i + 1] >> 4) << 4) | (rgba[i + 2] >> 4);
    if (chave !== chaveMaisComum) continue;
    r += rgba[i];
    g += rgba[i + 1];
    b += rgba[i + 2];
    n++;
  }
  const cor = [Math.round(r / n), Math.round(g / n), Math.round(b / n)];

  const lim = quadrado(TOLERANCIA_FUNDO);
  let perto = 0;
  for (const p of indices) if (distancia2(rgba, p * 4, cor) <= lim) perto++;
  return perto / indices.length >= 0.85 ? cor : null;
}

/**
 * Apaga o fundo: torna transparente a regiao da cor do fundo que TOCA A BORDA.
 * So o que esta ligado a borda: o branco de DENTRO de um logo (cercado por um
 * contorno) e da propria arte, nao do fundo, e fica.
 *
 * Tira so o nucleo do fundo (pixels a ate TOLERANCIA_FUNDO da cor). A borda
 * entre o fundo e o desenho, que e uma MISTURA das duas cores (anti-aliasing),
 * fica para `refinarBorda`: apagar mais aqui (uma "camada de halo" fixa)
 * encolhia o contorno do desenho.
 *
 * Altera `rgba` no lugar e devolve quantos pixels ficaram transparentes.
 */
export function removerFundo(rgba, w, h, cor) {
  const lim = quadrado(TOLERANCIA_FUNDO);
  const total = w * h;
  const fundo = new Uint8Array(total);
  const fila = new Int32Array(total);
  let fim = 0;

  const empurrar = (p) => {
    if (fundo[p]) return;
    const i = p * 4;
    if (rgba[i + 3] < 200 || distancia2(rgba, i, cor) <= lim) {
      fundo[p] = 1;
      fila[fim++] = p;
    }
  };

  for (let x = 0; x < w; x++) {
    empurrar(x);
    empurrar((h - 1) * w + x);
  }
  for (let y = 1; y < h - 1; y++) {
    empurrar(y * w);
    empurrar(y * w + w - 1);
  }

  for (let ini = 0; ini < fim; ini++) {
    const p = fila[ini];
    const x = p % w;
    const y = (p - x) / w;
    if (x > 0) empurrar(p - 1);
    if (x < w - 1) empurrar(p + 1);
    if (y > 0) empurrar(p - w);
    if (y < h - 1) empurrar(p + w);
  }

  let removidos = 0;
  for (let p = 0; p < total; p++) {
    if (fundo[p]) {
      rgba[p * 4 + 3] = 0;
      removidos++;
    }
  }
  return removidos;
}

/**
 * Acerta a borda deixada por `removerFundo`.
 *
 * O pixel entre o fundo e o desenho e uma mistura: P = fundo + p * (cor - fundo),
 * com p entre 0 (so fundo) e 1 (so a cor). Sem tratar, o vetorizador o poe na
 * cor da paleta MAIS PARECIDA, e um pixel meio azul, meio amarelo-de-fundo cai
 * no dourado: aparece um filete dourado em volta de um logo de contorno azul.
 *
 * Aqui cada pixel da borda e "desmisturado": acha a cor da paleta F que melhor
 * explica P como mistura com o fundo e estima p. Se p >= 0,5 o pixel e do
 * desenho (fica opaco, com a cor F); senao era fundo (fica transparente). E o
 * limiar de 50% de cobertura, o que poe o contorno exatamente onde estava.
 *
 * Duas passadas: a borda do anti-aliasing tem ate 2 pixels de largura.
 */
export function refinarBorda(rgba, w, h, fundo, paleta) {
  if (paleta.length === 0) return;
  const cores = paleta.map((hex) => [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ]);
  const vazio = (p) => rgba[p * 4 + 3] < 128;

  for (let passada = 0; passada < 2; passada++) {
    const alteracoes = [];
    for (let p = 0; p < w * h; p++) {
      if (vazio(p)) continue;
      const x = p % w;
      const y = (p - x) / w;
      const encostado =
        (x > 0 && vazio(p - 1)) || (x < w - 1 && vazio(p + 1)) || (y > 0 && vazio(p - w)) || (y < h - 1 && vazio(p + w));
      if (!encostado) continue;

      const i = p * 4;
      let melhor = null;
      for (const cor of cores) {
        const dr = cor[0] - fundo[0];
        const dg = cor[1] - fundo[1];
        const db = cor[2] - fundo[2];
        const norma = dr * dr + dg * dg + db * db;
        if (norma < quadrado(TOLERANCIA_FUNDO)) continue; // cor parecida com o fundo nao serve de "desenho"
        const proporcao = Math.min(
          1,
          Math.max(0, ((rgba[i] - fundo[0]) * dr + (rgba[i + 1] - fundo[1]) * dg + (rgba[i + 2] - fundo[2]) * db) / norma),
        );
        const residuo =
          quadrado(rgba[i] - (fundo[0] + proporcao * dr)) +
          quadrado(rgba[i + 1] - (fundo[1] + proporcao * dg)) +
          quadrado(rgba[i + 2] - (fundo[2] + proporcao * db));
        if (!melhor || residuo < melhor.residuo) melhor = { residuo, proporcao, cor };
      }
      if (melhor) alteracoes.push([p, melhor]);
    }
    for (const [p, { proporcao, cor }] of alteracoes) {
      const i = p * 4;
      if (proporcao >= 0.5) {
        rgba[i] = cor[0];
        rgba[i + 1] = cor[1];
        rgba[i + 2] = cor[2];
      } else {
        rgba[i + 3] = 0;
      }
    }
  }
}

/**
 * As cores EXATAS da imagem: as mais frequentes entre os pixels opacos, com as
 * parecidas juntadas numa so.
 *
 * Cada balde de 6 bits por canal guarda a cor exata mais repetida dentro dele
 * (voto de maioria), em vez da media: a media de um balde que mistura
 * #FFFFFF com um pixel de borda daria um quase-branco, e o objetivo aqui e
 * devolver o #FFFFFF de verdade. Cor rara (< 0,15% dos pixels) e mistura de
 * anti-aliasing e nao entra na paleta.
 *
 * @returns {string[]} `#RRGGBB`, da mais frequente para a menos.
 */
export function coresDaImagem(rgba, limite = MAXIMO_CORES_DETECTADAS) {
  const BALDES = 1 << 18;
  const total = new Uint32Array(BALDES);
  const candidata = new Uint32Array(BALDES);
  const votos = new Uint32Array(BALDES);
  let opacos = 0;

  for (let i = 0; i < rgba.length; i += 4) {
    if (rgba[i + 3] < 128) continue;
    const r = rgba[i];
    const g = rgba[i + 1];
    const b = rgba[i + 2];
    const balde = ((r >> 2) << 12) | ((g >> 2) << 6) | (b >> 2);
    const cor = (r << 16) | (g << 8) | b;
    total[balde]++;
    opacos++;
    if (votos[balde] === 0) {
      candidata[balde] = cor;
      votos[balde] = 1;
    } else if (candidata[balde] === cor) {
      votos[balde]++;
    } else {
      votos[balde]--;
    }
  }
  if (opacos === 0) return [];

  const minimo = Math.max(1, Math.floor(opacos * 0.0015));
  const baldes = [];
  for (let k = 0; k < BALDES; k++) if (total[k] >= minimo) baldes.push(k);
  baldes.sort((a, b) => total[b] - total[a]);

  // Cada item: cor, e quantos pixels tem o balde onde ela foi a mais votada.
  const paleta = [];
  for (const k of baldes) {
    const cor = candidata[k];
    const c = [cor >> 16, (cor >> 8) & 255, cor & 255];
    if (ehRuido(c, total[k], paleta)) continue;
    if (ehMistura(c, total[k], paleta)) continue;
    paleta.push({ cor: c, pixels: total[k] });
    if (paleta.length >= limite) break;
  }
  return paleta.map(({ cor }) => paraHex(cor[0], cor[1], cor[2]));
}

/**
 * Variacao da MESMA cor (ruido de JPEG, degrau de anti-aliasing), nao um tom
 * novo. Ate 16 de distancia e sempre a mesma cor. Entre 16 e 48 so e a mesma se
 * for MUITO menor que a vizinha (menos de 10% dos pixels dela): e o que separa
 * o ruido em volta de uma cor de um tom parecido que existe de verdade, como o
 * dourado #FFD100 ao lado do amarelo #FFE600 (21 de distancia), que uma regra
 * so de distancia engolia.
 */
function ehRuido(c, pixels, aceitas) {
  for (const p of aceitas) {
    const d2 = quadrado(p.cor[0] - c[0]) + quadrado(p.cor[1] - c[1]) + quadrado(p.cor[2] - c[2]);
    if (d2 <= quadrado(16)) return true;
    if (d2 < quadrado(48) && pixels < 0.1 * p.pixels) return true;
  }
  return false;
}

/**
 * Cor de MISTURA, nao de desenho: fica sobre a reta entre duas cores ja aceitas
 * (a 40 de distancia, ou menos) e tem MUITO menos pixels que as duas pontas.
 *
 * Toda borda de anti-aliasing e uma mistura das cores vizinhas, e um logo de
 * 3 cores gera dezenas delas: no logo do Mercado Livre, seis misturas
 * (#D7D8E4, #A5A7C4, #E3BC21...) passaram como cor e o SVG saiu com uma camada
 * lilas fantasma. O limite de pixels protege a cor de verdade que por acaso cai
 * entre outras duas (um laranja de detalhe entre amarelo e vermelho): so e
 * descartada se tiver menos de 8% dos pixels da menor das duas pontas.
 */
function ehMistura(c, pixels, aceitas) {
  for (let a = 0; a < aceitas.length; a++) {
    for (let b = a + 1; b < aceitas.length; b++) {
      if (pixels > 0.08 * Math.min(aceitas[a].pixels, aceitas[b].pixels)) continue;
      const pa = aceitas[a].cor;
      const pb = aceitas[b].cor;
      const dx = pb[0] - pa[0];
      const dy = pb[1] - pa[1];
      const dz = pb[2] - pa[2];
      const norma = dx * dx + dy * dy + dz * dz;
      if (norma === 0) continue;
      const t = Math.min(1, Math.max(0, ((c[0] - pa[0]) * dx + (c[1] - pa[1]) * dy + (c[2] - pa[2]) * dz) / norma));
      const distancia2Ate =
        quadrado(c[0] - (pa[0] + t * dx)) + quadrado(c[1] - (pa[1] + t * dy)) + quadrado(c[2] - (pa[2] + t * dz));
      if (distancia2Ate <= quadrado(40)) return true;
    }
  }
  return false;
}
