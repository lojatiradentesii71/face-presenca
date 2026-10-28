
"use strict";

// QUINTOSCOIN - CRIPTOGRAFIA V2
// PBKDF2-HMAC-SHA256
// 600.000 iterações, resultado de 256 bits.

const QC_PBKDF2_ITERACOES = 600000;

function QC_gerarSaltSenhaV2() {

  const bytes = crypto.getRandomValues(
    new Uint8Array(16)
  );

  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

async function QC_derivarSenhaV2(senha, saltHex) {

  if (typeof senha !== "string" ||
      senha.length < 6 ||
      senha.length > 8) {

    throw new Error(
      "A senha deve ter entre 6 e 8 caracteres."
    );
  }

  if (!/^[0-9a-f]{32}$/i.test(saltHex)) {

    throw new Error(
      "Salt da senha inválido."
    );
  }

  const saltBytes = new Uint8Array(
    saltHex.match(/.{2}/g)
      .map(par => parseInt(par, 16))
  );

  const encoder = new TextEncoder();

  const chave = await crypto.subtle.importKey(
    "raw",
    encoder.encode(senha),
    "PBKDF2",
    false,
    ["deriveBits"]
  );

  const derivado = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: saltBytes,
      iterations: QC_PBKDF2_ITERACOES,
      hash: "SHA-256"
    },
    chave,
    256
  );

  return Array.from(new Uint8Array(derivado))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}
