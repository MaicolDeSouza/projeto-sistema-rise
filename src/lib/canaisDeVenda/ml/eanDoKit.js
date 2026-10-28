import { gerarEanDoSku } from "../../eanInterno.js";

/**
 * O EAN interno do KIT (pedido do dono em 27/10/2026, Opcao 1): ha categorias (Conectores, MLB38172, medido no validador do
 * ML) que exigem GTIN mesmo com o motivo "kit ou pack", e o EAN da unidade ligaria o kit ao produto de uma unidade. O codigo
 * sai dos DIGITOS do codigo do kit pela regra do "Gerar EAN interno" (`2` + digitos + verificador): "900212_10" da
 * 2000900212105, "900212_50" da 2000900212501 (o clone com outra quantidade ganha outro), o kit misto 25xxxx da o dele.
 * `null` sem digitos ou com mais de 11. Arquivo proprio: o envio (`payload.js`), a validacao e a tela o leem.
 */
export function eanDoKit(composicao) {
  const digitos = String(composicao?.codigo ?? "").trim().replace(/\D/g, "");
  if (!digitos) return null;
  const gerado = gerarEanDoSku(digitos);
  return gerado.ok ? gerado.ean : null;
}
