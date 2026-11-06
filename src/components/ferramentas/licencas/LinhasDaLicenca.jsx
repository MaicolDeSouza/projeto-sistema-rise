"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MoreVertical, Pencil, Plus, Upload, UserPlus } from "lucide-react";

import { encerrarLinhaAcao, excluirLinhaAcao, reabrirLinhaAcao } from "@/app/ferramentas/licencas/acoes";
import Pergunta from "@/components/compras/Pergunta";
import { rotuloDoCanal } from "@/lib/ferramentas/licencas/regras";

import { CLASSE_BOTAO, CLASSE_PRINCIPAL, dia, diaEHora, diaEmSaoPaulo, pedidoCurto, tamanho } from "./formato";
import { BotaoBaixar } from "./TabelaDeLicencas";

/**
 * O menu ⋮ de uma linha: fecha no clique fora, no Esc e ao rolar. Abre em posicao FIXA, calculada do botao: dentro das
 * tabelas com rolagem horizontal um menu `absolute` ficava cortado pela caixa (e o clique nele nao chegava).
 */
function MenuDaLinha({ itens }) {
  const [posicao, setPosicao] = useState(null);
  const raiz = useRef(null);
  const aberto = posicao !== null;
  useEffect(() => {
    if (!aberto) return undefined;
    const fechar = () => setPosicao(null);
    const fora = (evento) => {
      if (!raiz.current?.contains(evento.target)) fechar();
    };
    const tecla = (evento) => {
      if (evento.key === "Escape") fechar();
    };
    document.addEventListener("mousedown", fora);
    document.addEventListener("keydown", tecla);
    window.addEventListener("scroll", fechar, true);
    window.addEventListener("resize", fechar);
    return () => {
      document.removeEventListener("mousedown", fora);
      document.removeEventListener("keydown", tecla);
      window.removeEventListener("scroll", fechar, true);
      window.removeEventListener("resize", fechar);
    };
  }, [aberto]);
  const visiveis = itens.filter(Boolean);
  if (!visiveis.length) return null;
  function alternar(evento) {
    if (aberto) return setPosicao(null);
    const caixa = evento.currentTarget.getBoundingClientRect();
    setPosicao({ top: caixa.bottom + 4, right: Math.max(8, document.documentElement.clientWidth - caixa.right) });
  }
  return (
    <div ref={raiz}>
      <button type="button" onClick={alternar} aria-haspopup="menu" aria-expanded={aberto} aria-label="Mais ações da linha" className="rounded p-1 text-suave transition-colors hover:bg-superficie hover:text-texto">
        <MoreVertical size={15} />
      </button>
      {aberto && (
        <div role="menu" style={{ top: posicao.top, right: posicao.right }} className="fixed z-40 w-36 overflow-hidden rounded-md border border-borda bg-superficie py-1 text-sm shadow-lg">
          {visiveis.map((item) => (
            <button
              key={item.rotulo}
              type="button"
              role="menuitem"
              disabled={item.desabilitado}
              title={item.dica}
              onClick={() => {
                setPosicao(null);
                item.aoClicar();
              }}
              className={`block w-full px-3 py-1.5 text-left transition-colors hover:bg-fundo disabled:cursor-not-allowed disabled:opacity-50 ${item.destrutivo ? "text-red-700" : ""}`}
            >
              {item.rotulo}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Cliente({ linha }) {
  if (linha.cliente) {
    return (
      <span className="flex min-w-0 flex-col">
        <a href={`/cadastros/clientes/${linha.cliente.id}`} target="_blank" rel="noopener" className="truncate hover:text-acento hover:underline" title={linha.cliente.nome}>
          {linha.cliente.nome}
        </a>
        {linha.cliente.documento && <span className="text-xs text-suave tabular-nums">{linha.cliente.documento}</span>}
      </span>
    );
  }
  return (
    <span className="flex min-w-0 flex-col" title="Linha da planilha sem CPF/CNPJ: escolha o cliente no lápis">
      <span className="truncate text-amber-800">{linha.nomeAnotado ?? "(sem nome)"}</span>
      <span className="text-xs text-amber-700">sem cliente</span>
    </span>
  );
}

const th = "px-2 py-1.5 font-medium";
const td = "px-2 py-1.5 align-top";

/**
 * O que a licenca aberta mostra (spec §6.6): as linhas de cliente (as `linhasIniciais` de saida, as vazias com o
 * Vincular cliente), os PCs do portal sem cliente, o historico das encerradas e, no programa de arquivo, as versoes.
 * As janelas sao da tela (`abrir.linha`, `abrir.licenca`, `abrir.arquivo`); Encerrar e Excluir perguntam aqui.
 */
export default function LinhasDaLicenca({ licenca, programa, podeEditar, podeExcluir, podeBaixar, abrir }) {
  const router = useRouter();
  const [pergunta, setPergunta] = useState(null);
  const [erro, setErro] = useState(null);
  const [ocupado, iniciar] = useTransition();
  const comPortal = programa.temPortal;
  const ehArquivo = programa.identificacao === "ARQUIVO";
  const vazias = Math.max(0, programa.linhasIniciais - licenca.linhas.length);
  const motivoSemEditar = !podeEditar ? "Seu acesso a Licenças é de leitura" : licenca.arquivada ? "Licença arquivada: desarquive em Editar licença" : null;
  const colunas = comPortal ? 10 : 8;

  function executar(acao) {
    setErro(null);
    iniciar(async () => {
      const resultado = await acao();
      if (!resultado?.ok) setErro(resultado?.erro ?? "Não foi possível concluir.");
      else router.refresh();
      setPergunta(null);
    });
  }

  const quemDaLinha = (linha) => linha.cliente?.nome ?? linha.nomeAnotado ?? "a linha";

  return (
    <div className="space-y-4">
      <div className="relative overflow-x-auto rounded-md border border-borda bg-superficie">
        <table className="w-full text-sm">
          <thead className="border-b border-borda text-left text-xs text-suave">
            <tr>
              <th className={`${th} w-8 text-right`}>Nº</th>
              <th className={th}>Cliente</th>
              <th className={th}>Data</th>
              <th className={th}>Canal</th>
              <th className={th}>Pedido</th>
              {comPortal && <th className={th}>Nome do PC</th>}
              <th className={th}>Equipamento</th>
              {comPortal && <th className={th}>Último uso</th>}
              <th className={th}>Obs.</th>
              <th className={`${th} w-16`}>
                <span className="sr-only">Ações</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-borda">
            {licenca.linhas.map((linha, indice) => (
              <tr key={linha.id}>
                <td className={`${td} text-right text-suave tabular-nums`}>{indice + 1}</td>
                <td className={`${td} max-w-56`}>
                  <Cliente linha={linha} />
                </td>
                <td className={`${td} tabular-nums`}>{dia(linha.data) || <span className="text-suave">—</span>}</td>
                <td className={td}>{linha.canal ? rotuloDoCanal(linha.canal) : <span className="text-suave">—</span>}</td>
                <td className={td}>
                  {linha.pedido ? (
                    <a href={`/pedidos/${linha.pedido.id}`} target="_blank" rel="noopener" title={`Pedido ${linha.pedido.numero}`} className="tabular-nums hover:text-acento hover:underline">
                      {pedidoCurto(linha.pedido.numero)}
                    </a>
                  ) : (
                    <span className="text-suave">—</span>
                  )}
                </td>
                {comPortal && <td className={`${td} max-w-40 truncate`}>{linha.nomeDoPc ?? <span className="text-suave">—</span>}</td>}
                <td className={`${td} max-w-40 truncate`} title={linha.equipamento ?? undefined}>
                  {linha.equipamento ?? <span className="text-suave">—</span>}
                </td>
                {comPortal && (
                  <td className={`${td} whitespace-nowrap tabular-nums`}>
                    {linha.ativacao ? (
                      <span title={`${linha.ativacao.hostname}${linha.ativacao.so ? ` · ${linha.ativacao.so}` : ""}`}>{diaEmSaoPaulo(linha.ativacao.ultimaSincronizacaoEm) || "ativado"}</span>
                    ) : (
                      <span className="text-suave">{licenca.vagas?.lida ? "ainda não ativou" : "—"}</span>
                    )}
                  </td>
                )}
                <td className={`${td} max-w-56 truncate`} title={linha.observacoes ?? undefined}>
                  {linha.observacoes ?? <span className="text-suave">—</span>}
                </td>
                <td className={td}>
                  <div className="flex items-center justify-end gap-0.5">
                    <button type="button" disabled={Boolean(motivoSemEditar)} title={motivoSemEditar ?? "Editar a linha"} aria-label="Editar a linha" onClick={() => abrir.linha({ linha })} className="rounded p-1 text-suave transition-colors hover:bg-fundo hover:text-texto disabled:cursor-not-allowed disabled:opacity-40">
                      <Pencil size={14} />
                    </button>
                    <MenuDaLinha
                      itens={[
                        podeEditar && { rotulo: "Encerrar", aoClicar: () => setPergunta({ tipo: "encerrar", linha }) },
                        podeExcluir && { rotulo: "Excluir", destrutivo: true, aoClicar: () => setPergunta({ tipo: "excluir", linha }) },
                      ]}
                    />
                  </div>
                </td>
              </tr>
            ))}
            {Array.from({ length: vazias }, (_, indice) => (
              <tr key={`vazia-${indice}`}>
                <td className={`${td} text-right text-suave tabular-nums`}>{licenca.linhas.length + indice + 1}</td>
                <td className={td} colSpan={colunas - 1}>
                  <span className="flex items-center gap-3">
                    <span className="text-suave">(sem cliente)</span>
                    <button type="button" disabled={Boolean(motivoSemEditar)} title={motivoSemEditar ?? undefined} onClick={() => abrir.linha({})} className={`${CLASSE_PRINCIPAL} px-2.5! py-1! text-xs!`}>
                      <UserPlus size={13} aria-hidden="true" /> Vincular cliente
                    </button>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {licenca.pcsSemCliente.length > 0 && (
        <section aria-label="PCs sem cliente">
          <h3 className="mb-1.5 text-xs font-semibold text-amber-800">{licenca.pcsSemCliente.length === 1 ? "1 PC ativado sem cliente" : `${licenca.pcsSemCliente.length} PCs ativados sem cliente`}</h3>
          <div className="relative overflow-x-auto rounded-md border border-amber-200 bg-superficie">
            <table className="w-full text-sm">
              <thead className="border-b border-amber-200 text-left text-xs text-suave">
                <tr>
                  <th className={th}>Nome do PC</th>
                  <th className={th}>Sistema</th>
                  <th className={th}>Ativado em</th>
                  <th className={th}>Último uso</th>
                  <th className={`${th} w-40`}>
                    <span className="sr-only">Ação</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-borda">
                {licenca.pcsSemCliente.map((pc) => (
                  <tr key={pc.id}>
                    <td className={`${td} font-mono text-[12px]`}>{pc.hostname}</td>
                    <td className={td}>{pc.so ?? <span className="text-suave">—</span>}</td>
                    <td className={`${td} tabular-nums`}>{diaEmSaoPaulo(pc.criadaEm) || <span className="text-suave">—</span>}</td>
                    <td className={`${td} tabular-nums`}>{diaEmSaoPaulo(pc.ultimaSincronizacaoEm) || <span className="text-suave">—</span>}</td>
                    <td className={`${td} text-right`}>
                      <button type="button" disabled={Boolean(motivoSemEditar)} title={motivoSemEditar ?? "Abre o Vincular cliente com este nome de PC"} onClick={() => abrir.linha({ nomeDoPc: pc.hostname })} className={`${CLASSE_BOTAO} px-2! py-1! text-xs!`}>
                        Atribuir à linha…
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {ehArquivo && (
        <section aria-label="Versões do arquivo">
          <div className="mb-1.5 flex items-center gap-3">
            <h3 className="text-xs font-semibold text-suave">Versões do arquivo</h3>
            <button type="button" disabled={!podeEditar} title={podeEditar ? "Cria a versão seguinte; as anteriores ficam" : "Seu acesso a Licenças é de leitura"} onClick={abrir.arquivo} className={`${CLASSE_BOTAO} px-2! py-1! text-xs!`}>
              <Upload size={13} aria-hidden="true" /> Enviar arquivo
            </button>
          </div>
          {licenca.arquivos.length === 0 ? (
            <p className="text-sm text-red-700">Esta licença não tem arquivo.</p>
          ) : (
            <div className="relative overflow-x-auto rounded-md border border-borda bg-superficie">
              <table className="w-full text-sm">
                <thead className="border-b border-borda text-left text-xs text-suave">
                  <tr>
                    <th className={th}>Versão</th>
                    <th className={th}>Arquivo</th>
                    <th className={th}>Tamanho</th>
                    <th className={th}>Soma</th>
                    <th className={th}>Enviado em</th>
                    <th className={th}>Por</th>
                    <th className={`${th} w-20`}>
                      <span className="sr-only">Baixar</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-borda">
                  {licenca.arquivos.map((arquivo) => (
                    <tr key={arquivo.id}>
                      <td className={`${td} tabular-nums`}>
                        v{arquivo.versao}
                        {arquivo.atual && <span className="ml-1.5 rounded bg-emerald-50 px-1.5 text-[11px] font-medium text-emerald-700">atual</span>}
                      </td>
                      <td className={td}>{arquivo.nomeOriginal}</td>
                      <td className={`${td} tabular-nums`}>{tamanho(arquivo.tamanhoBytes)}</td>
                      <td className={`${td} font-mono text-[12px] text-suave`} title={`sha256 ${arquivo.sha256}`}>
                        {arquivo.sha256.slice(0, 10)}
                      </td>
                      <td className={`${td} tabular-nums`}>{diaEHora(arquivo.enviadoEm)}</td>
                      <td className={`${td} max-w-32 truncate`} title={arquivo.observacao ?? undefined}>
                        {arquivo.enviadoPor ?? <span className="text-suave">—</span>}
                      </td>
                      <td className={`${td} text-right`}>
                        <BotaoBaixar licencaId={licenca.id} versao={arquivo.atual ? null : arquivo.versao} podeBaixar={podeBaixar} compacto />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {licenca.historico.length > 0 && (
        <details className="group">
          <summary className="cursor-pointer text-xs font-semibold text-suave select-none hover:text-texto">{licenca.historico.length === 1 ? "1 linha encerrada" : `${licenca.historico.length} linhas encerradas`}</summary>
          <div className="relative mt-1.5 overflow-x-auto rounded-md border border-borda bg-superficie">
            <table className="w-full text-sm text-suave">
              <tbody className="divide-y divide-borda">
                {licenca.historico.map((linha) => (
                  <tr key={linha.id}>
                    <td className={`${td} max-w-56`}>
                      <Cliente linha={linha} />
                    </td>
                    <td className={`${td} tabular-nums`}>{dia(linha.data)}</td>
                    {comPortal && <td className={td}>{linha.nomeDoPc ?? "—"}</td>}
                    <td className={`${td} max-w-56 truncate`} title={linha.observacoes ?? undefined}>
                      {linha.observacoes ?? ""}
                    </td>
                    <td className={`${td} whitespace-nowrap tabular-nums`}>{linha.encerradaEm ? `encerrada em ${diaEmSaoPaulo(linha.encerradaEm)}` : "encerrada"}</td>
                    <td className={`${td} text-right`}>
                      <div className="flex items-center justify-end gap-1">
                        <button type="button" disabled={!podeEditar || ocupado} title={podeEditar ? "Volta para as linhas ativas" : "Seu acesso a Licenças é de leitura"} onClick={() => executar(() => reabrirLinhaAcao(linha.id))} className={`${CLASSE_BOTAO} px-2! py-0.5! text-xs!`}>
                          Reabrir
                        </button>
                        {podeExcluir && <MenuDaLinha itens={[{ rotulo: "Excluir", destrutivo: true, aoClicar: () => setPergunta({ tipo: "excluir", linha }) }]} />}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" disabled={Boolean(motivoSemEditar)} title={motivoSemEditar ?? "Mais uma linha de cliente nesta licença"} onClick={() => abrir.linha({})} className={CLASSE_BOTAO}>
          <Plus size={14} aria-hidden="true" /> Adicionar linha
        </button>
        <button type="button" disabled={!podeEditar} title={podeEditar ? undefined : "Seu acesso a Licenças é de leitura"} onClick={abrir.licenca} className={CLASSE_BOTAO}>
          <Pencil size={14} aria-hidden="true" /> Editar licença
        </button>
        <span className="ml-auto flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-suave">
          {licenca.compradaEm && <span>Comprada em {dia(licenca.compradaEm)}</span>}
          {licenca.observacoes && (
            <span className="max-w-md truncate" title={licenca.observacoes}>
              {licenca.observacoes}
            </span>
          )}
        </span>
      </div>

      {erro && (
        <p role="alert" className="text-sm text-red-600">
          {erro}
        </p>
      )}

      {pergunta?.tipo === "encerrar" && (
        <Pergunta titulo={`Encerrar a linha de ${quemDaLinha(pergunta.linha)}?`} confirmar="Encerrar" ocupado={ocupado} aoRecuar={() => setPergunta(null)} aoConfirmar={() => executar(() => encerrarLinhaAcao(pergunta.linha.id))}>
          A linha sai das ativas e vai para o histórico desta licença. Dá para reabrir depois.
        </Pergunta>
      )}
      {pergunta?.tipo === "excluir" && (
        <Pergunta titulo={`Excluir a linha de ${quemDaLinha(pergunta.linha)}?`} confirmar="Excluir" destrutiva ocupado={ocupado} aoRecuar={() => setPergunta(null)} aoConfirmar={() => executar(() => excluirLinhaAcao(pergunta.linha.id))}>
          Sai do Rise: {quemDaLinha(pergunta.linha)}
          {pergunta.linha.data ? `, ${dia(pergunta.linha.data)}` : ""}
          {pergunta.linha.nomeDoPc ? `, PC ${pergunta.linha.nomeDoPc}` : ""}. O cliente continua no cadastro.
        </Pergunta>
      )}
    </div>
  );
}
