-- Acessos, lancamento 1 (spec docs/superpowers/specs/2026-10-12-acessos-design.md): usuarios, funcoes, permissoes,
-- excecoes, auditoria e a marca da semeadura. So aditiva. Gerada com migrate diff; tirados os DROP INDEX dos indices
-- que so existem no SQL (ProdutoColetado_buscaTexto_trgm, ProdutoColetado_coletadoEm_idx), como o CLAUDE.md manda.

-- CreateTable
CREATE TABLE "UsuarioRise" (
    "id" TEXT NOT NULL,
    "login" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "assinatura" TEXT,
    "telegramChatId" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ultimoAcessoEm" TIMESTAMP(3),

    CONSTRAINT "UsuarioRise_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FuncaoRise" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "fixa" BOOLEAN NOT NULL DEFAULT false,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FuncaoRise_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PermissaoDaFuncao" (
    "id" TEXT NOT NULL,
    "funcaoId" TEXT NOT NULL,
    "recurso" TEXT NOT NULL,
    "nivel" TEXT NOT NULL,

    CONSTRAINT "PermissaoDaFuncao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UsuarioFuncao" (
    "usuarioId" TEXT NOT NULL,
    "funcaoId" TEXT NOT NULL,

    CONSTRAINT "UsuarioFuncao_pkey" PRIMARY KEY ("usuarioId","funcaoId")
);

-- CreateTable
CREATE TABLE "ExcecaoDoUsuario" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "recurso" TEXT NOT NULL,
    "nivel" TEXT NOT NULL,

    CONSTRAINT "ExcecaoDoUsuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditoriaDeAcesso" (
    "id" TEXT NOT NULL,
    "quando" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "quem" TEXT NOT NULL,
    "oQue" TEXT NOT NULL,
    "alvo" TEXT NOT NULL,
    "antes" JSONB,
    "depois" JSONB,

    CONSTRAINT "AuditoriaDeAcesso_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SemeaduraDeAcessos" (
    "chave" TEXT NOT NULL,
    "feitaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SemeaduraDeAcessos_pkey" PRIMARY KEY ("chave")
);

-- CreateIndex
CREATE UNIQUE INDEX "UsuarioRise_login_key" ON "UsuarioRise"("login");

-- CreateIndex
CREATE UNIQUE INDEX "UsuarioRise_telegramChatId_key" ON "UsuarioRise"("telegramChatId");

-- CreateIndex
CREATE UNIQUE INDEX "FuncaoRise_nome_key" ON "FuncaoRise"("nome");

-- CreateIndex
CREATE UNIQUE INDEX "PermissaoDaFuncao_funcaoId_recurso_key" ON "PermissaoDaFuncao"("funcaoId", "recurso");

-- CreateIndex
CREATE UNIQUE INDEX "ExcecaoDoUsuario_usuarioId_recurso_key" ON "ExcecaoDoUsuario"("usuarioId", "recurso");

-- CreateIndex
CREATE INDEX "AuditoriaDeAcesso_alvo_quando_idx" ON "AuditoriaDeAcesso"("alvo", "quando");

-- AddForeignKey
ALTER TABLE "PermissaoDaFuncao" ADD CONSTRAINT "PermissaoDaFuncao_funcaoId_fkey" FOREIGN KEY ("funcaoId") REFERENCES "FuncaoRise"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsuarioFuncao" ADD CONSTRAINT "UsuarioFuncao_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "UsuarioRise"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsuarioFuncao" ADD CONSTRAINT "UsuarioFuncao_funcaoId_fkey" FOREIGN KEY ("funcaoId") REFERENCES "FuncaoRise"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExcecaoDoUsuario" ADD CONSTRAINT "ExcecaoDoUsuario_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "UsuarioRise"("id") ON DELETE CASCADE ON UPDATE CASCADE;
