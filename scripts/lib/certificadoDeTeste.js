import forge from "node-forge";

/**
 * Certificado A1 FALSO para os testes da assinatura digital da proposta (plano 2026-11-17). Gera na hora um PKCS#12 no molde
 * do e-CNPJ ICP-Brasil (CN "RAZAO SOCIAL:CNPJ"), com senha, para o teste nunca precisar do certificado real da 4hobby.
 * `comCadeia` poe tambem o certificado de uma AC no arquivo, como o .pfx da certificadora vem; `vencido` faz um que venceu
 * ontem. Nao importa nada de `src/`.
 */
export function certificadoDeTeste({ cn = "ZZ TESTE LTDA:00000000000191", senha = "Ação#2026", vencido = false, comCadeia = false } = {}) {
  const agora = Date.now();
  const dia = 24 * 60 * 60 * 1000;
  const chaves = forge.pki.rsa.generateKeyPair({ bits: 2048, e: 0x10001 });

  const novo = (publica, sujeito, emissor, serial, de, ate, ehAc) => {
    const cert = forge.pki.createCertificate();
    cert.publicKey = publica;
    cert.serialNumber = serial;
    cert.validity.notBefore = new Date(de);
    cert.validity.notAfter = new Date(ate);
    cert.setSubject(sujeito);
    cert.setIssuer(emissor);
    cert.setExtensions([{ name: "basicConstraints", cA: ehAc }, { name: "keyUsage", digitalSignature: true, nonRepudiation: true, keyCertSign: ehAc }]);
    return cert;
  };

  const sujeito = [{ name: "commonName", value: cn }, { name: "countryName", value: "BR" }, { name: "organizationName", value: "ICP-Brasil" }];
  const de = vencido ? agora - 400 * dia : agora - dia;
  const ate = vencido ? agora - dia : agora + 365 * dia;

  const certificados = [];
  if (comCadeia) {
    const chavesDaAc = forge.pki.rsa.generateKeyPair({ bits: 2048, e: 0x10001 });
    const nomeDaAc = [{ name: "commonName", value: "ZZ AC DE TESTE" }, { name: "countryName", value: "BR" }];
    const ac = novo(chavesDaAc.publicKey, nomeDaAc, nomeDaAc, "01", agora - 10 * dia, agora + 3650 * dia, true);
    ac.sign(chavesDaAc.privateKey, forge.md.sha256.create());
    const cert = novo(chaves.publicKey, sujeito, nomeDaAc, "02", de, ate, false);
    cert.sign(chavesDaAc.privateKey, forge.md.sha256.create());
    // A AC primeiro: o leitor tem de achar o certificado pela chave privada, nao pela ordem.
    certificados.push(ac, cert);
  } else {
    const cert = novo(chaves.publicKey, sujeito, sujeito, "02", de, ate, false);
    cert.sign(chaves.privateKey, forge.md.sha256.create());
    certificados.push(cert);
  }

  const asn1 = forge.pkcs12.toPkcs12Asn1(chaves.privateKey, certificados, senha, { algorithm: "3des" });
  return { pfx: Buffer.from(forge.asn1.toDer(asn1).getBytes(), "binary"), senha };
}
