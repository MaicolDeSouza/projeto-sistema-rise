/**
 * Loja de front PROPRIO da Codigo G (codigog.com.br, 05/11/2026, pedido do dono: "verificar se consegue extrair esse
 * concorrente tambem"). Nenhuma plataforma conhecida; a pagina do produto tem um painel proprio:
 *
 *   <div class="old-price">De R$284,59</div>            (so em promocao: o RISCADO, nao e preco vigente)
 *   <div class="price"><small>Por</small> R$250,34</div>  o preco no PIX (5% abaixo)
 *   <div class="sem_desconto">ou R$263,52</div>           o preco de cartao = o NORMAL
 *   <button name="btn_carrinho" id="btn_2073" data-amount="26352">   o mesmo normal, em centavos
 *   <div class="produto-desc"><div class="desc-tab">Descrição do Produto</div> ...texto e "Dimensões da fresa"...</div>
 *
 * O JSON-LD traz o preco do PIX como `price` (269,80 contra 284,00 no cartao) e a descricao cortada em 155 caracteres,
 * minuscula; sem este leitor o normal saia o do pix e a ficha ("Haste: 12mm", "Diâmetro do corte: 12mm") vinha vazia.
 */

/** "R$1.284,59" -> 1284.59; null sem numero. */
function reais(texto) {
  const achado = /R\$\s*([\d.]+,\d{2})/.exec(texto ?? "");
  if (!achado) return null;
  const numero = Number(achado[1].replace(/\./g, "").replace(",", "."));
  return Number.isFinite(numero) && numero > 0 ? numero : null;
}

/** O conteudo do <div> que abre em `inicio` (logo depois do ">"), equilibrando os <div> aninhados. */
function conteudoDoDiv(html, inicio) {
  const padrao = /<\/?div\b[^>]*>/gi;
  padrao.lastIndex = inicio;
  let profundidade = 1;
  let achado;
  while ((achado = padrao.exec(html)) !== null) {
    profundidade += achado[0][1] === "/" ? -1 : 1;
    if (profundidade === 0) return html.slice(inicio, achado.index);
  }
  return html.slice(inicio);
}

/**
 * O que o painel da Codigo G diz, no vocabulario do normalizador; null quando a pagina nao tem o painel (outra loja).
 *
 * @param {string} html
 * @param {(blocoHtml: string) => string|null} paraTexto  o leitor de bloco de descricao do normalizador
 */
export function dadosDaCodigoG(html, paraTexto) {
  if (typeof html !== "string") return null;
  // Produto ESGOTADO nao tem o painel de preco nem o botao ("Produto Indisponivel" e o formulario de aviso), mas tem a
  // descricao: por isso o painel e a descricao sao conferidos cada um por si.
  const temPainel = /class=["']sem_desconto["']/.test(html);
  const temDescricao = /<div[^>]*class=["']produto-desc["']/i.test(html) && /<div[^>]*class=["']desc-tab["']/i.test(html);
  if (!temPainel && !temDescricao) return null;
  const botao = temPainel ? /<button\b[^>]*\bname=["']btn_carrinho["'][^>]*>/i.exec(html)?.[0] : null;

  // Normal = o de cartao: o data-amount do botao (centavos) e, na falta dele, o "ou R$..." do painel.
  const centavos = Number(/\bdata-amount=["'](\d+)["']/.exec(botao ?? "")?.[1]);
  const semDesconto = reais(/<div[^>]*class=["']sem_desconto["'][^>]*>([\s\S]*?)<\/div>/i.exec(html)?.[1]);
  const normal = Number.isFinite(centavos) && centavos > 0 ? centavos / 100 : semDesconto;

  // O "Por R$..." / "R$..." do painel, seguido de "à vista no PIX". So conta se for menor que o normal.
  const painel = /<div[^>]*class=["']price["'][^>]*>([\s\S]*?)<\/div>\s*<div[^>]*class=["']desconto_pg_produto["']/i.exec(html);
  const pix = reais(painel?.[1]);
  const aVista = pix && normal && pix < normal ? pix : null;

  const abertura = /<div[^>]*class=["']produto-desc["'][^>]*>/i.exec(html);
  let descricao = null;
  if (abertura) {
    const interno = conteudoDoDiv(html, abertura.index + abertura[0].length)
      // "Descrição do Produto" e o rotulo da aba, nao texto do produto.
      .replace(/<div[^>]*class=["']desc-tab["'][^>]*>[\s\S]*?<\/div>/i, "")
      // "*Imagens meramente ilustrativas." e aviso da loja em todo produto.
      .replace(/<em>\s*\*\s*Imagens meramente ilustrativas\.?\s*<\/em>/gi, "");
    // Titulo em <b> no comeco do paragrafo ("Dimensões da fresa") vira linha propria: a ficha comeca nele.
    const texto = paraTexto(interno.replace(/<p>\s*<b>/gi, "<p>\n<b>"));
    descricao = texto && texto.trim().length >= 20 ? texto.trim() : null;
  }

  if (!normal && !descricao) return null;
  return { normal: normal ?? null, aVista, descricao };
}
