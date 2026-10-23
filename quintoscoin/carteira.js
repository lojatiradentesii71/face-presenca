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

document.getElementById("btnAtivarCarteira")
  .addEventListener("click", function(evento) {

    evento.preventDefault();

    const id = document.getElementById("qcIdCadastro")
      .value.trim();

    const senha = document.getElementById("qcNovaSenha")
      .value;

    const confirmar = document.getElementById("qcConfirmarSenha")
      .value;

    const mensagem = document.getElementById("qcMensagemAcesso");

    // Mostra imediatamente que o botão respondeu
    mensagem.textContent = "Verificando informações...";

    if (!id) {
      mensagem.textContent = "Informe seu IdCadastro.";
      return;
    }

    if (senha.length < 10) {
      mensagem.textContent =
        "A senha deve ter pelo menos 10 caracteres.";
      return;
    }

    if (senha !== confirmar) {
      mensagem.textContent =
        "As senhas não conferem.";
      return;
    }

    mensagem.textContent =
      "Dados validados! Pronto para ativar a carteira.";

  });

document.getElementById("btnEntrarCarteira")
  .addEventListener("click", function() {

    const senha = document.getElementById("qcSenhaLogin")
      .value;

    const mensagem = document.getElementById("qcMensagemAcesso");

    if (!senha) {
      mensagem.textContent = "Informe sua senha.";
      return;
    }

    mensagem.textContent =
      "Formulário validado. O login será conectado ao servidor no próximo passo.";

  });

if (localStorage.getItem(QC_ID_LOCAL)) {
  QC_mostrarLogin();
} else {
  QC_mostrarAtivacao();
}
