// QUINTOSCOIN - PASSO 291 - SALDO AUTOMATICO COM A SENHA DO LOGIN
// Mantem saldo, backup, recuperacao e a consulta de fichas gastas.
// Doacoes: rotas anonimas + fila local criptografada. Transferencias ainda nao integradas.
// Servidor conserva os bloqueios de doacao e troco ate liberacao final.
(function () {
  "use strict";

  const dec = new TextDecoder();
  const enc = new TextEncoder();
  let memoria = null;
  let senhaSessao265 = null;
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

  function dadosDaSessao() {
    const id = localStorage.getItem("QC_ID_CARTEIRA");
    const token = sessionStorage.getItem("QC_TOKEN_SESSAO_TESTE");
    return {id, token};
  }

  function renderizar() {
    const {id, token} = dadosDaSessao();
    if (!memoria || memoria.id !== id || memoria.token !== token) {
      memoria = null;
    }
    const saldo = document.getElementById("saldo");
    const equivalente = document.getElementById("equivalente");
    const lista = document.getElementById("listaFichas");
    if (!saldo || !equivalente || !lista) return;

    const rotulo = document.querySelector("#telaCarteira .saldo p");
    if (rotulo) rotulo.textContent = "Fichas disponiveis e verificadas";
    lista.replaceChildren();
    if (!memoria) {
      saldo.textContent = token ? "Qc$ --" : "Qc$ 0,00";
      equivalente.textContent = token
        ? "Conferindo saldo..." : "R$ 0,00";
      lista.textContent = token
        ? "Aguardando verificação automática."
        : "Entre na carteira para consultar suas fichas.";
      return;
    }

    saldo.textContent = QC_formatoValor291(memoria.total);
    equivalente.textContent = memoria.total.toLocaleString("pt-BR", {
      style: "currency", currency: "BRL"
    });
    for (const ficha of memoria.fichas) {
      const div = document.createElement("div");
      div.className = "ficha";
      div.textContent = ficha.valor + " QC — " + ficha.idChave +
        " — assinatura verificada";
      lista.appendChild(div);
    }
    if (!memoria.fichas.length) {
      lista.textContent = "Nenhuma ficha disponivel nesta carteira.";
    }
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

  // Disponibilizar apenas o PLANO matematico ao botao original Doar QC.
  // Nao divulga mensagens, assinaturas, senha ou registros criptografados.
  window.QC_planejarMovimento267 = function(valor) {
    const {id, token} = dadosDaSessao();
    if (!id || !token || !memoria ||
        memoria.id !== id || memoria.token !== token) {
      return {
        status:"SALDO_NAO_VERIFICADO",
        mensagem:"Atualize seu saldo antes de continuar."
      };
    }
    return QC_planejarComposicao267(
      memoria.fichas.map(f => f.valor), valor
    );
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
  async function QC_fichasAtuais271(senha) {
    const todos = lerRegistros();
    const fichas = [], chaves = new Map(), msgs = new Set();
    for (const [chaveLocalRegistro, cifrado] of Object.entries(todos)) {
      const ficha = await abrir(cifrado,senha);
      const valor = Number(ficha?.valor);
      if (ficha?.formato!=="QC_FICHA_ASSINADA_V1" ||
          ![2,5,10].includes(valor) || ficha.idChave!=="QC-"+valor+"-V1" ||
          !/^[0-9a-f]{1024}$/i.test(String(ficha.assinaturaHex||""))) {
        throw Error("Existe uma ficha local invalida. Nenhuma doacao realizada.");
      }
      const m = deHex(String(ficha.mensagemHex||"").toLowerCase());
      const frase = dec.decode(m.subarray(32));
      if (m.length < 80 || !new RegExp("^QUINTOSCOIN\\|V1\\|"+valor+"\\|QC-"+valor+"-V1\\|[0-9a-f-]{36}$","i").test(frase) ||
          msgs.has(ficha.mensagemHex.toLowerCase())) {
        throw Error("Ficha local inconsistente ou duplicada.");
      }
      msgs.add(ficha.mensagemHex.toLowerCase());
      let pub=chaves.get(valor);
      if (!pub) {pub=await QC_publica271(valor);chaves.set(valor,pub);}
      if (!(await crypto.subtle.verify({name:"RSA-PSS",saltLength:48},pub.verify,
        deHex(ficha.assinaturaHex),m))) {
        throw Error("Assinatura de ficha nao confere.");
      }
      const situacao=await consultarFicha263(ficha);
      if (situacao === "DISPONIVEL") {
        fichas.push({chaveLocalRegistro, valor,
          mensagemHex:ficha.mensagemHex, assinaturaHex:ficha.assinaturaHex});
      }
    }
    return fichas;
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
  window.QC_doarValor271=async function(valor) {
    if (movimentando271) throw Error("Ja existe uma doacao em andamento.");
    movimentando271=true;
    try {
      const inicio=dadosDaSessao();
      if (!inicio.id || !inicio.token) throw Error("Entre na carteira antes de doar.");
      const segredo=await obterSenha265();
      if (!segredo) return {status:"CANCELADO"};
      const chavePendente=QC_pendenteChave271();
      if (localStorage.getItem(chavePendente)) {
        const pendente=await abrir(JSON.parse(localStorage.getItem(chavePendente)),segredo);
        if (!pendente || pendente.versao!==1 || !pendente.idOperacao ||
            !Array.isArray(pendente.fichasEntrada)) {
          throw Error("Doacao pendente inconsistente. Preserve os dados locais.");
        }
        const retomar=window.confirm("Existe uma doacao anterior ainda sem confirmacao local. Deseja consultar e retomar essa operacao, sem criar outra?");
        if (!retomar) return {status:"PENDENTE"};
        return await QC_retomar271(pendente,segredo);
      }
      const disponiveis=await QC_fichasAtuais271(segredo);
      const plano=QC_planejarComposicao267(disponiveis.map(x=>x.valor),valor);
      if (plano.status!=="OK") throw Error(plano.mensagem||plano.status);
      const aceito=window.confirm(
        "Confirmar doacao anonima de "+plano.valorSolicitado+" QC?\n\n"+
        "Fichas utilizadas: "+plano.valoresSelecionados.length+" (total "+plano.totalFichasSelecionadas+" QC)\n"+
        (plano.valorTroco ? "Troco automatico: "+plano.valorTroco+" QC\n" : "Sem necessidade de troco.\n")+
        "\nNao sera exibida sua identidade ao tesoureiro.");
      if (!aceito) return {status:"CANCELADO"};
      if (dadosDaSessao().id!==inicio.id || dadosDaSessao().token!==inicio.token) {
        throw Error("Sessao alterada; operacao cancelada antes do gasto.");
      }
      const entradas=plano.indicesSelecionados.map(i => {
        const f=disponiveis[i];
        return {mensagemHex:f.mensagemHex,assinaturaHex:f.assinaturaHex};
      });
      const op={versao:1,idOperacao:crypto.randomUUID().toLowerCase(),
        tipo:plano.tipo,valorDoacao:plano.valorSolicitado,
        valorTroco:plano.valorTroco,fichasEntrada:entradas,
        saidasCegas:[],privadas:[]};
      if (plano.valorTroco) {
        const troco=await QC_prepararTroco271(plano);
        op.saidasCegas=troco.saidasCegas;
        op.privadas=troco.privadas;
      }
      // Todo material de recuperacao fica cifrado ANTES do primeiro POST.
      const cifrado=await QC_cifrar271(op,segredo);
      if (localStorage.getItem(chavePendente)) {
        throw Error("Outra operacao foi preparada. Retome-a primeiro.");
      }
      localStorage.setItem(chavePendente,JSON.stringify(cifrado));
      memorizarSenha265(segredo,inicio);
      return await QC_retomar271(op,segredo);
    } finally {
      movimentando271=false;
    }
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
      if (!window.confirm(
        "Transferir " + valor + " QC?\n\n" +
        "O sistema utilizara " + plano.valoresSelecionados.join(" + ") + " QC.\n" +
        (plano.valorTroco ? "Troco automatico: "+plano.valorTroco+" QC.\n" : "") +
        "\nDepois compartilhe o QR Code com o destinatario.")) {
        return {status:"CANCELADO"};
      }
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
      if (!window.confirm("Receber "+valor+" QC nesta carteira?")) {
        return {status:"CANCELADO"};
      }
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
  window.QC_solicitarResgate278 = async function(valor) {
    if (ocupadaResgate278) throw Error("Outra operacao de resgate esta em andamento.");
    ocupadaResgate278=true;
    try {
      const inicio=dadosDaSessao();
      if (!inicio.id || !inicio.token) throw Error("Entre na carteira primeiro.");
      if (!Number.isSafeInteger(Number(valor)) || Number(valor)<2 || Number(valor)===3) {
        throw Error("Informe um valor inteiro a partir de 2 QC, exceto 3 QC.");
      }
      const senha=await obterSenha265();
      if (!senha) return {status:"CANCELADO_PELO_USUARIO"};
      memorizarSenha265(senha,inicio);
      const fichas=await QC_fichasAtuais271(senha);
      const plano=QC_planejarComposicao267(fichas.map(f=>f.valor), Number(valor));
      if (plano.status!=="OK") throw Error(plano.mensagem||plano.status);
      const confirmar=window.confirm(
        "Solicitar resgate de " + plano.valorSolicitado + " QC?\n\n" +
        "As fichas ficarao reservadas ate o pagamento ou cancelamento " +
        "autorizado pelo tesoureiro.\n" +
        (plano.valorTroco ? "Troco automatico: "+plano.valorTroco+" QC.\n" : "")+
        "O pagamento sera combinado diretamente com o tesoureiro.");
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
      return await QC_sincronizarResgate278(op,senha);
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
      return await QC_sincronizarResgate278(op,senha);
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
  resumo.textContent = "Seguranca e recuperacao";
  resumo.style.cssText = "cursor:pointer;font-size:14px;opacity:.9";
  detalhes.append(
    resumo, backup,
    restaurarBackup253, arquivoRestaurar253,
    aviso
  );
  titulo.textContent = "Meu saldo";
  conferir.textContent = "Atualizar saldo";
  // Saldo principal ja mostra a verificacao automatica.
  titulo.hidden = true;
  conferir.hidden = true;
  aviso.hidden = true;
  painel.style.cssText = "padding:0;border:0;margin-top:4px";
  painel.append(titulo, conferir, detalhes);
  const senhaAcao=document.getElementById("btnAbrirTrocaSenha");
  const senhaPainel=document.getElementById("qcPainelTrocaSenha");
  if(senhaAcao && senhaPainel) detalhes.append(senhaAcao,senhaPainel);
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

  const QC_conferirSaldo291 = async () => {
    const {id, token} = dadosDaSessao();
    const segredo = await obterSenha265();
    if (!id || !token) {
      aviso.textContent = "Entre na carteira primeiro.";
      return;
    }
    if (!segredo) {
      aviso.textContent = "Digite a senha usada para proteger a ficha.";
      return;
    }
    conferir.disabled = true;
    aviso.textContent = "Desbloqueando e verificando assinaturas...";

    try {
      if (!crypto.subtle) throw Error("Criptografia indisponível.");
      const registros = Object.values(lerRegistros());
      const fichas = [];
      const mensagens = new Set();
      let gastas = 0;

      // PASSO 225 - Verificar cada ficha com a chave de sua denominacao.
      // A mesma chave publica e consultada apenas uma vez por valor.
      const chaves = new Map();
      const uuid = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;

      for (const registro of registros) {
        const ficha = await abrir(registro, segredo);
        const valor = ficha?.valor;

        if (
          !ficha ||
          ficha.formato !== "QC_FICHA_ASSINADA_V1" ||
          ![2, 5, 10].includes(valor) ||
          ficha.idChave !== "QC-" + valor + "-V1" ||
          !/^[0-9a-f]{1024}$/i.test(ficha.assinaturaHex || "")
        ) {
          throw Error("Ficha assinada com estrutura invalida.");
        }

        const mensagemHex = String(ficha.mensagemHex || "").toLowerCase();
        const msg = deHex(mensagemHex);
        if (msg.length < 80) {
          throw Error("Mensagem da ficha incompleta.");
        }

        const texto = new TextDecoder("utf-8", {fatal:true})
          .decode(msg.subarray(32));
        const partes = texto.split("|");
        if (
          partes.length !== 5 ||
          partes[0] !== "QUINTOSCOIN" ||
          partes[1] !== "V1" ||
          partes[2] !== String(valor) ||
          partes[3] !== ficha.idChave ||
          !uuid.test(partes[4])
        ) {
          throw Error("Conteudo da ficha invalido.");
        }

        if (mensagens.has(mensagemHex)) {
          throw Error("Ficha duplicada no armazenamento.");
        }
        mensagens.add(mensagemHex);

        let chave = chaves.get(valor);
        if (!chave) {
          const resposta = await QC_post191("qc_chave_publica_" + valor);
          const nHex = String(resposta.moduloHex || "").toLowerCase();
          const eHex = String(resposta.expoenteHex || "").toLowerCase();
          if (
            resposta.status !== "OK" ||
            resposta.idChave !== "QC-" + valor + "-V1" ||
            !/^[89a-f][0-9a-f]{1023}$/.test(nHex) ||
            !/^0*10001$/.test(eHex)
          ) {
            throw Error("Chave publica de " + valor + " QC indisponivel.");
          }
          const eNormal = eHex.length % 2 ? "0" + eHex : eHex;
          chave = await crypto.subtle.importKey(
            "jwk",
            {
              kty:"RSA", n:base64url(deHex(nHex)),
              e:base64url(deHex(eNormal)),
              ext:true, key_ops:["verify"]
            },
            {name:"RSA-PSS", hash:"SHA-384"}, false, ["verify"]
          );
          chaves.set(valor, chave);
        }

        const valida = await crypto.subtle.verify(
          {name:"RSA-PSS", saltLength:48}, chave,
          deHex(ficha.assinaturaHex), msg
        );
        if (!valida) {
          throw Error("Assinatura de ficha de " + valor + " QC nao verificada.");
        }
        // A assinatura prova autenticidade, mas NAO prova que a ficha
        // ainda esta disponivel. Consultar o servidor obrigatoriamente.
        const situacao = await consultarFicha263(ficha);
        if (situacao === "GASTA") {
          gastas++;
          continue;
        }
        fichas.push({valor, idChave:ficha.idChave});
      }

      const agora = dadosDaSessao();
      if (agora.id !== id || agora.token !== token) {
        throw Error("A sessão mudou durante a conferência.");
      }
      memoria = {
        id, token, fichas, gastas,
        total:fichas.reduce((soma, ficha) => soma + ficha.valor, 0)
      };
      memorizarSenha265(segredo, {id, token});
      renderizar();
      aviso.textContent = "✅ Saldo disponivel: " + memoria.total +
        " QC em " + fichas.length + " ficha(s). " + gastas +
        " ficha(s) ja gastas foram excluidas do saldo.";
    } catch (erro) {
      memoria = null;
      renderizar();
      aviso.textContent = "⚠️ " + erro.message;
      throw erro;
    } finally {
      conferir.disabled = false;
    }
  };
  conferir.addEventListener("click", () => {
    QC_conferirSaldo291().catch(erro => {
      const msg=document.getElementById("mensagem");
      if(msg) msg.textContent="⚠️ "+(erro.message||erro);
    });
  });

  backup.addEventListener("click", () => {
    aviso.hidden = false;
    try {
      if (!dadosDaSessao().token) {
        throw Error("Entre na carteira primeiro.");
      }
      const registros = lerRegistros();
      if (!Object.keys(registros).length) {
        throw Error("Nenhuma ficha assinada encontrada.");
      }
      const dados = {
        formato:"QUINTOSCOIN_BACKUP_ASSINADAS_V1",
        criadoEm:new Date().toISOString(),
        registrosCifrados:Object.values(registros)
      };
      const blob = new Blob([JSON.stringify(dados, null, 2)], {
        type:"application/json"
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "QuintosCoin_backup_assinadas.json";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      aviso.textContent = "Backup solicitado. Confira a pasta Downloads.";
    } catch (erro) {
      aviso.textContent = "⚠️ " + erro.message;
    }
  });

  // PASSO 253 - Importa apenas fichas novas depois de validar TODAS as
  // assinaturas e conferir duplicatas com as fichas ja existentes.
  // A gravacao e unica e nao altera fichas anteriores.
  restaurarBackup253.addEventListener("click", async () => {
    aviso.hidden = false;
    const sessaoInicial = dadosDaSessao();
    if (!sessaoInicial.id || !sessaoInicial.token) {
      aviso.textContent = "Entre na carteira primeiro.";
      return;
    }

    const segredo = await obterSenha265();
    if (!segredo) {
      aviso.textContent = "Digite a senha das fichas antes de selecionar o backup.";
      return;
    }

    arquivoRestaurar253.value = "";
    arquivoRestaurar253.onchange = async () => {
      const arquivo = arquivoRestaurar253.files?.[0];
      if (!arquivo) return;

      restaurarBackup253.disabled = true;
      conferir.disabled = true;
      backup.disabled = true;
      aviso.textContent = "Verificando fichas do backup e da carteira...";

      try {
        if (!crypto?.subtle || !crypto.randomUUID) {
          throw Error("Criptografia segura indisponivel.");
        }
        if (arquivo.size > 10 * 1024 * 1024) {
          throw Error("Arquivo de backup excede o tamanho permitido.");
        }

        const dados = JSON.parse(await arquivo.text());
        if (
          !dados ||
          dados.formato !== "QUINTOSCOIN_BACKUP_ASSINADAS_V1" ||
          !Array.isArray(dados.registrosCifrados) ||
          dados.registrosCifrados.length === 0 ||
          dados.registrosCifrados.length > 2000
        ) {
          throw Error("Formato de backup assinado invalido.");
        }

        const chaves = new Map();
        const uuid = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;

        async function validarFicha253(registro) {
          const ficha = await abrir(registro, segredo);
          const valor = ficha?.valor;
          const idChave = "QC-" + valor + "-V1";

          if (
            !ficha ||
            ficha.formato !== "QC_FICHA_ASSINADA_V1" ||
            ![2, 5, 10].includes(valor) ||
            ficha.idChave !== idChave ||
            !/^[0-9a-f]{1024}$/i.test(ficha.assinaturaHex || "")
          ) {
            throw Error("Ficha com estrutura invalida.");
          }

          const mensagemHex = String(ficha.mensagemHex || "").toLowerCase();
          const mensagem = deHex(mensagemHex);
          if (mensagem.length < 80) {
            throw Error("Mensagem da ficha incompleta.");
          }

          const conteudo = new TextDecoder("utf-8", {fatal:true})
            .decode(mensagem.subarray(32));
          const partes = conteudo.split("|");
          if (
            partes.length !== 5 ||
            partes[0] !== "QUINTOSCOIN" ||
            partes[1] !== "V1" ||
            partes[2] !== String(valor) ||
            partes[3] !== idChave ||
            !uuid.test(partes[4])
          ) {
            throw Error("Conteudo da ficha invalido.");
          }

          let chave = chaves.get(valor);
          if (!chave) {
            // Apenas consulta a chave PUBLICA; nao envia a ficha ao servidor.
            const resposta = await QC_post191("qc_chave_publica_" + valor);
            const nHex = String(resposta.moduloHex || "").toLowerCase();
            const eHex = String(resposta.expoenteHex || "").toLowerCase();

            if (
              resposta.status !== "OK" ||
              resposta.idChave !== idChave ||
              !/^[89a-f][0-9a-f]{1023}$/.test(nHex) ||
              !/^0*10001$/.test(eHex)
            ) {
              throw Error("Chave publica de " + valor + " QC indisponivel.");
            }

            const eNormal = eHex.length % 2 ? "0" + eHex : eHex;
            chave = await crypto.subtle.importKey(
              "jwk",
              {
                kty:"RSA", n:base64url(deHex(nHex)),
                e:base64url(deHex(eNormal)),
                ext:true, key_ops:["verify"]
              },
              {name:"RSA-PSS", hash:"SHA-384"}, false, ["verify"]
            );
            chaves.set(valor, chave);
          }

          const confere = await crypto.subtle.verify(
            {name:"RSA-PSS", saltLength:48}, chave,
            deHex(ficha.assinaturaHex), mensagem
          );
          if (!confere) {
            throw Error("Assinatura de " + valor + " QC invalida.");
          }

          // Usar a mensagem assinada como identidade, pois o mesmo QC
          // pode ter sido salvo com criptografias diferentes.
          const situacao = await consultarFicha263(ficha);
          return {mensagemHex, valor, situacao};
        }

        const mensagensBackup = new Set();
        const fichasBackup = [];
        for (const registro of dados.registrosCifrados) {
          const ficha = await validarFicha253(registro);
          if (mensagensBackup.has(ficha.mensagemHex)) {
            throw Error("O backup contem fichas duplicadas.");
          }
          mensagensBackup.add(ficha.mensagemHex);
          fichasBackup.push({registro, ...ficha});
        }

        // Ler e validar o armazenamento ANTES de propor qualquer gravacao.
        const chave = chaveLocal();
        const textoAnterior = localStorage.getItem(chave);
        const atuais = textoAnterior === null
          ? {}
          : JSON.parse(textoAnterior);
        if (!atuais || typeof atuais !== "object" ||
            Array.isArray(atuais)) {
          throw Error("Armazenamento atual da carteira invalido.");
        }

        const mensagensAtuais = new Set();
        for (const registro of Object.values(atuais)) {
          const ficha = await validarFicha253(registro);
          if (mensagensAtuais.has(ficha.mensagemHex)) {
            throw Error("A carteira ja contem fichas duplicadas.");
          }
          mensagensAtuais.add(ficha.mensagemHex);
        }

        const gastasNoBackup = fichasBackup.filter(
          ficha => ficha.situacao === "GASTA"
        ).length;
        const disponiveisBackup = fichasBackup.filter(
          ficha => ficha.situacao === "DISPONIVEL"
        );
        const novas = disponiveisBackup.filter(
          ficha => !mensagensAtuais.has(ficha.mensagemHex)
        );
        const repetidas = disponiveisBackup.length - novas.length;
        memorizarSenha265(segredo, sessaoInicial);

        if (novas.length === 0) {
          aviso.textContent = "✅ Nenhuma ficha importada: " + repetidas +
            " ja presente(s) e " + gastasNoBackup +
            " ja gasta(s). Nenhuma ficha alterada.";
          return;
        }

        const totalNovo = novas.reduce((soma, ficha) =>
          soma + ficha.valor, 0
        );

        const permitir = window.confirm(
          "Backup validado.\n\n" +
          novas.length + " ficha(s) nova(s), total de " +
          totalNovo + " QC.\n" +
          repetidas + " ja presente(s) e " + gastasNoBackup +
          " ja gasta(s) serao ignoradas.\n\n" +
          "Deseja importar somente as fichas disponiveis?"
        );
        if (!permitir) {
          aviso.textContent = "Restauracao cancelada. Nenhuma ficha alterada.";
          return;
        }

        // Verificacoes finais: impedir importacao se a sessao ou os
        // registros mudaram enquanto o backup era conferido.
        const sessaoAtual = dadosDaSessao();
        if (
          sessaoAtual.id !== sessaoInicial.id ||
          sessaoAtual.token !== sessaoInicial.token ||
          localStorage.getItem(chave) !== textoAnterior
        ) {
          throw Error("Carteira ou sessao mudou. Repita a restauracao.");
        }

        const atualizados = Object.assign(Object.create(null), atuais);
        for (const ficha of novas) {
          let chaveFicha;
          do {
            chaveFicha = "QC-REC-" + crypto.randomUUID();
          } while (Object.prototype.hasOwnProperty.call(
            atualizados, chaveFicha
          ));
          atualizados[chaveFicha] = ficha.registro;
        }

        // Uma unica gravacao; nao remove nem substitui fichas antigas.
        localStorage.setItem(chave, JSON.stringify(atualizados));
        memoria = null;
        renderizar();

        const mensagemRecuperacao = "✅ Recuperacao concluida: " +
          novas.length + " ficha(s), " + totalNovo +
          " QC disponiveis adicionados. " + repetidas +
          " repetida(s) e " + gastasNoBackup +
          " ja gasta(s) ignoradas.";
        try {
          await QC_conferirSaldo291();
          aviso.textContent = mensagemRecuperacao + " Saldo atualizado.";
        } catch (erroSaldo) {
          // Fichas salvas permanecem intactas mesmo que a consulta de
          // disponibilidade no servidor falhe neste momento.
          aviso.textContent = mensagemRecuperacao +
            " Atualizacao do saldo pendente: " + erroSaldo.message;
        }

      } catch (erro) {
        aviso.textContent = "⚠️ Restauracao nao realizada: " + erro.message;
      } finally {
        arquivoRestaurar253.value = "";
        restaurarBackup253.disabled = false;
        conferir.disabled = false;
        backup.disabled = false;
      }
    };

    arquivoRestaurar253.click();
  });




  // PASSO 291 — Migracao de senha local, sem alterar o conteudo das fichas.
  // A senha da conta fica APENAS em memoria nesta guia, nunca em storage.
  function QC_chavesMigracao291(id) {
    const prefixoResgate="QC_RESGATE_LOCAL_V1_"+id+"_";
    const fixas=["QC_FICHAS_ASSINADAS_V1_"+id,
      "QC_FICHAS_CEGAS_PENDENTES_V1_"+id,
      "QC_DOACAO_PENDENTE_V1_"+id,
      "QC_TRANSFERENCIA_ENVIO_V1_"+id,
      "QC_TRANSFERENCIA_RESGATE_V1_"+id];
    return [...fixas.filter(k=>localStorage.getItem(k)!==null),
      ...Object.keys(localStorage).filter(k=>k.startsWith(prefixoResgate))];
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
      QC_conferirSaldo291().catch(()=>{});
    }
  });
  window.QC_atualizarSaldoReal202=function(){
    if(window.QC_senhaFichas291()) return QC_conferirSaldo291();
    return renderizar();
  };

  renderizar();
})();
