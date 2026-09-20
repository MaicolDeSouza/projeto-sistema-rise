"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ExternalLink, Pencil, Trash2 } from "lucide-react";

import { excluirParceiro } from "@/app/cadastros/acoes";
import { PARCEIROS } from "@/lib/cadastros";
import Badge from "@/components/ui/Badge";
import CampoBusca from "@/components/ui/CampoBusca";
import PopupExclusao from "./PopupExclusao";

/**
 * Lista de fornecedores, concorrentes ou transportadoras (`slug`). Uma tabela so
 * para os tres; as colunas que mudam vem da configuracao em `PARCEIROS`:
 * "Coleta" so onde o cadastro pode ter site varrido, e a coluna de uso
 * ("Produtos" do fornecedor, "Clientes" da transportadora) so onde algo usa o
 * cadastro — e e o numero que impede a exclusao.
 *
 * A coluna "Coleta" mostra a fonte ligada em Mercados, e nao o cadastro dela:
 * quem quer mexer na varredura precisa saber se a fonte esta ativa ou pausada
 * sem sair daqui.
 */
export default function TabelaParceiros({ linhas, slug, busca }) {
  const [alvo, setAlvo] = useState(null);
  const [erro, setErro] = useState(null);
  const [pendente, iniciarTransicao] = useTransition();
  const config = PARCEIROS[slug];
  const temColeta = config.tiposDeFonte.length > 0;

  function fechar() {
    setAlvo(null);
    setErro(null);
  }

  function excluir() {
    iniciarTransicao(async () => {
      const resultado = await excluirParceiro(slug, alvo.id);
      if (resultado.ok) fechar();
      else setErro(resultado.erro);
    });
  }

  return (
    <>
      <CampoBusca
        valorInicial={busca}
        rotulo={`Buscar ${config.singular}`}
      />

      {linhas.length === 0 ? (
        <p className="rounded-lg border border-dashed border-borda bg-superficie px-4 py-8 text-center text-sm text-suave">
          {busca
            ? `Nenhum resultado para "${busca}".`
            : temColeta
              ? `Nada cadastrado ainda. Use o botao ${config.novo}, ou salve uma fonte em Mercados.`
              : `Nada cadastrado ainda. Use o botao ${config.novo}.`}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-borda bg-superficie">
          <table className="w-full text-sm">
            <thead className="border-b border-borda bg-fundo text-left text-xs tracking-wide text-suave uppercase">
              <tr className="divide-x divide-borda">
                <th className="px-3 py-2.5 font-medium">Nome</th>
                <th className="px-3 py-2.5 font-medium">Contato</th>
                <th className="px-3 py-2.5 font-medium">Site</th>
                {temColeta && <th className="px-3 py-2.5 font-medium">Coleta</th>}
                {config.usos && (
                  <th className="px-3 py-2.5 text-right font-medium">{config.usos}</th>
                )}
                <th className="px-3 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-borda">
              {linhas.map((linha) => (
                <tr key={linha.id} className="align-top">
                  <td className="px-3 py-2.5">
                    <Link
                      href={`/cadastros/${slug}/${linha.id}`}
                      className="font-medium hover:text-acento"
                    >
                      {linha.nome}
                    </Link>
                    {linha.fantasia && (
                      <span className="ml-2 text-xs text-suave">{linha.fantasia}</span>
                    )}
                    {!linha.ativo && (
                      <span className="ml-2 align-middle">
                        <Badge>Inativo</Badge>
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-suave">{linha.contato || "—"}</td>
                  <td className="px-3 py-2.5">
                    {linha.site ? (
                      <a
                        href={linha.site}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-acento hover:underline"
                      >
                        {linha.site.replace(/^https?:\/\//, "")}
                        <ExternalLink size={12} />
                      </a>
                    ) : (
                      <span className="text-suave">—</span>
                    )}
                  </td>
                  {temColeta && (
                    <td className="px-3 py-2.5">
                      {linha.fonte ? (
                        <Link href={`/mercados/fontes?tipo=${linha.fonte.tipo === "FORNECEDOR" ? "FORNECEDOR" : "CONCORRENTE"}`}>
                          <Badge tom={linha.fonte.ativa ? "sucesso" : "neutro"}>
                            {linha.fonte.ativa ? "Ativa" : "Pausada"}
                          </Badge>
                        </Link>
                      ) : (
                        <span className="text-suave">—</span>
                      )}
                    </td>
                  )}
                  {config.usos && (
                    <td className="px-3 py-2.5 text-right tabular-nums">{linha.usos}</td>
                  )}
                  <td className="px-3 py-2.5">
                    <div className="flex justify-end gap-1">
                      <Link
                        href={`/cadastros/${slug}/${linha.id}`}
                        aria-label={`Editar ${linha.nome}`}
                        className="rounded p-1.5 text-suave hover:bg-fundo hover:text-texto"
                      >
                        <Pencil size={15} />
                      </Link>
                      <button
                        type="button"
                        onClick={() => setAlvo(linha)}
                        aria-label={`Excluir ${linha.nome}`}
                        className="rounded p-1.5 text-suave hover:bg-fundo hover:text-red-600"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {alvo && (
        <PopupExclusao
          titulo={`Excluir ${config.singular}?`}
          nome={alvo.nome}
          aviso={
            alvo.fonte
              ? "A fonte de coleta ligada em Mercados continua cadastrada."
              : null
          }
          erro={erro}
          pendente={pendente}
          aoConfirmar={excluir}
          aoCancelar={fechar}
        />
      )}
    </>
  );
}
