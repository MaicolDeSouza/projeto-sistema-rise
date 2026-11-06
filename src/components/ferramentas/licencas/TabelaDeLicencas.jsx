"use client";

import { Fragment } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, Download } from "lucide-react";

import CabecalhoOrdenavel, { parametrosDaOrdenacao } from "@/components/ui/CabecalhoOrdenavel";
import Copiar from "@/components/ui/Copiar";

import { COR_DO_PONTO, COR_DO_TEXTO, dia, diaEmSaoPaulo, tamanho } from "./formato";

/** O "!" ambar das licencas com aviso (sumiu do portal, PC sem cliente, nome de PC repetido); o motivo vai no `title`. */
function Aviso({ avisos }) {
  if (!avisos?.length) return null;
  return (
    <span title={avisos.join("\n")} aria-label={`Aviso: ${avisos.join("; ")}`} className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-amber-400 text-[10px] leading-none font-bold text-amber-950">
      !
    </span>
  );
}

/**
 * As vagas da chave, o que o operador procura primeiro: uma bolinha por ativacao permitida (cheia = PC ativado, vazada
 * em verde = vaga livre), "1 de 3" e "2 livres". Chave nunca lida do portal diz "não lida", nunca "3 livres".
 */
export function Vagas({ vagas }) {
  if (!vagas?.lida) {
    return (
      <span className="text-suave" title='As vagas aparecem depois do "Enviar ao Rise" da extensão'>
        não lida
      </span>
    );
  }
  if (vagas.permitidas == null) return <span className="tabular-nums">{vagas.usadas === 1 ? "1 PC" : `${vagas.usadas} PCs`}</span>;
  const pontos = vagas.permitidas <= 6 ? Array.from({ length: vagas.permitidas }, (_, indice) => indice < vagas.usadas) : null;
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap" title={`${vagas.usadas} PC(s) ativado(s) de ${vagas.permitidas} permitidos`}>
      {pontos && (
        <span aria-hidden="true" className="inline-flex gap-1">
          {pontos.map((usada, indice) => (
            <span key={indice} className={`h-2.5 w-2.5 rounded-full ${usada ? "bg-slate-400" : "border-2 border-emerald-500"}`} />
          ))}
        </span>
      )}
      <span className="tabular-nums">
        {vagas.usadas} de {vagas.permitidas}
      </span>
      {vagas.livres > 0 ? <span className="font-medium text-emerald-700">{vagas.livres === 1 ? "1 livre" : `${vagas.livres} livres`}</span> : <span className="text-suave">cheia</span>}
    </span>
  );
}

function Situacao({ situacao }) {
  if (!situacao) return <span className="text-suave">—</span>;
  return (
    <span className={`inline-flex min-w-0 items-center gap-1.5 ${COR_DO_TEXTO[situacao.cor] ?? ""}`}>
      <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${COR_DO_PONTO[situacao.cor] ?? ""}`} />
      <span className="truncate">{situacao.texto}</span>
    </span>
  );
}

/** O arquivo atual do Mach3 com o Baixar; sem a acao de baixar o botao fica desabilitado, com o motivo. */
export function BotaoBaixar({ licencaId, versao = null, podeBaixar, compacto = false }) {
  const rotulo = compacto ? null : "Baixar";
  if (!podeBaixar) {
    return (
      <span title="Seu acesso não inclui baixar o arquivo da licença" className="inline-flex cursor-not-allowed items-center gap-1 rounded-md border border-borda px-2 py-1 text-xs text-suave opacity-60">
        <Download size={13} aria-hidden="true" /> {rotulo}
      </span>
    );
  }
  const endereco = `/api/licencas/arquivo/${licencaId}${versao ? `?versao=${versao}` : ""}`;
  return (
    <a
      href={endereco}
      onClick={(evento) => evento.stopPropagation()}
      title={versao ? `Baixar a versão ${versao} em zip` : "Baixar o arquivo atual em zip"}
      aria-label={versao ? `Baixar a versão ${versao}` : "Baixar o arquivo atual"}
      className="inline-flex items-center gap-1 rounded-md border border-borda px-2 py-1 text-xs font-medium transition-colors hover:bg-fundo"
    >
      <Download size={13} aria-hidden="true" /> {rotulo}
    </a>
  );
}

/**
 * As licencas de um programa. Programa de chave (LightBurn): Chave, Tipo e, com portal, Situação, Ativações e Último
 * uso; depois Clientes e Renovada em. Programa de arquivo (Mach3): Nome licenciado, Arquivo, Clientes e Última entrega.
 * A linha abre as linhas de cliente (clique na linha ou na seta); `renderizarAberta` desenha o que vai dentro.
 */
export default function TabelaDeLicencas({ programa, linhas, ordenar, direcao, aberta, aoAlternar, renderizarAberta, podeBaixar }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const ehChave = programa.identificacao === "CHAVE";
  const comPortal = ehChave && programa.temPortal;

  function trocarOrdenacao(campo) {
    const texto = parametrosDaOrdenacao(searchParams, campo, ordenar, direcao).toString();
    router.push(texto ? `${pathname}?${texto}` : pathname);
  }

  const cabecalho = (campo, rotulo, className = "") => <CabecalhoOrdenavel campo={campo} rotulo={rotulo} ordenar={ordenar} direcao={direcao} aoClicar={trocarOrdenacao} className={`whitespace-nowrap ${className}`} />;
  const colunas = ehChave ? (comPortal ? 8 : 5) : 5;

  return (
    // `relative`: o rotulo escondido (sr-only, posicao absoluta) do cabecalho da seta escapava da rolagem da caixa e
    // esticava a pagina inteira na largura de notebook pequeno.
    <div className="relative overflow-x-auto rounded-lg border border-borda bg-superficie">
      <table className={`w-full table-fixed text-sm ${comPortal ? "min-w-[64rem]" : "min-w-[54rem]"}`}>
        <colgroup>
          {ehChave ? (
            <>
              {/* A chave tem 41 caracteres: a coluna mostra o comeco (o que o dono reconhece), o resto abre ao passar o
                  mouse e o Copiar leva a chave inteira. Com ela inteira, a coluna Clientes sumia em tela de notebook. */}
              <col style={{ width: "15rem" }} />
              <col style={{ width: "4.5rem" }} />
              {comPortal && <col style={{ width: "9rem" }} />}
              {comPortal && <col style={{ width: "9.5rem" }} />}
              {comPortal && <col style={{ width: "7rem" }} />}
              <col />
              <col style={{ width: "7.5rem" }} />
            </>
          ) : (
            <>
              <col style={{ width: "14rem" }} />
              <col style={{ width: "17rem" }} />
              <col />
              <col style={{ width: "8.5rem" }} />
            </>
          )}
          <col style={{ width: "2.5rem" }} />
        </colgroup>
        <thead className="border-b border-borda bg-fundo text-left text-xs tracking-wide text-suave uppercase">
          <tr>
            {cabecalho("identificador", ehChave ? "Chave" : "Nome licenciado")}
            {ehChave ? (
              <>
                {cabecalho("tipo", "Tipo")}
                {comPortal && cabecalho("situacao", "Situação")}
                {comPortal && cabecalho("livres", "Ativações")}
                {comPortal && cabecalho("ultimoUso", "Último uso")}
                {cabecalho("clientes", "Clientes")}
                {cabecalho("renovadaEm", "Renovada em")}
              </>
            ) : (
              <>
                <th className="px-3 py-2.5 font-medium">Arquivo</th>
                {cabecalho("clientes", "Clientes")}
                {cabecalho("ultimaEntrega", "Última entrega")}
              </>
            )}
            <th className="px-2 py-2.5">
              <span className="sr-only">Abrir</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-borda">
          {linhas.map((licenca) => {
            const estaAberta = aberta === licenca.id;
            const nomes = licenca.clientes.map((cliente) => cliente.nome).join(", ");
            return (
              <Fragment key={licenca.id}>
                <tr onClick={() => aoAlternar(licenca.id)} className={`cursor-pointer transition-colors ${estaAberta ? "bg-fundo/70" : "hover:bg-fundo/40"} ${licenca.arquivada ? "text-suave" : ""}`}>
                  <td className="group px-3 py-2">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <span className={`truncate ${ehChave ? "font-mono text-[12px] tracking-tight" : "font-medium"}`}>{licenca.identificador}</span>
                      <Copiar texto={licenca.identificador} rotulo={ehChave ? "a chave" : "o nome"} />
                      <Aviso avisos={licenca.avisos} />
                      {licenca.arquivada && <span className="shrink-0 rounded border border-borda px-1.5 text-[11px] text-suave">arquivada</span>}
                    </div>
                  </td>
                  {ehChave ? (
                    <>
                      <td className="truncate px-3 py-2">{licenca.tipo ?? <span className="text-suave">—</span>}</td>
                      {comPortal && (
                        <td className="px-3 py-2">
                          <Situacao situacao={licenca.situacao} />
                        </td>
                      )}
                      {comPortal && (
                        <td className="px-3 py-2">
                          <Vagas vagas={licenca.vagas} />
                        </td>
                      )}
                      {comPortal && (
                        <td className="px-3 py-2 tabular-nums">
                          {licenca.ultimoUso ? diaEmSaoPaulo(licenca.ultimoUso) : <span className="text-suave">{licenca.vagas?.lida ? "nunca" : "—"}</span>}
                        </td>
                      )}
                      <td className="truncate px-3 py-2" title={nomes || undefined}>
                        {nomes || <span className="text-suave">sem cliente</span>}
                      </td>
                      <td className="px-3 py-2 tabular-nums">{licenca.renovadaEm ? dia(licenca.renovadaEm) : <span className="text-suave">—</span>}</td>
                    </>
                  ) : (
                    <>
                      <td className="px-3 py-2">
                        {licenca.arquivoAtual ? (
                          <span className="flex min-w-0 items-center gap-2">
                            <span className="truncate tabular-nums" title={`sha256 ${licenca.arquivoAtual.sha256}`}>
                              v{licenca.arquivoAtual.versao} · {licenca.arquivoAtual.nomeOriginal} · {tamanho(licenca.arquivoAtual.tamanhoBytes)}
                            </span>
                            <BotaoBaixar licencaId={licenca.id} podeBaixar={podeBaixar} />
                          </span>
                        ) : (
                          <span className="text-red-700">sem arquivo</span>
                        )}
                      </td>
                      <td className="truncate px-3 py-2" title={nomes || undefined}>
                        {nomes || <span className="text-suave">sem cliente</span>}
                      </td>
                      <td className="px-3 py-2 tabular-nums">{licenca.ultimaEntrega ? dia(licenca.ultimaEntrega) : <span className="text-suave">—</span>}</td>
                    </>
                  )}
                  <td className="px-2 py-2 text-right">
                    <button
                      type="button"
                      onClick={(evento) => {
                        evento.stopPropagation();
                        aoAlternar(licenca.id);
                      }}
                      aria-expanded={estaAberta}
                      aria-label={estaAberta ? "Fechar as linhas da licença" : "Abrir as linhas da licença"}
                      className="rounded p-1 text-suave transition-colors hover:bg-fundo hover:text-texto"
                    >
                      <ChevronDown size={16} className={`transition-transform duration-150 ${estaAberta ? "rotate-180" : ""}`} />
                    </button>
                  </td>
                </tr>
                {estaAberta && (
                  <tr>
                    <td colSpan={colunas} className="border-t border-borda bg-fundo/50 px-4 pt-3 pb-4">
                      {renderizarAberta(licenca)}
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
