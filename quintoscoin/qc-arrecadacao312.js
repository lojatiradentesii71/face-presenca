/* QuintosCoin - Passo 327 (base 314) - Conferencia do TS, leitura obrigatoria pelo QR FIXO da mesa.
   A leitura do QR e a autorizacao para ENTRAR no fechamento.
   O tesoureiro autenticado e o unico capaz de corrigir um total encerrado.
   Nunca usa o QR da sacola nem altera fichas da carteira. */
(function(){
  'use strict';
  const tela = document.getElementById('telaCarteira');
  if (!tela || document.getElementById('qcArrec312')) return;
  const API = 'https://script.google.com/macros/s/AKfycbxEU0xzZz833Bqv7CxV-PdTVIjxRrl27lNgSG0upZ07rnXaAkULhGGuehxbpU2-K1oyOQ/exec';
  const estilo = document.createElement('style');
  estilo.textContent = `
    #qcArrec312 {margin:16px 0;border:1px solid #ffffff33;border-radius:12px;padding:12px;background:#ffffff08}
    #qcArrec312 summary {cursor:pointer;font-weight:700;color:#e5bf62;padding:4px 2px}
    #qcArrec312 .qc-ar-corpo312 {display:flex;flex-direction:column;gap:12px;padding:14px 2px 3px}
    #qcArrec312 .qc-ar-bot312 {width:100%;margin:0;box-sizing:border-box}
    #qcArrec312 .qc-ar-cartao312 {background:#ffffff0d;border:1px solid #ffffff25;padding:15px;border-radius:12px;display:flex;flex-direction:column;gap:11px}
    #qcArrec312 .qc-ar-par312 {display:flex;justify-content:space-between;align-items:center;gap:9px;flex-wrap:wrap}
    #qcArrec312 .qc-ar-grande312 {font-size:25px;font-weight:750;color:#f2cd75}
    #qcArrec312 .qc-ar-input312 {width:100%;box-sizing:border-box;padding:12px;border-radius:9px;margin:5px 0 0}
    #qcArrec312 .qc-ar-status312 {font-size:13px;line-height:1.5;white-space:pre-line;min-height:1.2em}
    #qcArrec312 .qc-ar-video312 {width:100%;max-height:330px;object-fit:cover;background:#07131e;border-radius:10px}
    #qcArrec312 .qc-ar-nota312 {font-size:12px;opacity:.83;line-height:1.45}
    #qcArrec312 [hidden] {display:none!important}
    #qcArrec312 label {display:block}
    #qcArrec312 .qc-ar-bot312:disabled {opacity:.6;cursor:wait}
  `;
  document.head.appendChild(estilo);
  const area=document.createElement('details');
  area.id='qcArrec312';
  area.innerHTML=`
    <summary>Conferência do TS</summary>
    <div class="qc-ar-corpo312">
      <button type="button" id="qcArLer312" class="qc-btn-modal-principal qc-ar-bot312">Ler QR Code do fechamento</button>
      <button type="button" id="qcArConsultar312" class="qc-btn-modal-secundario qc-ar-bot312">Consultar arrecadação encerrada</button>
      <div id="qcArScanner312" class="qc-ar-cartao312" hidden>
        <p class="qc-ar-nota312">Aponte a câmera para o QR Code fixo da mesa de conferência.</p>
        <div id="qcArVideoArea312"></div>
        <button type="button" id="qcArParar312" class="qc-btn-modal-secundario qc-ar-bot312">Parar câmera</button>
      </div>
      <div id="qcArConferir312" class="qc-ar-cartao312" hidden>
        <strong id="qcArTitulo312">Conferência da sessão</strong>
        <div class="qc-ar-par312"><span>Doações em Qc$</span><strong id="qcArTotalQC312">—</strong></div>
        <label for="qcArDinheiro312">Dinheiro físico contado (R$)
          <input id="qcArDinheiro312" type="text" inputmode="decimal" autocomplete="off" class="qc-ar-input312" placeholder="0,00" />
        </label>
        <div class="qc-ar-par312"><strong>Total arrecadado</strong><strong class="qc-ar-grande312" id="qcArTotal312">R$ 0,00</strong></div>
        <button type="button" id="qcArEncerrar312" class="qc-btn-modal-principal qc-ar-bot312" disabled>Encerrar arrecadação</button>
        <p class="qc-ar-nota312" id="qcArModo312"></p>
      </div>
      <div id="qcArFechada312" class="qc-ar-cartao312" hidden>
        <strong id="qcArSubtitulo312">Arrecadação encerrada</strong>
        <select id="qcArHistorico312" class="qc-ar-input312" aria-label="Escolher arrecadação" hidden></select>
        <div class="qc-ar-par312"><span>Doações em Qc$</span><strong id="qcArHistQC312">—</strong></div>
        <div class="qc-ar-par312"><span>Dinheiro físico</span><strong id="qcArHistDin312">—</strong></div>
        <div><small>Total para anunciar</small><div class="qc-ar-grande312" id="qcArHistTotal312">—</div></div>
        <div id="qcArCorrigirArea312" hidden>
          <label for="qcArNovoTotal312">Corrigir somente o dinheiro físico (R$)
            <input id="qcArNovoTotal312" class="qc-ar-input312" type="text" inputmode="decimal" autocomplete="off" placeholder="Valor contado em dinheiro" />
          </label>
          <div class="qc-ar-par312"><span>Novo total (calculado automaticamente)</span><strong id="qcArPreviaTotal327">—</strong></div>
          <p class="qc-ar-nota312">As doações em Qc$ não podem ser alteradas nesta correção.</p>
          <button type="button" id="qcArCorrigir312" class="qc-btn-modal-secundario qc-ar-bot312">Salvar correção do dinheiro</button>
        </div>
      </div>
      <p id="qcArStatus312" class="qc-ar-status312" role="status" aria-live="polite"></p>
    </div>`;
  // Coloca Arrecadacao antes da area do tesoureiro quando ela existe.
  const tesoureiro=document.getElementById('qcAreaTesoureiro');
  if (tesoureiro) tela.insertBefore(area,tesoureiro);
  else tela.appendChild(area);
  const $ = id => document.getElementById(id);
  const moeda = v => 'R$ '+Number(v).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
  const qc = v => 'Qc$ '+Number(v).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
  function dinheiroValor(s){
    const raw=String(s||'').replace(/^R\$\s*/i,'').replace(/\s/g,'');
    if (!raw) return null;
    const v=raw.includes(',')?raw.replace(/\./g,'').replace(',','.'):raw;
    if (!/^\d+(?:\.\d{1,2})?$/.test(v)) return null;
    const n=Number(v);
    if (!Number.isFinite(n)||n<0||n>100000000) return null;
    return Math.round(n*100)/100;
  }
  function status(texto,erro=false){$('qcArStatus312').textContent=texto||'';$('qcArStatus312').style.color=erro?'#ffbc9e':'';}
  function paineis(n){['qcArScanner312','qcArConferir312','qcArFechada312'].forEach(k=>$(k).hidden=k!==n);}
  async function requisitar(acao,dados={}) {
    const res=await fetch(API,{method:'POST',redirect:'follow',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({acao,...dados})});
    if (!res.ok) throw Error('Falha de comunicação com o servidor ('+res.status+').');
    const json=await res.json();
    if (!json || typeof json!=='object') throw Error('Resposta do servidor inválida.');
    return json;
  }
  let leitura=null, lendo=false,cam=null,video=null,seq=0,leitor=null, ocupada=false,registros=[],registroAtual=null,tesoureiroAutorizado=false;
  function parar(){
    lendo=false;seq++;
    if(cam) cam.getTracks().forEach(t=>t.stop());cam=null;
    if(video){try{video.pause();video.srcObject=null;video.remove();}catch(_){}}
    video=null;
    $('qcArVideoArea312').replaceChildren();
    $('qcArParar312').disabled=false;
  }
  async function escolherLeitor(){
    if (!navigator.mediaDevices?.getUserMedia) throw Error('Câmera indisponível neste navegador.');
    if (typeof BarcodeDetector==='function'){
      try{return {tipo:'nativo',detector:new BarcodeDetector({formats:['qr_code']})};}catch(_){}}
    if (typeof window.jsQR!=='function'){
      for(const endereco of [
        'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js',
        'https://unpkg.com/jsqr@1.4.0/dist/jsQR.min.js']) {
        try {
          await new Promise((ok,erro)=>{
            const s=document.createElement('script');s.async=true;s.src=endereco;
            s.onload=ok;s.onerror=()=>{s.remove();erro(Error('Leitor QR indisponível.'));};document.head.appendChild(s);
          });
          if(typeof window.jsQR==='function')break;
        }catch(_){}
      }
      if(typeof window.jsQR!=='function')throw Error('Não foi possível carregar o leitor QR.');
    }
    return {tipo:'imagem'};
  }
  async function reconheceu(texto){
    if (!lendo || !area.open || !/^QUINTOSCOIN\|FECHAMENTO\|V1\|/.test(texto)){
      status('Este não é o QR Code do fechamento QuintosCoin.',true);return;
    }
    parar();ocupada=true;
    // Se a seção for recolhida antes de o servidor responder, a tela antiga
    // não pode reaparecer ao reabrir a seção.
    const requisicaoAtual=seq;
    status('Conferindo a sessão e a autorização do QR Code...');
    try {
      const r=await requisitar('qc_arrec_ler_qr312',{codigoQR:texto});
      if (seq!==requisicaoAtual || !area.open) return;
      if (!['OK','FECHANDO'].includes(r.status))throw Error(r.mensagem||'Não há sessão aberta para conferir.');
      leitura={qr:texto,idSessao:r.idSessao,restauracao:r.status==='FECHANDO',totalQC:Number(r.totalQC||0)};
      $('qcArTitulo312').textContent='Sessão de '+(r.dataSessao||'hoje');
      $('qcArTotalQC312').textContent=qc(r.totalQC);
      $('qcArDinheiro312').value=r.status==='FECHANDO'?Number(r.dinheiroFisico||0).toFixed(2).replace('.',','):'';
      $('qcArDinheiro312').readOnly=r.status==='FECHANDO';
      $('qcArEncerrar312').textContent=r.status==='FECHANDO'?'Retomar fechamento anterior':'Encerrar arrecadação';
      $('qcArModo312').textContent=r.simulacao?'MODO DE TESTE: a conferência será simulada e não gravará na TS.':'';
      calcular();paineis('qcArConferir312');
      status(r.status==='FECHANDO'?'Há um fechamento anterior incompleto. Retome sem alterar os valores.':'QR Code aceito. Confira o dinheiro físico antes de encerrar.');
    }catch(e){
      if(seq===requisicaoAtual && area.open){paineis(null);status('⚠️ '+(e.message||e),true);}
    }
    finally{if(seq===requisicaoAtual)ocupada=false;}
  }
  $('qcArLer312').addEventListener('click',async()=>{
    if (ocupada||lendo)return;
    ocupada=true;
    // A abertura da câmera nunca deve deixar o cartão anterior visível.
    // Apenas a leitura validada pelo servidor pode abrir a conferência.
    leitura=null;
    $('qcArDinheiro312').value='';
    $('qcArTotal312').textContent='R$ —';
    $('qcArEncerrar312').disabled=true;
    $('qcArModo312').textContent='';
    paineis('qcArScanner312');
    status('Abrindo câmera...');
    const tentativa=++seq;
    try{
      if (!navigator.mediaDevices?.getUserMedia) throw Error('Câmera indisponível neste navegador.');
      // Prioriza abrir e mostrar a câmera. O leitor de QR é carregado depois.
      const novaCam=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}},audio:false});
      if(seq!==tentativa || !area.open){novaCam.getTracks().forEach(t=>t.stop());return;}
      cam=novaCam;
      video=document.createElement('video');video.playsInline=true;video.autoplay=true;video.muted=true;video.className='qc-ar-video312';
      video.srcObject=cam;
      $('qcArVideoArea312').replaceChildren(video);
      await video.play();
      if(seq!==tentativa || !area.open)return;
      status('Preparando leitor do QR Code...');
      leitor=leitor||await escolherLeitor();
      if(seq!==tentativa || !area.open)return;
      lendo=true;
      status('Aponte para o QR Code fixo da mesa.');
      const atual=tentativa;
      const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d',{willReadFrequently:true});
      async function verificar(){
        if (!lendo||seq!==atual||!video||!area.open)return;
        try{
          let texto='';
          if(leitor.tipo==='nativo'){
            const detectados=await leitor.detector.detect(video);
            texto=String(detectados?.[0]?.rawValue||'');
          }else if(video.readyState>=2&&ctx){
            const w=480,h=Math.max(240,Math.round(w*video.videoHeight/Math.max(1,video.videoWidth)));
            canvas.width=w;canvas.height=h;ctx.drawImage(video,0,0,w,h);
            const im=ctx.getImageData(0,0,w,h);
            texto=String(window.jsQR(im.data,w,h,{inversionAttempts:'dontInvert'})?.data||'');
          }
          // Outra ação pode ter cancelado a leitura durante a detecção assíncrona.
          if(!lendo||seq!==atual||!area.open)return;
          if(texto){
            if(/^QUINTOSCOIN\|FECHAMENTO\|V1\|/.test(texto)){
              await reconheceu(texto);return;
            }
            status('Este QR Code não é o da mesa de fechamento.',true);
          }
        }catch(_){}
        if(lendo&&seq===atual&&area.open)setTimeout(verificar,300);
      }
      // Libera o controle da inicialização antes do primeiro quadro lido.
      ocupada=false;
      setTimeout(verificar,0);
    }catch(e){
      if(seq===tentativa){
        parar();ocupada=false;paineis(null);status('⚠️ '+(e.message||e),true);
      }
    }finally{
      if(seq===tentativa && !lendo)ocupada=false;
    }
  });
  $('qcArParar312').addEventListener('click',()=>{parar();ocupada=false;paineis(null);status('Leitura cancelada. Nenhum fechamento foi realizado.');});
  function calcular(){
    const v=dinheiroValor($('qcArDinheiro312').value);
    const valido=!!leitura&&v!==null;
    $('qcArEncerrar312').disabled=!valido||ocupada;
    $('qcArTotal312').textContent=valido?moeda(Math.round((leitura.totalQC+v)*100)/100):'R$ —';
  }
  $('qcArDinheiro312').addEventListener('input',calcular);
  $('qcArEncerrar312').addEventListener('click',async()=>{
    if (ocupada||!leitura)return;
    const v=dinheiroValor($('qcArDinheiro312').value);
    if(v===null){status('Informe um valor válido em dinheiro físico.',true);return;}
    ocupada=true;$('qcArEncerrar312').disabled=true;
    status('Conferindo o encerramento. Não repita a operação...');
    try{
      const r=await requisitar('qc_arrec_encerrar312',{
        codigoQR:leitura.qr,idSessao:leitura.idSessao,dinheiroFisico:v
      });
      if(!['ENCERRADA','SIMULADO'].includes(r.status))throw Error(r.mensagem||'Fechamento não confirmado.');
      paineis('qcArFechada312');
      $('qcArSubtitulo312').textContent=r.status==='SIMULADO'?'Simulação do fechamento':'Arrecadação encerrada';
      $('qcArHistQC312').textContent=qc(r.totalQC);
      $('qcArHistDin312').textContent=moeda(r.dinheiroFisico);
      $('qcArHistTotal312').textContent=moeda(r.totalGeral);
      $('qcArHistorico312').hidden=true;$('qcArCorrigirArea312').hidden=true;
      status(r.status==='SIMULADO'?'Simulação realizada. Nenhum lançamento foi gravado na aba TS.':'Arrecadação encerrada. Crédito registrado na aba TS.');
      leitura=null;
    }catch(e){status('⚠️ '+(e.message||e)+' Se houve falha de comunicação, consulte antes de tentar novamente.',true);}
    finally{ocupada=false;calcular();}
  });
  function atualizarPreviaCorrecao327(){
    const dinheiro=dinheiroValor($('qcArNovoTotal312').value);
    const valido=!!registroAtual && dinheiro!==null;
    $('qcArPreviaTotal327').textContent=valido
      ?moeda(Math.round((Number(registroAtual.totalQC)+dinheiro)*100)/100)
      :'R$ —';
    $('qcArCorrigir312').disabled=!valido || ocupada;
  }
  $('qcArNovoTotal312').addEventListener('input', atualizarPreviaCorrecao327);
  function mostrarRegistro(r){
    registroAtual=r;
    $('qcArSubtitulo312').textContent='Arrecadação de '+r.dataSessao;
    $('qcArHistQC312').textContent=qc(r.totalQC);
    $('qcArHistDin312').textContent=moeda(r.dinheiroFisico);
    $('qcArHistTotal312').textContent=moeda(r.totalGeral);
    $('qcArNovoTotal312').value=Number(r.dinheiroFisico||0).toFixed(2).replace('.',',');
    $('qcArCorrigirArea312').hidden=!tesoureiroAutorizado;
    atualizarPreviaCorrecao327();
    paineis('qcArFechada312');
  }
  $('qcArConsultar312').addEventListener('click',async()=>{
    if(ocupada)return;
    if(lendo||cam)parar();
    leitura=null;paineis(null);
    ocupada=true;
    const consultaAtual=++seq;
    status('Consultando arrecadações encerradas...');
    try{
      const token=sessionStorage.getItem('QC_TOKEN_SESSAO_TESTE');
      if(!token)throw Error('Entre novamente na carteira para consultar.');
      const r=await requisitar('qc_arrec_consultar312',{tokenSessao:token});
      if(seq!==consultaAtual || !area.open)return;
      if(r.status!=='OK')throw Error(r.mensagem||'Consulta indisponível.');
      registros=Array.isArray(r.sessoes)?r.sessoes:[];
      tesoureiroAutorizado=r.tesoureiro===true;
      if(!registros.length){paineis(null);status('Ainda não há arrecadações encerradas.');return;}
      const sel=$('qcArHistorico312');sel.replaceChildren();
      registros.forEach((s,i)=>{
        const opt=document.createElement('option');opt.value=String(i);opt.textContent=s.dataSessao;
        sel.appendChild(opt);
      });
      sel.hidden=registros.length<2;sel.value='0';
      mostrarRegistro(registros[0]);
      status('Total disponível para consulta e anúncio.');
    }catch(e){if(seq===consultaAtual && area.open){paineis(null);status('⚠️ '+(e.message||e),true);}}
    finally{if(seq===consultaAtual)ocupada=false;}
  });
  $('qcArHistorico312').addEventListener('change',ev=>{
    const i=Number(ev.target.value);
    if(Number.isInteger(i)&&registros[i])mostrarRegistro(registros[i]);
  });
  $('qcArCorrigir312').addEventListener('click',async()=>{
    if(ocupada||!tesoureiroAutorizado||!registroAtual)return;
    const novoDinheiro=dinheiroValor($('qcArNovoTotal312').value);
    if(novoDinheiro===null){status('Informe o novo valor contado em dinheiro físico.',true);return;}
    const totalPrevisto=Math.round((Number(registroAtual.totalQC)+novoDinheiro)*100)/100;
    if(!window.confirm('Corrigir somente o dinheiro físico da sessão de '+registroAtual.dataSessao+
      ' para '+moeda(novoDinheiro)+'?\nNovo total: '+moeda(totalPrevisto)+' (Qc$ inalterados).'))return;
    ocupada=true;$('qcArCorrigir312').disabled=true;
    status('Corrigindo o dinheiro físico e atualizando o mesmo lançamento na TS...');
    try{
      // A rota de transporte usa a chave legada `novoTotal`; o Apps Script 327
      // a interpreta exclusivamente como o NOVO DINHEIRO FÍSICO.
      const r=await requisitar('qc_arrec_corrigir312',{
        tokenSessao:sessionStorage.getItem('QC_TOKEN_SESSAO_TESTE'),
        idSessao:registroAtual.idSessao,novoTotal:novoDinheiro
      });
      if(r.status!=='CORRIGIDA')throw Error(r.mensagem||'Correção não realizada.');
      Object.assign(registroAtual,{totalQC:r.totalQC,dinheiroFisico:r.dinheiroFisico,totalGeral:r.totalGeral});
      mostrarRegistro(registroAtual);
      status('Dinheiro físico corrigido. Total recalculado e mesma linha da TS atualizada.');
    }catch(e){status('⚠️ '+(e.message||e),true);}
    finally{ocupada=false;atualizarPreviaCorrecao327();}
  });
  paineis(null);
  // Recolher a secao cancela qualquer leitura ou consulta pendente,
  // e nunca deixa valores da conferencia abertos ao reexpandir.
  area.addEventListener('toggle',()=>{
    if(!area.open){
      parar();leitura=null;ocupada=false;
      paineis(null);status('');
    }
  });
})();
