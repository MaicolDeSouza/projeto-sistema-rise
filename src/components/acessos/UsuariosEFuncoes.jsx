"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Lock, Plus, UsersRound } from "lucide-react";

import { BarraDeAbas, Painel } from "@/components/cadastros/Abas";
import Badge from "@/components/ui/Badge";
import CampoBusca from "@/components/ui/CampoBusca";
import EmptyState from "@/components/ui/EmptyState";
import PageHeader from "@/components/ui/PageHeader";

const ABAS = [
  { id: "usuarios", rotulo: "Usuários" },
  { id: "funcoes", rotulo: "Funções" },
];

const BOTAO_PRINCIPAL =
  "inline-flex items-center gap-1.5 rounded-md bg-acento px-3 py-2 text-sm font-medium text-white transition-opacity duration-150 hover:opacity-90 focus-visible:ring-2 focus-visible:ring-acento focus-visible:ring-offset-2 focus-visible:outline-none";
const CABECALHO = "px-4 py-2 font-medium";
const CELULA = "px-4 py-2.5";
const LINHA = "cursor-pointer border-b border-borda/60 transition-[background-color] duration-150 last:border-b-0 hover:bg-fundo";
const LINK_DA_LINHA = "font-medium hover:underline focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-acento focus-visible:outline-none";

function SeloDaFuncao({ funcao }) {
  return (
    <Badge>
      {funcao.fixa && <Lock size={11} className="mr-1" aria-hidden="true" />}
      {funcao.nome}
    </Badge>
  );
}

/**
 * A tela Usuarios e funcoes: duas abas no desenho do cadastro de Produto (as duas tabelas montadas, so escondidas), a
 * acao principal do cabecalho trocando com a aba. A linha inteira abre o cadastro; o nome e o link de teclado.
 * Selos so quando ha o que dizer ("você", "inativo", "Administrador pelo .env"): regra 4 do Padrao visual.
 */
export default function UsuariosEFuncoes({ abaInicial, busca, inativos, meuLogin, usuarios, funcoes }) {
  const [aba, setAba] = useState(abaInicial);
  const router = useRouter();
  const pathname = usePathname();
  const parametros = useSearchParams();

  function trocarParametro(nome, valor) {
    const proximos = new URLSearchParams(parametros.toString());
    if (valor) proximos.set(nome, valor);
    else proximos.delete(nome);
    const consulta = proximos.toString();
    router.replace(consulta ? `${pathname}?${consulta}` : pathname, { scroll: false });
  }

  function mudarAba(id) {
    setAba(id);
    trocarParametro("aba", id === "funcoes" ? "funcoes" : null);
  }

  const acao =
    aba === "usuarios" ? (
      <Link href="/configuracoes/usuarios/novo" className={BOTAO_PRINCIPAL}>
        <Plus size={15} aria-hidden="true" /> Adicionar usuário
      </Link>
    ) : (
      <Link href="/configuracoes/funcoes/nova" className={BOTAO_PRINCIPAL}>
        <Plus size={15} aria-hidden="true" /> Criar função
      </Link>
    );

  const soEu = !busca && !inativos && usuarios.every((usuario) => usuario.login === meuLogin);

  return (
    <>
      <PageHeader titulo="Usuários e funções" voltarPara="/configuracoes" voltarRotulo="Configurações" acao={acao} />

      <div className="overflow-hidden rounded-lg border border-borda bg-superficie">
        <BarraDeAbas abas={ABAS} aba={aba} aoMudar={mudarAba} comErro={() => false} />

        <Painel id="usuarios" aba={aba}>
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 pt-4">
            <CampoBusca valorInicial={busca} rotulo="Buscar por nome ou login" className="w-full max-w-sm" />
            <label className="inline-flex items-center gap-2 text-sm text-suave">
              <input
                type="checkbox"
                checked={inativos}
                onChange={(evento) => trocarParametro("inativos", evento.target.checked ? "1" : null)}
                className="h-4 w-4 accent-emerald-600"
              />
              Mostrar inativos
            </label>
          </div>

          {soEu ? (
            <div className="p-4">
              <EmptyState
                icone={UsersRound}
                titulo="Só você entra no Rise por enquanto."
                acao={
                  <Link href="/configuracoes/usuarios/novo" className={BOTAO_PRINCIPAL}>
                    <Plus size={15} aria-hidden="true" /> Adicionar usuário
                  </Link>
                }
              />
            </div>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-y border-borda text-left text-xs tracking-wide text-suave uppercase">
                    <th className={CABECALHO}>Nome</th>
                    <th className={CABECALHO}>Login</th>
                    <th className={CABECALHO}>Funções</th>
                    <th className={CABECALHO}>Último acesso</th>
                  </tr>
                </thead>
                <tbody>
                  {usuarios.map((usuario) => (
                    <tr
                      key={usuario.id}
                      onClick={() => router.push(`/configuracoes/usuarios/${usuario.id}`)}
                      className={`${LINHA} ${usuario.ativo ? "" : "opacity-60"}`}
                    >
                      <td className={CELULA}>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Link href={`/configuracoes/usuarios/${usuario.id}`} className={LINK_DA_LINHA} onClick={(evento) => evento.stopPropagation()}>
                            {usuario.nome}
                          </Link>
                          {usuario.login === meuLogin && <Badge tom="info">você</Badge>}
                          {!usuario.ativo && <Badge>inativo</Badge>}
                          {usuario.peloEnv && <Badge tom="sucesso">Administrador pelo .env</Badge>}
                        </div>
                      </td>
                      <td className={`${CELULA} text-suave`}>{usuario.login}</td>
                      <td className={CELULA}>
                        <div className="flex flex-wrap gap-1">
                          {usuario.funcoes.map((funcao) => (
                            <SeloDaFuncao key={funcao.id} funcao={funcao} />
                          ))}
                        </div>
                      </td>
                      <td className={`${CELULA} text-suave tabular-nums`} title={usuario.ultimoAcesso.titulo}>
                        {usuario.ultimoAcesso.texto}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {usuarios.length === 0 && <p className="px-4 py-6 text-sm text-suave">Nenhum usuário encontrado.</p>}
            </div>
          )}
        </Painel>

        <Painel id="funcoes" aba={aba}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-borda text-left text-xs tracking-wide text-suave uppercase">
                  <th className={CABECALHO}>Nome</th>
                  <th className={CABECALHO}>Descrição</th>
                  <th className={`${CABECALHO} text-right`}>Usuários</th>
                  <th className={`${CABECALHO} text-right`}>Telas liberadas</th>
                </tr>
              </thead>
              <tbody>
                {funcoes.map((funcao) => (
                  <tr key={funcao.id} onClick={() => router.push(`/configuracoes/funcoes/${funcao.id}`)} className={LINHA}>
                    <td className={CELULA}>
                      <Link href={`/configuracoes/funcoes/${funcao.id}`} className={`${LINK_DA_LINHA} inline-flex items-center gap-1`} onClick={(evento) => evento.stopPropagation()}>
                        {funcao.fixa && <Lock size={13} className="text-suave" aria-label="Função fixa" />}
                        {funcao.nome}
                      </Link>
                    </td>
                    <td className={`${CELULA} max-w-md truncate text-suave`} title={funcao.descricao || undefined}>
                      {funcao.descricao}
                    </td>
                    <td className={`${CELULA} text-right tabular-nums`}>{funcao.usuarios}</td>
                    <td className={`${CELULA} text-right text-suave tabular-nums`}>
                      {funcao.telasLiberadas.liberados} de {funcao.telasLiberadas.total}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Painel>
      </div>
    </>
  );
}
