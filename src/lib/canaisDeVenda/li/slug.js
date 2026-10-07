/**
 * Slug (apelido) do produto na Loja Integrada. Sem imports: a tela, o servidor e o teste
 * leem a mesma regra.
 *
 * A URL da LI e baseada no slug, e o Google indexa por ela: trocar depois exige o /alias
 * com redirecionamento 301. Por isso a regra e estrita (so [a-z0-9-]) e o tamanho tem teto.
 */

export const LIMITE_DO_SLUG = 100;

const FORMATO_DO_SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** "Relé RS232 / 5V" vira "rele-rs232-5v"; texto sem letra nem numero vira "". */
export function slugDe(texto) {
  const base = String(texto ?? "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  // O corte pode cair logo depois de um hifen; apara de novo para nao terminar em "-".
  return base.slice(0, LIMITE_DO_SLUG).replace(/-+$/, "");
}

/**
 * O slug atual a partir do link da loja: produto antigo tem "/produto/<slug>.html", o novo "/<slug>"
 * (medido em 07/10/2026). Sem link, null.
 */
export function slugDaUrl(url) {
  const texto = String(url ?? "").trim();
  if (!texto) return null;
  const caminho = texto.replace(/^https?:\/\/[^/]+/i, "").replace(/[?#].*$/, "");
  return (
    caminho
      .replace(/^\/+/, "")
      .replace(/^produto\//, "")
      .replace(/\.html?$/, "")
      .replace(/\/+$/, "") || null
  );
}

export function slugValido(slug) {
  const texto = String(slug ?? "");
  return texto.length > 0 && texto.length <= LIMITE_DO_SLUG && FORMATO_DO_SLUG.test(texto);
}
