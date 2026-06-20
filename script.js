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
  'Carregando membros...';

  const membros =
    await fetch(APPS_SCRIPT_URL)
    .then(r => r.json());

  const descritores = [];

  for (const membro of membros) {

    try {

      const img =
        await faceapi.fetchImage(
          membro.imagem
        );
      
          console.log(
           "Imagem carregada:",
            img.width,
            img.height
        );

      

         // document.body.appendChild(img);

     console.log("Iniciando detecção:", membro.nome);

const deteccao =
 await faceapi
  .detectSingleFace(
    img,
    new faceapi.TinyFaceDetectorOptions({
      inputSize: 608,
      scoreThreshold: 0.5
    })
  )
  .withFaceLandmarks()
  .withFaceDescriptor();

console.log("Detecção concluída:", membro.nome);
      

      if (!deteccao) {

         console.log(
           "Rosto não encontrado em:",
            membro.nome
       );

       continue;

     }
         console.log(
           "Membro carregado:",
            membro.id + "|" + membro.nome
       );

        descritores.push(
          new faceapi.LabeledFaceDescriptors(
              membro.id + "|" + membro.nome,
              [deteccao.descriptor]
           )
      );

    } catch(err){

      console.log(err);

    }

  }

      console.log(
        "Quantidade de descritores:",
         descritores.length
     );

      console.log(descritores);

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
      

        const melhor =
          faceMatcher.findBestMatch(
            deteccao.descriptor
          );

        if(
          melhor.label === "unknown"
        ){
          return;
        }

        console.log(melhor);
        console.log(melhor.label);

       if (melhor.distance < 0.40) {

  const partes =
    melhor.label.split("|");

  const id =
    partes[0];

  const nome =
    partes[1];

  resultado.innerHTML =
  `
  <div class="cardReconhecido">

    <div class="tituloReconhecido">
      ✓ IRMÂO IDENTIFICADO
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

    setTimeout(() => {      //Tentando reduzir temp de "Processando"

      processarPresenca(
        id,
        nome
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
  nome
){

  if(processando){
  return;
}

processando = true;

  await registrarPresenca(
  id,
  nome
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

  processando = false;
    
  bloqueado = false;

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

async function registrarPresenca(id, nome) {

  try {

   const imagem = capturarFrameBase64();

   await fetch(APPS_SCRIPT_URL, {
    method: "POST",
    mode: "no-cors",
    body: JSON.stringify({
    id: id,
    nome: nome,
    image: imagem.split(",")[1] // remove "data:image/jpeg;base64,"
  })
});
    
    console.log(
      "Presença registrada:",
      nome
    );

    
  } catch(err){

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

  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  // qualidade 0.7 para não pesar o Apps Script
  return canvas.toDataURL("image/jpeg", 0.7);

}

iniciar();
