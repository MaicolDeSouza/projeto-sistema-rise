import { redirect } from "next/navigation";

/**
 * Cadastros nao tem tela propria: as secoes (Clientes, Fornecedores, Concorrentes,
 * Transportadoras, Produtos, Marcas, Condicoes de pagamento) sao os subitens do
 * menu, cada um com rota. Quem chega em `/cadastros` cai em Clientes, a primeira.
 * (Ate 18/09/2026 a primeira era Fornecedores; Clientes entrou na frente.)
 */
export default function CadastrosPage() {
  redirect("/cadastros/clientes");
}
