
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

})();
