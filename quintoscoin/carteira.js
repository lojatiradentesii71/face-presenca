// QUINTOSCOIN - PASSO 291 - LOGIN, NOME E INTERFACE SIMPLIFICADA
// Mantem as funcoes do Passo 278 e acrescenta o cliente de API ausente.
// IMPORTANTE: esta funcao e somente para rotas autenticadas.
// Doacoes e transferencias anonimas continuam com fetch proprio.
const QC_URL_191 = "https://script.google.com/macros/s/AKfycbxEU0xzZz833Bqv7CxV-PdTVIjxRrl27lNgSG0upZ07rnXaAkULhGGuehxbpU2-K1oyOQ/exec";

// PASSO 297 - Espera discreta JUNTO ao botao ou mensagem da operacao.
// Nao bloqueia, nao escurece nem cobre a tela. Nao altera requisicoes.
const QC_ESPERA295 = (() => {
  const estilo = document.createElement("style");
  estilo.textContent = `
    @keyframes qc-girar297 { to { transform: rotate(360deg); } }
    .qc-espera-roda297 {
      display:inline-block;width:15px;height:15px;flex:none;
      box-sizing:border-box;border:2px solid #e2ba60aa;
      border-top-color:#fff;border-radius:50%;vertical-align:-3px;
      animation:qc-girar297 .8s linear infinite;
    }
    button > .qc-espera-roda297 { margin-left:8px; }
    .qc-espera-inline297 {
      display:inline-flex;gap:7px;align-items:center;
      margin-left:8px;vertical-align:middle;
    }
    .qc-espera-mensagem297 {
      display:flex;align-items:center;gap:8px;min-height:20px;
      font-size:12px;color:#e2ba60;margin:8px 0;
    }
    .qc-espera-mensagem297 > .qc-espera-roda297 { margin:0; }
    @media (prefers-reduced-motion:reduce) {
      .qc-espera-roda297 { animation-duration:2s; }
    }
  `;
  document.head.appendChild(estilo);

  let ultimoBotao = null;
  let instanteClique = 0;
  document.addEventListener("click", evento => {
    const botao = evento.target?.closest?.("button");
    if (botao) {
      ultimoBotao = botao;
      instanteClique = Date.now();
    }
  }, true);

  const ativos = new WeakMap();
  function visivel(el) {
    if (!(el instanceof HTMLElement) || !el.isConnected) return false;
    if (!el.getClientRects().length) return false;
    let pai = el;
    while (pai && pai instanceof HTMLElement) {
      const css = getComputedStyle(pai);
      if (css.display === "none" || css.visibility === "hidden") return false;
      pai = pai.parentElement;
    }
    return true;
  }
  function modalVisivel() {
    return [...document.querySelectorAll(".qc-modal-overlay, [role=dialog]")]
      .reverse().find(visivel) || null;
  }
  function alvoMensagem(modal) {
    const raiz = modal || document;
    const seletores = modal
      ? "#qcPedidosReceber295 [role=status], [role=status], .qc-modal-mensagem"
      : "#qcMensagemAcesso, #qcMensagemTesoureiro, #qcMensagemTrocaSenha, " +
        "#mensagem, #qcMensagemCopia, [role=status]";
    const candidatos = [...raiz.querySelectorAll(seletores)].filter(visivel);
    return candidatos.find(el =>
      /consult|aguard|process|carreg|prepar|assin|verific/i.test(el.textContent)) ||
      candidatos[0] || null;
  }
  // Uma unica roldana por elemento, mesmo com varias chamadas simultaneas.
  function ocupar(el, tipo, mensagem) {
    let registro = ativos.get(el);
    if (registro) {
      registro.quantidade++;
      return () => liberar(el);
    }
    const roda = document.createElement("span");
    roda.className = "qc-espera-roda297";
    roda.setAttribute("aria-hidden", "true");
    roda.title = mensagem;
    const elemento = tipo === "botao" ? roda : document.createElement("span");
    if (tipo !== "botao") {
      elemento.className = "qc-espera-inline297";
      elemento.append(roda);
    }
    const ocupadoAntes = el.getAttribute("aria-busy");
    el.setAttribute("aria-busy", "true");
    el.appendChild(elemento);
    ativos.set(el, {quantidade:1,elemento,ocupadoAntes});
    return () => liberar(el);
  }
  function liberar(el) {
    const reg = ativos.get(el);
    if (!reg) return;
    reg.quantidade--;
    if (reg.quantidade > 0) return;
    reg.elemento.remove();
    if (reg.ocupadoAntes === null) el.removeAttribute("aria-busy");
    else el.setAttribute("aria-busy", reg.ocupadoAntes);
    ativos.delete(el);
  }

  // Chamadas explicitas podem passar (mensagem, botao, campoDaMensagem).
  // Chamadas de fetch sem alvo usam o botao acionado ou a mensagem visivel.
  function iniciar(mensagem = "Consultando o QuintosCoin...", botao, campo) {
    const acionado = botao instanceof HTMLButtonElement ? botao :
      (Date.now() - instanteClique < 1300 ? ultimoBotao : null);
    const liberacoes = [];
    let avisoTemporario = null;
    let terminou = false;
    const atraso = setTimeout(() => {
      if (terminou) return;
      const modal = modalVisivel();
      const botaoVisivel = acionado && visivel(acionado) &&
        (!modal || modal.contains(acionado)) ? acionado : null;
      if (botaoVisivel) liberacoes.push(ocupar(botaoVisivel,"botao",mensagem));
      const campoVisivel = campo && visivel(campo) ? campo :
        (!botaoVisivel ? alvoMensagem(modal) : null);
      if (campoVisivel && campoVisivel !== botaoVisivel) {
        liberacoes.push(ocupar(campoVisivel,"mensagem",mensagem));
      }
      if (!botaoVisivel && !campoVisivel) {
        // Se nao existe uma mensagem apropriada, cria uma no proprio contexto.
        const container = (modal && modal.querySelector(".qc-modal-card")) ||
          [...document.querySelectorAll("#telaCarteira, #telaAcesso")]
            .find(visivel);
        if (container) {
          avisoTemporario = document.createElement("p");
          avisoTemporario.className = "qc-espera-mensagem297";
          avisoTemporario.setAttribute("role","status");
          avisoTemporario.textContent = mensagem;
          container.appendChild(avisoTemporario);
          liberacoes.push(ocupar(avisoTemporario,"mensagem",mensagem));
        }
      }
    }, 160); // Operacoes rapidas nao ficam piscando.
    return () => {
      if (terminou) return;
      terminou = true;
      clearTimeout(atraso);
      liberacoes.forEach(soltar => soltar());
      if (avisoTemporario) avisoTemporario.remove();
    };
  }
  return {iniciar};
})();
window.QC_iniciarEspera295 = QC_ESPERA295.iniciar;

// Abrange consultas, login, saldo, pedidos, doacoes e recebimentos.
// Nunca altera parametros, corpo, token nem resposta das requisicoes.
const QC_fetchOriginal295 = window.fetch.bind(window);
window.fetch = function(...argumentos) {
  const destino = typeof argumentos[0] === "string"
    ? argumentos[0] : (argumentos[0]?.url || "");
  if (!/^https:\/\/script\.google\.com\/macros\/s\//i.test(destino)) {
    return QC_fetchOriginal295(...argumentos);
  }
  const finalizar = QC_ESPERA295.iniciar("Consultando o QuintosCoin...");
  try {
    return Promise.resolve(QC_fetchOriginal295(...argumentos)).finally(finalizar);
  } catch (erro) {
    finalizar();
    throw erro;
  }
};


async function QC_post191(acao, parametros = {}) {
  if (typeof acao !== "string" || !/^qc_[a-z0-9_]+$/.test(acao)) {
    throw new Error("Acao do QuintosCoin invalida.");
  }
  if (!parametros || typeof parametros !== "object" || Array.isArray(parametros)) {
    throw new Error("Parametros da requisicao invalidos.");
  }
  const tokenSessao = sessionStorage.getItem("QC_TOKEN_SESSAO_TESTE");
  if (!tokenSessao) {
    throw new Error("Sua sessao expirou. Entre na carteira novamente.");
  }
  const resposta = await fetch(QC_URL_191, {
    method: "POST",
    redirect: "follow",
    headers: {"Content-Type": "text/plain;charset=utf-8"},
    body: JSON.stringify({ ...parametros, acao, tokenSessao })
  });
  if (!resposta.ok) {
    throw new Error("Falha de comunicacao com o Apps Script. HTTP " + resposta.status);
  }
  return await resposta.json();
}

// QUINTOSCOIN - PASSO 278 - CARTEIRA COM RESGATE E DOACAO EM DESTAQUE
const QC_CHAVE_CARTEIRA = "QC_CARTEIRA_TESTE";

function QC_lerCarteira() {

  try {
    const dados = JSON.parse(
      localStorage.getItem(QC_CHAVE_CARTEIRA) || "[]"
    );

    return Array.isArray(dados) ? dados : [];

  } catch (erro) {
    console.error("Erro ao ler carteira:", erro);
    return [];
  }
}

function QC_atualizarTela() {
  // Nunca apresentar o saldo demonstrativo QC_CARTEIRA_TESTE como saldo real.
  // O modulo qc-saldo.js valida assinaturas e consulta fichas gastas.
  if (typeof window.QC_atualizarSaldoReal202 === "function") {
    window.QC_atualizarSaldoReal202();
  }
}


const qcBtnReceber = document.getElementById("btnReceber");

const qcModalReceber = document.createElement("div");

qcModalReceber.id = "qcModalReceber";
qcModalReceber.className = "qc-modal-overlay";

qcModalReceber.innerHTML = `
  <div class="qc-modal-card">
    <div class="qc-modal-topo">
      <h3>Receber QuintosCoin</h3>
      <button
        type="button"
        id="qcFecharReceber"
        class="qc-modal-fechar"
      >×</button>
    </div>

    <p class="qc-modal-texto">
      Informe a quantidade de QuintosCoin que deseja solicitar ao tesoureiro.
    </p>

    <label for="qcValorReceber" class="qc-label-modal">
      Quantidade de QuintosCoin
    </label>

    <input
      id="qcValorReceber"
      type="number"
      min="1"
      step="1"
      inputmode="numeric"
      placeholder="Exemplo: 50"
      class="qc-input-modal"
    >

    <div class="qc-modal-botoes">
      <button
        type="button"
        id="qcConfirmarReceber"
        class="qc-btn-modal-principal"
      >
        Solicitar QuintosCoin
      </button>

      <button
        type="button"
        id="qcCancelarReceber"
        class="qc-btn-modal-secundario"
      >
        Cancelar
      </button>
    </div>

    <p id="qcMensagemReceber" class="qc-modal-mensagem"></p>
  </div>
`;

document.body.appendChild(qcModalReceber);

// PASSO 293 - A confirmacao aparece NA MESMA JANELA do formulario.
// Preservar os elementos originais preserva tambem seus eventos de clique.
const qcCartaoReceber293 = qcModalReceber.querySelector(".qc-modal-card");
const qcFormularioReceber293 = Array.from(qcCartaoReceber293.children);
const qcConfirmacaoReceber293 = document.createElement("div");
qcConfirmacaoReceber293.id = "qcConfirmacaoReceber293";
qcConfirmacaoReceber293.setAttribute("role", "status");
qcConfirmacaoReceber293.setAttribute("tabindex", "-1");
qcConfirmacaoReceber293.style.cssText =
  "display:none;flex-direction:column;align-items:center;" +
  "justify-content:center;gap:14px;text-align:center;min-height:300px";
qcCartaoReceber293.appendChild(qcConfirmacaoReceber293);

// PASSO 295 - Pedidos autorizados dentro do proprio modal Receber Qc$.
// Os identificadores do pedido sao obtidos pelo token autenticado da carteira.
const qcPedidosReceber295 = document.createElement("div");
qcPedidosReceber295.id = "qcPedidosReceber295";
qcPedidosReceber295.setAttribute("role", "region");
qcPedidosReceber295.setAttribute("aria-label", "Solicitacoes de recebimento");
qcPedidosReceber295.style.display = "none";
qcCartaoReceber293.insertBefore(
  qcPedidosReceber295, qcConfirmacaoReceber293
);
let qcConsultaReceber295 = 0;

// PASSO 300 - Indicador de valores disponiveis no botao RECEBER Qc$.
// So conta pedidos efetivamente recebiveis; CONFERIR nao gera alerta.
const qcIndicadorReceber300 = document.createElement("span");
qcIndicadorReceber300.id = "qcIndicadorReceber300";
qcIndicadorReceber300.className = "qc-indicador-receber300";
qcIndicadorReceber300.setAttribute("aria-hidden", "true");
qcIndicadorReceber300.hidden = true;
qcBtnReceber.appendChild(qcIndicadorReceber300);
const qcEstiloReceber300 = document.createElement("style");
qcEstiloReceber300.textContent = `
  #telaCarteira #btnReceber { position:relative; }
  #telaCarteira #btnReceber .qc-indicador-receber300 {
    position:absolute;top:5px;right:5px;min-width:10px;height:10px;
    box-sizing:border-box;border-radius:20px;background:#ffd04f;
    border:1px solid #15243b;box-shadow:0 0 0 1px #ffd04f66;
    font-size:10px;font-weight:800;line-height:16px;text-align:center;
    color:#18243a;padding:0;pointer-events:none;
  }
  #telaCarteira #btnReceber .qc-indicador-receber300.qc-com-numero300 {
    min-width:19px;height:19px;top:3px;right:3px;line-height:17px;
    padding:0 3px;
  }
  #telaCarteira #btnReceber .qc-indicador-receber300[hidden] {
    display:none!important;
  }
`;
document.head.appendChild(qcEstiloReceber300);
let qcSequenciaIndicadorReceber300 = 0;
function QC_contarDisponiveis300(pedidos) {
  let quantidade = 0;
  for (const p of pedidos) {
    if (p.status !== "AUTORIZADA") continue;
    if (p.situacao === "PRONTA") { quantidade++; continue; }
    if (p.situacao !== "EM_ANDAMENTO") continue;
    // Uma emissao ja completamente recebida pode continuar temporariamente
    // como EM_ANDAMENTO no servidor. Nao sinalizar de novo neste aparelho.
    let local;
    try { local = QC_estadoLocalRecebimento296(String(p.idEmissao || "")); }
    catch (_) { continue; }  // Armazenamento inconsistente: nao oferecer credito.
    const iniciada = Number(p.quantidadeAssinada) > 0 ||
      Number(p.operacoesExistentes) > 0 || local.armazenadas > 0;
    if (local.pendente || !iniciada) quantidade++;
  }
  return quantidade;
}
function QC_mostrarIndicadorReceber300(quantidade) {
  const n = Number(quantidade) || 0;
  qcIndicadorReceber300.hidden = n < 1;
  qcIndicadorReceber300.classList.toggle("qc-com-numero300", n > 1);
  qcIndicadorReceber300.textContent = n > 1 ? String(n > 99 ? "99+" : n) : "";
  qcBtnReceber.setAttribute("aria-label", n > 0
    ? "Receber Qc$ — " + n + " recebimento(s) disponivel(is)"
    : "Receber Qc$");
  qcIndicadorReceber300.title = n > 0
    ? n + " recebimento(s) disponivel(is)" : "";
}
async function QC_atualizarIndicadorReceber300(pedidosConsultados) {
  const atual = ++qcSequenciaIndicadorReceber300;
  const token = sessionStorage.getItem("QC_TOKEN_SESSAO_TESTE");
  if (!token) { QC_mostrarIndicadorReceber300(0); return; }
  try {
    const dados = pedidosConsultados
      ? {status:"OK", solicitacoes:pedidosConsultados}
      : await QC_post191("qc_pedidos_receber_296");
    if (atual !== qcSequenciaIndicadorReceber300 ||
        token !== sessionStorage.getItem("QC_TOKEN_SESSAO_TESTE")) return;
    if (dados?.status !== "OK" || !Array.isArray(dados.solicitacoes)) {
      QC_mostrarIndicadorReceber300(0);
      return;
    }
    QC_mostrarIndicadorReceber300(QC_contarDisponiveis300(dados.solicitacoes));
  } catch (_) {
    // Uma falha de comunicacao nao significa que haja novos creditos.
    if (atual === qcSequenciaIndicadorReceber300) QC_mostrarIndicadorReceber300(0);
  }
}
window.QC_atualizarIndicadorReceber300 = QC_atualizarIndicadorReceber300;

// PASSO 300 - Confirmacao curta, no proprio modal, somente apos
// todas as fichas terem sido salvas e verificadas e o saldo atualizado.
window.QC_mostrarRecebimentoConcluido300 = function(dados) {
  const valor = Number(dados?.valor);
  if (!Number.isSafeInteger(valor) || valor <= 0 ||
      qcModalReceber.style.display !== "flex") return;
  qcFormularioReceber293.forEach(el => { el.style.display="none"; });
  qcPedidosReceber295.style.display = "none";
  qcConfirmacaoReceber293.replaceChildren();
  qcConfirmacaoReceber293.style.cssText =
    "display:flex;flex-direction:column;align-items:center;"+
    "justify-content:center;gap:14px;text-align:center;min-height:260px";
  const icone=document.createElement("div");
  icone.textContent="✓";
  icone.style.cssText="width:54px;height:54px;border-radius:50%;"+
    "background:#168258;color:#fff;font-size:32px;display:grid;"+
    "place-items:center;font-weight:bold";
  const titulo=document.createElement("h3");
  titulo.textContent="Recebimento concluído!";
  titulo.style.cssText="margin:0;color:#f0cd72;font-size:22px";
  const montante=document.createElement("strong");
  montante.textContent=QC_valorReceber295(valor)+" recebidos";
  montante.style.cssText="font-size:24px;color:#fff";
  const mensagem=document.createElement("p");
  mensagem.textContent="Seu saldo foi atualizado com sucesso.";
  mensagem.style.cssText="margin:0;font-size:14px;line-height:1.5";
  const ok=document.createElement("button");
  ok.type="button";
  ok.className="qc-btn-modal-principal";
  ok.textContent="OK";
  ok.style.cssText="min-width:145px;max-width:220px;width:70%;margin-top:10px";
  ok.addEventListener("click", QC_fecharModalReceber);
  qcConfirmacaoReceber293.append(icone,titulo,montante,mensagem,ok);
  qcConfirmacaoReceber293.focus();
  // Retirar o aviso imediatamente. Reconsultar o estado sem atrasar o OK.
  QC_atualizarIndicadorReceber300();
};

function QC_mostrarFormularioReceber295() {
  qcPedidosReceber295.style.display = "none";
  qcFormularioReceber293.forEach(elemento => {elemento.style.display = "";});
  qcConfirmacaoReceber293.style.display = "none";
}
function QC_mostrarListaReceber295() {
  qcFormularioReceber293.forEach((elemento, indice) => {
    elemento.style.display = indice === 0 ? "" : "none";
  });
  qcConfirmacaoReceber293.style.display = "none";
  qcPedidosReceber295.style.display = "block";
}
function QC_avisoReceber295(texto) {
  const p = document.createElement("p");
  p.setAttribute("role", "status");
  p.style.cssText = "color:#e6c363;font-size:13px;line-height:1.5;margin:10px 0";
  p.textContent = texto;
  return p;
}
function QC_botaoReceber295(texto, primario = false) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = primario ? "qc-btn-modal-principal" : "qc-btn-modal-secundario";
  b.textContent = texto;
  b.style.cssText = "width:100%;margin-top:10px";
  return b;
}
function QC_valorReceber295(valor) {
  return "Qc$ " + Number(valor).toLocaleString("pt-BR", {
    minimumFractionDigits:2,maximumFractionDigits:2
  });
}

// PASSO 296 - Metadados LOCAIS apenas para retomar emissao deste aparelho.
// Nunca considera um registro criptografado como prova de credito:
// a situacao da assinatura vem do servidor e o saldo valida o conteudo.
function QC_estadoLocalRecebimento296(idEmissao) {
  const idCarteira = localStorage.getItem("QC_ID_CARTEIRA") || "";
  if (!idCarteira || !idEmissao) return {pendente:false, armazenadas:0};
  function ler(chave) {
    const v = JSON.parse(localStorage.getItem(chave) || "{}");
    if (!v || typeof v !== "object" || Array.isArray(v)) {
      throw Error("Dados locais de recebimento inconsistentes.");
    }
    return v;
  }
  const pendentes = ler("QC_FICHAS_CEGAS_PENDENTES_V1_" + idCarteira);
  const assinadas = ler("QC_FICHAS_ASSINADAS_V1_" + idCarteira);
  const quant = Object.keys(assinadas).filter(k =>
    k === idEmissao || k.startsWith(idEmissao + "_")).length;
  return {pendente:!!pendentes[idEmissao], armazenadas:quant};
}

async function QC_carregarPedidosReceber295() {
  const consulta = ++qcConsultaReceber295;
  QC_mostrarListaReceber295();
  qcPedidosReceber295.replaceChildren(
    QC_avisoReceber295("Conferindo as autorizacoes e as assinaturas...")
  );
  try {
    // NAO utilizar apenas o status AUTORIZADA: ele permanece em historicos
    // ja emitidos. A rota 296 cruza autorizacao, emissao, cotas e assinaturas.
    const dados = await QC_post191("qc_pedidos_receber_296");
    if (consulta !== qcConsultaReceber295 ||
        qcModalReceber.style.display !== "flex") return;
    if (!dados || dados.status !== "OK" ||
        !Array.isArray(dados.solicitacoes)) {
      throw Error(dados?.mensagem || "Consulta de emissões indisponível.");
    }
    const pedidos = dados.solicitacoes;
    QC_atualizarIndicadorReceber300(pedidos);
    const ativos = pedidos.filter(p => p.status === "AUTORIZADA" &&
      ["PRONTA","EM_ANDAMENTO","CONFERIR"].includes(p.situacao));
    const assinados = pedidos.filter(p => p.status === "AUTORIZADA" &&
      p.situacao === "ASSINADA");
    const aguardando = pedidos.filter(p => p.status === "PENDENTE");
    qcPedidosReceber295.replaceChildren();
    const titulo = document.createElement("p");
    titulo.style.cssText="margin:10px 0 12px;line-height:1.5";
    const disponiveis300 = QC_contarDisponiveis300(pedidos);
    titulo.textContent = disponiveis300 > 0
      ? "Disponível para receber: " + disponiveis300
      : ativos.some(p => p.situacao === "CONFERIR")
        ? "Não há novos recebimentos disponíveis. Veja a pendência abaixo."
        : "Nenhum recebimento novo disponível.";
    qcPedidosReceber295.appendChild(titulo);

    for (const p of ativos) {
      const valor = Number(p.valor);
      const situacao = p.situacao;
      const idEmissao = String(p.idEmissao || "");
      const cartao = document.createElement("section");
      cartao.style.cssText = "background:#1d3554;border:1px solid #e6c36355;" +
        "border-radius:12px;padding:15px;margin-bottom:12px";
      const tituloPedido = document.createElement("strong");
      tituloPedido.style.cssText = "color:#e6c363;display:block;margin-bottom:6px";
      tituloPedido.textContent = QC_valorReceber295(valor) + " — " +
        (situacao === "PRONTA" ? "AUTORIZADO" :
         situacao === "EM_ANDAMENTO" ? "EM ANDAMENTO" : "CONFERIR");
      const info = document.createElement("p");
      info.style.cssText = "font-size:12px;color:#d7dce6;margin:5px 0";
      info.textContent = "Solicitado em: " + (p.dataSolicitacao || "Data não informada") +
        " · Pedido: " + String(p.idAutorizacao || "").slice(0,8);
      const descricao = document.createElement("p");
      descricao.style.cssText = "font-size:13px;line-height:1.5;margin:8px 0";
      const mensagem = document.createElement("p");
      mensagem.setAttribute("role","status");
      mensagem.style.cssText = "font-size:13px;line-height:1.5;margin-top:8px";
      const acoes = document.createElement("div");
      const local = QC_estadoLocalRecebimento296(idEmissao);
      const parcialmenteAssinado = Number(p.quantidadeAssinada) > 0 ||
        Number(p.operacoesExistentes) > 0 || local.armazenadas > 0;
      let permitir = situacao === "PRONTA" ||
        (situacao === "EM_ANDAMENTO" &&
          (local.pendente || !parcialmenteAssinado));
      if (situacao === "CONFERIR") {
        descricao.textContent = p.mensagem ||
          "Os registros desta emissão precisam de conferência. Nenhuma assinatura será solicitada.";
        permitir = false;
      } else if (situacao === "EM_ANDAMENTO" && !permitir) {
        descricao.textContent = "Esta emissão já tem operações iniciadas. " +
          "Para continuar, use o dispositivo onde as fichas foram preparadas " +
          "ou recupere o backup antes de tentar outra emissão.";
      } else if (situacao === "EM_ANDAMENTO" && local.pendente) {
        descricao.textContent = "Fichas preparadas neste aparelho. " +
          "Continue o recebimento sem gerar novas fichas.";
      } else if (situacao === "EM_ANDAMENTO") {
        descricao.textContent = "Emissão preparada, aguardando assinatura das fichas.";
      } else {
        descricao.textContent = "Autorizado pelo tesoureiro. Pronto para receber.";
      }
      cartao.append(tituloPedido,info,descricao);
      if (permitir) {
        const botao = QC_botaoReceber295(
          local.pendente ? "Continuar recebimento" :
          "Receber " + QC_valorReceber295(valor), true);
        cartao.append(botao,mensagem,acoes);
        botao.addEventListener("click",async () => {
          botao.disabled = true;
          const encerrar = QC_ESPERA295.iniciar("Preparando o recebimento...", botao, mensagem);
          try {
            let emissao = idEmissao;
            if (!emissao) {
              const preparado = await QC_post191("qc_preparar_emissao", {
                idAutorizacao:p.idAutorizacao
              });
              emissao = String(preparado?.idEmissao ||
                preparado?.emissao?.idEmissao || "").trim();
              if (!/^QC-EM-[0-9a-f-]{36}$/i.test(emissao)) {
                throw Error(preparado?.mensagem ||
                  "A emissão ainda não pôde ser preparada.");
              }
            }
            const pronto = {...p, idEmissao:emissao,
              valor, status:"AUTORIZADA"};
            if (typeof window.QC_inserirAcao195 !== "function" ||
                typeof window.QC_inserirRecebimento198 !== "function") {
              throw Error("Módulo de recebimento indisponível.");
            }
            acoes.replaceChildren();
            window.QC_inserirAcao195(acoes, pronto);
            window.QC_inserirRecebimento198(acoes, pronto);
            // Preparação na sessão atual, sem pedir outra senha.
            // A confirmação de assinatura continua sendo uma ação separada.
            const preparar = acoes.querySelector("button");
            if (preparar && preparar.textContent.startsWith("Preparar recebimento") &&
                typeof window.QC_senhaFichas291 === "function" &&
                window.QC_senhaFichas291()) preparar.click();
            botao.style.display="none";
            mensagem.textContent = "Continue a emissão abaixo. " +
              "As assinaturas serão verificadas antes de integrar o saldo.";
          } catch (erro) {
            mensagem.textContent="⚠️ " + erro.message +
              " Confira o estado do pedido antes de repetir.";
            botao.disabled=false;
          } finally { encerrar(); }
        });
      } else {
        cartao.append(mensagem);
      }
      qcPedidosReceber295.appendChild(cartao);
    }
    if (aguardando.length) {
      qcPedidosReceber295.appendChild(QC_avisoReceber295(
        aguardando.length === 1
          ? "Você também tem 1 pedido aguardando autorização do tesoureiro."
          : "Você também tem " + aguardando.length +
            " pedidos aguardando autorização do tesoureiro."
      ));
    }
    const novo = QC_botaoReceber295("+ Solicitar novos Qc$");
    novo.addEventListener("click",QC_mostrarFormularioReceber295);
    qcPedidosReceber295.appendChild(novo);
  } catch (erro) {
    if (consulta !== qcConsultaReceber295 ||
        qcModalReceber.style.display !== "flex") return;
    QC_mostrarListaReceber295();
    qcPedidosReceber295.replaceChildren(QC_avisoReceber295(
      "⚠️ Consulta indisponível: " + erro.message +
      ". Não será iniciada outra emissão até a situação ser conferida."
    ));
    const repetir = QC_botaoReceber295("Tentar novamente");
    repetir.addEventListener("click", QC_carregarPedidosReceber295);
    qcPedidosReceber295.appendChild(repetir);
  }
}

function QC_abrirModalReceber() {
  document.getElementById("qcMensagemReceber").textContent = "";
  qcModalReceber.style.display = "flex";
  QC_carregarPedidosReceber295();
}

function QC_fecharModalReceber() {
  qcConsultaReceber295++; // descarta resposta de consultas encerradas
  qcModalReceber.style.display = "none";
  document.getElementById("qcMensagemReceber").textContent = "";
}

function QC_exibirConfirmacaoReceber(quantidade) {
  qcPedidosReceber295.style.display = "none";
  // Substituir visualmente o formulario pela confirmacao dentro do modal.
  qcFormularioReceber293.forEach(elemento => {
    elemento.style.display = "none";
  });
  qcConfirmacaoReceber293.replaceChildren();

  const titulo = document.createElement("h3");
  titulo.textContent = "✅ Solicitação registrada!";
  titulo.style.cssText = "margin:0;color:#e6c363;font-size:21px";

  const valor = document.createElement("div");
  valor.textContent = quantidade + " QC solicitados";
  valor.style.cssText = "font-size:24px;font-weight:700;color:#fff";

  const situacao = document.createElement("div");
  situacao.textContent = "⏳ Status: PENDENTE";
  situacao.style.cssText = "font-weight:700;color:#e6c363";

  const descricao = document.createElement("p");
  descricao.textContent =
    "Aguardando confirmação do pagamento e autorização do tesoureiro. " +
    "Os QCs ainda não foram creditados.";
  descricao.style.cssText = "margin:0;line-height:1.5";

  const fechar = document.createElement("button");
  fechar.type = "button";
  fechar.className = "qc-btn-modal-principal";
  fechar.textContent = "Entendi";
  fechar.style.cssText = "margin-top:8px;min-width:130px;max-width:210px";
  fechar.addEventListener("click", QC_fecharModalReceber);

  qcConfirmacaoReceber293.append(
    titulo, valor, situacao, descricao, fechar
  );
  qcConfirmacaoReceber293.style.display = "flex";
  qcModalReceber.style.display = "flex";
  qcConfirmacaoReceber293.focus();
}

qcBtnReceber.addEventListener("click", function() {
  QC_abrirModalReceber();
});

document.getElementById("qcFecharReceber")
  .addEventListener("click", function() {
    QC_fecharModalReceber();
  });

document.getElementById("qcCancelarReceber")
  .addEventListener("click", function() {
    QC_fecharModalReceber();
  });

qcModalReceber.addEventListener("click", function(e) {
  if (e.target === qcModalReceber) {
    QC_fecharModalReceber();
  }
});

document.getElementById("qcConfirmarReceber")
  .addEventListener("click", async function() {

    const botao = this;

    const campo = document.getElementById("qcValorReceber");
    const mensagem = document.getElementById("qcMensagemReceber");

    const quantidade = Number(campo.value);

    if (
      !campo.value.trim() ||
      !Number.isSafeInteger(quantidade) ||
      quantidade <= 0
    ) {
      mensagem.textContent =
        "⚠️ Informe uma quantidade inteira e positiva.";
      return;
    }

    const token = sessionStorage.getItem(QC_CHAVE_SESSAO);

    if (!token) {
      mensagem.textContent =
        "⚠️ Sessão expirada. Entre novamente.";
      return;
    }

    botao.disabled = true;
    botao.textContent = "Enviando solicitação...";
    mensagem.textContent = "";

    try {

      const resultado = await QC_enviarSolicitacaoCreditos(
        token,
        quantidade
      );

      if (resultado.status !== "PENDENTE") {
        throw new Error(
          resultado.mensagem ||
          "Não foi possível registrar a solicitação."
        );
      }


      campo.value = "";
      // Mostrar a confirmação na própria janela, sem tocar no saldo.
      QC_exibirConfirmacaoReceber(quantidade);


    } catch (erro) {

      mensagem.textContent =
        "⚠️ " + erro.message +
        " Se houve falha de comunicação, consulte o tesoureiro antes de solicitar novamente.";

    } finally {

      botao.disabled = false;
      botao.textContent = "Solicitar QuintosCoin";

    }

  });


// PASSO 301 - Doacoes com QR Code da sacola.
// A janela e a camera sao configuradas por qc-doacao-qr301.js,
// apos o modulo qc-saldo.js. Nenhum gasto e feito neste arquivo.

// Gerador QR local para codigos de transferencia. QR Model 2, versao 10-L.
// Nao utiliza servidor externo nem transmite o conteudo.
function QC_matrizQR275(texto) {
  const bytes = new TextEncoder().encode(texto);
  const blocosInfo = [[86,68],[86,68],[87,69],[87,69]];
  const capacidade = blocosInfo.reduce((s,b)=>s+b[1],0);
  // V10: cabecalho de 4 bits + comprimento de 16 bits + carga em bytes.
  if (bytes.length < 1 || bytes.length > capacidade-3) {
    throw Error("Codigo QR fora da capacidade local.");
  }
  const bits = [];
  const addBits = (valor,qtd) => {
    for (let i=qtd-1; i>=0; i--) bits.push((valor>>>i)&1);
  };
  addBits(4,4);
  addBits(bytes.length,16);
  for (const b of bytes) addBits(b,8);
  for (let i=0; i<4 && bits.length<capacidade*8; i++) bits.push(0);
  while (bits.length%8) bits.push(0);
  const dados=[];
  for (let i=0; i<bits.length; i+=8) {
    let v=0; for(let j=0; j<8; j++) v=(v<<1)|bits[i+j];
    dados.push(v);
  }
  for (let i=0; dados.length<capacidade;i++) dados.push(i%2 ? 0x11 : 0xec);
  const multiplicar = (a,b) => {
    let produto=0;
    for(let i=7;i>=0;i--) {
      produto=(produto<<1)^((produto>>>7)*0x11d);
      produto^=(((b>>>i)&1)*a);
    }
    return produto;
  };
  let gerador=[1];
  let raiz=1;
  for(let i=0;i<18;i++) {
    const novo=Array(gerador.length+1).fill(0);
    gerador.forEach((v,j)=>{novo[j]^=v;novo[j+1]^=multiplicar(v,raiz)});
    gerador=novo;
    raiz=multiplicar(raiz,2);
  }
  const blocos=[];
  let inicio=0;
  for(const [total,dadosPorBloco] of blocosInfo) {
    const dadosBloco=dados.slice(inicio,inicio+dadosPorBloco);
    inicio+=dadosPorBloco;
    const resto=Array(18).fill(0);
    for(const b of dadosBloco) {
      const fator=b^resto[0];
      resto.shift();resto.push(0);
      for(let i=0;i<18;i++) resto[i]^=multiplicar(gerador[i+1],fator);
    }
    blocos.push({dados:dadosBloco,ecc:resto});
  }
  const saida=[];
  for (let i=0;i<69;i++) for (const b of blocos) {
    if(i<b.dados.length) saida.push(b.dados[i]);
  }
  for (let i=0;i<18;i++) for (const b of blocos) saida.push(b.ecc[i]);
  const tam=57;
  const mod=Array.from({length:tam},()=>Array(tam).fill(false));
  const fixo=Array.from({length:tam},()=>Array(tam).fill(false));
  function atribuir(x,y,escuro) {
    if(x>=0&&x<tam&&y>=0&&y<tam) {mod[y][x]=!!escuro;fixo[y][x]=true;}
  }
  // Padrões fixos do QR: localizacao, alinhamento, timing, versao e formato.
  for(let i=0;i<tam;i++) {
    atribuir(6,i,i%2===0);
    atribuir(i,6,i%2===0);
  }
  for (const [cx,cy] of [[3,3],[tam-4,3],[3,tam-4]]) {
    for(let dy=-4;dy<=4;dy++) for(let dx=-4;dx<=4;dx++) {
      const d=Math.max(Math.abs(dx),Math.abs(dy));
      atribuir(cx+dx,cy+dy,d!==2&&d!==4);
    }
  }
  const alinhamentos=[6,28,50];
  for(const x of alinhamentos) for(const y of alinhamentos) {
    if((x===6&&y===6)||(x===6&&y===50)||(x===50&&y===6)) continue;
    for(let dy=-2;dy<=2;dy++) for(let dx=-2;dx<=2;dx++) {
      atribuir(x+dx,y+dy,Math.max(Math.abs(dx),Math.abs(dy))!==1);
    }
  }
  function versao() {
    let rem=10;
    for(let i=0;i<12;i++) rem=(rem<<1)^((rem>>>11)*0x1f25);
    const v=(10<<12)|rem;
    for(let i=0;i<18;i++) {
      const b=((v>>>i)&1)!==0;
      const a=tam-11+i%3;
      const c=Math.floor(i/3);
      atribuir(a,c,b);
      atribuir(c,a,b);
    }
  }
  versao();
  function formato(mask) {
    // EC-L corresponde ao identificador de formato '01'.
    const data=(1<<3)|mask;
    let rem=data;
    for(let i=0;i<10;i++) rem=(rem<<1)^((rem>>>9)*0x537);
    const v=((data<<10)|rem)^0x5412;
    const bit=i=>((v>>>i)&1)!==0;
    for(let i=0;i<=5;i++) atribuir(8,i,bit(i));
    atribuir(8,7,bit(6));atribuir(8,8,bit(7));atribuir(7,8,bit(8));
    for(let i=9;i<15;i++) atribuir(14-i,8,bit(i));
    for(let i=0;i<8;i++) atribuir(tam-1-i,8,bit(i));
    for(let i=8;i<15;i++) atribuir(8,tam-15+i,bit(i));
    atribuir(8,tam-8,true);
  }
  formato(0);
  let indice=0;
  const totalBits=saida.length*8;
  for(let x=tam-1;x>=1;x-=2) {
    if(x===6) x=5;
    for(let vert=0;vert<tam;vert++) {
      const y=((x+1)&2)===0 ? tam-1-vert : vert;
      for(let col=0;col<2;col++) {
        const cx=x-col;
        if(fixo[y][cx]) continue;
        let bit=false;
        if(indice<totalBits) bit=((saida[indice>>>3]>>>(7-(indice&7)))&1)!==0;
        indice++;
        if((cx+y)%2===0) bit=!bit; // Mascara 0.
        mod[y][cx]=bit;
      }
    }
  }
  return mod;
}
function QC_desenharQR275(elemento, texto) {
  const matriz=QC_matrizQR275(texto);
  const tamanho=matriz.length;
  const svgNS="http://www.w3.org/2000/svg";
  const svg=document.createElementNS(svgNS,"svg");
  svg.setAttribute("viewBox",`0 0 ${tamanho+8} ${tamanho+8}`);
  svg.setAttribute("width","252");
  svg.setAttribute("height","252");
  svg.setAttribute("role","img");
  svg.setAttribute("aria-label","QR Code de transferencia QuintosCoin");
  const fundo=document.createElementNS(svgNS,"rect");
  fundo.setAttribute("width",String(tamanho+8));
  fundo.setAttribute("height",String(tamanho+8));
  fundo.setAttribute("fill","white");
  svg.appendChild(fundo);
  let path="";
  for(let y=0;y<tamanho;y++) for(let x=0;x<tamanho;x++) {
    if(matriz[y][x]) path+=`M${x+4},${y+4}h1v1h-1z`;
  }
  const pontos=document.createElementNS(svgNS,"path");
  pontos.setAttribute("d",path);
  pontos.setAttribute("fill","black");
  svg.appendChild(pontos);
  elemento.replaceChildren(svg);
}


// PASSO 275 - UM BOTAO TRANSFERIR, COM ENVIAR E RECEBER NA MESMA JANELA.
// Nenhum QR ou codigo secreto passa por site de QR: gerar inteiramente local.
const qcBotaoTransferir275 = document.createElement("button");
qcBotaoTransferir275.type = "button";
qcBotaoTransferir275.id = "btnTransferir";
qcBotaoTransferir275.textContent = "Transferir Qc$";
qcBotaoTransferir275.disabled = true;
const qcAcoes275 = document.querySelector("#telaCarteira .acoes");
if (qcAcoes275) qcAcoes275.appendChild(qcBotaoTransferir275);

const qcModalTransferir275 = document.createElement("div");
qcModalTransferir275.id = "qcModalTransferir275";
qcModalTransferir275.className = "qc-modal-overlay";
qcModalTransferir275.style.display = "none";
qcModalTransferir275.innerHTML = `
  <div class="qc-modal-card" role="dialog" aria-modal="true"
    aria-labelledby="qcTituloTransf275">
    <div class="qc-modal-topo">
      <h3 id="qcTituloTransf275">Transferir QuintosCoin</h3>
      <button id="qcFecharTransf275" type="button" class="qc-modal-fechar"
        aria-label="Fechar">×</button>
    </div>
    <div style="display:flex;gap:8px;margin:10px 0 18px">
      <button type="button" id="qcAbaEnviar275" class="qc-btn-modal-principal"
        style="flex:1">Enviar</button>
      <button type="button" id="qcAbaReceber275" class="qc-btn-modal-secundario"
        style="flex:1">Receber</button>
    </div>
    <div id="qcPainelEnviar275">
      <label for="qcValorEnviar275" class="qc-label-modal">Quanto deseja transferir?</label>
      <input id="qcValorEnviar275" class="qc-input-modal"
        type="number" min="2" step="1" inputmode="numeric" placeholder="Exemplo: 8">
      <button type="button" id="qcEnviar275" class="qc-btn-modal-principal"
        style="margin:10px 0;width:100%">Continuar</button>
      <div id="qcResultadoEnvio275" hidden style="text-align:center">
        <p>Mostre o QR Code ao destinatário:</p>
        <div id="qcImagemQR275" style="display:flex;justify-content:center;margin:12px 0"></div>
        <button type="button" id="qcCopiarTransf275" class="qc-btn-modal-secundario">
          Copiar código
        </button>
        <button type="button" id="qcConferirTransf275" class="qc-btn-modal-secundario"
          style="margin-left:5px">Verificar recebimento</button>
        <p style="font-size:12px;opacity:.8">Compartilhe somente com quem deve receber.
          O código permite resgatar os QCs.</p>
      </div>
    </div>
    <div id="qcPainelReceber275" hidden>
      <p class="qc-modal-texto">Leia o QR Code do outro irmão ou cole o código recebido.</p>
      <button id="qcLerQR275" type="button" class="qc-btn-modal-secundario"
        style="margin-bottom:10px">Ler QR pela câmera</button>
      <div id="qcVideoQR275" hidden style="margin:8px auto;text-align:center"></div>
      <label for="qcCodigoReceber275" class="qc-label-modal">Código da transferência</label>
      <textarea id="qcCodigoReceber275" class="qc-input-modal" rows="3"
        style="width:100%;box-sizing:border-box;resize:vertical"
        placeholder="Cole aqui o código QC1|..."></textarea>
      <button type="button" id="qcReceber275" class="qc-btn-modal-principal"
        style="width:100%;margin-top:10px">Receber Qc$</button>
    </div>
    <p id="qcAvisoTransferir275" role="status" class="qc-modal-mensagem"></p>
  </div>`;
document.body.appendChild(qcModalTransferir275);

const qcValorEnviar275 = document.getElementById("qcValorEnviar275");
const qcValorReceber275 = document.getElementById("qcCodigoReceber275");
const qcAvisoTransferir275 = document.getElementById("qcAvisoTransferir275");
const qcResultadoEnvio275 = document.getElementById("qcResultadoEnvio275");
const qcImagemQR275 = document.getElementById("qcImagemQR275");
const qcEnviar275 = document.getElementById("qcEnviar275");
const qcReceber275 = document.getElementById("qcReceber275");
let qcCodigoCompartilhar275 = "";
let qcTrabalhando275 = false;
let qcStream275 = null;
let qcLeituraAtiva275 = false;

function QC_pararCamera275() {
  qcLeituraAtiva275 = false;
  if (qcStream275) qcStream275.getTracks().forEach(trilha => trilha.stop());
  qcStream275 = null;
  const area = document.getElementById("qcVideoQR275");
  area.replaceChildren();
  area.hidden = true;
}
function QC_fecharTransferencia275() {
  if (qcTrabalhando275) return;
  QC_pararCamera275();
  qcCodigoCompartilhar275 = "";
  qcImagemQR275.replaceChildren();
  qcModalTransferir275.style.display = "none";
}
function QC_mostrarAbaTransferencia275(aba) {
  QC_pararCamera275();
  const enviar = aba === "enviar";
  document.getElementById("qcPainelEnviar275").hidden = !enviar;
  document.getElementById("qcPainelReceber275").hidden = enviar;
  document.getElementById("qcAbaEnviar275").className =
    enviar ? "qc-btn-modal-principal" : "qc-btn-modal-secundario";
  document.getElementById("qcAbaReceber275").className =
    enviar ? "qc-btn-modal-secundario" : "qc-btn-modal-principal";
  qcAvisoTransferir275.textContent = "";
  if (!enviar && typeof window.QC_resgatePendente275 === "function" &&
      window.QC_resgatePendente275()) {
    qcValorReceber275.value = "";
    qcValorReceber275.disabled = true;
    qcReceber275.textContent = "Retomar recebimento";
    qcAvisoTransferir275.textContent =
      "Recebimento anterior pendente. Toque em Retomar recebimento.";
  } else if (!enviar) {
    qcValorReceber275.disabled = false;
    qcReceber275.textContent = "Receber Qc$";
  }
}
qcBotaoTransferir275.addEventListener("click", () => {
  if (!sessionStorage.getItem("QC_TOKEN_SESSAO_TESTE")) return;
  qcCodigoCompartilhar275 = "";
  qcResultadoEnvio275.hidden = true;
  qcImagemQR275.replaceChildren();
  qcValorEnviar275.value = "";
  qcValorReceber275.value = "";
  const pendente = typeof window.QC_transferenciaPendente275 === "function" &&
    window.QC_transferenciaPendente275();
  qcValorEnviar275.disabled = !!pendente;
  qcEnviar275.textContent = pendente ? "Retomar envio" : "Continuar";
  QC_mostrarAbaTransferencia275("enviar");
  if (pendente) qcAvisoTransferir275.textContent =
    "Uma transferencia anterior foi preservada. Retome para exibir o QR Code.";
  qcModalTransferir275.style.display = "flex";
  if (!pendente) qcValorEnviar275.focus();
});
document.getElementById("qcFecharTransf275")
  .addEventListener("click", QC_fecharTransferencia275);
qcModalTransferir275.addEventListener("click", e => {
  if (e.target === qcModalTransferir275) QC_fecharTransferencia275();
});
document.getElementById("qcAbaEnviar275")
  .addEventListener("click", () => QC_mostrarAbaTransferencia275("enviar"));
document.getElementById("qcAbaReceber275")
  .addEventListener("click", () => QC_mostrarAbaTransferencia275("receber"));
function QC_mostrarCodigo275(retorno) {
  qcCodigoCompartilhar275 = String(retorno.codigoQR || "");
  if (!/^QC1\|[0-9a-f-]{36}\|[0-9a-f]{64}$/i.test(qcCodigoCompartilhar275)) {
    throw Error("Codigo de transferencia inesperado.");
  }
  QC_desenharQR275(qcImagemQR275, qcCodigoCompartilhar275);
  qcResultadoEnvio275.hidden = false;
  qcValorEnviar275.disabled = true;
  qcEnviar275.textContent = "Retomar envio";
  qcAvisoTransferir275.textContent =
    "Transferencia preparada. Mostre o QR Code ou copie o codigo.";
}
qcEnviar275.addEventListener("click", async () => {
  if (qcTrabalhando275) return;
  if (typeof window.QC_transferirCriar275 !== "function") {
    qcAvisoTransferir275.textContent = "Atualize a pagina; modulo de fichas nao carregado.";
    return;
  }
  const pendente = typeof window.QC_transferenciaPendente275 === "function" &&
    window.QC_transferenciaPendente275();
  const valor = pendente ? 0 : Number(qcValorEnviar275.value);
  if (!pendente && (!Number.isSafeInteger(valor) || valor < 2 || valor === 3)) {
    qcAvisoTransferir275.textContent = "Informe valor inteiro maior ou igual a 2, exceto 3 QC.";
    return;
  }
  qcTrabalhando275 = true;
  qcEnviar275.disabled = true;
  qcAvisoTransferir275.textContent = "Preparando transferencia protegida...";
  try {
    const retorno = await window.QC_transferirCriar275(valor);
    if (retorno.status === "PRONTA") QC_mostrarCodigo275(retorno);
    else if (retorno.status === "CANCELADO") qcAvisoTransferir275.textContent="Operacao cancelada.";
    else qcAvisoTransferir275.textContent = String(retorno.status);
  } catch (err) {
    qcAvisoTransferir275.textContent = "⚠️ " + String(err.message || err);
  } finally {
    qcTrabalhando275 = false;
    qcEnviar275.disabled = false;
  }
});
qcValorEnviar275.addEventListener("keydown", e => {
  if (e.key === "Enter") {e.preventDefault();qcEnviar275.click();}
});
document.getElementById("qcCopiarTransf275")
  .addEventListener("click", async () => {
    if (!qcCodigoCompartilhar275) return;
    try {
      await navigator.clipboard.writeText(qcCodigoCompartilhar275);
      qcAvisoTransferir275.textContent="Codigo copiado. Envie somente ao destinatario.";
    } catch(_) {
      window.prompt("Copie o codigo para o destinatario:", qcCodigoCompartilhar275);
    }
  });
document.getElementById("qcConferirTransf275")
  .addEventListener("click", async () => {
    if (qcTrabalhando275) return;
    qcTrabalhando275 = true;
    qcAvisoTransferir275.textContent = "Consultando transferencia...";
    try {
      const r = await window.QC_transferirConsultar275();
      if (r.status === "CONCLUIDA") {
        qcResultadoEnvio275.hidden = true;
        qcCodigoCompartilhar275 = "";
        qcImagemQR275.replaceChildren();
        qcValorEnviar275.disabled = false;
        qcEnviar275.textContent = "Continuar";
        qcAvisoTransferir275.textContent =
          "✅ " + r.valorEnviado + " QC recebidos pelo destinatario. Nova transferencia liberada.";
      } else {
        qcAvisoTransferir275.textContent =
          "Aguardando recebimento pelo destinatario (" + r.status + ").";
      }
    } catch(err) {
      qcAvisoTransferir275.textContent="⚠️ " + String(err.message||err);
    } finally {qcTrabalhando275=false;}
  });
qcReceber275.addEventListener("click", async () => {
  if (qcTrabalhando275) return;
  if (typeof window.QC_transferirResgatar275 !== "function") {
    qcAvisoTransferir275.textContent = "Atualize a pagina; modulo de fichas nao carregado.";
    return;
  }
  QC_pararCamera275();
  qcTrabalhando275=true;
  qcReceber275.disabled=true;
  qcAvisoTransferir275.textContent = "Conferindo transferencia e preparando as fichas...";
  try {
    const retorno = await window.QC_transferirResgatar275(qcValorReceber275.value);
    if (retorno.status === "RECEBIDA") {
      qcAvisoTransferir275.textContent =
        "✅ Recebidos " + retorno.valorRecebido + " QC. Atualize seu saldo.";
      const mensagem=document.getElementById("mensagem");
      if (mensagem) mensagem.textContent=qcAvisoTransferir275.textContent;
      qcValorReceber275.value="";
      qcValorReceber275.disabled=false;
      qcReceber275.textContent="Receber Qc$";
    } else if (retorno.status === "CANCELADO") {
      qcAvisoTransferir275.textContent = "Recebimento cancelado.";
    } else {
      qcAvisoTransferir275.textContent = retorno.status;
    }
  } catch(err) {
    qcAvisoTransferir275.textContent = "⚠️ " + String(err.message||err);
  } finally {qcTrabalhando275=false;qcReceber275.disabled=false;}
});
qcValorReceber275.addEventListener("paste", () => {
  qcAvisoTransferir275.textContent = "";
});
document.getElementById("qcLerQR275").addEventListener("click", async () => {
  if (qcLeituraAtiva275 || qcTrabalhando275) return;
  if (typeof BarcodeDetector !== "function" || !navigator.mediaDevices?.getUserMedia) {
    qcAvisoTransferir275.textContent =
      "Seu navegador nao oferece leitura direta. Copie e cole o codigo no campo.";
    return;
  }
  let detector;
  try {detector=new BarcodeDetector({formats:["qr_code"]});}
  catch(_) {qcAvisoTransferir275.textContent="Use copiar/colar neste navegador.";return;}
  const area=document.getElementById("qcVideoQR275");
  const video=document.createElement("video");
  video.autoplay=true;video.muted=true;video.playsInline=true;
  video.style.cssText="width:100%;max-height:270px;border-radius:10px";
  try {
    const stream=await navigator.mediaDevices.getUserMedia({
      video:{facingMode:{ideal:"environment"}},audio:false
    });
    qcStream275=stream;
    video.srcObject=stream;
    area.replaceChildren(video);
    area.hidden=false;
    await video.play();
    qcLeituraAtiva275=true;
    qcAvisoTransferir275.textContent="Aponte a camera para o QR Code.";
    const capturar=async () => {
      if (!qcLeituraAtiva275) return;
      try {
        const codigos=await detector.detect(video);
        if (codigos.length) {
          const valor=String(codigos[0].rawValue||"");
          if (/^QC1\|[0-9a-f-]{36}\|[0-9a-f]{64}$/i.test(valor)) {
            qcValorReceber275.value=valor;
            QC_pararCamera275();
            qcAvisoTransferir275.textContent="Codigo lido. Toque em Receber QC.";
            return;
          }
        }
      } catch(_) { /* Camera ainda nao pronta; proxima leitura. */ }
      if (qcLeituraAtiva275) setTimeout(capturar,350);
    };
    capturar();
  } catch(err) {
    QC_pararCamera275();
    qcAvisoTransferir275.textContent = "Nao foi possivel abrir a camera: " +
      String(err.message||err) + ". Use copiar/colar.";
  }
});

QC_atualizarTela();

const QC_ID_LOCAL = "QC_ID_CARTEIRA";

// PASSO 291 — Identificação da carteira e nome, SEM tocar nas fichas.
function QC_atualizarBoasVindas291() {
  const alvo = document.getElementById("qcBoasVindas");
  if (!alvo) return;
  const id = localStorage.getItem(QC_ID_LOCAL);
  const nome = id ? String(localStorage.getItem("QC_NOME_CARTEIRA_"+id)||"").trim() : "";
  alvo.textContent = nome
    ? "Bem-vindo, Ir.'. " + nome + ". Digite sua senha para entrar."
    : "Bem-vindo! Digite sua senha para entrar na carteira.";
}

async function QC_localizarConta291(dados) {
  const resposta = await fetch(QC_URL_191, {
    method:"POST", redirect:"follow",
    headers:{"Content-Type":"text/plain;charset=utf-8"},
    body:JSON.stringify(Object.assign({acao:"qc_localizar_carteira"},dados))
  });
  if (!resposta.ok) throw Error("Falha na consulta da carteira (HTTP "+resposta.status+").");
  const r = await resposta.json();
  if (!r || r.status !== "OK" || !r.idCarteira) {
    throw Error(r?.mensagem || "Carteira ativa não localizada para esse irmão.");
  }
  return {idCarteira:String(r.idCarteira).trim(),
    nome:String(r.nome || r.nomeIrmao || r.Nome || "").trim()};
}

async function QC_carregarNome291() {
  const id = localStorage.getItem(QC_ID_LOCAL);
  if (!id) return;
  QC_atualizarBoasVindas291();
  if (localStorage.getItem("QC_NOME_CARTEIRA_"+id)) return;
  try {
    const conta = await QC_localizarConta291({idCarteira:id});
    if (conta.idCarteira !== id || !conta.nome ||
        localStorage.getItem(QC_ID_LOCAL) !== id) return;
    localStorage.setItem("QC_NOME_CARTEIRA_"+id,conta.nome);
    QC_atualizarBoasVindas291();
  } catch (_) {
    // Sem conectar, permitir login sem nome inventado.
  }
}

(function QC_restaurarTrocaDeCarteira291() {
  const link=document.getElementById("qcLinkTrocarCarteira");
  const painel=document.getElementById("qcPainelTrocaCarteira");
  const idCampo=document.getElementById("qcOutroIdCadastro");
  const selecionar=document.getElementById("qcSelecionarOutraCarteira");
  const cancelar=document.getElementById("qcCancelarTrocaCarteira");
  const mensagem=document.getElementById("qcMensagemTrocaCarteira");
  if (!link||!painel||!idCampo||!selecionar||!cancelar||!mensagem) return;
  link.addEventListener("click", e=>{
    e.preventDefault();
    painel.style.display="block";
    mensagem.textContent="";
    idCampo.focus();
  });
  cancelar.addEventListener("click",()=>{
    painel.style.display="none";
    idCampo.value="";
    mensagem.textContent="";
  });
  selecionar.addEventListener("click",async()=>{
    const idCadastro=idCampo.value.trim();
    if(!idCadastro){mensagem.textContent="Informe o IdCadastro.";return;}
    selecionar.disabled=true;
    mensagem.textContent="Localizando carteira...";
    try {
      const conta=await QC_localizarConta291({idCadastro});
      // Nunca remover registros com outras carteiras; apenas selecionar o ID.
      QC_AUTO303.limpar();
      sessionStorage.removeItem("QC_TOKEN_SESSAO_TESTE");
      if (window.QC_limparSenhaSessao291) window.QC_limparSenhaSessao291();
      localStorage.setItem(QC_ID_LOCAL,conta.idCarteira);
      if(conta.nome) localStorage.setItem("QC_NOME_CARTEIRA_"+conta.idCarteira,conta.nome);
      const senhaCampo=document.getElementById("qcSenhaLogin");
      if(senhaCampo) senhaCampo.value="";
      painel.style.display="none";
      idCampo.value="";
      mensagem.textContent="";
      QC_atualizarBoasVindas291();
      QC_carregarNome291();
      QC_mostrarMensagemAcesso("Carteira selecionada. Digite a senha desse irmão.","sucesso");
    }catch(err){mensagem.textContent="⚠️ "+(err.message||err);}
    finally{selecionar.disabled=false;}
  });
})();

function QC_mostrarAtivacao() {

  document.getElementById("formAtivacao")
    .style.display = "block";

  document.getElementById("formLogin")
    .style.display = "none";
}

function QC_mostrarLogin() {
  QC_atualizarBoasVindas291();
  QC_carregarNome291();

  document.getElementById("formAtivacao")
    .style.display = "none";

  document.getElementById("formLogin")
    .style.display = "block";
}

document.getElementById("linkJaTenhoCarteira")
  .addEventListener("click", function(evento) {

    evento.preventDefault();
    QC_mostrarLogin();

  });

document.getElementById("linkPrimeiroAcesso")
  .addEventListener("click", function(evento) {

    evento.preventDefault();
    QC_mostrarAtivacao();

  });

function QC_mostrarMensagemAcesso(texto, tipo) {

  const mensagem = document.getElementById(
    "qcMensagemAcesso"
  );

  mensagem.className = "";
  void mensagem.offsetWidth; // Reinicia a animação

  mensagem.textContent =
    (tipo === "erro" ? "⚠️ " : "✅ ") + texto;

  mensagem.className = tipo;

  mensagem.scrollIntoView({
    behavior: "smooth",
    block: "nearest"
  });
}

let QC_ativacaoPendente = null;
let QC_recuperacaoPendente = null;

document.getElementById("btnAtivarCarteira")
  .addEventListener("click", function(evento) {

    evento.preventDefault();

    const campoId = document.getElementById("qcIdCadastro");
    const campoSenha = document.getElementById("qcNovaSenha");
    const campoConfirmar = document.getElementById("qcConfirmarSenha");

    const id = campoId.value.trim();
    const senha = campoSenha.value;
    const confirmar = campoConfirmar.value;

    [campoId, campoSenha, campoConfirmar].forEach(
      campo => campo.classList.remove("campo-erro")
    );

    if (!id) {
      campoId.classList.add("campo-erro");
      QC_mostrarMensagemAcesso(
        "Informe seu IdCadastro.",
        "erro"
      );
      return;
    }

    if (senha.length < 6) {
      campoSenha.classList.add("campo-erro");
      QC_mostrarMensagemAcesso(
        "A senha deve ter pelo menos 6 caracteres.",
        "erro"
      );
      return;
    }

    if (senha !== confirmar) {
      campoConfirmar.classList.add("campo-erro");
      QC_mostrarMensagemAcesso(
        "As senhas não conferem.",
        "erro"
      );
      return;
    }

    // Gerar código seguro de recuperação
    const bytes = new Uint8Array(16);
    window.crypto.getRandomValues(bytes);

    const codigo = Array.from(bytes)
      .map(b => b.toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase()
      .match(/.{1,8}/g)
      .join("-");

    // Dados temporários, mantidos apenas em memória
    QC_ativacaoPendente = {
      idCadastro: id,
      senha: senha,
      codigoRecuperacao: codigo
    };

    // Exibir código ANTES de registrar a carteira
    QC_exibirCodigoRecuperacao(codigo);

  });



async function QC_enviarAtivacaoV2(dados) {

  const URL_APPS_SCRIPT =
    "https://script.google.com/macros/s/AKfycbxEU0xzZz833Bqv7CxV-PdTVIjxRrl27lNgSG0upZ07rnXaAkULhGGuehxbpU2-K1oyOQ/exec";

  // Validar os dados recebidos do formulário.
  if (
    typeof dados.senha !== "string" ||
    dados.senha.length < 6
  ) {
    throw new Error(
      "A senha deve ter pelo menos 6 caracteres."
    );
  }

  // Criar um salt exclusivo para a nova carteira.
  const saltHex = QC_gerarSaltSenhaV2();

  // Calcular PBKDF2 no próprio Android.
  const derivadoHex = await QC_derivarSenhaV2(
    dados.senha,
    saltHex
  );

  // Enviar a credencial derivada, não a senha original.
  const resposta = await fetch(URL_APPS_SCRIPT, {
    method: "POST",
    redirect: "follow",
    headers: {
      "Content-Type": "text/plain;charset=utf-8"
    },
    body: JSON.stringify({
      acao: "qc_ativar",
      idCadastro: dados.idCadastro,
      derivadoHex: derivadoHex,
      saltHex: saltHex,
      codigoRecuperacao: dados.codigoRecuperacao
    })
  });

  if (!resposta.ok) {
    throw new Error(
      "Erro de comunicação: " + resposta.status
    );
  }

  const resultado = await resposta.json();

  if (
    resultado.status !== "OK" ||
    !resultado.idCarteira
  ) {
    throw new Error(
      resultado.mensagem ||
      "Não foi possível ativar a carteira."
    );
  }

  return resultado;
}




const QC_CHAVE_SESSAO = "QC_TOKEN_SESSAO_TESTE";

// PASSO 303 — sessao temporaria restauravel, sem salvar senha legivel.
// Os dados cifrados permanecem nesta aba (sessionStorage). A chave AES
// nao exportavel fica no IndexedDB do navegador. A restauracao EXIGE o
// token ainda valido no Apps Script. Use apenas em dispositivos pessoais.
const QC_AUTO303 = (() => {
  "use strict";
  const NOME = "QC_ACESSO_TEMPORARIO_303";
  const BASE = "QC_CHAVES_TEMPORARIAS_303";
  const LOJA = "chaves";
  const INATIVIDADE = 30 * 60 * 1000;
  const MAXIMO = 30 * 60 * 1000; // alinhado ao TTL atual do servidor
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  let ultimoToque = 0;

  function abrirBD() {
    return new Promise((resolve, reject) => {
      if (!window.indexedDB || !window.crypto?.subtle) {
        reject(Error("Armazenamento seguro indisponivel."));
        return;
      }
      const req = indexedDB.open(BASE, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(LOJA)) db.createObjectStore(LOJA);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || Error("Falha no IndexedDB."));
      req.onblocked = () => reject(Error("IndexedDB bloqueado."));
    });
  }
  async function banco(acao, chave, valor) {
    const db = await abrirBD();
    return new Promise((resolve, reject) => {
      let resultado;
      let transacao;
      try {
        transacao = db.transaction(LOJA, acao === "ler" ? "readonly" : "readwrite");
        const loja = transacao.objectStore(LOJA);
        const req = acao === "salvar" ? loja.put(valor, chave)
          : acao === "excluir" ? loja.delete(chave) : loja.get(chave);
        req.onsuccess = () => { resultado = req.result; };
        transacao.oncomplete = () => { db.close(); resolve(resultado); };
        transacao.onerror = () => { db.close(); reject(transacao.error || Error("Falha ao acessar a chave.")); };
        transacao.onabort = () => { db.close(); reject(transacao.error || Error("Operacao de chave cancelada.")); };
      } catch (e) { db.close(); reject(e); }
    });
  }
  const codificar = bytes => btoa(Array.from(bytes, b => String.fromCharCode(b)).join(""));
  const decodificar = texto => Uint8Array.from(atob(texto), c => c.charCodeAt(0));
  function ler() {
    try { return JSON.parse(sessionStorage.getItem(NOME) || "null"); }
    catch (_) { return null; }
  }
  function limpar() {
    const antigo = ler();
    sessionStorage.removeItem(NOME);
    if (antigo?.chaveId) banco("excluir", antigo.chaveId).catch(() => {});
  }
  function expirou(dados) {
    const agora = Date.now();
    return !dados || dados.versao !== 1 ||
      !Number.isFinite(dados.ultimoUso) || !Number.isFinite(dados.limite) ||
      dados.ultimoUso > agora + 60_000 ||
      agora - dados.ultimoUso > INATIVIDADE || agora > dados.limite;
  }
  async function salvar(senha) {
    limpar();
    const id = localStorage.getItem("QC_ID_CARTEIRA");
    const token = sessionStorage.getItem("QC_TOKEN_SESSAO_TESTE");
    if (!id || !token || typeof senha !== "string" || !senha) return false;
    let chaveId = null;
    try {
      chaveId = crypto.randomUUID();
      const chave = await crypto.subtle.generateKey(
        {name:"AES-GCM", length:256}, false, ["encrypt", "decrypt"]);
      await banco("salvar", chaveId, chave);
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const limite = Date.now() + MAXIMO;
      const contexto = encoder.encode(id + "|" + token + "|" + limite);
      const cifrado = await crypto.subtle.encrypt(
        {name:"AES-GCM", iv, additionalData:contexto}, chave, encoder.encode(senha));
      if (id !== localStorage.getItem("QC_ID_CARTEIRA") ||
          token !== sessionStorage.getItem("QC_TOKEN_SESSAO_TESTE")) {
        await banco("excluir", chaveId);
        return false;
      }
      sessionStorage.setItem(NOME, JSON.stringify({
        versao:1, id, chaveId, iv:codificar(iv), dados:codificar(new Uint8Array(cifrado)),
        limite, ultimoUso:Date.now()
      }));
      return true;
    } catch (_) {
      sessionStorage.removeItem(NOME);
      if (chaveId) banco("excluir", chaveId).catch(() => {});
      return false; // Uma falha no cache NUNCA bloqueia o login.
    }
  }
  async function recuperar() {
    const dados = ler();
    if (!dados) return null;
    const id = localStorage.getItem("QC_ID_CARTEIRA");
    const token = sessionStorage.getItem("QC_TOKEN_SESSAO_TESTE");
    if (!id || !token || id !== dados.id || expirou(dados)) {
      limpar();
      return null;
    }
    try {
      const chave = await banco("ler", dados.chaveId);
      if (!chave) { limpar(); return null; }
      const contexto = encoder.encode(id + "|" + token + "|" + dados.limite);
      const claro = await crypto.subtle.decrypt(
        {name:"AES-GCM", iv:decodificar(dados.iv), additionalData:contexto},
        chave, decodificar(dados.dados));
      if (id !== localStorage.getItem("QC_ID_CARTEIRA") ||
          token !== sessionStorage.getItem("QC_TOKEN_SESSAO_TESTE")) return null;
      return decoder.decode(claro);
    } catch (_) { limpar(); return null; }
  }
  function atividade() {
    const agora = Date.now();
    if (agora - ultimoToque < 10_000) return;
    ultimoToque = agora;
    const dados = ler();
    if (!dados || expirou(dados)) return;
    if (dados.id !== localStorage.getItem("QC_ID_CARTEIRA") ||
      !sessionStorage.getItem("QC_TOKEN_SESSAO_TESTE")) return;
    dados.ultimoUso = agora;
    sessionStorage.setItem(NOME, JSON.stringify(dados));
  }
  document.addEventListener("pointerdown", atividade, {passive:true});
  document.addEventListener("keydown", atividade);
  return {salvar, recuperar, limpar, atividade};
})();



async function QC_validarSessaoServidor(tokenSessao) {

  const URL_APPS_SCRIPT =
    "https://script.google.com/macros/s/AKfycbxEU0xzZz833Bqv7CxV-PdTVIjxRrl27lNgSG0upZ07rnXaAkULhGGuehxbpU2-K1oyOQ/exec";

  const resposta = await fetch(URL_APPS_SCRIPT, {
    method: "POST",
    redirect: "follow",
    headers: {
      "Content-Type": "text/plain;charset=utf-8"
    },
    body: JSON.stringify({
      acao: "qc_validar_sessao_teste",
      tokenSessao: tokenSessao
    })
  });

  if (!resposta.ok) {
    throw new Error(
      "Erro de comunicação HTTP: " + resposta.status
    );
  }

  return await resposta.json();
}




document.getElementById("btnEntrarCarteira")
  .addEventListener("click", async function(evento) {

    evento.preventDefault();

    const campoSenha = document.getElementById(
      "qcSenhaLogin"
    );

    const botao = document.getElementById(
      "btnEntrarCarteira"
    );

    const idCarteira = localStorage.getItem(
      QC_ID_LOCAL
    );

    const senha = campoSenha.value;

    if (!idCarteira) {
      QC_mostrarMensagemAcesso(
        "Carteira não identificada neste dispositivo.",
        "erro"
      );
      return;
    }

    if (!senha) {
      QC_mostrarMensagemAcesso(
        "Informe sua senha.",
        "erro"
      );
      campoSenha.focus();
      return;
    }

    botao.disabled = true;
    botao.textContent = "Verificando senha...";

    try {

      const resultado = await QC_enviarLoginAutomatico(
        idCarteira,
        senha
      );

     
if (resultado.status === "OK") {

  if (!resultado.tokenSessao) {
    throw new Error(
      "O servidor não retornou o token da sessão."
    );
  }

  // Verificar o token no Apps Script
  const verificacao = await QC_validarSessaoServidor(
    resultado.tokenSessao
  );

  if (
    verificacao.status !== "OK" ||
    verificacao.idCarteira !== idCarteira
  ) {
    throw new Error(
      verificacao.mensagem ||
      "Não foi possível validar a sessão."
    );
  }

  // Guardar o token temporário
  sessionStorage.setItem(
    QC_CHAVE_SESSAO,
    resultado.tokenSessao
  );

  // Limpar a tela de senha, mas preservar a credencial apenas nesta
  // chamada, para iniciar as fichas na memoria durante a sessao.
  campoSenha.value = "";

  QC_exibirTelaCarteira();
  try {
    if (typeof window.QC_aposLogin291 !== "function") {
      throw Error("Modulo do saldo nao carregado.");
    }
    await window.QC_aposLogin291(senha);
    // O acesso automatico so e ativado se a senha abriu as fichas.
    await QC_AUTO303.salvar(senha);
  } catch (erroFichas) {
    const msg=document.getElementById("mensagem");
    if(msg) msg.textContent="⚠️ Fichas protegidas: "+
      (erroFichas.message||erroFichas)+". Nenhuma ficha foi apagada.";
  }

  // Manter operações financeiras desabilitadas
  document.getElementById("btnReceber").disabled = false;
  document.getElementById("btnDoar").disabled = false;
  document.getElementById("btnTransferir").disabled = false;
  if (window.QC_habilitarResgate278) window.QC_habilitarResgate278();

  const avisoLogin=document.getElementById("mensagem");
  if(avisoLogin && !avisoLogin.textContent.startsWith("⚠️")) avisoLogin.textContent="";

} else {


        QC_mostrarMensagemAcesso(
          resultado.mensagem ||
          "Não foi possível realizar o login.",
          "erro"
        );

      }

    } catch (erro) {

      QC_mostrarMensagemAcesso(
        "Falha na comunicação: " + erro.message,
        "erro"
      );

    } finally {

      botao.disabled = false;
      botao.textContent = "Entrar";

    }

  });


if (localStorage.getItem(QC_ID_LOCAL)) {
  QC_mostrarLogin();
} else {
  QC_mostrarAtivacao();
}

function QC_exibirTelaAcesso() {
  qcSequenciaIndicadorReceber300++;
  QC_mostrarIndicadorReceber300(0);

  document.getElementById("telaAcesso")
    .style.display = "block";

  document.getElementById("telaCarteira")
    .style.display = "none";
  const resgate278 = document.getElementById("btnResgatar");
  if (resgate278) resgate278.disabled = true;

    const areaTesoureiro = document.getElementById(
    "qcAreaTesoureiro"
  );

  if (areaTesoureiro) {
    areaTesoureiro.style.display = "none";
    const detalhes = document.getElementById("qcDetalhesTesoureiro294");
    if (detalhes) detalhes.open = false;
  }
}

function QC_exibirTelaCarteira() {

  document.getElementById("telaAcesso")
    .style.display = "none";

  document.getElementById("telaCarteira")
    .style.display = "block";

    QC_atualizarTela();
  // Sinalizar valores autorizados assim que entrar na carteira.
  QC_atualizarIndicadorReceber300();

  // Consultar se esta carteira pertence ao tesoureiro.
  QC_atualizarAreaTesoureiro();
}


// Por segurança, sempre iniciar na tela de acesso.
// A carteira só será exibida após autenticação.
QC_exibirTelaAcesso();


async function QC_testarConexaoServidor() {

  const URL_APPS_SCRIPT =
    "https://script.google.com/macros/s/AKfycbxEU0xzZz833Bqv7CxV-PdTVIjxRrl27lNgSG0upZ07rnXaAkULhGGuehxbpU2-K1oyOQ/exec";

  try {

    const resposta = await fetch(
      URL_APPS_SCRIPT + "?acao=qc_teste",
      {
        method: "GET",
        redirect: "follow"
      }
    );

    if (!resposta.ok) {
      throw new Error(
        "Erro HTTP: " + resposta.status
      );
    }

    const dados = await resposta.json();

    if (
      dados.sistema !== "QuintosCoin" ||
      dados.status !== "OK"
    ) {
      throw new Error(
        dados.mensagem || "Resposta inesperada do servidor."
      );
    }

    return {
      status: "OK",
      mensagem: dados.mensagem
    };

  } catch (erro) {

    console.error(
      "Erro de comunicação QuintosCoin:",
      erro
    );

    return {
      status: "ERRO",
      mensagem: erro.message || "Erro desconhecido."
    };

  }
}

async function QC_testarConexaoPost() {

  const URL_APPS_SCRIPT =
    "https://script.google.com/macros/s/AKfycbxEU0xzZz833Bqv7CxV-PdTVIjxRrl27lNgSG0upZ07rnXaAkULhGGuehxbpU2-K1oyOQ/exec";

  try {

    const resposta = await fetch(URL_APPS_SCRIPT, {
      method: "POST",
      redirect: "follow",
      headers: {
        "Content-Type": "text/plain;charset=utf-8"
      },
      body: JSON.stringify({
        acao: "qc_teste_post"
      })
    });

    if (!resposta.ok) {
      throw new Error("HTTP " + resposta.status);
    }

    const dados = await resposta.json();

    if (
      dados.sistema !== "QuintosCoin" ||
      dados.status !== "OK"
    ) {
      throw new Error(
        dados.mensagem || "Resposta inesperada do servidor."
      );
    }

    return {
      status: "OK",
      mensagem: dados.mensagem
    };

  } catch (erro) {

    console.error("Erro POST QuintosCoin:", erro);

    return {
      status: "ERRO",
      mensagem: erro.message || "Erro desconhecido."
    };
  }
}


function QC_exibirCodigoRecuperacao(codigo) {

  document.getElementById("telaAcesso")
    .style.display = "none";

  document.getElementById("telaCarteira")
    .style.display = "none";

  document.getElementById("telaRecuperacao")
    .style.display = "block";

  document.getElementById("qcCodigoRecuperacao")
    .textContent = codigo;

  document.getElementById("qcMensagemCopia")
    .textContent = "";

  document.getElementById("qcConfirmouCodigo")
    .checked = false;

  document.getElementById("qcBtnContinuar")
    .disabled = true;
}


document.getElementById("qcBtnCopiar")
  .addEventListener("click", async function() {

    const codigo = document.getElementById(
      "qcCodigoRecuperacao"
    ).textContent;

    const mensagem = document.getElementById(
      "qcMensagemCopia"
    );

    try {

      await navigator.clipboard.writeText(codigo);

      mensagem.textContent =
        "✅ Código copiado! Guarde-o em local seguro.";

    } catch (erro) {

      mensagem.textContent =
        "Não foi possível copiar automaticamente. Selecione o código e copie manualmente.";

    }

  });


document.getElementById("qcConfirmouCodigo")
  .addEventListener("change", function() {

    document.getElementById("qcBtnContinuar")
      .disabled = !this.checked;

  });




document.getElementById("qcBtnContinuar")
  .addEventListener("click", async function() {

    const botao = document.getElementById(
      "qcBtnContinuar"
    );

    const mensagem = document.getElementById(
      "qcMensagemCopia"
    );

    const confirmou = document.getElementById(
      "qcConfirmouCodigo"
    ).checked;

    if (!confirmou) {
      return;
    }

    botao.disabled = true;

    // =========================================
    // RECUPERAÇÃO DE SENHA
    // =========================================

    if (QC_recuperacaoPendente) {

      mensagem.textContent =
        "Redefinindo senha de teste...";

      try {

        await QC_enviarRecuperacaoAutomatico(
          QC_recuperacaoPendente
        );

        // Apagar o token local, caso exista.
        QC_AUTO303.limpar();
        sessionStorage.removeItem(
          QC_CHAVE_SESSAO
        );

        // Limpar dados temporários.
        QC_recuperacaoPendente = null;

        document.getElementById(
          "qcCodigoRecuperar"
        ).value = "";

        document.getElementById(
          "qcSenhaRecuperar"
        ).value = "";

        document.getElementById(
          "qcConfirmarSenhaRecuperar"
        ).value = "";

        // Fechar as telas de recuperação.
        document.getElementById(
          "telaRecuperacao"
        ).style.display = "none";

        document.getElementById(
          "formRecuperarSenha"
        ).style.display = "none";

        // Retornar ao login.
        QC_exibirTelaAcesso();
        QC_mostrarLogin();

        document.getElementById(
          "qcSenhaLogin"
        ).value = "";

        QC_mostrarMensagemAcesso(
          "Senha redefinida com sucesso! " +
          "Entre utilizando sua nova senha.",
          "sucesso"
        );

      } catch (erro) {

        mensagem.style.color = "#ffcc80";

        mensagem.textContent =
          "⚠️ Não foi possível confirmar a redefinição: " +
          erro.message +
          ". Guarde o novo código apresentado.";

      } finally {

        botao.disabled = false;

      }

      return;
    }

    // =========================================
    // PRIMEIRA ATIVAÇÃO
    // =========================================

    if (!QC_ativacaoPendente) {
      botao.disabled = false;
      return;
    }

    mensagem.textContent =
      "Registrando sua carteira QuintosCoin...";

    try {

      const resultado = await QC_enviarAtivacaoV2(
        QC_ativacaoPendente
      );

      localStorage.setItem(
        QC_ID_LOCAL,
        resultado.idCarteira
      );

      QC_ativacaoPendente = null;

      document.getElementById(
        "qcNovaSenha"
      ).value = "";

      document.getElementById(
        "qcConfirmarSenha"
      ).value = "";

      document.getElementById(
        "qcSenhaLogin"
      ).value = "";

      document.getElementById(
        "telaRecuperacao"
      ).style.display = "none";

      QC_exibirTelaAcesso();
      QC_mostrarLogin();

      QC_mostrarMensagemAcesso(
        "Carteira QuintosCoin ativada com sucesso! " +
        "Agora você poderá utilizar a tela de login.",
        "sucesso"
      );

    } catch (erro) {

      mensagem.style.color = "#ffcc80";

      mensagem.textContent =
        "⚠️ Não foi possível confirmar a ativação: " +
        erro.message +
        ". Guarde o código apresentado.";

    } finally {

      botao.disabled = false;

    }

  });


// QUINTOSCOIN - ENCERRAR SESSÃO

async function QC_enviarLogoutTeste(tokenSessao) {

  const URL_APPS_SCRIPT =
    "https://script.google.com/macros/s/AKfycbxEU0xzZz833Bqv7CxV-PdTVIjxRrl27lNgSG0upZ07rnXaAkULhGGuehxbpU2-K1oyOQ/exec";

  const resposta = await fetch(URL_APPS_SCRIPT, {
    method: "POST",
    redirect: "follow",
    headers: {
      "Content-Type": "text/plain;charset=utf-8"
    },
    body: JSON.stringify({
      acao: "qc_logout_teste",
      tokenSessao: tokenSessao
    })
  });

  if (!resposta.ok) {
    throw new Error("Erro HTTP: " + resposta.status);
  }

  return await resposta.json();
}


document.getElementById("btnSairCarteira")
  .addEventListener("click", async function() {

    const botao = document.getElementById(
      "btnSairCarteira"
    );

    const token = sessionStorage.getItem(
      QC_CHAVE_SESSAO
    );

    botao.disabled = true;
    botao.textContent = "Encerrando sessão...";

    try {

      if (token) {

        const resultado = await QC_enviarLogoutTeste(
          token
        );

        if (
          resultado.status !== "OK" &&
          resultado.status !== "SESSAO_INVALIDA"
        ) {
          throw new Error(
            resultado.mensagem ||
            "Não foi possível encerrar a sessão."
          );
        }
      }

      // Remover somente o token de sessão.
      QC_AUTO303.limpar();
      sessionStorage.removeItem(QC_CHAVE_SESSAO);
      if (window.QC_limparSenhaSessao291) window.QC_limparSenhaSessao291();

      // Ocultar a carteira e mostrar o login.
      QC_exibirTelaAcesso();
      QC_mostrarLogin();

      document.getElementById(
        "qcSenhaLogin"
      ).value = "";

      QC_mostrarMensagemAcesso(
        "Sessão encerrada! Digite sua senha para entrar novamente.",
        "sucesso"
      );

    } catch (erro) {

      // Em caso de falha, não afirmar que o servidor
      // encerrou a sessão. Permitir nova tentativa.
      document.getElementById("mensagem").textContent =
        "⚠️ Não foi possível confirmar o encerramento: " +
        erro.message +
        ". Tente novamente.";

    } finally {

      botao.disabled = false;
      botao.textContent = "🚪 Sair da carteira";

    }

  });


/* QUINTOSCOIN - RESTAURAR SESSÃO AO ABRIR */

async function QC_restaurarSessaoTeste() {
  const token = sessionStorage.getItem(QC_CHAVE_SESSAO);
  const id = localStorage.getItem(QC_ID_LOCAL);
  const recuperacao = new URLSearchParams(location.search).has("testeRecuperacao");
  try {
    if (!token || !id || recuperacao) {
      QC_exibirTelaAcesso();
      QC_mostrarLogin();
      QC_carregarNome291();
      return;
    }
    // Nunca reabrir a carteira somente pela existencia do token local.
    const senha = await QC_AUTO303.recuperar();
    if (!senha) throw Error("Acesso temporario encerrado.");
    const validacao = await QC_validarSessaoServidor(token);
    if (validacao.status !== "OK" || String(validacao.idCarteira) !== id) {
      throw Error("Sessao nao validada pelo servidor.");
    }
    if (sessionStorage.getItem(QC_CHAVE_SESSAO) !== token ||
      localStorage.getItem(QC_ID_LOCAL) !== id) return;
    if (typeof window.QC_aposLogin291 !== "function") {
      throw Error("Modulo das fichas indisponivel.");
    }
    // Somente mostrar o saldo como verificado APOS conferir as fichas gastas.
    await window.QC_aposLogin291(senha);
    if (sessionStorage.getItem(QC_CHAVE_SESSAO) !== token ||
      localStorage.getItem(QC_ID_LOCAL) !== id) return;
    QC_exibirTelaCarteira();
    for (const nome of ["btnReceber", "btnDoar", "btnTransferir"]) {
      const botao = document.getElementById(nome);
      if (botao) botao.disabled = false;
    }
    if (window.QC_habilitarResgate278) window.QC_habilitarResgate278();
    QC_AUTO303.atividade();
    const msg = document.getElementById("mensagem");
    if (msg && !msg.textContent.startsWith("⚠️")) msg.textContent = "";
  } catch (erro) {
    // Nao toca em saldos/fichas/backups; apenas solicita novo login.
    QC_AUTO303.limpar();
    if (sessionStorage.getItem(QC_CHAVE_SESSAO) === token) {
      sessionStorage.removeItem(QC_CHAVE_SESSAO);
    }
    if (window.QC_limparSenhaSessao291) window.QC_limparSenhaSessao291();
    QC_exibirTelaAcesso();
    QC_mostrarLogin();
    QC_carregarNome291();
    QC_mostrarMensagemAcesso(
      "A sessao temporaria nao pode ser restaurada. Entre com sua senha.", "erro");
  } finally {
    document.documentElement.classList.remove("qc-restaurando");
  }
}

// Aguardar todos os modulos do navegador, inclusive qc-saldo.js.
document.addEventListener("DOMContentLoaded", QC_restaurarSessaoTeste, {once:true});


// QUINTOSCOIN - INTERFACE DE ALTERAÇÃO DE SENHA

function QC_limparFormularioTrocaSenha() {

  document.getElementById("qcSenhaAtual").value = "";
  document.getElementById("qcSenhaNova").value = "";
  document.getElementById("qcSenhaNovaConfirmar").value = "";

  const mensagem = document.getElementById(
    "qcMensagemTrocaSenha"
  );

  mensagem.textContent = "";
  mensagem.className = "";
}


function QC_mostrarMensagemTrocaSenha(texto, tipo) {

  const mensagem = document.getElementById(
    "qcMensagemTrocaSenha"
  );

  mensagem.textContent =
    (tipo === "erro" ? "⚠️ " : "✅ ") + texto;

  mensagem.className = tipo;
}


document.getElementById("btnAbrirTrocaSenha")
  .addEventListener("click", function() {

    QC_limparFormularioTrocaSenha();

    document.getElementById("qcPainelTrocaSenha")
      .style.display = "block";

    document.getElementById("btnAbrirTrocaSenha")
      .style.display = "none";

  });


document.getElementById("btnCancelarTrocaSenha")
  .addEventListener("click", function() {

    QC_limparFormularioTrocaSenha();

    document.getElementById("qcPainelTrocaSenha")
      .style.display = "none";

    document.getElementById("btnAbrirTrocaSenha")
      .style.display = "block";

  });



document.getElementById("btnConfirmarTrocaSenha")
  .addEventListener("click", async function() {

    const atual = document.getElementById(
      "qcSenhaAtual"
    ).value;

    const nova = document.getElementById(
      "qcSenhaNova"
    ).value;

    const confirmar = document.getElementById(
      "qcSenhaNovaConfirmar"
    ).value;

    const token = sessionStorage.getItem(
      QC_CHAVE_SESSAO
    );

    const botao = document.getElementById(
      "btnConfirmarTrocaSenha"
    );

    // Validar formulário

    if (!atual) {
      QC_mostrarMensagemTrocaSenha(
        "Informe sua senha atual.",
        "erro"
      );
      return;
    }

    if (nova.length < 6) {
      QC_mostrarMensagemTrocaSenha(
        "A senha deve ter pelo menos 6 caracteres.",
        "erro"
      );
      return;
    }

    if (nova === atual) {
      QC_mostrarMensagemTrocaSenha(
        "A nova senha deve ser diferente da atual.",
        "erro"
      );
      return;
    }

    if (nova !== confirmar) {
      QC_mostrarMensagemTrocaSenha(
        "As senhas não conferem.",
        "erro"
      );
      return;
    }

    if (!token) {
      QC_mostrarMensagemTrocaSenha(
        "Sessão não encontrada. Faça login novamente.",
        "erro"
      );
      return;
    }

    // Enviar alteração ao servidor

    botao.disabled = true;
    botao.textContent = "Alterando senha...";

    try {

      const resultado = await QC_enviarAlteracaoSenhaAutomatico(
        token,
        atual,
        nova
      );

      if (resultado.status === "OK") {
        // Senha alterada no servidor. Ajustar tambem a criptografia local.
        try {
          if(window.QC_migrarSenhaLogin291)
            await window.QC_migrarSenhaLogin291(atual, nova);
        } catch(migracaoErro) {
          // O antigo segredo continua protegendo as fichas.
          // No proximo login sera pedida a senha anterior so para migrar.
          console.warn("Migracao local pendente:",migracaoErro.message);
        }

        // Remover token da sessão anterior e acesso automatico.
        QC_AUTO303.limpar();
        sessionStorage.removeItem(QC_CHAVE_SESSAO);

        // Limpar dados do formulário
        QC_limparFormularioTrocaSenha();

        document.getElementById("qcPainelTrocaSenha")
          .style.display = "none";

        document.getElementById("btnAbrirTrocaSenha")
          .style.display = "block";

        // Voltar ao login
        QC_exibirTelaAcesso();
        QC_mostrarLogin();

        document.getElementById("qcSenhaLogin")
          .value = "";

        QC_mostrarMensagemAcesso(
          "Senha alterada com sucesso! " +
          "Entre novamente utilizando sua nova senha.",
          "sucesso"
        );

      } else {

        if (resultado.status === "SESSAO_INVALIDA") {
          QC_AUTO303.limpar();
          sessionStorage.removeItem(QC_CHAVE_SESSAO);

          QC_exibirTelaAcesso();
          QC_mostrarLogin();

          QC_mostrarMensagemAcesso(
            "Sessão expirada. Faça login novamente.",
            "erro"
          );

        } else {

          QC_mostrarMensagemTrocaSenha(
            resultado.mensagem ||
            "Não foi possível alterar a senha.",
            "erro"
          );

        }
      }

    } catch (erro) {

      QC_mostrarMensagemTrocaSenha(
        "Falha na comunicação: " + erro.message +
        ". Verifique se a senha foi alterada antes de tentar novamente.",
        "erro"
      );

    } finally {

      botao.disabled = false;
      botao.textContent = "Salvar nova senha";

    }

  });


/* QUINTOSCOIN - MOSTRAR / OCULTAR SENHAS */

function QC_adicionarOlhinhosSenhas() {

  const campos = document.querySelectorAll(
    'input[type="password"]'
  );

  campos.forEach(function(campo) {

    // Evitar adicionar dois botões ao mesmo campo
    if (campo.closest(".qc-campo-com-olho")) {
      return;
    }

    // Criar estrutura que envolve o campo
    const container = document.createElement("div");
    container.className = "qc-campo-com-olho";

    campo.parentNode.insertBefore(container, campo);
    container.appendChild(campo);

    // Criar botão do olhinho
    const botao = document.createElement("button");

    botao.type = "button";
    botao.className = "qc-botao-olho";
    botao.textContent = "👁️";
    botao.setAttribute("aria-label", "Mostrar senha");
    botao.setAttribute("aria-pressed", "false");

    container.appendChild(botao);

    // Alternar entre senha oculta e visível
    botao.addEventListener("click", function() {

      const mostrar = campo.type === "password";

      campo.type = mostrar ? "text" : "password";

      botao.textContent = mostrar ? "🙈" : "👁️";

      botao.setAttribute(
        "aria-label",
        mostrar ? "Ocultar senha" : "Mostrar senha"
      );

      botao.setAttribute(
        "aria-pressed",
        String(mostrar)
      );

      botao.classList.toggle("visivel", mostrar);

    });

  });
}


// Adicionar os olhinhos aos campos existentes
QC_adicionarOlhinhosSenhas();


/* QUINTOSCOIN - FORMULÁRIO ESQUECI MINHA SENHA */

function QC_abrirRecuperacaoSenha() {

  document.getElementById("formAtivacao")
    .style.display = "none";

  document.getElementById("formLogin")
    .style.display = "none";

  document.getElementById("formRecuperarSenha")
    .style.display = "block";

  document.getElementById("qcCodigoRecuperar").value = "";
  document.getElementById("qcSenhaRecuperar").value = "";
  document.getElementById("qcConfirmarSenhaRecuperar").value = "";

  document.getElementById("qcMensagemRecuperacao")
    .textContent = "";

  document.getElementById("qcMensagemRecuperacao")
    .className = "";
}


function QC_mensagemRecuperacao(texto, tipo) {

  const mensagem = document.getElementById(
    "qcMensagemRecuperacao"
  );

  mensagem.textContent =
    (tipo === "erro" ? "⚠️ " : "✅ ") + texto;

  mensagem.className = tipo;
}


document.getElementById("linkEsqueciSenha")
  .addEventListener("click", function(evento) {

    evento.preventDefault();

    QC_abrirRecuperacaoSenha();

  });


document.getElementById("linkVoltarLogin")
  .addEventListener("click", function(evento) {

    evento.preventDefault();

    document.getElementById("formRecuperarSenha")
      .style.display = "none";

    QC_mostrarLogin();

  });



document.getElementById("btnRedefinirSenha")
  .addEventListener("click", function(evento) {

    evento.preventDefault();

    const idCarteira = localStorage.getItem(
      QC_ID_LOCAL
    );

    const codigoAtual = document.getElementById(
      "qcCodigoRecuperar"
    ).value.trim().toUpperCase();

    const novaSenha = document.getElementById(
      "qcSenhaRecuperar"
    ).value;

    const confirmar = document.getElementById(
      "qcConfirmarSenhaRecuperar"
    ).value;

    const formatoCodigo =
      /^[0-9A-F]{8}(?:-[0-9A-F]{8}){3}$/;

    if (!idCarteira) {

      QC_mensagemRecuperacao(
        "Carteira não identificada neste celular.",
        "erro"
      );

      return;
    }

    if (!formatoCodigo.test(codigoAtual)) {

      QC_mensagemRecuperacao(
        "Informe um código de recuperação válido.",
        "erro"
      );

      return;
    }

    if (novaSenha.length < 6) {

      QC_mensagemRecuperacao(
        "A senha deve ter pelo menos 6 caracteres.",
        "erro"
      );

      return;
    }

    if (novaSenha !== confirmar) {

      QC_mensagemRecuperacao(
        "As senhas não conferem.",
        "erro"
      );

      return;
    }

    // Gerar novo código criptograficamente aleatório
    const bytes = new Uint8Array(16);

    window.crypto.getRandomValues(bytes);

    const novoCodigo = Array.from(bytes)
      .map(byte => byte.toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase()
      .match(/.{1,8}/g)
      .join("-");

    // Manter dados somente em memória
    QC_recuperacaoPendente = {
      idCarteira: idCarteira,
      codigoAtual: codigoAtual,
      novaSenha: novaSenha,
      novoCodigo: novoCodigo
    };

    // Mostrar novo código antes de enviar
    QC_exibirCodigoRecuperacao(novoCodigo);

  });




async function QC_consultarParametrosLoginTeste(idCarteira) {

  const URL_APPS_SCRIPT =
    "https://script.google.com/macros/s/AKfycbxEU0xzZz833Bqv7CxV-PdTVIjxRrl27lNgSG0upZ07rnXaAkULhGGuehxbpU2-K1oyOQ/exec";

  const resposta = await fetch(URL_APPS_SCRIPT, {
    method: "POST",
    redirect: "follow",
    headers: {
      "Content-Type": "text/plain;charset=utf-8"
    },
    body: JSON.stringify({
      acao: "qc_parametros_login_teste",
      idCarteira: idCarteira
    })
  });

  if (!resposta.ok) {
    throw new Error(
      "Erro de comunicação: " + resposta.status
    );
  }

  return await resposta.json();
}


async function QC_enviarLoginAutomatico(idCarteira, senha) {

  // Identificar o algoritmo da carteira.
  const parametros =
    await QC_consultarParametrosLoginTeste(idCarteira);

  if (parametros.status !== "OK") {
    return parametros;
  }

    // LOGIN NOVO: PBKDF2_V2.
  if (parametros.algoritmo === "PBKDF2_V2") {

    if (
      !/^[0-9a-f]{32}$/i.test(parametros.salt) ||
      parametros.iteracoes !== 600000
    ) {
      return {
        status: "ERRO",
        mensagem: "Parâmetros da senha V2 inválidos."
      };
    }

    // Calcular a credencial no Android.
    const derivadoHex = await QC_derivarSenhaV2(
      senha,
      parametros.salt
    );

    const URL_SCRIPT =
      "https://script.google.com/macros/s/AKfycbxEU0xzZz833Bqv7CxV-PdTVIjxRrl27lNgSG0upZ07rnXaAkULhGGuehxbpU2-K1oyOQ/exec";

    const resposta = await fetch(URL_SCRIPT, {
      method: "POST",
      redirect: "follow",
      headers: {
        "Content-Type": "text/plain;charset=utf-8"
      },
      body: JSON.stringify({
        acao: "qc_login_v2_teste",
        idCarteira: idCarteira,
        derivadoHex: derivadoHex
      })
    });

    if (!resposta.ok) {
      throw new Error(
        "Erro de comunicação: " + resposta.status
      );
    }

    return await resposta.json();
  }

  return {
    status: "ERRO",
    mensagem: "Algoritmo de senha desconhecido."
  };
}


async function QC_enviarAlteracaoSenhaAutomatico(
  tokenSessao,
  senhaAtual,
  novaSenha
) {

  const idCarteira = localStorage.getItem(
    QC_ID_LOCAL
  );

  if (!idCarteira) {
    throw new Error("Carteira não identificada.");
  }

  const parametros =
    await QC_consultarParametrosLoginTeste(idCarteira);

  if (parametros.status !== "OK") {
    throw new Error(
      parametros.mensagem ||
      "Não foi possível consultar a carteira."
    );
  }

  
    // CARTEIRAS COM PBKDF2
  if (parametros.algoritmo === "PBKDF2_V2") {

    if (
      !/^[0-9a-f]{32}$/i.test(parametros.salt) ||
      parametros.iteracoes !== 600000
    ) {
      throw new Error("Parâmetros PBKDF2 inválidos.");
    }

    // Confirmar senha atual.
    const derivadoAtual = await QC_derivarSenhaV2(
      senhaAtual,
      parametros.salt
    );

    // Nova senha com salt exclusivo.
    const saltNovo = QC_gerarSaltSenhaV2();

    const derivadoNovo = await QC_derivarSenhaV2(
      novaSenha,
      saltNovo
    );

    const URL_SCRIPT =
      "https://script.google.com/macros/s/AKfycbxEU0xzZz833Bqv7CxV-PdTVIjxRrl27lNgSG0upZ07rnXaAkULhGGuehxbpU2-K1oyOQ/exec";

    const resposta = await fetch(URL_SCRIPT, {
      method: "POST",
      redirect: "follow",
      headers: {
        "Content-Type": "text/plain;charset=utf-8"
      },
      body: JSON.stringify({
        acao: "qc_alterar_senha_v2_teste",
        tokenSessao: tokenSessao,
        derivadoAtual: derivadoAtual,
        derivadoNovo: derivadoNovo,
        saltNovo: saltNovo
      })
    });

    if (!resposta.ok) {
      throw new Error(
        "Erro de comunicação: " + resposta.status
      );
    }

    return await resposta.json();
  }

  throw new Error(
    "Algoritmo de senha não reconhecido."
  );
}


async function QC_enviarRecuperacaoAutomatico(dados) {

  const parametros =
    await QC_consultarParametrosLoginTeste(
      dados.idCarteira
    );

  if (parametros.status !== "OK") {
    throw new Error(
      parametros.mensagem ||
      "Não foi possível consultar a carteira."
    );
  }

   // RECUPERAÇÃO PELO NOVO ALGORITMO
  if (parametros.algoritmo === "PBKDF2_V2") {

    if (
      !/^[0-9a-f]{32}$/i.test(parametros.salt) ||
      parametros.iteracoes !== 600000
    ) {
      throw new Error(
        "Parâmetros PBKDF2 inválidos."
      );
    }

    // Criar um salt novo para a nova senha.
    const saltNovo = QC_gerarSaltSenhaV2();

    // Calcular a nova credencial no Android.
    const derivadoNovo = await QC_derivarSenhaV2(
      dados.novaSenha,
      saltNovo
    );

    const URL_SCRIPT =
      "https://script.google.com/macros/s/AKfycbxEU0xzZz833Bqv7CxV-PdTVIjxRrl27lNgSG0upZ07rnXaAkULhGGuehxbpU2-K1oyOQ/exec";

    const resposta = await fetch(URL_SCRIPT, {
      method: "POST",
      redirect: "follow",
      headers: {
        "Content-Type": "text/plain;charset=utf-8"
      },
      body: JSON.stringify({
        acao: "qc_redefinir_senha_v2_teste",
        idCarteira: dados.idCarteira,
        codigoAtual: dados.codigoAtual,
        derivadoNovo: derivadoNovo,
        saltNovo: saltNovo,
        novoCodigo: dados.novoCodigo
      })
    });

    if (!resposta.ok) {
      throw new Error(
        "Erro de comunicação: " + resposta.status
      );
    }

    const resultado = await resposta.json();

    if (resultado.status !== "OK") {
      throw new Error(
        resultado.mensagem ||
        "Não foi possível recuperar a senha."
      );
    }

    return resultado;
  }

  throw new Error(
    "Algoritmo de senha não reconhecido."
  );
}


async function QC_enviarSolicitacaoCreditos(
  tokenSessao,
  valor
) {

  const URL_APPS_SCRIPT =
    "https://script.google.com/macros/s/AKfycbxEU0xzZz833Bqv7CxV-PdTVIjxRrl27lNgSG0upZ07rnXaAkULhGGuehxbpU2-K1oyOQ/exec";

  const resposta = await fetch(URL_APPS_SCRIPT, {
    method: "POST",
    redirect: "follow",
    headers: {
      "Content-Type": "text/plain;charset=utf-8"
    },
    body: JSON.stringify({
      acao: "qc_solicitar_creditos",
      tokenSessao: tokenSessao,
      valor: valor
    })
  });

  if (!resposta.ok) {
    throw new Error(
      "Erro de comunicação: " + resposta.status
    );
  }

  return await resposta.json();
}


/* QUINTOSCOIN - ÁREA DO TESOUREIRO */

const qcAreaTesoureiro = document.createElement("section");

qcAreaTesoureiro.id = "qcAreaTesoureiro";
qcAreaTesoureiro.className = "qc-area-tesoureiro";
qcAreaTesoureiro.style.display = "none";

qcAreaTesoureiro.innerHTML = `
  <details id="qcDetalhesTesoureiro294" style="margin:0">
    <summary style="cursor:pointer;font-weight:700;color:#e5bf62;list-style-position:inside;padding:4px 2px">
      ÁREA DO TESOUREIRO
    </summary>
    <div id="qcConteudoTesoureiro294" style="margin-top:12px">

  <section id="qcPainelCirculacao276" style="margin:14px 0 18px;padding:14px;border:1px solid #ffffff29;border-radius:12px">
    <h4 style="margin:0 0 12px">📊 Circulação e lastro</h4>
    <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px">
      <div style="padding:10px;border-radius:10px;background:#ffffff10">
        <small style="display:block;opacity:.8">QCs em circulação</small>
        <strong id="qcCirculacao276" style="font-size:21px">—</strong>
      </div>
      <div style="padding:10px;border-radius:10px;background:#ffffff10">
        <small style="display:block;opacity:.8">Lastro mínimo a reservar</small>
        <strong id="qcLastro276" style="font-size:21px">—</strong>
      </div>
    </div>
    <p id="qcResumoLastro276" style="font-size:13px;opacity:.85;margin:10px 0 0">Consultando registros...</p>
    <p id="qcAvisoLastro276" role="status" style="font-size:13px;margin:6px 0 0"></p>
  </section>

  <button
    type="button"
    id="qcBtnPedidosTesoureiro"
    class="qc-botao-pedidos"
  >
    <span>📋 Pedidos pendentes</span>

    <span class="qc-indicador-pedidos">
      <span
        id="qcEsferaPedidos"
        class="qc-esfera-pedidos"
      ></span>

      <span id="qcQuantidadePedidos">
        Consultando...
      </span>
    </span>
  </button>

  <p id="qcMensagemTesoureiro"></p>

  <div
    id="qcListaPedidosTesoureiro"
    class="qc-lista-pedidos"
    hidden
  ></div>
    </div>
  </details>
`;

document.getElementById("telaCarteira")
  .appendChild(qcAreaTesoureiro);


// PASSO 276 - Dados financeiros visiveis apenas apos validacao no servidor.
async function QC_carregarPainelTesoureiro276(tokenSessao) {
  const painel = document.getElementById("qcPainelCirculacao276");
  if (!painel) return;
  const circulacao = document.getElementById("qcCirculacao276");
  const lastro = document.getElementById("qcLastro276");
  const resumo = document.getElementById("qcResumoLastro276");
  const aviso = document.getElementById("qcAvisoLastro276");
  circulacao.textContent = "—";
  lastro.textContent = "—";
  resumo.textContent = "Conferindo registros...";
  aviso.textContent = "";
  try {
    const URL_SCRIPT =
      "https://script.google.com/macros/s/AKfycbxEU0xzZz833Bqv7CxV-PdTVIjxRrl27lNgSG0upZ07rnXaAkULhGGuehxbpU2-K1oyOQ/exec";
    const resposta = await fetch(URL_SCRIPT, {
      method: "POST",
      redirect: "follow",
      headers: {"Content-Type": "text/plain;charset=utf-8"},
      body: JSON.stringify({
        acao: "qc_painel_tesoureiro",
        tokenSessao: tokenSessao
      })
    });
    if (!resposta.ok) throw new Error("Falha na comunicacao.");
    const dados = await resposta.json();
    if (sessionStorage.getItem(QC_CHAVE_SESSAO) !== tokenSessao) return;
    if (dados.status !== "OK" || dados.tesoureiro !== true) {
      throw new Error("Painel financeiro indisponivel.");
    }
    const formato = n => Number(n).toLocaleString("pt-BR");
    if (dados.conferencia === "CONFERIDO" &&
        Number.isSafeInteger(dados.circulacao) &&
        Number.isSafeInteger(dados.lastroReservadoBRL)) {
      circulacao.textContent = formato(dados.circulacao) + " QC";
      lastro.textContent = Number(dados.lastroReservadoBRL)
        .toLocaleString("pt-BR", {style:"currency", currency:"BRL"});
    }
    const linhas = [
      "Emitidos: " + formato(dados.emitidos) + " QC",
      "Doações extintas: " +
        (Number.isSafeInteger(dados.doacoesExtintas) ?
          formato(dados.doacoesExtintas) + " QC" : "a conferir"),
      "Resgates confirmados: " +
        (Number.isSafeInteger(dados.resgatesEmDinheiro) ?
          formato(dados.resgatesEmDinheiro) + " QC" : "a conferir"),
      "Atualizado: " + (dados.atualizadoEm || "a conferir")
    ];
    if (dados.conferencia !== "CONFERIDO") {
      aviso.textContent = "⚠️ Conferência necessária: " +
        (Array.isArray(dados.avisos) && dados.avisos.length ?
          dados.avisos.join(" ") : "lançamentos inconsistentes.");
      linhas.push("Lastro ainda não confirmado.");
    } else {
      aviso.textContent = "Valores contábeis calculados. Confira o saldo bancário separadamente.";
    }
    const linhasHTML = linhas.map(texto => {
      const linha = document.createElement("span");
      linha.textContent = texto;
      linha.style.cssText = "display:block;line-height:1.5;margin:2px 0";
      return linha;
    });
    resumo.replaceChildren(...linhasHTML);
  } catch (erro) {
    if (sessionStorage.getItem(QC_CHAVE_SESSAO) === tokenSessao) {
      circulacao.textContent = "—";
      lastro.textContent = "—";
      resumo.textContent = "Nao foi possivel conferir o lastro.";
      aviso.textContent = "Acesso ou registros indisponiveis.";
    }
  }
}

// Consultar autorização e pedidos no Apps Script.
async function QC_atualizarAreaTesoureiro(abrirLista = false) {

  const token = sessionStorage.getItem(
    QC_CHAVE_SESSAO
  );

  const area = document.getElementById(
    "qcAreaTesoureiro"
  );

  const lista = document.getElementById(
    "qcListaPedidosTesoureiro"
  );

  const mensagem = document.getElementById(
    "qcMensagemTesoureiro"
  );

  if (!token) {
    area.style.display = "none";
    return;
  }

  try {

    const URL_SCRIPT =
      "https://script.google.com/macros/s/AKfycbxEU0xzZz833Bqv7CxV-PdTVIjxRrl27lNgSG0upZ07rnXaAkULhGGuehxbpU2-K1oyOQ/exec";

    const resposta = await fetch(URL_SCRIPT, {
      method: "POST",
      redirect: "follow",
      headers: {
        "Content-Type": "text/plain;charset=utf-8"
      },
      body: JSON.stringify({
        acao: "qc_pedidos_tesoureiro",
        tokenSessao: token
      })
    });

    if (!resposta.ok) {
      throw new Error("Falha na consulta.");
    }

    const resultado = await resposta.json();

    // Ignorar resposta de uma sessão já encerrada.
    if (
      sessionStorage.getItem(QC_CHAVE_SESSAO) !== token
    ) {
      return;
    }

    // Somente o tesoureiro poderá visualizar.
    if (
      resultado.status === "NAO_AUTORIZADO" ||
      resultado.tesoureiro === false
    ) {
      area.style.display = "none";
      return;
    }

    if (
      resultado.status !== "OK" ||
      resultado.tesoureiro !== true
    ) {
      throw new Error(
        resultado.mensagem ||
        "Não foi possível consultar os pedidos."
      );
    }

    const pedidos = Array.isArray(resultado.pedidos)
      ? resultado.pedidos
      : [];

    const quantidade = pedidos.length;

    // Mostrar area administrativa somente apos a autorizacao.
    area.style.display = "block";
    mensagem.textContent = "";
    QC_carregarPainelTesoureiro276(token);
    if (window.QC_atualizarResgatesTesoureiro278)
      window.QC_atualizarResgatesTesoureiro278();


    const esfera = document.getElementById(
      "qcEsferaPedidos"
    );

    const contador = document.getElementById(
      "qcQuantidadePedidos"
    );

    if (quantidade > 0) {

      esfera.className =
        "qc-esfera-pedidos qc-esfera-laranja";

      contador.textContent =
        quantidade +
        (quantidade === 1
          ? " pendente"
          : " pendentes");

    } else {

      esfera.className =
        "qc-esfera-pedidos qc-esfera-verde";

      contador.textContent = "Nenhum pedido";

    }

    // Preencher lista ao abrir ou atualizar.
    if (abrirLista || !lista.hidden) {

      lista.replaceChildren();

      if (quantidade === 0) {

        const vazio = document.createElement("p");
        vazio.textContent =
          "✅ Não existem solicitações pendentes.";

        lista.appendChild(vazio);

      } else {

        pedidos.forEach(pedido => {

          const item = document.createElement("div");
          item.className = "qc-item-pedido";

          const titulo = document.createElement("strong");
          titulo.textContent =
            pedido.valor + " QC solicitados";

          const membro = document.createElement("p");
membro.textContent =
  "Solicitante: " + pedido.nome;

membro.style.fontWeight = "600";
membro.style.fontSize = "15px";
membro.style.color = "#ffffff";

          const data = document.createElement("p");
          data.textContent =
            "Data: " + pedido.dataSolicitacao;

          
const situacao = document.createElement("p");
situacao.textContent =
  "⏳ Aguardando confirmação de pagamento";

// Botão de autorização.
const botaoAprovar = document.createElement("button");

botaoAprovar.type = "button";
botaoAprovar.className = "qc-btn-aprovar-pedido";
botaoAprovar.textContent =
  "Confirmar pagamento e autorizar";

botaoAprovar.addEventListener("click", async function() {

  const nome = pedido.nome || "Solicitante";

 const confirmado = await QC_confirmarPagamentoPedido(
  nome,
  pedido.valor
);

if (!confirmado) {
  return;
}

  const token = sessionStorage.getItem(
    QC_CHAVE_SESSAO
  );

  if (!token) {
    mensagem.textContent =
      "⚠️ Sessão expirada. Entre novamente.";
    return;
  }

  botaoAprovar.disabled = true;
  botaoAprovar.textContent = "Autorizando...";
  mensagem.textContent = "";

  try {

    const resultado = await QC_enviarAutorizacaoPedido(
      token,
      pedido.idAutorizacao
    );

    if (resultado.status !== "AUTORIZADA") {
      throw new Error(
        resultado.mensagem ||
        "Não foi possível autorizar o pedido."
      );
    }

    // Atualizar a lista e o indicador.
    await QC_atualizarAreaTesoureiro(true);

    mensagem.textContent =
      "✅ Solicitação de " + nome +
      " autorizada com sucesso! " +
      "A emissão dos QCs ainda está pendente.";

  } catch (erro) {

    mensagem.textContent =
      "⚠️ " + erro.message +
      " Confira a situação do pedido antes " +
      "de tentar novamente.";

  } finally {

    botaoAprovar.disabled = false;
    botaoAprovar.textContent =
      "Confirmar pagamento e autorizar";

  }

});

item.append(
  titulo,
  membro,
  data,
  situacao,
  botaoAprovar
);

lista.appendChild(item);


        });

      }

      lista.hidden = false;
    }

  } catch (erro) {

    if (area.style.display === "block") {
      mensagem.textContent =
        "⚠️ Não foi possível atualizar os pedidos.";
    }

    console.error(
      "Erro na Área do Tesoureiro:",
      erro
    );
  }
}


// Botão para abrir ou fechar os pedidos.
document.getElementById("qcBtnPedidosTesoureiro")
  .addEventListener("click", async function() {

    const lista = document.getElementById(
      "qcListaPedidosTesoureiro"
    );

    if (!lista.hidden) {
      lista.hidden = true;
      return;
    }

    await QC_atualizarAreaTesoureiro(true);

  });


async function QC_enviarAutorizacaoPedido(
  tokenSessao,
  idAutorizacao
) {

  const URL_APPS_SCRIPT =
    "https://script.google.com/macros/s/AKfycbxEU0xzZz833Bqv7CxV-PdTVIjxRrl27lNgSG0upZ07rnXaAkULhGGuehxbpU2-K1oyOQ/exec";

  const resposta = await fetch(URL_APPS_SCRIPT, {
    method: "POST",
    redirect: "follow",
    headers: {
      "Content-Type": "text/plain;charset=utf-8"
    },
    body: JSON.stringify({
      acao: "qc_autorizar_pedido",
      tokenSessao: tokenSessao,
      idAutorizacao: idAutorizacao
    })
  });

  if (!resposta.ok) {
    throw new Error(
      "Falha na comunicação: HTTP " + resposta.status
    );
  }

  return await resposta.json();
}


function QC_confirmarPagamentoPedido(nome, valor) {

  return new Promise(function(resolve) {

    // Evitar duas janelas abertas ao mesmo tempo.
    if (document.getElementById("qcModalAutorizarPedido")) {
      resolve(false);
      return;
    }

    const overlay = document.createElement("div");

    overlay.id = "qcModalAutorizarPedido";
    overlay.className = "qc-modal-autorizacao";

    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute(
      "aria-labelledby",
      "qcTituloAutorizar"
    );

    overlay.innerHTML = `
      <div class="qc-card-autorizacao">

        <h3 id="qcTituloAutorizar">
          🛡️ Confirmar pagamento
        </h3>

        <p class="qc-texto-autorizacao">
          Confira os dados da solicitação
          antes de autorizar.
        </p>

        <div class="qc-dados-autorizacao">

          <span class="qc-rotulo-autorizacao">
            SOLICITANTE
          </span>

          <strong id="qcNomeAutorizar"></strong>

          <div class="qc-linha-autorizacao"></div>

          <span class="qc-rotulo-autorizacao">
            QUANTIDADE SOLICITADA
          </span>

          <strong
            id="qcValorAutorizar"
            class="qc-valor-autorizacao"
          ></strong>

        </div>

        <p class="qc-alerta-autorizacao">
          ⚠️ Confirme somente se o pagamento
          Pix já foi recebido e conferido.
        </p>

        <button
          type="button"
          id="qcConfirmarAutorizacao"
          class="qc-confirmar-autorizacao"
        >
          ✅ Confirmar e autorizar
        </button>

        <button
          type="button"
          id="qcCancelarAutorizacao"
          class="qc-cancelar-autorizacao"
        >
          Cancelar
        </button>

      </div>
    `;

    document.body.appendChild(overlay);

    // Preencher os dados sem inserir texto do usuário
    // diretamente no HTML.
    document.getElementById("qcNomeAutorizar")
      .textContent = nome;

    document.getElementById("qcValorAutorizar")
      .textContent = valor + " QC";

    const confirmar = document.getElementById(
      "qcConfirmarAutorizacao"
    );

    const cancelar = document.getElementById(
      "qcCancelarAutorizacao"
    );

    const focoAnterior = document.activeElement;
    const overflowAnterior = document.body.style.overflow;

    document.body.style.overflow = "hidden";

    let encerrado = false;

    function encerrar(resultado) {

      if (encerrado) {
        return;
      }

      encerrado = true;

      document.removeEventListener(
        "keydown",
        aoPressionarTecla
      );

      document.body.style.overflow = overflowAnterior;
      overlay.remove();

      if (
        focoAnterior &&
        focoAnterior.isConnected &&
        typeof focoAnterior.focus === "function"
      ) {
        focoAnterior.focus();
      }

      resolve(resultado);
    }

    function aoPressionarTecla(evento) {

      if (evento.key === "Escape") {
        evento.preventDefault();
        encerrar(false);
      }

      // Manter o foco dentro da janela.
      if (evento.key === "Tab") {

        const primeiro = confirmar;
        const ultimo = cancelar;

        if (evento.shiftKey &&
            document.activeElement === primeiro) {
          evento.preventDefault();
          ultimo.focus();

        } else if (
          !evento.shiftKey &&
          document.activeElement === ultimo
        ) {
          evento.preventDefault();
          primeiro.focus();
        }
      }
    }

    confirmar.addEventListener("click", function() {
      encerrar(true);
    });

    cancelar.addEventListener("click", function() {
      encerrar(false);
    });

    overlay.addEventListener("click", function(evento) {
      if (evento.target === overlay) {
        encerrar(false);
      }
    });

    document.addEventListener(
      "keydown",
      aoPressionarTecla
    );

    // Foco inicial no botão Cancelar, por segurança.
    cancelar.focus();

  });

}


// PASSO 278 - Interface de resgates definitivos.
// Receber, Doar, Transferir e Resgatar: um botao por operacao.
(function QC_montarResgates278() {
  const acoes=document.querySelector("#telaCarteira .acoes");
  const doar=document.getElementById("btnDoar");
  const receber=document.getElementById("btnReceber");
  const transferir=document.getElementById("btnTransferir");
  if (!acoes||!doar||!receber||!transferir) return;
  const resgatar=document.createElement("button");
  resgatar.type="button";
  resgatar.id="btnResgatar";
  resgatar.textContent="Resgatar Qc$";
  resgatar.disabled=true;
  acoes.appendChild(resgatar);

  // Layout simplificado: Doar tem prioridade visual.
  const estilo=document.createElement("style");
  estilo.textContent=`
    #telaCarteira .acoes {display:grid!important;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px;margin:16px 0}
    #telaCarteira .acoes button {min-width:0;white-space:normal;padding:13px 5px;border-radius:11px;font-size:clamp(11px,2.8vw,14px);line-height:1.25}
    #telaCarteira #btnDoar {grid-column:1/-1;grid-row:1;background:#168055!important;color:white!important;border:1px solid #2c9b71!important;font-size:20px!important;font-weight:750;padding:20px 12px;box-shadow:0 7px 18px #0002}
    #telaCarteira #btnReceber {grid-column:1;grid-row:2}
    #telaCarteira #btnTransferir {grid-column:2;grid-row:2}
    #telaCarteira #btnResgatar {grid-column:3;grid-row:2}
    #qcModalResgate278 [hidden], #qcAreaResgatesTesoureiro278 [hidden] {display:none!important}
    .qc-resgate-linha278 {border:1px solid #ffffff28;border-radius:10px;margin:10px 0;padding:11px}
    .qc-resgate-linha278 p {margin:5px 0;font-size:13px;overflow-wrap:anywhere}
    .qc-resgate-linha278 button {margin:5px 5px 0 0;padding:9px 12px;border-radius:8px}
    .qc-resgate-status278 {opacity:.85;font-size:12px}
  `;
  document.head.appendChild(estilo);
  const modal=document.createElement("div");
  modal.id="qcModalResgate278";
  modal.className="qc-modal-overlay";
  modal.style.display="none";
  modal.innerHTML=`
    <div class="qc-modal-card" role="dialog" aria-modal="true" aria-labelledby="qcTituloResgate278">
      <div class="qc-modal-topo"><h3 id="qcTituloResgate278">Resgatar QuintosCoin</h3>
        <button type="button" id="qcFecharResgate278" class="qc-modal-fechar" aria-label="Fechar">×</button></div>
      <p class="qc-modal-texto">Informe quanto deseja resgatar. O pagamento sera combinado com o tesoureiro.</p>
      <label for="qcValorResgate278" class="qc-label-modal">Valor em QC</label>
      <input id="qcValorResgate278" class="qc-input-modal" type="number" min="2" step="1"
        inputmode="numeric" placeholder="Exemplo: 20">
      <div class="qc-modal-botoes">
        <button id="qcSolicitarResgate278" type="button" class="qc-btn-modal-principal">Solicitar resgate</button>
        <button id="qcCancelarTelaResgate278" type="button" class="qc-btn-modal-secundario">Voltar</button>
      </div>
      <p id="qcMensagemResgate278" class="qc-modal-mensagem" role="status"></p>
      <details id="qcMeusResgates278" style="margin-top:14px">
        <summary style="cursor:pointer">Acompanhar meus resgates</summary>
        <div id="qcListaMeusResgates278" style="margin-top:10px"></div>
      </details>
    </div>`;
  document.body.appendChild(modal);
  const status=document.getElementById("qcMensagemResgate278");
  const campo=document.getElementById("qcValorResgate278");
  const enviar=document.getElementById("qcSolicitarResgate278");
  const lista=document.getElementById("qcListaMeusResgates278");
  let ocupado=false;
  function fechar() {if(!ocupado) modal.style.display="none";}
  function rotuloEstado(st) {
    return ({PENDENTE:"Aguardando tesoureiro",
      CRIANDO:"Preparando",
      CANCELAMENTO_SOLICITADO:"Cancelamento solicitado",
      CANCELAMENTO_APROVADO:"Aguardando devolucao",
      CONFIRMADO:"Pago e encerrado",CANCELADO:"Cancelado"})[st]||st;
  }
  function acaoLinha(texto, handler) {
    const b=document.createElement("button");b.type="button";
    b.textContent=texto;
    b.className="qc-btn-modal-secundario";
    b.addEventListener("click",async()=>{
      if(ocupado) return;
      ocupado=true;b.disabled=true;status.textContent="Consultando a solicitacao...";
      try {await handler();await atualizarMeus();}
      catch(e){status.textContent="⚠️ "+String(e.message||e);}
      finally {ocupado=false;b.disabled=false;}
    });
    return b;
  }
  async function atualizarMeus() {
    lista.textContent="Consultando...";
    if(typeof window.QC_meusResgates278!=="function") {
      lista.textContent="Atualize a pagina para carregar os resgates.";return;
    }
    const pedidos=await window.QC_meusResgates278();
    lista.replaceChildren();
    if(!pedidos.length){lista.textContent="Nenhum resgate solicitado.";return;}
    pedidos.forEach(p=>{
      const item=document.createElement("div");item.className="qc-resgate-linha278";
      const nome=document.createElement("strong");nome.textContent=p.valor+" QC";
      const situacao=document.createElement("p");situacao.className="qc-resgate-status278";
      situacao.textContent=rotuloEstado(p.status)+" · "+p.solicitadoEm;
      item.append(nome,situacao);
      if(p.possuiRecuperacaoLocal){
        item.append(acaoLinha("Atualizar / recuperar fichas",async()=>{
          const r=await window.QC_retomarResgate278(p.idResgate);
          status.textContent=r.status==="CANCELADO" ?
            "✅ Resgate cancelado; fichas devolvidas com seguranca." :
            r.status==="CONFIRMADO" ? "✅ Pagamento confirmado." :
            "Solicitacao atualizada. Aguardando tesoureiro.";
        }));
      }
      if(!p.possuiRecuperacaoLocal && ["CANCELADO","CRIANDO","CANCELAMENTO_APROVADO"].includes(p.status)){
        const atencao=document.createElement("p");
        atencao.textContent="Para recuperar fichas, use o aparelho que fez a solicitacao.";
        item.append(atencao);
      }
      if(p.status==="PENDENTE"){
        item.append(acaoLinha("Pedir cancelamento",async()=>{
          if(!window.confirm("Solicitar cancelamento de "+p.valor+" QC? As fichas continuam reservadas ate autorizacao do tesoureiro.")) return;
          await window.QC_pedirCancelamentoResgate278(p.idResgate);
          status.textContent="Cancelamento solicitado. Aguarde autorizacao do tesoureiro.";
        }));
      }
      lista.appendChild(item);
    });
  }
  resgatar.addEventListener("click",()=>{
    if(!sessionStorage.getItem("QC_TOKEN_SESSAO_TESTE")) return;
    status.textContent="";campo.value="";modal.style.display="flex";
  });
  document.getElementById("qcFecharResgate278").addEventListener("click",fechar);
  document.getElementById("qcCancelarTelaResgate278").addEventListener("click",fechar);
  modal.addEventListener("click",e=>{if(e.target===modal)fechar();});
  enviar.addEventListener("click",async()=>{
    if(ocupado)return;
    const valor=Number(campo.value);
    if(!campo.value.trim()||!Number.isSafeInteger(valor)||valor<2||valor===3){
      status.textContent="Informe valor inteiro a partir de 2 QC, exceto 3 QC.";return;
    }
    ocupado=true;enviar.disabled=true;status.textContent="Preparando resgate seguro...";
    try{
      if(typeof window.QC_solicitarResgate278!=="function")throw Error("Modulo de resgate nao carregado.");
      const r=await window.QC_solicitarResgate278(valor);
      if(r.status==="CANCELADO_PELO_USUARIO") status.textContent="Operacao cancelada.";
      else if(r.status==="PENDENTE" && r.situacao){
        status.textContent="✅ Resgate registrado. Combine o pagamento com o tesoureiro. " +
          "Os QCs permanecem reservados.";
        campo.value="";await atualizarMeus();
      } else {
        status.textContent=r.mensagem||"Operacao pendente. Preserve este aparelho e retome o pedido.";
        await atualizarMeus();
      }
    }catch(e){status.textContent="⚠️ "+String(e.message||e)+" Se a conexao caiu, preserve os dados deste aparelho.";}
    finally{ocupado=false;enviar.disabled=false;}
  });
  campo.addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();enviar.click();}});
  document.getElementById("qcMeusResgates278").addEventListener("toggle",e=>{
    if(e.target.open) atualizarMeus().catch(err=>{
      lista.textContent="⚠️ "+String(err.message||err);
    });
  });

  // Habilitar apenas o botao na interface. O servidor mantem os bloqueios.
  const mostrarResgatar=()=>{
    resgatar.disabled=!sessionStorage.getItem("QC_TOKEN_SESSAO_TESTE");
  };
  // O fluxo de login/restauracao chama a mesma ativacao dos demais botoes.
  window.QC_habilitarResgate278=mostrarResgatar;
})();

// PASSO 278 - Pedidos identificados restritos a area do tesoureiro.
(function QC_montarTesourariaResgates278(){
  const area=document.getElementById("qcAreaTesoureiro");
  if(!area)return;
  const painel=document.createElement("details");
  painel.id="qcAreaResgatesTesoureiro278";
  painel.style.cssText="margin:15px 0 0";
  const titulo=document.createElement("summary");
  titulo.className="qc-botao-pedidos qc-resgate-resumo294";
  titulo.style.cssText="cursor:pointer;display:flex;align-items:center;justify-content:space-between;gap:12px;list-style:none;width:100%;box-sizing:border-box";
  const rotulo=document.createElement("span");
  rotulo.textContent="💵 Resgates pendentes";
  const indicador=document.createElement("span");
  indicador.className="qc-indicador-pedidos";
  const esfera=document.createElement("span");
  esfera.className="qc-esfera-pedidos";
  esfera.id="qcEsferaResgates294";
  const contador=document.createElement("span");
  contador.id="qcQuantidadeResgates294";
  contador.textContent="Consultando...";
  indicador.append(esfera,contador);
  titulo.append(rotulo,indicador);
  const lista=document.createElement("div");
  lista.id="qcListaResgatesTesoureiro278";
  lista.style.marginTop="12px";
  painel.append(titulo,lista);
  (document.getElementById("qcConteudoTesoureiro294")||area).appendChild(painel);
  const estilo294=document.createElement("style");
  estilo294.textContent=
    "#qcAreaResgatesTesoureiro278>summary::-webkit-details-marker{display:none}"+
    "#qcAreaResgatesTesoureiro278>summary::marker{content:''}"+
    "#qcAreaResgatesTesoureiro278>summary{min-height:64px}";
  document.head.appendChild(estilo294);
  const URL_SCRIPT="https://script.google.com/macros/s/AKfycbxEU0xzZz833Bqv7CxV-PdTVIjxRrl27lNgSG0upZ07rnXaAkULhGGuehxbpU2-K1oyOQ/exec";
  async function postar(acao,params={}){
    const token=sessionStorage.getItem("QC_TOKEN_SESSAO_TESTE");
    if(!token) throw Error("Sessao expirada.");
    const r=await fetch(URL_SCRIPT,{method:"POST",redirect:"follow",
      headers:{"Content-Type":"text/plain;charset=utf-8"},
      body:JSON.stringify({acao,tokenSessao:token,...params})});
    if(!r.ok)throw Error("Falha de comunicacao: HTTP "+r.status);
    const dados=await r.json();
    if(token!==sessionStorage.getItem("QC_TOKEN_SESSAO_TESTE"))throw Error("Sessao alterada.");
    if(dados.status==="ERRO"||dados.status==="NAO_AUTORIZADO"){
      throw Error(dados.mensagem||"Operacao nao autorizada.");
    }
    return dados;
  }
  let carregando=false;
  async function carregar(){
    if(carregando)return;
    carregando=true;lista.textContent="Consultando resgates...";
    try{
      const r=await postar("qc_resgate_pendentes_tesoureiro");
      if(r.status!=="OK"||!Array.isArray(r.pedidos))throw Error("Lista de resgates invalida.");
      lista.replaceChildren();
      const quantidade=r.pedidos.length;
      esfera.className="qc-esfera-pedidos "+(quantidade ?
        "qc-esfera-laranja" : "qc-esfera-verde");
      contador.textContent=quantidade ?
        quantidade+(quantidade===1 ? " pendente" : " pendentes") :
        "Nenhum resgate";
      if(!quantidade){lista.textContent="Nenhum resgate pendente.";return;}
      r.pedidos.forEach(p=>{
        const item=document.createElement("div");item.className="qc-resgate-linha278";
        const nome=document.createElement("strong");nome.textContent=p.nome;
        const info=document.createElement("p");
        info.textContent=p.valor+" QC · "+p.solicitadoEm+" · "+p.status;
        const mensagem=document.createElement("p");mensagem.setAttribute("role","status");
        item.append(nome,info);
        function botao(texto,acao,mensagemConfirmacao){
          const b=document.createElement("button");b.type="button";
          b.className="qc-btn-modal-secundario";b.textContent=texto;
          b.addEventListener("click",async()=>{
            if(!window.confirm(mensagemConfirmacao))return;
            b.disabled=true;mensagem.textContent="Registrando...";
            try{
              const r=await postar(acao,{idResgate:p.idResgate});
              if(acao==="qc_resgate_confirmar_pagamento" && r.status!=="RESGATE_CONFIRMADO"){
                throw Error(r.mensagem||"Confirmacao nao concluida: "+r.status);
              }
              if(acao==="qc_resgate_autorizar_cancelamento" &&
                 !["RESGATE_CANCELADO","CANCELAMENTO_PENDENTE_ASSINATURA"].includes(r.status)){
                throw Error(r.mensagem||"Cancelamento nao concluido: "+r.status);
              }
              mensagem.textContent=acao==="qc_resgate_confirmar_pagamento" ?
                "✅ Pagamento registrado e QCs extintos." :
                r.status==="RESGATE_CANCELADO" ?
                "✅ Cancelamento autorizado. Irmao deve recuperar as fichas na carteira." :
                "Cancelamento aprovado. Assinaturas pendentes; retomar autorizacao.";
              await carregar();
              QC_carregarPainelTesoureiro276(sessionStorage.getItem("QC_TOKEN_SESSAO_TESTE"));
            }catch(err){mensagem.textContent="⚠️ "+String(err.message||err);}
            finally{b.disabled=false;}
          });return b;
        }
        if(p.status==="PENDENTE"||p.status==="CANCELAMENTO_SOLICITADO"){
          item.append(botao("Confirmar pagamento",
            "qc_resgate_confirmar_pagamento",
            "Confirma que JA PAGOU R$ "+Number(p.valor).toFixed(2)+" a "+p.nome+
            " fora do sistema? Esta operacao extingue os QCs definitivamente e reduz o lastro."));
        }
        if(p.status==="CANCELAMENTO_SOLICITADO"||p.status==="CANCELAMENTO_APROVADO"){
          item.append(botao("Autorizar cancelamento",
            "qc_resgate_autorizar_cancelamento",
            "Confirma que NENHUM pagamento foi realizado a "+p.nome+
            "? Esta operacao devolve fichas para recuperacao na carteira do irmao."));
        }
        item.append(mensagem);lista.appendChild(item);
      });
    }catch(e){
      esfera.className="qc-esfera-pedidos";
      contador.textContent="Indisponível";
      lista.textContent="⚠️ "+String(e.message||e);
    }
    finally{carregando=false;}
  }
  painel.addEventListener("toggle",()=>{if(painel.open)carregar();});
  // Consultar a quantidade de resgates mesmo com os detalhes fechados.
  // A API continua exigindo a sessão autenticada do tesoureiro.
  window.QC_atualizarResgatesTesoureiro278=()=>{carregar();};
})();


// PASSO 291 — Icones locais, sem dependencias externas ou botoes adicionais.
(function QC_iconesOperacoes291() {
  const desenho={
    btnDoar:'<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/>',
    btnReceber:'<path d="M12 3v14m-5-5 5 5 5-5"/><path d="M4 20h16"/>',
    btnTransferir:'<path d="M4 7h16m-5-5 5 5-5 5M20 17H4m5-5-5 5 5 5"/>',
    btnResgatar:'<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="3"/><path d="M6 12h.01M18 12h.01"/>'
  };
  const rotulos={btnDoar:'Doar Qc$',btnReceber:'Receber Qc$',
    btnTransferir:'Transferir Qc$',btnResgatar:'Resgatar Qc$'};
  for(const id of Object.keys(desenho)) {
    const botao=document.getElementById(id);
    if(!botao) continue;
    const svg='<svg aria-hidden="true" viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'+desenho[id]+'</svg>';
    botao.innerHTML=svg+'<span>'+rotulos[id]+'</span>';
    // O icone do botao e gerado no final do script: preservar o indicador.
    if (id === "btnReceber") botao.appendChild(qcIndicadorReceber300);
    botao.setAttribute('aria-label',rotulos[id]);
  }
  const estilo=document.createElement('style');
  estilo.textContent='#telaCarteira .acoes button{display:flex;align-items:center;justify-content:center;gap:7px}'+
    '#telaCarteira .acoes button svg{flex:0 0 auto;width:18px;height:18px}'+
    '#telaCarteira #btnDoar svg{width:23px;height:23px}'+
    '@media(max-width:380px){#telaCarteira .acoes button{gap:4px;font-size:11px!important}#telaCarteira .acoes button svg{width:15px;height:15px}}';
  document.head.appendChild(estilo);
})();
