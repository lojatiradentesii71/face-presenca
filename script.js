console.log("faceapi =", faceapi);

const APPS_SCRIPT_URL =
'https://script.google.com/macros/s/AKfycbxEU0xzZz833Bqv7CxV-PdTVIjxRrl27lNgSG0upZ07rnXaAkULhGGuehxbpU2-K1oyOQ/exec';

const video =
  document.getElementById('video');

const resultado =
  document.getElementById('resultado');

const somSucesso =
  new Audio(
    "https://actions.google.com/sounds/v1/alarms/beep_short.ogg"
  );

const somDuplicado =
  new Audio(
    "https://actions.google.com/sounds/v1/emergency/emergency_siren_short_burst.ogg"
  );

const somErro =
  new Audio(
    "https://actions.google.com/sounds/v1/alarms/alarm_clock.ogg"
  );


let intervaloReconhecimento = null;

let faceMatcher = null;

let ultimoEnviado = "";

let processando = false;

let bloqueado = false;

let cameraAtual = "user";

let telefonesPorId = {};

let tiposPorId = {};

let limiteMembro = 0.40;
let limiteVisitante = 0.34;
let margemVisitante = 0.08;
let margemMembro = 0.04;

window.addEventListener(
  "load",
  () => {

    document
      .getElementById(
        "btnCamera"
      )
      .innerHTML =
        "📱 Frontal";

  }
);

async function iniciar() {

  console.log("INICIOU");
  
  resultado.innerHTML =
  'Carregando modelos...';

  await Promise.all([

    faceapi.nets.tinyFaceDetector.loadFromUri('./weights'),

    faceapi.nets.faceLandmark68Net.loadFromUri('./weights'),

    faceapi.nets.faceRecognitionNet.loadFromUri('./weights')

  ]);

  

resultado.innerHTML =
  "Carregando descritores...";

const membros =
  await fetch(
    APPS_SCRIPT_URL + "?acao=descritores"
  )
  .then(r => r.json());

const descritores = [];

telefonesPorId = {};

for (const membro of membros) {

  telefonesPorId[String(membro.id)] =
    String(membro.telefone || "");

  tiposPorId[String(membro.id)] =
  String(membro.tipoPessoa || "MEMBRO");

  descritores.push(
    new faceapi.LabeledFaceDescriptors(
      String(membro.id) + "|" + String(membro.nome),
      [
        new Float32Array(
          membro.descriptor
        )
      ]
    )
  );

}

faceMatcher =
  new faceapi.FaceMatcher(
    descritores,
    0.6
  );

  resultado.innerHTML =
  'Aguardando reconhecimento...';

  iniciarCamera();

}

async function iniciarCamera(){

  try {

    if (video.srcObject) {

      video.srcObject
        .getTracks()
        .forEach(
          track => track.stop()
        );

    }

    const stream =
      await navigator.mediaDevices.getUserMedia({

        video: {
          facingMode:
            cameraAtual
        },

        audio: false

      });

    console.log(
      "Câmera iniciada:",
      cameraAtual
    );

    video.srcObject =
      stream;

    await video.play();

  } catch(err){

    console.error(
      "Erro câmera:",
      err
    );

  }

}

video.addEventListener(
  'play',
  () => {

    if(intervaloReconhecimento){
      return;
    }

    console.log(
      "Criando intervalo"
    );

    
    intervaloReconhecimento = setInterval(

      async () => {

        if (!faceMatcher) return;

        if (bloqueado) return;

        const deteccao =
          await faceapi
            .detectSingleFace(
              video,
              new faceapi.TinyFaceDetectorOptions({
                inputSize: 416,
                scoreThreshold: 0.6
              })
            )
            .withFaceLandmarks()
            .withFaceDescriptor();

        const scanner =
  document.querySelector(
    ".scanner"
  );

       if (!deteccao) {

  scanner.classList.remove(
    "ativo"
  );


  return;

}


scanner.classList.add(
  "ativo"
);
      

       let resultados = [];

for (const item of faceMatcher.labeledDescriptors) {

  for (const descriptorBase of item.descriptors) {

    resultados.push({
      label: item.label,
      distance: faceapi.euclideanDistance(
        deteccao.descriptor,
        descriptorBase
      )
    });

  }

}

resultados.sort(
  (a, b) => a.distance - b.distance
);

const melhor =
  resultados[0];

const segundoMelhor =
  resultados[1];

if (!melhor) {
  return;
}

const partes =
  melhor.label.split("|");

const id =
  partes[0];

const nome =
  partes[1];

const telefone =
  telefonesPorId[String(id)] || "";

const tipoPessoa =
  tiposPorId[String(id)] || "MEMBRO";

const limiteReconhecimento =
  tipoPessoa === "VISITANTE"
    ? limiteVisitante
    : limiteMembro;

const diferencaSegundo =
  segundoMelhor
    ? segundoMelhor.distance - melhor.distance
    : 1;

const margemMinima =
  tipoPessoa === "VISITANTE"
    ? margemVisitante
    : margemMembro;

atualizarDebugReconhecimento(
  melhor,
  segundoMelhor,
  tipoPessoa,
  limiteReconhecimento,
  margemMinima
);

if (
  melhor.distance < limiteReconhecimento &&
  diferencaSegundo >= margemMinima
) {

  resultado.innerHTML =
  `
  <div class="cardReconhecido">

    <div class="tituloReconhecido">
      ✓ ${tipoPessoa === "VISITANTE" ? "VISITANTE IDENTIFICADO" : "IRMÃO IDENTIFICADO"}
    </div>

    <div class="nomeReconhecido">
      ${nome}
    </div>

    <div class="scoreReconhecido">
      Confiança: ${Math.round((1 - melhor.distance) * 100)}%
    </div>

  </div>
  `;

  if (ultimoEnviado !== id) {

    bloqueado = true;

    ultimoEnviado = id;

    mostrarProcessando(nome);

    setTimeout(() => {

      processarPresenca(
        id,
        nome,
        telefone,
        tipoPessoa
      );

    }, 500);

  }

} else {

  resultado.innerHTML =
    "Pessoa não cadastrada";

}

      },

      250  //Tentando reduzir o tempo de "Processando" reduziu de 1000 para 250

    );

  }

);

async function processarPresenca(
  id,
  nome,
  telefone,
  tipoPessoa
){

  if(processando){
  return;
}

processando = true;

  await registrarPresenca(
  id,
  nome,
  telefone,
  tipoPessoa
);

  await new Promise(
    r => setTimeout(r,2000) //Tentando reduzir o tempo de "Precessando" reduziu de 1500 para 200
  );


  try {

    const resposta =
(
  await fetch(
    APPS_SCRIPT_URL +
    "?acao=status&id=" +
    encodeURIComponent(id)
  )
  .then(r => r.text())
).trim();

    
const partes =
  resposta.split("|");

const idStatus =
  partes[0];

const status =
  String(partes[1] || "")
    .replace(/\r/g, "")
    .replace(/\n/g, "")
    .trim()
    .toUpperCase();


await new Promise(r => setTimeout(r, 100)); //Tentando reduzir o tempo de "Precessando" reduziu de 1000 para 100

if (idStatus !== id) {

  console.log(
    "Status de outro membro:",
    idStatus
  );
  
  processando = false;

  bloqueado = false;

  esconderProcessando();

  return;

}    

if (status === "OK") {

  mostrarStatus(
    "✅ PRESENÇA REGISTRADA",
    nome,
    "rgba(0,100,40,0.85)"
  );

  tocarBip();

}
else if (status === "DUPLICADO") {

  mostrarStatus(
    "⚠ PRESENÇA DUPLICADA",
    nome,
    "rgba(160,120,0,0.85)"
  );
  tocarDuplicado();

}
else if (status === "SEM_SESSAO") {

  mostrarStatus(
    "❌ SEM SESSÃO",
    "",
    "rgba(120,0,0,0.85)"
  );
  tocarErro();

}
else {

  mostrarStatus(
    "❓ STATUS DESCONHECIDO",
    status,
    "#444444"
  );

}

  } catch(err){

    console.error(err);

  }

  setTimeout(() => {

    esconderProcessando();

    bloqueado = false;

    processando = false;

  },3000);

}

async function registrarPresenca(id, nome, telefone, tipoPessoa) {

  try {

    const imagem =
      capturarFrameBase64();

    await fetch(APPS_SCRIPT_URL, {
      method: "POST",
      mode: "no-cors",
      body: JSON.stringify({
        id: id,
        nome: nome,
        telefone: telefone,
        tipoPessoa: tipoPessoa,
        image: imagem.split(",")[1]
      })
    });

    console.log(
      "Presença registrada:",
      nome
    );

  } catch(err) {

    console.error(err);

  }

}

async function trocarCamera(){

  cameraAtual =
    cameraAtual === "user"
      ? "environment"
      : "user";

  document
    .getElementById(
      "btnCamera"
    )
    .innerHTML =
      cameraAtual === "user"
      ? "📱 Frontal"
      : "📷 Traseira";

  await iniciarCamera();

}


function tocarBip(){

  somSucesso.currentTime = 0;

  somSucesso.play();

}

function tocarDuplicado(){

  somDuplicado.currentTime = 0;

  somDuplicado.play();

}

function tocarErro(){

  somErro.currentTime = 0;

  somErro.play();

}

function tocarProcessando(){

  const ctx =
    new AudioContext();

  const osc =
    ctx.createOscillator();

  const gain =
    ctx.createGain();

  osc.type = "sine";

  osc.frequency.setValueAtTime(
    300,
    ctx.currentTime
  );

  osc.frequency.linearRampToValueAtTime(
    700,
    ctx.currentTime + 0.25
  );

  gain.gain.setValueAtTime(
    0.05,
    ctx.currentTime
  );

  osc.connect(gain);

  gain.connect(
    ctx.destination
  );

  osc.start();

  osc.stop(
    ctx.currentTime + 0.3
  );

}

function mostrarProcessando(nome){

  tocarProcessando();

  const tela =
    document.getElementById(
      "processando"
    );

  tela.style.background =
    "";

  document
    .querySelector(
      "#processando h1"
    )
    .innerHTML =
      "⏳ PROCESSANDO";

  document
    .getElementById(
      "nomeProcessando"
    )
    .innerHTML =
      nome;

  tela.classList.add(
    "mostrar"
  );

}

function esconderProcessando(){

  document
    .getElementById(
      "processando"
    )
    .classList.remove(
      "mostrar"
    );

}

function mostrarStatus(titulo, nome, cor){

  const tela =
    document.getElementById(
      "processando"
    );

  tela.style.background =
    cor;

  document
    .querySelector(
      "#processando h1"
    )
    .innerHTML =
      titulo;

  document
    .getElementById(
      "nomeProcessando"
    )
    .innerHTML =
      nome;

  tela.classList.add(
    "mostrar"
  );

}



function capturarFrameBase64() {

  const canvas = document.createElement("canvas");

  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;

  const ctx = canvas.getContext("2d");

  const largura = canvas.width;
  const altura = canvas.height;

  // Fotografia original
  ctx.drawImage(video, 0, 0, largura, altura);

  // Data e hora no fuso de Brasília
  const agora = new Date();

  const data = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).format(agora);

  const hora = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  }).format(agora);

  // Função para desenhar retângulos arredondados
  function retanguloArredondado(x, y, w, h, r) {
    const raio = Math.min(r, w / 2, h / 2);

    ctx.beginPath();
    ctx.moveTo(x + raio, y);
    ctx.lineTo(x + w - raio, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + raio);
    ctx.lineTo(x + w, y + h - raio);
    ctx.quadraticCurveTo(x + w, y + h, x + w - raio, y + h);
    ctx.lineTo(x + raio, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - raio);
    ctx.lineTo(x, y + raio);
    ctx.quadraticCurveTo(x, y, x + raio, y);
    ctx.closePath();
  }

  // ====================================
  // MOLDURA AZUL DA FOTOGRAFIA
  // ====================================

  const espessura = Math.max(5, largura * 0.012);
  const raioMoldura = largura * 0.035;

  ctx.save();

  const gradienteMoldura = ctx.createLinearGradient(
    0, 0, largura, altura
  );

  gradienteMoldura.addColorStop(0, "rgba(110, 205, 255, 0.90)");
  gradienteMoldura.addColorStop(0.5, "rgba(18, 105, 185, 0.75)");
  gradienteMoldura.addColorStop(1, "rgba(120, 215, 255, 0.90)");

  retanguloArredondado(
    espessura / 2,
    espessura / 2,
    largura - espessura,
    altura - espessura,
    raioMoldura
  );

  ctx.strokeStyle = gradienteMoldura;
  ctx.lineWidth = espessura;
  ctx.stroke();

  // Linha interna fina
  retanguloArredondado(
    espessura * 1.5,
    espessura * 1.5,
    largura - espessura * 3,
    altura - espessura * 3,
    raioMoldura * 0.8
  );

  ctx.strokeStyle = "rgba(210, 240, 255, 0.50)";
  ctx.lineWidth = Math.max(1, largura * 0.002);
  ctx.stroke();

  ctx.restore();

  // ====================================
  // CARD AZUL INFERIOR
  // ====================================

  const margem = largura * 0.04;

  const cardX = margem;
  const cardLargura = largura - margem * 2;
  const cardAltura = Math.max(46, altura * 0.105);
  const cardY = altura - cardAltura - margem;

  const raioCard = Math.min(22, cardAltura * 0.25);

  ctx.save();

  // Sombra suave
  ctx.shadowColor = "rgba(0, 20, 50, 0.45)";
  ctx.shadowBlur = largura * 0.018;
  ctx.shadowOffsetY = largura * 0.006;

  retanguloArredondado(
    cardX, cardY,
    cardLargura, cardAltura,
    raioCard
  );

  const gradienteCard = ctx.createLinearGradient(
    cardX, cardY,
    cardX + cardLargura,
    cardY + cardAltura
  );

  gradienteCard.addColorStop(0, "rgba(13, 71, 135, 0.82)");
  gradienteCard.addColorStop(1, "rgba(20, 125, 205, 0.65)");

  ctx.fillStyle = gradienteCard;
  ctx.fill();

  ctx.restore();

  // Borda do card
  retanguloArredondado(
    cardX, cardY,
    cardLargura, cardAltura,
    raioCard
  );

  ctx.strokeStyle = "rgba(190, 225, 255, 0.90)";
  ctx.lineWidth = Math.max(1, largura * 0.002);
  ctx.stroke();

  // ====================================
  // ÍCONES VETORIAIS
  // ====================================

  const tamanhoFonte = Math.max(12, largura * 0.038);
  const tamanhoIcone = tamanhoFonte * 1.05;

  const centroY = cardY + cardAltura / 2;

  function desenharCalendario(x, y, tamanho) {

    ctx.save();
    ctx.strokeStyle = "#FFFFFF";
    ctx.lineWidth = Math.max(1.5, tamanho * 0.10);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    const topo = y - tamanho / 2;

    ctx.strokeRect(
      x,
      topo + tamanho * 0.15,
      tamanho,
      tamanho * 0.80
    );

    // Divisória
    ctx.beginPath();
    ctx.moveTo(x, topo + tamanho * 0.38);
    ctx.lineTo(x + tamanho, topo + tamanho * 0.38);

    // Argolas
    ctx.moveTo(x + tamanho * 0.25, topo);
    ctx.lineTo(x + tamanho * 0.25, topo + tamanho * 0.25);
    ctx.moveTo(x + tamanho * 0.75, topo);
    ctx.lineTo(x + tamanho * 0.75, topo + tamanho * 0.25);

    ctx.stroke();
    ctx.restore();
  }

  function desenharRelogio(x, y, tamanho) {

    ctx.save();
    ctx.strokeStyle = "#FFFFFF";
    ctx.lineWidth = Math.max(1.5, tamanho * 0.10);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    ctx.beginPath();
    ctx.arc(
      x + tamanho / 2,
      y,
      tamanho * 0.46,
      0,
      Math.PI * 2
    );

    // Ponteiros
    ctx.moveTo(x + tamanho / 2, y);
    ctx.lineTo(x + tamanho / 2, y - tamanho * 0.25);
    ctx.moveTo(x + tamanho / 2, y);
    ctx.lineTo(x + tamanho * 0.72, y + tamanho * 0.12);

    ctx.stroke();
    ctx.restore();
  }

  // ====================================
  // DATA E HORA
  // ====================================

  ctx.save();

  ctx.fillStyle = "#FFFFFF";
  ctx.font = "600 " + tamanhoFonte + "px Arial";
  ctx.textBaseline = "middle";

  const espacamento = tamanhoFonte * 0.45;

  const larguraData = ctx.measureText(data).width;
  const larguraHora = ctx.measureText(hora).width;

  const blocoData = tamanhoIcone + espacamento + larguraData;
  const blocoHora = tamanhoIcone + espacamento + larguraHora;

  const espacoDisponivel = cardLargura * 0.88;

  // Reduz proporcionalmente se a câmera gerar foto estreita
  const escala = Math.min(
    1,
    espacoDisponivel / (blocoData + blocoHora + tamanhoFonte)
  );

  const fonteFinal = tamanhoFonte * escala;
  const iconeFinal = tamanhoIcone * escala;
  const espacoFinal = espacamento * escala;

  ctx.font = "600 " + fonteFinal + "px Arial";

  // Data à esquerda
  const xData = cardX + cardLargura * 0.06;

  desenharCalendario(
    xData,
    centroY,
    iconeFinal
  );

  ctx.textAlign = "left";
  ctx.fillText(
    data,
    xData + iconeFinal + espacoFinal,
    centroY
  );

  // Hora à direita
  const xFimHora = cardX + cardLargura * 0.94;
  const xInicioHora =
    xFimHora - ctx.measureText(hora).width
    - espacoFinal - iconeFinal;

  desenharRelogio(
    xInicioHora,
    centroY,
    iconeFinal
  );

  ctx.textAlign = "left";
  ctx.fillText(
    hora,
    xInicioHora + iconeFinal + espacoFinal,
    centroY
  );

  ctx.restore();

  // Mantém qualidade e formato originais
  return canvas.toDataURL("image/jpeg", 0.7);

}



function aplicarAjustesReconhecimento() {

  limiteMembro =
    Number(document.getElementById("limiteMembro").value);

  limiteVisitante =
    Number(document.getElementById("limiteVisitante").value);

  margemMembro =
    Number(document.getElementById("margemMembro").value);

  margemVisitante =
    Number(document.getElementById("margemVisitante").value);

  alert(
    "Ajustes aplicados:\n\n" +
    "Membro: " + limiteMembro + "\n" +
    "Visitante: " + limiteVisitante + "\n" +
    "Margem membro: " + margemMembro + "\n" +
    "Margem visitante: " + margemVisitante
  );

}

function atualizarDebugReconhecimento(
  melhor,
  segundoMelhor,
  tipoPessoa,
  limiteReconhecimento,
  margemMinima
) {

  const debug =
    document.getElementById(
      "debugReconhecimento"
    );

  if (!debug) {
    return;
  }

  const distancia =
    melhor
      ? melhor.distance.toFixed(3)
      : "-";

  const segundo =
    segundoMelhor
      ? segundoMelhor.distance.toFixed(3)
      : "-";

  const margem =
    segundoMelhor
      ? (segundoMelhor.distance - melhor.distance).toFixed(3)
      : "-";

  debug.innerHTML =
    "Tipo: " + tipoPessoa + "\n" +
    "Distância: " + distancia + "\n" +
    "Segundo: " + segundo + "\n" +
    "Margem: " + margem + "\n" +
    "Limite usado: " + limiteReconhecimento + "\n" +
    "Margem mínima: " + margemMinima;

}

iniciar();
