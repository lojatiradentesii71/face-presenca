
 // QUINTOSCOIN - PASSO 195
 // Preparacao local de uma ficha cega de 10 QC.
 // Nao solicita assinatura nem altera saldo.

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

  window.QC_inserirAcao195 = function(item, pedido) {

    if (
      pedido.status !== "AUTORIZADA" ||
      Number(pedido.valor) !== 10 ||
      !/^QC-EM-[0-9a-f-]{36}$/i.test(
        pedido.idEmissao || ""
      )
    ) {
      return;
    }

    const painel = document.createElement("div");
    painel.style.marginTop = "10px";

    const mensagem = document.createElement("p");
    mensagem.setAttribute("role", "status");

    const entrada = document.createElement("input");
    entrada.type = "password";
    entrada.autocomplete = "off";
    entrada.placeholder = "Senha para proteger a ficha";
    entrada.style.width = "100%";

    const confirmar = document.createElement("input");
    confirmar.type = "password";
    confirmar.autocomplete = "off";
    confirmar.placeholder = "Confirme a senha";
    confirmar.style.width = "100%";

    const botao = document.createElement("button");
    botao.type = "button";
    botao.textContent =
      "Preparar ficha cega de 10 QC";

    try {
      if (pendencias()[pedido.idEmissao]) {
        mensagem.textContent =
          "Ficha cega ja preparada e protegida neste celular.";

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

    painel.append(
      entrada,
      confirmar,
      botao,
      mensagem
    );

    item.appendChild(painel);

    botao.addEventListener("click", async () => {

      if (
        entrada.value.length < 6 ||
        entrada.value !== confirmar.value
      ) {
        mensagem.textContent =
          "Informe e confirme uma senha com pelo menos 6 caracteres.";
        return;
      }

      const senha = entrada.value;
      entrada.value = "";
      confirmar.value = "";

      botao.disabled = true;
      mensagem.textContent =
        "Preparando ficha anonimamente neste celular...";

      try {
        if (
          !crypto?.subtle ||
          typeof BigInt !== "function"
        ) {
          throw Error(
            "Navegador sem suporte criptografico."
          );
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
          !["10001", "010001"].includes(eHex)
        ) {
          throw Error(
            "Chave publica indisponivel ou invalida."
          );
        }

        const n = BigInt("0x" + nHex);
        const e = BigInt("0x" + eHex);

        const mensagemFicha = ENC.encode(
          "QUINTOSCOIN|V1|10|QC-10-V1|" +
          crypto.randomUUID()
        );

        const preparado = juntar(
          crypto.getRandomValues(
            new Uint8Array(32)
          ),
          mensagemFicha
        );

        const em = await codificarPSS(preparado);
        const m = inteiro(em);

        if (
          m <= ZERO ||
          m >= n ||
          mdc(m, n) !== UM
        ) {
          throw Error("Mensagem RSA invalida.");
        }

        const r = aleatorioInversivel(n);

        const bloco = (
          m * potMod(r, e, n)
        ) % n;

        const registro = {
          formato: "QC_FICHA_CEGA_PENDENTE_V1",
          idChave: "QC-10-V1",
          valor: 10,
          idEmissao: pedido.idEmissao,
          idCota: pedido.idEmissao + "-10",
          idOperacao: crypto.randomUUID(),
          blocoHex: hex(bytesFixos(bloco, 512)),
          inversoHex: hex(
            bytesFixos(inverso(r, n), 512)
          ),
          mensagemPreparadaHex: hex(preparado)
        };

        const cifrado = await criptografar(
          registro,
          senha
        );

        const p = pendencias();

        if (p[pedido.idEmissao]) {
          throw Error(
            "Essa emissao ja foi preparada."
          );
        }

        p[pedido.idEmissao] = cifrado;

        localStorage.setItem(
          chaveArmazenamento(),
          JSON.stringify(p)
        );

        botao.remove();
        entrada.remove();
        confirmar.remove();

        mensagem.textContent =
          "Bloco cego preparado e protegido. " +
          "Nenhuma assinatura solicitada. " +
          "Saldo inalterado.";

      } catch (erro) {
        mensagem.textContent =
          "Aviso: " + erro.message;

        botao.disabled = false;
      }

    });

  };

 
// PASSO 197 - BACKUP DA FICHA CEGA PENDENTE

window.QC_inserirBackup197 = function(item, pedido) {

  if (
    pedido.status !== "AUTORIZADA" ||
    Number(pedido.valor) !== 10 ||
    !pedido.idEmissao
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

window.QC_inserirRecebimento198 = function(item, pedido) {

  if (
    pedido.status !== "AUTORIZADA" ||
    Number(pedido.valor) !== 10 ||
    !/^QC-EM-[0-9a-f-]{36}$/i.test(
      pedido.idEmissao || ""
    )
  ) {
    return;
  }

  const idEmissao = pedido.idEmissao;

  if (!pendencias()[idEmissao]) {
    return;
  }

  const painel = document.createElement("div");
  painel.style.marginTop = "10px";

  const mensagem = document.createElement("p");
  mensagem.setAttribute("role", "status");

  if (QC_lerAssinadas198()[idEmissao]) {
    mensagem.textContent =
      "✅ Ficha já recebida e protegida neste celular.";

    painel.append(mensagem);
    item.appendChild(painel);
    return;
  }

  const senhaCampo = document.createElement("input");
  senhaCampo.type = "password";
  senhaCampo.placeholder =
    "Senha usada para proteger a ficha";
  senhaCampo.autocomplete = "off";
  senhaCampo.style.width = "100%";

  const botao = document.createElement("button");
  botao.type = "button";
  botao.textContent = "Assinar e receber 10 QC";

  // Permanece bloqueado nesta etapa.
  botao.disabled = true;

  mensagem.textContent =
    "Ficha pronta. Assinatura aguardando liberação.";

  painel.append(senhaCampo, botao, mensagem);
  item.appendChild(painel);

  botao.addEventListener("click", async () => {

    const senha = senhaCampo.value;
    senhaCampo.value = "";

    if (!senha) {
      mensagem.textContent = "Informe a senha da ficha.";
      return;
    }

    botao.disabled = true;
    mensagem.textContent =
      "Validando e assinando a ficha...";

    try {

      const cifrado = pendencias()[idEmissao];

      if (!cifrado) {
        throw Error("Ficha pendente não encontrada.");
      }

      const pendente = await QC_descriptografar198(
        cifrado, senha
      );

      if (
        pendente.formato !== "QC_FICHA_CEGA_PENDENTE_V1" ||
        pendente.idChave !== "QC-10-V1" ||
        pendente.valor !== 10 ||
        pendente.idEmissao !== idEmissao ||
        pendente.idCota !== idEmissao + "-10" ||
        !/^[0-9a-f-]{36}$/i.test(
          pendente.idOperacao || ""
        ) ||
        !/^[0-9a-f]{1024}$/i.test(
          pendente.blocoHex || ""
        ) ||
        !/^[0-9a-f]{1024}$/i.test(
          pendente.inversoHex || ""
        )
      ) {
        throw Error("Dados da ficha inconsistentes.");
      }

      const mensagemBytes = deHex(
        pendente.mensagemPreparadaHex || ""
      );

      const conteudo = new TextDecoder().decode(
        mensagemBytes.slice(32)
      );

      if (
        mensagemBytes.length < 90 ||
        !/^QUINTOSCOIN\|V1\|10\|QC-10-V1\|[0-9a-f-]{36}$/i
          .test(conteudo)
      ) {
        throw Error("Conteúdo da ficha inválido.");
      }

      const publico = await QC_post191(
        "qc_chave_publica_10"
      );

      const nHex = String(
        publico.moduloHex || ""
      ).toLowerCase();

      const eHex = String(
        publico.expoenteHex || ""
      ).toLowerCase();

      if (
        publico.status !== "OK" ||
        publico.idChave !== "QC-10-V1" ||
        !/^[89a-f][0-9a-f]{1023}$/.test(nHex) ||
        !/^0*10001$/.test(eHex)
      ) {
        throw Error("Chave pública inválida.");
      }

      // Em caso de falha, reutilizar a mesma
      // operação e o mesmo bloco cego.
      const resposta = await QC_post191(
        "qc_assinar_ficha",
        {
          idEmissao,
          idOperacao: pendente.idOperacao,
          blocoHex: pendente.blocoHex
        }
      );

      if (
        resposta.status !== "ASSINADO" ||
        resposta.idOperacao !== pendente.idOperacao ||
        resposta.idChave !== "QC-10-V1" ||
        !/^[0-9a-f]{1024}$/i.test(
          resposta.assinaturaCegaHex || ""
        )
      ) {
        throw Error(
          resposta.mensagem ||
          resposta.status ||
          "Assinatura indisponível."
        );
      }

      // Remover o cegamento.
      const n = BigInt("0x" + nHex);

      const assinada = BigInt(
        "0x" + resposta.assinaturaCegaHex
      );

      const inverso = BigInt(
        "0x" + pendente.inversoHex
      );

      if (
        assinada <= ZERO ||
        assinada >= n ||
        inverso <= ZERO ||
        inverso >= n
      ) {
        throw Error(
          "Assinatura fora do intervalo RSA."
        );
      }

      const assinaturaHex = hex(
        bytesFixos((assinada * inverso) % n, 512)
      );

      // Conferir RSA-PSS / SHA-384.
      const expoente = deHex(
        eHex.padStart(
          eHex.length + eHex.length % 2, "0"
        )
      );

      const chavePublica =
        await crypto.subtle.importKey(
          "jwk",
          {
            kty: "RSA",
            n: QC_base64Url198(deHex(nHex)),
            e: QC_base64Url198(expoente),
            ext: true,
            key_ops: ["verify"]
          },
          { name: "RSA-PSS", hash: "SHA-384" },
          false,
          ["verify"]
        );

      const verificada = await crypto.subtle.verify(
        { name: "RSA-PSS", saltLength: 48 },
        chavePublica,
        deHex(assinaturaHex),
        mensagemBytes
      );

      if (!verificada) {
        throw Error(
          "Ficha rejeitada na verificação criptográfica."
        );
      }

      // A ficha anônima não contém IdCadastro,
      // nome do irmão ou número da autorização.
      const ficha = {
        formato: "QC_FICHA_ASSINADA_V1",
        idChave: "QC-10-V1",
        valor: 10,
        mensagemHex: pendente.mensagemPreparadaHex,
        assinaturaHex
      };

      const recebidas = QC_lerAssinadas198();

      if (!recebidas[idEmissao]) {
        recebidas[idEmissao] =
          await criptografar(ficha, senha);

        localStorage.setItem(
          QC_chaveAssinadas198(),
          JSON.stringify(recebidas)
        );
      }

      // Somente eliminar a pendência depois
      // de salvar a ficha assinada.
      const restantes = pendencias();
      delete restantes[idEmissao];

      localStorage.setItem(
        chaveArmazenamento(),
        JSON.stringify(restantes)
      );

      mensagem.textContent =
        "✅ Ficha assinada, verificada e protegida.";

      botao.remove();
      senhaCampo.remove();

    } catch (erro) {

      mensagem.textContent =
        "⚠️ " + erro.message;

      botao.disabled = false;

    }

  });

};



})();
