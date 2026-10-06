import { nomeGuardadoDaVersao, versoesDoLote } from "./lote";

/**
 * A foto como o painel e a janela a mostram. Mora aqui, e nao no arquivo das acoes, porque um modulo
 * "use server" so pode exportar funcao assincrona, e as acoes do Nano Banana tambem precisam dela.
 *
 *  - `versao`: a que esta em `imagens/<base>.jpg` agora ("original", "photoroom" ou "nanobanana").
 *  - `versoes`: quais versoes GERADAS (pagas) existem guardadas no lote.
 *  - `urls`: os enderecos das guardadas, para a janela mostrar sem chamar ninguem.
 *
 * O `?v=` nos enderecos evita o cache do navegador: o nome do arquivo e o mesmo depois de trocar a versao.
 */
export function imagemParaTela(lote, base, extra = {}) {
  return {
    base,
    url: `/api/temporarios/${lote}/imagens/${base}.jpg?v=${Date.now()}`,
    // Toda foto que entra no painel nasce NAO validada, e o dono a valida (check verde) ou ela nao e salva.
    // Tem que ser `false` explicito, e nao ausente: so o `false` faz o servidor deixar a foto de fora.
    finalizada: false,
    ampliada: false,
    versao: "original",
    versoes: { photoroom: false, nanobanana: false },
    urls: { original: null, photoroom: null, nanobanana: null },
    ...extra,
  };
}

/**
 * As versoes guardadas de uma foto e os enderecos delas. O da original so vem quando ha alguma gerada:
 * sem gerada nao ha o que comparar, e a janela mostra a foto atual.
 */
export async function versoesParaTela(lote, base) {
  const versoes = await versoesDoLote(lote, base);
  const v = Date.now();
  const endereco = async (versao) => {
    const nome = await nomeGuardadoDaVersao(lote, base, versao);
    return nome ? `/api/temporarios/${lote}/versoes/${nome}?v=${v}` : null;
  };
  const algumaGerada = versoes.photoroom || versoes.nanobanana;
  return {
    versoes,
    urls: {
      original: algumaGerada ? await endereco("original") : null,
      photoroom: versoes.photoroom ? await endereco("photoroom") : null,
      nanobanana: versoes.nanobanana ? await endereco("nanobanana") : null,
    },
  };
}
