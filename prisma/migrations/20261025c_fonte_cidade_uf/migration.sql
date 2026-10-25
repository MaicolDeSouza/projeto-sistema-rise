-- Cidade e UF da empresa por tras de cada fonte (pedido do dono em 25/10/2026), na bolha "i" de Fontes.
ALTER TABLE "FonteColeta" ADD COLUMN "cidade" TEXT;
ALTER TABLE "FonteColeta" ADD COLUMN "uf" TEXT;

-- As fontes cadastradas em 25/10/2026: municipio do CNPJ na Receita (BrasilAPI) ou, sem CNPJ no site, o endereco do
-- rodape (Oceantech, Tespo, OBR: a 1a unidade do rodape). Casa pelo dominio; fonte que nao existir nao muda nada.
UPDATE "FonteColeta" AS f SET cidade = v.cidade, uf = v.uf
FROM (VALUES
  ('www.impactocnc.com', 'Camaquã', 'RS'),
  ('www.eletrogate.com', 'Belo Horizonte', 'MG'),
  ('www.casadarobotica.com', 'Vitória da Conquista', 'BA'),
  ('www.smartkits.com.br', 'Fortaleza', 'CE'),
  ('www.usinainfo.com.br', 'Santo Ângelo', 'RS'),
  ('www.saravati.com.br', 'São Paulo', 'SP'),
  ('www.mamuteeletronica.com.br', 'São Paulo', 'SP'),
  ('www.easytronics.com.br', 'Caxias do Sul', 'RS'),
  ('www.eletruscomp.com.br', 'Caxias do Sul', 'RS'),
  ('www.wjcomponentes.com.br', 'Sorocaba', 'SP'),
  ('curtocircuito.com.br', 'Guarulhos', 'SP'),
  ('www.soldafria.com.br', 'São Paulo', 'SP'),
  ('www.4hobby.com.br', 'Caxias do Sul', 'RS'),
  ('www.piscaled.com.br', 'Jaraguá do Sul', 'SC'),
  ('www.ryndackcomponentes.com.br', 'São José dos Pinhais', 'PR'),
  ('loja.forsetisolucoes.com.br', 'Curitiba', 'PR'),
  ('www.robocore.net', 'Santana de Parnaíba', 'SP'),
  ('oceantech-automation.com.br', 'Porto Alegre', 'RS'),
  ('www.lojapolicompcomponentes.com.br', 'São Paulo', 'SP'),
  ('www.makerhero.com', 'Palhoça', 'SC'),
  ('www.eletrodex.net', 'Barroso', 'MG'),
  ('loja.kalatec.com.br', 'Campinas', 'SP'),
  ('pradoautomacaoindustrial.com.br', 'São Paulo', 'SP'),
  ('www.eletropecas.com', 'Caxias do Sul', 'RS'),
  ('www.a2robotics.com.br', 'São Paulo', 'SP'),
  ('www.patolastore.com.br', 'São Paulo', 'SP'),
  ('loja.neoyama.com.br', 'Joinville', 'SC'),
  ('benser.com.br', 'Rio Verde', 'GO'),
  ('www.nightech.com.br', 'Santo André', 'SP'),
  ('santanaimport.com.br', 'Itajaí', 'SC'),
  ('www.circuitronix.com.br', 'São Paulo', 'SP'),
  ('metaltex.com.br', 'São Paulo', 'SP'),
  ('www.unitel.ind.br', 'Sapucaia do Sul', 'RS'),
  ('www.rac.tec.br', 'São Paulo', 'SP'),
  ('www.tespoinjetados.com.br', 'Caxias do Sul', 'RS'),
  ('www.patola.com.br', 'São Paulo', 'SP'),
  ('www.obr.com.br', 'Joinville', 'SC'),
  ('www.imobras.ind.br', 'Alto Feliz', 'RS')
) AS v(dominio, cidade, uf)
WHERE f.dominio = v.dominio;
