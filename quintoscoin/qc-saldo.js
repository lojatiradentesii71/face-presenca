// QUINTOSCOIN - PASSO 291 - SALDO AUTOMATICO COM A SENHA DO LOGIN
// Mantem saldo, backup, recuperacao e a consulta de fichas gastas.
// Doacoes: rotas anonimas + fila local criptografada. Transferencias ainda nao integradas.
// Servidor conserva os bloqueios de doacao e troco ate liberacao final.
(function () {
  "use strict";

  const dec = new TextDecoder();
  const enc = new TextEncoder();
  let memoria = null;
  // O saldo V2 e conferido SEPARADAMENTE e nunca alimenta doacoes V1.
  let memoriaV2365 = null;
  let avisoV2365 = null;
  let senhaSessao265 = null;
  // PASSO 343 — Máximo de quatro verificações independentes em paralelo.
  // NUNCA paralelizar criação, reserva, gasto, assinatura ou escrita de fichas.
  const QC_CONCORRENCIA_LEITURA343 = 4;
  let cacheFichasConferidas343 = null;
  async function QC_emParalelo343(itens, tarefa) {
    const resultados=new Array(itens.length);
    let proximo=0, primeiraFalha=null;
    async function executar() {
      while (!primeiraFalha) {
        const i=proximo++;
        if(i>=itens.length) return;
        try {resultados[i]=await tarefa(itens[i],i);}
        catch(e) { if(!primeiraFalha) primeiraFalha=e; return; }
      }
    }
    const n=Math.min(itens.length,QC_CONCORRENCIA_LEITURA343);
    await Promise.all(Array.from({length:n},()=>executar()));
    if(primeiraFalha) throw primeiraFalha;
    return resultados;
  }
  function QC_cacheValido343(id,token) {
    const c=cacheFichasConferidas343;
    if(!c || c.id!==id || c.token!==token) return null;
    // Se fichas foram recebidas, importadas ou alteradas, não reutilizar o cache.
    if(localStorage.getItem(chaveLocal())!==c.conteudo) return null;
    return c;
  }

  function QC_formatoValor291(valor) {
    return "Qc$ " + Number(valor).toLocaleString("pt-BR", {
      minimumFractionDigits:2, maximumFractionDigits:2
    });
  }

  function chaveLocal() {
    const id = localStorage.getItem("QC_ID_CARTEIRA");
    if (!id) throw Error("Nenhuma carteira selecionada.");
    return "QC_FICHAS_ASSINADAS_V1_" + id;
  }

  function lerRegistros() {
    const dados = JSON.parse(localStorage.getItem(chaveLocal()) || "{}");
    if (!dados || typeof dados !== "object" || Array.isArray(dados)) {
      throw Error("Registros de fichas inválidos.");
    }
    return dados;
  }

  function deHex(s) {
    if (typeof s !== "string" || !/^(?:[0-9a-f]{2})+$/i.test(s)) {
      throw Error("Dados hexadecimais inválidos.");
    }
    return Uint8Array.from(s.match(/../g), x => parseInt(x, 16));
  }

  function base64url(b) {
    let str = "";
    for (const x of b) str += String.fromCharCode(x);
    return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  }

  async function abrir(cifrado, senha) {
    if (!cifrado || cifrado.versao !== 1) {
      throw Error("Formato de ficha protegida desconhecido.");
    }
    const salt = deHex(cifrado.saltHex);
    const iv = deHex(cifrado.ivHex);
    const texto = deHex(cifrado.dadosHex);
    if (salt.length !== 16 || iv.length !== 12) {
      throw Error("Proteção da ficha inválida.");
    }
    const base = await crypto.subtle.importKey(
      "raw", enc.encode(senha), "PBKDF2", false, ["deriveKey"]
    );
    const chave = await crypto.subtle.deriveKey(
      {name:"PBKDF2", salt, iterations:310000, hash:"SHA-256"},
      base, {name:"AES-GCM", length:256}, false, ["decrypt"]
    );
    try {
      return JSON.parse(dec.decode(await crypto.subtle.decrypt(
        {name:"AES-GCM", iv}, chave, texto
      )));
    } catch (_) {
      throw Error("Senha da ficha incorreta ou backup danificado.");
    }
  }

  // PASSO 263 - O servidor valida novamente a assinatura e consulta
  // o identificador global na tabela QC_FichasGastas. Nao e uma doacao.
  async function consultarFicha263(ficha) {
    // Consulta anonima: nao use QC_post191, que inclui o token da carteira.
    const http = await fetch(QC_URL_191, {
      method: "POST",
      redirect: "follow",
      headers: {"Content-Type": "text/plain;charset=utf-8"},
      body: JSON.stringify({
        acao: "qc_consultar_gasto",
        mensagemHex: ficha.mensagemHex,
        assinaturaHex: ficha.assinaturaHex
      })
    });
    if (!http.ok) {
      throw Error("Falha na consulta anonima de gasto. HTTP " + http.status);
    }
    const resposta = await http.json();
    if (!resposta || !["DISPONIVEL", "GASTA"].includes(resposta.status)) {
      throw Error(resposta?.mensagem || resposta?.status ||
        "Nao foi possivel conferir o gasto da ficha no servidor.");
    }
    if (Number(resposta.valor) !== ficha.valor) {
      throw Error("Valor da ficha diferente do cadastro do servidor.");
    }
    return resposta.status;
  }

  // PASSO 361 - Conferencia anonima em lotes de no maximo 20 fichas.
  // O servidor verifica cada assinatura e consulta gastos e reservas
  // uma vez por lote. Falha = saldo indisponivel, nunca disponibilidade
  // presumida. Mantem consultarFicha263 para restauracao/backup.
  async function consultarFichasLote361(fichas) {
    if (!Array.isArray(fichas)) throw Error("Lote de fichas invalido.");
    if (!fichas.length) return [];
    const estados = [];
    for (let inicio = 0; inicio < fichas.length; inicio += 20) {
      const parte = fichas.slice(inicio, inicio + 20);
      const http = await fetch(QC_URL_191, {
        method: "POST",
        redirect: "follow",
        headers: {"Content-Type":"text/plain;charset=utf-8"},
        body: JSON.stringify({
          acao: "qc_consultar_gastos_lote",
          fichas: parte.map(f => ({
            mensagemHex: f.mensagemHex,
            assinaturaHex: f.assinaturaHex
          }))
        })
      });
      if (!http.ok) {
        throw Error("Falha ao conferir fichas em lote. HTTP " + http.status);
      }
      const retorno = await http.json();
      if (!retorno || retorno.status !== "OK" ||
          !Array.isArray(retorno.resultados) ||
          retorno.resultados.length !== parte.length) {
        throw Error(retorno?.mensagem ||
          "Servidor nao confirmou todas as fichas do lote.");
      }
      for (let i = 0; i < parte.length; i++) {
        const r = retorno.resultados[i];
        if (!r || !["DISPONIVEL","GASTA"].includes(r.status) ||
            Number(r.valor) !== parte[i].valor) {
          throw Error("Resposta de conferencia de ficha divergente.");
        }
        estados.push(r.status);
      }
    }
    return estados;
  }

  function dadosDaSessao() {
    const id = localStorage.getItem("QC_ID_CARTEIRA");
    const token = sessionStorage.getItem("QC_TOKEN_SESSAO_TESTE");
    return {id, token};
  }

  // PASSO 365 — Validacao de fichas V2 sem misturar dinheiro V1 e V2.
  // Nao executa nenhuma chamada remota se ainda nao ha fichas V2.
  function QC_lerV2Local365(id) {
    const original = localStorage.getItem("QC_FICHAS_ASSINADAS_V2_" + id);
    const registros = JSON.parse(original || "{}");
    if (!registros || typeof registros !== "object" ||
        Array.isArray(registros)) {
      throw Error("Armazenamento das fichas V2 invalido.");
    }
    return {original, registros:Object.entries(registros)};
  }

  function QC_exibirV2365() {
    // O saldo operacional e exibido exclusivamente no mostrador principal.
    // Nao mostrar uma segunda geracao, historicos ou contagem tecnica.
    if (avisoV2365) { avisoV2365.hidden=true; avisoV2365.textContent=""; }
  }

  async function QC_conferirV2365(id, token, senha) {
    let dados;
    try {
      dados = QC_lerV2Local365(id);
    } catch (erro) {
      memoriaV2365 = {id, token, erro:erro.message};
      QC_exibirV2365();
      return;
    }
    if (!dados.registros.length) {
      // Carteira nova sem fichas: saldo operacional verdadeiro = zero,
      // confirmado pelo marco do servidor na consulta de login.
      memoriaV2365 = {id, token, quantidade:0, gastas:0,
        total:0, fichas:[], origem:dados.original};
      QC_exibirV2365();
      return;
    }
    memoriaV2365 = {id, token, erro:"Conferencia em andamento"};
    QC_exibirV2365();
    try {
      const conferidas = await QC_emParalelo343(
        dados.registros, async ([chaveRegistro, cifrada]) => {
          const ficha = await abrir(cifrada, senha);
          const valor = Number(ficha?.valor);
          if (!ficha || ficha.formato !== "QC_FICHA_ASSINADA_V2" ||
              ![1, 2, 5, 10, 50].includes(valor) ||
              ficha.idChave !== "QC-" + valor + "-V2" ||
              !/^[0-9a-f]{1024}$/i.test(String(ficha.assinaturaHex || ""))) {
            throw Error("Ficha V2 local invalida.");
          }
          const mensagemHex = String(ficha.mensagemHex || "").toLowerCase();
          const bytes = deHex(mensagemHex);
          if (bytes.length < 32 || bytes.length > 512) {
            throw Error("Mensagem V2 fora do tamanho permitido.");
          }
          const texto = new TextDecoder("utf-8", {fatal:true})
            .decode(bytes.subarray(32));
          const partes = /^QUINTOSCOIN\|V2\|(1|2|5|10|50)\|(QC-(?:1|2|5|10|50)-V2)\|([0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})$/i
            .exec(texto);
          if (!partes || Number(partes[1]) !== valor ||
              partes[2].toUpperCase() !== ficha.idChave) {
            throw Error("Conteudo V2 inconsistente.");
          }
          return {chaveRegistro, valor, idChave:ficha.idChave,
            mensagemHex, assinaturaHex:String(ficha.assinaturaHex).toLowerCase()};
        }
      );
      const mensagens = new Set();
      for (const ficha of conferidas) {
        if (mensagens.has(ficha.mensagemHex)) {
          throw Error("Ficha V2 repetida no armazenamento local.");
        }
        mensagens.add(ficha.mensagemHex);
      }
      const estados = [];
      // O servidor confere a assinatura RSA-PSS e os gastos. Sem token.
      for (let i=0; i<conferidas.length; i+=20) {
        const parte=conferidas.slice(i,i+20);
        const http=await fetch(QC_URL_191, {
          method:"POST", redirect:"follow",
          headers:{"Content-Type":"text/plain;charset=utf-8"},
          body:JSON.stringify({
            acao:"qc_consultar_gastos_v2_lote",
            fichas:parte.map(x=>({
              mensagemHex:x.mensagemHex, assinaturaHex:x.assinaturaHex
            }))
          })
        });
        if (!http.ok) throw Error("Consulta V2 indisponivel (HTTP " +
          http.status + ").");
        const retorno=await http.json();
        if (!retorno || retorno.status!=="OK" || retorno.versao!=="V2" ||
            typeof retorno.operacoesLiberadas!=="boolean" ||
            !Array.isArray(retorno.resultados) ||
            retorno.resultados.length!==parte.length) {
          throw Error(retorno?.mensagem || "Conferencia V2 nao autorizada.");
        }
        for (let j=0;j<parte.length;j++) {
          const situacao=retorno.resultados[j];
          if (!situacao || !["GASTA","DISPONIVEL"].includes(situacao.status) ||
              situacao.valor!==parte[j].valor) {
            throw Error("Resposta V2 divergente.");
          }
          estados.push(situacao.status);
        }
      }
      const agora=dadosDaSessao();
      if (agora.id!==id || agora.token!==token ||
          localStorage.getItem("QC_FICHAS_ASSINADAS_V2_"+id)!==dados.original) {
        throw Error("Carteira V2 alterada durante a conferencia.");
      }
      const disponiveis=conferidas.filter((_,i)=>estados[i]==="DISPONIVEL");
      // PASSO 366: conservar apenas na memoria da sessao a lista V2
      // ja validada pelo servidor, para o futuro planejador de doacoes.
      // NUNCA transferi-la para o saldo historico V1.
      memoriaV2365={id,token,quantidade:disponiveis.length,
        gastas:conferidas.length-disponiveis.length,
        total:disponiveis.reduce((s,f)=>s+f.valor,0),
        fichas:disponiveis, origem:dados.original};
    } catch (erro) {
      // Nunca considerar uma ficha V2 valida se a consulta falhar.
      memoriaV2365={id,token,erro:erro?.message || String(erro)};
      console.warn("QuintosCoin V2: conferencia incompleta",erro);
    }
    QC_exibirV2365();
  }

  function renderizar() {
    const {id,token}=dadosDaSessao();
    const m=memoriaV2365 && memoriaV2365.id===id &&
      memoriaV2365.token===token ? memoriaV2365 : null;
    const saldo=document.getElementById("saldo");
    const equivalente=document.getElementById("equivalente");
    const lista=document.getElementById("listaFichas");
    if (!saldo||!equivalente||!lista) return;
    const rotulo=document.querySelector("#telaCarteira .saldo p");
    if (rotulo) rotulo.textContent="Fichas disponiveis e verificadas";
    lista.replaceChildren();
    if (!m || m.erro) {
      saldo.textContent=token ? "Qc$ —" : "Qc$ 0,00";
      equivalente.textContent=token ? "Conferindo saldo..." : "R$ 0,00";
      lista.textContent=token ?
        (m&&m.erro ? "Nao foi possivel conferir o saldo. Atualize para tentar novamente." :
          "Conferindo fichas...") :
        "Entre na carteira para consultar suas fichas.";
      QC_exibirV2365();
      return;
    }
    saldo.textContent=QC_formatoValor291(m.total);
    equivalente.textContent=Number(m.total).toLocaleString("pt-BR",{
      style:"currency",currency:"BRL"
    });
    for (const ficha of m.fichas) {
      const item=document.createElement("div");
      item.className="ficha";
      item.textContent="Qc$ "+Number(ficha.valor).toLocaleString("pt-BR")+
        " — assinatura verificada";
      lista.appendChild(item);
    }
    if (!m.fichas.length) lista.textContent="Nenhuma ficha disponivel nesta carteira.";
    QC_exibirV2365();
  }

  // PASSO 267 - Composicao automatica, sem gasto nem assinatura.
  // O motor tambem sera reutilizado por Transferir QC.
  function QC_decomporTroco267(total) {
    // Fichas de 2, 5 e 10 QC: nao ha decomposicao para 1 ou 3 QC.
    // Calculo proporcional a quantidade de fichas, nao ao valor numerico.
    if (!Number.isSafeInteger(total) || total < 0) return null;
    if (total === 0) return [];
    if (total === 1 || total === 3) return null;

    const restos = {
      0: [], 1: [5,2,2,2], 2: [2], 3: [5,2,2,2,2],
      4: [2,2], 5: [5], 6: [2,2,2], 7: [5,2],
      8: [2,2,2,2], 9: [5,2,2]
    };
    const resto = total % 10;
    const dezenas = Math.floor(total / 10) - ((resto === 1 || resto === 3) ? 1 : 0);
    if (dezenas < 0) return null;
    const fichas = Array(dezenas).fill(10);
    fichas.push(...restos[resto]);
    return fichas;
  }

  // PASSO 282 - Planejador sem teto por numero de fichas.
  // Agrupa denominacoes identicas: tempo proporcional ao saldo total,
  // nao ao quadrado do numero de fichas da carteira.
  function QC_planejarComposicao267(valoresDisponiveis, valorSolicitado) {
    const valor=Number(valorSolicitado);
    if (!Number.isSafeInteger(valor) || valor<2 || valor===3) {
      return {status:"VALOR_NAO_PERMITIDO",
        mensagem:"O valor deve ser inteiro, a partir de 2 QC, exceto 3 QC."};
    }
    if (!Array.isArray(valoresDisponiveis)) {
      return {status:"CARTEIRA_INDISPONIVEL"};
    }
    const grupos=new Map([[2,[]],[5,[]],[10,[]]]);
    for (let i=0;i<valoresDisponiveis.length;i++) {
      const n=Number(valoresDisponiveis[i]);
      if (!grupos.has(n)) return {status:"DENOMINACAO_INVALIDA"};
      grupos.get(n).push(i);
    }
    const saldo=valoresDisponiveis.reduce((a,b)=>a+Number(b),0);
    if (!Number.isSafeInteger(saldo)) {
      return {status:"SALDO_INVALIDO"};
    }
    if (valor>saldo) return {status:"SALDO_INSUFICIENTE",saldoDisponivel:saldo};
    // Cada grupo binario de fichas so pode ser utilizado uma vez.
    // Um no imutavel armazena a composicao para posterior reconstrucao.
    const gruposBinarios=[];
    for (const [denom, indices] of grupos) {
      let restantes=indices.length, parte=1;
      while (restantes>0) {
        const q=Math.min(parte,restantes);
        gruposBinarios.push({denom,quantidade:q,peso:denom*q});
        restantes-=q;
        parte*=2;
      }
    }
    // Bounded knapsack. No maximum coin count; the real resource constraint
    // is the actual balance and device memory.
    const custo=new Float64Array(saldo+1);
    custo.fill(Infinity);
    const caminho=Array(saldo+1).fill(null);
    custo[0]=0;
    for (const grupo of gruposBinarios) {
      for (let s=saldo;s>=grupo.peso;s--) {
        const anterior=custo[s-grupo.peso];
        if (!Number.isFinite(anterior)) continue;
        const novo=anterior+grupo.quantidade;
        if (novo<custo[s]) {
          custo[s]=novo;
          caminho[s]={anterior:caminho[s-grupo.peso],
            denominacao:grupo.denom,quantidade:grupo.quantidade};
        }
      }
    }
    let escolhido=-1, fichasTroco=null;
    // Menor troco primeiro. Nao gera arrays para valores nao escolhidos.
    for (let s=valor;s<=saldo;s++) {
      if (!Number.isFinite(custo[s])) continue;
      if (s-valor===1 || s-valor===3) continue;
      const decomposicao=QC_decomporTroco267(s-valor);
      if (!decomposicao) continue;
      escolhido=s; fichasTroco=decomposicao;
      break;
    }
    if (escolhido<0) {
      return {status:"TROCO_IMPOSSIVEL",saldoDisponivel:saldo,
        mensagem:"Nenhuma combinacao preserva o valor restante com fichas de 2, 5 e 10 QC. Nenhuma ficha foi usada."};
    }
    const contagens=new Map([[2,0],[5,0],[10,0]]);
    for (let passo=caminho[escolhido];passo;passo=passo.anterior) {
      contagens.set(passo.denominacao,
        contagens.get(passo.denominacao)+passo.quantidade);
    }
    const indicesSelecionados=[];
    // A escolha e estavel, selecionando as primeiras fichas de cada valor.
    for (const denom of [10,5,2]) {
      const q=contagens.get(denom);
      if (q>grupos.get(denom).length) throw Error("Plano inconsistente.");
      indicesSelecionados.push(...grupos.get(denom).slice(0,q));
    }
    const valoresSelecionados=indicesSelecionados.map(i=>Number(valoresDisponiveis[i]));
    const totalFichasSelecionadas=valoresSelecionados.reduce((s,n)=>s+n,0);
    if (totalFichasSelecionadas!==escolhido ||
        escolhido!==valor+fichasTroco.reduce((s,n)=>s+n,0)) {
      throw Error("Conservacao de valor inconsistente no planejador.");
    }
    return {status:"OK",valorSolicitado:valor,saldoDisponivel:saldo,
      tipo:fichasTroco.length?"COM_TROCO":"EXATA",
      indicesSelecionados,valoresSelecionados,totalFichasSelecionadas,
      valorTroco:escolhido-valor,fichasTroco};
  }

  // PASSO 366 - PLANEJAMENTO V2 (1, 2, 5, 10 e 50 Qc$).
  // SOMENTE aritmetica local. Nao transfere, reserva ou gasta fichas.
  // Manter o planejador historico 267 intacto ate o corte contábil.
  function QC_decomporTrocoV2366(total) {
    if (!Number.isSafeInteger(total) || total < 0) return null;
    const fichas=[];
    for (const d of [50,10,5,2,1]) {
      const quantidade=Math.floor(total/d);
      for (let i=0;i<quantidade;i++) fichas.push(d);
      total-=quantidade*d;
    }
    if (total!==0) throw Error("Troco V2 nao conservado.");
    return fichas;
  }

  function QC_planejarComposicaoV2366(valoresDisponiveis,valorSolicitado) {
    const valor=Number(valorSolicitado);
    if (!Number.isSafeInteger(valor) || valor < 1) {
      return {status:"VALOR_NAO_PERMITIDO",
        mensagem:"Informe um valor inteiro de pelo menos 1 Qc$."};
    }
    if (!Array.isArray(valoresDisponiveis)) {
      return {status:"CARTEIRA_INDISPONIVEL"};
    }
    const denom=[1,2,5,10,50];
    const grupos=new Map(denom.map(v=>[v,[]]));
    let saldo=0;
    for (let i=0;i<valoresDisponiveis.length;i++) {
      const n=Number(valoresDisponiveis[i]);
      if (!grupos.has(n)) return {status:"DENOMINACAO_INVALIDA"};
      saldo+=n;
      if (!Number.isSafeInteger(saldo)) return {status:"SALDO_INVALIDO"};
      grupos.get(n).push(i);
    }
    if (valor>saldo) return {status:"SALDO_INSUFICIENTE",saldoDisponivel:saldo,
      mensagem:"Saldo V2 insuficiente para a doacao."};

    // Mochila limitada por quantidade: mesma estrategia eficiente V1.
    const blocos=[];
    for (const [d,indices] of grupos) {
      let q=indices.length,p=1;
      while(q>0) {
        const n=Math.min(q,p);
        blocos.push({d,q:n,peso:d*n});
        q-=n;p*=2;
      }
    }
    const custo=new Float64Array(saldo+1);
    custo.fill(Infinity);
    const caminho=Array(saldo+1).fill(null);
    custo[0]=0;
    for (const b of blocos) {
      for (let s=saldo;s>=b.peso;s--) {
        if (!Number.isFinite(custo[s-b.peso])) continue;
        const novo=custo[s-b.peso]+b.q;
        if (novo<custo[s]) {
          custo[s]=novo;
          caminho[s]={anterior:caminho[s-b.peso],d:b.d,q:b.q};
        }
      }
    }
    let escolhido=-1;
    for (let s=valor;s<=saldo;s++) {
      if (Number.isFinite(custo[s])) { escolhido=s;break; }
    }
    if (escolhido<0) return {status:"COMPOSICAO_IMPOSSIVEL",
      mensagem:"Nao foi encontrada uma composicao com as fichas V2 disponiveis."};
    const quantidades=new Map(denom.map(v=>[v,0]));
    for (let p=caminho[escolhido];p;p=p.anterior) {
      quantidades.set(p.d,quantidades.get(p.d)+p.q);
    }
    const indicesSelecionados=[];
    for (const d of [50,10,5,2,1]) {
      const q=quantidades.get(d);
      if (q>grupos.get(d).length) throw Error("Plano V2 inconsistente.");
      indicesSelecionados.push(...grupos.get(d).slice(0,q));
    }
    const entradas=indicesSelecionados.map(i=>Number(valoresDisponiveis[i]));
    const soma=entradas.reduce((a,b)=>a+b,0);
    const fichasTroco=QC_decomporTrocoV2366(soma-valor);
    if (soma!==escolhido || soma!==valor+fichasTroco.reduce((a,b)=>a+b,0)) {
      throw Error("Falha na conservacao de valor V2.");
    }
    return {status:"OK",versao:"V2",valorSolicitado:valor,
      saldoDisponivel:saldo,tipo:fichasTroco.length?"COM_TROCO":"EXATA",
      indicesSelecionados,valoresSelecionados:entradas,
      totalFichasSelecionadas:soma,valorTroco:soma-valor,fichasTroco};
  }

  // Oferece somente os numeros do plano; sem assinatura, segredo ou identidade.
  window.QC_planejarMovimentoV2366=function(valor) {
    const {id,token}=dadosDaSessao();
    const r=memoriaV2365;
    if (!id || !token || !r || r.id!==id || r.token!==token ||
        !Array.isArray(r.fichas) ||
        localStorage.getItem("QC_FICHAS_ASSINADAS_V2_"+id)!==r.origem) {
      return {status:"SALDO_V2_NAO_VERIFICADO",
        mensagem:"As fichas V2 ainda nao estao conferidas nesta carteira."};
    }
    const plano=QC_planejarComposicaoV2366(r.fichas.map(f=>f.valor),valor);
    if (plano.status!=="OK") return plano;
    // Nao expor indices de identificacao nem dados de fichas na API publica.
    return {status:"OK",versao:"V2",valorSolicitado:plano.valorSolicitado,
      saldoDisponivel:plano.saldoDisponivel,tipo:plano.tipo,
      totalFichasSelecionadas:plano.totalFichasSelecionadas,
      valorTroco:plano.valorTroco,fichasTroco:plano.fichasTroco.slice()};
  };

  // Disponibilizar apenas o PLANO matematico ao botao original Doar QC.
  // Nao divulga mensagens, assinaturas, senha ou registros criptografados.
  window.QC_planejarMovimento267 = function(valor) {
    // Compatibilidade de assinatura da interface; nunca consultar fichas antigas.
    return window.QC_planejarMovimentoV2366(valor);
  };

  window.QC_atualizarSaldoReal202 = renderizar;

  // PASSO 271 — Operacao anonima a partir do botao ORIGINAL Doar QC.
  // A interface escolhe apenas o valor; fichas, blinding e recuperacao ficam aqui.
  let movimentando271 = false;
  const PENDENTE271 = "QC_DOACAO_PENDENTE_V1_";
  const BIG_UM271 = BigInt(1);
  const BIG_ZERO271 = BigInt(0);

  function QC_hex271(bytes) {
    return Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
  }
  function QC_fixos271(n, tamanho = 512) {
    const str = n.toString(16).padStart(tamanho * 2, "0");
    if (str.length !== tamanho * 2) throw Error("Numero RSA fora do limite.");
    return deHex(str);
  }
  function QC_num271(bytes) { return BigInt("0x" + QC_hex271(bytes)); }
  function QC_juntar271(...partes) {
    const bytes = new Uint8Array(partes.reduce((n, x) => n + x.length, 0));
    let i = 0;
    for (const p of partes) { bytes.set(p, i); i += p.length; }
    return bytes;
  }
  function QC_modpow271(b, expoente, n) {
    let r = BIG_UM271;
    b %= n;
    while (expoente > BIG_ZERO271) {
      if (expoente % BigInt(2) === BIG_UM271) r = r * b % n;
      b = b * b % n;
      expoente /= BigInt(2);
    }
    return r;
  }
  function QC_mdc271(a, b) {
    while (b !== BIG_ZERO271) [a,b] = [b,a%b];
    return a;
  }
  function QC_inverso271(a, n) {
    let t = BIG_ZERO271, nt = BIG_UM271, r = n, nr = a % n;
    while (nr !== BIG_ZERO271) {
      const q = r/nr;
      [t,nt] = [nt,t-q*nt];
      [r,nr] = [nr,r-q*nr];
    }
    if (r !== BIG_UM271) throw Error("Fator de cegamento invalido.");
    return (t%n+n)%n;
  }
  async function QC_sha384_271(bytes) {
    return new Uint8Array(await crypto.subtle.digest("SHA-384",bytes));
  }
  async function QC_pss271(msg) {
    const sal = crypto.getRandomValues(new Uint8Array(48));
    const H = await QC_sha384_271(QC_juntar271(
      new Uint8Array(8), await QC_sha384_271(msg), sal));
    const db = new Uint8Array(463);
    db[414] = 1;
    db.set(sal, 415);
    const mask = new Uint8Array(463);
    for (let p=0, i=0; p<mask.length; i++) {
      const c = Uint8Array.of(i>>>24&255,i>>>16&255,i>>>8&255,i&255);
      const h = await QC_sha384_271(QC_juntar271(H,c));
      mask.set(h.subarray(0,Math.min(h.length,mask.length-p)),p);
      p += Math.min(h.length,mask.length-p);
    }
    const masked = db.map((v,i) => v ^ mask[i]);
    masked[0] &= 0x7f;
    return QC_juntar271(masked,H,Uint8Array.of(0xbc));
  }
  function QC_fator271(n) {
    for (let i=0;i<256;i++) {
      const r = QC_num271(crypto.getRandomValues(new Uint8Array(512)));
      if (r>BIG_ZERO271 && r<n && QC_mdc271(r,n)===BIG_UM271) return r;
    }
    throw Error("Nao foi possivel gerar cegamento seguro.");
  }
  async function QC_publica271(valor) {
    const r = await QC_post191("qc_chave_publica_" + valor);
    const nHex = String(r.moduloHex||"").toLowerCase();
    const eHex = String(r.expoenteHex||"").toLowerCase();
    if (r.status!=="OK" || r.idChave!=="QC-"+valor+"-V1" ||
        !/^[89a-f][0-9a-f]{1023}$/.test(nHex) || !/^0*10001$/.test(eHex)) {
      throw Error("Chave publica de "+valor+" QC indisponivel.");
    }
    const eNorm = eHex.length%2 ? "0"+eHex : eHex;
    return {
      n:BigInt("0x"+nHex), e:BigInt("0x"+eHex),
      verify:await crypto.subtle.importKey("jwk", {
        kty:"RSA",n:base64url(deHex(nHex)),e:base64url(deHex(eNorm)),
        ext:true,key_ops:["verify"]
      },{name:"RSA-PSS",hash:"SHA-384"},false,["verify"])
    };
  }
  async function QC_cifrar271(obj, senha) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const base = await crypto.subtle.importKey("raw",enc.encode(senha),"PBKDF2",false,["deriveKey"]);
    const key = await crypto.subtle.deriveKey(
      {name:"PBKDF2",salt,iterations:310000,hash:"SHA-256"},base,
      {name:"AES-GCM",length:256},false,["encrypt"]);
    return {versao:1,saltHex:QC_hex271(salt),ivHex:QC_hex271(iv),
      dadosHex:QC_hex271(new Uint8Array(await crypto.subtle.encrypt(
        {name:"AES-GCM",iv},key,enc.encode(JSON.stringify(obj)))))};
  }
  function QC_pendenteChave271() { return PENDENTE271 + dadosDaSessao().id; }
  async function QC_postAnonimo271(acao,payload) {
    // NUNCA usar QC_post191: a sessao de login revelaria a carteira.
    const response = await fetch(QC_URL_191,{
      method:"POST",redirect:"follow",
      headers:{"Content-Type":"text/plain;charset=utf-8"},
      body:JSON.stringify({acao,...payload})
    });
    if (!response.ok) throw Error("Comunicacao interrompida (HTTP "+response.status+").");
    const data = await response.json();
    if (!data || typeof data.status!=="string") throw Error("Resposta inesperada do servidor.");
    return data;
  }
  async function QC_fichasAtuais271(senha,valorSolicitado=null) {
    const {id,token}=dadosDaSessao();
    const anterior=QC_cacheValido343(id,token);
    if(anterior) {
      // A conferência integral das assinaturas já foi feita neste login.
      // Para a sacola, só precisamos confirmar de novo no servidor as
      // fichas SELECIONADAS no plano (inclusive se houver troco).
      // Em caso de conflito, reconsulta todas e o planejamento é refeito.
      if(Number.isSafeInteger(valorSolicitado)) {
        const previa=QC_planejarComposicao267(
          anterior.fichas.map(f=>f.valor),valorSolicitado);
        if(previa.status==="OK") {
          const escolhidas=previa.indicesSelecionados.map(i=>anterior.fichas[i]);
          const situacoes=await consultarFichasLote361(escolhidas);
          if(situacoes.every(st=>st==="DISPONIVEL")) {
            return anterior.fichas.map(f=>({...f}));
          }
        }
      }
      // Caminho de recuperação ou outras operações: servidor verifica
      // cada ficha, em paralelo, antes de devolvê-la à carteira.
      const situacoes=await consultarFichasLote361(anterior.fichas);
      return anterior.fichas.filter((_,i)=>situacoes[i]==="DISPONIVEL")
        .map(f=>({...f}));
    }
    const todos=Object.entries(lerRegistros());
    const chaves=new Map(),msgs=new Set();
    const processadas=await QC_emParalelo343(todos,async ([chaveLocalRegistro,cifrado])=>{
      const ficha=await abrir(cifrado,senha);
      const valor=Number(ficha?.valor);
      if (ficha?.formato!=="QC_FICHA_ASSINADA_V1" ||
          ![2,5,10].includes(valor) || ficha.idChave!=="QC-"+valor+"-V1" ||
          !/^[0-9a-f]{1024}$/i.test(String(ficha.assinaturaHex||""))) {
        throw Error("Existe uma ficha local invalida. Nenhuma doacao realizada.");
      }
      const m=deHex(String(ficha.mensagemHex||"").toLowerCase());
      const frase=dec.decode(m.subarray(32));
      if(m.length<80 || !new RegExp("^QUINTOSCOIN\\|V1\\|"+valor+
          "\\|QC-"+valor+"-V1\\|[0-9a-f-]{36}$","i").test(frase)) {
        throw Error("Ficha local inconsistente.");
      }
      const chaveMsg=ficha.mensagemHex.toLowerCase();
      if(msgs.has(chaveMsg)) throw Error("Ficha local duplicada.");
      msgs.add(chaveMsg);
      if(!chaves.has(valor)) chaves.set(valor,QC_publica271(valor));
      const pub=await chaves.get(valor);
      if(!(await crypto.subtle.verify({name:"RSA-PSS",saltLength:48},pub.verify,
          deHex(ficha.assinaturaHex),m))) {
        throw Error("Assinatura de ficha nao confere.");
      }
      return {chaveLocalRegistro,valor,mensagemHex:ficha.mensagemHex,
        assinaturaHex:ficha.assinaturaHex};
    });
    const situacoes=await consultarFichasLote361(processadas);
    return processadas.filter((_,i)=>situacoes[i]==="DISPONIVEL");
  }
  async function QC_prepararTroco271(plano) {
    const saidasCegas=[],privadas=[];
    const publicas = new Map();
    for (const valor of plano.fichasTroco) {
      let pub = publicas.get(valor);
      if (!pub) {pub=await QC_publica271(valor);publicas.set(valor,pub);}
      const idChave="QC-"+valor+"-V1";
      const msg=QC_juntar271(crypto.getRandomValues(new Uint8Array(32)),
        enc.encode("QUINTOSCOIN|V1|"+valor+"|"+idChave+"|"+crypto.randomUUID()));
      const codificado=await QC_pss271(msg);
      const m=QC_num271(codificado);
      if (m<=BIG_ZERO271 || m>=pub.n || QC_mdc271(m,pub.n)!==BIG_UM271) {
        throw Error("Bloco criptografico invalido. Refaça a operacao.");
      }
      const r=QC_fator271(pub.n);
      const bloco=m*QC_modpow271(r,pub.e,pub.n)%pub.n;
      if (bloco<=BIG_ZERO271 || bloco>=pub.n) throw Error("Bloco RSA invalido.");
      saidasCegas.push({denominacao:valor,blocoHex:QC_hex271(QC_fixos271(bloco))});
      privadas.push({indice:saidasCegas.length,valor,idChave,
        mensagemHex:QC_hex271(msg),inversoHex:QC_hex271(QC_fixos271(QC_inverso271(r,pub.n)))});
    }
    return {saidasCegas,privadas};
  }
  async function QC_concluirTroco271(operacao,resposta,senha) {
    if (resposta.status!=="TROCO_ASSINADO" ||
        resposta.idTroca!==operacao.idOperacao ||
        Number(resposta.valorDoacao)!==operacao.valorDoacao ||
        Number(resposta.valorTroco)!==operacao.valorTroco ||
        !Array.isArray(resposta.assinaturasCegas) ||
        resposta.assinaturasCegas.length!==operacao.privadas.length) {
      throw Error("Resposta criptografica de troco divergente. Operacao preservada.");
    }
    const publicas=new Map();
    const novas=[];
    for (const privada of operacao.privadas) {
      const a=resposta.assinaturasCegas.find(x=>Number(x.indice)===privada.indice);
      if (!a || a.denominacao!==privada.valor || a.idChave!==privada.idChave ||
          !/^[0-9a-f]{1024}$/i.test(String(a.assinaturaCegaHex||""))) {
        throw Error("Assinatura cega do troco invalida.");
      }
      let pub=publicas.get(privada.valor);
      if (!pub) {pub=await QC_publica271(privada.valor);publicas.set(privada.valor,pub);}
      const cega=BigInt("0x"+a.assinaturaCegaHex);
      const inverso=BigInt("0x"+privada.inversoHex);
      if (cega<=BIG_ZERO271 || cega>=pub.n || inverso<=BIG_ZERO271 || inverso>=pub.n) {
        throw Error("Assinatura cega fora do dominio RSA.");
      }
      const assinaturaHex=QC_hex271(QC_fixos271(cega*inverso%pub.n));
      if (!(await crypto.subtle.verify({name:"RSA-PSS",saltLength:48},pub.verify,
        deHex(assinaturaHex),deHex(privada.mensagemHex)))) {
        throw Error("Assinatura do troco nao confere. Operacao preservada.");
      }
      novas.push({
        ficha:{formato:"QC_FICHA_ASSINADA_V1",idChave:privada.idChave,
          valor:privada.valor,mensagemHex:privada.mensagemHex,assinaturaHex},
        chave:"QC-TR-"+operacao.idOperacao+"-"+privada.indice
      });
    }
    // Preparar TODAS as novas fichas antes de gravar. A gravacao e atomica.
    const cifradas=[];
    for (const n of novas) cifradas.push({chave:n.chave, registro:await QC_cifrar271(n.ficha,senha)});
    const chave=chaveLocal();
    const textoAnterior=localStorage.getItem(chave);
    const registros=textoAnterior?JSON.parse(textoAnterior):{};
    if (!registros || typeof registros!=="object" || Array.isArray(registros)) {
      throw Error("Armazenamento de fichas inconsistente.");
    }
    // A chave estavel impede duplicacao em retomadas apos interrupcoes.
    for (const n of cifradas) {
      if (registros[n.chave]) {
        const existente=await abrir(registros[n.chave],senha);
        if (existente.mensagemHex!==novas.find(x=>x.chave===n.chave).ficha.mensagemHex ||
            existente.assinaturaHex!==novas.find(x=>x.chave===n.chave).ficha.assinaturaHex) {
          throw Error("Troco anterior divergente; nao sobrescrever.");
        }
      } else {
        registros[n.chave]=n.registro;
      }
    }
    if (localStorage.getItem(chave)!==textoAnterior) {
      throw Error("Carteira alterada durante gravacao do troco. Retome a operacao.");
    }
    localStorage.setItem(chave,JSON.stringify(registros));
  }
  // PASSO 282 - Operacoes exatas com muitas fichas usam lotes de 20.
  // Todas as parcelas fazem parte do MESMO idOperacao ja cifrado na carteira.
  async function QC_doarExataEmLotes282(operacao) {
    const id=operacao.idOperacao;
    const fichas=operacao.fichasEntrada;
    const abrir=await QC_postAnonimo271("qc_lote_abrir",{
      idOperacao:id,valorSolicitado:operacao.valorDoacao,
      quantidadeEntradas:fichas.length
    });
    let etapa=abrir.status;
    if (etapa==="RECEBENDO") {
      for (let pos=0;pos<fichas.length;pos+=20) {
        const parte=await QC_postAnonimo271("qc_lote_parte",{
          idOperacao:id,indiceInicial:pos+1,
          fichas:fichas.slice(pos,pos+20)
        });
        if (parte.status!=="RECEBENDO") {
          throw Error(parte.mensagem||"Parcela da doacao nao confirmada: "+parte.status);
        }
      }
      const pronto=await QC_postAnonimo271("qc_lote_pronto",{idOperacao:id});
      etapa=pronto.status;
    }
    if (!["PRONTO","PROCESSANDO","CONCLUIDO"].includes(etapa)) {
      throw Error(abrir.mensagem||"Doacao em lotes pendente: "+etapa);
    }
    const resposta=await QC_postAnonimo271("qc_lote_concluir",{idOperacao:id});
    if (resposta.status!=="DOACAO_REGISTRADA" ||
        resposta.idOperacao!==id ||
        Number(resposta.valor)!==operacao.valorDoacao ||
        Number(resposta.quantidadeFichas)!==fichas.length) {
      throw Error(resposta.mensagem||"Doacao aguardando confirmacao: "+resposta.status);
    }
    return {status:"DOACAO_REGISTRADA",idOperacao:id,
      valor:resposta.valor,recuperada:!!resposta.recuperada};
  }

  // PASSO 283 - Troco em lotes, sem alterar o unico botao Doar QC.
  // Todas as parcelas usam o idOperacao ja salvo e cifrado na carteira.
  async function QC_doarTrocoEmLotes283(operacao) {
    const id=operacao.idOperacao;
    const entradas=operacao.fichasEntrada;
    const trocos=operacao.saidasCegas;
    const abrir=await QC_postAnonimo271("qc_lote_troco_abrir",{
      idOperacao:id,valorSolicitado:operacao.valorDoacao,
      quantidadeEntradas:entradas.length,quantidadeTroco:trocos.length
    });
    let etapa=abrir.status;
    if (etapa==="RECEBENDO") {
      for (let pos=0;pos<entradas.length;pos+=20) {
        const parte=await QC_postAnonimo271("qc_lote_troco_parte",{
          idOperacao:id,etapa:"ENTRADA",indiceInicial:pos+1,
          fichas:entradas.slice(pos,pos+20)
        });
        if (parte.status!=="RECEBENDO") {
          throw Error(parte.mensagem||"Entrada do troco nao confirmada: "+parte.status);
        }
      }
      for (let pos=0;pos<trocos.length;pos+=20) {
        const parte=await QC_postAnonimo271("qc_lote_troco_parte",{
          idOperacao:id,etapa:"TROCO",indiceInicial:pos+1,
          fichas:trocos.slice(pos,pos+20)
        });
        if (parte.status!=="RECEBENDO") {
          throw Error(parte.mensagem||"Saida cega do troco nao confirmada: "+parte.status);
        }
      }
      const pronto=await QC_postAnonimo271("qc_lote_troco_pronto",{
        idOperacao:id
      });
      etapa=pronto.status;
    }
    if (!["PRONTO","PROCESSANDO","CONCLUIDO"].includes(etapa)) {
      throw Error(abrir.mensagem||"Doacao com troco pendente: "+etapa);
    }
    // Uma assinatura cega por chamada: nao ultrapassa o tempo do Apps Script.
    // Repetir apos queda devolve a MESMA assinatura, nunca cria outra.
    for (let indice=1;indice<=trocos.length;indice++) {
      const assinatura=await QC_postAnonimo271("qc_lote_troco_assinar",{
        idOperacao:id,indice
      });
      if (assinatura.status!=="ASSINADO" || assinatura.idOperacao!==id ||
          Number(assinatura.indice)!==indice ||
          Number(assinatura.denominacao)!==Number(trocos[indice-1].denominacao)) {
        throw Error(assinatura.mensagem||
          "Troco pendente de assinatura: "+assinatura.status+
          ". Retome a mesma operacao.");
      }
    }
    const resposta=await QC_postAnonimo271("qc_lote_troco_concluir",{
      idOperacao:id
    });
    if (resposta.status!=="TROCO_ASSINADO" || resposta.idTroca!==id ||
        Number(resposta.valorDoacao)!==operacao.valorDoacao ||
        Number(resposta.valorTroco)!==operacao.valorTroco ||
        !Array.isArray(resposta.assinaturasCegas) ||
        resposta.assinaturasCegas.length!==trocos.length) {
      throw Error(resposta.mensagem||
        "Troco aguardando conclusao: "+resposta.status+
        ". Retome a mesma operacao.");
    }
    return resposta;
  }

  async function QC_retomar271(operacao,senha) {
    const dados=operacao.tipo==="EXATA" ?
      {acao:"qc_doar_lote",idOperacao:operacao.idOperacao,
        valorDoacao:operacao.valorDoacao,fichas:operacao.fichasEntrada} :
      {acao:"qc_doar_com_troco",idTroca:operacao.idOperacao,
        valorDoacao:operacao.valorDoacao,
        fichasEntrada:operacao.fichasEntrada,saidasCegas:operacao.saidasCegas};
    const {acao,...payload}=dados;
    const usarLotes282=operacao.tipo==="EXATA" &&
      operacao.fichasEntrada.length>50;
    const usarTrocoLotes283=operacao.tipo==="COM_TROCO" &&
      (operacao.fichasEntrada.length>30 || operacao.saidasCegas.length>30);
    const resposta=usarLotes282
      ? await QC_doarExataEmLotes282(operacao)
      : usarTrocoLotes283
        ? await QC_doarTrocoEmLotes283(operacao)
        : await QC_postAnonimo271(acao,payload);
    const ok=operacao.tipo==="EXATA" ? resposta.status==="DOACAO_REGISTRADA" :
      resposta.status==="TROCO_ASSINADO";
    if (!ok) {
      // Quando o servidor indica bloqueio ANTES de aceitar as fichas,
      // a pendencia nao precisa permanecer gravada.
      if (["DOACOES_BLOQUEADAS","TROCO_BLOQUEADO"].includes(resposta.status)) {
        localStorage.removeItem(QC_pendenteChave271());
      }
      throw Error(resposta.mensagem||(
        resposta.status==="DOACOES_BLOQUEADAS"||resposta.status==="TROCO_BLOQUEADO" ?
        "Doacoes ainda nao habilitadas pelo tesoureiro." :
        "Operacao pendente: "+resposta.status+". Nao a repita como nova."));
    }
    if (operacao.tipo==="COM_TROCO") {
      await QC_concluirTroco271(operacao,resposta,senha);
    }
    localStorage.removeItem(QC_pendenteChave271());
    memoria=null;
    renderizar();
    // Senha ja validada nesta sessao: atualizar sem exibir outro formulario.
    conferir.click();
    return {status:"OK",valorDoacao:operacao.valorDoacao,valorTroco:operacao.valorTroco};
  }
  // PASSO 301 - Fichas preparadas ANTES de a sacola passar.
  // Primeiro prepara e cifra sem enviar gasto ao servidor.
  // A leitura do QR Code da sacola aciona QC_retomar271 UMA UNICA VEZ
  // por idOperacao. Se a rede falhar, retomar reaproveita o mesmo ID.
  const CODIGO_SACOLA301 = "QUINTOSCOIN|SACOLA|V1|f1b1e87e-6fb6-4b41-b5f9-547d458d3ed1";

  function QC_hojeBrasil301() {
    const partes = new Intl.DateTimeFormat("en-US", {
      timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit",day:"2-digit"
    }).formatToParts(new Date());
    const campo = nome => partes.find(x=>x.type===nome)?.value;
    return campo("year")+"-"+campo("month")+"-"+campo("day");
  }

  async function QC_lerPendenteQR301(segredo) {
    const bruto=localStorage.getItem(QC_pendenteChave271());
    if (!bruto) return null;
    let op;
    try {op=await abrir(JSON.parse(bruto),segredo);} catch(err) {
      throw Error("Há uma doação anterior protegida que não foi possível abrir. Preserve os dados deste aparelho.");
    }
    if (op?.versao!==1 || !op.idOperacao ||
        !Array.isArray(op.fichasEntrada) || !["EXATA","COM_TROCO"].includes(op.tipo)) {
      throw Error("Doação anterior inconsistente. Preserve os dados locais.");
    }
    return op;
  }

  function QC_conferirSessaoQR301(inicio) {
    const agora=dadosDaSessao();
    if (agora.id!==inicio.id || agora.token!==inicio.token) {
      throw Error("A carteira mudou. Entre novamente antes de doar.");
    }
  }


  // PASSO 368 - DOACAO V2: mesma camera/QR publico, pendencia separada de V1.
  // O codigo nao libera doacao: preflight no servidor exige corte V1, abertura V2
  // e QC_V2_QR_PREPARO_ATIVO=SIM. No piloto essas condicoes NAO existem.
  const QC_PENDENTE_V2_368 = 'QC_DOACAO_PENDENTE_V2_';
  const QC_VALORES_V2_368 = Object.freeze([1,2,5,10,50]);
  const QC_UUID_368 = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
  const QC_HEX_1024_368 = /^[0-9a-f]{1024}$/i;
  const QC_CHAVE_LOCAL_V2_368 = id => 'QC_FICHAS_ASSINADAS_V2_'+id;
  function QC_chavePendenteV2368() {
    return QC_PENDENTE_V2_368 + dadosDaSessao().id;
  }
  async function QC_lerPendenteV2368(segredo) {
    const bruto = localStorage.getItem(QC_chavePendenteV2368());
    if (!bruto) return null;
    let op;
    try { op=await abrir(JSON.parse(bruto),segredo); }
    catch (_) { throw Error('Doacao V2 pendente nao pode ser aberta. Preserve o backup local.'); }
    if (!op || op.versao!==2 || !QC_UUID_368.test(op.idOperacao||'') ||
        !['EXATA','COM_TROCO'].includes(op.tipo) ||
        !Number.isSafeInteger(op.valorDoacao) || op.valorDoacao < 1 ||
        !Number.isSafeInteger(op.valorTroco) || op.valorTroco < 0 ||
        !['PREPARADA','ACIONADA'].includes(op.etapaQR301) ||
        !/^\d{4}-\d{2}-\d{2}$/.test(op.diaQR301||'') ||
        !Array.isArray(op.fichasEntrada) || op.fichasEntrada.length < 1 ||
        op.fichasEntrada.length > 20 || !Array.isArray(op.saidasCegas) ||
        op.saidasCegas.length > 20 || !Array.isArray(op.privadas) ||
        op.saidasCegas.length !== op.privadas.length ||
        (op.tipo==='EXATA') !== (op.saidasCegas.length===0)) {
      throw Error('Doacao V2 protegida inconsistente. Preserve os dados.');
    }
    return op;
  }

  async function QC_publicasV2368() {
    // Rota publica e anonima: o token de login nunca sai junto ao preparo.
    const r=await QC_postAnonimo271('qc_publicas_anonimas_v2',{});
    if (r.status!=='OK' || r.versao!=='V2' ||
        !Array.isArray(r.chaves) || r.chaves.length!==5) {
      throw Error('Chaves publicas V2 indisponiveis.');
    }
    const publicas=new Map();
    for (const chave of r.chaves) {
      const valor=Number(chave?.denominacao);
      const nHex=String(chave?.moduloHex||'').trim().toLowerCase();
      const eHex=String(chave?.expoenteHex||'').trim().toLowerCase();
      if (!QC_VALORES_V2_368.includes(valor) || publicas.has(valor) ||
          chave.idChave!=='QC-'+valor+'-V2' ||
          !/^[89a-f][0-9a-f]{1023}$/.test(nHex) ||
          !/^0*10001$/.test(eHex)) {
        throw Error('Cadastro de chave V2 divergente.');
      }
      const eBytes=deHex(eHex.length%2?'0'+eHex:eHex);
      const verify=await crypto.subtle.importKey('jwk',{
        kty:'RSA',n:base64url(deHex(nHex)),e:base64url(eBytes),
        ext:true,key_ops:['verify']
      },{name:'RSA-PSS',hash:'SHA-384'},false,['verify']);
      publicas.set(valor,{idChave:chave.idChave,verify,
        n:BigInt('0x'+nHex),e:BigInt('0x'+eHex)});
    }
    if (publicas.size!==5) throw Error('Faltam chaves publicas V2.');
    return publicas;
  }

  async function QC_prepararTrocoV2368(valores,publicas) {
    const saidasCegas=[],privadas=[];
    for (const valor of valores) {
      const p=publicas.get(valor);
      if (!p) throw Error('Chave de troco V2 nao encontrada.');
      const idChave='QC-'+valor+'-V2';
      const msg=QC_juntar271(crypto.getRandomValues(new Uint8Array(32)),
        enc.encode('QUINTOSCOIN|V2|'+valor+'|'+idChave+'|'+crypto.randomUUID()));
      const codificado=await QC_pss271(msg);
      const m=QC_num271(codificado);
      if (m<=BIG_ZERO271 || m>=p.n || QC_mdc271(m,p.n)!==BIG_UM271) {
        throw Error('Codificacao criptografica V2 invalida.');
      }
      const fator=QC_fator271(p.n);
      const bloco=m*QC_modpow271(fator,p.e,p.n)%p.n;
      if (bloco<=BIG_ZERO271 || bloco>=p.n) throw Error('Cegamento V2 invalido.');
      saidasCegas.push({denominacao:valor,blocoHex:QC_hex271(QC_fixos271(bloco))});
      privadas.push({indice:saidasCegas.length,valor,idChave,
        mensagemHex:QC_hex271(msg),
        inversoHex:QC_hex271(QC_fixos271(QC_inverso271(fator,p.n)))});
    }
    return {saidasCegas,privadas};
  }

  async function QC_consultarSelecionadasV2368(fichas) {
    for (let i=0;i<fichas.length;i+=20) {
      const parte=fichas.slice(i,i+20);
      const r=await QC_postAnonimo271('qc_consultar_gastos_v2_lote',{
        fichas:parte.map(f=>({mensagemHex:f.mensagemHex,
          assinaturaHex:f.assinaturaHex}))
      });
      if (r.status!=='OK' || r.versao!=='V2' ||
          !Array.isArray(r.resultados) || r.resultados.length!==parte.length ||
          r.resultados.some((st,j)=>st.status!=='DISPONIVEL' ||
            st.valor!==parte[j].valor)) {
        throw Error('Uma ficha V2 nao esta disponivel. Atualize o saldo.');
      }
    }
  }

  async function QC_prepararQRV2368(valor,segredo,inicio) {
    const atual=memoriaV2365;
    if (!atual || atual.id!==inicio.id || atual.token!==inicio.token ||
        !Array.isArray(atual.fichas) || !atual.fichas.length ||
        localStorage.getItem(QC_CHAVE_LOCAL_V2_368(inicio.id))!==atual.origem) {
      throw Error('Nenhuma ficha disponivel para essa doacao.');
    }
    const plano=QC_planejarComposicaoV2366(atual.fichas.map(f=>f.valor),valor);
    if (plano.status!=='OK') throw Error(plano.mensagem||plano.status);
    if (plano.indicesSelecionados.length>20 || plano.fichasTroco.length>20) {
      throw Error('Esta combinacao exige mais de 20 fichas. Escolha outro valor ou reorganize as fichas.');
    }
    // Fail closed: o servidor precisa aprovar o preparo ANTES de mostrar a camera.
    const pre=await QC_postAnonimo271('qc_preparar_doacao_v2',{
      tipo:plano.tipo,quantidadeEntradas:plano.indicesSelecionados.length,
      quantidadeTroco:plano.fichasTroco.length
    });
    if (pre.status === 'SEM_SESSAO_V2') {
      throw Error('Não existe sessão aberta para hoje. A doação não foi preparada.');
    }
    if (pre.status!=='PRONTA' || pre.versao!=='V2' || !pre.idSessao ||
        !/^\d{4}-\d{2}-\d{2}$/.test(String(pre.dia||''))) {
      throw Error('Doações V2 ainda bloqueadas. Nenhuma ficha foi movimentada.');
    }
    if (pre.dia!==QC_hojeBrasil301()) {
      throw Error('Sessao V2 nao corresponde ao dia atual.');
    }
    const escolhidas=plano.indicesSelecionados.map(i=>atual.fichas[i]);
    // Uma nova verificacao do servidor protege contra gastos em outro aparelho.
    await QC_consultarSelecionadasV2368(escolhidas);
    const publicas=plano.valorTroco
      ?await QC_publicasV2368():null;
    const troco=plano.valorTroco
      ?await QC_prepararTrocoV2368(plano.fichasTroco,publicas)
      :{saidasCegas:[],privadas:[]};
    QC_conferirSessaoQR301(inicio);
    if (localStorage.getItem(QC_CHAVE_LOCAL_V2_368(inicio.id))!==atual.origem) {
      throw Error('Carteira V2 mudou durante o preparo.');
    }
    const op={versao:2,idOperacao:crypto.randomUUID().toLowerCase(),
      tipo:plano.tipo,valorDoacao:plano.valorSolicitado,
      valorTroco:plano.valorTroco,
      fichasEntrada:escolhidas.map(f=>({
        mensagemHex:f.mensagemHex,assinaturaHex:f.assinaturaHex})),
      saidasCegas:troco.saidasCegas,privadas:troco.privadas,
      diaQR301:String(pre.dia),idSessaoQR301:String(pre.idSessao),
      etapaQR301:'PREPARADA'};
    const cifrada=await QC_cifrar271(op,segredo);
    QC_conferirSessaoQR301(inicio);
    if (localStorage.getItem(QC_chavePendenteV2368()) ||
        localStorage.getItem(QC_pendenteChave271())) {
      throw Error('Existe outra doacao preparada. Nao crie uma nova.');
    }
    localStorage.setItem(QC_chavePendenteV2368(),JSON.stringify(cifrada));
    memorizarSenha265(segredo,inicio);
    return {status:'PREPARADA'};
  }

  async function QC_finalizarTrocoV2368(op,resposta,segredo,inicio) {
    if (resposta.status!=='TROCO_ASSINADO' || resposta.versao!=='V2' ||
        resposta.idTroca!==op.idOperacao ||
        Number(resposta.valorDoacao)!==op.valorDoacao ||
        Number(resposta.valorTroco)!==op.valorTroco ||
        !Array.isArray(resposta.assinaturasCegas) ||
        resposta.assinaturasCegas.length!==op.privadas.length) {
      throw Error('Troco V2 ainda nao foi confirmado pelo servidor.');
    }
    const publicas=await QC_publicasV2368();
    const novas=[];
    for (const privada of op.privadas) {
      const a=resposta.assinaturasCegas.find(s=>Number(s.indice)===privada.indice);
      if (!a || Number(a.denominacao)!==privada.valor ||
          a.idChave!==privada.idChave ||
          !QC_HEX_1024_368.test(a.assinaturaCegaHex||'')) {
        throw Error('Assinatura de troco V2 divergente. Operacao preservada.');
      }
      const p=publicas.get(privada.valor);
      const cega=BigInt('0x'+a.assinaturaCegaHex);
      const inverso=BigInt('0x'+privada.inversoHex);
      if (cega<=BIG_ZERO271 || cega>=p.n || inverso<=BIG_ZERO271 || inverso>=p.n) {
        throw Error('Assinatura de troco V2 fora do dominio.');
      }
      const assinaturaHex=QC_hex271(QC_fixos271(cega*inverso%p.n));
      if (!(await crypto.subtle.verify({name:'RSA-PSS',saltLength:48},p.verify,
        deHex(assinaturaHex),deHex(privada.mensagemHex)))) {
        throw Error('Troco V2 invalido. Operacao preservada.');
      }
      novas.push({chave:'QC-TR-V2-'+op.idOperacao+'-'+privada.indice,
        ficha:{formato:'QC_FICHA_ASSINADA_V2',idChave:privada.idChave,
          valor:privada.valor,mensagemHex:privada.mensagemHex,assinaturaHex}});
    }
    const cifradas=[];
    for (const n of novas) {
      cifradas.push({chave:n.chave,registro:await QC_cifrar271(n.ficha,segredo)});
    }
    const chave=QC_CHAVE_LOCAL_V2_368(inicio.id);
    const antigoTexto=localStorage.getItem(chave);
    const registros=antigoTexto?JSON.parse(antigoTexto):{};
    if (!registros || typeof registros!=='object' || Array.isArray(registros)) {
      throw Error('Armazenamento de fichas V2 invalido.');
    }
    for (const n of cifradas) {
      if (Object.prototype.hasOwnProperty.call(registros,n.chave)) {
        const ja=await abrir(registros[n.chave],segredo);
        const esperada=novas.find(x=>x.chave===n.chave).ficha;
        if (ja.mensagemHex!==esperada.mensagemHex ||
            ja.assinaturaHex!==esperada.assinaturaHex) {
          throw Error('Troco V2 divergente da gravacao anterior.');
        }
      } else registros[n.chave]=n.registro;
    }
    QC_conferirSessaoQR301(inicio);
    if (localStorage.getItem(chave)!==antigoTexto) {
      throw Error('Carteira V2 mudou durante a gravacao do troco.');
    }
    localStorage.setItem(chave,JSON.stringify(registros));
  }

  async function QC_retomarV2368(op,segredo,inicio) {
    if (op.etapaQR301!=='ACIONADA') {
      throw Error('A sacola ainda nao foi lida. Nenhuma doacao enviada.');
    }
    // NENHUM token, nome, id de carteira ou senha vai para a rota anonima.
    const resposta=await QC_postAnonimo271('qc_doar_v2',{
      idOperacao:op.idOperacao,valorDoacao:op.valorDoacao,
      fichasEntrada:op.fichasEntrada,saidasCegas:op.saidasCegas
    });
    const confirmada=op.tipo==='EXATA'
      ? resposta.status==='DOACAO_REGISTRADA' && resposta.versao==='V2' &&
        resposta.idOperacao===op.idOperacao && Number(resposta.valor)===op.valorDoacao
      : resposta.status==='TROCO_ASSINADO' && resposta.versao==='V2' &&
        resposta.idTroca===op.idOperacao;
    if (!confirmada) {
      throw Error('Operacao V2 nao confirmada ('+
        String(resposta.status||'SEM_RESPOSTA')+'). Retome a mesma doacao.');
    }
    if (op.tipo==='COM_TROCO') {
      await QC_finalizarTrocoV2368(op,resposta,segredo,inicio);
    }
    QC_conferirSessaoQR301(inicio);
    localStorage.removeItem(QC_chavePendenteV2368());
    memoriaV2365=null;
    QC_conferirV2365(inicio.id,inicio.token,segredo).catch(()=>{});
    return {status:'OK'};
  }

  window.QC_estadoDoacaoQR301=async function() {
    const inicio=dadosDaSessao();
    if (!inicio.id||!inicio.token) throw Error("Entre na carteira.");
    const pendente=localStorage.getItem(QC_chavePendenteV2368());
    if (!pendente) return {status:"NENHUMA"};
    const segredo=await obterSenha265();
    if (!segredo) return {status:"CANCELADO"};
    const op=await QC_lerPendenteV2368(segredo);
    return {status:op.etapaQR301==="PREPARADA"?"PREPARADA":"ACIONADA"};
  };

  window.QC_prepararDoacaoQR301=async function(valor) {
    const inicioPreparacao343=performance.now();
    if (movimentando271) throw Error("Outra operação de doação está em andamento.");
    movimentando271=true;
    try {
      const inicio=dadosDaSessao();
      if (!inicio.id || !inicio.token) throw Error("Entre na carteira antes de doar.");
      const segredo=await obterSenha265();
      if (!segredo) return {status:"CANCELADO"};
      if (localStorage.getItem(QC_chavePendenteV2368())) {
        const anterior=await QC_lerPendenteV2368(segredo);
        return {status:anterior.etapaQR301==="PREPARADA"?"PREPARADA":"ACIONADA"};
      }
      if (!Number.isSafeInteger(valor) || valor<1) {
        throw Error("Informe um valor inteiro de pelo menos 1 Qc$.");
      }
      // Passo 368: prepara APENAS com fichas V2. O servidor ainda bloqueia
      // o preparo no piloto, sem criar gastos, reservas nem saldo.
      return await QC_prepararQRV2368(valor,segredo,inicio);

      // LEGADO V1: mantido temporariamente para auditoria, nunca acessado
      // por uma nova preparacao apos o bloqueio V2 acima.
      const disponiveis=await QC_fichasAtuais271(segredo,valor);
      const plano=QC_planejarComposicao267(disponiveis.map(x=>x.valor),valor);
      if (plano.status!=="OK") throw Error(plano.mensagem||plano.status);
      // PASSO 344 — Latência: consulta da sessão e geração de troco cego
      // são operações INDEPENDENTES e não movimentam fichas. Paralelizar
      // não altera a assinatura, o gasto ou a recuperação idempotente.
      // Ambas devem concluir ANTES de qualquer gravação da doação preparada.
      const inicioEtapa344=performance.now();
      const [pre,trocoLocal344]=await Promise.all([
        QC_postAnonimo271("qc_preparar_doacao_qr301",{
          tipo:plano.tipo,quantidadeEntradas:plano.indicesSelecionados.length,
          quantidadeTroco:plano.fichasTroco.length
        }),
        plano.valorTroco ? QC_prepararTroco271(plano) : Promise.resolve(null)
      ]);
      console.info("QC_PERF344 sessão+troco em paralelo: "+
        Math.round(performance.now()-inicioEtapa344)+" ms");
      if (pre.status!=="PRONTA" || !pre.idSessao ||
          !/^\d{4}-\d{2}-\d{2}$/.test(String(pre.dia||""))) {
        throw Error(pre.mensagem||"A arrecadação ainda não está disponível.");
      }
      if (pre.dia!==QC_hojeBrasil301()) {
        throw Error("A data da sessão não confere com a data deste aparelho.");
      }
      QC_conferirSessaoQR301(inicio);
      const entradas=plano.indicesSelecionados.map(i=>{
        const f=disponiveis[i];
        return {mensagemHex:f.mensagemHex,assinaturaHex:f.assinaturaHex};
      });
      const op={versao:1,idOperacao:crypto.randomUUID().toLowerCase(),
        tipo:plano.tipo,valorDoacao:plano.valorSolicitado,
        valorTroco:plano.valorTroco,fichasEntrada:entradas,
        saidasCegas:[],privadas:[],etapaQR301:"PREPARADA",
        idSessaoQR301:String(pre.idSessao),diaQR301:String(pre.dia)};
      if (plano.valorTroco) {
        if (!trocoLocal344 || !Array.isArray(trocoLocal344.saidasCegas) ||
            !Array.isArray(trocoLocal344.privadas)) {
          throw Error("O troco protegido não ficou pronto. Nenhuma doação foi gravada.");
        }
        op.saidasCegas=trocoLocal344.saidasCegas;
        op.privadas=trocoLocal344.privadas;
      }
      const cifrado=await QC_cifrar271(op,segredo);
      QC_conferirSessaoQR301(inicio);
      if (localStorage.getItem(QC_pendenteChave271())) {
        throw Error("Já existe outra doação protegida. Não crie outra.");
      }
      // Esta gravação NAO movimenta nenhuma ficha nem altera saldo.
      localStorage.setItem(QC_pendenteChave271(),JSON.stringify(cifrado));
      memorizarSenha265(segredo,inicio);
      console.info("QC_PERF343 preparacao concluída em "+
        Math.round(performance.now()-inicioPreparacao343)+" ms");
      return {status:"PREPARADA"};
    } finally {movimentando271=false;}
  };

  window.QC_cancelarDoacaoQR301=async function() {
    if (movimentando271) throw Error('Ha uma doacao em andamento.');
    movimentando271=true;
    try {
      const segredo=await obterSenha265();
      if (!segredo) return {status:'CANCELADO'};
      const op=await QC_lerPendenteV2368(segredo);
      if (!op) return {status:'NENHUMA'};
      if (op.etapaQR301!=='PREPARADA')
        throw Error('A leitura ja acionou a doacao. Use Recuperar operacao.');
      localStorage.removeItem(QC_chavePendenteV2368());
      return {status:'CANCELADA'};
    } finally {movimentando271=false;}
  };

  window.QC_efetivarDoacaoQR301=async function(codigoLido) {
    if (String(codigoLido)!==CODIGO_SACOLA301)
      throw Error('O QR Code lido nao e o da sacola.');
    if (movimentando271) throw Error('Doacao ja em processamento.');
    movimentando271=true;
    try {
      const inicio=dadosDaSessao();
      if (!inicio.id||!inicio.token) throw Error('Entre na carteira novamente.');
      const segredo=await obterSenha265();
      if (!segredo) return {status:'CANCELADO'};
      const op=await QC_lerPendenteV2368(segredo);
      if (!op) throw Error('Nao existe doacao preparada neste aparelho.');
      if (op.etapaQR301!=='PREPARADA')
        throw Error('A doacao ja foi acionada. Retome a mesma operacao.');
      if (op.diaQR301!==QC_hojeBrasil301())
        throw Error('Preparo de outro dia. Cancele e prepare novamente.');
      QC_conferirSessaoQR301(inicio);
      op.etapaQR301='ACIONADA';
      const cifrada=await QC_cifrar271(op,segredo);
      QC_conferirSessaoQR301(inicio);
      localStorage.setItem(QC_chavePendenteV2368(),JSON.stringify(cifrada));
      memorizarSenha265(segredo,inicio);
      return await QC_retomarV2368(op,segredo,inicio);
    } finally {movimentando271=false;}
  };

  window.QC_recuperarDoacaoQR301=async function() {
    if (movimentando271) throw Error('Outra doacao esta em andamento.');
    movimentando271=true;
    try {
      const inicio=dadosDaSessao();
      if (!inicio.id||!inicio.token) throw Error('Entre na carteira novamente.');
      const segredo=await obterSenha265();
      if (!segredo) return {status:'CANCELADO'};
      const op=await QC_lerPendenteV2368(segredo);
      if (!op) return {status:'NENHUMA'};
      if (op.etapaQR301==='PREPARADA')
        throw Error('A sacola ainda nao foi lida. Nenhuma doacao foi enviada.');
      return await QC_retomarV2368(op,segredo,inicio);
    } finally {movimentando271=false;}
  };

  // PASSO 275 - TRANSFERIR / RECEBER POR CODIGO PORTADOR.
  // As fichas sao invalidadas na origem pelo servidor; o destinatario
  // recebe novas fichas com assinatura cega e seus proprios numeros aleatorios.
  // Nenhum identificador de carteira ou tokenSessao segue nestes POSTs.
  const CHAVE_TX275 = "QC_TRANSFERENCIA_ENVIO_V1_";
  const CHAVE_RX275 = "QC_TRANSFERENCIA_RESGATE_V1_";
  let transferindo275 = false;

  function QC_codificarTransferencia275(id, codigo) {
    return "QC1|" + id + "|" + codigo;
  }
  function QC_lerCodigo275(texto) {
    const partes = /^QC1\|([0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})\|([0-9a-f]{64})$/i
      .exec(String(texto || "").trim());
    if (!partes) {
      throw Error("Codigo invalido. Escaneie ou cole o codigo completo da transferencia.");
    }
    return {id:partes[1].toLowerCase(),codigo:partes[2].toLowerCase()};
  }
  function QC_chaveTX275() {return CHAVE_TX275 + dadosDaSessao().id;}
  function QC_chaveRX275() {return CHAVE_RX275 + dadosDaSessao().id;}
  async function QC_lerPendente275(chave, senha) {
    const raw = localStorage.getItem(chave);
    if (!raw) return null;
    const decifrado = await abrir(JSON.parse(raw), senha);
    if (!decifrado || decifrado.versao !== 1 ||
        !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(decifrado.idTransferencia || "") ||
        !/^[0-9a-f]{64}$/.test(decifrado.codigo || "")) {
      throw Error("Transferencia pendente inconsistente. Preserve os dados do navegador.");
    }
    return decifrado;
  }
  async function QC_salvarPendente275(chave, operacao, senha) {
    const antes = localStorage.getItem(chave);
    if (antes) throw Error("Ja existe operacao pendente neste celular. Retome primeiro.");
    const cifrado = await QC_cifrar271(operacao, senha);
    if (localStorage.getItem(chave)) throw Error("Outra operacao foi iniciada. Nao continuar.");
    localStorage.setItem(chave, JSON.stringify(cifrado));
  }
  async function QC_concluirAssinaturas275(idLocal, privadas, assinaturas,
                                           valorOriginal, valorTroco, senha) {
    if (!privadas.length) {
      if (!Array.isArray(assinaturas) || assinaturas.length) {
        throw Error("O servidor enviou troco inesperado.");
      }
      return;
    }
    // Reutiliza as comprovacoes criptograficas e o salvamento idempotente
    // implementados no Passo 271. Prefixos TX/RX impedem colisao local.
    await QC_concluirTroco271(
      {idOperacao:idLocal, valorDoacao:valorOriginal,
       valorTroco:valorTroco, privadas:privadas},
      {status:"TROCO_ASSINADO", idTroca:idLocal,
       valorDoacao:valorOriginal, valorTroco:valorTroco,
       assinaturasCegas:assinaturas},
      senha
    );
  }
  // PASSO 286: envio parcelado usa as rotas 284/285, uma ficha por assinatura.
  // O mesmo material cifrado local e reutilizado em qualquer retomada.
  async function QC_retomarEnvioEmLotes286(op, senha) {
    const base={idOperacao:op.idTransferencia,codigo:op.codigo};
    const abrir=await QC_postAnonimo271("qc_mov_lote_abrir",{
      ...base,tipo:"TRANSFERENCIA",valorSolicitado:op.valorEnviado,
      quantidadeEntradas:op.fichasEntrada.length,
      quantidadeTroco:op.saidasCegas.length
    });
    let etapa=abrir.status;
    if (etapa==="RECEBENDO") {
      for (const [fase,lista] of [["ENTRADA",op.fichasEntrada],
                                  ["TROCO",op.saidasCegas]]) {
        for (let pos=0;pos<lista.length;pos+=20) {
          const parte=await QC_postAnonimo271("qc_mov_lote_parte",{
            ...base,etapa:fase,indiceInicial:pos+1,
            fichas:lista.slice(pos,pos+20)
          });
          if (parte.status!=="RECEBENDO") {
            throw Error(parte.mensagem||"Envio de parcela nao confirmado: "+parte.status);
          }
        }
      }
      const pronto=await QC_postAnonimo271("qc_mov_lote_pronto",base);
      etapa=pronto.status;
    }
    if (!["PRONTO","PROCESSANDO","CONCLUIDO"].includes(etapa)) {
      throw Error(abrir.mensagem||"Envio parcelado pendente: "+etapa);
    }
    const assinaturas=[];
    for (let i=1;i<=op.saidasCegas.length;i++) {
      const r=await QC_postAnonimo271("qc_mov_lote_assinar",{
        ...base,etapa:"TROCO",indice:i
      });
      if (r.status!=="ASSINADO" || !Array.isArray(r.assinaturasCegas) ||
          r.assinaturasCegas.length!==1 ||
          Number(r.assinaturasCegas[0].indice)!==i) {
        throw Error(r.mensagem||"Assinatura do troco pendente: "+r.status);
      }
      assinaturas.push(r.assinaturasCegas[0]);
    }
    const fim=await QC_postAnonimo271("qc_mov_lote_concluir",{
      ...base,etapa:"TROCO"
    });
    if (fim.status!=="TRANSFERENCIA_PRONTA" ||
        fim.idOperacao!==op.idTransferencia ||
        Number(fim.valor)!==op.valorEnviado) {
      throw Error(fim.mensagem||"Transferencia em preparacao: "+fim.status);
    }
    await QC_concluirAssinaturas275("TX-"+op.idTransferencia,
      op.privadasTroco,assinaturas,op.valorEnviado,op.valorTroco,senha);
    memoria=null;renderizar();
    return {status:"PRONTA",idTransferencia:op.idTransferencia,
      valorEnviado:op.valorEnviado,
      codigoQR:QC_codificarTransferencia275(op.idTransferencia,op.codigo)};
  }

  async function QC_retomarEnvio275(op, senha) {
    if (op.metodo === "LOTE285") {
      return await QC_retomarEnvioEmLotes286(op, senha);
    }
    const resp = await QC_postAnonimo271("qc_transferir_criar", {
      idTransferencia:op.idTransferencia,
      codigo:op.codigo,
      valorEnviado:op.valorEnviado,
      fichasEntrada:op.fichasEntrada,
      trocoCego:op.saidasCegas
    });
    if (resp.status !== "TRANSFERENCIA_PRONTA") {
      throw Error(resp.mensagem ||
        (resp.status === "TRANSFERENCIAS_BLOQUEADAS" ?
         "Transferencias ainda nao liberadas pelo tesoureiro." :
         "Transferencia pendente: " + resp.status + ". Retome a mesma operacao."));
    }
    if (resp.idTransferencia !== op.idTransferencia ||
        Number(resp.valorEnviado) !== op.valorEnviado ||
        Number(resp.valorTroco) !== op.valorTroco) {
      throw Error("Confirmacao do servidor diverge. Nao compartilhe o codigo.");
    }
    await QC_concluirAssinaturas275("TX-"+op.idTransferencia,
      op.privadasTroco, resp.assinaturasTroco,
      op.valorEnviado, op.valorTroco, senha);
    memoria = null;
    renderizar();
    return {
      status:"PRONTA", idTransferencia:op.idTransferencia,
      valorEnviado:op.valorEnviado,
      codigoQR:QC_codificarTransferencia275(op.idTransferencia,op.codigo)
    };
  }
  window.QC_transferenciaPendente275 = function() {
    const {id} = dadosDaSessao();
    return !!id && !!localStorage.getItem(CHAVE_TX275+id);
  };
  window.QC_resgatePendente275 = function() {
    const {id} = dadosDaSessao();
    return !!id && !!localStorage.getItem(CHAVE_RX275+id);
  };
function QC_confirmarTransferencia332(opcoes) {
  return new Promise((resolver) => {
    if (document.getElementById("qcConfirmacaoTransferencia332")) {
      resolver(false);
      return;
    }
    const focoAnterior = document.activeElement;
    const fundo = document.createElement("div");
    fundo.id = "qcConfirmacaoTransferencia332";
    fundo.className = "qc-modal-overlay";
    fundo.style.display = "flex";
    fundo.style.zIndex = "10002";
    const cartao = document.createElement("div");
    cartao.className = "qc-modal-card";
    cartao.setAttribute("role", "dialog");
    cartao.setAttribute("aria-modal", "true");
    cartao.setAttribute("aria-labelledby", "qcTituloConfirmacao332");
    cartao.style.maxHeight = "90vh";
    cartao.style.overflowY = "auto";

    const cab = document.createElement("div");
    cab.className = "qc-modal-topo";
    const titulo = document.createElement("h3");
    titulo.id = "qcTituloConfirmacao332";
    titulo.textContent = opcoes.titulo || "Confirmar operação";
    cab.appendChild(titulo);
    cartao.appendChild(cab);

    const valor = document.createElement("div");
    valor.textContent = opcoes.destaque || "";
    valor.style.cssText = "text-align:center;color:#e7c76a;" +
      "font-size:26px;font-weight:750;margin:12px 0 17px";
    cartao.appendChild(valor);

    for (const frase of opcoes.linhas || []) {
      const texto = document.createElement("p");
      texto.className = "qc-modal-texto";
      texto.textContent = frase;
      texto.style.marginBottom = "11px";
      cartao.appendChild(texto);
    }

    const acoes = document.createElement("div");
    acoes.className = "qc-modal-botoes";
    acoes.style.marginTop = "18px";
    const confirmar = document.createElement("button");
    confirmar.type = "button";
    confirmar.className = "qc-btn-modal-principal";
    confirmar.textContent = opcoes.rotulo || "Confirmar";
    const cancelar = document.createElement("button");
    cancelar.type = "button";
    cancelar.className = "qc-btn-modal-secundario";
    cancelar.textContent = "Cancelar";
    acoes.append(confirmar, cancelar);
    cartao.appendChild(acoes);
    fundo.appendChild(cartao);

    let terminou = false;
    function sair(aceito) {
      if (terminou) return;
      terminou = true;
      document.removeEventListener("keydown", teclado, true);
      fundo.remove();
      if (focoAnterior && focoAnterior.isConnected &&
          typeof focoAnterior.focus === "function") focoAnterior.focus();
      resolver(aceito);
    }
    function teclado(evento) {
      if (evento.key === "Escape") {
        evento.preventDefault();
        sair(false);
      }
    }
    cancelar.addEventListener("click", () => sair(false));
    confirmar.addEventListener("click", () => sair(true));
    fundo.addEventListener("click", evento => {
      if (evento.target === fundo) sair(false);
    });
    document.addEventListener("keydown", teclado, true);
    document.body.appendChild(fundo);
    confirmar.focus();
  });
}

    window.QC_transferirCriar275 = async function(valorSolicitado) {
    if (transferindo275) throw Error("Ja existe operacao de transferencia em andamento.");
    transferindo275 = true;
    try {
      const inicio = dadosDaSessao();
      if (!inicio.id || !inicio.token) throw Error("Entre na sua carteira primeiro.");
      const senha = await obterSenha265();
      if (!senha) return {status:"CANCELADO"};
      memorizarSenha265(senha,inicio);
      const chave = QC_chaveTX275();
      const pendente = await QC_lerPendente275(chave,senha);
      if (pendente) {
        // Nunca gerar novos blocos cegos para a mesma transferencia.
        return await QC_retomarEnvio275(pendente,senha);
      }
      const valor = Number(valorSolicitado);
      if (!Number.isSafeInteger(valor) || valor < 2 || valor === 3) {
        throw Error("Informe valor inteiro a partir de 2 QC, exceto 3 QC.");
      }
      const disponiveis = await QC_fichasAtuais271(senha);
      const plano = QC_planejarComposicao267(disponiveis.map(f=>f.valor),valor);
      if (plano.status !== "OK") throw Error(plano.mensagem || plano.status);
      const confirmou332 = await QC_confirmarTransferencia332({
        titulo: "Confirmar transferência",
        destaque: "Qc$ " + valor.toLocaleString("pt-BR", {
          minimumFractionDigits: 2, maximumFractionDigits: 2
        }),
        linhas: [
          "Fichas utilizadas: " + plano.valoresSelecionados.join(" + ") + " Qc$.",
          plano.valorTroco
            ? "Troco automático: " + plano.valorTroco + " Qc$."
            : "Não será necessário troco.",
          "Depois compartilhe o QR Code somente com o destinatário."
        ],
        rotulo: "Confirmar transferência"
      });
      if (!confirmou332) return {status:"CANCELADO"};
      const atual = dadosDaSessao();
      if (atual.id !== inicio.id || atual.token !== inicio.token) {
        throw Error("Sessao alterada. Transferencia nao iniciada.");
      }
      const troco = await QC_prepararTroco271(plano);
      const op = {
        versao:1, idTransferencia:crypto.randomUUID().toLowerCase(),
        codigo:QC_hex271(crypto.getRandomValues(new Uint8Array(32))),
        valorEnviado:valor, valorTroco:plano.valorTroco,
        metodo:(plano.indicesSelecionados.length>50 ||
          troco.saidasCegas.length>50) ? "LOTE285" : "DIRETO273",
        fichasEntrada:plano.indicesSelecionados.map(i=>({
          mensagemHex:disponiveis[i].mensagemHex,
          assinaturaHex:disponiveis[i].assinaturaHex
        })),
        saidasCegas:troco.saidasCegas,
        privadasTroco:troco.privadas
      };
      // Guardar material e codigo cifrados ANTES do primeiro POST.
      await QC_salvarPendente275(chave,op,senha);
      return await QC_retomarEnvio275(op,senha);
    } finally {
      transferindo275=false;
    }
  };
  window.QC_transferirConsultar275 = async function() {
    const {id,token}=dadosDaSessao();
    if (!id || !token) throw Error("Entre na carteira primeiro.");
    const senha=await obterSenha265();
    if (!senha) return {status:"CANCELADO"};
    const op=await QC_lerPendente275(QC_chaveTX275(),senha);
    if (!op) return {status:"NENHUMA_PENDENTE"};
    const resp=await QC_postAnonimo271("qc_transferir_consultar",{
      idTransferencia:op.idTransferencia,codigo:op.codigo
    });
    if (resp.status==="CONCLUIDA") {
      // Ja foi recebido por outro aparelho. O troco do remetente deve
      // existir localmente antes de liberar o envio de outra transferencia.
      await QC_retomarEnvio275(op,senha);
      localStorage.removeItem(QC_chaveTX275());
      return {status:"CONCLUIDA",valorEnviado:op.valorEnviado};
    }
    return {status:resp.status,valorEnviado:op.valorEnviado,
      codigoQR:QC_codificarTransferencia275(op.idTransferencia,op.codigo)};
  };
  // PASSO 286: recebimento em lotes. Nunca regerar blocos cegos
  // quando o pedido ja estiver salvo e criptografado neste aparelho.
  async function QC_retomarRecebimentoEmLotes286(op,senha) {
    const base={idTransferencia:op.idTransferencia,codigo:op.codigo};
    const iniciar=await QC_postAnonimo271("qc_transf_rx_abrir",{
      ...base,quantidade:op.saidasCegas.length
    });
    let estado=iniciar.status;
    if (estado==="RECEBENDO") {
      for (let pos=0;pos<op.saidasCegas.length;pos+=20) {
        const parte=await QC_postAnonimo271("qc_transf_rx_parte",{
          ...base,indiceInicial:pos+1,
          saidas:op.saidasCegas.slice(pos,pos+20)
        });
        if (parte.status!=="RECEBENDO") {
          throw Error(parte.mensagem||"Parcela nao registrada: "+parte.status);
        }
      }
      const pronto=await QC_postAnonimo271("qc_transf_rx_pronto",base);
      estado=pronto.status;
    }
    if (!["PRONTO","ASSINANDO","CONCLUIDO"].includes(estado)) {
      throw Error(iniciar.mensagem||"Recebimento parcelado pendente: "+estado);
    }
    const assinaturas=[];
    for (let i=1;i<=op.saidasCegas.length;i++) {
      const resp=await QC_postAnonimo271("qc_transf_rx_assinar",{
        ...base,indice:i
      });
      const a=resp.assinatura;
      if (resp.status!=="ASSINADO" || !a ||
          Number(a.indice)!==i || !/^[0-9a-f]{1024}$/i.test(
            String(a.assinaturaCegaHex||""))) {
        throw Error(resp.mensagem||"Assinatura de recebimento pendente: "+resp.status);
      }
      assinaturas.push(a);
    }
    const concluido=await QC_postAnonimo271("qc_transf_rx_concluir",base);
    if (concluido.status!=="TRANSFERENCIA_RESGATADA" ||
        concluido.idTransferencia!==op.idTransferencia ||
        Number(concluido.valorRecebido)!==op.valorRecebido) {
      throw Error(concluido.mensagem||"Recebimento pendente: "+concluido.status);
    }
    await QC_concluirAssinaturas275("RX-"+op.idTransferencia,
      op.privadas,assinaturas,0,op.valorRecebido,senha);
    localStorage.removeItem(QC_chaveRX275());
    memoria=null;renderizar();
    return {status:"RECEBIDA",valorRecebido:op.valorRecebido};
  }

  async function QC_retomarResgate275(op,senha) {
    if (op.metodo === "LOTE286") {
      return await QC_retomarRecebimentoEmLotes286(op,senha);
    }
    const resp=await QC_postAnonimo271("qc_transferir_resgatar",{
      idTransferencia:op.idTransferencia,
      codigo:op.codigo, saidasCegas:op.saidasCegas
    });
    if (resp.status !== "TRANSFERENCIA_RESGATADA") {
      throw Error(resp.mensagem ||
        (resp.status === "TRANSFERENCIAS_BLOQUEADAS" ?
         "Resgate ainda nao liberado." :
         "Resgate pendente: "+resp.status+". Retome esta operacao."));
    }
    if (resp.idTransferencia !== op.idTransferencia ||
        Number(resp.valorRecebido) !== op.valorRecebido) {
      throw Error("Servidor devolveu valor de resgate divergente.");
    }
    await QC_concluirAssinaturas275("RX-"+op.idTransferencia,
      op.privadas,resp.assinaturasCegas,0,op.valorRecebido,senha);
    localStorage.removeItem(QC_chaveRX275());
    memoria=null;
    renderizar();
    return {status:"RECEBIDA",valorRecebido:op.valorRecebido};
  }
  window.QC_transferirResgatar275 = async function(codigoColado) {
    if (transferindo275) throw Error("Ja existe operacao em andamento.");
    transferindo275=true;
    try {
      const inicio=dadosDaSessao();
      if (!inicio.id || !inicio.token) throw Error("Entre na sua carteira primeiro.");
      const senha=await obterSenha265();
      if (!senha) return {status:"CANCELADO"};
      memorizarSenha265(senha,inicio);
      const pendente=await QC_lerPendente275(QC_chaveRX275(),senha);
      if (pendente) {
        // Evita novo resgate com outros blocos caso tenha havido interrupcao.
        if (String(codigoColado||"").trim()) {
          const info=QC_lerCodigo275(codigoColado);
          if (pendente.idTransferencia!==info.id || pendente.codigo!==info.codigo) {
            throw Error("Outro resgate ja esta pendente. Retome-o primeiro.");
          }
        }
        return await QC_retomarResgate275(pendente,senha);
      }
      const info=QC_lerCodigo275(codigoColado);
      const consulta=await QC_postAnonimo271("qc_transferir_consultar",{
        idTransferencia:info.id,codigo:info.codigo
      });
      if (consulta.status!=="PRONTA") {
        throw Error(consulta.mensagem||(
          consulta.status==="CONCLUIDA" ? "Essa transferencia ja foi recebida." :
          "Transferencia indisponivel: "+consulta.status));
      }
      const valor=Number(consulta.valorEnviado);
      if (!Number.isSafeInteger(valor)||valor<2||valor===3) {
        throw Error("Valor recebido invalido.");
      }
      const valores=QC_decomporTroco267(valor);
      if (!valores) throw Error("Nao e possivel compor o recebimento.");
      const aceitou332 = await QC_confirmarTransferencia332({
        titulo: "Confirmar recebimento",
        destaque: "Qc$ " + valor.toLocaleString("pt-BR", {
          minimumFractionDigits: 2, maximumFractionDigits: 2
        }),
        linhas: [
          "Deseja receber esta transferência na carteira atual?",
          "O sistema conferirá os dados antes de registrar as fichas."
        ],
        rotulo: "Receber Qc$"
      });
      if (!aceitou332) return {status:"CANCELADO"};
      const preparadas=await QC_prepararTroco271({fichasTroco:valores});
      const op={versao:1,idTransferencia:info.id,codigo:info.codigo,
        metodo:preparadas.saidasCegas.length>50 ? "LOTE286" : "DIRETO273",
        valorRecebido:valor,saidasCegas:preparadas.saidasCegas,
        privadas:preparadas.privadas};
      await QC_salvarPendente275(QC_chaveRX275(),op,senha);
      return await QC_retomarResgate275(op,senha);
    } finally {
      transferindo275=false;
    }
  };


  // PASSO 278 - SOLICITACOES IDENTIFICADAS DE RESGATE DEFINITIVO.
  // Os blocos cegos, inversos e fichas ficam cifrados no aparelho ANTES
  // do envio. Apenas o resgate usa sessao de login; doacoes seguem anonimas.
  const PREFIXO_RESGATE278 = "QC_RESGATE_LOCAL_V1_";
  let ocupadaResgate278 = false;

  function QC_chaveResgate278(idResgate) {
    const sessao = dadosDaSessao();
    if (!sessao.id) throw Error("Entre na carteira primeiro.");
    if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(idResgate)) {
      throw Error("Identificador de resgate invalido.");
    }
    return PREFIXO_RESGATE278 + sessao.id + "_" + idResgate.toLowerCase();
  }
  function QC_resgatesLocais278() {
    const sessao = dadosDaSessao();
    if (!sessao.id) return [];
    const prefixo = PREFIXO_RESGATE278 + sessao.id + "_";
    return Object.keys(localStorage).filter(chave => chave.startsWith(prefixo));
  }
  async function QC_postResgate278(acao, parametros = {}) {
    const inicio = dadosDaSessao();
    if (!inicio.id || !inicio.token) throw Error("Entre na carteira novamente.");
    const r = await QC_postAnonimo271(acao, {
      tokenSessao:inicio.token, ...parametros
    });
    const atual = dadosDaSessao();
    if (atual.id !== inicio.id || atual.token !== inicio.token) {
      throw Error("A sessao foi alterada durante a operacao. Nao reinicie o resgate.");
    }
    return r;
  }
  async function QC_lerResgateLocal278(chave, senha) {
    const texto = localStorage.getItem(chave);
    if (!texto) return null;
    const op = await abrir(JSON.parse(texto),senha);
    if (!op || op.versao!==1 || !op.idResgate ||
        !Array.isArray(op.fichasEntrada) ||
        !Array.isArray(op.privadasTroco) ||
        !Array.isArray(op.privadasDevolucao)) {
      throw Error("Resgate local inconsistente. Preserve os dados do aparelho.");
    }
    return op;
  }
  // PASSO 287 - RESGATE DE MUITAS FICHAS.
  // A solicitacao usa a mesma interface e o mesmo segredo cifrado do
  // Passo 278. Ate 20 fichas sao transmitidas em cada POST, e TODAS as
  // assinaturas de troco/devolucao podem ser recuperadas individualmente.
  // A unica baixa de fichas continua sendo feita pelo servidor (Passo 285).
  async function QC_resgateLoteAssinaturas287(op,senha,fase,permitirNovas) {
    const devolucao=fase==="DEVOLUCAO";
    const privadas=devolucao?op.privadasDevolucao:op.privadasTroco;
    const assinaturas=[];
    for (let i=1;i<=privadas.length;i++) {
      const base={idResgate:op.idResgate,etapa:fase,indice:i};
      let resp=await QC_postResgate278("qc_resgate_lote_assinatura",base);
      // Antes da primeira assinatura, QC_Resgates ainda pode nao ter
      // sido criado: a rota de leitura responde NAO_ENCONTRADO.
      // Somente entao o servidor de movimentacao pode iniciar a baixa.
      if (["ASSINATURA_PENDENTE","NAO_ENCONTRADO"].includes(resp.status)
          && permitirNovas) {
        resp=await QC_postResgate278("qc_mov_lote_assinar",{
          idOperacao:op.idResgate,etapa:fase,indice:i
        });
        if (resp.status==="ASSINADO" &&
            Array.isArray(resp.assinaturasCegas) &&
            resp.assinaturasCegas.length===1) {
          resp={status:"ASSINADO",assinatura:resp.assinaturasCegas[0]};
        }
      }
      const a=resp.assinatura;
      if (resp.status!=="ASSINADO" || !a ||
          Number(a.indice)!==i ||
          a.denominacao!==privadas[i-1].valor ||
          a.idChave!==privadas[i-1].idChave ||
          !/^[0-9a-f]{1024}$/i.test(String(a.assinaturaCegaHex||""))) {
        throw Error(resp.mensagem||"Assinatura de "+fase+" pendente no indice "+
          i+". Preserve o pedido e retome-o sem gerar novas fichas.");
      }
      assinaturas.push(a);
    }
    await QC_concluirAssinaturas275(
      (devolucao?"RS-D-":"RS-T-")+op.idResgate,
      privadas,assinaturas,0,
      devolucao?op.valorResgate:op.valorTroco,senha
    );
  }

  async function QC_sincronizarResgateLotes287(op,senha) {
    const base={idOperacao:op.idResgate};
    let estado=await QC_postResgate278("qc_resgate_lote_status",{
      idResgate:op.idResgate
    });
    if (estado.status==="ERRO") throw Error(estado.mensagem||"Falha na consulta do resgate.");
    // Antes do primeiro registro financeiro, abrir o lote ou recuperar
    // a abertura existente. Nunca alterar IDs ou blocos cegos em retomadas.
    if (estado.status==="NAO_ENCONTRADO") {
      const abrir=await QC_postResgate278("qc_mov_lote_abrir",{
        ...base,tipo:"RESGATE",valorSolicitado:op.valorResgate,
        quantidadeEntradas:op.fichasEntrada.length,
        quantidadeTroco:op.trocoCego.length,
        quantidadeDevolucao:op.devolucaoCega.length
      });
      let fase=abrir.status;
      if (fase==="RECEBENDO") {
        for (const [etapa,lista] of [
          ["ENTRADA",op.fichasEntrada],
          ["TROCO",op.trocoCego],
          ["DEVOLUCAO",op.devolucaoCega]
        ]) {
          for (let pos=0;pos<lista.length;pos+=20) {
            const parte=await QC_postResgate278("qc_mov_lote_parte",{
              ...base,etapa,indiceInicial:pos+1,
              fichas:lista.slice(pos,pos+20)
            });
            if (parte.status!=="RECEBENDO") {
              throw Error(parte.mensagem||"Parcela de resgate pendente: "+parte.status);
            }
          }
        }
        const pronto=await QC_postResgate278("qc_mov_lote_pronto",base);
        fase=pronto.status;
      }
      if (!["PRONTO","PROCESSANDO","CONCLUIDO"].includes(fase)) {
        throw Error(abrir.mensagem||"Preparacao do resgate pendente: "+fase+
          ". Nenhuma nova solicitacao deve ser criada.");
      }
      // O metadata de QC_Resgates so surge apos a primeira chamada de
      // assinatura/baixa feita pelo servidor, sob o lock global.
      estado=await QC_postResgate278("qc_resgate_lote_status",{
        idResgate:op.idResgate
      });
    }
    // A operacao somente sai de CRIANDO quando TODAS as fichas de troco
    // foram assinadas, armazenadas e a baixa foi conciliada no servidor.
    if (estado.status==="NAO_ENCONTRADO" ||
        estado.status==="RESGATE_CRIANDO") {
      await QC_resgateLoteAssinaturas287(op,senha,"TROCO",true);
      const concluido=await QC_postResgate278("qc_mov_lote_concluir",{
        ...base,etapa:"TROCO"
      });
      if (concluido.status!=="RESGATE_PENDENTE") {
        throw Error(concluido.mensagem||"Resgate ainda em preparacao: "+
          concluido.status+". Retome a mesma solicitacao.");
      }
      estado=await QC_postResgate278("qc_resgate_lote_status",{
        idResgate:op.idResgate
      });
    } else {
      // O tesoureiro pode ter confirmado ou cancelado enquanto o celular
      // esteve offline. Recuperar o troco ja salvo sem novas assinaturas.
      await QC_resgateLoteAssinaturas287(op,senha,"TROCO",false);
    }
    if (estado.status==="ERRO") throw Error(estado.mensagem||"Falha no estado do resgate.");
    if (estado.idResgate!==op.idResgate ||
        Number(estado.valorResgate)!==op.valorResgate ||
        Number(estado.valorTroco)!==op.valorTroco) {
      throw Error("Valores do resgate divergentes. Preserve a operacao local.");
    }
    if (estado.status==="RESGATE_CANCELAMENTO_APROVADO" ||
        estado.status==="RESGATE_CANCELADO") {
      await QC_resgateLoteAssinaturas287(op,senha,"DEVOLUCAO",
        estado.status==="RESGATE_CANCELAMENTO_APROVADO");
      if (estado.status==="RESGATE_CANCELAMENTO_APROVADO") {
        const fim=await QC_postResgate278("qc_mov_lote_concluir",{
          ...base,etapa:"DEVOLUCAO"
        });
        if (fim.status!=="RESGATE_CANCELADO") {
          throw Error(fim.mensagem||"Devolucao aguardando conclusao: "+fim.status);
        }
      }
      localStorage.removeItem(QC_chaveResgate278(op.idResgate));
      memoria=null;renderizar();
      return {status:"CANCELADO",valor:op.valorResgate};
    }
    if (estado.status==="RESGATE_CONFIRMADO") {
      localStorage.removeItem(QC_chaveResgate278(op.idResgate));
      memoria=null;renderizar();
      return {status:"CONFIRMADO",valor:op.valorResgate};
    }
    if (!["RESGATE_PENDENTE","RESGATE_CANCELAMENTO_SOLICITADO"].includes(
        estado.status)) {
      throw Error("Estado de resgate inesperado: "+estado.status);
    }
    memoria=null;renderizar();
    return {status:"PENDENTE",valor:op.valorResgate,situacao:estado.status};
  }

  async function QC_sincronizarResgate278(op, senha) {
    if (op.metodo==="LOTE285") {
      return await QC_sincronizarResgateLotes287(op,senha);
    }
    // Primeiro consultar sem criar uma nova solicitacao. O mesmo ID e
    // repetido apos falhas para impedir reservas ou assinaturas duplicadas.
    let resposta = await QC_postResgate278("qc_resgate_consultar",{
      idResgate:op.idResgate
    });
    if (["NAO_ENCONTRADO","RESGATE_CRIANDO"].includes(resposta.status)) {
      resposta = await QC_postResgate278("qc_resgate_criar", {
        idResgate:op.idResgate,
        valorResgate:op.valorResgate,
        fichasEntrada:op.fichasEntrada,
        trocoCego:op.trocoCego,
        devolucaoCega:op.devolucaoCega
      });
      if (["RESGATES_BLOQUEADOS","FICHA_INDISPONIVEL"].includes(resposta.status)) {
        // Resposta definitiva: servidor nao reservou nem gastou ficha.
        // A operacao pode ser descartada sem comprometer o saldo.
        localStorage.removeItem(QC_chaveResgate278(op.idResgate));
        throw Error(resposta.status==="RESGATES_BLOQUEADOS" ?
          "Resgates ainda nao foram habilitados pelo tesoureiro." :
          "Uma das fichas nao esta disponivel. Nenhum novo resgate foi registrado.");
      }
      if (resposta.status==="RESGATE_PENDENTE_ASSINATURA") {
        return {status:"PENDENTE",mensagem:"Assinatura pendente. Retome este mesmo resgate."};
      }
      if (!resposta.status.startsWith("RESGATE_")) {
        throw Error(resposta.mensagem || "Resgate nao concluido: " + resposta.status);
      }
      resposta = await QC_postResgate278("qc_resgate_consultar",{
        idResgate:op.idResgate
      });
    }
    const estados = ["RESGATE_PENDENTE","RESGATE_CANCELAMENTO_SOLICITADO",
      "RESGATE_CANCELAMENTO_APROVADO","RESGATE_CONFIRMADO","RESGATE_CANCELADO"];
    if (resposta.status==="RESGATE_CRIANDO") {
      return {status:"PENDENTE",mensagem:"Resgate em preparacao. Retome a solicitacao."};
    }
    if (!estados.includes(resposta.status) ||
        resposta.idResgate !== op.idResgate ||
        Number(resposta.valorResgate) !== op.valorResgate ||
        Number(resposta.valorTroco) !== op.valorTroco) {
      throw Error(resposta.mensagem || "Confirmacao de resgate divergente. Preserve a operacao local.");
    }

    // Concluir SEMPRE o troco primeiro, inclusive apos pagamento/cancelamento.
    // Assinaturas cegas so viram fichas apos verificacao RSA.
    if (op.privadasTroco.length && !Array.isArray(resposta.assinaturasTroco)) {
      return {status:"PENDENTE",mensagem:"Troco ainda nao recuperavel. Retome depois."};
    }
    await QC_concluirAssinaturas275("RS-T-"+op.idResgate,
      op.privadasTroco,resposta.assinaturasTroco || [],
      0,op.valorTroco,senha);
    if (resposta.status==="RESGATE_CANCELADO") {
      if (!Array.isArray(resposta.assinaturasDevolucao)) {
        return {status:"PENDENTE",mensagem:"Devolucao aprovada, mas assinaturas ainda indisponiveis."};
      }
      await QC_concluirAssinaturas275("RS-D-"+op.idResgate,
        op.privadasDevolucao,resposta.assinaturasDevolucao,
        0,op.valorResgate,senha);
      // So apagar o segredo depois que todas as fichas de devolucao
      // estiverem verificadas e salvas localmente.
      localStorage.removeItem(QC_chaveResgate278(op.idResgate));
      memoria=null;renderizar();
      return {status:"CANCELADO",valor:op.valorResgate};
    }
    if (resposta.status==="RESGATE_CONFIRMADO") {
      localStorage.removeItem(QC_chaveResgate278(op.idResgate));
      memoria=null;renderizar();
      return {status:"CONFIRMADO",valor:op.valorResgate};
    }
    memoria=null;renderizar();
    return {status:"PENDENTE",valor:op.valorResgate,
      situacao:resposta.status};
  }
  // Passo 334 - Chave Pix validada localmente, guardada somente no
  // material cifrado da operacao e enviada pelo token autenticado.
  function QC_pixNormalizar334(bruto) {
    if(typeof bruto!=="string") throw Error("Chave Pix invalida.");
    let chave=bruto.trim();
    // PASSO 386 — Pix opcional, sem abrir mão da validação de uma chave informada.
    if(!chave) return "";
    if(chave.length>90 || /[\r\n<>]/.test(chave)) {
      throw Error("Informe uma chave Pix valida.");
    }
    if(/^[\d.\-/\s]+$/.test(chave)) chave=chave.replace(/[^0-9]/g,"");
    else if(/^\+55[\d\s().-]+$/.test(chave))
      chave="+"+chave.slice(1).replace(/[^0-9]/g,"");
    const ok=/^\d{11}$|^\d{14}$/.test(chave) ||
      /^\+55\d{10,11}$/.test(chave) ||
      (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(chave)&&chave.length<=77) ||
      /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(chave);
    if(!ok) throw Error("Chave Pix invalida. Use CPF, CNPJ, e-mail, celular +55 ou chave aleatoria.");
    return chave;
  }
  async function QC_salvarPixResgate334(op, resposta) {
    if(!op.chavePix || !resposta || resposta.status!=="PENDENTE") return resposta;
    // Em preparacoes incompletas, a linha ainda pode nao existir; a
    // mesma operacao local sera retomada sem duplicar a reserva.
    if(!["RESGATE_PENDENTE","RESGATE_CANCELAMENTO_SOLICITADO"].includes(
        String(resposta.situacao||""))) return resposta;
    const r=await QC_postResgate278("qc_resgate_pix_salvar",{
      idResgate:op.idResgate,chavePix:op.chavePix
    });
    if(!r || r.status!=="PIX_REGISTRADO") {
      throw Error(r?.mensagem || "O pedido existe, mas a chave Pix nao foi confirmada no servidor. Retome o MESMO resgate sem solicitar outro.");
    }
    return {...resposta,pixRegistrado:true};
  }

  window.QC_solicitarResgate278 = async function(valor,chavePix) {
    if (ocupadaResgate278) throw Error("Outra operacao de resgate esta em andamento.");
    ocupadaResgate278=true;
    try {
      const inicio=dadosDaSessao();
      if (!inicio.id || !inicio.token) throw Error("Entre na carteira primeiro.");
      if (!Number.isSafeInteger(Number(valor)) || Number(valor)<2 || Number(valor)===3) {
        throw Error("Informe um valor inteiro a partir de 2 QC, exceto 3 QC.");
      }
      const pix=QC_pixNormalizar334(chavePix);
      const senha=await obterSenha265();
      if (!senha) return {status:"CANCELADO_PELO_USUARIO"};
      memorizarSenha265(senha,inicio);
      const fichas=await QC_fichasAtuais271(senha);
      const plano=QC_planejarComposicao267(fichas.map(f=>f.valor), Number(valor));
      if (plano.status!=="OK") throw Error(plano.mensagem||plano.status);
      const confirmar=await QC_confirmarTransferencia332({
        titulo:"Confirmar resgate",
        destaque:"Qc$ "+plano.valorSolicitado.toLocaleString("pt-BR"),
        linhas:[
          "Chave Pix para receber: "+pix,
          "As fichas ficarão reservadas até o pagamento ou cancelamento autorizado pelo tesoureiro.",
          plano.valorTroco ? "Troco automático: "+plano.valorTroco+" Qc$." : "Sem necessidade de troco.",
          "O Pix será feito fora do aplicativo. Este pedido não confirma que você recebeu dinheiro."
        ],
        rotulo:"Solicitar resgate"
      });
      if (!confirmar) return {status:"CANCELADO_PELO_USUARIO"};
      if (inicio.id!==dadosDaSessao().id || inicio.token!==dadosDaSessao().token) {
        throw Error("Sessao alterada. Resgate nao iniciado.");
      }
      const troco=await QC_prepararTroco271(plano);
      const valoresDevolucao=QC_decomporTroco267(plano.valorSolicitado);
      if (!valoresDevolucao) {
        throw Error("Nao foi possivel preparar a devolucao segura do resgate.");
      }
      const devolucao=await QC_prepararTroco271({fichasTroco:valoresDevolucao});
      const lotes=plano.indicesSelecionados.length>50 ||
        troco.saidasCegas.length>50 || devolucao.saidasCegas.length>50;
      const op={versao:1,idResgate:crypto.randomUUID().toLowerCase(),
        metodo:lotes?"LOTE285":"DIRETO277",
        valorResgate:plano.valorSolicitado,valorTroco:plano.valorTroco,
        chavePix:pix,
        fichasEntrada:plano.indicesSelecionados.map(i=>({
          mensagemHex:fichas[i].mensagemHex,
          assinaturaHex:fichas[i].assinaturaHex
        })),
        trocoCego:troco.saidasCegas,
        devolucaoCega:devolucao.saidasCegas,
        privadasTroco:troco.privadas,
        privadasDevolucao:devolucao.privadas};
      const chave=QC_chaveResgate278(op.idResgate);
      // Material para recuperar a devolucao e armazenado ANTES da primeira
      // chamada ao Apps Script, nunca em texto puro no navegador.
      localStorage.setItem(chave,JSON.stringify(await QC_cifrar271(op,senha)));
      return await QC_salvarPixResgate334(op,await QC_sincronizarResgate278(op,senha));
    } finally {ocupadaResgate278=false;}
  };
  window.QC_meusResgates278 = async function() {
    const resposta=await QC_postResgate278("qc_resgate_meus");
    if (resposta.status!=="OK" || !Array.isArray(resposta.pedidos)) {
      throw Error(resposta.mensagem||"Nao foi possivel consultar os resgates.");
    }
    const locais=new Set(QC_resgatesLocais278().map(k=>k.split("_").pop()));
    return resposta.pedidos.map(p=>({...p,
      possuiRecuperacaoLocal:locais.has(p.idResgate)}));
  };
  window.QC_retomarResgate278 = async function(idResgate) {
    if (ocupadaResgate278) throw Error("Ja existe resgate em andamento.");
    ocupadaResgate278=true;
    try {
      const senha=await obterSenha265();
      if (!senha) return {status:"CANCELADO_PELO_USUARIO"};
      const chave=QC_chaveResgate278(idResgate);
      const op=await QC_lerResgateLocal278(chave,senha);
      if (!op) throw Error("Os dados protegidos desta solicitacao nao estao neste aparelho. " +
        "Preserve a copia original da carteira e procure o tesoureiro.");
      return await QC_salvarPixResgate334(op,await QC_sincronizarResgate278(op,senha));
    } finally {ocupadaResgate278=false;}
  };
  window.QC_pedirCancelamentoResgate278 = async function(idResgate) {
    const resp=await QC_postResgate278("qc_resgate_pedir_cancelamento",{idResgate});
    if (!["CANCELAMENTO_SOLICITADO","PENDENTE"].includes(resp.status)) {
      throw Error(resp.mensagem||"Cancelamento nao registrado: "+resp.status);
    }
    return resp;
  };
  window.QC_resgatesSemConfirmacaoLocal278 = function() {
    return QC_resgatesLocais278().length;
  };


  // ================================================================
  // PASSO 370 — TRANSFERENCIAS E RESGATES V2 NA CARTEIRA
  // Novas operacoes somente em V2; nao cria, converte nem apaga V1.
  // Material secreto e fichas em armazenamento cifrado, idempotente.
  // As propriedades do servidor e o Worker continuam bloqueando
  // qualquer movimentacao antes da abertura contabil definitiva.
  // ================================================================
  const QC_TX_V2_370='QC_TRANSFERENCIA_ENVIO_V2_';
  const QC_RX_V2_370='QC_TRANSFERENCIA_RESGATE_V2_';
  const QC_RS_V2_370='QC_RESGATE_LOCAL_V2_';
  const QC_CODIGO_V2_370=/^QC2\|([0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})\|([0-9a-f]{64})$/i;
  let QC_movV2Ocupado370=false;

  function QC_fichasDisponiveisV2370() {
    const s=dadosDaSessao(),m=memoriaV2365;
    if (!s.id||!s.token||!m||m.id!==s.id||m.token!==s.token||
        !Array.isArray(m.fichas)||
        localStorage.getItem(QC_CHAVE_LOCAL_V2_368(s.id))!==m.origem) return null;
    return m.fichas;
  }
  // Somente valor numerico; nunca revela o conteudo das fichas.
  window.QC_saldoDisponivelV2370=function() {
    const f=QC_fichasDisponiveisV2370();
    return f ? f.reduce((n,x)=>n+x.valor,0) : null;
  };
  function QC_chaveMovV2370(prefixo) {
    const s=dadosDaSessao();
    if (!s.id||!s.token) throw Error('Entre novamente na sua carteira.');
    return prefixo+s.id;
  }
  function QC_chaveResgateV2370(id) {
    if (!QC_UUID_368.test(id)) throw Error('Identificador de resgate V2 invalido.');
    return QC_chaveMovV2370(QC_RS_V2_370)+'_'+id.toLowerCase();
  }
  async function QC_lerMovV2370(chave,senha,tipo) {
    const bruto=localStorage.getItem(chave);
    if (!bruto) return null;
    let op;
    try {op=await abrir(JSON.parse(bruto),senha);}
    catch (_) {throw Error('Operacao V2 protegida nao pode ser aberta. Preserve a carteira.');}
    if (!op||op.versao!==2||op.tipo!==tipo ||
        !QC_UUID_368.test(op.idTransferencia||op.idResgate||'')||
        !Array.isArray(op.privadasTroco||op.privadas) ||
        !Array.isArray(op.saidasCegas||op.trocoCego||[]))
      throw Error('Operacao V2 local inconsistente. Preserve os dados.');
    return op;
  }
  async function QC_guardarMovV2370(chave,op,senha) {
    if (localStorage.getItem(chave)) throw Error('Ja existe operacao protegida; retome a anterior.');
    const cifrado=await QC_cifrar271(op,senha);
    if (localStorage.getItem(chave)) throw Error('Outra operacao foi iniciada.');
    localStorage.setItem(chave,JSON.stringify(cifrado));
  }
  function QC_conferirMemoriaV2370(sessao) {
    QC_conferirSessaoQR301(sessao);
    if (!QC_fichasDisponiveisV2370()) {
      throw Error('Fichas V2 nao conferidas nesta carteira. Atualize o saldo.');
    }
  }
  async function QC_liberacaoV2370(tipo) {
    const r=await QC_postAnonimo271('qc_v2_estado_operacional',{});
    if (r.status!=='OK'||r.versao!=='V2'||
        r[tipo]!==true) throw Error(
      'Operacoes V2 ainda bloqueadas. Nenhum valor foi movimentado.');
  }
  async function QC_gravarAssinadasV2370(idLocal,privadas,assinaturas,senha,origem) {
    if (!Array.isArray(privadas)||!Array.isArray(assinaturas)||
        privadas.length!==assinaturas.length) {
      throw Error('Assinaturas V2 incompletas. Preserve esta operacao.');
    }
    if (!privadas.length) {
      memoriaV2365=null;
      QC_exibirV2365();
      return;
    }
    const valor=privadas.reduce((s,f)=>s+Number(f.valor),0);
    const resposta={status:'TROCO_ASSINADO',versao:'V2',
      idTroca:idLocal,valorDoacao:0,valorTroco:valor,assinaturasCegas:assinaturas};
    await QC_finalizarTrocoV2368({idOperacao:idLocal,valorDoacao:0,
      valorTroco:valor,privadas},resposta,senha,origem);
    memoriaV2365=null;
    QC_exibirV2365();
  }
  const QC_v1TransferirCriar370=window.QC_transferirCriar275;
  const QC_v1TransferirConsultar370=window.QC_transferirConsultar275;
  const QC_v1TransferirResgatar370=window.QC_transferirResgatar275;
  const QC_v1TXPendente370=window.QC_transferenciaPendente275;
  const QC_v1RXPendente370=window.QC_resgatePendente275;

  async function QC_enviarV2370(op,senha,sessao) {
    const r=await QC_postAnonimo271('qc_transferir_v2_criar',{
      idTransferencia:op.idTransferencia,codigo:op.codigo,
      valorEnviado:op.valorEnviado,fichasEntrada:op.fichasEntrada,
      trocoCego:op.saidasCegas
    });
    if (r.status!=='TRANSFERENCIA_V2_PRONTA'||r.idTransferencia!==op.idTransferencia||
        Number(r.valorEnviado)!==op.valorEnviado||Number(r.valorTroco)!==op.valorTroco)
      throw Error(r.mensagem||'Transferencia V2 pendente ('+String(r.status||'?')+
        '). Retome a mesma operacao; nao crie outra.');
    await QC_gravarAssinadasV2370('TX-'+op.idTransferencia,
      op.privadasTroco,r.assinaturasTroco,senha,sessao);
    return {status:'PRONTA',idTransferencia:op.idTransferencia,
      valorEnviado:op.valorEnviado,
      codigoQR:'QC2|'+op.idTransferencia+'|'+op.codigo};
  }
  window.QC_transferirCriar275=async function(valorSolicitado) {
    const sessao=dadosDaSessao(),
      pendenteV2=sessao.id&&localStorage.getItem(QC_TX_V2_370+sessao.id);
    if (QC_movV2Ocupado370) throw Error('Transferencia V2 em andamento.');
    QC_movV2Ocupado370=true;
    try {
      const senha=await obterSenha265();
      if (!senha) return {status:'CANCELADO'};
      memorizarSenha265(senha,sessao);
      const chave=QC_chaveMovV2370(QC_TX_V2_370);
      const anterior=await QC_lerMovV2370(chave,senha,'TX');
      if (anterior) return await QC_enviarV2370(anterior,senha,sessao);
      const valor=Number(valorSolicitado);
      if (!Number.isSafeInteger(valor)||valor<1||valor>10000)
        throw Error('Informe um valor inteiro de 1 a 10.000 Qc$.');
      QC_conferirMemoriaV2370(sessao);
      const fichas=QC_fichasDisponiveisV2370();
      const plano=QC_planejarComposicaoV2366(fichas.map(f=>f.valor),valor);
      if (plano.status!=='OK') throw Error(plano.mensagem||plano.status);
      if (plano.indicesSelecionados.length>20||plano.fichasTroco.length>20)
        throw Error('Quantidade V2 acima de 20 fichas. Use valores menores.');
      // Antes de preparar o material privado, verificar bloqueio no servidor.
      await QC_liberacaoV2370('transferencias');
      const confirmar=await QC_confirmarTransferencia332({
        titulo:'Confirmar transferencia V2',
        destaque:QC_formatoValor291(valor),
        linhas:[plano.valorTroco
          ?'Troco automatico: '+plano.valorTroco+' Qc$.'
          :'Sem necessidade de troco.',
          'Compartilhe o codigo somente com o destinatario.'],
        rotulo:'Preparar transferencia'
      });
      if (!confirmar) return {status:'CANCELADO'};
      QC_conferirMemoriaV2370(sessao);
      const pub=plano.fichasTroco.length ? await QC_publicasV2368():new Map();
      const saidas=await QC_prepararTrocoV2368(plano.fichasTroco,pub);
      const op={versao:2,tipo:'TX',idTransferencia:crypto.randomUUID().toLowerCase(),
        codigo:QC_hex271(crypto.getRandomValues(new Uint8Array(32))),
        valorEnviado:valor,valorTroco:plano.valorTroco,
        fichasEntrada:plano.indicesSelecionados.map(i=>({
          mensagemHex:fichas[i].mensagemHex,
          assinaturaHex:fichas[i].assinaturaHex})),
        saidasCegas:saidas.saidasCegas,privadasTroco:saidas.privadas};
      await QC_guardarMovV2370(chave,op,senha);
      return await QC_enviarV2370(op,senha,sessao);
    } finally {QC_movV2Ocupado370=false;}
  };
  window.QC_transferenciaPendente275=function() {
    const {id}=dadosDaSessao();
    return !!(id&&localStorage.getItem(QC_TX_V2_370+id));
  };
  window.QC_transferirConsultar275=async function() {
    const sessao=dadosDaSessao();
    if (!sessao.id||!localStorage.getItem(QC_TX_V2_370+sessao.id))
      return {status:'NAO_ENCONTRADO'};
    const senha=await obterSenha265();
    if (!senha) return {status:'CANCELADO'};
    const chave=QC_chaveMovV2370(QC_TX_V2_370),
      op=await QC_lerMovV2370(chave,senha,'TX');
    const r=await QC_postAnonimo271('qc_transferir_v2_consultar',{
      idTransferencia:op.idTransferencia,codigo:op.codigo});
    if (r.status==='CONCLUIDA') {
      // Antes de apagar o codigo, garantir que o troco esteja salvo.
      await QC_enviarV2370(op,senha,sessao);
      localStorage.removeItem(chave);
      return {status:'CONCLUIDA',valorEnviado:op.valorEnviado};
    }
    if (!['PRONTA','RESGATANDO'].includes(r.status))
      throw Error('Transferencia V2 ainda nao confirmada: '+String(r.status));
    return {status:r.status,valorEnviado:op.valorEnviado,
      codigoQR:'QC2|'+op.idTransferencia+'|'+op.codigo};
  };

  async function QC_receberV2370(op,senha,sessao) {
    const r=await QC_postAnonimo271('qc_transferir_v2_resgatar',{
      idTransferencia:op.idTransferencia,codigo:op.codigo,
      saidasCegas:op.saidasCegas});
    if (r.status!=='TRANSFERENCIA_V2_RESGATADA'||
        r.idTransferencia!==op.idTransferencia||
        Number(r.valorRecebido)!==op.valorRecebido) {
      throw Error(r.mensagem||'Recebimento V2 pendente ('+String(r.status||'?')+
        '). Preserve os dados e retome este recebimento.');
    }
    await QC_gravarAssinadasV2370('RX-'+op.idTransferencia,
      op.privadas,r.assinaturasCegas,senha,sessao);
    localStorage.removeItem(QC_chaveMovV2370(QC_RX_V2_370));
    return {status:'RECEBIDA',valorRecebido:op.valorRecebido};
  }
  window.QC_resgatePendente275=function() {
    const {id}=dadosDaSessao();
    return !!(id&&localStorage.getItem(QC_RX_V2_370+id));
  };
  window.QC_transferirResgatar275=async function(codigoLido) {
    const texto=String(codigoLido||'').trim();
    const sessao=dadosDaSessao(),
      rxChave=sessao.id?QC_RX_V2_370+sessao.id:null;
    if (!rxChave) throw Error('Entre na carteira para receber.');
    if (!QC_CODIGO_V2_370.test(texto)&&!localStorage.getItem(rxChave))
      throw Error('Codigo de transferencia nao reconhecido.');
    if (QC_movV2Ocupado370) throw Error('Outra movimentacao V2 em andamento.');
    QC_movV2Ocupado370=true;
    try {
      const senha=await obterSenha265();
      if (!senha) return {status:'CANCELADO'};
      memorizarSenha265(senha,sessao);
      let op=await QC_lerMovV2370(rxChave,senha,'RX');
      if (op) {
        if (texto) {
          const match=QC_CODIGO_V2_370.exec(texto);
          if (!match||match[1].toLowerCase()!==op.idTransferencia||
              match[2].toLowerCase()!==op.codigo)
            throw Error('Outro recebimento V2 esta pendente. Retome primeiro.');
        }
        return await QC_receberV2370(op,senha,sessao);
      }
      const match=QC_CODIGO_V2_370.exec(texto);
      if (!match) throw Error('Codigo de transferencia V2 invalido.');
      await QC_liberacaoV2370('transferencias');
      const id=match[1].toLowerCase(),codigo=match[2].toLowerCase();
      const consulta=await QC_postAnonimo271('qc_transferir_v2_consultar',{
        idTransferencia:id,codigo});
      if (consulta.status!=='PRONTA'||consulta.versao!=='V2')
        throw Error('Transferencia V2 nao esta pronta: '+String(consulta.status));
      const valor=Number(consulta.valorEnviado);
      if (!Number.isSafeInteger(valor)||valor<1||valor>10000)
        throw Error('Valor V2 recebido inválido.');
      const confirmou=await QC_confirmarTransferencia332({
        titulo:'Confirmar recebimento V2',destaque:QC_formatoValor291(valor),
        linhas:['O servidor verificara o codigo antes de assinar novas fichas.'],
        rotulo:'Receber Qc$'
      });
      if (!confirmou) return {status:'CANCELADO'};
      QC_conferirSessaoQR301(sessao);
      const valores=QC_decomporTrocoV2366(valor);
      if (valores.length>20) throw Error('Recebimento requer mais de 20 fichas.');
      const pub=await QC_publicasV2368();
      const preparadas=await QC_prepararTrocoV2368(valores,pub);
      op={versao:2,tipo:'RX',idTransferencia:id,codigo,valorRecebido:valor,
        saidasCegas:preparadas.saidasCegas,privadas:preparadas.privadas,
        privadasTroco:[]};
      await QC_guardarMovV2370(rxChave,op,senha);
      return await QC_receberV2370(op,senha,sessao);
    } finally {QC_movV2Ocupado370=false;}
  };

  const QC_v1SolicitarResgate370=window.QC_solicitarResgate278;
  const QC_v1MeusResgates370=window.QC_meusResgates278;
  const QC_v1RetomarResgate370=window.QC_retomarResgate278;
  const QC_v1CancelarResgate370=window.QC_pedirCancelamentoResgate278;
  const QC_v1PendenciasResgate370=window.QC_resgatesSemConfirmacaoLocal278;

  async function QC_retomarResgateV2370(op,senha,sessao) {
    const pedido={idResgate:op.idResgate};
    let r=await QC_postResgate278('qc_resgate_v2_consultar',pedido);
    if (r.status==='NAO_ENCONTRADO') {
      r=await QC_postResgate278('qc_resgate_v2_criar',{
        ...pedido,valorResgate:op.valorResgate,chavePix:op.chavePix,
        fichasEntrada:op.fichasEntrada,trocoCego:op.trocoCego,
        devolucaoCega:op.devolucaoCega});
      if (r.status==='RESGATE_V2_PENDENTE_ASSINATURA')
        return {status:'PENDENTE',mensagem:'Assinatura V2 pendente. Retome este pedido.'};
      if (r.status==='RESGATES_V2_BLOQUEADOS'||r.status==='FICHA_V2_INDISPONIVEL')
        throw Error('Resgate V2 indisponivel; preserve o pedido e confira o servidor.');
      // PASSO 385: nao ocultar a resposta de erro tentando consultar de novo.
      // O pedido local cifrado e mantido com o MESMO identificador.
      if (!r || r.status==='ERRO' || ![
          'RESGATE_PENDENTE','RESGATE_CANCELAMENTO_SOLICITADO',
          'RESGATE_CANCELAMENTO_APROVADO','RESGATE_CONFIRMADO','RESGATE_CANCELADO'
        ].includes(r.status)) {
        throw Error('Servidor nao confirmou a criacao do resgate V2: '+
          String(r?.mensagem||r?.status||'Resposta invalida')+
          '. Retome este mesmo pedido no acompanhamento; nao crie outro.');
      }
      r=await QC_postResgate278('qc_resgate_v2_consultar',pedido);
    }
    if (!['RESGATE_PENDENTE','RESGATE_CANCELAMENTO_SOLICITADO',
        'RESGATE_CANCELAMENTO_APROVADO','RESGATE_CONFIRMADO','RESGATE_CANCELADO']
        .includes(r.status)||r.versao!=='V2'||r.idResgate!==op.idResgate||
        Number(r.valorResgate)!==op.valorResgate||Number(r.valorTroco)!==op.valorTroco)
      throw Error('Resgate V2 ainda nao confirmado. Retome o mesmo pedido: '+
        String(r.status||'?'));
    if (op.privadasTroco.length && !Array.isArray(r.assinaturasTroco))
      return {status:'PENDENTE',mensagem:'Troco V2 ainda indisponivel; retome depois.'};
    await QC_gravarAssinadasV2370('RS-T-'+op.idResgate,
      op.privadasTroco,r.assinaturasTroco||[],senha,sessao);
    if (r.status==='RESGATE_CANCELADO') {
      if (!Array.isArray(r.assinaturasDevolucao))
        return {status:'PENDENTE',mensagem:'Devolucao V2 ainda indisponivel.'};
      await QC_gravarAssinadasV2370('RS-D-'+op.idResgate,
        op.privadasDevolucao,r.assinaturasDevolucao,senha,sessao);
      localStorage.removeItem(QC_chaveResgateV2370(op.idResgate));
      return {status:'CANCELADO',valor:op.valorResgate};
    }
    if (r.status==='RESGATE_CONFIRMADO') {
      localStorage.removeItem(QC_chaveResgateV2370(op.idResgate));
      return {status:'CONFIRMADO',valor:op.valorResgate};
    }
    return {status:'PENDENTE',valor:op.valorResgate,situacao:r.status,
      pixRegistrado:!!op.chavePix};
  }
  window.QC_solicitarResgate278=async function(valor,chavePix) {
    if (!QC_fichasDisponiveisV2370())
      return QC_v1SolicitarResgate370(valor,chavePix);
    if (QC_movV2Ocupado370) throw Error('Outra movimentacao V2 em andamento.');
    QC_movV2Ocupado370=true;
    try {
      const sessao=dadosDaSessao(),senha=await obterSenha265();
      if (!senha) return {status:'CANCELADO_PELO_USUARIO'};
      memorizarSenha265(senha,sessao);
      const valorN=Number(valor),pix=QC_pixNormalizar334(chavePix);
      if (!Number.isSafeInteger(valorN)||valorN<1||valorN>10000)
        throw Error('Resgate V2: informe um valor inteiro de 1 a 10.000 Qc$.');
      QC_conferirMemoriaV2370(sessao);
      const fichas=QC_fichasDisponiveisV2370();
      const plano=QC_planejarComposicaoV2366(fichas.map(f=>f.valor),valorN);
      if (plano.status!=='OK') throw Error(plano.mensagem||plano.status);
      const devolucao=QC_decomporTrocoV2366(valorN);
      if (plano.indicesSelecionados.length>20||plano.fichasTroco.length>20||
          devolucao.length>20) throw Error('Resgate V2 acima de 20 fichas.');
      await QC_liberacaoV2370('resgates');
      const confirmou=await QC_confirmarTransferencia332({
        titulo:'Confirmar resgate V2',destaque:QC_formatoValor291(valorN),
        linhas:[pix ? 'Chave Pix informada: '+pix :
            'Sem chave Pix. Combine o pagamento fora do aplicativo.',
          'Somente o tesoureiro confirmara o pagamento.',
          'As fichas ficam reservadas ate a conclusao ou cancelamento autorizado.'],
        rotulo:'Solicitar resgate'
      });
      if (!confirmou) return {status:'CANCELADO_PELO_USUARIO'};
      QC_conferirMemoriaV2370(sessao);
      const pub=await QC_publicasV2368();
      const troco=await QC_prepararTrocoV2368(plano.fichasTroco,pub);
      const devolver=await QC_prepararTrocoV2368(devolucao,pub);
      const op={versao:2,tipo:'RS',idResgate:crypto.randomUUID().toLowerCase(),
        valorResgate:valorN,valorTroco:plano.valorTroco,chavePix:pix,
        fichasEntrada:plano.indicesSelecionados.map(i=>({
          mensagemHex:fichas[i].mensagemHex,
          assinaturaHex:fichas[i].assinaturaHex})),
        trocoCego:troco.saidasCegas,devolucaoCega:devolver.saidasCegas,
        privadasTroco:troco.privadas,privadasDevolucao:devolver.privadas};
      await QC_guardarMovV2370(QC_chaveResgateV2370(op.idResgate),op,senha);
      return QC_retomarResgateV2370(op,senha,sessao);
    } finally {QC_movV2Ocupado370=false;}
  };
  window.QC_meusResgates278=async function() {
    const r=await QC_postResgate278('qc_resgate_v2_meus');
    if (r.status!=='OK'||!Array.isArray(r.pedidos))
      throw Error('Consulta de resgates indisponivel.');
    const pedidos=r.pedidos.map(p=>({...p,
      possuiRecuperacaoLocal:!!localStorage.getItem(QC_chaveResgateV2370(p.idResgate))
    }));
    // PASSO 385: pedido cifrado existe no aparelho, mas ainda nao no servidor.
    // Mostrar uma possibilidade de RETOMAR o mesmo ID, sem revelar ou decifrar
    // fichas, senha ou chave Pix; nunca criar outro resgate automaticamente.
    const sessao=dadosDaSessao();
    if (sessao.token!==sessionStorage.getItem('QC_TOKEN_SESSAO_TESTE') ||
        sessao.id!==localStorage.getItem('QC_ID_CARTEIRA'))
      throw Error('A sessao mudou durante a conferencia de resgates.');
    const prefixo=QC_RS_V2_370+sessao.id+'_';
    const registrados=new Set(pedidos.map(p=>String(p.idResgate).toLowerCase()));
    for (const chave of Object.keys(localStorage)) {
      if (!chave.startsWith(prefixo)) continue;
      const id=chave.slice(prefixo.length).toLowerCase();
      if (!QC_UUID_368.test(id) || registrados.has(id)) continue;
      registrados.add(id);
      pedidos.unshift({
        idResgate:id,valor:null,status:'PREPARADO_LOCAL',
        solicitadoEm:'Aguardando recuperacao',possuiRecuperacaoLocal:true
      });
    }
    return pedidos;
  };
  window.QC_retomarResgate278=async function(id) {
    const chave=QC_chaveResgateV2370(id);
    if (!localStorage.getItem(chave)) throw Error('Solicitacao nao encontrada nesta carteira.');
    const sessao=dadosDaSessao(),senha=await obterSenha265();
    if (!senha) return {status:'CANCELADO_PELO_USUARIO'};
    const op=await QC_lerMovV2370(chave,senha,'RS');
    return QC_retomarResgateV2370(op,senha,sessao);
  };
  window.QC_pedirCancelamentoResgate278=async function(id) {
    if (!localStorage.getItem(QC_chaveResgateV2370(id)))
      throw Error('Solicitacao nao encontrada nesta carteira.');
    const r=await QC_postResgate278('qc_resgate_v2_pedir_cancelamento',{
      idResgate:id});
    if (!['CANCELAMENTO_SOLICITADO','PENDENTE'].includes(r.status))
      throw Error('Cancelamento V2 nao registrado: '+String(r.status));
    return r;
  };
  window.QC_resgatesSemConfirmacaoLocal278=function() {
    const sessao=dadosDaSessao();
    const prefixo=QC_RS_V2_370+sessao.id+'_';
    return sessao.id ?
      Object.keys(localStorage).filter(k=>k.startsWith(prefixo)).length:0;
  };

  const painel = document.createElement("section");
  painel.style.marginTop = "20px";
  painel.style.padding = "16px";
  painel.style.border = "1px solid #ffffff33";
  painel.style.borderRadius = "12px";

  const titulo = document.createElement("h3");
  titulo.textContent = "Conferir minhas fichas assinadas";

  // Senha das fichas: solicitada so quando necessaria, nunca fixa na tela.
  async function obterSenha265() {
    const {id, token} = dadosDaSessao();
    if (senhaSessao265 && senhaSessao265.id === id &&
        senhaSessao265.token === token) {
      return senhaSessao265.valor;
    }
    senhaSessao265 = null;
    return new Promise(resolve => {
      const modal = document.createElement("dialog");
      modal.setAttribute("aria-label", "Desbloquear fichas QuintosCoin");
      modal.style.cssText =
        "width:min(92vw,370px);border:1px solid #6a7691;border-radius:16px;" +
        "padding:22px;background:#17243b;color:#fff;box-shadow:0 18px 70px #0009";
      const titulo = document.createElement("h3");
      titulo.textContent = "Desbloquear fichas";
      titulo.style.marginTop = "0";
      const descricao = document.createElement("p");
      descricao.textContent = "Informe a senha que protege suas fichas. " +
        "Ela sera mantida apenas nesta aba durante a sessao.";
      descricao.style.fontSize = "14px";
      const entrada = document.createElement("input");
      entrada.type = "password";
      entrada.autocomplete = "off";
      entrada.placeholder = "Senha das fichas";
      entrada.style.cssText = "display:block;width:100%;padding:12px;" +
        "box-sizing:border-box;margin:15px 0;color:#17243b";
      const acoes = document.createElement("div");
      acoes.style.cssText = "display:flex;gap:10px;justify-content:flex-end";
      const cancelar = document.createElement("button");
      cancelar.type = "button";
      cancelar.textContent = "Cancelar";
      const confirmar = document.createElement("button");
      confirmar.type = "button";
      confirmar.textContent = "Continuar";
      confirmar.style.fontWeight = "bold";
      acoes.append(cancelar, confirmar);
      modal.append(titulo, descricao, entrada, acoes);
      document.body.appendChild(modal);
      let resolvido = false;
      const concluir = valor => {
        if (resolvido) return;
        resolvido = true;
        modal.close();
        modal.remove();
        entrada.value = "";
        resolve(valor);
      };
      confirmar.addEventListener("click", () => concluir(entrada.value));
      cancelar.addEventListener("click", () => concluir(""));
      entrada.addEventListener("keydown", e => {
        if (e.key === "Enter") { e.preventDefault(); concluir(entrada.value); }
      });
      modal.addEventListener("cancel", e => { e.preventDefault(); concluir(""); });
      modal.showModal();
      entrada.focus();
    });
  }

  function memorizarSenha265(valor, sessao) {
    const atual = dadosDaSessao();
    if (atual.id === sessao.id && atual.token === sessao.token) {
      senhaSessao265 = {id:atual.id, token:atual.token, valor};
    }
  }

  const conferir = document.createElement("button");
  conferir.type = "button";
  conferir.textContent = "Verificar meu saldo";

  const backup = document.createElement("button");
  backup.type = "button";
  backup.textContent = "Salvar backup das fichas assinadas";
  backup.style.marginTop = "10px";

  // PASSO 253 - Restauracao segura, sem sobrescrever fichas existentes.
  const restaurarBackup253 = document.createElement("button");
  restaurarBackup253.type = "button";
  restaurarBackup253.textContent = "Recuperar backup das fichas assinadas";
  restaurarBackup253.style.marginTop = "10px";

  const arquivoRestaurar253 = document.createElement("input");
  arquivoRestaurar253.type = "file";
  arquivoRestaurar253.accept = ".json,application/json";
  arquivoRestaurar253.style.display = "none";

  const aviso = document.createElement("p");
  aviso.setAttribute("role", "status");
  aviso.textContent = "Fichas protegidas. Consulte seu saldo quando desejar.";

  // So a consulta de saldo fica visivel no fluxo principal.
  const detalhes = document.createElement("details");
  detalhes.style.cssText = "margin-top:12px;border-top:1px solid #ffffff24;" +
    "padding-top:10px";
  const resumo = document.createElement("summary");
  resumo.textContent = "Segurança e recuperação";
  resumo.style.cssText = "cursor:pointer;font-size:14px;opacity:.9";
  detalhes.append(resumo,backup,restaurarBackup253,arquivoRestaurar253,aviso);
  // PASSO 374: Backup exclusivo do saldo operacional atual (V2).
  backup.hidden=false;
  backup.disabled=false;
  restaurarBackup253.hidden=false;
  restaurarBackup253.disabled=false;
  detalhes.hidden=false;
  titulo.textContent = "Meu saldo";
  conferir.textContent = "Atualizar saldo";
  // Saldo principal ja mostra a verificacao automatica.
  titulo.hidden = true;
  conferir.hidden = true;
  aviso.hidden = true;
  painel.style.cssText = "padding:0;border:0;margin-top:4px";
  painel.append(titulo, conferir, detalhes);
  const secao = document.querySelector("#telaCarteira .fichas");
  if (!secao) return;
  // Fichas detalhadas continuam disponiveis, mas recolhidas por padrao.
  const listaDetalhes = document.createElement("details");
  listaDetalhes.style.marginTop = "8px";
  const listaResumo = document.createElement("summary");
  listaResumo.textContent = "Detalhes das minhas fichas";
  listaResumo.style.cssText = "cursor:pointer;font-size:14px;opacity:.85";
  secao.parentNode.insertBefore(listaDetalhes, secao);
  listaDetalhes.append(listaResumo, secao);
  // Area separada e recolhida, sem alterar o saldo principal nem os planos.
  avisoV2365 = document.createElement("p");
  avisoV2365.id = "qcStatusFichasV2365";
  avisoV2365.style.cssText = "font-size:12px;opacity:.85;margin:9px 0";
  avisoV2365.setAttribute("role","status");
  avisoV2365.hidden = true;
  listaDetalhes.append(avisoV2365);
  listaDetalhes.after(painel);

  // Esconder os detalhes de solicitacoes tecnicas fora do fluxo principal.
  // As acoes existentes continuam acessiveis, sem serem removidas.
  const pedidos = document.getElementById("qcMinhasSolicitacoes");
  if (pedidos && pedidos.parentNode) {
    const gavetaPedidos = document.createElement("details");
    gavetaPedidos.style.cssText = "margin-top:12px;padding:10px 0";
    const abrirPedidos = document.createElement("summary");
    abrirPedidos.textContent = "Meus pedidos e recebimentos";
    abrirPedidos.style.cssText = "cursor:pointer;font-size:14px;opacity:.9";
    pedidos.parentNode.insertBefore(gavetaPedidos, pedidos);
    gavetaPedidos.append(abrirPedidos, pedidos);
  }

  // PASSO 372: somente fichas da geracao operacional ativa entram no saldo.
  // O marco do corte eh validado NO SERVIDOR antes de exibir 0,00 ou credito.
  const QC_conferirSaldo291 = async () => {
    const {id,token}=dadosDaSessao();
    const segredo=await obterSenha265();
    if (!id||!token||!segredo) throw Error('Entre na carteira para conferir o saldo.');
    conferir.disabled=true;
    memoriaV2365=null;
    renderizar();
    aviso.textContent='Conferindo saldo...';
    try {
      const r=await fetch(QC_URL_191,{
        method:'POST',redirect:'follow',
        headers:{'Content-Type':'text/plain;charset=utf-8'},
        body:JSON.stringify({acao:'qc_estado_somente_v2_372',tokenSessao:token})
      });
      if (!r.ok) throw Error('Servidor de saldo indisponivel.');
      const estado=await r.json();
      const faixa=document.getElementById('qcAvisoTesteV2377');
      if(faixa) faixa.hidden=(estado&&estado.ambiente)!=='TESTE';
      if (estado?.status!=='OK'||estado.geracao!=='V2'||
          estado.corteConfirmado!==true)
        throw Error('Saldo operacional nao foi liberado pelo servidor.');
      if (dadosDaSessao().id!==id||dadosDaSessao().token!==token)
        throw Error('Sessao alterada durante a conferencia.');
      // Limpeza unica dos dados de teste apos corte financeiro servidor.
      if(estado.ambiente==='REAL_PENDENTE' && estado.testesEncerrados===true &&
         localStorage.getItem('QC_V2_TESTE_LIMPO_377_'+id)!=='SIM') {
        const nomes=['QC_FICHAS_ASSINADAS_V2_'+id,
          'QC_FICHAS_CEGAS_PENDENTES_V2_'+id,
          'QC_DOACAO_PENDENTE_V2_'+id,
          'QC_TRANSFERENCIA_ENVIO_V2_'+id,
          'QC_TRANSFERENCIA_RESGATE_V2_'+id];
        for(const k of nomes)localStorage.removeItem(k);
        const prefixo='QC_RESGATE_LOCAL_V2_'+id+'_';
        const extras=[];
        for(let i=0;i<localStorage.length;i++){
          const k=localStorage.key(i);if(k&&k.startsWith(prefixo))extras.push(k);
        }
        extras.forEach(k=>localStorage.removeItem(k));
        localStorage.setItem('QC_V2_TESTE_LIMPO_377_'+id,'SIM');
      }
      memorizarSenha265(segredo,{id,token});
      await QC_conferirV2365(id,token,segredo);
      if (!memoriaV2365||memoriaV2365.id!==id||memoriaV2365.token!==token||
          memoriaV2365.erro||!Array.isArray(memoriaV2365.fichas))
        throw Error('Nao foi possivel conferir as fichas.');
      renderizar();
      aviso.textContent='✅ Saldo atualizado.';
    } catch(erro) {
      memoriaV2365=null;
      renderizar();
      aviso.textContent='⚠️ '+String(erro.message||erro);
      throw erro;
    } finally {conferir.disabled=false;}
  };
  conferir.addEventListener("click", () => {
    QC_conferirSaldo291().catch(erro => {
      const msg=document.getElementById("mensagem");
      if(msg) msg.textContent="⚠️ "+(erro.message||erro);
    });
  });

  // PASSO 374: Backup/recuperacao de fichas V2, NUNCA fichas do piloto.
  // Arquivos JSON contem apenas dados cifrados; nenhuma senha ou chave privada.
  const QC_PREFIXO_PENDENTE_V2_374 = id => [
    'QC_FICHAS_CEGAS_PENDENTES_V2_'+id,
    'QC_DOACAO_PENDENTE_V2_'+id,
    'QC_TRANSFERENCIA_ENVIO_V2_'+id,
    'QC_TRANSFERENCIA_RESGATE_V2_'+id
  ];
  function QC_pendenciasV2374(id) {
    const prefixoResgate='QC_RESGATE_LOCAL_V2_'+id+'_';
    // Arquivos vazios como "{}" nao sao operacoes pendentes.
    const possuiDados = k => {
      const texto=localStorage.getItem(k);
      if (!texto) return false;
      try {
        const objeto=JSON.parse(texto);
        return objeto && typeof objeto==='object' && !Array.isArray(objeto)
          ? Object.keys(objeto).length>0 : true;
      } catch (_) { return true; } // Dado ilegivel: preservar e bloquear.
    };
    return QC_PREFIXO_PENDENTE_V2_374(id).some(possuiDados) ||
      Object.keys(localStorage).some(k=>k.startsWith(prefixoResgate) && possuiDados(k));
  }
  function QC_registrosV2374(id) {
    const texto=localStorage.getItem('QC_FICHAS_ASSINADAS_V2_'+id);
    const dados=JSON.parse(texto || '{}');
    if (!dados || typeof dados!=='object'||Array.isArray(dados))
      throw Error('Armazenamento de fichas invalido. Nenhum dado foi alterado.');
    return {texto,registros:dados};
  }
  async function QC_validarBackupV2374(registros,senha) {
    // Ler, decifrar e verificar integridade antes de consultar anonimamente.
    const itens=await QC_emParalelo343(registros,async ([chave,registro])=>{
      if (!registro || typeof registro!=='object'||registro.versao!==1)
        throw Error('Arquivo contem ficha cifrada invalida.');
      const ficha=await abrir(registro,senha);
      const valor=Number(ficha?.valor);
      if (!ficha || ficha.formato!=='QC_FICHA_ASSINADA_V2' ||
          ![1,2,5,10,50].includes(valor) ||
          ficha.idChave!=='QC-'+valor+'-V2' ||
          !/^[0-9a-f]{1024}$/i.test(ficha.assinaturaHex||''))
        throw Error('Arquivo contem ficha V2 invalida.');
      const mensagemHex=String(ficha.mensagemHex||'').trim().toLowerCase();
      const bytes=deHex(mensagemHex);
      if (bytes.length<80||bytes.length>512)
        throw Error('Conteudo da ficha V2 fora do tamanho permitido.');
      const conteudo=new TextDecoder('utf-8',{fatal:true}).decode(bytes.subarray(32));
      const rx=/^QUINTOSCOIN\|V2\|(1|2|5|10|50)\|(QC-(?:1|2|5|10|50)-V2)\|[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
      const partes=rx.exec(conteudo);
      if (!partes||Number(partes[1])!==valor||partes[2].toUpperCase()!==ficha.idChave)
        throw Error('Conteudo da ficha V2 inconsistente.');
      return {chave,registro,mensagemHex,assinaturaHex:ficha.assinaturaHex.toLowerCase(),valor};
    });
    const hashes=new Set();
    for (const ficha of itens) {
      if (hashes.has(ficha.mensagemHex)) throw Error('Fichas duplicadas no backup.');
      hashes.add(ficha.mensagemHex);
    }
    for(let inicio=0;inicio<itens.length;inicio+=20) {
      const lote=itens.slice(inicio,inicio+20);
      const res=await fetch(QC_URL_191,{
        method:'POST',redirect:'follow',
        headers:{'Content-Type':'text/plain;charset=utf-8'},
        body:JSON.stringify({acao:'qc_consultar_gastos_v2_lote',
          fichas:lote.map(x=>({mensagemHex:x.mensagemHex,assinaturaHex:x.assinaturaHex}))})
      });
      if (!res.ok) throw Error('Servidor de verificacao indisponivel.');
      const resposta=await res.json();
      if(resposta?.status!=='OK'||resposta.versao!=='V2'||
          !Array.isArray(resposta.resultados)||resposta.resultados.length!==lote.length)
        throw Error('Servidor nao validou integralmente as fichas.');
      resposta.resultados.forEach((r,i)=>{
        if (!r||!['DISPONIVEL','GASTA'].includes(r.status)||
            Number(r.valor)!==lote[i].valor)
          throw Error('Assinatura ou disponibilidade de ficha nao confirmada.');
        lote[i].situacao=r.status;
      });
    }
    return itens;
  }

  backup.addEventListener('click', async () => {
    aviso.hidden=false;
    const s=dadosDaSessao();
    if(!s.id||!s.token) {aviso.textContent='Entre na carteira primeiro.';return;}
    backup.disabled=true;
    try {
      if(QC_pendenciasV2374(s.id))
        throw Error('Conclua ou recupere as operacoes pendentes antes do backup.');
      const dados=QC_registrosV2374(s.id);
      const registros=Object.entries(dados.registros);
      if (!registros.length) throw Error('Ainda nao existem fichas para salvar.');
      if (registros.length>2000) throw Error('Quantidade de fichas acima do limite de backup.');
      const senha=await obterSenha265();
      if (!senha) return;
      const validadas=await QC_validarBackupV2374(registros,senha);
      if(dadosDaSessao().id!==s.id||dadosDaSessao().token!==s.token||
          QC_registrosV2374(s.id).texto!==dados.texto)
        throw Error('Carteira alterada durante a preparacao do backup.');
      const pacote={formato:'QUINTOSCOIN_BACKUP_ASSINADAS_V2',versao:2,
        idCarteira:s.id,criadoEm:new Date().toISOString(),
        registrosCifrados:Object.fromEntries(registros)};
      const blob=new Blob([JSON.stringify(pacote,null,2)],{type:'application/json'});
      const url=URL.createObjectURL(blob);
      const a=document.createElement('a');
      a.href=url;a.download='QuintosCoin_backup_assinadas_V2.json';
      document.body.appendChild(a);a.click();a.remove();
      setTimeout(()=>URL.revokeObjectURL(url),5000);
      aviso.textContent='Backup solicitado: '+validadas.length+
        ' fichas protegidas. Guarde o arquivo e a senha em locais seguros.';
    }catch(erro){aviso.textContent='⚠️ '+String(erro.message||erro);}
    finally{backup.disabled=false;}
  });

  // Backup produzido com uma senha anterior pode ser aberto uma unica vez
  // e recriptografado com a senha ATUAL, sem alterar a senha do servidor.
  function QC_perguntarSenhaBackup374() {
    return new Promise(resolve => {
      const dlg=document.createElement('dialog');
      dlg.setAttribute('aria-label','Senha do backup');
      dlg.style.cssText='width:min(92vw,380px);border:1px solid #6a7691;'+
        'border-radius:16px;padding:20px;background:#17243b;color:#fff;';
      const titulo=document.createElement('h3');
      titulo.textContent='Senha usada no backup';
      const texto=document.createElement('p');
      texto.textContent='Se o backup foi criado antes de trocar sua senha, '+
        'informe a senha antiga que protegia essas fichas.';
      const campo=document.createElement('input');
      campo.type='password';campo.autocomplete='off';
      campo.placeholder='Senha anterior do backup';
      campo.style.cssText='display:block;width:100%;box-sizing:border-box;'+
        'margin:12px 0;padding:12px;color:#17243b';
      const botoes=document.createElement('div');
      botoes.style.cssText='display:flex;gap:10px;justify-content:flex-end';
      const canc=document.createElement('button');
      canc.type='button';canc.textContent='Cancelar';
      const continuar=document.createElement('button');
      continuar.type='button';continuar.textContent='Conferir backup';
      botoes.append(canc,continuar);
      dlg.append(titulo,texto,campo,botoes);
      document.body.appendChild(dlg);
      let pronto=false;
      const fechar=valor=>{
        if(pronto) return;
        pronto=true;
        dlg.close();dlg.remove();campo.value='';resolve(valor);
      };
      canc.addEventListener('click',()=>fechar(''));
      continuar.addEventListener('click',()=>fechar(campo.value));
      dlg.addEventListener('cancel',e=>{e.preventDefault();fechar('');});
      campo.addEventListener('keydown',e=>{
        if(e.key==='Enter'){e.preventDefault();fechar(campo.value);}
      });
      dlg.showModal();campo.focus();
    });
  }

  restaurarBackup253.addEventListener('click',async () => {
    aviso.hidden=false;
    const inicial=dadosDaSessao();
    if (!inicial.id||!inicial.token) {
      aviso.textContent='Entre na carteira primeiro.';return;
    }
    if (QC_pendenciasV2374(inicial.id)) {
      aviso.textContent='⚠️ Conclua as operacoes V2 pendentes antes de recuperar fichas.';return;
    }
    const senha=await obterSenha265();
    if (!senha) return;
    arquivoRestaurar253.value='';
    arquivoRestaurar253.onchange=async () => {
      const arquivo=arquivoRestaurar253.files?.[0];
      if (!arquivo) return;
      restaurarBackup253.disabled=true;backup.disabled=true;conferir.disabled=true;
      aviso.textContent='Conferindo assinaturas e gastos do backup...';
      try {
        if(arquivo.size>10*1024*1024) throw Error('Arquivo excede 10 MB.');
        const pacote=JSON.parse(await arquivo.text());
        if(pacote?.formato!=='QUINTOSCOIN_BACKUP_ASSINADAS_V2'||
            pacote.versao!==2||pacote.idCarteira!==inicial.id||
            !pacote.registrosCifrados||typeof pacote.registrosCifrados!=='object'||
            Array.isArray(pacote.registrosCifrados))
          throw Error('Backup nao pertence a esta carteira ou formato invalido.');
        const entradas=Object.entries(pacote.registrosCifrados);
        if(!entradas.length||entradas.length>2000)
          throw Error('Quantidade de fichas de backup invalida.');
        let senhaBackup=senha;
        let importadas;
        try {importadas=await QC_validarBackupV2374(entradas,senhaBackup);}
        catch(erro) {
          if(!/Senha da ficha incorreta ou backup danificado/i.test(String(erro.message||erro)))
            throw erro;
          const anterior=await QC_perguntarSenhaBackup374();
          if(!anterior) throw Error('Recuperacao cancelada.');
          senhaBackup=anterior;
          importadas=await QC_validarBackupV2374(entradas,senhaBackup);
        }
        const atual=QC_registrosV2374(inicial.id);
        const existentes=await QC_validarBackupV2374(Object.entries(atual.registros),senha);
        const idsExistentes=new Set(existentes.map(x=>x.mensagemHex));
        const gastas=importadas.filter(x=>x.situacao==='GASTA');
        const repetidas=importadas.filter(x=>x.situacao==='DISPONIVEL' &&
          idsExistentes.has(x.mensagemHex));
        const novas=importadas.filter(x=>x.situacao==='DISPONIVEL' &&
          !idsExistentes.has(x.mensagemHex));
        if(!novas.length) {
          aviso.textContent='Nenhuma ficha nova: '+repetidas.length+
            ' ja presentes, '+gastas.length+' ja gastas.';
          return;
        }
        if(typeof window.QC_dialogoQuintos338!=='function')
          throw Error('Modal seguro de recuperacao indisponivel.');
        const autorizado=await window.QC_dialogoQuintos338({
          titulo:'Recuperar fichas assinadas',
          texto:'O servidor validou as assinaturas. Deseja importar apenas as fichas disponiveis?',
          detalhes:[
            {rotulo:'NOVAS FICHAS',valor:String(novas.length)},
            {rotulo:'TOTAL A RECUPERAR',valor:QC_formatoValor291(novas.reduce((n,x)=>n+x.valor,0))},
            {rotulo:'JA PRESENTES',valor:String(repetidas.length)},
            {rotulo:'JA GASTAS — IGNORADAS',valor:String(gastas.length)}
          ],confirmarTexto:'Recuperar fichas',cancelarTexto:'Cancelar'
        });
        if(!autorizado) {aviso.textContent='Recuperacao cancelada.';return;}
        const reconfirmadas=await QC_validarBackupV2374(novas.map(x=>[x.chave,x.registro]),senhaBackup);
        if (reconfirmadas.some(x=>x.situacao!=='DISPONIVEL'))
          throw Error('Situacao de uma ficha mudou. Nenhum registro foi importado.');
        if(dadosDaSessao().id!==inicial.id||dadosDaSessao().token!==inicial.token||
            QC_registrosV2374(inicial.id).texto!==atual.texto||
            QC_pendenciasV2374(inicial.id))
          throw Error('Carteira ou operacoes mudaram. Repita a recuperacao.');
        // Recriptografar sempre usando a senha ATUAL da carteira. Assim,
        // backups produzidos com senha anterior nao bloqueiam logins futuros.
        const novasProtegidas=await QC_emParalelo343(novas,async x=>({
          registro:await QC_cifrar271(await abrir(x.registro,senhaBackup),senha)
        }));
        if(dadosDaSessao().id!==inicial.id||dadosDaSessao().token!==inicial.token||
            QC_registrosV2374(inicial.id).texto!==atual.texto||
            QC_pendenciasV2374(inicial.id))
          throw Error('Carteira mudou durante a recriptografia.');
        const destino=Object.assign(Object.create(null),atual.registros);
        for(const x of novasProtegidas){
          let k;
          do{k='QC-REC-V2-'+crypto.randomUUID();}
          while(Object.prototype.hasOwnProperty.call(destino,k));
          destino[k]=x.registro;
        }
        localStorage.setItem('QC_FICHAS_ASSINADAS_V2_'+inicial.id,
          JSON.stringify(destino));
        memoriaV2365=null;
        renderizar();
        try {
          await QC_conferirSaldo291();
          aviso.textContent='✅ Recuperadas '+novas.length+' fichas disponíveis. Saldo atualizado.';
        }catch(erro) {
          aviso.textContent='✅ Fichas salvas. Conferencia de saldo pendente: '+
            String(erro.message||erro);
        }
      }catch(erro){aviso.textContent='⚠️ Nenhuma ficha importada: '+String(erro.message||erro);}
      finally{
        arquivoRestaurar253.value='';
        restaurarBackup253.disabled=false;backup.disabled=false;conferir.disabled=false;
      }
    };
    arquivoRestaurar253.click();
  });


  // PASSO 291 — Migracao de senha local, sem alterar o conteudo das fichas.
  // A senha da conta fica APENAS em memoria nesta guia, nunca em storage.
  function QC_chavesMigracao291(id) {
    const prefixosResgate=["QC_RESGATE_LOCAL_V1_"+id+"_",
      "QC_RESGATE_LOCAL_V2_"+id+"_"];
    const fixas=["QC_FICHAS_ASSINADAS_V1_"+id,
      "QC_FICHAS_CEGAS_PENDENTES_V1_"+id,
      "QC_DOACAO_PENDENTE_V1_"+id,
      "QC_TRANSFERENCIA_ENVIO_V1_"+id,
      "QC_TRANSFERENCIA_RESGATE_V1_"+id,
      "QC_FICHAS_ASSINADAS_V2_"+id,
      "QC_FICHAS_CEGAS_PENDENTES_V2_"+id,
      "QC_DOACAO_PENDENTE_V2_"+id,
      "QC_TRANSFERENCIA_ENVIO_V2_"+id,
      "QC_TRANSFERENCIA_RESGATE_V2_"+id];
    return [...fixas.filter(k=>localStorage.getItem(k)!==null),
      ...Object.keys(localStorage).filter(k=>prefixosResgate.some(p=>k.startsWith(p)))];
  }
  function QC_recuperarMigracao291(id) {
    const marca="QC_MIGRACAO_SENHA_291_"+id;
    const texto=localStorage.getItem(marca);
    if(!texto) return;
    const dados=JSON.parse(texto);
    if(dados?.id!==id || dados?.versao!==1 || !dados?.originais ||
       typeof dados.originais!=="object") {
      throw Error("Migração anterior inconsistente. Preserve o navegador.");
    }
    for(const [chave,valor] of Object.entries(dados.originais)) {
      if(typeof valor!=="string") throw Error("Backup de migração inválido.");
      localStorage.setItem(chave,valor);
    }
    localStorage.removeItem(marca);
  }
  async function QC_migrarSenhaLocal291(antiga,nova) {
    const sessao=dadosDaSessao();
    if(!sessao.id||!sessao.token) throw Error("Entre na carteira novamente.");
    const id=sessao.id;
    QC_recuperarMigracao291(id);
    if(antiga===nova) return;
    const chaves=QC_chavesMigracao291(id);
    const originais={};
    const novos={};
    function cifrado(v) {
      return v&&typeof v==="object"&&!Array.isArray(v)&&v.versao===1&&
        typeof v.dadosHex==="string";
    }
    for(const chave of chaves) {
      const original=localStorage.getItem(chave);
      if(original===null) continue;
      originais[chave]=original;
      const obj=JSON.parse(original);
      if(cifrado(obj)) {
        novos[chave]=JSON.stringify(await QC_cifrar271(await abrir(obj,antiga),nova));
      }else if(obj&&typeof obj==="object"&&!Array.isArray(obj)) {
        const alterado={};
        for(const [chaveFicha,registro] of Object.entries(obj)) {
          if(!cifrado(registro)) throw Error("Registro local nao reconhecido: "+chave);
          alterado[chaveFicha]=await QC_cifrar271(await abrir(registro,antiga),nova);
        }
        novos[chave]=JSON.stringify(alterado);
      }else throw Error("Estrutura criptografada nao reconhecida.");
    }
    // Prepare todas as cifragens ANTES de escrever. O marcador preserva os
    // valores originais para uma eventual interrupcao entre as gravacoes.
    const marca="QC_MIGRACAO_SENHA_291_"+id;
    localStorage.setItem(marca,JSON.stringify({id,versao:1,originais}));
    try {
      for(const [chave,original] of Object.entries(originais)) {
        if(localStorage.getItem(chave)!==original) throw Error("Dados locais mudaram durante a migracao.");
      }
      for(const [chave,valor] of Object.entries(novos)) localStorage.setItem(chave,valor);
      localStorage.removeItem(marca);
    }catch(erro) {
      QC_recuperarMigracao291(id);
      throw erro;
    }
  }
  window.QC_limparSenhaSessao291=function() {
    senhaSessao265=null;
    memoria=null;
    renderizar();
  };
  window.QC_senhaFichas291=function() {
    const s=dadosDaSessao();
    return senhaSessao265?.id===s.id&&senhaSessao265?.token===s.token
      ? senhaSessao265.valor : "";
  };
  window.QC_aposLogin291=async function(senhaLogin) {
    const sessao=dadosDaSessao();
    if(!sessao.id||!sessao.token||!senhaLogin) throw Error("Sessao nao autenticada.");
    QC_recuperarMigracao291(sessao.id);
    const chaves=QC_chavesMigracao291(sessao.id);
    let primeira=null;
    for(const chave of chaves) {
      const dados=JSON.parse(localStorage.getItem(chave));
      if(dados?.versao===1 && dados.dadosHex) {primeira=dados;break;}
      if(dados&&typeof dados==="object"&&!Array.isArray(dados)) {
        primeira=Object.values(dados).find(v=>v?.versao===1&&v?.dadosHex);
        if(primeira) break;
      }
    }
    if(primeira) {
      try {await abrir(primeira,senhaLogin);} catch(_) {
        // So o primeiro login com fichas antigas (ou apos mudar a senha)
        // pede a senha de protecao anterior, uma unica vez para a migracao.
        const anterior=await obterSenha265();
        if(!anterior) throw Error("Migracao cancelada. As fichas antigas foram preservadas.");
        await abrir(primeira,anterior);
        await QC_migrarSenhaLocal291(anterior,senhaLogin);
      }
    }
    memorizarSenha265(senhaLogin,sessao);
    try {
      await QC_conferirSaldo291();
      const info=document.getElementById("mensagem");
      if(info) info.textContent="";
    } catch(e) {throw e;}
    return {status:"OK"};
  };
  window.QC_migrarSenhaLogin291=async function(senhaAntiga,senhaNova) {
    const sessao=dadosDaSessao();
    if(!sessao.id||!sessao.token) throw Error("Sessao encerrada.");
    await QC_migrarSenhaLocal291(senhaAntiga,senhaNova);
    memorizarSenha265(senhaNova,sessao);
  };
  // Reconsulta quando o usuario retorna a aba; sem digitar outra senha.
  document.addEventListener("visibilitychange",()=>{
    if(!document.hidden && window.QC_senhaFichas291()) {
      // PASSO 344: se a sacola já está preparada/acionada, não atrasar
      // a câmera refazendo todas as consultas de saldo. O servidor
      // continua validando fichas no ato da doação.
      if(localStorage.getItem(QC_pendenteChave271())) return;
      QC_conferirSaldo291().catch(()=>{});
    }
  });
  window.QC_atualizarSaldoReal202=function(){
    if(window.QC_senhaFichas291()) return QC_conferirSaldo291();
    return renderizar();
  };

  renderizar();
})();
