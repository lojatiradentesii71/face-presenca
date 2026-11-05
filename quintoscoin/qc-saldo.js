// QuintosCoin — Passo 263: saldo disponivel e doacao de fichas (2, 5 e 10 QC).
// A emissao e a assinatura seguem bloqueadas. O gasto depende de liberacao no servidor.
(function () {
  "use strict";

  const dec = new TextDecoder();
  const enc = new TextEncoder();
  let memoria = null;
  let doacaoEmAndamento263 = false;

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
    const resposta = await QC_post191("qc_consultar_gasto", {
      mensagemHex: ficha.mensagemHex,
      assinaturaHex: ficha.assinaturaHex
    });
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

  // PASSO 252 - Verificar backup sem importar, apagar ou alterar fichas.
  const verificarBackup252 = document.createElement("button");
  verificarBackup252.type = "button";
  verificarBackup252.textContent = "Verificar backup para recuperacao";
  verificarBackup252.style.marginTop = "10px";

  const arquivoBackup252 = document.createElement("input");
  arquivoBackup252.type = "file";
  arquivoBackup252.accept = ".json,application/json";
  arquivoBackup252.style.display = "none";


  // PASSO 263 - Doacoes por ficha inteira, sem fracoes nem troco.
  const areaDoacao263 = document.createElement("section");
  areaDoacao263.style.marginTop = "18px";
  areaDoacao263.style.paddingTop = "12px";
  areaDoacao263.style.borderTop = "1px solid #ffffff33";

  const tituloDoacao263 = document.createElement("h4");
  tituloDoacao263.textContent = "Doar QuintosCoin";

  const selecaoDoacao263 = document.createElement("select");
  selecaoDoacao263.style.width = "100%";
  for (const valor of ["", "2", "5", "10"]) {
    const opcao = document.createElement("option");
    opcao.value = valor;
    opcao.textContent = valor
      ? "Doar uma ficha de " + valor + " QC"
      : "Escolha o valor da ficha";
    selecaoDoacao263.append(opcao);
  }

  const botaoDoacao263 = document.createElement("button");
  botaoDoacao263.type = "button";
  botaoDoacao263.textContent = "Confirmar doacao";
  botaoDoacao263.style.marginTop = "10px";

  const avisoDoacao263 = document.createElement("p");
  avisoDoacao263.setAttribute("role", "status");
  avisoDoacao263.textContent =
    "Use a senha das fichas no campo acima. O servidor deve ter uma sessao aberta.";

  areaDoacao263.append(
    tituloDoacao263, selecaoDoacao263, botaoDoacao263, avisoDoacao263
  );

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
  aviso.textContent = "Doações ainda desativadas.";

  painel.append(
    titulo, senha, conferir, backup,
    verificarBackup252, arquivoBackup252,
    restaurarBackup253, arquivoRestaurar253,
    areaDoacao263, aviso
  );
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
  verificarBackup252.addEventListener("click", () => {
    const sessaoInicial = dadosDaSessao();
    if (!sessaoInicial.id || !sessaoInicial.token) {
      aviso.textContent = "Entre na carteira primeiro.";
      return;
    }

    const segredo = senha.value;
    senha.value = "";
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
  restaurarBackup253.addEventListener("click", () => {
    const sessaoInicial = dadosDaSessao();
    if (!sessaoInicial.id || !sessaoInicial.token) {
      aviso.textContent = "Entre na carteira primeiro.";
      return;
    }

    const segredo = senha.value;
    senha.value = "";
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

  // PASSO 263 - Doacao efetiva apenas quando QC_DOACOES_ATIVAS = SIM
  // no Apps Script. A mesma ficha nunca e enviada com nome/IdCadastro.
  botaoDoacao263.addEventListener("click", async () => {
    if (doacaoEmAndamento263) return;

    const sessaoInicial = dadosDaSessao();
    const valor = Number(selecaoDoacao263.value);
    const segredo = senha.value;
    senha.value = "";

    if (!sessaoInicial.id || !sessaoInicial.token) {
      avisoDoacao263.textContent = "Entre na carteira primeiro.";
      return;
    }
    if (![2, 5, 10].includes(valor)) {
      avisoDoacao263.textContent = "Escolha uma ficha de 2, 5 ou 10 QC.";
      return;
    }
    if (!segredo) {
      avisoDoacao263.textContent = "Informe a senha das fichas antes de doar.";
      return;
    }

    doacaoEmAndamento263 = true;
    botaoDoacao263.disabled = true;
    conferir.disabled = true;
    restaurarBackup253.disabled = true;
    verificarBackup252.disabled = true;
    backup.disabled = true;

    let fichaEscolhida = null;
    try {
      if (!crypto?.subtle) throw Error("Criptografia indisponivel.");
      const chaveRegistros = chaveLocal();
      const registrosOriginais = localStorage.getItem(chaveRegistros);
      const registros = lerRegistros();
      avisoDoacao263.textContent = "Conferindo as fichas disponiveis...";

      // Avaliar as fichas do valor solicitado. A consulta ao servidor
      // confirma assinatura, denominacao e ausencia de gasto anterior.
      let encontrada = false;
      for (const registro of Object.values(registros)) {
        const ficha = await abrir(registro, segredo);
        if (ficha?.valor !== valor) continue;
        encontrada = true;
        if (
          ficha.formato !== "QC_FICHA_ASSINADA_V1" ||
          ficha.idChave !== "QC-" + valor + "-V1" ||
          !/^[0-9a-f]{1024}$/i.test(ficha.assinaturaHex || "") ||
          !/^[0-9a-f]+$/i.test(ficha.mensagemHex || "")
        ) {
          throw Error("Ficha com estrutura invalida.");
        }
        const situacao = await consultarFicha263(ficha);
        if (situacao === "DISPONIVEL") {
          fichaEscolhida = ficha;
          break;
        }
      }
      if (!fichaEscolhida) {
        avisoDoacao263.textContent = encontrada
          ? "Nenhuma ficha de " + valor + " QC ainda disponivel."
          : "Voce nao possui ficha de " + valor + " QC neste navegador.";
        return;
      }

      if (localStorage.getItem(chaveRegistros) !== registrosOriginais ||
          dadosDaSessao().id !== sessaoInicial.id ||
          dadosDaSessao().token !== sessaoInicial.token) {
        throw Error("A carteira mudou. Confirme o saldo e tente novamente.");
      }

      const autorizado = window.confirm(
        "Confirmar doacao anonima de " + valor + " QC?\n\n" +
        "A ficha sera registrada como gasta. Esta operacao e irreversivel."
      );
      if (!autorizado) {
        avisoDoacao263.textContent = "Doacao cancelada. Nenhuma ficha gasta.";
        return;
      }

      // Nao enviar identidade, senha ou IdCarteira nestes campos.
      avisoDoacao263.textContent = "Registrando doacao no servidor...";
      let resultado;
      try {
        resultado = await QC_post191("qc_doar_ficha_anonima", {
          mensagemHex:fichaEscolhida.mensagemHex,
          assinaturaHex:fichaEscolhida.assinaturaHex
        });
      } catch (erroEnvio) {
        // Falhas apos o envio podem ocorrer DEPOIS do registro no servidor.
        // Consultar antes de sugerir qualquer tentativa nova.
        try {
          const situacao = await consultarFicha263(fichaEscolhida);
          if (situacao === "GASTA") {
            memoria = null;
            renderizar();
            avisoDoacao263.textContent =
              "⚠️ Ficha consta como GASTA no servidor. A doacao pode ter sido " +
              "registrada, mas a resposta se perdeu. Verifique seu saldo; " +
              "nao repita o envio.";
            return;
          }
        } catch (_) { /* Conexao indisponivel: resultado inconclusivo. */ }
        throw Error("Resultado da doacao inconclusivo: " +
          (erroEnvio?.message || "falha de comunicacao") +
          ". Consulte o saldo antes de tentar novamente.");
      }

      if (resultado?.status === "DOACAO_REGISTRADA" &&
          Number(resultado.valor) === valor) {
        // Preservar as fichas cifradas como historico. Elas serao
        // EXCLUIDAS do saldo a partir de agora pela consulta global.
        memoria = null;
        renderizar();
        avisoDoacao263.textContent = "✅ Doacao de " + valor +
          " QC registrada. Clique em Verificar meu saldo para atualizar " +
          "as fichas disponiveis.";
      } else if (resultado?.status === "JA_GASTA") {
        memoria = null;
        renderizar();
        avisoDoacao263.textContent =
          "⚠️ Essa ficha ja foi utilizada. Atualize o saldo antes de doar.";
      } else if (resultado?.status === "DOACOES_BLOQUEADAS") {
        avisoDoacao263.textContent =
          "Doacoes ainda bloqueadas no servidor. Nenhuma ficha foi utilizada.";
      } else if (["SEM_SESSAO", "SESSAO_ENCERRADA", "SESSAO_NAO_LIBERADA"]
          .includes(resultado?.status)) {
        avisoDoacao263.textContent =
          "Doacao nao registrada: nao ha sessao de arrecadacao aberta e " +
          "habilitada. Nenhuma ficha foi utilizada.";
      } else {
        // A operacao pode ter sido registrada mesmo se o retorno
        // for inesperado. Nao incentivar repeticao sem nova consulta.
        memoria = null;
        renderizar();
        avisoDoacao263.textContent =
          "⚠️ Resposta nao confirmada (" +
          String(resultado?.status || "SEM_STATUS") +
          "). Consulte o saldo e o registro de gastos antes de repetir.";
      }
    } catch (erro) {
      avisoDoacao263.textContent = "⚠️ " + erro.message;
    } finally {
      doacaoEmAndamento263 = false;
      botaoDoacao263.disabled = false;
      conferir.disabled = false;
      restaurarBackup253.disabled = false;
      verificarBackup252.disabled = false;
      backup.disabled = false;
    }
  });

  renderizar();
})();
