import { lerDadosDaEmpresa } from "@/lib/compras/empresa";
import { assinarPdf } from "@/lib/propostas/assinatura";
import { certificadoParaAssinar } from "@/lib/propostas/certificado";
import { dadosDoPdfDaProposta, pdfDaProposta } from "@/lib/propostas/pdf";

/**
 * O PDF da proposta como ele sai para o cliente (botao do Rise e link publico; spec 2026-11-17-assinatura-digital-proposta):
 * marcada "Assinar digitalmente" e com certificado valido, gera com o selo e assina na hora; em qualquer outro caso, ou se a
 * assinatura falhar, sai o PDF de sempre, sem selo (a proposta nunca trava por causa do certificado).
 * @returns {Promise<{ bytes: Buffer, assinado: boolean }>}
 */
export async function pdfParaEnviar(proposta, agora = new Date()) {
  const [empresa, extras, certificado] = await Promise.all([
    lerDadosDaEmpresa(),
    dadosDoPdfDaProposta(proposta),
    proposta.assinarDigitalmente ? certificadoParaAssinar(agora) : null,
  ]);
  if (certificado) {
    try {
      const comSelo = await pdfDaProposta(proposta, empresa, { ...extras, selo: { razaoSocial: certificado.razaoSocial, cnpj: certificado.cnpj, quando: agora } });
      const bytes = await assinarPdf(comSelo, {
        pfx: certificado.pfx,
        senha: certificado.senha,
        // So ASCII: o texto vai cru no dicionario da assinatura, e "Nº" sairia trocado no leitor de PDF.
        motivo: `Proposta comercial ${proposta.numero}`,
        local: "Caxias do Sul - RS",
        nome: certificado.razaoSocial,
        agora,
      });
      return { bytes, assinado: true };
    } catch (erro) {
      // Sem o segredo no log: so a mensagem.
      console.error(`[proposta ${proposta.numero}] não foi possível assinar o PDF: ${erro?.message ?? erro}`);
    }
  }
  return { bytes: await pdfDaProposta(proposta, empresa, extras), assinado: false };
}
