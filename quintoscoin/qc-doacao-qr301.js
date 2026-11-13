// QuintosCoin — Passo 301. Interface discreta da doacao com QR fixo da sacola.
// PREPARAR: nenhum gasto; LER QR: dispara o gasto da mesma operacao.
// O QR da sacola e publico; ele e apenas o acionador da operacao anonima.
(function () {
  "use strict";
  const btn = document.getElementById("btnDoar");
  if (!btn) return;
  const QR_SACOLA = "QUINTOSCOIN|SACOLA|V1|f1b1e87e-6fb6-4b41-b5f9-547d458d3ed1";

  const css=document.createElement("style");
  css.textContent=`
    #qcModalDoar301 .qc-doar-secao301 {display:flex;flex-direction:column;gap:13px;margin-top:14px}
    #qcModalDoar301 .qc-doar-entrada301 {display:flex;align-items:center;gap:8px}
    #qcModalDoar301 .qc-doar-entrada301 input {flex:1;min-width:0;margin:0;letter-spacing:1.5px}
    #qcModalDoar301 .qc-doar-olho301 {flex:none;width:auto;min-width:50px;padding:11px 12px;display:inline-flex;align-items:center;justify-content:center}
    #qcModalDoar301 .qc-doar-olho301 svg {display:block;width:22px;height:22px;stroke:currentColor}
    #qcModalDoar301 .qc-doar-ajuda301 {margin:0;font-size:13px;line-height:1.5;color:#d7dce6}
    #qcModalDoar301 .qc-doar-icone301 {font-size:39px;line-height:1.3;text-align:center}
    #qcModalDoar301 .qc-doar-centro301 {align-items:center;text-align:center;padding:18px 3px 10px}
    #qcModalDoar301 .qc-doar-centro301 h4 {font-size:20px;margin:0;color:#f0cd72}
    #qcModalDoar301 .qc-doar-aviso301 {white-space:pre-line;font-size:13px;line-height:1.5;margin:8px 0;color:#ffd58a}
    #qcModalDoar301 .qc-doar-qr301 {width:100%;max-height:310px;border-radius:12px;background:#081421;object-fit:cover}
    #qcModalDoar301 .qc-doar-botoes301 {display:flex;flex-direction:column;gap:8px;width:100%;margin-top:5px}
    #qcModalDoar301 .qc-doar-botoes301 button {width:100%;box-sizing:border-box}
    #qcModalDoar301 .qc-doar-verde301 {background:#168055!important;border:1px solid #2c9b71!important;color:#fff!important}
    #qcModalDoar301 .qc-doar-secao301[hidden] {display:none!important}
    #qcModalDoar301 .qc-doar-campo301[hidden] {display:none!important}
  `;
  document.head.appendChild(css);
  const modal=document.createElement("div");
  modal.id="qcModalDoar301";
  modal.className="qc-modal-overlay";
  modal.style.display="none";
  modal.innerHTML=`
    <div class="qc-modal-card" role="dialog" aria-modal="true"
         aria-labelledby="qcTituloDoar301">
      <div class="qc-modal-topo">
        <h3 id="qcTituloDoar301">Doar QuintosCoin</h3>
        <button id="qcFecharDoar301" type="button" class="qc-modal-fechar" aria-label="Fechar">×</button>
      </div>
      <section id="qcEditarDoar301" class="qc-doar-secao301">
        <p class="qc-doar-ajuda301">Escolha o valor discretamente. A doação só será enviada quando você ler o QR Code da sacola.</p>
        <label for="qcValorDoar301" class="qc-label-modal">Valor da contribuição</label>
        <div class="qc-doar-entrada301">
          <input id="qcValorDoar301" class="qc-input-modal" type="password"
             inputmode="numeric" autocomplete="off" placeholder="Valor em Qc$" aria-label="Valor da doação oculto">
          <button id="qcOlhoDoar301" type="button" class="qc-btn-modal-secundario qc-doar-olho301"
             aria-label="Mostrar valor" aria-pressed="false" title="Mostrar ou ocultar valor"></button>
        </div>
        <button id="qcPrepararDoar301" class="qc-btn-modal-principal qc-doar-verde301" type="button">Preparar doação</button>
      </section>
      <section id="qcProntoDoar301" class="qc-doar-secao301 qc-doar-centro301" hidden>
        <div class="qc-doar-icone301" aria-hidden="true">⏳</div>
        <h4>Doação preparada</h4>
        <p class="qc-doar-ajuda301">Aguarde a passagem da sacola. Seu valor permanece oculto.</p>
        <div class="qc-doar-botoes301">
          <button id="qcLerSacola301" class="qc-btn-modal-principal qc-doar-verde301" type="button">📷 Ler QR Code da sacola</button>
          <button id="qcCancelarPreparo301" class="qc-btn-modal-secundario" type="button">Cancelar preparo</button>
        </div>
      </section>
      <section id="qcCameraDoar301" class="qc-doar-secao301" hidden>
        <p class="qc-doar-ajuda301">Aponte a câmera para o QR Code da sacola.</p>
        <div id="qcVideoArea301"></div>
        <button id="qcPararCamera301" class="qc-btn-modal-secundario" type="button">Parar câmera</button>
      </section>
      <section id="qcProcessandoDoar301" class="qc-doar-secao301 qc-doar-centro301" hidden>
        <span class="qc-espera-roda297" aria-hidden="true"></span>
        <h4>Registrando sua doação...</h4>
        <p class="qc-doar-ajuda301">Não repita a leitura. A operação está protegida para recuperação.</p>
      </section>
      <section id="qcSucessoDoar301" class="qc-doar-secao301 qc-doar-centro301" hidden>
        <div class="qc-doar-icone301" aria-hidden="true">✅</div>
        <h4>Doação registrada com sucesso!</h4>
        <p class="qc-doar-ajuda301">Sua contribuição foi recebida.</p>
        <button id="qcOkDoar301" class="qc-btn-modal-principal qc-doar-verde301" type="button">OK</button>
      </section>
      <section id="qcPendenteDoar301" class="qc-doar-secao301 qc-doar-centro301" hidden>
        <div class="qc-doar-icone301" aria-hidden="true">↻</div>
        <h4>Verificar doação anterior</h4>
        <p class="qc-doar-ajuda301">A leitura já ocorreu. Vamos consultar a mesma operação, sem criar outra doação.</p>
        <button id="qcRecuperarDoar301" class="qc-btn-modal-principal" type="button">Consultar e concluir</button>
      </section>
      <p id="qcAvisoDoar301" class="qc-doar-aviso301" role="status"></p>
    </div>`;
  document.body.appendChild(modal);
  const $=id=>document.getElementById(id);
  const secoes={
    editar:$("qcEditarDoar301"),pronto:$("qcProntoDoar301"),
    camera:$("qcCameraDoar301"),processando:$("qcProcessandoDoar301"),
    sucesso:$("qcSucessoDoar301"),pendente:$("qcPendenteDoar301")
  };
  const campo=$("qcValorDoar301");
  const aviso=$("qcAvisoDoar301");
  // Icones vetoriais: independem da fonte/emoji do aparelho ou navegador.
  const svgMostrar301 = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>';
  const svgOcultar301 = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 3l18 18"/><path d="M10.6 5.1A10.7 10.7 0 0 1 12 5c6.5 0 10 7 10 7a14 14 0 0 1-3.5 4.3"/><path d="M6.3 6.3C3.5 8.2 2 12 2 12s3.5 7 10 7c1.6 0 3.1-.4 4.4-1"/><path d="M10.6 10.6a2 2 0 0 0 2.8 2.8"/></svg>';
  function atualizarIconeOlho301() {
    const visivel=campo.type==="text";
    const botao=$("qcOlhoDoar301");
    botao.innerHTML=visivel?svgOcultar301:svgMostrar301;
    botao.setAttribute("aria-label",visivel?"Ocultar valor":"Mostrar valor");
    botao.setAttribute("aria-pressed",String(visivel));
    botao.title=visivel?"Ocultar valor":"Mostrar valor";
  }
  atualizarIconeOlho301();
  let ocupada=false,escaneando=false,stream=null,video=null,leitor=null;
  let ciclo=0;
  let leitorPromessa343=null;
  function leitorAntecipado343() {
    if(!leitorPromessa343) {
      leitorPromessa343=escolherLeitor().catch(e=>{
        leitorPromessa343=null;
        throw e;
      });
    }
    return leitorPromessa343;
  }


  // Passo 311: sinal sonoro discreto ao ler o QR Code correto da sacola.
  // O som confirma a LEITURA, nao a conclusao do registro no servidor.
  let contextoSom311=null;
  function prepararSom311() {
    try {
      const Audio=window.AudioContext||window.webkitAudioContext;
      if (!Audio) return; // Navegadores sem Web Audio funcionam normalmente, sem som.
      if (!contextoSom311 || contextoSom311.state==="closed") {
        contextoSom311=new Audio();
      }
      if (contextoSom311.state==="suspended") {
        contextoSom311.resume().catch(()=>{});
      }
    } catch (_) { /* Som opcional: nunca impedir a doacao. */ }
  }
  function tocarSomLeitura311() {
    try {
      if (!contextoSom311 || contextoSom311.state!=="running") return;
      const t=contextoSom311.currentTime;
      const oscilador=contextoSom311.createOscillator();
      const ganho=contextoSom311.createGain();
      oscilador.type="sine";
      oscilador.frequency.setValueAtTime(880,t);
      ganho.gain.setValueAtTime(0.0001,t);
      ganho.gain.exponentialRampToValueAtTime(0.07,t+0.025);
      ganho.gain.exponentialRampToValueAtTime(0.0001,t+0.18);
      oscilador.connect(ganho);
      ganho.connect(contextoSom311.destination);
      oscilador.onended=()=>{oscilador.disconnect();ganho.disconnect();};
      oscilador.start(t);
      oscilador.stop(t+0.19);
    } catch (_) { /* Som opcional: nunca impedir a doacao. */ }
  }

  function modo(nome) {
    for (const [chave,elemento] of Object.entries(secoes)) elemento.hidden=chave!==nome;
    aviso.textContent="";
  }
  function erro(mensagem) {aviso.textContent="⚠️ "+String(mensagem||"Tente novamente.");}
  function pararCamera() {
    escaneando=false;
    ciclo++;
    if (stream) for (const trilha of stream.getTracks()) trilha.stop();
    stream=null;
    if (video) {video.pause();video.srcObject=null;video.remove();}
    video=null;
    $("qcVideoArea301").replaceChildren();
  }
  function fechar() {
    if (ocupada) return;
    pararCamera();
    modal.style.display="none";
    campo.value="";campo.type="password";
    atualizarIconeOlho301();
  }
  async function abrir() {
    if (ocupada) return;
    // Iniciar carregamento do leitor enquanto o irmão escolhe o valor.
    // Não bloquear a abertura da janela; tentativa antecipada é opcional.
    leitorAntecipado343().catch(()=>{});
    modal.style.display="flex";
    modo("processando");
    try {
      const atual=await window.QC_estadoDoacaoQR301();
      if (atual.status==="PREPARADA") modo("pronto");
      else if (atual.status==="ACIONADA") modo("pendente");
      else modo("editar");
    } catch(e) {modo("pendente");erro(e.message||e);}
  }
  btn.addEventListener("click",abrir);
  $("qcFecharDoar301").addEventListener("click",fechar);
  $("qcOkDoar301").addEventListener("click",fechar);
  modal.addEventListener("click",ev=>{if (ev.target===modal) fechar();});
  $("qcOlhoDoar301").addEventListener("click",()=>{
    campo.type=campo.type==="password"?"text":"password";
    atualizarIconeOlho301();
  });

  // Biblioteca local do navegador quando disponivel; fallback jsQR aberto
  // sob licença Apache-2.0, carregado somente se necessario.
  async function escolherLeitor() {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw Error("Este navegador não permite abrir a câmera nesta página.");
    }
    if (typeof BarcodeDetector==="function") {
      try {return {tipo:"nativo",detector:new BarcodeDetector({formats:["qr_code"]})};}
      catch(_){ /* Biblioteca alternativa. */ }
    }
    if (typeof window.jsQR!=="function") {
      const origens=[
        "https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js",
        "https://unpkg.com/jsqr@1.4.0/dist/jsQR.min.js"
      ];
      for(const url of origens) {
        try {
          await new Promise((resolver,rejeitar)=>{
            const s=document.createElement("script");
            s.src=url;s.async=true;
            let resolvido=false;
            const encerrar=(erro)=>{
              if(resolvido)return;
              resolvido=true;
              clearTimeout(limite);
              s.onload=null;s.onerror=null;
              if(erro){s.remove();rejeitar(erro);}else resolver();
            };
            const limite=setTimeout(()=>encerrar(Error("Tempo esgotado ao carregar leitor de QR.")),7000);
            s.onload=()=>encerrar(null);
            s.onerror=()=>encerrar(Error("Leitor de QR indisponível."));
            document.head.appendChild(s);
          });
          if(typeof window.jsQR==="function")break;
        } catch(_) { /* Tentativa alternativa, sem bloqueio indefinido. */ }
      }
      if(typeof window.jsQR!=="function") {
        throw Error("O leitor de QR não carregou. Conecte-se à internet e tente novamente. Nenhuma doação foi enviada.");
      }
    }
    return {tipo:"imagem"};
  }

  $("qcPrepararDoar301").addEventListener("click",async()=>{
    if (ocupada) return;
    const valor=Number(campo.value.trim().replace(",","."));
    if (!Number.isSafeInteger(valor) || valor<2 || valor===3) {
      erro("Informe um valor inteiro de pelo menos 2 Qc$, exceto 3 Qc$.");return;
    }
    ocupada=true;
    const botao=$("qcPrepararDoar301");botao.disabled=true;
    aviso.textContent="Verificando fichas e preparando sua contribuição...";
    try {
      const comeco343=performance.now();
      leitor=await leitorAntecipado343();
      const tempoLeitor343=Math.round(performance.now()-comeco343);
      const retorno=await window.QC_prepararDoacaoQR301(valor);
      console.info("QC_PERF343 leitor "+tempoLeitor343+" ms; preparacao completa "+
        Math.round(performance.now()-comeco343)+" ms");
      if (retorno.status==="PREPARADA") {campo.value="";modo("pronto");}
      else if (retorno.status==="ACIONADA") modo("pendente");
      else if (retorno.status==="CANCELADO") aviso.textContent="Preparação cancelada.";
      else throw Error("Não foi possível preparar a doação.");
    } catch(e) {erro(e.message||e);}
    finally {ocupada=false;botao.disabled=false;}
  });
  $("qcCancelarPreparo301").addEventListener("click",async()=>{
    if (ocupada) return;
    ocupada=true;
    try {
      const r=await window.QC_cancelarDoacaoQR301();
      if (["CANCELADA","NENHUMA"].includes(r.status)) {modo("editar");campo.value="";}
      else if (r.status==="CANCELADO") erro("Operação preservada; tente novamente.");
    } catch(e) {erro(e.message||e);}
    finally {ocupada=false;}
  });
  $("qcPararCamera301").addEventListener("click",()=>{pararCamera();modo("pronto");});

  async function registrarQR(texto) {
    if (!escaneando || texto!==QR_SACOLA || ocupada) return false;
    pararCamera();
    tocarSomLeitura311(); // Uma unica vez, imediatamente apos a leitura valida.
    ocupada=true;
    modo("processando");
    try {
      const r=await window.QC_efetivarDoacaoQR301(texto);
      if (r.status==="OK") {modo("sucesso");}
      else if (r.status==="CANCELADO") {modo("pendente");erro("Operação preservada. Retome a mesma doação.");}
      else throw Error("Doação aguardando confirmação do servidor.");
    } catch(e) {
      let status="ACIONADA";
      try {status=(await window.QC_estadoDoacaoQR301()).status;} catch(_){}
      modo(status==="PREPARADA"?"pronto":"pendente");
      erro(e.message||e);
    } finally {ocupada=false;}
    return true;
  }

  $("qcLerSacola301").addEventListener("click",async()=>{
    if (ocupada || escaneando) return;
    prepararSom311(); // Desbloqueia audio no gesto do usuario, inclusive no Android.
    ocupada=true;
    try {
      leitor=leitor||await escolherLeitor();
      const cam=await navigator.mediaDevices.getUserMedia({
        video:{facingMode:{ideal:"environment"}},audio:false
      });
      stream=cam;
      const v=document.createElement("video");v.playsInline=true;v.muted=true;v.autoplay=true;
      v.className="qc-doar-qr301";
      video=v;v.srcObject=cam;
      $("qcVideoArea301").replaceChildren(v);
      modo("camera");
      await v.play();
      escaneando=true;
      const token=++ciclo;
      const tela=document.createElement("canvas");
      const ctx=tela.getContext("2d",{willReadFrequently:true});
      const verificar=async()=>{
        if (!escaneando || ciclo!==token || !video) return;
        try {
          let resultado="";
          if (leitor.tipo==="nativo") {
            const lista=await leitor.detector.detect(v);
            resultado=String(lista?.[0]?.rawValue||"");
          } else if (v.readyState>=2 && ctx) {
            const w=480,h=Math.max(240,Math.round(w*v.videoHeight/Math.max(1,v.videoWidth)));
            tela.width=w;tela.height=h;ctx.drawImage(v,0,0,w,h);
            const img=ctx.getImageData(0,0,w,h);
            resultado=String(window.jsQR(img.data,w,h,{inversionAttempts:"dontInvert"})?.data||"");
          }
          if (resultado) {
            if (resultado===QR_SACOLA) {
              if (await registrarQR(resultado)) return;
            }
            aviso.textContent="Este não é o QR Code da sacola QuintosCoin.";
          }
        } catch(_) { /* Quadro incompleto, tentar proximo. */ }
        if (escaneando && ciclo===token) setTimeout(verificar,300);
      };
      verificar();
    } catch(e) {pararCamera();modo("pronto");erro("Não foi possível abrir ou usar a câmera: "+String(e.message||e));}
    finally {ocupada=false;}
  });

  $("qcRecuperarDoar301").addEventListener("click",async()=>{
    if (ocupada) return;
    ocupada=true;
    modo("processando");
    try {
      const r=await window.QC_recuperarDoacaoQR301();
      if (r.status==="OK") modo("sucesso");
      else if (r.status==="NENHUMA") {modo("editar");erro("Não havia doação pendente. Confira o saldo.");}
      else {modo("pendente");erro("Operação ainda não confirmada.");}
    } catch(e) {modo("pendente");erro(e.message||e);}
    finally {ocupada=false;}
  });
})();
