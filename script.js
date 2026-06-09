console.log("faceapi =", faceapi);

const APPS_SCRIPT_URL =
'https://script.google.com/macros/s/AKfycbxEU0xzZz833Bqv7CxV-PdTVIjxRrl27lNgSG0upZ07rnXaAkULhGGuehxbpU2-K1oyOQ/exec';

const video =
document.getElementById('video');

const resultado =
document.getElementById('resultado');

let faceMatcher = null;

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

          document.body.appendChild(img);

      const deteccao =
        await faceapi
        .detectSingleFace(
          img,
          new faceapi.TinyFaceDetectorOptions()
        )
        .withFaceLandmarks()
        .withFaceDescriptor();

      if (!deteccao) {

         console.log(
           "Rosto não encontrado em:",
            membro.nome
       );

       continue;

     }
         console.log(
           "Membro carregado:",
            membro.nome
       );

         descritores.push(
           new faceapi.LabeledFaceDescriptors(
             membro.nome,
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

  const stream =
    await navigator.mediaDevices.getUserMedia({

      video:true

    });

  video.srcObject = stream;

}

video.addEventListener(

'play',

() => {

  setInterval(

    async () => {

      if(!faceMatcher) return;

      const deteccao =
        await faceapi
        .detectSingleFace(

          video,

          new faceapi.TinyFaceDetectorOptions()

        )
        .withFaceLandmarks()
        .withFaceDescriptor();

      if(!deteccao){

        resultado.innerHTML =
        'Nenhum rosto detectado';

        return;

      }

      const melhor =
        faceMatcher.findBestMatch(

          deteccao.descriptor

        );

      resultado.innerHTML =
      melhor.toString();

    },

    1000

  );

});

iniciar();
