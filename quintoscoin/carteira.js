const QC_CHAVE_CARTEIRA = "QC_CARTEIRA_TESTE";

function QC_lerCarteira() {

  try {
    const dados = JSON.parse(
      localStorage.getItem(QC_CHAVE_CARTEIRA) || "[]"
    );

    return Array.isArray(dados) ? dados : [];

  } catch (erro) {
    console.error("Erro ao ler carteira:", erro);
    return [];
  }
}

function QC_atualizarTela() {

  const fichas = QC_lerCarteira();

  const saldo = fichas.reduce(
    (total, ficha) => total + Number(ficha.valor || 0),
    0
  );

  document.getElementById("saldo")
    .textContent = saldo + " QC";

  document.getElementById("equivalente")
    .textContent = saldo.toLocaleString(
      "pt-BR",
      {
        style: "currency",
        currency: "BRL"
      }
    );

  const lista = document.getElementById("listaFichas");

  lista.innerHTML = "";

  if (fichas.length === 0) {
    lista.textContent = "Nenhuma ficha disponível.";
    return;
  }

  fichas.forEach(ficha => {

    const elemento = document.createElement("div");
    elemento.className = "ficha";
    elemento.textContent = ficha.valor + " QC";

    lista.appendChild(elemento);
  });
}

document.getElementById("btnReceber")
  .addEventListener("click", function() {

    document.getElementById("mensagem")
      .textContent =
      "Emissão de QuintosCoin ainda não habilitada.";

  });

document.getElementById("btnDoar")
  .addEventListener("click", function() {

    document.getElementById("mensagem")
      .textContent =
      "Doações serão habilitadas após a validação das fichas.";

  });

QC_atualizarTela();

const QC_ID_LOCAL = "QC_ID_CARTEIRA";

function QC_mostrarAtivacao() {

  document.getElementById("formAtivacao")
    .style.display = "block";

  document.getElementById("formLogin")
    .style.display = "none";
}

function QC_mostrarLogin() {

  document.getElementById("formAtivacao")
    .style.display = "none";

  document.getElementById("formLogin")
    .style.display = "block";
}

document.getElementById("linkJaTenhoCarteira")
  .addEventListener("click", function(evento) {

    evento.preventDefault();
    QC_mostrarLogin();

  });

document.getElementById("linkPrimeiroAcesso")
  .addEventListener("click", function(evento) {

    evento.preventDefault();
    QC_mostrarAtivacao();

  });

function QC_mostrarMensagemAcesso(texto, tipo) {

  const mensagem = document.getElementById(
    "qcMensagemAcesso"
  );

  mensagem.className = "";
  void mensagem.offsetWidth; // Reinicia a animação

  mensagem.textContent =
    (tipo === "erro" ? "⚠️ " : "✅ ") + texto;

  mensagem.className = tipo;

  mensagem.scrollIntoView({
    behavior: "smooth",
    block: "nearest"
  });
}

let QC_ativacaoPendente = null;
let QC_recuperacaoPendente = null;

document.getElementById("btnAtivarCarteira")
  .addEventListener("click", function(evento) {

    evento.preventDefault();

    const campoId = document.getElementById("qcIdCadastro");
    const campoSenha = document.getElementById("qcNovaSenha");
    const campoConfirmar = document.getElementById("qcConfirmarSenha");

    const id = campoId.value.trim();
    const senha = campoSenha.value;
    const confirmar = campoConfirmar.value;

    [campoId, campoSenha, campoConfirmar].forEach(
      campo => campo.classList.remove("campo-erro")
    );

    if (!id) {
      campoId.classList.add("campo-erro");
      QC_mostrarMensagemAcesso(
        "Informe seu IdCadastro.",
        "erro"
      );
      return;
    }

    if (senha.length < 6 || senha.length > 8) {
      campoSenha.classList.add("campo-erro");
      QC_mostrarMensagemAcesso(
        "A senha deve ter entre 6 e 8 caracteres.",
        "erro"
      );
      return;
    }

    if (senha !== confirmar) {
      campoConfirmar.classList.add("campo-erro");
      QC_mostrarMensagemAcesso(
        "As senhas não conferem.",
        "erro"
      );
      return;
    }

    // Gerar código seguro de recuperação
    const bytes = new Uint8Array(16);
    window.crypto.getRandomValues(bytes);

    const codigo = Array.from(bytes)
      .map(b => b.toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase()
      .match(/.{1,8}/g)
      .join("-");

    // Dados temporários, mantidos apenas em memória
    QC_ativacaoPendente = {
      idCadastro: id,
      senha: senha,
      codigoRecuperacao: codigo
    };

    // Exibir código ANTES de registrar a carteira
    QC_exibirCodigoRecuperacao(codigo);

  });


async function QC_enviarAtivacaoTeste(dados) {

  const URL_APPS_SCRIPT =
    "https://script.google.com/macros/s/AKfycbxEU0xzZz833Bqv7CxV-PdTVIjxRrl27lNgSG0upZ07rnXaAkULhGGuehxbpU2-K1oyOQ/exec";

  const resposta = await fetch(URL_APPS_SCRIPT, {
    method: "POST",
    redirect: "follow",
    headers: {
      "Content-Type": "text/plain;charset=utf-8"
    },
    body: JSON.stringify({
      acao: "qc_ativar_teste",
      idCadastro: dados.idCadastro,
      senha: dados.senha,
      codigoRecuperacao: dados.codigoRecuperacao
    })
  });

  if (!resposta.ok) {
    throw new Error(
      "Erro HTTP: " + resposta.status
    );
  }

  const resultado = await resposta.json();

  if (
    resultado.status !== "OK" ||
    !resultado.idCarteira
  ) {
    throw new Error(
      resultado.mensagem ||
      "Não foi possível ativar a carteira."
    );
  }

  return resultado;
}


async function QC_enviarLoginTeste(idCarteira, senha) {

  const URL_APPS_SCRIPT =
    "https://script.google.com/macros/s/AKfycbxEU0xzZz833Bqv7CxV-PdTVIjxRrl27lNgSG0upZ07rnXaAkULhGGuehxbpU2-K1oyOQ/exec";

  const resposta = await fetch(URL_APPS_SCRIPT, {
    method: "POST",
    redirect: "follow",
    headers: {
      "Content-Type": "text/plain;charset=utf-8"
    },
    body: JSON.stringify({
      acao: "qc_login_teste",
      idCarteira: idCarteira,
      senha: senha
    })
  });

  if (!resposta.ok) {
    throw new Error("Erro HTTP: " + resposta.status);
  }

  return await resposta.json();
}


const QC_CHAVE_SESSAO = "QC_TOKEN_SESSAO_TESTE";


async function QC_validarSessaoServidor(tokenSessao) {

  const URL_APPS_SCRIPT =
    "https://script.google.com/macros/s/AKfycbxEU0xzZz833Bqv7CxV-PdTVIjxRrl27lNgSG0upZ07rnXaAkULhGGuehxbpU2-K1oyOQ/exec";

  const resposta = await fetch(URL_APPS_SCRIPT, {
    method: "POST",
    redirect: "follow",
    headers: {
      "Content-Type": "text/plain;charset=utf-8"
    },
    body: JSON.stringify({
      acao: "qc_validar_sessao_teste",
      tokenSessao: tokenSessao
    })
  });

  if (!resposta.ok) {
    throw new Error(
      "Erro de comunicação HTTP: " + resposta.status
    );
  }

  return await resposta.json();
}




document.getElementById("btnEntrarCarteira")
  .addEventListener("click", async function(evento) {

    evento.preventDefault();

    const campoSenha = document.getElementById(
      "qcSenhaLogin"
    );

    const botao = document.getElementById(
      "btnEntrarCarteira"
    );

    const idCarteira = localStorage.getItem(
      QC_ID_LOCAL
    );

    const senha = campoSenha.value;

    if (!idCarteira) {
      QC_mostrarMensagemAcesso(
        "Carteira não identificada neste dispositivo.",
        "erro"
      );
      return;
    }

    if (!senha) {
      QC_mostrarMensagemAcesso(
        "Informe sua senha.",
        "erro"
      );
      campoSenha.focus();
      return;
    }

    botao.disabled = true;
    botao.textContent = "Verificando senha...";

    try {

      const resultado = await QC_enviarLoginAutomatico(
        idCarteira,
        senha
      );

     
if (resultado.status === "OK") {

  if (!resultado.tokenSessao) {
    throw new Error(
      "O servidor não retornou o token da sessão."
    );
  }

  // Verificar o token no Apps Script
  const verificacao = await QC_validarSessaoServidor(
    resultado.tokenSessao
  );

  if (
    verificacao.status !== "OK" ||
    verificacao.idCarteira !== idCarteira
  ) {
    throw new Error(
      verificacao.mensagem ||
      "Não foi possível validar a sessão."
    );
  }

  // Guardar o token temporário
  sessionStorage.setItem(
    QC_CHAVE_SESSAO,
    resultado.tokenSessao
  );

  // Limpar o campo da senha
  campoSenha.value = "";

  // Mostrar a carteira demonstrativa
  QC_exibirTelaCarteira();

  // Manter operações financeiras desabilitadas
  document.getElementById("btnReceber").disabled = true;
  document.getElementById("btnDoar").disabled = true;

  document.getElementById("mensagem").textContent =
    "✅ Login e sessão validados! " +
    "Carteira de demonstração. " +
    "Recebimentos e doações ainda não habilitados.";

} else {


        QC_mostrarMensagemAcesso(
          resultado.mensagem ||
          "Não foi possível realizar o login.",
          "erro"
        );

      }

    } catch (erro) {

      QC_mostrarMensagemAcesso(
        "Falha na comunicação: " + erro.message,
        "erro"
      );

    } finally {

      botao.disabled = false;
      botao.textContent = "Entrar";

    }

  });


if (localStorage.getItem(QC_ID_LOCAL)) {
  QC_mostrarLogin();
} else {
  QC_mostrarAtivacao();
}

function QC_exibirTelaAcesso() {

  document.getElementById("telaAcesso")
    .style.display = "block";

  document.getElementById("telaCarteira")
    .style.display = "none";
}

function QC_exibirTelaCarteira() {

  document.getElementById("telaAcesso")
    .style.display = "none";

  document.getElementById("telaCarteira")
    .style.display = "block";

  QC_atualizarTela();
}

// Por segurança, sempre iniciar na tela de acesso.
// A carteira só será exibida após autenticação.
QC_exibirTelaAcesso();


async function QC_testarConexaoServidor() {

  const URL_APPS_SCRIPT =
    "https://script.google.com/macros/s/AKfycbxEU0xzZz833Bqv7CxV-PdTVIjxRrl27lNgSG0upZ07rnXaAkULhGGuehxbpU2-K1oyOQ/exec";

  try {

    const resposta = await fetch(
      URL_APPS_SCRIPT + "?acao=qc_teste",
      {
        method: "GET",
        redirect: "follow"
      }
    );

    if (!resposta.ok) {
      throw new Error(
        "Erro HTTP: " + resposta.status
      );
    }

    const dados = await resposta.json();

    if (
      dados.sistema !== "QuintosCoin" ||
      dados.status !== "OK"
    ) {
      throw new Error(
        dados.mensagem || "Resposta inesperada do servidor."
      );
    }

    return {
      status: "OK",
      mensagem: dados.mensagem
    };

  } catch (erro) {

    console.error(
      "Erro de comunicação QuintosCoin:",
      erro
    );

    return {
      status: "ERRO",
      mensagem: erro.message || "Erro desconhecido."
    };

  }
}

async function QC_testarConexaoPost() {

  const URL_APPS_SCRIPT =
    "https://script.google.com/macros/s/AKfycbxEU0xzZz833Bqv7CxV-PdTVIjxRrl27lNgSG0upZ07rnXaAkULhGGuehxbpU2-K1oyOQ/exec";

  try {

    const resposta = await fetch(URL_APPS_SCRIPT, {
      method: "POST",
      redirect: "follow",
      headers: {
        "Content-Type": "text/plain;charset=utf-8"
      },
      body: JSON.stringify({
        acao: "qc_teste_post"
      })
    });

    if (!resposta.ok) {
      throw new Error("HTTP " + resposta.status);
    }

    const dados = await resposta.json();

    if (
      dados.sistema !== "QuintosCoin" ||
      dados.status !== "OK"
    ) {
      throw new Error(
        dados.mensagem || "Resposta inesperada do servidor."
      );
    }

    return {
      status: "OK",
      mensagem: dados.mensagem
    };

  } catch (erro) {

    console.error("Erro POST QuintosCoin:", erro);

    return {
      status: "ERRO",
      mensagem: erro.message || "Erro desconhecido."
    };
  }
}


function QC_exibirCodigoRecuperacao(codigo) {

  document.getElementById("telaAcesso")
    .style.display = "none";

  document.getElementById("telaCarteira")
    .style.display = "none";

  document.getElementById("telaRecuperacao")
    .style.display = "block";

  document.getElementById("qcCodigoRecuperacao")
    .textContent = codigo;

  document.getElementById("qcMensagemCopia")
    .textContent = "";

  document.getElementById("qcConfirmouCodigo")
    .checked = false;

  document.getElementById("qcBtnContinuar")
    .disabled = true;
}


document.getElementById("qcBtnCopiar")
  .addEventListener("click", async function() {

    const codigo = document.getElementById(
      "qcCodigoRecuperacao"
    ).textContent;

    const mensagem = document.getElementById(
      "qcMensagemCopia"
    );

    try {

      await navigator.clipboard.writeText(codigo);

      mensagem.textContent =
        "✅ Código copiado! Guarde-o em local seguro.";

    } catch (erro) {

      mensagem.textContent =
        "Não foi possível copiar automaticamente. Selecione o código e copie manualmente.";

    }

  });


document.getElementById("qcConfirmouCodigo")
  .addEventListener("change", function() {

    document.getElementById("qcBtnContinuar")
      .disabled = !this.checked;

  });




document.getElementById("qcBtnContinuar")
  .addEventListener("click", async function() {

    const botao = document.getElementById(
      "qcBtnContinuar"
    );

    const mensagem = document.getElementById(
      "qcMensagemCopia"
    );

    const confirmou = document.getElementById(
      "qcConfirmouCodigo"
    ).checked;

    if (!confirmou) {
      return;
    }

    botao.disabled = true;

    // =========================================
    // RECUPERAÇÃO DE SENHA
    // =========================================

    if (QC_recuperacaoPendente) {

      mensagem.textContent =
        "Redefinindo senha de teste...";

      try {

        await QC_enviarRecuperacaoTeste(
          QC_recuperacaoPendente
        );

        // Apagar o token local, caso exista.
        sessionStorage.removeItem(
          QC_CHAVE_SESSAO
        );

        // Limpar dados temporários.
        QC_recuperacaoPendente = null;

        document.getElementById(
          "qcCodigoRecuperar"
        ).value = "";

        document.getElementById(
          "qcSenhaRecuperar"
        ).value = "";

        document.getElementById(
          "qcConfirmarSenhaRecuperar"
        ).value = "";

        // Fechar as telas de recuperação.
        document.getElementById(
          "telaRecuperacao"
        ).style.display = "none";

        document.getElementById(
          "formRecuperarSenha"
        ).style.display = "none";

        // Retornar ao login.
        QC_exibirTelaAcesso();
        QC_mostrarLogin();

        document.getElementById(
          "qcSenhaLogin"
        ).value = "";

        QC_mostrarMensagemAcesso(
          "Senha redefinida com sucesso! " +
          "Entre utilizando sua nova senha.",
          "sucesso"
        );

      } catch (erro) {

        mensagem.style.color = "#ffcc80";

        mensagem.textContent =
          "⚠️ Não foi possível confirmar a redefinição: " +
          erro.message +
          ". Guarde o novo código apresentado.";

      } finally {

        botao.disabled = false;

      }

      return;
    }

    // =========================================
    // PRIMEIRA ATIVAÇÃO
    // =========================================

    if (!QC_ativacaoPendente) {
      botao.disabled = false;
      return;
    }

    mensagem.textContent =
      "Registrando carteira de teste...";

    try {

      const resultado = await QC_enviarAtivacaoTeste(
        QC_ativacaoPendente
      );

      localStorage.setItem(
        QC_ID_LOCAL,
        resultado.idCarteira
      );

      QC_ativacaoPendente = null;

      document.getElementById(
        "qcNovaSenha"
      ).value = "";

      document.getElementById(
        "qcConfirmarSenha"
      ).value = "";

      document.getElementById(
        "qcSenhaLogin"
      ).value = "";

      document.getElementById(
        "telaRecuperacao"
      ).style.display = "none";

      QC_exibirTelaAcesso();
      QC_mostrarLogin();

      QC_mostrarMensagemAcesso(
        "Carteira de teste ativada! " +
        "Agora você poderá utilizar a tela de login.",
        "sucesso"
      );

    } catch (erro) {

      mensagem.style.color = "#ffcc80";

      mensagem.textContent =
        "⚠️ Não foi possível confirmar a ativação: " +
        erro.message +
        ". Guarde o código apresentado.";

    } finally {

      botao.disabled = false;

    }

  });


// QUINTOSCOIN - ENCERRAR SESSÃO

async function QC_enviarLogoutTeste(tokenSessao) {

  const URL_APPS_SCRIPT =
    "https://script.google.com/macros/s/AKfycbxEU0xzZz833Bqv7CxV-PdTVIjxRrl27lNgSG0upZ07rnXaAkULhGGuehxbpU2-K1oyOQ/exec";

  const resposta = await fetch(URL_APPS_SCRIPT, {
    method: "POST",
    redirect: "follow",
    headers: {
      "Content-Type": "text/plain;charset=utf-8"
    },
    body: JSON.stringify({
      acao: "qc_logout_teste",
      tokenSessao: tokenSessao
    })
  });

  if (!resposta.ok) {
    throw new Error("Erro HTTP: " + resposta.status);
  }

  return await resposta.json();
}


document.getElementById("btnSairCarteira")
  .addEventListener("click", async function() {

    const botao = document.getElementById(
      "btnSairCarteira"
    );

    const token = sessionStorage.getItem(
      QC_CHAVE_SESSAO
    );

    botao.disabled = true;
    botao.textContent = "Encerrando sessão...";

    try {

      if (token) {

        const resultado = await QC_enviarLogoutTeste(
          token
        );

        if (
          resultado.status !== "OK" &&
          resultado.status !== "SESSAO_INVALIDA"
        ) {
          throw new Error(
            resultado.mensagem ||
            "Não foi possível encerrar a sessão."
          );
        }
      }

      // Remover somente o token de sessão.
      sessionStorage.removeItem(QC_CHAVE_SESSAO);

      // Ocultar a carteira e mostrar o login.
      QC_exibirTelaAcesso();
      QC_mostrarLogin();

      document.getElementById(
        "qcSenhaLogin"
      ).value = "";

      QC_mostrarMensagemAcesso(
        "Sessão encerrada! Digite sua senha para entrar novamente.",
        "sucesso"
      );

    } catch (erro) {

      // Em caso de falha, não afirmar que o servidor
      // encerrou a sessão. Permitir nova tentativa.
      document.getElementById("mensagem").textContent =
        "⚠️ Não foi possível confirmar o encerramento: " +
        erro.message +
        ". Tente novamente.";

    } finally {

      botao.disabled = false;
      botao.textContent = "🚪 Sair da carteira";

    }

  });


/* QUINTOSCOIN - RESTAURAR SESSÃO AO ABRIR */

async function QC_restaurarSessaoTeste() {

  const token = sessionStorage.getItem(
    QC_CHAVE_SESSAO
  );

  const idCarteira = localStorage.getItem(
    QC_ID_LOCAL
  );

  // Sem token ou sem carteira identificada:
  // manter a tela de acesso.
 
if (!token || !idCarteira) {
  document.documentElement.classList.remove(
    "qc-restaurando"
  );
  return;
}


  // Não interferir na tela temporária de teste
  // do código de recuperação.
  if (
    new URLSearchParams(window.location.search)
      .has("testeRecuperacao")
  ) {
    return;
  }

  try {

    const resultado = await QC_validarSessaoServidor(
      token
    );

    if (
      resultado.status === "OK" &&
      resultado.idCarteira === idCarteira
    ) {

      // Sessão confirmada pelo servidor.
      QC_exibirTelaCarteira();

      // Manter as operações desabilitadas.
      document.getElementById("btnReceber")
        .disabled = true;

      document.getElementById("btnDoar")
        .disabled = true;

      document.getElementById("mensagem")
        .textContent =
        "✅ Sessão restaurada automaticamente! " +
        "Carteira demonstrativa.";

      return;
    }

    // Sessão expirada, inválida ou de outra carteira.
    sessionStorage.removeItem(
      QC_CHAVE_SESSAO
    );

    QC_exibirTelaAcesso();
    QC_mostrarLogin();

    QC_mostrarMensagemAcesso(
      "Sua sessão expirou. Digite sua senha para entrar.",
      "erro"
    );

  } catch (erro) {

    // Se a comunicação falhar, manter a tela de login.
    // Não apagar o token até termos uma resposta
    // confirmando que ele é inválido.
    QC_exibirTelaAcesso();
    QC_mostrarLogin();

   
QC_mostrarMensagemAcesso(
  "Não foi possível verificar sua sessão. " +
  "Confira a conexão ou faça login novamente.",
  "erro"
);

} finally {

  // Remover a tela de verificação,
  // independentemente do resultado.
  document.documentElement.classList.remove(
    "qc-restaurando"
  );

}

}



// Verificar a sessão ao abrir a página.
QC_restaurarSessaoTeste();


async function QC_enviarAlteracaoSenha(
  tokenSessao,
  senhaAtual,
  novaSenha
) {

  const URL_APPS_SCRIPT =
    "https://script.google.com/macros/s/AKfycbxEU0xzZz833Bqv7CxV-PdTVIjxRrl27lNgSG0upZ07rnXaAkULhGGuehxbpU2-K1oyOQ/exec";

  const resposta = await fetch(URL_APPS_SCRIPT, {
    method: "POST",
    redirect: "follow",
    headers: {
      "Content-Type": "text/plain;charset=utf-8"
    },
    body: JSON.stringify({
      acao: "qc_alterar_senha_teste",
      tokenSessao: tokenSessao,
      senhaAtual: senhaAtual,
      novaSenha: novaSenha
    })
  });

  if (!resposta.ok) {
    throw new Error("Erro HTTP: " + resposta.status);
  }

  return await resposta.json();
}


// QUINTOSCOIN - INTERFACE DE ALTERAÇÃO DE SENHA

function QC_limparFormularioTrocaSenha() {

  document.getElementById("qcSenhaAtual").value = "";
  document.getElementById("qcSenhaNova").value = "";
  document.getElementById("qcSenhaNovaConfirmar").value = "";

  const mensagem = document.getElementById(
    "qcMensagemTrocaSenha"
  );

  mensagem.textContent = "";
  mensagem.className = "";
}


function QC_mostrarMensagemTrocaSenha(texto, tipo) {

  const mensagem = document.getElementById(
    "qcMensagemTrocaSenha"
  );

  mensagem.textContent =
    (tipo === "erro" ? "⚠️ " : "✅ ") + texto;

  mensagem.className = tipo;
}


document.getElementById("btnAbrirTrocaSenha")
  .addEventListener("click", function() {

    QC_limparFormularioTrocaSenha();

    document.getElementById("qcPainelTrocaSenha")
      .style.display = "block";

    document.getElementById("btnAbrirTrocaSenha")
      .style.display = "none";

  });


document.getElementById("btnCancelarTrocaSenha")
  .addEventListener("click", function() {

    QC_limparFormularioTrocaSenha();

    document.getElementById("qcPainelTrocaSenha")
      .style.display = "none";

    document.getElementById("btnAbrirTrocaSenha")
      .style.display = "block";

  });



document.getElementById("btnConfirmarTrocaSenha")
  .addEventListener("click", async function() {

    const atual = document.getElementById(
      "qcSenhaAtual"
    ).value;

    const nova = document.getElementById(
      "qcSenhaNova"
    ).value;

    const confirmar = document.getElementById(
      "qcSenhaNovaConfirmar"
    ).value;

    const token = sessionStorage.getItem(
      QC_CHAVE_SESSAO
    );

    const botao = document.getElementById(
      "btnConfirmarTrocaSenha"
    );

    // Validar formulário

    if (!atual) {
      QC_mostrarMensagemTrocaSenha(
        "Informe sua senha atual.",
        "erro"
      );
      return;
    }

    if (nova.length < 6 || nova.length > 8) {
      QC_mostrarMensagemTrocaSenha(
        "A nova senha deve ter entre 6 e 8 caracteres.",
        "erro"
      );
      return;
    }

    if (nova === atual) {
      QC_mostrarMensagemTrocaSenha(
        "A nova senha deve ser diferente da atual.",
        "erro"
      );
      return;
    }

    if (nova !== confirmar) {
      QC_mostrarMensagemTrocaSenha(
        "As senhas não conferem.",
        "erro"
      );
      return;
    }

    if (!token) {
      QC_mostrarMensagemTrocaSenha(
        "Sessão não encontrada. Faça login novamente.",
        "erro"
      );
      return;
    }

    // Enviar alteração ao servidor

    botao.disabled = true;
    botao.textContent = "Alterando senha...";

    try {

      const resultado = await QC_enviarAlteracaoSenha(
        token,
        atual,
        nova
      );

      if (resultado.status === "OK") {

        // Remover token da sessão anterior
        sessionStorage.removeItem(QC_CHAVE_SESSAO);

        // Limpar dados do formulário
        QC_limparFormularioTrocaSenha();

        document.getElementById("qcPainelTrocaSenha")
          .style.display = "none";

        document.getElementById("btnAbrirTrocaSenha")
          .style.display = "block";

        // Voltar ao login
        QC_exibirTelaAcesso();
        QC_mostrarLogin();

        document.getElementById("qcSenhaLogin")
          .value = "";

        QC_mostrarMensagemAcesso(
          "Senha alterada com sucesso! " +
          "Entre novamente utilizando sua nova senha.",
          "sucesso"
        );

      } else {

        if (resultado.status === "SESSAO_INVALIDA") {
          sessionStorage.removeItem(QC_CHAVE_SESSAO);

          QC_exibirTelaAcesso();
          QC_mostrarLogin();

          QC_mostrarMensagemAcesso(
            "Sessão expirada. Faça login novamente.",
            "erro"
          );

        } else {

          QC_mostrarMensagemTrocaSenha(
            resultado.mensagem ||
            "Não foi possível alterar a senha.",
            "erro"
          );

        }
      }

    } catch (erro) {

      QC_mostrarMensagemTrocaSenha(
        "Falha na comunicação: " + erro.message +
        ". Verifique se a senha foi alterada antes de tentar novamente.",
        "erro"
      );

    } finally {

      botao.disabled = false;
      botao.textContent = "Salvar nova senha";

    }

  });


/* QUINTOSCOIN - MOSTRAR / OCULTAR SENHAS */

function QC_adicionarOlhinhosSenhas() {

  const campos = document.querySelectorAll(
    'input[type="password"]'
  );

  campos.forEach(function(campo) {

    // Evitar adicionar dois botões ao mesmo campo
    if (campo.closest(".qc-campo-com-olho")) {
      return;
    }

    // Criar estrutura que envolve o campo
    const container = document.createElement("div");
    container.className = "qc-campo-com-olho";

    campo.parentNode.insertBefore(container, campo);
    container.appendChild(campo);

    // Criar botão do olhinho
    const botao = document.createElement("button");

    botao.type = "button";
    botao.className = "qc-botao-olho";
    botao.textContent = "👁️";
    botao.setAttribute("aria-label", "Mostrar senha");
    botao.setAttribute("aria-pressed", "false");

    container.appendChild(botao);

    // Alternar entre senha oculta e visível
    botao.addEventListener("click", function() {

      const mostrar = campo.type === "password";

      campo.type = mostrar ? "text" : "password";

      botao.textContent = mostrar ? "🙈" : "👁️";

      botao.setAttribute(
        "aria-label",
        mostrar ? "Ocultar senha" : "Mostrar senha"
      );

      botao.setAttribute(
        "aria-pressed",
        String(mostrar)
      );

      botao.classList.toggle("visivel", mostrar);

    });

  });
}


// Adicionar os olhinhos aos campos existentes
QC_adicionarOlhinhosSenhas();


/* QUINTOSCOIN - FORMULÁRIO ESQUECI MINHA SENHA */

function QC_abrirRecuperacaoSenha() {

  document.getElementById("formAtivacao")
    .style.display = "none";

  document.getElementById("formLogin")
    .style.display = "none";

  document.getElementById("formRecuperarSenha")
    .style.display = "block";

  document.getElementById("qcCodigoRecuperar").value = "";
  document.getElementById("qcSenhaRecuperar").value = "";
  document.getElementById("qcConfirmarSenhaRecuperar").value = "";

  document.getElementById("qcMensagemRecuperacao")
    .textContent = "";

  document.getElementById("qcMensagemRecuperacao")
    .className = "";
}


function QC_mensagemRecuperacao(texto, tipo) {

  const mensagem = document.getElementById(
    "qcMensagemRecuperacao"
  );

  mensagem.textContent =
    (tipo === "erro" ? "⚠️ " : "✅ ") + texto;

  mensagem.className = tipo;
}


document.getElementById("linkEsqueciSenha")
  .addEventListener("click", function(evento) {

    evento.preventDefault();

    QC_abrirRecuperacaoSenha();

  });


document.getElementById("linkVoltarLogin")
  .addEventListener("click", function(evento) {

    evento.preventDefault();

    document.getElementById("formRecuperarSenha")
      .style.display = "none";

    QC_mostrarLogin();

  });



document.getElementById("btnRedefinirSenha")
  .addEventListener("click", function(evento) {

    evento.preventDefault();

    const idCarteira = localStorage.getItem(
      QC_ID_LOCAL
    );

    const codigoAtual = document.getElementById(
      "qcCodigoRecuperar"
    ).value.trim().toUpperCase();

    const novaSenha = document.getElementById(
      "qcSenhaRecuperar"
    ).value;

    const confirmar = document.getElementById(
      "qcConfirmarSenhaRecuperar"
    ).value;

    const formatoCodigo =
      /^[0-9A-F]{8}(?:-[0-9A-F]{8}){3}$/;

    if (!idCarteira) {

      QC_mensagemRecuperacao(
        "Carteira não identificada neste celular.",
        "erro"
      );

      return;
    }

    if (!formatoCodigo.test(codigoAtual)) {

      QC_mensagemRecuperacao(
        "Informe um código de recuperação válido.",
        "erro"
      );

      return;
    }

    if (novaSenha.length < 6 || novaSenha.length > 8) {

      QC_mensagemRecuperacao(
        "A nova senha deve ter entre 6 e 8 caracteres.",
        "erro"
      );

      return;
    }

    if (novaSenha !== confirmar) {

      QC_mensagemRecuperacao(
        "As senhas não conferem.",
        "erro"
      );

      return;
    }

    // Gerar novo código criptograficamente aleatório
    const bytes = new Uint8Array(16);

    window.crypto.getRandomValues(bytes);

    const novoCodigo = Array.from(bytes)
      .map(byte => byte.toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase()
      .match(/.{1,8}/g)
      .join("-");

    // Manter dados somente em memória
    QC_recuperacaoPendente = {
      idCarteira: idCarteira,
      codigoAtual: codigoAtual,
      novaSenha: novaSenha,
      novoCodigo: novoCodigo
    };

    // Mostrar novo código antes de enviar
    QC_exibirCodigoRecuperacao(novoCodigo);

  });



async function QC_enviarRecuperacaoTeste(dados) {

  const URL_APPS_SCRIPT =
    "https://script.google.com/macros/s/AKfycbxEU0xzZz833Bqv7CxV-PdTVIjxRrl27lNgSG0upZ07rnXaAkULhGGuehxbpU2-K1oyOQ/exec";

  const resposta = await fetch(URL_APPS_SCRIPT, {
    method: "POST",
    redirect: "follow",
    headers: {
      "Content-Type": "text/plain;charset=utf-8"
    },
    body: JSON.stringify({
      acao: "qc_redefinir_senha_teste",
      idCarteira: dados.idCarteira,
      codigoAtual: dados.codigoAtual,
      novaSenha: dados.novaSenha,
      novoCodigo: dados.novoCodigo
    })
  });

  if (!resposta.ok) {
    throw new Error(
      "Erro HTTP: " + resposta.status
    );
  }

  const resultado = await resposta.json();

  if (resultado.status !== "OK") {
    throw new Error(
      resultado.mensagem ||
      "Não foi possível redefinir a senha."
    );
  }

  return resultado;
}


async function QC_consultarParametrosLoginTeste(idCarteira) {

  const URL_APPS_SCRIPT =
    "https://script.google.com/macros/s/AKfycbxEU0xzZz833Bqv7CxV-PdTVIjxRrl27lNgSG0upZ07rnXaAkULhGGuehxbpU2-K1oyOQ/exec";

  const resposta = await fetch(URL_APPS_SCRIPT, {
    method: "POST",
    redirect: "follow",
    headers: {
      "Content-Type": "text/plain;charset=utf-8"
    },
    body: JSON.stringify({
      acao: "qc_parametros_login_teste",
      idCarteira: idCarteira
    })
  });

  if (!resposta.ok) {
    throw new Error(
      "Erro de comunicação: " + resposta.status
    );
  }

  return await resposta.json();
}


async function QC_enviarLoginAutomatico(idCarteira, senha) {

  // Identificar o algoritmo da carteira.
  const parametros =
    await QC_consultarParametrosLoginTeste(idCarteira);

  if (parametros.status !== "OK") {
    return parametros;
  }

  // LOGIN ANTIGO: manter o funcionamento existente.
  if (parametros.algoritmo === "LEGADO_V1") {

    return await QC_enviarLoginTeste(
      idCarteira,
      senha
    );
  }

  // LOGIN NOVO: PBKDF2_V2.
  if (parametros.algoritmo === "PBKDF2_V2") {

    if (
      !/^[0-9a-f]{32}$/i.test(parametros.salt) ||
      parametros.iteracoes !== 600000
    ) {
      return {
        status: "ERRO",
        mensagem: "Parâmetros da senha V2 inválidos."
      };
    }

    // Calcular a credencial no Android.
    const derivadoHex = await QC_derivarSenhaV2(
      senha,
      parametros.salt
    );

    const URL_SCRIPT =
      "https://script.google.com/macros/s/AKfycbxEU0xzZz833Bqv7CxV-PdTVIjxRrl27lNgSG0upZ07rnXaAkULhGGuehxbpU2-K1oyOQ/exec";

    const resposta = await fetch(URL_SCRIPT, {
      method: "POST",
      redirect: "follow",
      headers: {
        "Content-Type": "text/plain;charset=utf-8"
      },
      body: JSON.stringify({
        acao: "qc_login_v2_teste",
        idCarteira: idCarteira,
        derivadoHex: derivadoHex
      })
    });

    if (!resposta.ok) {
      throw new Error(
        "Erro de comunicação: " + resposta.status
      );
    }

    return await resposta.json();
  }

  return {
    status: "ERRO",
    mensagem: "Algoritmo de senha desconhecido."
  };
}


