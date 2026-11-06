"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ExternalLink, FileText, KeyRound, MoreVertical, Plus } from "lucide-react";

import NavegacaoDoTopo from "@/components/mercados/NavegacaoDoTopo";
import Paginacao from "@/components/mercados/Paginacao";
import CampoBusca from "@/components/ui/CampoBusca";
import EmptyState from "@/components/ui/EmptyState";
import PageHeader from "@/components/ui/PageHeader";

import { CLASSE_PRINCIPAL } from "./formato";
import JanelaEnviarArquivo from "./JanelaEnviarArquivo";
import JanelaHistoricoDeLeituras from "./JanelaHistoricoDeLeituras";
import JanelaLicenca from "./JanelaLicenca";
import JanelaProgramas from "./JanelaProgramas";
import JanelaVincularCliente from "./JanelaVincularCliente";
import LinhasDaLicenca from "./LinhasDaLicenca";
import SeloDaLeitura from "./SeloDaLeitura";
import TabelaDeLicencas from "./TabelaDeLicencas";

/** O menu ⋮ do cabecalho (Programas e Histórico de leituras): fecha no clique fora e no Esc. */
function MenuDoCabecalho({ itens }) {
  const [aberto, setAberto] = useState(false);
  const raiz = useRef(null);
  useEffect(() => {
    if (!aberto) return undefined;
    const fora = (evento) => {
      if (!raiz.current?.contains(evento.target)) setAberto(false);
    };
    const tecla = (evento) => {
      if (evento.key === "Escape") setAberto(false);
    };
    document.addEventListener("mousedown", fora);
    document.addEventListener("keydown", tecla);
    return () => {
      document.removeEventListener("mousedown", fora);
      document.removeEventListener("keydown", tecla);
    };
  }, [aberto]);
  const visiveis = itens.filter(Boolean);
  if (!visiveis.length) return null;
  return (
    <div ref={raiz} className="relative">
      <button type="button" onClick={() => setAberto((valor) => !valor)} aria-haspopup="menu" aria-expanded={aberto} aria-label="Mais opções" className="rounded-md border border-borda p-1.5 text-suave transition-colors hover:bg-fundo hover:text-texto">
        <MoreVertical size={16} />
      </button>
      {aberto && (
        <div role="menu" className="absolute right-0 z-30 mt-1 w-48 overflow-hidden rounded-md border border-borda bg-superficie py-1 text-sm shadow-lg">
          {visiveis.map((item) => (
            <button
              key={item.rotulo}
              type="button"
              role="menuitem"
              onClick={() => {
                setAberto(false);
                item.aoClicar();
              }}
              className="block w-full px-3 py-1.5 text-left transition-colors hover:bg-fundo"
            >
              {item.rotulo}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const linkExterno = "inline-flex items-center gap-1.5 rounded-md border border-borda px-2.5 py-1.5 text-xs font-medium text-suave transition-colors hover:bg-fundo hover:text-texto";

/**
 * Licencas Softwares (spec 2026-11-05, §6.6).
 *
 * Linha-guia: nesta tela o operador ve primeiro quais chaves tem vaga livre e se a leitura do portal e recente; a acao
 * principal e Vincular cliente (nas linhas vazias da licenca aberta). O cabecalho tem o selo da leitura, os links do
 * programa e o ⋮ (Programas, Histórico de leituras); os filtros compactos ficam acima da tabela, com "Nova licença" a
 * direita. As janelas abrem por cima; a lista se atualiza sozinha depois de cada acao (revalidatePath).
 */
export default function TelaDeLicencas({ programas, todosProgramas, programa, lista, frescor, tipos, filtros, podeEditar, podeExcluir, podeBaixar }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [aberta, setAberta] = useState(null);
  const [janela, setJanela] = useState(null);

  function alternarParametro(nome) {
    const params = new URLSearchParams(searchParams);
    if (params.get(nome) === "1") params.delete(nome);
    else params.set(nome, "1");
    params.delete("pagina");
    const texto = params.toString();
    router.push(texto ? `${pathname}?${texto}` : pathname);
  }

  // Ao fechar qualquer janela a lista e relida (padrao das telas do Rise: o revalidatePath da acao sozinho nao redesenhou
  // a tabela no Next 16, conferido no navegador em 06/11/2026).
  const fechar = () => {
    setJanela(null);
    router.refresh();
  };
  const somenteLeitura = podeEditar ? null : "Seu acesso a Licenças Softwares é de leitura";

  if (!programa) {
    return (
      <>
        <PageHeader titulo="Licenças Softwares" somenteLeitura={somenteLeitura} />
        <EmptyState
          icone={KeyRound}
          titulo="Nenhum programa cadastrado."
          descricao="Cadastre o programa (LightBurn, Mach3…) para começar a anotar as licenças."
          acao={
            podeEditar && (
              <button type="button" onClick={() => setJanela({ tipo: "programas" })} className={CLASSE_PRINCIPAL}>
                <Plus size={15} aria-hidden="true" /> Cadastrar programa
              </button>
            )
          }
        />
        {janela?.tipo === "programas" && <JanelaProgramas programas={todosProgramas} podeExcluir={podeExcluir} aoFechar={fechar} />}
      </>
    );
  }

  const ehChave = programa.identificacao === "CHAVE";
  const total = lista?.total ?? 0;
  const porPagina = lista?.porPagina ?? 25;
  const totalPaginas = Math.max(1, Math.ceil(total / porPagina));
  const pagina = lista?.pagina ?? 1;
  const linhas = lista?.linhas ?? [];
  const filtrando = Boolean(filtros.busca || filtros.soComVagaLivre);
  const chip = (ativo) => `rounded-full border px-3 py-1 text-xs font-medium transition-colors ${ativo ? "border-acento bg-acento/10 text-acento" : "border-borda text-suave hover:text-texto"}`;
  const licencaAberta = janela?.licencaId ? linhas.find((licenca) => licenca.id === janela.licencaId) : null;

  return (
    <>
      <PageHeader
        titulo="Licenças Softwares"
        somenteLeitura={somenteLeitura}
        acao={
          <div className="flex flex-wrap items-center gap-2">
            {programa.temPortal && <SeloDaLeitura frescor={frescor} />}
            {programa.linkPortal && (
              <a href={programa.linkPortal} target="_blank" rel="noopener" className={linkExterno}>
                <ExternalLink size={13} aria-hidden="true" /> Portal das licenças
              </a>
            )}
            {programa.linkSite && (
              <a href={programa.linkSite} target="_blank" rel="noopener" className={linkExterno}>
                <ExternalLink size={13} aria-hidden="true" /> Site do {programa.nome}
              </a>
            )}
            {programa.temInstrucoes && (
              <a href={`/api/licencas/instrucoes/${programa.id}`} className={linkExterno} title={programa.instrucoesNome ?? undefined}>
                <FileText size={13} aria-hidden="true" /> Instruções (PDF)
              </a>
            )}
            <MenuDoCabecalho
              itens={[
                podeEditar && { rotulo: "Programas", aoClicar: () => setJanela({ tipo: "programas" }) },
                programa.temPortal && { rotulo: "Histórico de leituras", aoClicar: () => setJanela({ tipo: "leituras" }) },
              ]}
            />
          </div>
        }
      />

      <nav aria-label="Programas" className="-mt-2 mb-4 flex gap-1 border-b border-borda">
        {programas.map((item) => {
          const ativa = item.id === programa.id;
          return (
            <Link
              key={item.id}
              href={`${pathname}?programa=${item.slug}`}
              aria-current={ativa ? "page" : undefined}
              className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors ${ativa ? "border-acento text-texto" : "border-transparent text-suave hover:text-texto"}`}
            >
              {item.nome}
              <span className="ml-1.5 text-xs font-normal text-suave tabular-nums">{item.totalLicencas}</span>
            </Link>
          );
        })}
      </nav>

      <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        <CampoBusca
          key={programa.id}
          valorInicial={filtros.busca}
          parametro="busca"
          rotulo={ehChave ? "Buscar chave, cliente, CPF ou nome do PC" : "Buscar licença, cliente ou CPF"}
          className="w-full max-w-xs"
        />
        {programa.temPortal && (
          <button type="button" onClick={() => alternarParametro("vaga")} aria-pressed={filtros.soComVagaLivre} className={chip(filtros.soComVagaLivre)}>
            Só com vaga livre
          </button>
        )}
        <button type="button" onClick={() => alternarParametro("arquivadas")} aria-pressed={filtros.mostrarArquivadas} className={chip(filtros.mostrarArquivadas)}>
          Mostrar arquivadas
        </button>
        <div className="ml-auto flex items-end gap-3">
          <NavegacaoDoTopo pagina={pagina} totalPaginas={totalPaginas} total={total} porPagina={porPagina} />
          <button type="button" disabled={!podeEditar} title={somenteLeitura ?? undefined} onClick={() => setJanela({ tipo: "nova" })} className={CLASSE_PRINCIPAL}>
            <Plus size={15} aria-hidden="true" /> Nova licença
          </button>
        </div>
      </div>

      {linhas.length === 0 ? (
        <EmptyState
          icone={KeyRound}
          titulo={filtrando ? "Nenhuma licença com esses filtros." : `Nenhuma licença do ${programa.nome} ainda.`}
          descricao={filtrando ? "Mude a busca ou tire um filtro." : programa.temPortal ? 'Leia o portal pela extensão ("Enviar ao Rise") ou cadastre em Nova licença.' : "Cadastre em Nova licença."}
        />
      ) : (
        <>
          <TabelaDeLicencas
            programa={programa}
            linhas={linhas}
            ordenar={filtros.ordenar}
            direcao={filtros.direcao}
            aberta={aberta}
            aoAlternar={(id) => setAberta((atual) => (atual === id ? null : id))}
            podeBaixar={podeBaixar}
            renderizarAberta={(licenca) => (
              <LinhasDaLicenca
                licenca={licenca}
                programa={programa}
                podeEditar={podeEditar}
                podeExcluir={podeExcluir}
                podeBaixar={podeBaixar}
                abrir={{
                  linha: ({ linha = null, nomeDoPc = "" }) => setJanela({ tipo: "linha", licencaId: licenca.id, linha, nomeDoPc }),
                  licenca: () => setJanela({ tipo: "licenca", licencaId: licenca.id }),
                  arquivo: () => setJanela({ tipo: "arquivo", licencaId: licenca.id }),
                }}
              />
            )}
          />
          {totalPaginas > 1 && (
            <div className="mt-4">
              <Paginacao pagina={pagina} totalPaginas={totalPaginas} total={total} primeiro={(pagina - 1) * porPagina + 1} ultimo={(pagina - 1) * porPagina + linhas.length} />
            </div>
          )}
        </>
      )}

      {janela?.tipo === "nova" && <JanelaLicenca programa={programa} tipos={tipos} podeExcluir={podeExcluir} aoFechar={fechar} />}
      {janela?.tipo === "licenca" && licencaAberta && <JanelaLicenca programa={programa} licenca={licencaAberta} tipos={tipos} podeExcluir={podeExcluir} aoFechar={fechar} />}
      {janela?.tipo === "linha" && licencaAberta && <JanelaVincularCliente licenca={licencaAberta} programa={programa} linha={janela.linha} nomeDoPcInicial={janela.nomeDoPc} aoFechar={fechar} />}
      {janela?.tipo === "arquivo" && licencaAberta && <JanelaEnviarArquivo licenca={licencaAberta} aoFechar={fechar} />}
      {janela?.tipo === "programas" && <JanelaProgramas programas={todosProgramas} podeExcluir={podeExcluir} aoFechar={fechar} />}
      {janela?.tipo === "leituras" && <JanelaHistoricoDeLeituras programa={programa} aoFechar={fechar} />}
    </>
  );
}
