"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

import { PADRAO } from "@/lib/estoque3d/regras";

/**
 * O desenho 3D de UM estoque (pedido do dono em 12/11/2026: "tipo Minecraft", girar e ver a foto do produto na caixinha).
 * Tudo em blocos, 1 unidade = 1 cm, a partir da cena que `montarMapa` ja calculou: aqui nao ha conta de lugar nenhuma.
 *
 * Desenha SO quando algo muda (camera, foto que chegou, selecao): um laco a 60 quadros por segundo com ~1.200 caixinhas
 * esquentaria o notebook com a tela parada.
 */

const LADO_DA_FACE = 128;
const FOTOS_AO_MESMO_TEMPO = 6;
const COR_DA_ESTANTE = 0xb9c0c9;
const COR_DO_DESTAQUE = 0xf59e0b;

/** A miniatura pelo otimizador do Next (128 px): a foto do cadastro tem 1.000 px ou mais, e sao centenas na cena. */
const miniatura = (foto) => `/_next/image?url=${encodeURIComponent(foto)}&w=128&q=75`;

/** A frente da caixinha: a cor do modelo, a foto do produto e o codigo embaixo. */
function pintarFace(canvas, caixinha, imagem) {
  const contexto = canvas.getContext("2d");
  contexto.fillStyle = caixinha.cor;
  contexto.fillRect(0, 0, LADO_DA_FACE, LADO_DA_FACE);
  if (imagem) {
    const lado = LADO_DA_FACE - 40;
    contexto.fillStyle = "#ffffff";
    contexto.fillRect(20, 6, lado, lado);
    contexto.drawImage(imagem, 20, 6, lado, lado);
  }
  contexto.fillStyle = "rgba(15, 23, 42, 0.78)";
  contexto.fillRect(0, LADO_DA_FACE - 30, LADO_DA_FACE, 30);
  contexto.fillStyle = "#ffffff";
  contexto.font = "bold 20px sans-serif";
  contexto.textAlign = "center";
  contexto.textBaseline = "middle";
  contexto.fillText(String(caixinha.sku), LADO_DA_FACE / 2, LADO_DA_FACE - 14, LADO_DA_FACE - 6);
}

/** Uma etiqueta de texto que sempre olha para a camera (a letra da coluna, o numero da prateleira). */
function etiqueta(texto, { altura, cor = "#16202c", fundo = null }) {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 64;
  const contexto = canvas.getContext("2d");
  if (fundo) {
    contexto.fillStyle = fundo;
    contexto.fillRect(0, 0, 128, 64);
  }
  contexto.fillStyle = cor;
  contexto.font = "bold 44px sans-serif";
  contexto.textAlign = "center";
  contexto.textBaseline = "middle";
  contexto.fillText(texto, 64, 34, 120);
  const textura = new THREE.CanvasTexture(canvas);
  textura.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: textura }));
  sprite.scale.set(altura * 2, altura, 1);
  sprite.renderOrder = 2;
  return sprite;
}

export default function Cena3D({ local, selecionado, destacados, aoSelecionar }) {
  const caixaRef = useRef(null);
  const cenaRef = useRef(null);
  const aoSelecionarRef = useRef(aoSelecionar);
  useEffect(() => {
    aoSelecionarRef.current = aoSelecionar;
  }, [aoSelecionar]);

  // Monta a cena do estoque escolhido. Trocar de estoque desmonta tudo e monta de novo.
  useEffect(() => {
    const caixa = caixaRef.current;
    if (!caixa) return undefined;

    const renderizador = new THREE.WebGLRenderer({ antialias: true });
    renderizador.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderizador.setClearColor(0xf4f6f9);
    caixa.appendChild(renderizador.domElement);
    renderizador.domElement.style.display = "block";
    renderizador.domElement.style.touchAction = "none";

    const cena = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, 1, 5, 20000);
    const controles = new OrbitControls(camera, renderizador.domElement);
    controles.enableDamping = false;
    controles.maxPolarAngle = Math.PI / 2 - 0.02;
    controles.minDistance = 30;
    controles.maxDistance = 6000;

    cena.add(new THREE.AmbientLight(0xffffff, 1.9));
    const sol = new THREE.DirectionalLight(0xffffff, 1.6);
    sol.position.set(300, 800, 600);
    cena.add(sol);

    const descartaveis = [];
    const guardar = (item) => {
      descartaveis.push(item);
      return item;
    };
    const materialDaEstante = guardar(new THREE.MeshLambertMaterial({ color: COR_DA_ESTANTE }));
    const cubo = guardar(new THREE.BoxGeometry(1, 1, 1));
    /** Um bloco de `largura x altura x profundidade` com o canto de baixo, esquerdo e da frente em (x, y, z). */
    const bloco = (material, largura, altura, profundidade, x, y, z) => {
      const malha = new THREE.Mesh(cubo, material);
      malha.scale.set(largura, altura, profundidade);
      malha.position.set(x + largura / 2, y + altura / 2, z - profundidade / 2);
      return malha;
    };

    const caixinhas = new Map();
    const alvos = [];
    const limites = new THREE.Box3();
    const fila = [];
    let pedir = () => {};

    for (const coluna of local.colunas) {
      const grupo = new THREE.Group();
      grupo.position.set(coluna.xCm, 0, coluna.zCm);
      grupo.rotation.y = THREE.MathUtils.degToRad(coluna.giroGraus || 0);
      const e = PADRAO.espessuraCm;
      for (const [x, z] of [[-e, 0], [coluna.larguraCm, 0], [-e, -(coluna.profundidadeCm - e)], [coluna.larguraCm, -(coluna.profundidadeCm - e)]]) {
        grupo.add(bloco(materialDaEstante, e, coluna.alturaCm, e, x, 0, z));
      }
      const letra = etiqueta(coluna.letra, { altura: 16 });
      letra.position.set(coluna.larguraCm / 2, coluna.alturaCm + 12, -coluna.profundidadeCm / 2);
      grupo.add(letra);

      for (const prateleira of coluna.prateleiras) {
        grupo.add(bloco(materialDaEstante, coluna.larguraCm, e, coluna.profundidadeCm, 0, prateleira.yCm - e, 0));
        const numero = etiqueta(String(prateleira.numero), { altura: 7, cor: "#ffffff", fundo: "#475569" });
        numero.position.set(-e / 2, prateleira.yCm + 5, 2);
        grupo.add(numero);

        for (const caixinha of prateleira.caixinhas) {
          const largura = Math.max(1.5, caixinha.larguraCm - 0.6);
          const altura = Math.min(caixinha.alturaCm, coluna.alturaLivreCm - 1);
          const profundidade = Math.min(caixinha.profundidadeCm, coluna.profundidadeCm - 2);
          const canvas = document.createElement("canvas");
          canvas.width = LADO_DA_FACE;
          canvas.height = LADO_DA_FACE;
          pintarFace(canvas, caixinha, null);
          const textura = guardar(new THREE.CanvasTexture(canvas));
          textura.colorSpace = THREE.SRGBColorSpace;
          const lado = guardar(new THREE.MeshLambertMaterial({ color: caixinha.cor }));
          const frente = guardar(new THREE.MeshBasicMaterial({ map: textura }));
          // Ordem das faces do cubo: +x, -x, +y, -y, +z (a frente), -z.
          const malha = new THREE.Mesh(cubo, [lado, lado, lado, lado, frente, lado]);
          malha.scale.set(largura, altura, profundidade);
          malha.position.set(caixinha.xCm + 0.3 + largura / 2, prateleira.yCm + altura / 2, -1 - profundidade / 2);
          malha.userData = { produtoId: caixinha.produtoId };
          grupo.add(malha);
          alvos.push(malha);
          caixinhas.set(caixinha.produtoId, { malha, materiais: [lado, frente], giro: grupo.rotation.y });
          if (caixinha.foto) fila.push({ caixinha, canvas, textura });
        }
      }
      cena.add(grupo);
      grupo.updateMatrixWorld(true);
      limites.expandByObject(grupo);
    }

    if (limites.isEmpty()) limites.set(new THREE.Vector3(-100, 0, -100), new THREE.Vector3(100, 200, 100));
    const centro = limites.getCenter(new THREE.Vector3());
    const tamanho = limites.getSize(new THREE.Vector3());
    const chao = new THREE.Mesh(guardar(new THREE.PlaneGeometry(tamanho.x + 400, tamanho.z + 400)), guardar(new THREE.MeshLambertMaterial({ color: 0xdfe5ec })));
    chao.rotation.x = -Math.PI / 2;
    chao.position.set(centro.x, -0.2, centro.z);
    cena.add(chao);

    let pedido = 0;
    pedir = () => {
      if (pedido) return;
      pedido = requestAnimationFrame(() => {
        pedido = 0;
        renderizador.render(cena, camera);
      });
    };
    controles.addEventListener("change", pedir);

    const ajustar = () => {
      const largura = caixa.clientWidth || 1;
      const altura = caixa.clientHeight || 1;
      renderizador.setSize(largura, altura, false);
      renderizador.domElement.style.width = "100%";
      renderizador.domElement.style.height = "100%";
      camera.aspect = largura / altura;
      camera.updateProjectionMatrix();
      pedir();
    };
    const observador = new ResizeObserver(ajustar);
    observador.observe(caixa);
    ajustar();

    // A primeira visao: de frente e um pouco de cima, com a primeira fila inteira dentro da tela (a conta usa a
    // proporcao da tela, por isso vem depois do ajuste de tamanho).
    const metadeDoAngulo = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const distancia = (Math.max(tamanho.y, tamanho.x / camera.aspect) / (2 * metadeDoAngulo)) * 1.15;
    controles.target.set(centro.x, tamanho.y * 0.5, limites.max.z - PADRAO.profundidadeDoVaoCm / 2);
    camera.position.set(centro.x, tamanho.y * 0.7, limites.max.z + distancia);
    controles.maxDistance = Math.max(6000, distancia * 3);
    controles.update();

    // As fotos chegam aos poucos, poucas por vez: centenas de pedidos juntos travariam a tela e o servidor.
    let vivo = true;
    let emCurso = 0;
    const proxima = () => {
      while (vivo && emCurso < FOTOS_AO_MESMO_TEMPO && fila.length) {
        const { caixinha, canvas, textura } = fila.shift();
        emCurso += 1;
        const imagem = new Image();
        const fim = () => {
          emCurso -= 1;
          proxima();
        };
        imagem.onload = () => {
          if (vivo) {
            pintarFace(canvas, caixinha, imagem);
            textura.needsUpdate = true;
            pedir();
          }
          fim();
        };
        imagem.onerror = fim;
        imagem.src = miniatura(caixinha.foto);
      }
    };
    proxima();

    // Clique (e nao arrasto) numa caixinha escolhe o produto.
    const raio = new THREE.Raycaster();
    let apertou = null;
    const aoApertar = (evento) => {
      apertou = { x: evento.clientX, y: evento.clientY };
    };
    const aoSoltar = (evento) => {
      if (!apertou || Math.hypot(evento.clientX - apertou.x, evento.clientY - apertou.y) > 5) return;
      const area = renderizador.domElement.getBoundingClientRect();
      const ponto = new THREE.Vector2(((evento.clientX - area.left) / area.width) * 2 - 1, -((evento.clientY - area.top) / area.height) * 2 + 1);
      raio.setFromCamera(ponto, camera);
      const acerto = raio.intersectObjects(alvos, false)[0];
      aoSelecionarRef.current?.(acerto ? acerto.object.userData.produtoId : null);
    };
    renderizador.domElement.addEventListener("pointerdown", aoApertar);
    renderizador.domElement.addEventListener("pointerup", aoSoltar);

    const contorno = new THREE.LineSegments(guardar(new THREE.EdgesGeometry(cubo)), guardar(new THREE.LineBasicMaterial({ color: COR_DO_DESTAQUE, depthTest: false })));
    contorno.visible = false;
    contorno.renderOrder = 3;
    cena.add(contorno);

    /** Aplica a busca (esmaece o que nao casou) e a escolha (contorno + camera ate a caixinha). Mora aqui, com a cena. */
    const aplicar = (escolhido, achados) => {
      for (const [produtoId, { materiais }] of caixinhas) {
        const apagada = achados !== null && !achados.has(produtoId);
        for (const material of materiais) {
          material.transparent = apagada;
          material.opacity = apagada ? 0.15 : 1;
          material.needsUpdate = true;
        }
      }
      const escolhida = escolhido ? caixinhas.get(escolhido) : null;
      contorno.visible = Boolean(escolhida);
      if (escolhida) {
        const posicao = escolhida.malha.getWorldPosition(new THREE.Vector3());
        contorno.position.copy(posicao);
        contorno.quaternion.copy(escolhida.malha.getWorldQuaternion(new THREE.Quaternion()));
        contorno.scale.copy(escolhida.malha.scale).multiplyScalar(1.04);
        const frente = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), escolhida.giro);
        controles.target.copy(posicao);
        camera.position.copy(posicao).addScaledVector(frente, 130).add(new THREE.Vector3(0, 25, 0));
        controles.update();
      }
      pedir();
    };

    cenaRef.current = { aplicar };

    return () => {
      vivo = false;
      cenaRef.current = null;
      if (pedido) cancelAnimationFrame(pedido);
      observador.disconnect();
      controles.dispose();
      renderizador.domElement.removeEventListener("pointerdown", aoApertar);
      renderizador.domElement.removeEventListener("pointerup", aoSoltar);
      cena.traverse((objeto) => {
        if (objeto.isSprite) {
          objeto.material.map?.dispose();
          objeto.material.dispose();
        }
      });
      for (const item of descartaveis) item.dispose();
      renderizador.dispose();
      renderizador.domElement.remove();
    };
  }, [local]);

  // A busca esmaece o que nao casou; a caixinha escolhida ganha o contorno e a camera vai ate ela.
  useEffect(() => {
    cenaRef.current?.aplicar(selecionado, destacados);
  }, [selecionado, destacados, local]);

  return <div ref={caixaRef} className="h-full w-full overflow-hidden rounded-lg border border-borda" aria-label={`Desenho 3D do ${local.nome}`} />;
}
