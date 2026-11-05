// QUINTOSCOIN - INTERFACE LIMPA, PLANEJAMENTO E DOACAO ANONIMA - Passo 271
// Mantem saldo, backup, recuperacao e a consulta de fichas gastas.
// Doacoes: rotas anonimas + fila local criptografada. Transferencias ainda nao integradas.
// Servidor conserva os bloqueios de doacao e troco ate liberacao final.
(function () {
  "use strict";

  const dec = new TextDecoder();
  const enc = new TextEncoder();
  let memoria = null;
  let senhaSessao265 = null;

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
      saldo.textContent = token ? "🔒 QC" : "0 QC";
      equivalente.textContent = token
        ? "Verifique suas fichas para visualizar o saldo"
        : "R$ 0,00";
      lista.textContent = token
        ? "Fichas protegidas. Toque em ‘Verificar meu saldo’ abaixo."
        : "Entre na carteira para consultar suas fichas.";
      return;
    }

    saldo.textContent = memoria.total + " QC";
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
    if (!Number.isSafeInteger(total) || total < 0 || total > 10000) {
      return null;
    }
    const opcoes = Array(total + 1).fill(null);
    opcoes[0] = [];
    for (let soma = 1; soma <= total; soma++) {
      for (const valor of [10, 5, 2]) {
        if (soma < valor || !opcoes[soma - valor]) continue;
        const candidata = [...opcoes[soma - valor], valor];
        if (!opcoes[soma] || candidata.length < opcoes[soma].length) {
          opcoes[soma] = candidata;
        }
      }
    }
    return opcoes[total];
  }

  function QC_planejarComposicao267(valoresDisponiveis, valorSolicitado) {
    const valor = Number(valorSolicitado);
    if (!Number.isSafeInteger(valor) || valor < 2 || valor === 3) {
      return {status:"VALOR_NAO_PERMITIDO", mensagem:"O valor deve ser inteiro, a partir de 2 QC, exceto 3 QC."};
    }
    if (!Array.isArray(valoresDisponiveis)) {
      return {status:"CARTEIRA_INDISPONIVEL"};
    }
    const itens = valoresDisponiveis.map((v, indice) => ({
      valor:Number(v), indice
    }));
    if (itens.some(item => ![2,5,10].includes(item.valor))) {
      return {status:"DENOMINACAO_INVALIDA"};
    }
    const saldo = itens.reduce((soma, i) => soma + i.valor, 0);
    if (!Number.isSafeInteger(saldo) || saldo > 10000) {
      return {status:"LIMITE_OPERACIONAL", mensagem:"Saldo acima do limite de planejamento por operacao."};
    }
    if (valor > saldo) {
      return {status:"SALDO_INSUFICIENTE", saldoDisponivel:saldo};
    }

    // As fichas sao indivisiveis: para cada soma, guardar a selecao
    // que utiliza menos fichas. Isso evita a explosao de combinacoes.
    const estados = new Map([[0, []]]);
    for (const item of itens) {
      const anteriores = [...estados.entries()];
      for (const [soma, indices] of anteriores) {
        if (indices.length >= 50) continue;
        const proximaSoma = soma + item.valor;
        const selecionadas = estados.get(proximaSoma);
        if (!selecionadas || indices.length + 1 < selecionadas.length) {
          estados.set(proximaSoma, [...indices, item.indice]);
        }
      }
    }

    let melhor = null;
    for (const [soma, indices] of estados) {
      if (soma < valor) continue;
      const valorTroco = soma - valor;
      const fichasTroco = QC_decomporTroco267(valorTroco);
      if (!fichasTroco || fichasTroco.length > 50) continue;
      const candidato = {soma, indices, valorTroco, fichasTroco};
      if (!melhor ||
          candidato.valorTroco < melhor.valorTroco ||
          (candidato.valorTroco === melhor.valorTroco &&
            candidato.indices.length < melhor.indices.length) ||
          (candidato.valorTroco === melhor.valorTroco &&
            candidato.indices.length === melhor.indices.length &&
            candidato.fichasTroco.length < melhor.fichasTroco.length)) {
        melhor = candidato;
      }
    }

    if (!melhor) {
      return {
        status:"TROCO_IMPOSSIVEL",
        saldoDisponivel:saldo,
        mensagem:"Nenhuma combinacao preserva o valor restante com fichas de 2, 5 e 10 QC. Nenhuma ficha foi usada."
      };
    }
    if (melhor.soma !== valor + melhor.valorTroco) {
      throw Error("Plano de fichas inconsistente.");
    }
    return {
      status:"OK", valorSolicitado:valor, saldoDisponivel:saldo,
      tipo:melhor.valorTroco === 0 ? "EXATA" : "COM_TROCO",
      indicesSelecionados:melhor.indices.slice(),
      valoresSelecionados:melhor.indices.map(i => itens[i].valor),
      totalFichasSelecionadas:melhor.soma,
      valorTroco:melhor.valorTroco,
      fichasTroco:melhor.fichasTroco.slice()
    };
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
  async function QC_retomar271(operacao,senha) {
    const dados=operacao.tipo==="EXATA" ?
      {acao:"qc_doar_lote",idOperacao:operacao.idOperacao,
        valorDoacao:operacao.valorDoacao,fichas:operacao.fichasEntrada} :
      {acao:"qc_doar_com_troco",idTroca:operacao.idOperacao,
        valorDoacao:operacao.valorDoacao,
        fichasEntrada:operacao.fichasEntrada,saidasCegas:operacao.saidasCegas};
    const {acao,...payload}=dados;
    const resposta=await QC_postAnonimo271(acao,payload);
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
        "Fichas utilizadas: "+plano.valoresSelecionados.join(" + ")+" QC\n"+
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

  // PASSO 252 - Verificar backup sem importar, apagar ou alterar fichas.
  const verificarBackup252 = document.createElement("button");
  verificarBackup252.type = "button";
  verificarBackup252.textContent = "Verificar backup para recuperacao";
  verificarBackup252.style.marginTop = "10px";

  const arquivoBackup252 = document.createElement("input");
  arquivoBackup252.type = "file";
  arquivoBackup252.accept = ".json,application/json";
  arquivoBackup252.style.display = "none";


  // PASSO 253 - Restauracao segura, sem sobrescrever fichas existentes.
  const restaurarBackup253 = document.createElement("button");
  restaurarBackup253.type = "button";
  restaurarBackup253.textContent = "Restaurar fichas do backup";
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
    verificarBackup252, arquivoBackup252,
    restaurarBackup253, arquivoRestaurar253
  );
  titulo.textContent = "Meu saldo";
  conferir.textContent = "Atualizar saldo";
  painel.append(titulo, conferir, aviso, detalhes);
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

  conferir.addEventListener("click", async () => {
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
    } finally {
      conferir.disabled = false;
    }
  });

  backup.addEventListener("click", () => {
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

  // PASSO 252 - Somente leitura: arquivo e chaves publicas.
  // Nao escreve no localStorage nem envia fichas ou senhas ao servidor.
  verificarBackup252.addEventListener("click", async () => {
    const sessaoInicial = dadosDaSessao();
    if (!sessaoInicial.id || !sessaoInicial.token) {
      aviso.textContent = "Entre na carteira primeiro.";
      return;
    }

    const segredo = await obterSenha265();
    if (!segredo) {
      aviso.textContent = "Informe a senha das fichas antes de selecionar o backup.";
      return;
    }

    arquivoBackup252.value = "";
    arquivoBackup252.onchange = async () => {
      const arquivo = arquivoBackup252.files?.[0];
      if (!arquivo) return;

      verificarBackup252.disabled = true;
      aviso.textContent = "Descriptografando e verificando assinaturas do backup...";

      try {
        if (!crypto?.subtle) throw Error("Criptografia indisponivel.");
        if (arquivo.size > 10 * 1024 * 1024) {
          throw Error("Arquivo de backup excede o tamanho permitido.");
        }

        const dados = JSON.parse(await arquivo.text());
        if (
          !dados ||
          dados.formato !== "QUINTOSCOIN_BACKUP_ASSINADAS_V1" ||
          !Array.isArray(dados.registrosCifrados) ||
          dados.registrosCifrados.length === 0
        ) {
          throw Error("Formato de backup assinado invalido.");
        }

        const uuid = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
        const chaves = new Map();
        const mensagens = new Set();
        let total = 0;

        for (const registro of dados.registrosCifrados) {
          const ficha = await abrir(registro, segredo);
          const valor = Number(ficha?.valor);
          const idChave = "QC-" + valor + "-V1";
          if (
            !ficha ||
            ficha.formato !== "QC_FICHA_ASSINADA_V1" ||
            ![2, 5, 10].includes(valor) ||
            ficha.valor !== valor ||
            ficha.idChave !== idChave ||
            !/^[0-9a-f]{1024}$/i.test(ficha.assinaturaHex || "")
          ) {
            throw Error("Ficha do backup com estrutura invalida.");
          }

          const mensagemHex = String(ficha.mensagemHex || "").toLowerCase();
          const mensagem = deHex(mensagemHex);
          if (mensagem.length < 80 || mensagens.has(mensagemHex)) {
            throw Error("Mensagem incompleta ou ficha duplicada no backup.");
          }
          mensagens.add(mensagemHex);

          const texto = new TextDecoder("utf-8", {fatal:true})
            .decode(mensagem.subarray(32));
          const partes = texto.split("|");
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
            const expoenteNormal = eHex.length % 2 ? "0" + eHex : eHex;
            chave = await crypto.subtle.importKey(
              "jwk",
              {
                kty:"RSA", n:base64url(deHex(nHex)),
                e:base64url(deHex(expoenteNormal)),
                ext:true, key_ops:["verify"]
              },
              {name:"RSA-PSS", hash:"SHA-384"}, false, ["verify"]
            );
            chaves.set(valor, chave);
          }

          const assinaturaValida = await crypto.subtle.verify(
            {name:"RSA-PSS", saltLength:48}, chave,
            deHex(ficha.assinaturaHex), mensagem
          );
          if (!assinaturaValida) {
            throw Error("Assinatura de " + valor + " QC nao confere.");
          }

          total += valor;
          if (!Number.isSafeInteger(total)) {
            throw Error("Total do backup invalido.");
          }
        }

        const sessaoAtual = dadosDaSessao();
        if (
          sessaoAtual.id !== sessaoInicial.id ||
          sessaoAtual.token !== sessaoInicial.token
        ) {
          throw Error("A sessao mudou durante a verificacao.");
        }

        memorizarSenha265(segredo, sessaoInicial);
        aviso.textContent = "✅ Backup valido: " +
          dados.registrosCifrados.length + " ficha(s), " + total +
          " QC. Nenhuma ficha importada ou alterada.";
      } catch (erro) {
        aviso.textContent = "⚠️ Backup nao verificado: " + erro.message;
      } finally {
        arquivoBackup252.value = "";
        verificarBackup252.disabled = false;
      }
    };

    arquivoBackup252.click();
  });


  // PASSO 253 - Importa apenas fichas novas depois de validar TODAS as
  // assinaturas e conferir duplicatas com as fichas ja existentes.
  // A gravacao e unica e nao altera fichas anteriores.
  restaurarBackup253.addEventListener("click", async () => {
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
      verificarBackup252.disabled = true;
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

        aviso.textContent = "✅ Restauracao concluida: " +
          novas.length + " ficha(s), " + totalNovo +
          " QC disponiveis adicionados. " + repetidas +
          " repetida(s) e " + gastasNoBackup +
          " ja gasta(s) ignoradas. Clique em Verificar meu saldo.";

      } catch (erro) {
        aviso.textContent = "⚠️ Restauracao nao realizada: " + erro.message;
      } finally {
        arquivoRestaurar253.value = "";
        restaurarBackup253.disabled = false;
        verificarBackup252.disabled = false;
        conferir.disabled = false;
        backup.disabled = false;
      }
    };

    arquivoRestaurar253.click();
  });


  renderizar();
})();
