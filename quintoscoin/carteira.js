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
