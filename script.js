console.log("faceapi =", faceapi);

const APPS_SCRIPT_URL =
'https://script.google.com/macros/s/AKfycbxEU0xzZz833Bqv7CxV-PdTVIjxRrl27lNgSG0upZ07rnXaAkULhGGuehxbpU2-K1oyOQ/exec';

const video =
document.getElementById('video');

const resultado =
document.getElementById('resultado');

let intervaloReconhecimento = null;

let faceMatcher = null;

let ultimoEnviado = "";

let processando = false;

let bloqueado = false;

async function iniciar() {

  console.log("INICIOU");
  alert("INICIOU");

  resultado.innerHTML =
  'Carregando modelos...';

  await Promise.all([

    faceapi.nets.tinyFaceDetector.loadFromUri('./weights'),

    faceapi.nets.faceLandmark68Net.loadFromUri('./weights'),

    faceapi.nets.faceRecognitionNet.loadFromUri('./weights')

  ]);

  alert("MODELOS OK");

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

      alert("MEMBROS OK");

         // document.body.appendChild(img);

     console.log("Iniciando detecção:", membro.nome);

const deteccao =
 await faceapi
  .detectSingleFace(
    img,
    new faceapi.TinyFaceDetectorOptions({
      inputSize: 608,
      scoreThreshold: 0.1
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

    const stream =
      await navigator.mediaDevices.getUserMedia({

        video: true,
        audio: false

      });

    alert("CAMERA OK");

    console.log("Câmera iniciada");

    video.srcObject = stream;

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
                scoreThreshold: 0.2
              })
            )
            .withFaceLandmarks()
            .withFaceDescriptor();

        if (!deteccao) {
          return;
        }

        const melhor =
          faceMatcher.findBestMatch(
            deteccao.descriptor
          );

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
    Confiança: ${(1 - melhor.distance).toFixed(2)}
  </div>

</div>
`;

 if (ultimoEnviado !== id) {

  bloqueado = true;

  ultimoEnviado = id;

  mostrarProcessando(nome);

  processarPresenca(
    id,
    nome
  );

}

} else {

          resultado.innerHTML =
            "Pessoa não cadastrada";

        }

      },

      1000

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
    r => setTimeout(r,1000)
  );

  try {

    const status =
  (
    await fetch(
      APPS_SCRIPT_URL +
      "?acao=status"
    )
    .then(r => r.text())
  ).trim();

    console.log(
  "STATUS RECEBIDO:",
  "[" + status + "]"
);

    

if (status === "OK") {

  mostrarStatus(
    "✅ PRESENÇA REGISTRADA",
    nome,
    "#0a8f08"
  );

  tocarBip();

}
else if (status === "DUPLICADO") {

  mostrarStatus(
    "⚠ PRESENÇA DUPLICADA",
    nome,
    "#d4a000"
  );

}
else if (status === "SEM_SESSAO") {

  mostrarStatus(
    "❌ SEM SESSÃO",
    "",
    "#c00000"
  );

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

  },1500);

}

async function registrarPresenca(id, nome) {

  try {

   await fetch(APPS_SCRIPT_URL, {
  method: "POST",
  mode: "no-cors",
  body: JSON.stringify({
    id:id,
    nome:nome
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


function tocarBip(){

  const audio =
    new Audio(
      "https://actions.google.com/sounds/v1/alarms/beep_short.ogg"
    );

  audio.play();

}

function mostrarProcessando(nome){

  document
    .getElementById(
      "nomeProcessando"
    )
    .innerHTML = nome;

  document
    .getElementById(
      "processando"
    )
    .classList.add(
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

iniciar();
