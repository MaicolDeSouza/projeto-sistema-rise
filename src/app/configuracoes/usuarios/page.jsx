import UsuariosEFuncoes from "@/components/acessos/UsuariosEFuncoes";
import { listarFuncoes, listarUsuarios } from "@/lib/acessos/banco";
import { exigirAcessoNaPagina } from "@/lib/acessos/servidor";
import { textoDoUltimoAcesso } from "@/lib/configuracoes/detalhes";

export const metadata = { title: "Usuários e funções | Sistema Rise" };
export const dynamic = "force-dynamic";

/**
 * Configuracoes › Usuarios e funcoes (spec de Acessos, §5.3), so Administrador. Linha-guia: o dono ve primeiro quem tem
 * acesso e com qual funcao; a acao principal e adicionar um usuario (ou criar uma funcao, na outra aba). A busca, os
 * inativos e a aba vem da URL (`?q=`, `?inativos=1`, `?aba=funcoes`), para o link abrir onde parou.
 */
export default async function UsuariosEFuncoesPage({ searchParams }) {
  const acesso = await exigirAcessoNaPagina("tela.configuracoes.usuarios", "ver");
  const params = await searchParams;
  const busca = typeof params.q === "string" ? params.q : "";
  const inativos = params.inativos === "1";
  const agora = new Date();
  const [usuarios, funcoes] = await Promise.all([listarUsuarios({ busca, inativos }), listarFuncoes()]);

  return (
    <UsuariosEFuncoes
      abaInicial={params.aba === "funcoes" ? "funcoes" : "usuarios"}
      busca={busca}
      inativos={inativos}
      meuLogin={acesso.login}
      usuarios={usuarios.map((usuario) => ({
        id: usuario.id,
        login: usuario.login,
        nome: usuario.nome,
        ativo: usuario.ativo,
        peloEnv: usuario.peloEnv,
        funcoes: usuario.funcoes,
        ultimoAcesso: textoDoUltimoAcesso(usuario.ultimoAcessoEm, agora),
      }))}
      funcoes={funcoes.map((funcao) => ({ ...funcao, descricao: funcao.descricao ?? "" }))}
    />
  );
}
