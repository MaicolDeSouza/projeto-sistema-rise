import TelaDeLicencas from "@/components/ferramentas/licencas/TelaDeLicencas";
import AvisoBanco from "@/components/ui/AvisoBanco";
import LinkDeVolta from "@/components/ui/LinkDeVolta";
import { exigirAcessoNaPagina } from "@/lib/acessos/servidor";
import { frescorDoPrograma, listarLicencas, listarSoftwares, tiposDoPrograma } from "@/lib/ferramentas/licencas/banco";
import { porPaginaDaUrl } from "@/lib/porPagina";

export const metadata = { title: "Licenças Softwares | Sistema Rise" };
export const dynamic = "force-dynamic";

const ORDENACOES = ["identificador", "tipo", "situacao", "livres", "ultimoUso", "renovadaEm", "clientes", "ultimaEntrega"];
const umDe = (valor) => String((Array.isArray(valor) ? valor[0] : valor) ?? "").trim();
// Datas viram texto ISO no caminho para a tela (a tela formata no fuso certo).
const serial = (valor) => JSON.parse(JSON.stringify(valor ?? null));

/**
 * Licencas Softwares (spec 2026-11-05, §6.6): as chaves do LightBurn e os arquivos do Mach3, uma aba por programa
 * (`?programa=`). Filtros na URL: `busca`, `vaga=1` (so com vaga livre), `arquivadas=1`, `ordenar`/`direcao`,
 * `pagina` e `por`.
 */
export default async function LicencasPage({ searchParams }) {
  const acesso = await exigirAcessoNaPagina("tela.ferramentas.licencas", "ver");
  const params = await searchParams;
  const podeEditar = acesso.pode("tela.ferramentas.licencas", "editar");
  const podeExcluir = acesso.pode("tela.ferramentas.licencas", "excluir");
  const podeBaixar = acesso.pode("acao.ferramentas.licencas.arquivo", "executar");

  let erro = null;
  let programas = [];
  let programa = null;
  let lista = null;
  let frescor = null;
  let tipos = [];
  let todos = [];
  const filtros = {
    busca: umDe(params?.busca),
    soComVagaLivre: umDe(params?.vaga) === "1",
    mostrarArquivadas: umDe(params?.arquivadas) === "1",
    ordenar: ORDENACOES.includes(umDe(params?.ordenar)) ? umDe(params.ordenar) : null,
    direcao: umDe(params?.direcao) === "desc" ? "desc" : "asc",
    pagina: Math.max(1, Number.parseInt(umDe(params?.pagina), 10) || 1),
    porPagina: porPaginaDaUrl(umDe(params?.por)),
  };
  try {
    programas = await listarSoftwares();
    programa = programas.find((item) => item.slug === umDe(params?.programa)) ?? programas[0] ?? null;
    if (programa && !programa.temPortal) filtros.soComVagaLivre = false;
    [lista, frescor, tipos, todos] = await Promise.all([
      programa ? listarLicencas({ softwareId: programa.id, ...filtros }) : null,
      programa?.temPortal ? frescorDoPrograma(programa.id) : null,
      programa ? tiposDoPrograma(programa.id) : [],
      podeEditar ? listarSoftwares({ soAtivos: false }) : [],
    ]);
  } catch (e) {
    erro = e;
  }

  return (
    <>
      <LinkDeVolta href="/ferramentas" rotulo="Ferramentas" />
      {erro && <AvisoBanco erro={erro} />}
      <TelaDeLicencas
        programas={serial(programas)}
        todosProgramas={serial(todos)}
        programa={serial(programa)}
        lista={serial(lista)}
        frescor={serial(frescor)}
        tipos={tipos}
        filtros={filtros}
        podeEditar={podeEditar}
        podeExcluir={podeExcluir}
        podeBaixar={podeBaixar}
      />
    </>
  );
}
