// QuintosCoin — Passo 433. Acompanhamento de doações, transferências e recebimentos.
// Somente interface + diário LOCAL cifrado. Não muda nenhum saldo, assinatura,
// operação financeira, rota anônima ou vínculo de doador no servidor.
(function () {
  'use strict';
  const PREFIXO = 'QC_HISTORICO_LOCAL_V1_'; // V1 = formato do DIÁRIO, operações são V2.
  const TIPOS = new Set(['DOACAO', 'TRANSFERENCIA_ENVIADA', 'TRANSFERENCIA_RECEBIDA']);
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const texto = new TextEncoder();
  const leitor = new TextDecoder();
  const filas = new Map();
  const paineis = [];

  function sessaoAtual() {
    return {
      id: localStorage.getItem('QC_ID_CARTEIRA') || '',
      token: sessionStorage.getItem('QC_TOKEN_SESSAO_TESTE') || ''
    };
  }
  function mesmaSessao(original) {
    const atual = sessaoAtual();
    return !!(original.id && original.token && atual.id === original.id &&
      atual.token === original.token);
  }
  function chave(id) { return PREFIXO + id; }
  function hex(bytes) {
    return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  }
  function bytes(hexadecimal) {
    if (typeof hexadecimal !== 'string' || !/^(?:[0-9a-f]{2})+$/i.test(hexadecimal))
      throw Error('Histórico protegido inválido. Preserve os dados deste aparelho.');
    return Uint8Array.from(hexadecimal.match(/../g), b => parseInt(b, 16));
  }
  async function derivar(senha, salt, uso) {
    const base = await crypto.subtle.importKey(
      'raw', texto.encode(senha), 'PBKDF2', false, ['deriveKey']
    );
    return crypto.subtle.deriveKey(
      {name:'PBKDF2', salt, iterations:310000, hash:'SHA-256'}, base,
      {name:'AES-GCM', length:256}, false, [uso]
    );
  }
  async function cifrar(registros, senha) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await derivar(senha, salt, 'encrypt');
    const dados = new Uint8Array(await crypto.subtle.encrypt(
      {name:'AES-GCM', iv}, key, texto.encode(JSON.stringify(registros))
    ));
    return {versao:1, saltHex:hex(salt), ivHex:hex(iv), dadosHex:hex(dados)};
  }
  async function decifrar(envelope, senha) {
    if (!envelope || envelope.versao !== 1) throw Error('Formato do histórico não reconhecido.');
    const salt=bytes(envelope.saltHex), iv=bytes(envelope.ivHex), dados=bytes(envelope.dadosHex);
    if (salt.length !== 16 || iv.length !== 12) throw Error('Histórico protegido inválido.');
    const key = await derivar(senha, salt, 'decrypt');
    let claro;
    try {
      claro = await crypto.subtle.decrypt({name:'AES-GCM', iv},key,dados);
    } catch (_) {
      throw Error('Não foi possível abrir o histórico com a senha atual. Preserve os dados.');
    }
    const resultado = JSON.parse(leitor.decode(claro));
    if (!Array.isArray(resultado) || resultado.length > 3000 ||
        resultado.some(r=>!r || !TIPOS.has(r.tipo) || !UUID.test(r.id) ||
          !Number.isSafeInteger(r.valor) || r.valor < 1)) {
      throw Error('Conteúdo do histórico inconsistente. Preserve os dados.');
    }
    return resultado;
  }
  async function ler(id, senha) {
    const bruto = localStorage.getItem(chave(id));
    if (!bruto) return [];
    let envelope;
    try { envelope = JSON.parse(bruto); }
    catch (_) { throw Error('Histórico protegido danificado. Preserve os dados.'); }
    return decifrar(envelope, senha);
  }
  function ordemEstado(estado) {
    return estado === 'CONCLUIDA' ? 2 : 1;
  }
  // Chamado APENAS após uma ação confirmada pela rotina financeira existente.
  // A senha vem da memória da sessão; jamais é gravada ou enviada ao servidor.
  window.QC_registrarHistorico433 = function (dados, senha, origem) {
    const tipo=String(dados?.tipo || '');
    const id=String(dados?.id || '').toLowerCase();
    const valor=Number(dados?.valor);
    const estado=String(dados?.estado || '');
    if (!TIPOS.has(tipo) || !UUID.test(id) || !Number.isSafeInteger(valor) ||
        valor < 1 || valor > 1000000 || !['AGUARDANDO','CONCLUIDA'].includes(estado) ||
        (tipo !== 'TRANSFERENCIA_ENVIADA' && estado !== 'CONCLUIDA') ||
        !senha || !mesmaSessao(origem)) {
      return Promise.reject(Error('Registro de histórico rejeitado: sessão ou dados inválidos.'));
    }
    const idCarteira=origem.id;
    const anterior=filas.get(idCarteira) || Promise.resolve();
    const trabalho=anterior.catch(()=>{}).then(async()=>{
      if(!mesmaSessao(origem)) throw Error('Carteira alterada durante o histórico.');
      const anteriores=await ler(idCarteira,senha);
      const indice=anteriores.findIndex(r=>r.tipo===tipo && r.id===id);
      const agora=new Date().toISOString();
      if(indice >= 0) {
        const atual=anteriores[indice];
        if(atual.valor !== valor) throw Error('Valor diferente no histórico da mesma operação.');
        if(ordemEstado(estado)>ordemEstado(atual.estado)) {
          atual.estado=estado;
          atual.atualizadoEm=agora;
        } else return; // Idempotência: não regravar nem regredir estado.
      } else {
        anteriores.unshift({tipo,id,valor,estado,registradoEm:agora,atualizadoEm:agora});
      }
      if(anteriores.length > 3000) anteriores.length=3000;
      const antes=localStorage.getItem(chave(idCarteira));
      const protegido=JSON.stringify(await cifrar(anteriores,senha));
      if(!mesmaSessao(origem) || localStorage.getItem(chave(idCarteira))!==antes)
        throw Error('Histórico mudou durante a gravação; não foi sobrescrito.');
      localStorage.setItem(chave(idCarteira),protegido);
    });
    filas.set(idCarteira,trabalho);
    trabalho.finally(()=>{if(filas.get(idCarteira)===trabalho)filas.delete(idCarteira);})
      .catch(()=>{});
    return trabalho;
  };

  function dinheiro(n) {
    return 'Qc$ ' + Number(n).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
  }
  function dataLocal(iso) {
    const data = new Date(iso);
    return Number.isFinite(data.getTime()) ? data.toLocaleString('pt-BR',{
      timeZone:'America/Sao_Paulo',day:'2-digit',month:'2-digit',year:'numeric',
      hour:'2-digit',minute:'2-digit'
    }) : 'Data indisponível';
  }
  function linha(titulo, valor, estado, data, codigo) {
    const area=document.createElement('article');
    area.className='qc-hist-linha433';
    const nome=document.createElement('strong');
    nome.textContent=titulo + ' · ' + dinheiro(valor);
    const detalhe=document.createElement('p');
    detalhe.textContent=estado + (data ? ' · ' + data : '');
    area.append(nome,detalhe);
    if(codigo) {
      const identificador=document.createElement('small');
      identificador.textContent='Operação: '+String(codigo).slice(0,8);
      area.appendChild(identificador);
    }
    return area;
  }
  const css=document.createElement('style');
  css.textContent=`
    #qcModalDoar301 {box-sizing:border-box;padding:12px;
      padding-top:max(12px,env(safe-area-inset-top));
      padding-bottom:max(12px,env(safe-area-inset-bottom))}
    #qcModalDoar301 > .qc-modal-card {box-sizing:border-box;min-height:0;
      max-height:calc(100vh - 24px);max-height:calc(100dvh - 24px);
      overflow-y:auto;overflow-x:hidden;overscroll-behavior:contain;
      -webkit-overflow-scrolling:touch}
    .qc-hist433{margin-top:17px;padding-top:12px;border-top:1px solid #ffffff33}
    .qc-hist433>summary{cursor:pointer;color:#e6c363;font-weight:650;padding:7px 1px}
    .qc-hist433 .qc-hist-lista433{margin-top:9px;max-height:340px;overflow:auto;overscroll-behavior:contain}
    .qc-hist433 .qc-hist-linha433{padding:10px 11px;margin:8px 0;border:1px solid #ffffff35;border-radius:9px;overflow-wrap:anywhere}
    .qc-hist433 .qc-hist-linha433 strong{display:block;font-size:14px}
    .qc-hist433 .qc-hist-linha433 p{font-size:12px;margin:6px 0;opacity:.93;line-height:1.4}
    .qc-hist433 .qc-hist-linha433 small{font-size:11px;opacity:.72}
    .qc-hist433 .qc-hist-nota433{font-size:12px;opacity:.8;line-height:1.45;margin:11px 0 4px}
    .qc-hist433[hidden]{display:none!important}
  `;
  document.head.appendChild(css);

  function painel(titulo, pai, tipo) {
    if(!pai)return null;
    const d=document.createElement('details');
    d.className='qc-hist433';
    d.id='qcHistorico'+tipo+'433';
    const sum=document.createElement('summary');
    sum.textContent=titulo;
    const list=document.createElement('div');
    list.className='qc-hist-lista433';
    list.setAttribute('role','status');
    const nota=document.createElement('p');
    nota.className='qc-hist-nota433';
    nota.textContent=tipo==='DOACAO'
      ? 'As doações continuam anônimas. Este histórico é cifrado neste aparelho, ' +
        'não acompanha o backup das fichas e começa a contar a partir do Passo 433.'
      : tipo==='TRANSFERENCIA'
        ? 'Transferências a partir do Passo 436 são identificadas pelo servidor e consultadas ' +
          'por esta carteira. As anteriores podem aparecer somente no histórico local, ' +
          'sem identificação verificável. O servidor não guarda os códigos QR secretos.'
        : 'Pedidos à Loja e transferências identificadas são consultados no servidor. ' +
          'Uma transferência concluída no servidor só estará disponível neste aparelho ' +
          'se as fichas tiverem sido salvas com segurança.';
    d.append(sum,list,nota);
    pai.appendChild(d);
    paineis.push({d,list,tipo});
    d.addEventListener('toggle',()=>{if(d.open) void mostrar(d,list,tipo);});
    return d;
  }
  async function mostrar(d,list,tipo) {
    const entrada=sessaoAtual();
    list.replaceChildren();
    if(!entrada.id || !entrada.token) {
      list.textContent='Entre na carteira para consultar este histórico.';
      return;
    }
    const senha=typeof window.QC_senhaFichas291==='function'
      ? window.QC_senhaFichas291() : '';
    if(!senha) {
      list.textContent='Entre novamente na carteira para abrir o histórico protegido.';
      return;
    }
    list.textContent='Consultando histórico...';
    let locais=[];
    try { locais=await ler(entrada.id,senha); }
    catch(e) {
      if(mesmaSessao(entrada) && d.open) list.textContent='⚠️ '+String(e.message||e);
      return;
    }
    if(!d.open || !mesmaSessao(entrada)) return;
    let remotos=[];
    let transferenciasRemotas=[];
    let aviso='';
    if(tipo==='TRANSFERENCIA' || tipo==='RECEBIMENTO') {
      try {
        if(typeof QC_post191!=='function') throw Error('Consulta autenticada indisponível.');
        const r=await QC_post191('qc_transferir_v2_meus');
        if(r?.status!=='OK' || !Array.isArray(r.transferencias))
          throw Error(r?.mensagem||'Histórico de transferências indisponível.');
        transferenciasRemotas=r.transferencias;
      } catch(e) { aviso='⚠️ Transferências no servidor: '+String(e.message||e); }
    }
    if(tipo==='RECEBIMENTO') {
      try {
        if(typeof QC_post191!=='function') throw Error('Consulta de emissões indisponível.');
        const r=await QC_post191('qc_pedidos_receber_296');
        if(r?.status!=='OK' || !Array.isArray(r.solicitacoes))
          throw Error(r?.mensagem||'Resposta do servidor indisponível.');
        // Mantém a mesma separação V1/V2 da carteira.
        remotos=r.solicitacoes.filter(p=>!p.idEmissao || p.versaoEmissao==='V2');
      }catch(e){ aviso+=(aviso?' ':'')+'⚠️ Pedidos à Loja: '+String(e.message||e); }
    }
    if(!d.open || !mesmaSessao(entrada)) return;
    list.replaceChildren();
    const mostrarLocais=locais.filter(r=>tipo==='DOACAO'
      ? r.tipo==='DOACAO'
      : tipo==='TRANSFERENCIA'
        ? r.tipo==='TRANSFERENCIA_ENVIADA' || r.tipo==='TRANSFERENCIA_RECEBIDA'
        : r.tipo==='TRANSFERENCIA_RECEBIDA');
    const itens=[];
    const remotasValidas=transferenciasRemotas.filter(r=>
      UUID.test(String(r?.idTransferencia||'')) &&
      ['ENVIADA','RECEBIDA'].includes(r?.direcao) &&
      Number.isSafeInteger(Number(r.valor)) && Number(r.valor)>0);
    // Preferir o livro autenticado, sem duplicar o registro local do Passo 433.
    const remotasIds=new Set(remotasValidas.map(r=>
      (r.direcao==='ENVIADA'?'TRANSFERENCIA_ENVIADA':'TRANSFERENCIA_RECEBIDA')+'|'+
        String(r.idTransferencia).toLowerCase()));
    for(const r of mostrarLocais) {
      if(remotasIds.has(r.tipo+'|'+r.id)) continue;
      const titulo=r.tipo==='DOACAO'?'Doação':
        r.tipo==='TRANSFERENCIA_ENVIADA'?'Transferência enviada':'Transferência recebida';
      const estado=r.estado==='CONCLUIDA'?'Concluída':'Aguardando recebimento pelo destinatário';
      const naoIdentificada=r.tipo!=='DOACAO'?' · Participantes não identificados (histórico local)':'';
      itens.push({ordem:new Date(r.registradoEm).getTime()||0,
        elemento:linha(titulo,r.valor,estado+naoIdentificada,dataLocal(r.registradoEm),r.id)});
    }
    for(const r of remotasValidas) {
      if(tipo==='RECEBIMENTO' && r.direcao!=='RECEBIDA') continue;
      const titulo=r.direcao==='ENVIADA'?'Transferência enviada':'Transferência recebida';
      const pessoa=r.direcao==='ENVIADA'?
        'Para: '+(r.destinatario||'aguardando destinatário'):
        'De: '+(r.remetente||'remetente não identificado — operação anterior');
      const situacao=r.status==='CONCLUIDA'?'Concluída no servidor':
        r.status==='RESGATANDO'?'Recebimento em processamento':
        r.status==='PRONTA'?'Aguardando recebimento pelo destinatário':
        'Situação: '+String(r.status||'não informada');
      itens.push({ordem:new Date(r.criadaEm).getTime()||0,
        elemento:linha(titulo,Number(r.valor),pessoa+' · '+situacao,
          dataLocal(r.criadaEm),r.idTransferencia)});
    }
    if(tipo==='RECEBIMENTO') {
      for(const p of remotos) {
        const valor=Number(p.valor);
        if(!Number.isSafeInteger(valor)||valor<1)continue;
        const situacao=String(p.situacao||'').toUpperCase();
        const status=String(p.status||'').toUpperCase();
        const rotulo=status==='PENDENTE'?'Aguardando tesoureiro':
          status==='CANCELADA'||status==='CANCELADO'?'Pedido cancelado':
          status==='AUTORIZADA'&&situacao==='ASSINADA'
            ? 'Fichas assinadas no servidor; confira o saldo':
          status==='AUTORIZADA'&&situacao==='PRONTA'?'Liberado para receber':
          status==='AUTORIZADA'&&situacao==='EM_ANDAMENTO'?'Recebimento em andamento':
          situacao==='CONFERIR'?'Necessita conferência':
          'Situação: '+(status||situacao||'não informada');
        // DataSolicitacao vem formatada pelo próprio Apps Script.
        const dt=String(p.dataSolicitacao||'');
        const partes=/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})/.exec(dt);
        const ordem=partes?new Date(`${partes[3]}-${partes[2]}-${partes[1]}T${partes[4]}:${partes[5]}:00`).getTime():0;
        itens.push({ordem,elemento:linha('Pedido à Loja',valor,rotulo,dt,String(p.idAutorizacao||''))});
      }
    }
    itens.sort((a,b)=>b.ordem-a.ordem);
    if(!itens.length) {
      const vazio=document.createElement('p');
      vazio.textContent=tipo==='DOACAO'?'Nenhuma doação registrada neste aparelho desde esta atualização.':
        tipo==='TRANSFERENCIA'?'Nenhuma transferência registrada neste aparelho desde esta atualização.':
        'Nenhum recebimento encontrado.';
      list.appendChild(vazio);
    }
    for(const item of itens.slice(0,100))list.appendChild(item.elemento);
    if(itens.length>100) {
      const mais=document.createElement('p');
      mais.textContent='Exibindo os 100 registros mais recentes.';
      list.appendChild(mais);
    }
    if(aviso) {
      const alerta=document.createElement('p');alerta.textContent=aviso;list.prepend(alerta);
    }
  }

  const doar=document.getElementById('qcEditarDoar301');
  const transferir=document.querySelector('#qcModalTransferir275 > .qc-modal-card');
  const receber=document.querySelector('#qcModalReceber > .qc-modal-card');
  const doaPainel=painel('Acompanhar doações',doar,'DOACAO');
  const transfPainel=painel('Acompanhar transferências',transferir,'TRANSFERENCIA');
  const recebPainel=painel('Acompanhar recebimentos',receber,'RECEBIMENTO');

  // Não mostrar o diário durante câmera, sacola, processamento ou tela de sucesso.
  if(doar && doaPainel) {
    new MutationObserver(()=>{
      if(doar.hidden) {
        doaPainel.open=false;
        doaPainel.querySelector('.qc-hist-lista433')?.replaceChildren();
      }
    }).observe(doar,{attributes:true,attributeFilter:['hidden']});
  }
  // Ao fechar cada modal, recolher e apagar valores já decifrados do DOM.
  function limparAoFecharModal(id, painelHistorico) {
    const modal=document.getElementById(id);
    if(!modal || !painelHistorico)return;
    new MutationObserver(()=>{
      if(modal.style.display!=='flex') {
        painelHistorico.open=false;
        painelHistorico.querySelector('.qc-hist-lista433')?.replaceChildren();
      }
    }).observe(modal,{attributes:true,attributeFilter:['style']});
  }
  limparAoFecharModal('qcModalDoar301',doaPainel);
  limparAoFecharModal('qcModalTransferir275',transfPainel);
  limparAoFecharModal('qcModalReceber',recebPainel);
  function ocultarDuranteConclusao(elementoConclusao,p) {
    if(!elementoConclusao || !p)return;
    const sincronizar=()=>{
      const concluindo=elementoConclusao.style.display==='flex';
      p.hidden=concluindo;
      if(concluindo)p.open=false;
    };
    new MutationObserver(sincronizar).observe(elementoConclusao,
      {attributes:true,attributeFilter:['style']});
    sincronizar();
  }
  ocultarDuranteConclusao(document.getElementById('qcConclusaoTransferencia383'),transfPainel);

  // Consulta separada para o tesoureiro: apenas leitura, sempre autenticada.
  // O servidor confere a funcao do tesoureiro, mesmo que alguem abra o HTML manualmente.
  const areaTes=document.getElementById('qcConteudoTesoureiro294');
  if(areaTes) {
    const p=document.createElement('details');
    p.className='qc-hist433';
    p.id='qcHistoricoTesoureiro436';
    const titulo=document.createElement('summary');
    titulo.textContent='📒 Histórico de transferências';
    const lista=document.createElement('div');
    lista.className='qc-hist-lista433';
    lista.setAttribute('role','status');
    const nota=document.createElement('p');
    nota.className='qc-hist-nota433';
    nota.textContent='Transferências V2 identificadas; operações anteriores à atualização podem não ter nomes. ' +
      'Doações não aparecem nesta consulta.';
    p.append(titulo,lista,nota);
    areaTes.appendChild(p);
    paineis.push({d:p,list:lista,tipo:'TESOUREIRO'});
    p.addEventListener('toggle',async()=>{
      if(!p.open)return;
      const inicio=sessaoAtual();
      lista.textContent='Consultando transferências...';
      try {
        if(!inicio.id || !inicio.token)throw Error('Entre na carteira novamente.');
        const r=await QC_post191('qc_transferir_v2_tesoureiro');
        if(r?.status!=='OK'||!Array.isArray(r.transferencias))
          throw Error(r?.mensagem||'Consulta não autorizada.');
        if(!p.open||!mesmaSessao(inicio))return;
        lista.replaceChildren();
        if(!r.transferencias.length){lista.textContent='Nenhuma transferência registrada.';return;}
        for(const t of r.transferencias) {
          if(!UUID.test(String(t.idTransferencia||'')))continue;
          const origem=String(t.remetente||'Não identificado (registro anterior)');
          const destino=String(t.destinatario||'Aguardando destinatário');
          const situacao=t.status==='CONCLUIDA'?'Concluída':String(t.status||'');
          lista.appendChild(linha('Transferência',t.valor,
            'De: '+origem+' · Para: '+destino+' · '+situacao,
            dataLocal(t.criadaEm),t.idTransferencia));
        }
      }catch(e){if(p.open&&mesmaSessao(inicio))lista.textContent='⚠️ '+String(e.message||e);}
    });
  }
  // Receber pode abrir direto na tela de uma única autorização liberada.
  // Manter o acompanhamento acessível também nessa situação.

  // Apagar conteúdos decifrados da tela sempre que a senha da sessão for limpa.
  const limparOriginal=window.QC_limparSenhaSessao291;
  if(typeof limparOriginal==='function') {
    window.QC_limparSenhaSessao291=function(...args) {
      for(const p of paineis){p.d.open=false;p.list.replaceChildren();}
      return limparOriginal.apply(this,args);
    };
  }
})();
