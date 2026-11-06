// QUINTOSCOIN - PASSO 289 - PUBLICACAO SINCRONIZADA
// Mantem as funcoes do Passo 278 e acrescenta o cliente de API ausente.
// IMPORTANTE: esta funcao e somente para rotas autenticadas.
// Doacoes e transferencias anonimas continuam com fetch proprio.
const QC_URL_191 = "https://script.google.com/macros/s/AKfycbxEU0xzZz833Bqv7CxV-PdTVIjxRrl27lNgSG0upZ07rnXaAkULhGGuehxbpU2-K1oyOQ/exec";

async function QC_post191(acao, parametros = {}) {
  if (typeof acao !== "string" || !/^qc_[a-z0-9_]+$/.test(acao)) {
    throw new Error("Acao do QuintosCoin invalida.");
  }
  if (!parametros || typeof parametros !== "object" || Array.isArray(parametros)) {
    throw new Error("Parametros da requisicao invalidos.");
  }
  const tokenSessao = sessionStorage.getItem("QC_TOKEN_SESSAO_TESTE");
  if (!tokenSessao) {
    throw new Error("Sua sessao expirou. Entre na carteira novamente.");
  }
  const resposta = await fetch(QC_URL_191, {
    method: "POST",
    redirect: "follow",
    headers: {"Content-Type": "text/plain;charset=utf-8"},
    body: JSON.stringify({ ...parametros, acao, tokenSessao })
  });
  if (!resposta.ok) {
    throw new Error("Falha de comunicacao com o Apps Script. HTTP " + resposta.status);
  }
  return await resposta.json();
}

// QUINTOSCOIN - PASSO 278 - CARTEIRA COM RESGATE E DOACAO EM DESTAQUE
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


const qcBtnReceber = document.getElementById("btnReceber");

const qcModalReceber = document.createElement("div");

qcModalReceber.id = "qcModalReceber";
qcModalReceber.className = "qc-modal-overlay";

qcModalReceber.innerHTML = `
  <div class="qc-modal-card">
    <div class="qc-modal-topo">
      <h3>Receber QuintosCoin</h3>
      <button
        type="button"
        id="qcFecharReceber"
        class="qc-modal-fechar"
      >×</button>
    </div>

    <p class="qc-modal-texto">
      Informe a quantidade de QuintosCoin que deseja solicitar ao tesoureiro.
    </p>

    <label for="qcValorReceber" class="qc-label-modal">
      Quantidade de QuintosCoin
    </label>

    <input
      id="qcValorReceber"
      type="number"
      min="1"
      step="1"
      inputmode="numeric"
      placeholder="Exemplo: 50"
      class="qc-input-modal"
    >

    <div class="qc-modal-botoes">
      <button
        type="button"
        id="qcConfirmarReceber"
        class="qc-btn-modal-principal"
      >
        Solicitar QuintosCoin
      </button>

      <button
        type="button"
        id="qcCancelarReceber"
        class="qc-btn-modal-secundario"
      >
        Cancelar
      </button>
    </div>

    <p id="qcMensagemReceber" class="qc-modal-mensagem"></p>
  </div>
`;

document.body.appendChild(qcModalReceber);

function QC_abrirModalReceber() {
  qcModalReceber.style.display = "flex";
}

function QC_fecharModalReceber() {
  qcModalReceber.style.display = "none";
  document.getElementById("qcMensagemReceber").textContent = "";
}


function QC_exibirConfirmacaoReceber(quantidade) {

  const telaCarteira = document.getElementById(
    "telaCarteira"
  );

  // Reutilizar o aviso, caso já exista.
  let aviso = document.getElementById(
    "qcAvisoSolicitacao"
  );

  if (!aviso) {

    aviso = document.createElement("div");
    aviso.id = "qcAvisoSolicitacao";
    aviso.className = "qc-aviso-solicitacao";
    aviso.setAttribute("role", "status");
    aviso.setAttribute("tabindex", "-1");

    telaCarteira.prepend(aviso);
  }

  // Montar a confirmação sem alterar o saldo.
  aviso.replaceChildren();

  const titulo = document.createElement("strong");
  titulo.textContent = "✅ Solicitação registrada!";

  const valor = document.createElement("div");
  valor.className = "qc-aviso-valor";
  valor.textContent = quantidade + " QC solicitados";

  const situacao = document.createElement("div");
  situacao.className = "qc-aviso-situacao";
  situacao.textContent = "⏳ Status: PENDENTE";

  const descricao = document.createElement("p");
  descricao.textContent =
    "Aguardando confirmação do pagamento e " +
    "autorização do tesoureiro. " +
    "Os QCs ainda não foram creditados.";

  const fechar = document.createElement("button");
  fechar.type = "button";
  fechar.className = "qc-aviso-fechar";
  fechar.textContent = "Entendi";

  fechar.addEventListener("click", function() {
    aviso.remove();
  });

  aviso.append(
    titulo,
    valor,
    situacao,
    descricao,
    fechar
  );

  aviso.focus();
}


qcBtnReceber.addEventListener("click", function() {
  QC_abrirModalReceber();
});

document.getElementById("qcFecharReceber")
  .addEventListener("click", function() {
    QC_fecharModalReceber();
  });

document.getElementById("qcCancelarReceber")
  .addEventListener("click", function() {
    QC_fecharModalReceber();
  });

qcModalReceber.addEventListener("click", function(e) {
  if (e.target === qcModalReceber) {
    QC_fecharModalReceber();
  }
});

document.getElementById("qcConfirmarReceber")
  .addEventListener("click", async function() {

    const botao = this;

    const campo = document.getElementById("qcValorReceber");
    const mensagem = document.getElementById("qcMensagemReceber");

    const quantidade = Number(campo.value);

    if (
      !campo.value.trim() ||
      !Number.isSafeInteger(quantidade) ||
      quantidade <= 0
    ) {
      mensagem.textContent =
        "⚠️ Informe uma quantidade inteira e positiva.";
      return;
    }

    const token = sessionStorage.getItem(QC_CHAVE_SESSAO);

    if (!token) {
      mensagem.textContent =
        "⚠️ Sessão expirada. Entre novamente.";
      return;
    }

    botao.disabled = true;
    botao.textContent = "Enviando solicitação...";
    mensagem.textContent = "";

    try {

      const resultado = await QC_enviarSolicitacaoCreditos(
        token,
        quantidade
      );

      if (resultado.status !== "PENDENTE") {
        throw new Error(
          resultado.mensagem ||
          "Não foi possível registrar a solicitação."
        );
      }

      
campo.value = "";

// Fechar automaticamente o formulário.
QC_fecharModalReceber();

// Mostrar confirmação destacada na carteira.
QC_exibirConfirmacaoReceber(quantidade);


    } catch (erro) {

      mensagem.textContent =
        "⚠️ " + erro.message +
        " Se houve falha de comunicação, consulte o tesoureiro antes de solicitar novamente.";

    } finally {

      botao.disabled = false;
      botao.textContent = "Solicitar QuintosCoin";

    }

  });


// PASSO 271 - UTILIZAR O BOTAO ORIGINAL DOAR QC.
// A tela principal continua com um unico botao para doar.
const qcModalDoar271 = document.createElement("div");
qcModalDoar271.id = "qcModalDoar271";
qcModalDoar271.className = "qc-modal-overlay";
qcModalDoar271.style.display = "none";
qcModalDoar271.innerHTML = `
  <div class="qc-modal-card" role="dialog" aria-modal="true"
       aria-labelledby="qcTituloDoar271">
    <div class="qc-modal-topo">
      <h3 id="qcTituloDoar271">Doar QuintosCoin</h3>
      <button type="button" id="qcFecharDoar271"
        class="qc-modal-fechar" aria-label="Fechar">×</button>
    </div>
    <p class="qc-modal-texto">Quanto deseja doar nesta sessão?</p>
    <label for="qcValorDoar271" class="qc-label-modal">Valor em QC</label>
    <input id="qcValorDoar271" class="qc-input-modal" type="number"
      inputmode="numeric" min="2" step="1" placeholder="Exemplo: 8">
    <div class="qc-modal-botoes">
      <button type="button" id="qcConfirmarDoar271"
        class="qc-btn-modal-principal">Continuar</button>
      <button type="button" id="qcCancelarDoar271"
        class="qc-btn-modal-secundario">Cancelar</button>
    </div>
    <p id="qcMensagemDoar271" class="qc-modal-mensagem" role="status"></p>
  </div>`;
document.body.appendChild(qcModalDoar271);
const qcBtnDoar271 = document.getElementById("btnDoar");
const qcValorDoar271 = document.getElementById("qcValorDoar271");
const qcConfirmarDoar271 = document.getElementById("qcConfirmarDoar271");
const qcMensagemDoar271 = document.getElementById("qcMensagemDoar271");
let qcExecutandoDoar271 = false;
function QC_fecharDoar271() {
  if (qcExecutandoDoar271) return;
  qcModalDoar271.style.display = "none";
}
qcBtnDoar271.addEventListener("click", () => {
  qcValorDoar271.value = "";
  const id = localStorage.getItem("QC_ID_CARTEIRA");
  const pendente = !!(id && localStorage.getItem("QC_DOACAO_PENDENTE_V1_" + id));
  qcValorDoar271.disabled = pendente;
  qcConfirmarDoar271.textContent = pendente ? "Retomar doação" : "Continuar";
  qcMensagemDoar271.textContent = pendente
    ? "Uma doação anterior precisa ser concluída. Nenhuma nova será criada."
    : "";
  qcModalDoar271.style.display = "flex";
  if (!pendente) qcValorDoar271.focus();
});
document.getElementById("qcFecharDoar271")
  .addEventListener("click", QC_fecharDoar271);
document.getElementById("qcCancelarDoar271")
  .addEventListener("click", QC_fecharDoar271);
qcModalDoar271.addEventListener("click", e => {
  if (e.target === qcModalDoar271) QC_fecharDoar271();
});
qcConfirmarDoar271.addEventListener("click", async () => {
  if (qcExecutandoDoar271) return;
  const id = localStorage.getItem("QC_ID_CARTEIRA");
  const pendente = !!(id && localStorage.getItem("QC_DOACAO_PENDENTE_V1_" + id));
  const valor = pendente ? 0 : Number(qcValorDoar271.value);
  if (!pendente && (!Number.isSafeInteger(valor) || valor < 2 || valor === 3)) {
    qcMensagemDoar271.textContent =
      "Informe um valor inteiro a partir de 2 QC, exceto 3 QC.";
    return;
  }
  if (typeof window.QC_doarValor271 !== "function") {
    qcMensagemDoar271.textContent =
      "Atualize a página. O módulo de fichas ainda não foi carregado.";
    return;
  }
  qcExecutandoDoar271 = true;
  qcConfirmarDoar271.disabled = true;
  qcMensagemDoar271.textContent = pendente
    ? "Consultando e recuperando a doação anterior..."
    : "Conferindo fichas e preparando a doação segura...";
  try {
    const retorno = await window.QC_doarValor271(valor);
    if (retorno.status === "OK") {
      qcMensagemDoar271.textContent = "✅ Doação de " +
        retorno.valorDoacao + " QC registrada.";
      document.getElementById("mensagem").textContent =
        "✅ Doação de " + retorno.valorDoacao + " QC registrada.";
      qcModalDoar271.style.display = "none";
    } else if (retorno.status === "CANCELADO") {
      qcMensagemDoar271.textContent = "Operação cancelada.";
    } else if (retorno.status === "PENDENTE") {
      qcMensagemDoar271.textContent =
        "A operação anterior foi preservada. Retome-a antes de uma nova doação.";
    }
  } catch (erro) {
    qcMensagemDoar271.textContent = "⚠️ " + String(erro.message || erro);
  } finally {
    qcExecutandoDoar271 = false;
    qcConfirmarDoar271.disabled = false;
  }
});
qcValorDoar271.addEventListener("keydown", e => {
  if (e.key === "Enter" && !qcExecutandoDoar271) {
    e.preventDefault(); qcConfirmarDoar271.click();
  }
});

// Gerador QR local para codigos de transferencia. QR Model 2, versao 10-L.
// Nao utiliza servidor externo nem transmite o conteudo.
function QC_matrizQR275(texto) {
  const bytes = new TextEncoder().encode(texto);
  const blocosInfo = [[86,68],[86,68],[87,69],[87,69]];
  const capacidade = blocosInfo.reduce((s,b)=>s+b[1],0);
  // V10: cabecalho de 4 bits + comprimento de 16 bits + carga em bytes.
  if (bytes.length < 1 || bytes.length > capacidade-3) {
    throw Error("Codigo QR fora da capacidade local.");
  }
  const bits = [];
  const addBits = (valor,qtd) => {
    for (let i=qtd-1; i>=0; i--) bits.push((valor>>>i)&1);
  };
  addBits(4,4);
  addBits(bytes.length,16);
  for (const b of bytes) addBits(b,8);
  for (let i=0; i<4 && bits.length<capacidade*8; i++) bits.push(0);
  while (bits.length%8) bits.push(0);
  const dados=[];
  for (let i=0; i<bits.length; i+=8) {
    let v=0; for(let j=0; j<8; j++) v=(v<<1)|bits[i+j];
    dados.push(v);
  }
  for (let i=0; dados.length<capacidade;i++) dados.push(i%2 ? 0x11 : 0xec);
  const multiplicar = (a,b) => {
    let produto=0;
    for(let i=7;i>=0;i--) {
      produto=(produto<<1)^((produto>>>7)*0x11d);
      produto^=(((b>>>i)&1)*a);
    }
    return produto;
  };
  let gerador=[1];
  let raiz=1;
  for(let i=0;i<18;i++) {
    const novo=Array(gerador.length+1).fill(0);
    gerador.forEach((v,j)=>{novo[j]^=v;novo[j+1]^=multiplicar(v,raiz)});
    gerador=novo;
    raiz=multiplicar(raiz,2);
  }
  const blocos=[];
  let inicio=0;
  for(const [total,dadosPorBloco] of blocosInfo) {
    const dadosBloco=dados.slice(inicio,inicio+dadosPorBloco);
    inicio+=dadosPorBloco;
    const resto=Array(18).fill(0);
    for(const b of dadosBloco) {
      const fator=b^resto[0];
      resto.shift();resto.push(0);
      for(let i=0;i<18;i++) resto[i]^=multiplicar(gerador[i+1],fator);
    }
    blocos.push({dados:dadosBloco,ecc:resto});
  }
  const saida=[];
  for (let i=0;i<69;i++) for (const b of blocos) {
    if(i<b.dados.length) saida.push(b.dados[i]);
  }
  for (let i=0;i<18;i++) for (const b of blocos) saida.push(b.ecc[i]);
  const tam=57;
  const mod=Array.from({length:tam},()=>Array(tam).fill(false));
  const fixo=Array.from({length:tam},()=>Array(tam).fill(false));
  function atribuir(x,y,escuro) {
    if(x>=0&&x<tam&&y>=0&&y<tam) {mod[y][x]=!!escuro;fixo[y][x]=true;}
  }
  // Padrões fixos do QR: localizacao, alinhamento, timing, versao e formato.
  for(let i=0;i<tam;i++) {
    atribuir(6,i,i%2===0);
    atribuir(i,6,i%2===0);
  }
  for (const [cx,cy] of [[3,3],[tam-4,3],[3,tam-4]]) {
    for(let dy=-4;dy<=4;dy++) for(let dx=-4;dx<=4;dx++) {
      const d=Math.max(Math.abs(dx),Math.abs(dy));
      atribuir(cx+dx,cy+dy,d!==2&&d!==4);
    }
  }
  const alinhamentos=[6,28,50];
  for(const x of alinhamentos) for(const y of alinhamentos) {
    if((x===6&&y===6)||(x===6&&y===50)||(x===50&&y===6)) continue;
    for(let dy=-2;dy<=2;dy++) for(let dx=-2;dx<=2;dx++) {
      atribuir(x+dx,y+dy,Math.max(Math.abs(dx),Math.abs(dy))!==1);
    }
  }
  function versao() {
    let rem=10;
    for(let i=0;i<12;i++) rem=(rem<<1)^((rem>>>11)*0x1f25);
    const v=(10<<12)|rem;
    for(let i=0;i<18;i++) {
      const b=((v>>>i)&1)!==0;
      const a=tam-11+i%3;
      const c=Math.floor(i/3);
      atribuir(a,c,b);
      atribuir(c,a,b);
    }
  }
  versao();
  function formato(mask) {
    // EC-L corresponde ao identificador de formato '01'.
    const data=(1<<3)|mask;
    let rem=data;
    for(let i=0;i<10;i++) rem=(rem<<1)^((rem>>>9)*0x537);
    const v=((data<<10)|rem)^0x5412;
    const bit=i=>((v>>>i)&1)!==0;
    for(let i=0;i<=5;i++) atribuir(8,i,bit(i));
    atribuir(8,7,bit(6));atribuir(8,8,bit(7));atribuir(7,8,bit(8));
    for(let i=9;i<15;i++) atribuir(14-i,8,bit(i));
    for(let i=0;i<8;i++) atribuir(tam-1-i,8,bit(i));
    for(let i=8;i<15;i++) atribuir(8,tam-15+i,bit(i));
    atribuir(8,tam-8,true);
  }
  formato(0);
  let indice=0;
  const totalBits=saida.length*8;
  for(let x=tam-1;x>=1;x-=2) {
    if(x===6) x=5;
    for(let vert=0;vert<tam;vert++) {
      const y=((x+1)&2)===0 ? tam-1-vert : vert;
      for(let col=0;col<2;col++) {
        const cx=x-col;
        if(fixo[y][cx]) continue;
        let bit=false;
        if(indice<totalBits) bit=((saida[indice>>>3]>>>(7-(indice&7)))&1)!==0;
        indice++;
        if((cx+y)%2===0) bit=!bit; // Mascara 0.
        mod[y][cx]=bit;
      }
    }
  }
  return mod;
}
function QC_desenharQR275(elemento, texto) {
  const matriz=QC_matrizQR275(texto);
  const tamanho=matriz.length;
  const svgNS="http://www.w3.org/2000/svg";
  const svg=document.createElementNS(svgNS,"svg");
  svg.setAttribute("viewBox",`0 0 ${tamanho+8} ${tamanho+8}`);
  svg.setAttribute("width","252");
  svg.setAttribute("height","252");
  svg.setAttribute("role","img");
  svg.setAttribute("aria-label","QR Code de transferencia QuintosCoin");
  const fundo=document.createElementNS(svgNS,"rect");
  fundo.setAttribute("width",String(tamanho+8));
  fundo.setAttribute("height",String(tamanho+8));
  fundo.setAttribute("fill","white");
  svg.appendChild(fundo);
  let path="";
  for(let y=0;y<tamanho;y++) for(let x=0;x<tamanho;x++) {
    if(matriz[y][x]) path+=`M${x+4},${y+4}h1v1h-1z`;
  }
  const pontos=document.createElementNS(svgNS,"path");
  pontos.setAttribute("d",path);
  pontos.setAttribute("fill","black");
  svg.appendChild(pontos);
  elemento.replaceChildren(svg);
}


// PASSO 275 - UM BOTAO TRANSFERIR, COM ENVIAR E RECEBER NA MESMA JANELA.
// Nenhum QR ou codigo secreto passa por site de QR: gerar inteiramente local.
const qcBotaoTransferir275 = document.createElement("button");
qcBotaoTransferir275.type = "button";
qcBotaoTransferir275.id = "btnTransferir";
qcBotaoTransferir275.textContent = "Transferir QC";
qcBotaoTransferir275.disabled = true;
const qcAcoes275 = document.querySelector("#telaCarteira .acoes");
if (qcAcoes275) qcAcoes275.appendChild(qcBotaoTransferir275);

const qcModalTransferir275 = document.createElement("div");
qcModalTransferir275.id = "qcModalTransferir275";
qcModalTransferir275.className = "qc-modal-overlay";
qcModalTransferir275.style.display = "none";
qcModalTransferir275.innerHTML = `
  <div class="qc-modal-card" role="dialog" aria-modal="true"
    aria-labelledby="qcTituloTransf275">
    <div class="qc-modal-topo">
      <h3 id="qcTituloTransf275">Transferir QuintosCoin</h3>
      <button id="qcFecharTransf275" type="button" class="qc-modal-fechar"
        aria-label="Fechar">×</button>
    </div>
    <div style="display:flex;gap:8px;margin:10px 0 18px">
      <button type="button" id="qcAbaEnviar275" class="qc-btn-modal-principal"
        style="flex:1">Enviar</button>
      <button type="button" id="qcAbaReceber275" class="qc-btn-modal-secundario"
        style="flex:1">Receber</button>
    </div>
    <div id="qcPainelEnviar275">
      <label for="qcValorEnviar275" class="qc-label-modal">Quanto deseja transferir?</label>
      <input id="qcValorEnviar275" class="qc-input-modal"
        type="number" min="2" step="1" inputmode="numeric" placeholder="Exemplo: 8">
      <button type="button" id="qcEnviar275" class="qc-btn-modal-principal"
        style="margin:10px 0;width:100%">Continuar</button>
      <div id="qcResultadoEnvio275" hidden style="text-align:center">
        <p>Mostre o QR Code ao destinatário:</p>
        <div id="qcImagemQR275" style="display:flex;justify-content:center;margin:12px 0"></div>
        <button type="button" id="qcCopiarTransf275" class="qc-btn-modal-secundario">
          Copiar código
        </button>
        <button type="button" id="qcConferirTransf275" class="qc-btn-modal-secundario"
          style="margin-left:5px">Verificar recebimento</button>
        <p style="font-size:12px;opacity:.8">Compartilhe somente com quem deve receber.
          O código permite resgatar os QCs.</p>
      </div>
    </div>
    <div id="qcPainelReceber275" hidden>
      <p class="qc-modal-texto">Leia o QR Code do outro irmão ou cole o código recebido.</p>
      <button id="qcLerQR275" type="button" class="qc-btn-modal-secundario"
        style="margin-bottom:10px">Ler QR pela câmera</button>
      <div id="qcVideoQR275" hidden style="margin:8px auto;text-align:center"></div>
      <label for="qcCodigoReceber275" class="qc-label-modal">Código da transferência</label>
      <textarea id="qcCodigoReceber275" class="qc-input-modal" rows="3"
        style="width:100%;box-sizing:border-box;resize:vertical"
        placeholder="Cole aqui o código QC1|..."></textarea>
      <button type="button" id="qcReceber275" class="qc-btn-modal-principal"
        style="width:100%;margin-top:10px">Receber QC</button>
    </div>
    <p id="qcAvisoTransferir275" role="status" class="qc-modal-mensagem"></p>
  </div>`;
document.body.appendChild(qcModalTransferir275);

const qcValorEnviar275 = document.getElementById("qcValorEnviar275");
const qcValorReceber275 = document.getElementById("qcCodigoReceber275");
const qcAvisoTransferir275 = document.getElementById("qcAvisoTransferir275");
const qcResultadoEnvio275 = document.getElementById("qcResultadoEnvio275");
const qcImagemQR275 = document.getElementById("qcImagemQR275");
const qcEnviar275 = document.getElementById("qcEnviar275");
const qcReceber275 = document.getElementById("qcReceber275");
let qcCodigoCompartilhar275 = "";
let qcTrabalhando275 = false;
let qcStream275 = null;
let qcLeituraAtiva275 = false;

function QC_pararCamera275() {
  qcLeituraAtiva275 = false;
  if (qcStream275) qcStream275.getTracks().forEach(trilha => trilha.stop());
  qcStream275 = null;
  const area = document.getElementById("qcVideoQR275");
  area.replaceChildren();
  area.hidden = true;
}
function QC_fecharTransferencia275() {
  if (qcTrabalhando275) return;
  QC_pararCamera275();
  qcCodigoCompartilhar275 = "";
  qcImagemQR275.replaceChildren();
  qcModalTransferir275.style.display = "none";
}
function QC_mostrarAbaTransferencia275(aba) {
  QC_pararCamera275();
  const enviar = aba === "enviar";
  document.getElementById("qcPainelEnviar275").hidden = !enviar;
  document.getElementById("qcPainelReceber275").hidden = enviar;
  document.getElementById("qcAbaEnviar275").className =
    enviar ? "qc-btn-modal-principal" : "qc-btn-modal-secundario";
  document.getElementById("qcAbaReceber275").className =
    enviar ? "qc-btn-modal-secundario" : "qc-btn-modal-principal";
  qcAvisoTransferir275.textContent = "";
  if (!enviar && typeof window.QC_resgatePendente275 === "function" &&
      window.QC_resgatePendente275()) {
    qcValorReceber275.value = "";
    qcValorReceber275.disabled = true;
    qcReceber275.textContent = "Retomar recebimento";
    qcAvisoTransferir275.textContent =
      "Recebimento anterior pendente. Toque em Retomar recebimento.";
  } else if (!enviar) {
    qcValorReceber275.disabled = false;
    qcReceber275.textContent = "Receber QC";
  }
}
qcBotaoTransferir275.addEventListener("click", () => {
  if (!sessionStorage.getItem("QC_TOKEN_SESSAO_TESTE")) return;
  qcCodigoCompartilhar275 = "";
  qcResultadoEnvio275.hidden = true;
  qcImagemQR275.replaceChildren();
  qcValorEnviar275.value = "";
  qcValorReceber275.value = "";
  const pendente = typeof window.QC_transferenciaPendente275 === "function" &&
    window.QC_transferenciaPendente275();
  qcValorEnviar275.disabled = !!pendente;
  qcEnviar275.textContent = pendente ? "Retomar envio" : "Continuar";
  QC_mostrarAbaTransferencia275("enviar");
  if (pendente) qcAvisoTransferir275.textContent =
    "Uma transferencia anterior foi preservada. Retome para exibir o QR Code.";
  qcModalTransferir275.style.display = "flex";
  if (!pendente) qcValorEnviar275.focus();
});
document.getElementById("qcFecharTransf275")
  .addEventListener("click", QC_fecharTransferencia275);
qcModalTransferir275.addEventListener("click", e => {
  if (e.target === qcModalTransferir275) QC_fecharTransferencia275();
});
document.getElementById("qcAbaEnviar275")
  .addEventListener("click", () => QC_mostrarAbaTransferencia275("enviar"));
document.getElementById("qcAbaReceber275")
  .addEventListener("click", () => QC_mostrarAbaTransferencia275("receber"));
function QC_mostrarCodigo275(retorno) {
  qcCodigoCompartilhar275 = String(retorno.codigoQR || "");
  if (!/^QC1\|[0-9a-f-]{36}\|[0-9a-f]{64}$/i.test(qcCodigoCompartilhar275)) {
    throw Error("Codigo de transferencia inesperado.");
  }
  QC_desenharQR275(qcImagemQR275, qcCodigoCompartilhar275);
  qcResultadoEnvio275.hidden = false;
  qcValorEnviar275.disabled = true;
  qcEnviar275.textContent = "Retomar envio";
  qcAvisoTransferir275.textContent =
    "Transferencia preparada. Mostre o QR Code ou copie o codigo.";
}
qcEnviar275.addEventListener("click", async () => {
  if (qcTrabalhando275) return;
  if (typeof window.QC_transferirCriar275 !== "function") {
    qcAvisoTransferir275.textContent = "Atualize a pagina; modulo de fichas nao carregado.";
    return;
  }
  const pendente = typeof window.QC_transferenciaPendente275 === "function" &&
    window.QC_transferenciaPendente275();
  const valor = pendente ? 0 : Number(qcValorEnviar275.value);
  if (!pendente && (!Number.isSafeInteger(valor) || valor < 2 || valor === 3)) {
    qcAvisoTransferir275.textContent = "Informe valor inteiro maior ou igual a 2, exceto 3 QC.";
    return;
  }
  qcTrabalhando275 = true;
  qcEnviar275.disabled = true;
  qcAvisoTransferir275.textContent = "Preparando transferencia protegida...";
  try {
    const retorno = await window.QC_transferirCriar275(valor);
    if (retorno.status === "PRONTA") QC_mostrarCodigo275(retorno);
    else if (retorno.status === "CANCELADO") qcAvisoTransferir275.textContent="Operacao cancelada.";
    else qcAvisoTransferir275.textContent = String(retorno.status);
  } catch (err) {
    qcAvisoTransferir275.textContent = "⚠️ " + String(err.message || err);
  } finally {
    qcTrabalhando275 = false;
    qcEnviar275.disabled = false;
  }
});
qcValorEnviar275.addEventListener("keydown", e => {
  if (e.key === "Enter") {e.preventDefault();qcEnviar275.click();}
});
document.getElementById("qcCopiarTransf275")
  .addEventListener("click", async () => {
    if (!qcCodigoCompartilhar275) return;
    try {
      await navigator.clipboard.writeText(qcCodigoCompartilhar275);
      qcAvisoTransferir275.textContent="Codigo copiado. Envie somente ao destinatario.";
    } catch(_) {
      window.prompt("Copie o codigo para o destinatario:", qcCodigoCompartilhar275);
    }
  });
document.getElementById("qcConferirTransf275")
  .addEventListener("click", async () => {
    if (qcTrabalhando275) return;
    qcTrabalhando275 = true;
    qcAvisoTransferir275.textContent = "Consultando transferencia...";
    try {
      const r = await window.QC_transferirConsultar275();
      if (r.status === "CONCLUIDA") {
        qcResultadoEnvio275.hidden = true;
        qcCodigoCompartilhar275 = "";
        qcImagemQR275.replaceChildren();
        qcValorEnviar275.disabled = false;
        qcEnviar275.textContent = "Continuar";
        qcAvisoTransferir275.textContent =
          "✅ " + r.valorEnviado + " QC recebidos pelo destinatario. Nova transferencia liberada.";
      } else {
        qcAvisoTransferir275.textContent =
          "Aguardando recebimento pelo destinatario (" + r.status + ").";
      }
    } catch(err) {
      qcAvisoTransferir275.textContent="⚠️ " + String(err.message||err);
    } finally {qcTrabalhando275=false;}
  });
qcReceber275.addEventListener("click", async () => {
  if (qcTrabalhando275) return;
  if (typeof window.QC_transferirResgatar275 !== "function") {
    qcAvisoTransferir275.textContent = "Atualize a pagina; modulo de fichas nao carregado.";
    return;
  }
  QC_pararCamera275();
  qcTrabalhando275=true;
  qcReceber275.disabled=true;
  qcAvisoTransferir275.textContent = "Conferindo transferencia e preparando as fichas...";
  try {
    const retorno = await window.QC_transferirResgatar275(qcValorReceber275.value);
    if (retorno.status === "RECEBIDA") {
      qcAvisoTransferir275.textContent =
        "✅ Recebidos " + retorno.valorRecebido + " QC. Atualize seu saldo.";
      const mensagem=document.getElementById("mensagem");
      if (mensagem) mensagem.textContent=qcAvisoTransferir275.textContent;
      qcValorReceber275.value="";
      qcValorReceber275.disabled=false;
      qcReceber275.textContent="Receber QC";
    } else if (retorno.status === "CANCELADO") {
      qcAvisoTransferir275.textContent = "Recebimento cancelado.";
    } else {
      qcAvisoTransferir275.textContent = retorno.status;
    }
  } catch(err) {
    qcAvisoTransferir275.textContent = "⚠️ " + String(err.message||err);
  } finally {qcTrabalhando275=false;qcReceber275.disabled=false;}
});
qcValorReceber275.addEventListener("paste", () => {
  qcAvisoTransferir275.textContent = "";
});
document.getElementById("qcLerQR275").addEventListener("click", async () => {
  if (qcLeituraAtiva275 || qcTrabalhando275) return;
  if (typeof BarcodeDetector !== "function" || !navigator.mediaDevices?.getUserMedia) {
    qcAvisoTransferir275.textContent =
      "Seu navegador nao oferece leitura direta. Copie e cole o codigo no campo.";
    return;
  }
  let detector;
  try {detector=new BarcodeDetector({formats:["qr_code"]});}
  catch(_) {qcAvisoTransferir275.textContent="Use copiar/colar neste navegador.";return;}
  const area=document.getElementById("qcVideoQR275");
  const video=document.createElement("video");
  video.autoplay=true;video.muted=true;video.playsInline=true;
  video.style.cssText="width:100%;max-height:270px;border-radius:10px";
  try {
    const stream=await navigator.mediaDevices.getUserMedia({
      video:{facingMode:{ideal:"environment"}},audio:false
    });
    qcStream275=stream;
    video.srcObject=stream;
    area.replaceChildren(video);
    area.hidden=false;
    await video.play();
    qcLeituraAtiva275=true;
    qcAvisoTransferir275.textContent="Aponte a camera para o QR Code.";
    const capturar=async () => {
      if (!qcLeituraAtiva275) return;
      try {
        const codigos=await detector.detect(video);
        if (codigos.length) {
          const valor=String(codigos[0].rawValue||"");
          if (/^QC1\|[0-9a-f-]{36}\|[0-9a-f]{64}$/i.test(valor)) {
            qcValorReceber275.value=valor;
            QC_pararCamera275();
            qcAvisoTransferir275.textContent="Codigo lido. Toque em Receber QC.";
            return;
          }
        }
      } catch(_) { /* Camera ainda nao pronta; proxima leitura. */ }
      if (qcLeituraAtiva275) setTimeout(capturar,350);
    };
    capturar();
  } catch(err) {
    QC_pararCamera275();
    qcAvisoTransferir275.textContent = "Nao foi possivel abrir a camera: " +
      String(err.message||err) + ". Use copiar/colar.";
  }
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

    if (senha.length < 6) {
      campoSenha.classList.add("campo-erro");
      QC_mostrarMensagemAcesso(
        "A senha deve ter pelo menos 6 caracteres.",
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



async function QC_enviarAtivacaoV2(dados) {

  const URL_APPS_SCRIPT =
    "https://script.google.com/macros/s/AKfycbxEU0xzZz833Bqv7CxV-PdTVIjxRrl27lNgSG0upZ07rnXaAkULhGGuehxbpU2-K1oyOQ/exec";

  // Validar os dados recebidos do formulário.
  if (
    typeof dados.senha !== "string" ||
    dados.senha.length < 6
  ) {
    throw new Error(
      "A senha deve ter pelo menos 6 caracteres."
    );
  }

  // Criar um salt exclusivo para a nova carteira.
  const saltHex = QC_gerarSaltSenhaV2();

  // Calcular PBKDF2 no próprio Android.
  const derivadoHex = await QC_derivarSenhaV2(
    dados.senha,
    saltHex
  );

  // Enviar a credencial derivada, não a senha original.
  const resposta = await fetch(URL_APPS_SCRIPT, {
    method: "POST",
    redirect: "follow",
    headers: {
      "Content-Type": "text/plain;charset=utf-8"
    },
    body: JSON.stringify({
      acao: "qc_ativar",
      idCadastro: dados.idCadastro,
      derivadoHex: derivadoHex,
      saltHex: saltHex,
      codigoRecuperacao: dados.codigoRecuperacao
    })
  });

  if (!resposta.ok) {
    throw new Error(
      "Erro de comunicação: " + resposta.status
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
  document.getElementById("btnReceber").disabled = false;
  document.getElementById("btnDoar").disabled = false;
  document.getElementById("btnTransferir").disabled = false;
  if (window.QC_habilitarResgate278) window.QC_habilitarResgate278();

  document.getElementById("mensagem").textContent =
    "✅ Login e sessão validados! " +
    "Use Receber QC ou Doar QC para continuar.";

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
  const resgate278 = document.getElementById("btnResgatar");
  if (resgate278) resgate278.disabled = true;

    const areaTesoureiro = document.getElementById(
    "qcAreaTesoureiro"
  );

  if (areaTesoureiro) {
    areaTesoureiro.style.display = "none";
  }
}

function QC_exibirTelaCarteira() {

  document.getElementById("telaAcesso")
    .style.display = "none";

  document.getElementById("telaCarteira")
    .style.display = "block";

    QC_atualizarTela();

  // Consultar se esta carteira pertence ao tesoureiro.
  QC_atualizarAreaTesoureiro();
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

        await QC_enviarRecuperacaoAutomatico(
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
      "Registrando sua carteira QuintosCoin...";

    try {

      const resultado = await QC_enviarAtivacaoV2(
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
        "Carteira QuintosCoin ativada com sucesso! " +
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
        .disabled = false;

      document.getElementById("btnDoar")
        .disabled = false;
      document.getElementById("btnTransferir")
        .disabled = false;
      if (window.QC_habilitarResgate278) window.QC_habilitarResgate278();

      document.getElementById("mensagem")
        .textContent =
        "✅ Sessão restaurada automaticamente! " +
        "Carteira protegida e pronta para consultar suas fichas.";

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

    if (nova.length < 6) {
      QC_mostrarMensagemTrocaSenha(
        "A senha deve ter pelo menos 6 caracteres.",
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

      const resultado = await QC_enviarAlteracaoSenhaAutomatico(
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

    if (novaSenha.length < 6) {

      QC_mensagemRecuperacao(
        "A senha deve ter pelo menos 6 caracteres.",
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


async function QC_enviarAlteracaoSenhaAutomatico(
  tokenSessao,
  senhaAtual,
  novaSenha
) {

  const idCarteira = localStorage.getItem(
    QC_ID_LOCAL
  );

  if (!idCarteira) {
    throw new Error("Carteira não identificada.");
  }

  const parametros =
    await QC_consultarParametrosLoginTeste(idCarteira);

  if (parametros.status !== "OK") {
    throw new Error(
      parametros.mensagem ||
      "Não foi possível consultar a carteira."
    );
  }

  
    // CARTEIRAS COM PBKDF2
  if (parametros.algoritmo === "PBKDF2_V2") {

    if (
      !/^[0-9a-f]{32}$/i.test(parametros.salt) ||
      parametros.iteracoes !== 600000
    ) {
      throw new Error("Parâmetros PBKDF2 inválidos.");
    }

    // Confirmar senha atual.
    const derivadoAtual = await QC_derivarSenhaV2(
      senhaAtual,
      parametros.salt
    );

    // Nova senha com salt exclusivo.
    const saltNovo = QC_gerarSaltSenhaV2();

    const derivadoNovo = await QC_derivarSenhaV2(
      novaSenha,
      saltNovo
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
        acao: "qc_alterar_senha_v2_teste",
        tokenSessao: tokenSessao,
        derivadoAtual: derivadoAtual,
        derivadoNovo: derivadoNovo,
        saltNovo: saltNovo
      })
    });

    if (!resposta.ok) {
      throw new Error(
        "Erro de comunicação: " + resposta.status
      );
    }

    return await resposta.json();
  }

  throw new Error(
    "Algoritmo de senha não reconhecido."
  );
}


async function QC_enviarRecuperacaoAutomatico(dados) {

  const parametros =
    await QC_consultarParametrosLoginTeste(
      dados.idCarteira
    );

  if (parametros.status !== "OK") {
    throw new Error(
      parametros.mensagem ||
      "Não foi possível consultar a carteira."
    );
  }

   // RECUPERAÇÃO PELO NOVO ALGORITMO
  if (parametros.algoritmo === "PBKDF2_V2") {

    if (
      !/^[0-9a-f]{32}$/i.test(parametros.salt) ||
      parametros.iteracoes !== 600000
    ) {
      throw new Error(
        "Parâmetros PBKDF2 inválidos."
      );
    }

    // Criar um salt novo para a nova senha.
    const saltNovo = QC_gerarSaltSenhaV2();

    // Calcular a nova credencial no Android.
    const derivadoNovo = await QC_derivarSenhaV2(
      dados.novaSenha,
      saltNovo
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
        acao: "qc_redefinir_senha_v2_teste",
        idCarteira: dados.idCarteira,
        codigoAtual: dados.codigoAtual,
        derivadoNovo: derivadoNovo,
        saltNovo: saltNovo,
        novoCodigo: dados.novoCodigo
      })
    });

    if (!resposta.ok) {
      throw new Error(
        "Erro de comunicação: " + resposta.status
      );
    }

    const resultado = await resposta.json();

    if (resultado.status !== "OK") {
      throw new Error(
        resultado.mensagem ||
        "Não foi possível recuperar a senha."
      );
    }

    return resultado;
  }

  throw new Error(
    "Algoritmo de senha não reconhecido."
  );
}


async function QC_enviarSolicitacaoCreditos(
  tokenSessao,
  valor
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
      acao: "qc_solicitar_creditos",
      tokenSessao: tokenSessao,
      valor: valor
    })
  });

  if (!resposta.ok) {
    throw new Error(
      "Erro de comunicação: " + resposta.status
    );
  }

  return await resposta.json();
}


/* QUINTOSCOIN - ÁREA DO TESOUREIRO */

const qcAreaTesoureiro = document.createElement("section");

qcAreaTesoureiro.id = "qcAreaTesoureiro";
qcAreaTesoureiro.className = "qc-area-tesoureiro";
qcAreaTesoureiro.style.display = "none";

qcAreaTesoureiro.innerHTML = `
  <h3>ÁREA DO TESOUREIRO</h3>

  <section id="qcPainelCirculacao276" style="margin:14px 0 18px;padding:14px;border:1px solid #ffffff29;border-radius:12px">
    <h4 style="margin:0 0 12px">📊 Circulação e lastro</h4>
    <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px">
      <div style="padding:10px;border-radius:10px;background:#ffffff10">
        <small style="display:block;opacity:.8">QCs em circulação</small>
        <strong id="qcCirculacao276" style="font-size:21px">—</strong>
      </div>
      <div style="padding:10px;border-radius:10px;background:#ffffff10">
        <small style="display:block;opacity:.8">Lastro mínimo a reservar</small>
        <strong id="qcLastro276" style="font-size:21px">—</strong>
      </div>
    </div>
    <p id="qcResumoLastro276" style="font-size:13px;opacity:.85;margin:10px 0 0">Consultando registros...</p>
    <p id="qcAvisoLastro276" role="status" style="font-size:13px;margin:6px 0 0"></p>
  </section>

  <button
    type="button"
    id="qcBtnPedidosTesoureiro"
    class="qc-botao-pedidos"
  >
    <span>📋 Pedidos pendentes</span>

    <span class="qc-indicador-pedidos">
      <span
        id="qcEsferaPedidos"
        class="qc-esfera-pedidos"
      ></span>

      <span id="qcQuantidadePedidos">
        Consultando...
      </span>
    </span>
  </button>

  <p id="qcMensagemTesoureiro"></p>

  <div
    id="qcListaPedidosTesoureiro"
    class="qc-lista-pedidos"
    hidden
  ></div>
`;

document.getElementById("telaCarteira")
  .appendChild(qcAreaTesoureiro);


// PASSO 276 - Dados financeiros visiveis apenas apos validacao no servidor.
async function QC_carregarPainelTesoureiro276(tokenSessao) {
  const painel = document.getElementById("qcPainelCirculacao276");
  if (!painel) return;
  const circulacao = document.getElementById("qcCirculacao276");
  const lastro = document.getElementById("qcLastro276");
  const resumo = document.getElementById("qcResumoLastro276");
  const aviso = document.getElementById("qcAvisoLastro276");
  circulacao.textContent = "—";
  lastro.textContent = "—";
  resumo.textContent = "Conferindo registros...";
  aviso.textContent = "";
  try {
    const URL_SCRIPT =
      "https://script.google.com/macros/s/AKfycbxEU0xzZz833Bqv7CxV-PdTVIjxRrl27lNgSG0upZ07rnXaAkULhGGuehxbpU2-K1oyOQ/exec";
    const resposta = await fetch(URL_SCRIPT, {
      method: "POST",
      redirect: "follow",
      headers: {"Content-Type": "text/plain;charset=utf-8"},
      body: JSON.stringify({
        acao: "qc_painel_tesoureiro",
        tokenSessao: tokenSessao
      })
    });
    if (!resposta.ok) throw new Error("Falha na comunicacao.");
    const dados = await resposta.json();
    if (sessionStorage.getItem(QC_CHAVE_SESSAO) !== tokenSessao) return;
    if (dados.status !== "OK" || dados.tesoureiro !== true) {
      throw new Error("Painel financeiro indisponivel.");
    }
    const formato = n => Number(n).toLocaleString("pt-BR");
    if (dados.conferencia === "CONFERIDO" &&
        Number.isSafeInteger(dados.circulacao) &&
        Number.isSafeInteger(dados.lastroReservadoBRL)) {
      circulacao.textContent = formato(dados.circulacao) + " QC";
      lastro.textContent = Number(dados.lastroReservadoBRL)
        .toLocaleString("pt-BR", {style:"currency", currency:"BRL"});
    }
    resumo.textContent =
      "Emitidos: " + formato(dados.emitidos) + " QC" +
      " · Doacoes extintas: " +
      (Number.isSafeInteger(dados.doacoesExtintas) ?
        formato(dados.doacoesExtintas) + " QC" : "a conferir") +
      " · Resgates confirmados: " +
      (Number.isSafeInteger(dados.resgatesEmDinheiro) ?
        formato(dados.resgatesEmDinheiro) + " QC" : "a conferir") +
      " · Atualizado: " + dados.atualizadoEm;
    if (dados.conferencia !== "CONFERIDO") {
      aviso.textContent = "⚠️ Conferencia necessaria: " +
        (Array.isArray(dados.avisos) && dados.avisos.length ?
          dados.avisos.join(" ") : "lancamentos inconsistentes.");
      resumo.textContent += " · Lastro ainda nao confirmado.";
    } else {
      aviso.textContent = "Valores contabeis calculados. Confira o saldo bancario separadamente.";
    }
  } catch (erro) {
    if (sessionStorage.getItem(QC_CHAVE_SESSAO) === tokenSessao) {
      circulacao.textContent = "—";
      lastro.textContent = "—";
      resumo.textContent = "Nao foi possivel conferir o lastro.";
      aviso.textContent = "Acesso ou registros indisponiveis.";
    }
  }
}

// Consultar autorização e pedidos no Apps Script.
async function QC_atualizarAreaTesoureiro(abrirLista = false) {

  const token = sessionStorage.getItem(
    QC_CHAVE_SESSAO
  );

  const area = document.getElementById(
    "qcAreaTesoureiro"
  );

  const lista = document.getElementById(
    "qcListaPedidosTesoureiro"
  );

  const mensagem = document.getElementById(
    "qcMensagemTesoureiro"
  );

  if (!token) {
    area.style.display = "none";
    return;
  }

  try {

    const URL_SCRIPT =
      "https://script.google.com/macros/s/AKfycbxEU0xzZz833Bqv7CxV-PdTVIjxRrl27lNgSG0upZ07rnXaAkULhGGuehxbpU2-K1oyOQ/exec";

    const resposta = await fetch(URL_SCRIPT, {
      method: "POST",
      redirect: "follow",
      headers: {
        "Content-Type": "text/plain;charset=utf-8"
      },
      body: JSON.stringify({
        acao: "qc_pedidos_tesoureiro",
        tokenSessao: token
      })
    });

    if (!resposta.ok) {
      throw new Error("Falha na consulta.");
    }

    const resultado = await resposta.json();

    // Ignorar resposta de uma sessão já encerrada.
    if (
      sessionStorage.getItem(QC_CHAVE_SESSAO) !== token
    ) {
      return;
    }

    // Somente o tesoureiro poderá visualizar.
    if (
      resultado.status === "NAO_AUTORIZADO" ||
      resultado.tesoureiro === false
    ) {
      area.style.display = "none";
      return;
    }

    if (
      resultado.status !== "OK" ||
      resultado.tesoureiro !== true
    ) {
      throw new Error(
        resultado.mensagem ||
        "Não foi possível consultar os pedidos."
      );
    }

    const pedidos = Array.isArray(resultado.pedidos)
      ? resultado.pedidos
      : [];

    const quantidade = pedidos.length;

    // Mostrar area administrativa somente apos a autorizacao.
    area.style.display = "block";
    mensagem.textContent = "";
    QC_carregarPainelTesoureiro276(token);
    if (window.QC_atualizarResgatesTesoureiro278)
      window.QC_atualizarResgatesTesoureiro278();


    const esfera = document.getElementById(
      "qcEsferaPedidos"
    );

    const contador = document.getElementById(
      "qcQuantidadePedidos"
    );

    if (quantidade > 0) {

      esfera.className =
        "qc-esfera-pedidos qc-esfera-laranja";

      contador.textContent =
        quantidade +
        (quantidade === 1
          ? " pendente"
          : " pendentes");

    } else {

      esfera.className =
        "qc-esfera-pedidos qc-esfera-verde";

      contador.textContent = "Nenhum pedido";

    }

    // Preencher lista ao abrir ou atualizar.
    if (abrirLista || !lista.hidden) {

      lista.replaceChildren();

      if (quantidade === 0) {

        const vazio = document.createElement("p");
        vazio.textContent =
          "✅ Não existem solicitações pendentes.";

        lista.appendChild(vazio);

      } else {

        pedidos.forEach(pedido => {

          const item = document.createElement("div");
          item.className = "qc-item-pedido";

          const titulo = document.createElement("strong");
          titulo.textContent =
            pedido.valor + " QC solicitados";

          const membro = document.createElement("p");
membro.textContent =
  "Solicitante: " + pedido.nome;

membro.style.fontWeight = "600";
membro.style.fontSize = "15px";
membro.style.color = "#ffffff";

          const data = document.createElement("p");
          data.textContent =
            "Data: " + pedido.dataSolicitacao;

          
const situacao = document.createElement("p");
situacao.textContent =
  "⏳ Aguardando confirmação de pagamento";

// Botão de autorização.
const botaoAprovar = document.createElement("button");

botaoAprovar.type = "button";
botaoAprovar.className = "qc-btn-aprovar-pedido";
botaoAprovar.textContent =
  "Confirmar pagamento e autorizar";

botaoAprovar.addEventListener("click", async function() {

  const nome = pedido.nome || "Solicitante";

 const confirmado = await QC_confirmarPagamentoPedido(
  nome,
  pedido.valor
);

if (!confirmado) {
  return;
}

  const token = sessionStorage.getItem(
    QC_CHAVE_SESSAO
  );

  if (!token) {
    mensagem.textContent =
      "⚠️ Sessão expirada. Entre novamente.";
    return;
  }

  botaoAprovar.disabled = true;
  botaoAprovar.textContent = "Autorizando...";
  mensagem.textContent = "";

  try {

    const resultado = await QC_enviarAutorizacaoPedido(
      token,
      pedido.idAutorizacao
    );

    if (resultado.status !== "AUTORIZADA") {
      throw new Error(
        resultado.mensagem ||
        "Não foi possível autorizar o pedido."
      );
    }

    // Atualizar a lista e o indicador.
    await QC_atualizarAreaTesoureiro(true);

    mensagem.textContent =
      "✅ Solicitação de " + nome +
      " autorizada com sucesso! " +
      "A emissão dos QCs ainda está pendente.";

  } catch (erro) {

    mensagem.textContent =
      "⚠️ " + erro.message +
      " Confira a situação do pedido antes " +
      "de tentar novamente.";

  } finally {

    botaoAprovar.disabled = false;
    botaoAprovar.textContent =
      "Confirmar pagamento e autorizar";

  }

});

item.append(
  titulo,
  membro,
  data,
  situacao,
  botaoAprovar
);

lista.appendChild(item);


        });

      }

      lista.hidden = false;
    }

  } catch (erro) {

    if (area.style.display === "block") {
      mensagem.textContent =
        "⚠️ Não foi possível atualizar os pedidos.";
    }

    console.error(
      "Erro na Área do Tesoureiro:",
      erro
    );
  }
}


// Botão para abrir ou fechar os pedidos.
document.getElementById("qcBtnPedidosTesoureiro")
  .addEventListener("click", async function() {

    const lista = document.getElementById(
      "qcListaPedidosTesoureiro"
    );

    if (!lista.hidden) {
      lista.hidden = true;
      return;
    }

    await QC_atualizarAreaTesoureiro(true);

  });


async function QC_enviarAutorizacaoPedido(
  tokenSessao,
  idAutorizacao
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
      acao: "qc_autorizar_pedido",
      tokenSessao: tokenSessao,
      idAutorizacao: idAutorizacao
    })
  });

  if (!resposta.ok) {
    throw new Error(
      "Falha na comunicação: HTTP " + resposta.status
    );
  }

  return await resposta.json();
}


function QC_confirmarPagamentoPedido(nome, valor) {

  return new Promise(function(resolve) {

    // Evitar duas janelas abertas ao mesmo tempo.
    if (document.getElementById("qcModalAutorizarPedido")) {
      resolve(false);
      return;
    }

    const overlay = document.createElement("div");

    overlay.id = "qcModalAutorizarPedido";
    overlay.className = "qc-modal-autorizacao";

    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute(
      "aria-labelledby",
      "qcTituloAutorizar"
    );

    overlay.innerHTML = `
      <div class="qc-card-autorizacao">

        <h3 id="qcTituloAutorizar">
          🛡️ Confirmar pagamento
        </h3>

        <p class="qc-texto-autorizacao">
          Confira os dados da solicitação
          antes de autorizar.
        </p>

        <div class="qc-dados-autorizacao">

          <span class="qc-rotulo-autorizacao">
            SOLICITANTE
          </span>

          <strong id="qcNomeAutorizar"></strong>

          <div class="qc-linha-autorizacao"></div>

          <span class="qc-rotulo-autorizacao">
            QUANTIDADE SOLICITADA
          </span>

          <strong
            id="qcValorAutorizar"
            class="qc-valor-autorizacao"
          ></strong>

        </div>

        <p class="qc-alerta-autorizacao">
          ⚠️ Confirme somente se o pagamento
          Pix já foi recebido e conferido.
        </p>

        <button
          type="button"
          id="qcConfirmarAutorizacao"
          class="qc-confirmar-autorizacao"
        >
          ✅ Confirmar e autorizar
        </button>

        <button
          type="button"
          id="qcCancelarAutorizacao"
          class="qc-cancelar-autorizacao"
        >
          Cancelar
        </button>

      </div>
    `;

    document.body.appendChild(overlay);

    // Preencher os dados sem inserir texto do usuário
    // diretamente no HTML.
    document.getElementById("qcNomeAutorizar")
      .textContent = nome;

    document.getElementById("qcValorAutorizar")
      .textContent = valor + " QC";

    const confirmar = document.getElementById(
      "qcConfirmarAutorizacao"
    );

    const cancelar = document.getElementById(
      "qcCancelarAutorizacao"
    );

    const focoAnterior = document.activeElement;
    const overflowAnterior = document.body.style.overflow;

    document.body.style.overflow = "hidden";

    let encerrado = false;

    function encerrar(resultado) {

      if (encerrado) {
        return;
      }

      encerrado = true;

      document.removeEventListener(
        "keydown",
        aoPressionarTecla
      );

      document.body.style.overflow = overflowAnterior;
      overlay.remove();

      if (
        focoAnterior &&
        focoAnterior.isConnected &&
        typeof focoAnterior.focus === "function"
      ) {
        focoAnterior.focus();
      }

      resolve(resultado);
    }

    function aoPressionarTecla(evento) {

      if (evento.key === "Escape") {
        evento.preventDefault();
        encerrar(false);
      }

      // Manter o foco dentro da janela.
      if (evento.key === "Tab") {

        const primeiro = confirmar;
        const ultimo = cancelar;

        if (evento.shiftKey &&
            document.activeElement === primeiro) {
          evento.preventDefault();
          ultimo.focus();

        } else if (
          !evento.shiftKey &&
          document.activeElement === ultimo
        ) {
          evento.preventDefault();
          primeiro.focus();
        }
      }
    }

    confirmar.addEventListener("click", function() {
      encerrar(true);
    });

    cancelar.addEventListener("click", function() {
      encerrar(false);
    });

    overlay.addEventListener("click", function(evento) {
      if (evento.target === overlay) {
        encerrar(false);
      }
    });

    document.addEventListener(
      "keydown",
      aoPressionarTecla
    );

    // Foco inicial no botão Cancelar, por segurança.
    cancelar.focus();

  });

}


// PASSO 278 - Interface de resgates definitivos.
// Receber, Doar, Transferir e Resgatar: um botao por operacao.
(function QC_montarResgates278() {
  const acoes=document.querySelector("#telaCarteira .acoes");
  const doar=document.getElementById("btnDoar");
  const receber=document.getElementById("btnReceber");
  const transferir=document.getElementById("btnTransferir");
  if (!acoes||!doar||!receber||!transferir) return;
  const resgatar=document.createElement("button");
  resgatar.type="button";
  resgatar.id="btnResgatar";
  resgatar.textContent="Resgatar QC";
  resgatar.disabled=true;
  acoes.appendChild(resgatar);

  // Layout simplificado: Doar tem prioridade visual.
  const estilo=document.createElement("style");
  estilo.textContent=`
    #telaCarteira .acoes {display:grid!important;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px;margin:16px 0}
    #telaCarteira .acoes button {min-width:0;white-space:normal;padding:13px 5px;border-radius:11px;font-size:clamp(11px,2.8vw,14px);line-height:1.25}
    #telaCarteira #btnDoar {grid-column:1/-1;grid-row:1;background:#168055!important;color:white!important;border:1px solid #2c9b71!important;font-size:20px!important;font-weight:750;padding:20px 12px;box-shadow:0 7px 18px #0002}
    #telaCarteira #btnReceber {grid-column:1;grid-row:2}
    #telaCarteira #btnTransferir {grid-column:2;grid-row:2}
    #telaCarteira #btnResgatar {grid-column:3;grid-row:2}
    #qcModalResgate278 [hidden], #qcAreaResgatesTesoureiro278 [hidden] {display:none!important}
    .qc-resgate-linha278 {border:1px solid #ffffff28;border-radius:10px;margin:10px 0;padding:11px}
    .qc-resgate-linha278 p {margin:5px 0;font-size:13px;overflow-wrap:anywhere}
    .qc-resgate-linha278 button {margin:5px 5px 0 0;padding:9px 12px;border-radius:8px}
    .qc-resgate-status278 {opacity:.85;font-size:12px}
  `;
  document.head.appendChild(estilo);
  const modal=document.createElement("div");
  modal.id="qcModalResgate278";
  modal.className="qc-modal-overlay";
  modal.style.display="none";
  modal.innerHTML=`
    <div class="qc-modal-card" role="dialog" aria-modal="true" aria-labelledby="qcTituloResgate278">
      <div class="qc-modal-topo"><h3 id="qcTituloResgate278">Resgatar QuintosCoin</h3>
        <button type="button" id="qcFecharResgate278" class="qc-modal-fechar" aria-label="Fechar">×</button></div>
      <p class="qc-modal-texto">Informe quanto deseja resgatar. O pagamento sera combinado com o tesoureiro.</p>
      <label for="qcValorResgate278" class="qc-label-modal">Valor em QC</label>
      <input id="qcValorResgate278" class="qc-input-modal" type="number" min="2" step="1"
        inputmode="numeric" placeholder="Exemplo: 20">
      <div class="qc-modal-botoes">
        <button id="qcSolicitarResgate278" type="button" class="qc-btn-modal-principal">Solicitar resgate</button>
        <button id="qcCancelarTelaResgate278" type="button" class="qc-btn-modal-secundario">Voltar</button>
      </div>
      <p id="qcMensagemResgate278" class="qc-modal-mensagem" role="status"></p>
      <details id="qcMeusResgates278" style="margin-top:14px">
        <summary style="cursor:pointer">Acompanhar meus resgates</summary>
        <div id="qcListaMeusResgates278" style="margin-top:10px"></div>
      </details>
    </div>`;
  document.body.appendChild(modal);
  const status=document.getElementById("qcMensagemResgate278");
  const campo=document.getElementById("qcValorResgate278");
  const enviar=document.getElementById("qcSolicitarResgate278");
  const lista=document.getElementById("qcListaMeusResgates278");
  let ocupado=false;
  function fechar() {if(!ocupado) modal.style.display="none";}
  function rotuloEstado(st) {
    return ({PENDENTE:"Aguardando tesoureiro",
      CRIANDO:"Preparando",
      CANCELAMENTO_SOLICITADO:"Cancelamento solicitado",
      CANCELAMENTO_APROVADO:"Aguardando devolucao",
      CONFIRMADO:"Pago e encerrado",CANCELADO:"Cancelado"})[st]||st;
  }
  function acaoLinha(texto, handler) {
    const b=document.createElement("button");b.type="button";
    b.textContent=texto;
    b.className="qc-btn-modal-secundario";
    b.addEventListener("click",async()=>{
      if(ocupado) return;
      ocupado=true;b.disabled=true;status.textContent="Consultando a solicitacao...";
      try {await handler();await atualizarMeus();}
      catch(e){status.textContent="⚠️ "+String(e.message||e);}
      finally {ocupado=false;b.disabled=false;}
    });
    return b;
  }
  async function atualizarMeus() {
    lista.textContent="Consultando...";
    if(typeof window.QC_meusResgates278!=="function") {
      lista.textContent="Atualize a pagina para carregar os resgates.";return;
    }
    const pedidos=await window.QC_meusResgates278();
    lista.replaceChildren();
    if(!pedidos.length){lista.textContent="Nenhum resgate solicitado.";return;}
    pedidos.forEach(p=>{
      const item=document.createElement("div");item.className="qc-resgate-linha278";
      const nome=document.createElement("strong");nome.textContent=p.valor+" QC";
      const situacao=document.createElement("p");situacao.className="qc-resgate-status278";
      situacao.textContent=rotuloEstado(p.status)+" · "+p.solicitadoEm;
      item.append(nome,situacao);
      if(p.possuiRecuperacaoLocal){
        item.append(acaoLinha("Atualizar / recuperar fichas",async()=>{
          const r=await window.QC_retomarResgate278(p.idResgate);
          status.textContent=r.status==="CANCELADO" ?
            "✅ Resgate cancelado; fichas devolvidas com seguranca." :
            r.status==="CONFIRMADO" ? "✅ Pagamento confirmado." :
            "Solicitacao atualizada. Aguardando tesoureiro.";
        }));
      }
      if(!p.possuiRecuperacaoLocal && ["CANCELADO","CRIANDO","CANCELAMENTO_APROVADO"].includes(p.status)){
        const atencao=document.createElement("p");
        atencao.textContent="Para recuperar fichas, use o aparelho que fez a solicitacao.";
        item.append(atencao);
      }
      if(p.status==="PENDENTE"){
        item.append(acaoLinha("Pedir cancelamento",async()=>{
          if(!window.confirm("Solicitar cancelamento de "+p.valor+" QC? As fichas continuam reservadas ate autorizacao do tesoureiro.")) return;
          await window.QC_pedirCancelamentoResgate278(p.idResgate);
          status.textContent="Cancelamento solicitado. Aguarde autorizacao do tesoureiro.";
        }));
      }
      lista.appendChild(item);
    });
  }
  resgatar.addEventListener("click",()=>{
    if(!sessionStorage.getItem("QC_TOKEN_SESSAO_TESTE")) return;
    status.textContent="";campo.value="";modal.style.display="flex";
  });
  document.getElementById("qcFecharResgate278").addEventListener("click",fechar);
  document.getElementById("qcCancelarTelaResgate278").addEventListener("click",fechar);
  modal.addEventListener("click",e=>{if(e.target===modal)fechar();});
  enviar.addEventListener("click",async()=>{
    if(ocupado)return;
    const valor=Number(campo.value);
    if(!campo.value.trim()||!Number.isSafeInteger(valor)||valor<2||valor===3){
      status.textContent="Informe valor inteiro a partir de 2 QC, exceto 3 QC.";return;
    }
    ocupado=true;enviar.disabled=true;status.textContent="Preparando resgate seguro...";
    try{
      if(typeof window.QC_solicitarResgate278!=="function")throw Error("Modulo de resgate nao carregado.");
      const r=await window.QC_solicitarResgate278(valor);
      if(r.status==="CANCELADO_PELO_USUARIO") status.textContent="Operacao cancelada.";
      else if(r.status==="PENDENTE" && r.situacao){
        status.textContent="✅ Resgate registrado. Combine o pagamento com o tesoureiro. " +
          "Os QCs permanecem reservados.";
        campo.value="";await atualizarMeus();
      } else {
        status.textContent=r.mensagem||"Operacao pendente. Preserve este aparelho e retome o pedido.";
        await atualizarMeus();
      }
    }catch(e){status.textContent="⚠️ "+String(e.message||e)+" Se a conexao caiu, preserve os dados deste aparelho.";}
    finally{ocupado=false;enviar.disabled=false;}
  });
  campo.addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();enviar.click();}});
  document.getElementById("qcMeusResgates278").addEventListener("toggle",e=>{
    if(e.target.open) atualizarMeus().catch(err=>{
      lista.textContent="⚠️ "+String(err.message||err);
    });
  });

  // Habilitar apenas o botao na interface. O servidor mantem os bloqueios.
  const mostrarResgatar=()=>{
    resgatar.disabled=!sessionStorage.getItem("QC_TOKEN_SESSAO_TESTE");
  };
  // O fluxo de login/restauracao chama a mesma ativacao dos demais botoes.
  window.QC_habilitarResgate278=mostrarResgatar;
})();

// PASSO 278 - Pedidos identificados restritos a area do tesoureiro.
(function QC_montarTesourariaResgates278(){
  const area=document.getElementById("qcAreaTesoureiro");
  if(!area)return;
  const painel=document.createElement("details");
  painel.id="qcAreaResgatesTesoureiro278";
  painel.style.cssText="margin:15px 0;border:1px solid #ffffff29;border-radius:12px;padding:12px";
  const titulo=document.createElement("summary");
  titulo.textContent="💵 Resgates pendentes";
  titulo.style.cssText="cursor:pointer;font-weight:600";
  const lista=document.createElement("div");
  lista.id="qcListaResgatesTesoureiro278";
  lista.style.marginTop="12px";
  painel.append(titulo,lista);
  area.appendChild(painel);
  const URL_SCRIPT="https://script.google.com/macros/s/AKfycbxEU0xzZz833Bqv7CxV-PdTVIjxRrl27lNgSG0upZ07rnXaAkULhGGuehxbpU2-K1oyOQ/exec";
  async function postar(acao,params={}){
    const token=sessionStorage.getItem("QC_TOKEN_SESSAO_TESTE");
    if(!token) throw Error("Sessao expirada.");
    const r=await fetch(URL_SCRIPT,{method:"POST",redirect:"follow",
      headers:{"Content-Type":"text/plain;charset=utf-8"},
      body:JSON.stringify({acao,tokenSessao:token,...params})});
    if(!r.ok)throw Error("Falha de comunicacao: HTTP "+r.status);
    const dados=await r.json();
    if(token!==sessionStorage.getItem("QC_TOKEN_SESSAO_TESTE"))throw Error("Sessao alterada.");
    if(dados.status==="ERRO"||dados.status==="NAO_AUTORIZADO"){
      throw Error(dados.mensagem||"Operacao nao autorizada.");
    }
    return dados;
  }
  let carregando=false;
  async function carregar(){
    if(carregando)return;
    carregando=true;lista.textContent="Consultando resgates...";
    try{
      const r=await postar("qc_resgate_pendentes_tesoureiro");
      if(r.status!=="OK"||!Array.isArray(r.pedidos))throw Error("Lista de resgates invalida.");
      lista.replaceChildren();
      titulo.textContent="💵 Resgates pendentes"+(r.pedidos.length?" ("+r.pedidos.length+")":"");
      if(!r.pedidos.length){lista.textContent="Nenhum resgate pendente.";return;}
      r.pedidos.forEach(p=>{
        const item=document.createElement("div");item.className="qc-resgate-linha278";
        const nome=document.createElement("strong");nome.textContent=p.nome;
        const info=document.createElement("p");
        info.textContent=p.valor+" QC · "+p.solicitadoEm+" · "+p.status;
        const mensagem=document.createElement("p");mensagem.setAttribute("role","status");
        item.append(nome,info);
        function botao(texto,acao,mensagemConfirmacao){
          const b=document.createElement("button");b.type="button";
          b.className="qc-btn-modal-secundario";b.textContent=texto;
          b.addEventListener("click",async()=>{
            if(!window.confirm(mensagemConfirmacao))return;
            b.disabled=true;mensagem.textContent="Registrando...";
            try{
              const r=await postar(acao,{idResgate:p.idResgate});
              if(acao==="qc_resgate_confirmar_pagamento" && r.status!=="RESGATE_CONFIRMADO"){
                throw Error(r.mensagem||"Confirmacao nao concluida: "+r.status);
              }
              if(acao==="qc_resgate_autorizar_cancelamento" &&
                 !["RESGATE_CANCELADO","CANCELAMENTO_PENDENTE_ASSINATURA"].includes(r.status)){
                throw Error(r.mensagem||"Cancelamento nao concluido: "+r.status);
              }
              mensagem.textContent=acao==="qc_resgate_confirmar_pagamento" ?
                "✅ Pagamento registrado e QCs extintos." :
                r.status==="RESGATE_CANCELADO" ?
                "✅ Cancelamento autorizado. Irmao deve recuperar as fichas na carteira." :
                "Cancelamento aprovado. Assinaturas pendentes; retomar autorizacao.";
              await carregar();
              QC_carregarPainelTesoureiro276(sessionStorage.getItem("QC_TOKEN_SESSAO_TESTE"));
            }catch(err){mensagem.textContent="⚠️ "+String(err.message||err);}
            finally{b.disabled=false;}
          });return b;
        }
        if(p.status==="PENDENTE"||p.status==="CANCELAMENTO_SOLICITADO"){
          item.append(botao("Confirmar pagamento",
            "qc_resgate_confirmar_pagamento",
            "Confirma que JA PAGOU R$ "+Number(p.valor).toFixed(2)+" a "+p.nome+
            " fora do sistema? Esta operacao extingue os QCs definitivamente e reduz o lastro."));
        }
        if(p.status==="CANCELAMENTO_SOLICITADO"||p.status==="CANCELAMENTO_APROVADO"){
          item.append(botao("Autorizar cancelamento",
            "qc_resgate_autorizar_cancelamento",
            "Confirma que NENHUM pagamento foi realizado a "+p.nome+
            "? Esta operacao devolve fichas para recuperacao na carteira do irmao."));
        }
        item.append(mensagem);lista.appendChild(item);
      });
    }catch(e){lista.textContent="⚠️ "+String(e.message||e);}
    finally{carregando=false;}
  }
  painel.addEventListener("toggle",()=>{if(painel.open)carregar();});
  window.QC_atualizarResgatesTesoureiro278=()=>{if(painel.open)carregar();};
})();
