
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
       div.textContent = ficha.valor + " QC — " + ficha.idChave +
         " — assinatura verificada";
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
       const registros = Object.values(lerRegistros());
       const fichas = [];
       const mensagens = new Set();
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

         for (const registro of registros) {
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

  fichas.push({
    valor: 10,
    idChave: "QC-10-V1"
  });

} else if (situacao === "GASTA") {

  quantidadeGastas++;

}


           fichas.push({valor:10, idChave:"QC-10-V1"});
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
  gastas: quantidadeGastas
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


   renderizar();
 })();
