console.log("faceapi =", faceapi);

const APPS_SCRIPT_URL =
'https://script.google.com/macros/s/AKfycbxEU0xzZz833Bqv7CxV-PdTVIjxRrl27lNgSG0upZ07rnXaAkULhGGuehxbpU2-K1oyOQ/exec';

const video =
document.getElementById('video');

const resultado =
document.getElementById('resultado');

let faceMatcher = null;

let ultimoEnviado = "";

async function iniciar() {

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
  'Abrindo câmera...';

  iniciarCamera();

}

async function iniciarCamera(){

  try {

    const stream =
      await navigator.mediaDevices.getUserMedia({

        video: true,
        audio: false

      });

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

    console.log("Evento PLAY disparou");
    
    setInterval(

      async () => {

        if (!faceMatcher) return;

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
    "Reconhecido: " +
    nome +
    " (" +
    melhor.distance.toFixed(2) +
    ")";

  if (ultimoEnviado !== id) {

    ultimoEnviado = id;

    registrarPresenca(
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

    mostrarConfirmacao(nome);

  } catch(err){

    console.error(err);

  }

}
function mostrarConfirmacao(nome){

  const tela =
    document.getElementById(
      "confirmacao"
    );

  tela.innerHTML =
    "✓ PRESENÇA REGISTRADA<br><br>" +
    nome;

  tela.classList.add(
    "mostrar"
  );

  setTimeout(() => {

    tela.classList.remove(
      "mostrar"
    );

  },3000);

}

iniciar();
