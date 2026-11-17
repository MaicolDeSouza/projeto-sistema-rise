import { createHash, createSign } from "node:crypto";
import * as placeholderPlain from "@signpdf/placeholder-plain";
import * as signpdfPkg from "@signpdf/signpdf";
import * as utilsDoSignpdf from "@signpdf/utils";
import forge from "node-forge";

/**
 * Assinatura digital do PDF da proposta com o e-CNPJ A1 (spec 2026-11-17-assinatura-digital-proposta-design.md). So no
 * servidor. `lerCertificado` abre o PKCS#12 e devolve quem assina; `assinarPdf` poe o espaco da assinatura no PDF ja pronto
 * (o `placeholder-pdfkit` exige pdfkit < 0.16 e o Rise usa 0.17) e grava a assinatura CMS.
 *
 * O CMS e montado aqui, e nao pelo `P12Signer`: o PAdES (subFilter ETSI.CAdES.detached), que e o que o validador do ITI
 * confere, pede o atributo signing-certificate-v2, e o forge nao sabe gravar atributo fora de contentType, messageDigest e
 * signingTime. A hora vai no /M da assinatura (o PAdES basico nao usa o signingTime dentro do CMS).
 */

export const TAMANHO_MAXIMO_DO_CERTIFICADO = 50 * 1024;
const TAMANHO_DA_ASSINATURA = 16384;

const { asn1, pki } = forge;
const OID = {
  data: "1.2.840.113549.1.7.1",
  signedData: "1.2.840.113549.1.7.2",
  contentType: "1.2.840.113549.1.9.3",
  messageDigest: "1.2.840.113549.1.9.4",
  signingCertificateV2: "1.2.840.113549.1.9.16.2.47",
  sha256: "2.16.840.1.101.3.4.2.1",
  rsaEncryption: "1.2.840.113549.1.1.1",
};

function dataEmSaoPaulo(data) {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" }).format(data);
}

function formatarCnpj(digitos) {
  return digitos.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
}

/** Abre o PKCS#12 e devolve a chave e o certificado DELA (o .pfx da certificadora traz a cadeia junto, em qualquer ordem). */
function abrirPfx(pfx, senha) {
  let p12;
  try {
    const der = forge.util.createBuffer(Buffer.from(pfx).toString("binary"));
    // A senha vai como texto JS: o forge a converte para BMPString (UCS-2), como o Windows e o OpenSSL fazem com acento.
    p12 = forge.pkcs12.pkcs12FromAsn1(asn1.fromDer(der), false, String(senha ?? ""));
  } catch {
    throw new Error("Senha do certificado incorreta ou arquivo inválido.");
  }
  const chaves = [
    ...(p12.getBags({ bagType: pki.oids.pkcs8ShroudedKeyBag })[pki.oids.pkcs8ShroudedKeyBag] ?? []),
    ...(p12.getBags({ bagType: pki.oids.keyBag })[pki.oids.keyBag] ?? []),
  ]
    .map((b) => b.key)
    .filter(Boolean);
  const certificados = (p12.getBags({ bagType: pki.oids.certBag })[pki.oids.certBag] ?? []).map((b) => b.cert).filter(Boolean);
  for (const chave of chaves) {
    if (!chave.n) continue; // So RSA (o e-CNPJ ICP-Brasil e RSA).
    const certificado = certificados.find((c) => c.publicKey?.n && c.publicKey.n.compareTo(chave.n) === 0 && c.publicKey.e.compareTo(chave.e) === 0);
    if (certificado) return { chave, certificado, certificados };
  }
  throw new Error("O arquivo não tem a chave privada do certificado.");
}

/**
 * Le o certificado A1 e confere a senha e a validade.
 * @returns {{ razaoSocial: string, cnpj: string|null, titular: string, validoDe: Date, validoAte: Date }}
 */
export function lerCertificado(pfx, senha, agora = new Date()) {
  if (!pfx || pfx.length > TAMANHO_MAXIMO_DO_CERTIFICADO) throw new Error("Arquivo maior que 50 KB.");
  const { certificado } = abrirPfx(pfx, senha);
  const titular = String(certificado.subject.getField("CN")?.value ?? "").trim();
  // e-CNPJ ICP-Brasil: "RAZAO SOCIAL:14 digitos".
  const casado = titular.match(/^(.*):(\d{14})$/);
  const validoDe = certificado.validity.notBefore;
  const validoAte = certificado.validity.notAfter;
  if (validoAte <= agora) throw new Error(`Certificado vencido em ${dataEmSaoPaulo(validoAte)}.`);
  return { razaoSocial: casado ? casado[1].trim() : titular, cnpj: casado ? formatarCnpj(casado[2]) : null, titular, validoDe, validoAte };
}

const oid = (valor) => asn1.create(asn1.Class.UNIVERSAL, asn1.Type.OID, false, asn1.oidToDer(valor).getBytes());
const seq = (itens) => asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, itens);
const conjunto = (itens) => asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SET, true, itens);
const octetos = (bytes) => asn1.create(asn1.Class.UNIVERSAL, asn1.Type.OCTETSTRING, false, bytes);
const inteiro = (bytes) => asn1.create(asn1.Class.UNIVERSAL, asn1.Type.INTEGER, false, bytes);
const derDe = (no) => Buffer.from(asn1.toDer(no).getBytes(), "binary");
const algoritmo = (valor) => seq([oid(valor), asn1.create(asn1.Class.UNIVERSAL, asn1.Type.NULL, false, "")]);
const atributo = (tipo, valor) => seq([oid(tipo), conjunto([valor])]);

/**
 * O emissor e a serie COMO ESTAO no certificado (o TBS original que o forge guarda): reescrever o nome mudaria o tipo de
 * texto de algum campo, e o validador nao acharia o certificado de quem assinou.
 */
function emissorESerie(certificado) {
  const tbs = certificado.tbsCertificate.value;
  const comVersao = tbs[0].tagClass === asn1.Class.CONTEXT_SPECIFIC;
  return { serie: tbs[comVersao ? 1 : 0], emissor: tbs[comVersao ? 3 : 2] };
}

/** CMS SignedData destacado (detached) sobre os bytes do PDF fora do /Contents. */
function cmsDaAssinatura(conteudo, { chave, certificado, certificados }) {
  const derDoCertificado = derDe(pki.certificateToAsn1(certificado));
  const { serie, emissor } = emissorESerie(certificado);

  // signing-certificate-v2 (RFC 5035): o hash SHA-256 do certificado e o emissor/serie, para o validador saber qual assinou.
  const issuerSerial = seq([seq([asn1.create(asn1.Class.CONTEXT_SPECIFIC, 4, true, [emissor])]), serie]);
  const essCertIdV2 = seq([octetos(createHash("sha256").update(derDoCertificado).digest().toString("binary")), issuerSerial]);

  const atributos = [
    atributo(OID.contentType, oid(OID.data)),
    atributo(OID.messageDigest, octetos(createHash("sha256").update(conteudo).digest().toString("binary"))),
    atributo(OID.signingCertificateV2, seq([seq([essCertIdV2])])),
  ];
  // DER: um SET OF vai em ordem pela codificacao de cada item; a assinatura cobre o SET exatamente como sera gravado.
  const ordenados = atributos
    .map((a) => ({ a, der: derDe(a) }))
    .sort((x, y) => Buffer.compare(x.der, y.der))
    .map((x) => x.a);
  const assinaturaRsa = createSign("sha256").update(derDe(conjunto(ordenados))).sign(pki.privateKeyToPem(chave));

  const signerInfo = seq([
    inteiro(String.fromCharCode(1)),
    seq([emissor, serie]),
    algoritmo(OID.sha256),
    asn1.create(asn1.Class.CONTEXT_SPECIFIC, 0, true, ordenados),
    algoritmo(OID.rsaEncryption),
    octetos(assinaturaRsa.toString("binary")),
  ]);
  // O certificado de quem assina vai primeiro; a cadeia depois.
  const todos = [certificado, ...certificados.filter((c) => c !== certificado)];
  const signedData = seq([
    inteiro(String.fromCharCode(1)),
    conjunto([algoritmo(OID.sha256)]),
    seq([oid(OID.data)]),
    asn1.create(asn1.Class.CONTEXT_SPECIFIC, 0, true, todos.map((c) => pki.certificateToAsn1(c))),
    conjunto([signerInfo]),
  ]);
  return derDe(seq([oid(OID.signedData), asn1.create(asn1.Class.CONTEXT_SPECIFIC, 0, true, [signedData])]));
}

class AssinanteIcp extends utilsDoSignpdf.Signer {
  constructor(pfx, senha) {
    super();
    this.aberto = abrirPfx(pfx, senha);
  }

  async sign(conteudo) {
    return cmsDaAssinatura(conteudo, this.aberto);
  }
}

/**
 * Assina o PDF (Buffer) e devolve o PDF assinado. Lanca se o certificado nao abrir.
 * @param {Buffer} pdf
 * @param {{ pfx: Buffer, senha: string, motivo?: string, local?: string, nome?: string, agora?: Date }} opcoes
 */
export async function assinarPdf(pdf, { pfx, senha, motivo = "", local = "", nome = "", agora = new Date() }) {
  const assinante = new AssinanteIcp(pfx, senha);
  const comEspaco = placeholderPlain.plainAddPlaceholder({
    pdfBuffer: pdf,
    reason: motivo,
    location: local,
    name: nome,
    contactInfo: "",
    signingTime: agora,
    signatureLength: TAMANHO_DA_ASSINATURA,
    subFilter: utilsDoSignpdf.SUBFILTER_ETSI_CADES_DETACHED,
    appName: "Sistema Rise",
  });
  const SignPdf = signpdfPkg.SignPdf ?? signpdfPkg.default?.SignPdf;
  return new SignPdf().sign(comEspaco, assinante, agora);
}
