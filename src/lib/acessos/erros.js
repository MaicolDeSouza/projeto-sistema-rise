/**
 * A pessoa nao tem o nivel pedido no recurso. Lancado por `exigirAcesso` (src/lib/acessos/servidor.js) e convertido
 * pelo involucro das acoes em `{ ok: false, erro: "Sem permissão para <recurso>." }`; a pagina usa `notFound()` em vez
 * dele (spec §5.6: quem nao ve nao sabe que existe).
 */
export class ErroDeAcesso extends Error {
  constructor(recurso, nivel) {
    super(`Sem acesso: ${recurso} (${nivel})`);
    this.name = "ErroDeAcesso";
    this.recurso = recurso;
    this.nivel = nivel;
  }
}
