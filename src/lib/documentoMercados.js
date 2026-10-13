/**
 * Como abrir o link de um documento coletado de uma loja (tela Mercados: previa do teste e detalhe do produto).
 *
 * PDF e imagem o navegador mostra, e basta o endereco da loja. Arquivo de CAD (STEP, IGES, STL, DXF, DWG) e compactado nao:
 * o servidor da Tespo entrega o `.stp` como `text/plain`, o navegador abre uma pagina de texto, e o atributo `download`
 * e ignorado quando o arquivo e de OUTRO dominio. Esses passam pela rota `/api/mercados/documento`, que baixa no
 * servidor (mesmo filtro de rede publica dos documentos de referencia) e devolve com `Content-Disposition: attachment`.
 *
 * Sem imports: serve ao navegador e ao servidor.
 */

const EXTENSOES_QUE_BAIXAM = /\.(stp|step|igs|iges|stl|dxf|dwg|zip|rar|7z|docx?|xlsx?|pptx?|csv|ino|hex)(?:[?#]|$)/i;

/** O endereco que o link deve usar e se ele baixa o arquivo (em vez de abrir uma pagina). */
export function linkDoDocumento(documento) {
  const url = String(documento?.url ?? "");
  if (!EXTENSOES_QUE_BAIXAM.test(url)) return { href: url, baixar: false };

  const parametros = new URLSearchParams({ url });
  if (documento?.titulo) parametros.set("titulo", String(documento.titulo));
  return { href: `/api/mercados/documento?${parametros.toString()}`, baixar: true };
}
