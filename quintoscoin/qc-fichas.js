
 // QUINTOSCOIN - PASSO 291 - FICHAS PROTEGIDAS PELA SENHA DO LOGIN
 // Preparacao e recebimento de fichas de 2, 5 e 10 QC.
 // Mantem os bloqueios de assinatura no servidor.

(function () {
  "use strict";

  const ENC = new TextEncoder();
  const UM = BigInt(1);
  const ZERO = BigInt(0);

  function hex(b) {
    return Array.from(b, v =>
      v.toString(16).padStart(2, "0")
    ).join("");
  }

  function deHex(s) {
    if (!/^(?:[0-9a-f]{2})+$/i.test(s)) {
      throw Error("Hexadecimal invalido.");
    }
    return Uint8Array.from(
      s.match(/../g),
      p => parseInt(p, 16)
    );
  }

  function inteiro(b) {
    return BigInt("0x" + hex(b));
  }

  function bytesFixos(x, tamanho) {
    const s = x.toString(16);
    if (s.length > 2 * tamanho) {
      throw Error("Inteiro RSA fora do limite.");
    }
    return deHex(s.padStart(2 * tamanho, "0"));
  }

  function juntar(...partes) {
    const b = new Uint8Array(
      partes.reduce((s, a) => s + a.length, 0)
    );

    let p = 0;
    for (const a of partes) {
      b.set(a, p);
      p += a.length;
    }

    return b;
  }

  function potMod(a, e, n) {
    let r = UM;
    a %= n;

    while (e > ZERO) {
      if (e % BigInt(2) === UM) {
        r = (r * a) % n;
      }
      a = (a * a) % n;
      e /= BigInt(2);
    }

    return r;
  }

  function mdc(a, b) {
    while (b !== ZERO) {
      const t = a % b;
      a = b;
      b = t;
    }
    return a;
  }

  function inverso(a, n) {
    let t = ZERO, nt = UM;
    let r = n, nr = a % n;

    while (nr !== ZERO) {
      const q = r / nr;
      [t, nt] = [nt, t - q * nt];
      [r, nr] = [nr, r - q * nr];
    }

    if (r !== UM) {
      throw Error("Fator de cegamento invalido.");
    }

    return (t % n + n) % n;
  }

  async function sha384(b) {
    return new Uint8Array(
      await crypto.subtle.digest("SHA-384", b)
    );
  }

  async function mgf1(entrada, tamanho) {
    const saida = new Uint8Array(tamanho);

    for (
      let contador = 0, p = 0;
      p < tamanho;
      contador++
    ) {
      const c = Uint8Array.of(
        contador >>> 24 & 255,
        contador >>> 16 & 255,
        contador >>> 8 & 255,
        contador & 255
      );

      const h = await sha384(juntar(entrada, c));
      const fatia = h.subarray(
        0,
        Math.min(h.length, tamanho - p)
      );

      saida.set(fatia, p);
      p += fatia.length;
    }

    return saida;
  }

  async function codificarPSS(mensagem) {
    const emLen = 512;
    const hLen = 48;
    const sLen = 48;

    const sal = crypto.getRandomValues(
      new Uint8Array(sLen)
    );

    const H = await sha384(
      juntar(
        new Uint8Array(8),
        await sha384(mensagem),
        sal
      )
    );

    const DB = new Uint8Array(emLen - hLen - 1);
    const pos = emLen - hLen - sLen - 2;

    DB[pos] = 1;
    DB.set(sal, pos + 1);

    const mask = await mgf1(H, DB.length);
    const masked = DB.map((x, i) => x ^ mask[i]);

    masked[0] &= 0x7f;

    return juntar(masked, H, Uint8Array.of(0xbc));
  }

  function aleatorioInversivel(n) {
    for (let i = 0; i < 256; i++) {
      const candidato = inteiro(
        crypto.getRandomValues(new Uint8Array(512))
      );

      if (
        candidato > ZERO &&
        candidato < n &&
        mdc(candidato, n) === UM
      ) {
        return candidato;
      }
    }

    throw Error(
      "Nao foi possivel gerar o fator de cegamento."
    );
  }

  function chaveArmazenamento() {
    const id = localStorage.getItem(
      "QC_ID_CARTEIRA"
    );

    if (!id) {
      throw Error("Carteira nao selecionada.");
    }

    return "QC_FICHAS_CEGAS_PENDENTES_V1_" + id;
  }

  async function criptografar(conteudo, senha) {
    const salt = crypto.getRandomValues(
      new Uint8Array(16)
    );

    const iv = crypto.getRandomValues(
      new Uint8Array(12)
    );

    const base = await crypto.subtle.importKey(
      "raw",
      ENC.encode(senha),
      "PBKDF2",
      false,
      ["deriveKey"]
    );

    const chave = await crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt,
        iterations: 310000,
        hash: "SHA-256"
      },
      base,
      {
        name: "AES-GCM",
        length: 256
      },
      false,
      ["encrypt"]
    );

    const cifrado = new Uint8Array(
      await crypto.subtle.encrypt(
        { name: "AES-GCM", iv },
        chave,
        ENC.encode(JSON.stringify(conteudo))
      )
    );

    return {
      versao: 1,
      saltHex: hex(salt),
      ivHex: hex(iv),
      dadosHex: hex(cifrado)
    };
  }

  function pendencias() {
    const raw = localStorage.getItem(
      chaveArmazenamento()
    );

    if (!raw) return {};

    const p = JSON.parse(raw);

    if (
      !p ||
      typeof p !== "object" ||
      Array.isArray(p)
    ) {
      throw Error(
        "Armazenamento da carteira inconsistente."
      );
    }

    return p;
  }

  // PASSO 222 - Distribuicao local igual ao plano sem fichas de 50 QC.
  // Esta funcao apenas calcula as fichas: o servidor ainda valida cada cota.
  function QC_distribuirFichas222(valor) {
    const total = Number(valor);

    if (!Number.isSafeInteger(total) || total < 2 || total === 3) {
      throw Error("Valor autorizado invalido para fichas.");
    }

    const fichas = [];
    let restante = total;

    for (const denominacao of [10, 5, 2]) {
      while (restante >= denominacao) {
        const proximo = restante - denominacao;
        if (proximo === 1 || proximo === 3) break;
        fichas.push(denominacao);
        restante = proximo;
      }
    }

    if (restante !== 0 ||
        fichas.reduce((soma, d) => soma + d, 0) !== total) {
      throw Error("Nao foi possivel distribuir o valor autorizado.");
    }

    return fichas;
  }

  window.QC_inserirAcao195 = function(item, pedido) {
    if (
      pedido.status !== "AUTORIZADA" ||
      !/^QC-EM-[0-9a-f-]{36}$/i.test(pedido.idEmissao || "")
    ) {
      return;
    }

    let valores;
    try {
      valores = QC_distribuirFichas222(pedido.valor);
    } catch (_) {
      return;
    }

    const idEmissao = pedido.idEmissao;
    const total = Number(pedido.valor);
    const painel = document.createElement("div");
    painel.style.marginTop = "10px";

    const mensagem = document.createElement("p");
    mensagem.setAttribute("role", "status");

    const entrada = document.createElement("input");
    entrada.type = "password";
    entrada.autocomplete = "off";
    entrada.placeholder = "Senha para proteger as fichas";
    entrada.style.width = "100%";

    const confirmar = document.createElement("input");
    confirmar.type = "password";
    confirmar.autocomplete = "off";
    confirmar.placeholder = "Confirme a senha";
    confirmar.style.width = "100%";

    const botao = document.createElement("button");
    botao.type = "button";
    botao.textContent = valores.length === 1
      ? "Preparar ficha cega de " + total + " QC"
      : "Preparar " + valores.length + " fichas cegas (" + total + " QC)";

    try {
      if (pendencias()[idEmissao]) {
        mensagem.textContent =
          "Fichas cegas ja preparadas e protegidas neste celular.";
        painel.append(mensagem);
        item.appendChild(painel);
        return;
      }
    } catch (erro) {
      mensagem.textContent = "Aviso: " + erro.message;
      painel.append(mensagem);
      item.appendChild(painel);
      return;
    }

    const sessaoSenha291 = (typeof window.QC_senhaFichas291 === "function")
      ? window.QC_senhaFichas291() : "";
    if (sessaoSenha291) painel.append(botao, mensagem);
    else painel.append(entrada, confirmar, botao, mensagem);
    item.appendChild(painel);

    botao.addEventListener("click", async () => {
      const senhaDaSessao = (typeof window.QC_senhaFichas291 === "function")
        ? window.QC_senhaFichas291() : "";
      if (!senhaDaSessao && (entrada.value.length < 6 ||
          entrada.value !== confirmar.value)) {
        mensagem.textContent = "Entre na carteira novamente para proteger as fichas.";
        return;
      }

      const senha = senhaDaSessao || entrada.value;
      entrada.value = "";
      confirmar.value = "";
      botao.disabled = true;
      mensagem.textContent =
        "Preparando " + valores.length + " ficha(s) anonimamente neste celular...";

      try {
        if (!crypto?.subtle || typeof BigInt !== "function") {
          throw Error("Navegador sem suporte criptografico.");
        }

        // Uma consulta por denominacao; cada ficha usa um cegamento unico.
        const chaves = {};
        for (const denominacao of new Set(valores)) {
          const idChave = "QC-" + denominacao + "-V1";
          const resposta = await QC_post191(
            "qc_chave_publica_" + denominacao
          );
          const nHex = String(resposta.moduloHex || "").toLowerCase();
          const eHex = String(resposta.expoenteHex || "").toLowerCase();

          if (
            resposta.status !== "OK" ||
            resposta.idChave !== idChave ||
            !/^[89a-f][0-9a-f]{1023}$/.test(nHex) ||
            !/^0*10001$/.test(eHex)
          ) {
            throw Error("Chave publica de " + denominacao +
              " QC indisponivel ou invalida.");
          }
          chaves[denominacao] = {
            n: BigInt("0x" + nHex),
            e: BigInt("0x" + eHex)
          };
        }

        const registros = [];
        for (const denominacao of valores) {
          const idChave = "QC-" + denominacao + "-V1";
          const {n, e} = chaves[denominacao];
          const mensagemFicha = ENC.encode(
            "QUINTOSCOIN|V1|" + denominacao + "|" +
            idChave + "|" + crypto.randomUUID()
          );
          const preparado = juntar(
            crypto.getRandomValues(new Uint8Array(32)),
            mensagemFicha
          );
          const em = await codificarPSS(preparado);
          const m = inteiro(em);

          if (m <= ZERO || m >= n || mdc(m, n) !== UM) {
            throw Error("Mensagem RSA invalida.");
          }

          const r = aleatorioInversivel(n);
          const bloco = (m * potMod(r, e, n)) % n;

          registros.push({
            formato: "QC_FICHA_CEGA_PENDENTE_V1",
            idChave,
            valor: denominacao,
            idEmissao,
            idCota: idEmissao + "-" + denominacao,
            idOperacao: crypto.randomUUID(),
            blocoHex: hex(bytesFixos(bloco, 512)),
            inversoHex: hex(bytesFixos(inverso(r, n), 512)),
            mensagemPreparadaHex: hex(preparado)
          });
        }

        // Compatibilidade: uma ficha de 10 QC conserva o formato anterior.
        // Varias fichas ficam em um unico registro protegido por senha.
        const conteudo = registros.length === 1
          ? registros[0]
          : {
              formato: "QC_LOTE_CEGAS_PENDENTES_V2",
              idEmissao,
              valorTotal: total,
              fichas: registros
            };
        const cifrado = await criptografar(conteudo, senha);

        const p = pendencias();
        if (p[idEmissao]) {
          throw Error("Essa emissao ja foi preparada.");
        }
        p[idEmissao] = cifrado;
        localStorage.setItem(chaveArmazenamento(), JSON.stringify(p));

        botao.remove();
        entrada.remove();
        confirmar.remove();
        mensagem.textContent = registros.length +
          " ficha(s) cega(s) preparada(s) e protegida(s). " +
          "Nenhuma assinatura solicitada. Saldo inalterado.";

      } catch (erro) {
        mensagem.textContent = "Aviso: " + erro.message;
        botao.disabled = false;
      }
    });
  };

// PASSO 197 - BACKUP DA FICHA CEGA PENDENTE

window.QC_inserirBackup197 = function(item, pedido) {

  if (
    pedido.status !== "AUTORIZADA" ||
    !/^QC-EM-[0-9a-f-]{36}$/i.test(pedido.idEmissao || "")
  ) {
    return;
  }

  const registros = pendencias();
  const registro = registros[pedido.idEmissao];

  if (!registro) {
    return;
  }

  const botao = document.createElement("button");
  botao.type = "button";
  botao.textContent = "Salvar backup protegido";
  botao.style.marginTop = "10px";

  const mensagem = document.createElement("p");
  mensagem.setAttribute("role", "status");

  botao.addEventListener("click", function() {

    try {

      const atual = pendencias()[pedido.idEmissao];

      if (!atual) {
        throw new Error("Ficha pendente não encontrada.");
      }

      // Somente dados criptografados são exportados.
      const backup = {
        formato: "QUINTOSCOIN_BACKUP_PENDENTE_V1",
        criadoEm: new Date().toISOString(),
        registroCifrado: atual
      };

      const blob = new Blob(
        [JSON.stringify(backup, null, 2)],
        { type: "application/json" }
      );

      const url = URL.createObjectURL(blob);

      const link = document.createElement("a");
      link.href = url;
      link.download = "QuintosCoin_backup_pendente.json";

      document.body.appendChild(link);
      link.click();
      link.remove();

      setTimeout(function() {
        URL.revokeObjectURL(url);
      }, 3000);

      mensagem.textContent =
        "Backup solicitado. Confira se o arquivo foi salvo.";

    } catch (erro) {

      mensagem.textContent =
        "Não foi possível salvar: " + erro.message;

    }

  });

  item.append(botao, mensagem);
};

 
 // PASSO 198 - RECEBER, VERIFICAR E PROTEGER FICHA ASSINADA

async function QC_descriptografar198(cifrado, senha) {
  if (!cifrado || cifrado.versao !== 1) {
    throw Error("Backup pendente inválido.");
  }

  const salt = deHex(cifrado.saltHex || "");
  const iv = deHex(cifrado.ivHex || "");

  if (salt.length !== 16 || iv.length !== 12) {
    throw Error("Proteção da ficha inválida.");
  }

  const base = await crypto.subtle.importKey(
    "raw", ENC.encode(senha), "PBKDF2", false, ["deriveKey"]
  );

  const chave = await crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations: 310000,
      hash: "SHA-256"
    },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"]
  );

  try {
    const aberto = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      chave,
      deHex(cifrado.dadosHex || "")
    );

    return JSON.parse(
      new TextDecoder().decode(aberto)
    );

  } catch (_) {
    throw Error(
      "Senha incorreta ou ficha criptografada danificada."
    );
  }
}

function QC_chaveAssinadas198() {
  const id = localStorage.getItem("QC_ID_CARTEIRA");

  if (!id) {
    throw Error("Carteira não selecionada.");
  }

  return "QC_FICHAS_ASSINADAS_V1_" + id;
}

function QC_lerAssinadas198() {
  const valor = JSON.parse(
    localStorage.getItem(QC_chaveAssinadas198()) || "{}"
  );

  if (
    !valor ||
    typeof valor !== "object" ||
    Array.isArray(valor)
  ) {
    throw Error("Armazenamento das fichas inconsistente.");
  }

  return valor;
}

function QC_base64Url198(bytes) {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

// PASSO 224 - Receber separadamente todas as fichas autorizadas.
// Cada assinatura verificada e salva imediatamente. Em caso de falha,
// fichas anteriores nao sao descartadas e o reenvio usa o mesmo IdOperacao.
window.QC_inserirRecebimento198 = function(item, pedido) {
  if (
    pedido.status !== "AUTORIZADA" ||
    !/^QC-EM-[0-9a-f-]{36}$/i.test(pedido.idEmissao || "")
  ) {
    return;
  }

  const idEmissao = pedido.idEmissao;
  const valorAutorizado = Number(pedido.valor);
  let valoresEsperados;
  try {
    valoresEsperados = QC_distribuirFichas222(valorAutorizado);
    if (!pendencias()[idEmissao]) return;
  } catch (_) {
    return;
  }

  const painel = document.createElement("div");
  painel.style.marginTop = "10px";
  const mensagem = document.createElement("p");
  mensagem.setAttribute("role", "status");
  const senhaCampo = document.createElement("input");
  senhaCampo.type = "password";
  senhaCampo.placeholder = "Senha usada para proteger as fichas";
  senhaCampo.autocomplete = "off";
  senhaCampo.style.width = "100%";
  const botao = document.createElement("button");
  botao.type = "button";
  botao.textContent = valoresEsperados.length === 1
    ? "Assinar e receber " + valorAutorizado + " QC"
    : "Assinar e receber " + valoresEsperados.length +
      " fichas (" + valorAutorizado + " QC)";
  mensagem.textContent = "Fichas prontas. Assinatura depende da liberacao do servidor.";
  if (typeof window.QC_senhaFichas291 === "function" &&
      window.QC_senhaFichas291()) painel.append(botao, mensagem);
  else painel.append(senhaCampo, botao, mensagem);
  item.appendChild(painel);

  botao.addEventListener("click", async () => {
    const senha = (typeof window.QC_senhaFichas291 === "function"
      ? window.QC_senhaFichas291() : "") || senhaCampo.value;
    senhaCampo.value = "";
    if (!senha) {
      mensagem.textContent = "Informe a senha usada para proteger as fichas.";
      return;
    }
    botao.disabled = true;
    let armazenadasNestaTentativa = 0;

    try {
      if (!crypto?.subtle || typeof BigInt !== "function") {
        throw Error("Navegador sem suporte criptografico.");
      }
      const cifrado = pendencias()[idEmissao];
      if (!cifrado) throw Error("Fichas pendentes nao encontradas.");
      const aberto = await QC_descriptografar198(cifrado, senha);
      const fichasPendentes = aberto?.formato === "QC_LOTE_CEGAS_PENDENTES_V2"
        ? aberto.fichas
        : [aberto];

      if (
        !Array.isArray(fichasPendentes) ||
        fichasPendentes.length !== valoresEsperados.length ||
        (aberto?.formato === "QC_LOTE_CEGAS_PENDENTES_V2" &&
          (aberto.idEmissao !== idEmissao ||
           Number(aberto.valorTotal) !== valorAutorizado))
      ) {
        throw Error("Lote de fichas diferente do valor autorizado.");
      }

      const contagemEsperada = [...valoresEsperados].sort((a,b) => a-b);
      const contagemRecebida = fichasPendentes
        .map(f => Number(f?.valor)).sort((a,b) => a-b);
      if (contagemEsperada.some((v, i) => v !== contagemRecebida[i])) {
        throw Error("Denominacoes do lote inconsistentes.");
      }

      const IDs = new Set();
      const mensagens = new Set();
      const registrosValidados = [];
      const padraoUUID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
      for (const ficha of fichasPendentes) {
        const valor = Number(ficha?.valor);
        const idChave = "QC-" + valor + "-V1";
        if (
          ficha?.formato !== "QC_FICHA_CEGA_PENDENTE_V1" ||
          ficha.idEmissao !== idEmissao ||
          ficha.idCota !== idEmissao + "-" + valor ||
          ficha.idChave !== idChave ||
          !padraoUUID.test(ficha.idOperacao || "") ||
          !/^[0-9a-f]{1024}$/i.test(ficha.blocoHex || "") ||
          !/^[0-9a-f]{1024}$/i.test(ficha.inversoHex || "") ||
          IDs.has(ficha.idOperacao)
        ) {
          throw Error("Ficha pendente com dados inconsistentes.");
        }
        IDs.add(ficha.idOperacao);
        const mensagemBytes = deHex(ficha.mensagemPreparadaHex || "");
        if (mensagemBytes.length < 90) {
          throw Error("Mensagem da ficha incompleta.");
        }
        const texto = new TextDecoder("utf-8", {fatal: true})
          .decode(mensagemBytes.slice(32));
        const partes = texto.split("|");
        if (
          partes.length !== 5 ||
          partes[0] !== "QUINTOSCOIN" || partes[1] !== "V1" ||
          partes[2] !== String(valor) || partes[3] !== idChave ||
          !padraoUUID.test(partes[4]) ||
          mensagens.has(ficha.mensagemPreparadaHex)
        ) {
          throw Error("Conteudo da ficha inconsistente.");
        }
        mensagens.add(ficha.mensagemPreparadaHex);
        registrosValidados.push({ficha, valor, idChave, mensagemBytes});
      }

      // Consultar todas as chaves ANTES de solicitar qualquer assinatura.
      const chaves = {};
      for (const valor of new Set(valoresEsperados)) {
        const idChave = "QC-" + valor + "-V1";
        const publico = await QC_post191("qc_chave_publica_" + valor);
        const nHex = String(publico.moduloHex || "").toLowerCase();
        const eHex = String(publico.expoenteHex || "").toLowerCase();
        if (
          publico.status !== "OK" || publico.idChave !== idChave ||
          !/^[89a-f][0-9a-f]{1023}$/.test(nHex) ||
          !/^0*10001$/.test(eHex)
        ) {
          throw Error("Chave publica de " + valor + " QC indisponivel.");
        }
        const eNormal = eHex.length % 2 ? "0" + eHex : eHex;
        const chave = await crypto.subtle.importKey(
          "jwk",
          {
            kty: "RSA",
            n: QC_base64Url198(deHex(nHex)),
            e: QC_base64Url198(deHex(eNormal)),
            ext: true,
            key_ops: ["verify"]
          },
          {name: "RSA-PSS", hash: "SHA-384"}, false, ["verify"]
        );
        chaves[valor] = {modulo: BigInt("0x" + nHex), chave};
      }

      for (let i = 0; i < registrosValidados.length; i++) {
        const {ficha, valor, idChave, mensagemBytes} = registrosValidados[i];
        mensagem.textContent = "Conferindo ficha " + (i+1) +
          " de " + registrosValidados.length + " (" + valor + " QC)...";
        const chaveRegistro = registrosValidados.length === 1
          ? idEmissao // Preserva a chave usada na versao anterior de 10 QC.
          : idEmissao + "_" + ficha.idOperacao;
        const existentes = QC_lerAssinadas198();
        const chaveVerificacao = chaves[valor];

        if (existentes[chaveRegistro]) {
          // A ficha ja foi gravada em uma tentativa anterior.
          const anterior = await QC_descriptografar198(
            existentes[chaveRegistro], senha
          );
          if (
            anterior?.formato !== "QC_FICHA_ASSINADA_V1" ||
            anterior.idChave !== idChave || anterior.valor !== valor ||
            anterior.mensagemHex !== ficha.mensagemPreparadaHex ||
            !/^[0-9a-f]{1024}$/i.test(anterior.assinaturaHex || "") ||
            !(await crypto.subtle.verify(
              {name: "RSA-PSS", saltLength: 48}, chaveVerificacao.chave,
              deHex(anterior.assinaturaHex), mensagemBytes
            ))
          ) {
            throw Error("Ficha anteriormente salva nao confere.");
          }
          continue;
        }

        // A operacao e o bloco cego nao mudam nas tentativas de recuperacao.
        const resposta = await QC_post191("qc_assinar_ficha", {
          idEmissao,
          idOperacao: ficha.idOperacao,
          blocoHex: ficha.blocoHex,
          denominacao: valor
        });
        if (
          resposta.status !== "ASSINADO" ||
          resposta.idOperacao !== ficha.idOperacao ||
          resposta.idChave !== idChave ||
          !/^[0-9a-f]{1024}$/i.test(resposta.assinaturaCegaHex || "")
        ) {
          throw Error(resposta.mensagem || resposta.status ||
            "Assinatura indisponivel.");
        }

        const n = chaveVerificacao.modulo;
        const assinada = BigInt("0x" + resposta.assinaturaCegaHex);
        const inverso = BigInt("0x" + ficha.inversoHex);
        if (assinada <= ZERO || assinada >= n ||
            inverso <= ZERO || inverso >= n) {
          throw Error("Assinatura fora do intervalo RSA.");
        }
        const assinaturaHex = hex(bytesFixos((assinada * inverso) % n, 512));
        const valido = await crypto.subtle.verify(
          {name: "RSA-PSS", saltLength: 48}, chaveVerificacao.chave,
          deHex(assinaturaHex), mensagemBytes
        );
        if (!valido) {
          throw Error("Ficha rejeitada na verificacao criptografica.");
        }

        // A ficha assinada preserva o anonimato: sem dados do proprietario.
        const fichaAssinada = {
          formato: "QC_FICHA_ASSINADA_V1",
          idChave,
          valor,
          mensagemHex: ficha.mensagemPreparadaHex,
          assinaturaHex
        };
        const atualizadas = QC_lerAssinadas198();
        if (atualizadas[chaveRegistro]) {
          throw Error("Ficha armazenada simultaneamente. Tente novamente.");
        }
        atualizadas[chaveRegistro] = await criptografar(fichaAssinada, senha);
        localStorage.setItem(QC_chaveAssinadas198(), JSON.stringify(atualizadas));
        armazenadasNestaTentativa++;
      }

      // So remove a pendencia se TODAS as fichas estao salvas e verificadas.
      const restantes = pendencias();
      delete restantes[idEmissao];
      localStorage.setItem(chaveArmazenamento(), JSON.stringify(restantes));
      mensagem.textContent = "✅ " + registrosValidados.length +
        " ficha(s) assinada(s), verificada(s) e protegida(s).";
      botao.remove();
      senhaCampo.remove();
    } catch (erro) {
      mensagem.textContent = "⚠️ " + erro.message +
        (armazenadasNestaTentativa
          ? " Fichas ja gravadas foram preservadas; tente novamente com a mesma senha."
          : " Nenhuma ficha ja salva foi removida.");
      botao.disabled = false;
    }
  });
};

})();
