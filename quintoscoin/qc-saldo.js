// QUINTOSCOIN - INTERFACE SIMPLIFICADA - Passo 265
// Mantem saldo, backup, recuperacao e a consulta de fichas gastas.
// Doacoes e transferencias continuam controladas pelo servidor.
// Consulta de gastos preservada; nenhuma doacao e executada neste arquivo.
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

  window.QC_atualizarSaldoReal202 = renderizar;

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
