
 // QuintosCoin — Passo 202: saldo verificado e backup da ficha assinada.
 // Nenhuma emissão, gasto ou assinatura é feita neste arquivo.
 (function () {
   "use strict";

   const dec = new TextDecoder();
   const enc = new TextEncoder();
   let memoria = null;

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

  
  // PASSO 205 - CONSULTA ANONIMA DE GASTO

  async function QC_consultarGastoServidor205(ficha) {

    const url =
      "https://script.google.com/macros/s/AKfycbxEU0xzZz833Bqv7CxV-PdTVIjxRrl27lNgSG0upZ07rnXaAkULhGGuehxbpU2-K1oyOQ/exec";

    // Importante: nao enviar token de login,
    // IdCadastro nem identificacao da carteira.
    const resposta = await fetch(url, {
      method: "POST",
      redirect: "follow",
      headers: {
        "Content-Type": "text/plain;charset=utf-8"
      },
      body: JSON.stringify({
        acao: "qc_consultar_gasto",
        mensagemHex: ficha.mensagemHex,
        assinaturaHex: ficha.assinaturaHex
      })
    });

    if (!resposta.ok) {
      throw new Error(
        "Falha ao consultar gastos. HTTP " +
        resposta.status
      );
    }

    const dados = await resposta.json();

    if (
      dados.status !== "DISPONIVEL" &&
      dados.status !== "GASTA"
    ) {
      throw new Error(
        dados.mensagem ||
        "Nao foi possivel confirmar a situacao da ficha."
      );
    }

    return dados.status;
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
     if (rotulo) rotulo.textContent = "Fichas assinadas verificadas";
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
       div.textContent =
  ficha.valor + " QC — " +
  ficha.origem + " — Ref. " +
  ficha.referencia;
       lista.appendChild(div);
     }

     if (!memoria.fichas.length) {
       lista.textContent = "Nenhuma ficha assinada neste celular.";
     }
   }

   window.QC_atualizarSaldoReal202 = renderizar;

   const painel = document.createElement("section");
   painel.style.marginTop = "20px";
   painel.style.padding = "16px";
   painel.style.border = "1px solid #ffffff33";
   painel.style.borderRadius = "12px";

   const titulo = document.createElement("h3");
   titulo.textContent = "Conferir minhas fichas assinadas";

   const senha = document.createElement("input");
   senha.type = "password";
   senha.placeholder = "Senha utilizada para proteger a ficha";
   senha.autocomplete = "off";
   senha.style.width = "100%";

   const conferir = document.createElement("button");
   conferir.type = "button";
   conferir.textContent = "Verificar meu saldo";

   const backup = document.createElement("button");
   backup.type = "button";
   backup.textContent = "Salvar backup das fichas assinadas";
   backup.style.marginTop = "10px";

   const aviso = document.createElement("p");
   aviso.setAttribute("role", "status");
   aviso.textContent = "Doações ainda desativadas.";

   painel.append(titulo, senha, conferir, backup, aviso);
   const secao = document.querySelector("#telaCarteira .fichas");
   if (!secao) return;
   secao.after(painel);

   conferir.addEventListener("click", async () => {
     const {id, token} = dadosDaSessao();
     const segredo = senha.value;
     senha.value = "";

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
       const registros = Object.entries(lerRegistros());
       const fichas = [];
       const mensagens = new Set();
       let chavePublica209 = null;
       let quantidadeGastas = 0;

       if (registros.length) {
         const resposta = await QC_post191("qc_chave_publica_10");
         const nHex = String(resposta.moduloHex || "").toLowerCase();
         const eHex = String(resposta.expoenteHex || "").toLowerCase();

         if (resposta.status !== "OK" ||
             resposta.idChave !== "QC-10-V1" ||
             !/^[89a-f][0-9a-f]{1023}$/.test(nHex) ||
             !/^0*10001$/.test(eHex)) {
           throw Error("Chave pública de verificação inválida.");
         }

         const eNormal = eHex.length % 2 ? "0" + eHex : eHex;
         const chave = await crypto.subtle.importKey(
           "jwk",
           {kty:"RSA", n:base64url(deHex(nHex)),
            e:base64url(deHex(eNormal)), ext:true, key_ops:["verify"]},
           {name:"RSA-PSS", hash:"SHA-384"}, false, ["verify"]
         );
        chavePublica209 = chave;

         for (const [chaveRegistro, registro] of registros) {
           const ficha = await abrir(registro, segredo);

           if (!ficha || ficha.formato !== "QC_FICHA_ASSINADA_V1" ||
               ficha.idChave !== "QC-10-V1" || ficha.valor !== 10 ||
               !/^[0-9a-f]{1024}$/i.test(ficha.assinaturaHex || "")) {
             throw Error("Ficha assinada com estrutura inválida.");
           }

           const msg = deHex(ficha.mensagemHex);
           if (msg.length < 80 ||
               !/^QUINTOSCOIN\|V1\|10\|QC-10-V1\|[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i
                 .test(dec.decode(msg.slice(32)))) {
             throw Error("Conteúdo da ficha inválido.");
           }

           if (mensagens.has(ficha.mensagemHex)) {
             throw Error("Ficha duplicada no armazenamento.");
           }
           mensagens.add(ficha.mensagemHex);

           const valida = await crypto.subtle.verify(
             {name:"RSA-PSS", saltLength:48}, chave,
             deHex(ficha.assinaturaHex), msg
           );

          
if (!valida) {
  throw Error("Assinatura de ficha não verificada.");
}

// Consultar o registro global de fichas gastas.
const situacao = await QC_consultarGastoServidor205(ficha);


if (situacao === "DISPONIVEL") {

  const origem = chaveRegistro.startsWith("RECUP_")
    ? "Backup restaurado"
    : chaveRegistro.startsWith("QC-EM-")
      ? "Registro de emissão"
      : "Outro registro local";

  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", msg)
  );

  const referencia = Array.from(
    digest.slice(0, 6),
    b => b.toString(16).padStart(2, "0")
  ).join("");

  fichas.push({
  valor: 10,
  idChave: "QC-10-V1",
  origem: origem,
  referencia: referencia,
  chaveRegistro: chaveRegistro
});

}
else if (situacao === "GASTA") {

  quantidadeGastas++;

}

         }
       }

       const agora = dadosDaSessao();
       if (agora.id !== id || agora.token !== token) {
         throw Error("A sessão mudou durante a conferência.");
       }

      memoria = {
  id,
  token,
  fichas,
  total: fichas.length * 10,
  gastas: quantidadeGastas,
  chavePublica209: chavePublica209
};
       renderizar();

       aviso.textContent =
  "✅ " + fichas.length +
  " ficha(s) disponíveis. " +
  quantidadeGastas +
  " ficha(s) já gastas. " +
  "Doações ainda bloqueadas.";

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

  
// PASSO 203 - RESTAURAR BACKUP DE FICHAS ASSINADAS

const arquivo203 = document.createElement("input");
arquivo203.type = "file";
arquivo203.accept = ".json,application/json";
arquivo203.style.marginTop = "12px";
arquivo203.style.width = "100%";

const restaurar203 = document.createElement("button");
restaurar203.type = "button";
restaurar203.textContent = "Restaurar backup das fichas";
restaurar203.style.marginTop = "10px";

painel.insertBefore(arquivo203, aviso);
painel.insertBefore(restaurar203, aviso);

restaurar203.addEventListener("click", async () => {

  const arquivo = arquivo203.files[0];
  const segredo = senha.value;
  const sessaoInicial = dadosDaSessao();

  if (!sessaoInicial.id || !sessaoInicial.token) {
    aviso.textContent = "Entre na carteira primeiro.";
    return;
  }

  if (!arquivo) {
    aviso.textContent = "Selecione o arquivo de backup.";
    return;
  }

  if (!segredo) {
    aviso.textContent =
      "Informe a senha usada para proteger as fichas.";
    return;
  }

  restaurar203.disabled = true;
  aviso.textContent = "Conferindo backup e assinaturas...";

  try {

    if (arquivo.size > 2000000) {
      throw Error("Arquivo de backup muito grande.");
    }

    const backup203 = JSON.parse(await arquivo.text());

    if (
      backup203.formato !==
        "QUINTOSCOIN_BACKUP_ASSINADAS_V1" ||
      !Array.isArray(backup203.registrosCifrados) ||
      backup203.registrosCifrados.length < 1 ||
      backup203.registrosCifrados.length > 200
    ) {
      throw Error("Formato de backup inválido.");
    }

    const resposta = await QC_post191(
      "qc_chave_publica_10"
    );

    const nHex = String(
      resposta.moduloHex || ""
    ).toLowerCase();

    const eHex = String(
      resposta.expoenteHex || ""
    ).toLowerCase();

    if (
      resposta.status !== "OK" ||
      resposta.idChave !== "QC-10-V1" ||
      !/^[89a-f][0-9a-f]{1023}$/.test(nHex) ||
      !/^0*10001$/.test(eHex)
    ) {
      throw Error("Chave pública inválida.");
    }

    const eNormal =
      eHex.length % 2 ? "0" + eHex : eHex;

    const chavePublica203 =
      await crypto.subtle.importKey(
        "jwk",
        {
          kty: "RSA",
          n: base64url(deHex(nHex)),
          e: base64url(deHex(eNormal)),
          ext: true,
          key_ops: ["verify"]
        },
        { name: "RSA-PSS", hash: "SHA-384" },
        false,
        ["verify"]
      );

    async function validarFicha203(cifrado) {

      const ficha = await abrir(cifrado, segredo);

      if (
        !ficha ||
        ficha.formato !== "QC_FICHA_ASSINADA_V1" ||
        ficha.idChave !== "QC-10-V1" ||
        ficha.valor !== 10 ||
        !/^[0-9a-f]{1024}$/i.test(
          ficha.assinaturaHex || ""
        )
      ) {
        throw Error("Ficha inválida no backup.");
      }

      const msg = deHex(ficha.mensagemHex || "");
      const conteudo = dec.decode(msg.slice(32));

      if (
        msg.length < 80 ||
        !/^QUINTOSCOIN\|V1\|10\|QC-10-V1\|[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i
          .test(conteudo)
      ) {
        throw Error("Conteúdo da ficha inválido.");
      }

      const valida = await crypto.subtle.verify(
        { name: "RSA-PSS", saltLength: 48 },
        chavePublica203,
        deHex(ficha.assinaturaHex),
        msg
      );

      if (!valida) {
        throw Error("Assinatura não reconhecida.");
      }

      return ficha.mensagemHex.toLowerCase();
    }

    const atuais = lerRegistros();
    const novosRegistros = { ...atuais };
    const identificadores = new Set();

    // Identificar fichas que já existem.
    for (const registro of Object.values(atuais)) {

      const identificador =
        await validarFicha203(registro);

      if (identificadores.has(identificador)) {
        throw Error(
          "Existem fichas duplicadas na carteira atual."
        );
      }

      identificadores.add(identificador);
    }

    let importadas = 0;
    let repetidas = 0;

    for (const registro of backup203.registrosCifrados) {

      const identificador =
        await validarFicha203(registro);

      // Não importar duas vezes a mesma ficha.
      if (identificadores.has(identificador)) {
        repetidas++;
        continue;
      }

      const digest = new Uint8Array(
        await crypto.subtle.digest(
          "SHA-256",
          deHex(identificador)
        )
      );

      const hash = Array.from(digest, b =>
        b.toString(16).padStart(2, "0")
      ).join("");

      const chaveRegistro = "RECUP_" + hash;

      if (Object.prototype.hasOwnProperty.call(
        novosRegistros, chaveRegistro
      )) {
        throw Error("Conflito no armazenamento.");
      }

      novosRegistros[chaveRegistro] = registro;
      identificadores.add(identificador);
      importadas++;
    }

    const sessaoAtual = dadosDaSessao();

    if (
      sessaoAtual.id !== sessaoInicial.id ||
      sessaoAtual.token !== sessaoInicial.token
    ) {
      throw Error("A sessão mudou durante a restauração.");
    }

    // Gravar somente depois de validar tudo.
    if (importadas > 0) {
      localStorage.setItem(
        chaveLocal(),
        JSON.stringify(novosRegistros)
      );
    }

    memoria = null;
    renderizar();

    aviso.textContent =
      "✅ Backup conferido. " +
      importadas + " ficha(s) restaurada(s). " +
      repetidas + " já existente(s). " +
      "Use Verificar meu saldo para atualizar.";

  } catch (erro) {

    aviso.textContent =
      "⚠️ Não foi possível restaurar: " +
      erro.message;

  } finally {

    restaurar203.disabled = false;
    arquivo203.value = "";
    senha.value = "";

  }

});

  
// PASSO 209 - PREPARACAO DE DOACAO DE 10 QC

const botaoDoar209 = document.getElementById("btnDoar");

const painelDoar209 = document.createElement("section");
painelDoar209.style.marginTop = "20px";
painelDoar209.style.padding = "16px";
painelDoar209.style.border = "1px solid #ffffff33";
painelDoar209.style.borderRadius = "12px";
painelDoar209.style.display = "none";

const tituloDoar209 = document.createElement("h3");
tituloDoar209.textContent = "Doar QuintosCoin";

const valorDoar209 = document.createElement("p");
valorDoar209.textContent = "Doação de 10 QC";

const senhaDoar209 = document.createElement("input");
senhaDoar209.type = "password";
senhaDoar209.placeholder = "Senha da ficha";
senhaDoar209.autocomplete = "off";
senhaDoar209.style.width = "100%";

const conferirDoar209 = document.createElement("button");
conferirDoar209.type = "button";
conferirDoar209.textContent = "Conferir ficha para doação";

const confirmarDoar209 = document.createElement("button");
confirmarDoar209.type = "button";
confirmarDoar209.textContent = "Confirmar doação de 10 QC";
confirmarDoar209.disabled = true;
confirmarDoar209.style.marginTop = "10px";

const mensagemDoar209 = document.createElement("p");
mensagemDoar209.setAttribute("role", "status");
mensagemDoar209.textContent =
  "A confirmação da doação ainda não está habilitada.";

painelDoar209.append(
  tituloDoar209,
  valorDoar209,
  senhaDoar209,
  conferirDoar209,
  confirmarDoar209,
  mensagemDoar209
);

if (botaoDoar209) {

  painel.after(painelDoar209);

  // Captura o clique antes do antigo aviso demonstrativo.
  botaoDoar209.addEventListener("click", function(evento) {

    evento.preventDefault();
    evento.stopImmediatePropagation();

    painelDoar209.style.display = "block";

    const atual = dadosDaSessao();

    if (
      !memoria ||
      memoria.id !== atual.id ||
      memoria.token !== atual.token ||
      !memoria.chavePublica209
    ) {
      mensagemDoar209.textContent =
        "Primeiro clique em Verificar meu saldo.";
      return;
    }

    if (!memoria.fichas.length) {
      mensagemDoar209.textContent =
        "Nenhuma ficha disponível para doar.";
      return;
    }

    mensagemDoar209.textContent =
      "Informe a senha para conferir sua ficha de 10 QC.";

    painelDoar209.scrollIntoView({
      behavior: "smooth",
      block: "nearest"
    });

  }, true);

}

  // PASSO 211 - Ficha conferida, aguardando confirmação.
let fichaApta211 = null;

conferirDoar209.addEventListener("click", async function() {

  const segredo = senhaDoar209.value;
senhaDoar209.value = "";

fichaApta211 = null;
confirmarDoar209.disabled = true;;

  const sessaoInicial = dadosDaSessao();

  if (!segredo) {
    mensagemDoar209.textContent = "Informe a senha da ficha.";
    return;
  }

  if (
    !memoria ||
    memoria.id !== sessaoInicial.id ||
    memoria.token !== sessaoInicial.token ||
    !memoria.chavePublica209 ||
    !memoria.fichas.length
  ) {
    mensagemDoar209.textContent =
      "Verifique novamente seu saldo.";
    return;
  }

  conferirDoar209.disabled = true;
  confirmarDoar209.disabled = true;

  mensagemDoar209.textContent =
    "Conferindo assinatura e disponibilidade...";

  try {

    const referencia = memoria.fichas[0];

    if (
      !referencia ||
      !referencia.chaveRegistro ||
      referencia.valor !== 10
    ) {
      throw Error("Referência da ficha inválida.");
    }

    const registro =
      lerRegistros()[referencia.chaveRegistro];

    if (!registro) {
      throw Error("Ficha não encontrada no celular.");
    }

    const ficha = await abrir(registro, segredo);

    if (
      !ficha ||
      ficha.formato !== "QC_FICHA_ASSINADA_V1" ||
      ficha.idChave !== "QC-10-V1" ||
      ficha.valor !== 10 ||
      !/^[0-9a-f]{1024}$/i.test(
        ficha.assinaturaHex || ""
      )
    ) {
      throw Error("Estrutura da ficha inválida.");
    }

    const mensagemBytes = deHex(ficha.mensagemHex);

    const conteudo = dec.decode(
      mensagemBytes.slice(32)
    );

    if (
      mensagemBytes.length < 80 ||
      !/^QUINTOSCOIN\|V1\|10\|QC-10-V1\|[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i
        .test(conteudo)
    ) {
      throw Error("Conteúdo da ficha inválido.");
    }

    const assinaturaValida =
      await crypto.subtle.verify(
        { name: "RSA-PSS", saltLength: 48 },
        memoria.chavePublica209,
        deHex(ficha.assinaturaHex),
        mensagemBytes
      );

    if (!assinaturaValida) {
      throw Error("Assinatura da ficha inválida.");
    }

    const situacao =
      await QC_consultarGastoServidor205(ficha);

    if (situacao !== "DISPONIVEL") {
      throw Error("Esta ficha já foi utilizada.");
    }

    const sessaoAtual = dadosDaSessao();

    if (
      sessaoAtual.id !== sessaoInicial.id ||
      sessaoAtual.token !== sessaoInicial.token
    ) {
      throw Error("A sessão mudou durante a conferência.");
    }

    fichaApta211 = {
  ficha: ficha,
  id: sessaoInicial.id,
  token: sessaoInicial.token
};

confirmarDoar209.disabled = false;

mensagemDoar209.textContent =
  "✅ Ficha de 10 QC válida e disponível. " +
  "Pronta para confirmação.";

  } catch (erro) {

    mensagemDoar209.textContent =
      "⚠️ " + erro.message;

  } finally {

    conferirDoar209.disabled = false;

  }

});

  
 // PASSO 211 - CONFIRMAR DOACAO ANONIMA

confirmarDoar209.addEventListener("click", async function() {

  const preparada = fichaApta211;
  const sessao = dadosDaSessao();

  if (
    !preparada ||
    !sessao.id ||
    !sessao.token ||
    preparada.id !== sessao.id ||
    preparada.token !== sessao.token
  ) {
    mensagemDoar209.textContent =
      "⚠️ Verifique novamente sua ficha.";
    confirmarDoar209.disabled = true;
    return;
  }

  const confirmou = window.confirm(
    "Confirma a doação de 10 QuintosCoin? " +
    "Depois de registrada, a ficha não poderá ser reutilizada."
  );

  if (!confirmou) return;

  confirmarDoar209.disabled = true;
  conferirDoar209.disabled = true;

  mensagemDoar209.textContent =
    "Conferindo e registrando a doação...";

  try {

    // Nova consulta antes da confirmação.
    const situacao = await QC_consultarGastoServidor205(
      preparada.ficha
    );

    if (situacao !== "DISPONIVEL") {
      throw Error("Esta ficha já foi utilizada.");
    }

    const URL_APPS_SCRIPT =
      "https://script.google.com/macros/s/AKfycbxEU0xzZz833Bqv7CxV-PdTVIjxRrl27lNgSG0upZ07rnXaAkULhGGuehxbpU2-K1oyOQ/exec";

    // Somente a ficha anônima é enviada.
    const resposta = await fetch(URL_APPS_SCRIPT, {
      method: "POST",
      redirect: "follow",
      headers: {
        "Content-Type": "text/plain;charset=utf-8"
      },
      body: JSON.stringify({
        acao: "qc_doar_ficha_anonima",
        mensagemHex: preparada.ficha.mensagemHex,
        assinaturaHex: preparada.ficha.assinaturaHex
      })
    });

    if (!resposta.ok) {
      throw Error("Falha HTTP: " + resposta.status);
    }

    const resultado = await resposta.json();

    if (resultado.status === "DOACOES_BLOQUEADAS") {

      mensagemDoar209.textContent =
        "✅ Comunicação com o Apps Script confirmada. " +
        "Doações continuam bloqueadas. " +
        "Nenhum QC foi gasto.";

    } else if (resultado.status === "DOACAO_REGISTRADA") {

      fichaApta211 = null;
      memoria = null;
      renderizar();

      mensagemDoar209.textContent =
        "✅ Doação de 10 QC registrada! " +
        "Clique em Verificar meu saldo para atualizar.";

    } else if (resultado.status === "JA_GASTA") {

      memoria = null;
      renderizar();

      mensagemDoar209.textContent =
        "⚠️ Esta ficha já consta como gasta no servidor. " +
        "Verifique seu saldo.";

    } else {

      throw Error(
        resultado.mensagem ||
        resultado.status ||
        "Resposta de doação não reconhecida."
      );

    }

  } catch (erro) {

    mensagemDoar209.textContent =
      "⚠️ " + erro.message +
      ". Não repita a doação sem verificar o saldo.";

  } finally {

    // Exigir uma nova verificação para qualquer tentativa.
    fichaApta211 = null;
    confirmarDoar209.disabled = true;
    conferirDoar209.disabled = false;

  }

});



   renderizar();
 })();
