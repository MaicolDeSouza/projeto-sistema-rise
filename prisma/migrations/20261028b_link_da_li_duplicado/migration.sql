-- O link da Loja Integrada gravado com o dominio duas vezes (28/10/2026): a LI devolveu o `url` completo e o Rise ainda
-- pos o LI_DOMINIO na frente ("https://www.4hobby.com.br/https://www.4hobby.com.br/produto/..."). Fica so o segundo,
-- que e o endereco que a loja mandou. Quem ja esta certo nao casa com o padrao e nao muda.
UPDATE "Anuncio"
SET "urlExterna" = regexp_replace("urlExterna", '^https?://[^/]+/(https?://)', '\1')
WHERE "canal" = 'LOJA_INTEGRADA' AND "urlExterna" ~ '^https?://[^/]+/https?://';

UPDATE "Produto"
SET "urlLojaIntegrada" = regexp_replace("urlLojaIntegrada", '^https?://[^/]+/(https?://)', '\1')
WHERE "urlLojaIntegrada" ~ '^https?://[^/]+/https?://';
