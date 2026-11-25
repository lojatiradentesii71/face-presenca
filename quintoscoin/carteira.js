// PASSO 377 — Emitir SOMENTE fichas V2 de teste em operacoes autorizadas.
// As chaves V2 de teste ficam temporariamente sob os mesmos IDs publicos V2,
// mas sao pares RSA DISTINTOS das definitivas. A reversao invalida as fichas.
function QC_exigirPrimeiraEmissaoV2375(idEmissao, valor) {
  const p=PropertiesService.getScriptProperties();
  const id=String(idEmissao||'').trim().toLowerCase();
  if (p.getProperty('QC_V2_MODO')!=='TESTE' ||
      p.getProperty('QC_V2_TESTES_LIBERADOS')!=='SIM' ||
      p.getProperty('QC_V2_T_PUBLICAS_INSTALADAS')!=='SIM' ||
      p.getProperty('QC_V1_FINANCEIRO_ENCERRADO')!=='SIM' ||
      !/^qc-em-[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(id)) {
    throw new Error('Emissao V2 nao liberada no ambiente de testes.');
  }
  if (valor!==undefined) {
    const n=Number(valor);
    if (!Number.isSafeInteger(n)||n<1||n>200)
      throw new Error('Emissao de teste limitada a 1..200 Qc$ por pedido.');
    // Limite agregado conservador para impedir emissao infinita por erro.
    const ss=SpreadsheetApp.getActiveSpreadsheet();
    const a=ss.getSheetByName('QC_CotasEmissao');
    const e=ss.getSheetByName('QC_Emissoes');
    if(!a||!e) throw new Error('Livros de emissao ausentes.');
    const cot=a.getDataRange().getValues(), em=e.getDataRange().getValues();
    const ci=cot[0].map(x=>String(x).trim());
    const ei=em[0].map(x=>String(x).trim());
    const cChave=ci.indexOf('IdChave'), cEm=ci.indexOf('IdEmissao');
    const eID=ei.indexOf('IdEmissao'), eVal=ei.indexOf('ValorAutorizado');
    if([cChave,cEm,eID,eVal].some(i=>i<0)) throw new Error('Livros incompletos.');
    const emitidas=new Set(cot.slice(1).filter(r=>
      /^QC-(?:1|2|5|10|50)-V2$/.test(String(r[cChave]).trim()))
      .map(r=>String(r[cEm]).trim().toLowerCase()));
    let total=0;
    for(const r of em.slice(1)) {
      const k=String(r[eID]).trim().toLowerCase();
      if(!emitidas.has(k)) continue;
      const q=Number(r[eVal]);
      if(!Number.isSafeInteger(q)||q<0) throw new Error('Emissao V2 invalida.');
      total+=q;
    }
    if(total+(emitidas.has(id)?0:n)>300)
      throw new Error('Teto agregado de 300 Qc$ de teste atingido.');
  }
}


function QC_prepararEmissaoCarteira185(tokenSessao, idAutorizacao) {

  const id = String(idAutorizacao || "").trim();

  if (!id) {
    throw new Error("Autorização não informada.");
  }

  // PASSO 363: nao reutilizar o assinador V1 nem criar novas emissoes
  // enquanto o piloto V1 e o fluxo completo V2 nao forem encerrados.
  // Falha fechada ANTES de obter lock ou alterar qualquer planilha.
  const flags363 = PropertiesService.getScriptProperties();
  if (flags363.getProperty('QC_V2_MODO') !== 'TESTE' ||
      flags363.getProperty('QC_V2_TESTES_LIBERADOS') !== 'SIM' ||
      flags363.getProperty("QC_EMISSAO_REAL_ATIVA") !== "SIM" ||
      flags363.getProperty("QC_V2_RECEBIMENTO_ATIVO") !== "SIM" ||
      flags363.getProperty("QC_V1_FINANCEIRO_ENCERRADO") !== "SIM") {
    return {
      status: "EMISSAO_V2_BLOQUEADA",
      mensagem: "Emissao V2 ainda nao liberada. O financeiro V1 sera encerrado antes do inicio real.",
      fichasEmitidas: 0,
      assinaturaPermitida: false
    };
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {

    const sessao = QC_validarTokenSessaoTeste(tokenSessao);

    if (sessao.status !== "OK") {
      throw new Error("Sessão expirada. Entre novamente.");
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();

    function tabela(nome, campos) {

      const aba = ss.getSheetByName(nome);

      if (!aba) {
        throw new Error("Aba ausente: " + nome);
      }

      const dados = aba.getDataRange().getValues();
      const cab = dados[0].map(v => String(v).trim());
      const col = campo => cab.indexOf(campo);

      if (campos.some(campo => col(campo) < 0)) {
        throw new Error("Colunas ausentes: " + nome);
      }

      return { aba, dados, col };
    }

    const car = tabela("QC_Carteiras", [
      "IdCarteira", "IdCadastro",
      "Status", "Ambiente", "AlgoritmoSenha"
    ]);

    const aut = tabela("QC_Autorizacoes", [
      "IdAutorizacao", "IdCadastro",
      "Valor", "Status", "AutorizadaPor",
      "DataAutorizacao", "IdEmissao"
    ]);

    const em = tabela("QC_Emissoes", [
      "IdEmissao", "IdAutorizacao",
      "ValorAutorizado", "QuantidadeFichas",
      "Status", "DataCriacao", "DataConclusao"
    ]);

    const cot = tabela("QC_CotasEmissao", [
      "IdCota", "IdEmissao", "Denominacao",
      "IdChave", "QuantidadePermitida",
      "QuantidadeAssinada", "Status"
    ]);

    const op = tabela(
      "QC_OperacoesAssinatura",
      ["IdEmissao"]
    );

    // Identificar o proprietário pela sessão.
    const donos = car.dados.slice(1).filter(linha =>
      String(linha[car.col("IdCarteira")]).trim()
        === sessao.idCarteira &&
      String(linha[car.col("Status")]).trim()
        === "ATIVA" &&
      String(linha[car.col("Ambiente")]).trim()
        === "PRODUCAO" &&
      String(linha[car.col("AlgoritmoSenha")]).trim()
        === "PBKDF2_V2"
    );

    if (donos.length !== 1) {
      throw new Error("Carteira não autorizada.");
    }

    const idCadastro = String(
      donos[0][car.col("IdCadastro")]
    ).trim();

    // Localizar a autorização aprovada.
    const autorizacoes = aut.dados.slice(1).filter(linha =>
      String(linha[aut.col("IdAutorizacao")]).trim()
        === id
    );

    if (autorizacoes.length !== 1) {
      throw new Error(
        "Autorização não encontrada ou duplicada."
      );
    }

    const a = autorizacoes[0];

    if (
      String(a[aut.col("IdCadastro")]).trim()
        !== idCadastro
    ) {
      throw new Error(
        "Esta autorização não pertence à carteira."
      );
    }

    if (
      String(a[aut.col("Status")]).trim()
        !== "AUTORIZADA" ||
      !a[aut.col("AutorizadaPor")] ||
      !a[aut.col("DataAutorizacao")]
    ) {
      throw new Error(
        "Autorização ainda não aprovada pelo tesoureiro."
      );
    }

    const valor = Number(a[aut.col("Valor")]);
    const idEmissao = "QC-EM-" + id;
    QC_exigirPrimeiraEmissaoV2375(idEmissao, valor);

    // PASSO 363: novas emissoes SOMENTE V2; as anteriores V1 nao sao
    // replanejadas e os seus identificadores e historico permanecem intactos.
    const plano = QC_planejarCotasEmissaoV2362(valor, idEmissao);

    // Exigir chaves V2 ativas para CADA cota antes de qualquer escrita.
    // O status atual AGUARDANDO_INTEGRACAO falha fechado, intencionalmente.
    const abaChaves363 = ss.getSheetByName("QC_ChavesAssinatura");
    if (!abaChaves363) throw new Error("Cadastro de chaves ausente.");
    const chaves363 = abaChaves363.getDataRange().getValues();
    const hChaves363 = chaves363[0].map(v => String(v).trim());
    const cChave363 = campo => hChaves363.indexOf(campo);
    if (["IdChave", "Denominacao", "Versao", "Status", "ModuloPublico", "ExpoentePublico"]
        .some(campo => cChave363(campo) < 0)) {
      throw new Error("Cabecalhos de chaves incompletos.");
    }
    for (const cota363 of plano.cotas) {
      const linhas363 = chaves363.slice(1).filter(r =>
        String(r[cChave363("IdChave")] || "").trim() === cota363.idChave
      );
      if (linhas363.length !== 1) throw new Error("Chave V2 ausente ou duplicada.");
      const r363 = linhas363[0];
      if (Number(r363[cChave363("Denominacao")]) !== cota363.denominacao ||
          Number(r363[cChave363("Versao")]) !== 2 ||
          String(r363[cChave363("Status")]).trim() !== "ATIVA" ||
          !/^[89a-f][0-9a-f]{1023}$/i.test(String(r363[cChave363("ModuloPublico")]).trim()) ||
          !/^0*10001$/i.test(String(r363[cChave363("ExpoentePublico")]).trim())) {
        throw new Error("Chave V2 nao ativa ou invalida: " + cota363.idChave);
      }
    }

    // Não preparar novamente emissões que
    // já tenham operações de assinatura.
    if (op.dados.slice(1).some(r =>
      String(r[op.col("IdEmissao")]).trim()
        === idEmissao
    )) {
      throw new Error(
        "Esta emissão já possui operações registradas."
      );
    }

    const vinculo = String(
      a[aut.col("IdEmissao")] || ""
    ).trim();

    if (vinculo && vinculo !== idEmissao) {
      throw new Error(
        "Autorização vinculada a outra emissão."
      );
    }

    // Conferir emissões existentes.
    const anteriores = em.dados.slice(1).filter(linha =>
      String(linha[em.col("IdEmissao")]).trim()
        === idEmissao ||
      String(linha[em.col("IdAutorizacao")]).trim()
        === id
    );

    if (anteriores.length > 1) {
      throw new Error("Emissões duplicadas.");
    }

    if (anteriores.length) {

      const r = anteriores[0];

      if (
        String(r[em.col("IdEmissao")]).trim()
          !== idEmissao ||
        String(r[em.col("IdAutorizacao")]).trim()
          !== id ||
        Number(r[em.col("ValorAutorizado")])
          !== valor ||
        Number(r[em.col("QuantidadeFichas")])
          !== plano.quantidadeFichas ||
        String(r[em.col("Status")]).trim()
          !== "AGUARDANDO_ASSINATURA"
      ) {
        throw new Error(
          "Emissão existente não está na etapa de preparação."
        );
      }

    } else if (vinculo) {

      throw new Error(
        "Vínculo de emissão sem registro correspondente."
      );

    }

    // Conferir as cotas antes de gravar.
    const cotasAnteriores = cot.dados.slice(1).filter(
      linha =>
        String(linha[cot.col("IdEmissao")]).trim()
          === idEmissao ||
        plano.cotas.some(p =>
          String(linha[cot.col("IdCota")]).trim()
            === idEmissao + "-" + p.denominacao
        )
    );

    const encontrados = new Set();

    for (const r of cotasAnteriores) {

      const idCota = String(
        r[cot.col("IdCota")]
      ).trim();

      const p = plano.cotas.find(x =>
        idCota === idEmissao + "-" + x.denominacao
      );

      if (
        !p ||
        encontrados.has(idCota) ||
        String(r[cot.col("IdEmissao")]).trim()
          !== idEmissao ||
        Number(r[cot.col("Denominacao")])
          !== p.denominacao ||
        String(r[cot.col("IdChave")]).trim()
          !== p.idChave ||
        Number(r[cot.col("QuantidadePermitida")])
          !== p.quantidadePermitida ||
        Number(r[cot.col("QuantidadeAssinada")])
          !== 0 ||
        String(r[cot.col("Status")]).trim()
          !== "PLANEJADA"
      ) {
        throw new Error(
          "Cota existente inconsistente ou já utilizada."
        );
      }

      encontrados.add(idCota);
    }

    // Gravar a emissão apenas se ainda não existir.
    if (!anteriores.length) {

      em.aba.appendRow([
        idEmissao,
        id,
        valor,
        plano.quantidadeFichas,
        "AGUARDANDO_ASSINATURA",
        new Date(),
        ""
      ]);

    }

    // Gravar somente as cotas faltantes.
    for (const p of plano.cotas) {

      const idCota =
        idEmissao + "-" + p.denominacao;

      if (!encontrados.has(idCota)) {

        cot.aba.appendRow([
          idCota,
          idEmissao,
          p.denominacao,
          p.idChave,
          p.quantidadePermitida,
          0,
          "PLANEJADA"
        ]);

      }
    }

    SpreadsheetApp.flush();

    // Vincular à autorização por último.
    if (!vinculo) {

      const linhaAut = aut.dados.findIndex(
        (r, i) =>
          i > 0 &&
          String(r[aut.col("IdAutorizacao")]).trim()
            === id
      ) + 1;

      aut.aba.getRange(
        linhaAut,
        aut.col("IdEmissao") + 1
      ).setValue(idEmissao);

      SpreadsheetApp.flush();
    }

    return {
      status: "AGUARDANDO_ASSINATURA",
      versaoFicha: "V2",
      idEmissao: idEmissao,
      valor: valor,
      quantidadeFichas: plano.quantidadeFichas,
      cotas: plano.cotas.map(p => ({
        denominacao: p.denominacao,
        quantidade: p.quantidadePermitida,
        idChave: p.idChave
      })),
      fichasEmitidas: 0,
      assinaturaPermitida: false
    };

  } finally {

    lock.releaseLock();

  }

}


function QC_verificarConexaoWorker186() {

  const token = PropertiesService
    .getScriptProperties()
    .getProperty("QC_WORKER_TOKEN");

  if (!/^[0-9a-f]{64}$/.test(token || "")) {
    throw new Error("Segredo do Worker não configurado.");
  }

  const url =
    "https://quintoscoin-assinador-teste.lojatiradentesii71.workers.dev/interno/estado";

  const resposta = UrlFetchApp.fetch(url, {
    method: "post",
    headers: {
      Authorization: "Bearer " + token
    },
    muteHttpExceptions: true
  });

  if (resposta.getResponseCode() !== 200) {
    throw new Error(
      "Comunicação recusada. HTTP " +
      resposta.getResponseCode()
    );
  }

  const dados = JSON.parse(
    resposta.getContentText()
  );

  if (
    dados.sistema !== "QuintosCoin" ||
    dados.status !== "AUTENTICADO_SEM_ASSINATURA" ||
    dados.chavePrivadaInstalada !== false ||
    dados.assinaturaPermitida !== false
  ) {
    throw new Error("Resposta inesperada do Worker.");
  }

  Logger.log("APPS SCRIPT AUTENTICADO: OK");
  Logger.log("CLOUDFLARE WORKER: CONECTADO");
  Logger.log("CHAVE PRIVADA REAL: NÃO INSTALADA");
  Logger.log("ASSINATURAS: BLOQUEADAS");
  Logger.log("COMUNICAÇÃO PROTEGIDA: OK");

}


function QC_conferirChaveWorker188() {

  const token = PropertiesService
    .getScriptProperties()
    .getProperty("QC_WORKER_TOKEN");

  if (!/^[0-9a-f]{64}$/.test(token || "")) {
    throw new Error("Token do Worker inválido.");
  }

  const url =
    "https://quintoscoin-assinador-teste.lojatiradentesii71.workers.dev/interno/chave";

  const resposta = UrlFetchApp.fetch(url, {
    method: "post",
    headers: {
      Authorization: "Bearer " + token
    },
    muteHttpExceptions: true
  });

  
  if (resposta.getResponseCode() !== 200) {

    Logger.log(
      "DIAGNOSTICO WORKER: " +
      resposta.getContentText()
    );

    throw new Error(
      "Worker não disponibilizou a chave. HTTP " +
      resposta.getResponseCode()
    );

  }


  const remoto = JSON.parse(
    resposta.getContentText()
  );

  if (
    remoto.status !== "CHAVE_CARREGADA" ||
    remoto.idChave !== "QC-10-V1" ||
    remoto.assinaturaPermitida !== false
  ) {
    throw new Error("Resposta inesperada do Worker.");
  }

  const aba = SpreadsheetApp
    .getActiveSpreadsheet()
    .getSheetByName("QC_ChavesAssinatura");

  if (!aba) {
    throw new Error("Aba de chaves não encontrada.");
  }

  const dados = aba.getDataRange().getDisplayValues();
  const cab = dados[0].map(v => String(v).trim());
  const col = nome => cab.indexOf(nome);

  const campos = [
    "IdChave", "Denominacao", "Versao",
    "Status", "ModuloPublico", "ExpoentePublico"
  ];

  if (campos.some(nome => col(nome) === -1)) {
    throw new Error("Colunas de chave incompletas.");
  }

  const linhas = dados.slice(1).filter(r =>
    String(r[col("IdChave")]).trim() === "QC-10-V1"
  );

  if (linhas.length !== 1) {
    throw new Error("Chave pública ausente ou duplicada.");
  }

  const chave = linhas[0];

  if (
    Number(chave[col("Denominacao")]) !== 10 ||
    Number(chave[col("Versao")]) !== 1 ||
    String(chave[col("Status")]).trim()
      !== "AGUARDANDO_CHAVE"
  ) {
    throw new Error("Cadastro da chave inconsistente.");
  }

  const moduloLocal = String(
    chave[col("ModuloPublico")]
  ).trim().toLowerCase();

  const moduloRemoto = String(
    remoto.moduloPublico || ""
  ).trim().toLowerCase();

  const expoenteLocal = String(
    chave[col("ExpoentePublico")]
  ).trim().toLowerCase().replace(/^0+/, "");

  const expoenteRemoto = String(
    remoto.expoentePublico || ""
  ).trim().toLowerCase().replace(/^0+/, "");

  if (
    moduloLocal !== moduloRemoto ||
    expoenteLocal !== expoenteRemoto ||
    moduloLocal.length !== 1024 ||
    expoenteLocal !== "10001"
  ) {
    throw new Error(
      "A chave privada instalada não corresponde à pública."
    );
  }

  Logger.log("CHAVE PRIVADA NA CLOUDFLARE: CARREGADA");
  Logger.log("CHAVE PÚBLICA NA PLANILHA: CONFERE");
  Logger.log("RSA 4096 BITS: OK");
  Logger.log("QC-10-V1: CORRESPONDÊNCIA CONFIRMADA");
  Logger.log("ASSINATURAS: BLOQUEADAS");
}


function QC_assinarFichaCarteira190(
  tokenSessao, idEmissao, idOperacao, blocoHex, denominacao
) {
  const emissaoId = String(idEmissao || "").trim();
  const operacaoId = String(idOperacao || "").trim();
  const bloco = String(blocoHex || "").trim().toLowerCase();
  const valorFicha = Number(denominacao);
  if (![1, 2, 5, 10, 50].includes(valorFicha)) {
    throw new Error("Denominacao V2 nao permitida.");
  }
  // PASSO 363: nenhum pedido de assinatura V1 pode entrar pela rota atual.
  const idChave = "QC-" + valorFicha + "-V2";
  const uuid = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;

  if (
    !uuid.test(operacaoId) ||
    !/^QC-EM-[0-9a-f-]{36}$/i.test(emissaoId) ||
    !/^[0-9a-f]{1024}$/.test(bloco)
  ) {
    throw new Error("Identificadores ou bloco cego inválidos.");
  }

  QC_exigirPrimeiraEmissaoV2375(emissaoId);
  const props = PropertiesService.getScriptProperties();

  // PASSO 298 - Aceitar emissões devidamente autorizadas pelo tesoureiro.
  // Mantém o bloqueio geral QC_EMISSAO_REAL_ATIVA e todas as validações abaixo.

  // PASSO 363: triplo bloqueio independentemente da requisicao recebida.
  // Worker do passo 357 TAMBEM continua bloqueando assinatura em codigo.
  if (props.getProperty('QC_V2_MODO') !== 'TESTE' ||
      props.getProperty('QC_V2_TESTES_LIBERADOS') !== 'SIM' ||
      props.getProperty("QC_EMISSAO_REAL_ATIVA") !== "SIM" ||
      props.getProperty("QC_V2_RECEBIMENTO_ATIVO") !== "SIM" ||
      props.getProperty("QC_V1_FINANCEIRO_ENCERRADO") !== "SIM") {
    return { status: "ASSINATURA_BLOQUEADA", assinaturaPermitida: false };
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    const sessao = QC_validarTokenSessaoTeste(tokenSessao);

    if (sessao.status !== "OK") {
      throw new Error("Sessão expirada.");
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();

    function ler(nome, nomes) {
      const aba = ss.getSheetByName(nome);
      if (!aba) throw new Error("Aba ausente: " + nome);

      const linhas = aba.getDataRange().getValues();
      const cab = linhas[0].map(v => String(v).trim());
      const col = n => cab.indexOf(n);

      if (nomes.some(n => col(n) < 0)) {
        throw new Error("Colunas inválidas: " + nome);
      }

      return { aba, linhas, col };
    }

    const car = ler("QC_Carteiras", [
      "IdCarteira", "IdCadastro", "Status",
      "Ambiente", "AlgoritmoSenha"
    ]);

    const aut = ler("QC_Autorizacoes", [
      "IdAutorizacao", "IdCadastro", "Status",
      "IdEmissao", "AutorizadaPor", "DataAutorizacao"
    ]);

    const emi = ler("QC_Emissoes", [
      "IdEmissao", "IdAutorizacao",
      "Status", "DataConclusao"
    ]);

    const cot = ler("QC_CotasEmissao", [
      "IdCota", "IdEmissao", "Denominacao", "IdChave",
      "QuantidadePermitida", "QuantidadeAssinada", "Status"
    ]);

    const ops = ler("QC_OperacoesAssinatura", [
      "IdOperacao", "IdEmissao", "IdCota",
      "HashBlocoCego", "Status", "AssinaturaCegaHex",
      "DataReserva", "DataAssinatura"
    ]);

    function somenteUma(tab, pred, mensagem) {
      const encontradas = tab.linhas
        .map((r, i) => ({ r, linha: i + 1 }))
        .filter((v, i) => i > 0 && pred(v.r));

      if (encontradas.length !== 1) {
        throw new Error(mensagem);
      }

      return encontradas[0];
    }

    // Identificar o proprietário da sessão.
    const dono = somenteUma(car, r =>
      String(r[car.col("IdCarteira")]).trim() ===
        sessao.idCarteira &&
      String(r[car.col("Status")]).trim() === "ATIVA" &&
      String(r[car.col("Ambiente")]).trim() === "PRODUCAO" &&
      String(r[car.col("AlgoritmoSenha")]).trim() ===
        "PBKDF2_V2",
      "Carteira não autorizada."
    );

    // Localizar a emissão e sua autorização.
    const emissao = somenteUma(emi, r =>
      String(r[emi.col("IdEmissao")]).trim() === emissaoId,
      "Emissão inexistente ou duplicada."
    );

    const autId = String(
      emissao.r[emi.col("IdAutorizacao")]
    ).trim();

    if (emissaoId !== "QC-EM-" + autId) {
      throw new Error("Vínculo da emissão inválido.");
    }

    const autorizacao = somenteUma(aut, r =>
      String(r[aut.col("IdAutorizacao")]).trim() === autId,
      "Autorização ausente ou duplicada."
    );

    if (
      String(autorizacao.r[aut.col("IdCadastro")]).trim() !==
        String(dono.r[car.col("IdCadastro")]).trim() ||
      String(autorizacao.r[aut.col("Status")]).trim() !==
        "AUTORIZADA" ||
      String(autorizacao.r[aut.col("IdEmissao")]).trim() !==
        emissaoId ||
      !autorizacao.r[aut.col("AutorizadaPor")] ||
      !autorizacao.r[aut.col("DataAutorizacao")]
    ) {
      throw new Error(
        "Autorização não pertence à carteira ou não foi aprovada."
      );
    }

    // Selecionar somente a cota da denominação autorizada.
    // QC_localizarCota220 valida o vínculo e a chave pública.
    const informacoesCota = QC_localizarCota220(
      emissaoId, valorFicha
    );

    const idCota = informacoesCota.idCota;

    const cota = somenteUma(cot, r =>
      String(r[cot.col("IdCota")]).trim() === idCota &&
      String(r[cot.col("IdEmissao")]).trim() === emissaoId,
      "Cota de " + valorFicha + " QC ausente ou duplicada."
    );

    if (
      Number(cota.r[cot.col("Denominacao")]) !== valorFicha ||
      String(cota.r[cot.col("IdChave")]).trim() !== idChave ||
      informacoesCota.idChave !== idChave ||
      informacoesCota.statusChave !== "ATIVA"
    ) {
      throw new Error("Chave ou cota incorreta ou não ativada.");
    }

    const nHex = informacoesCota.moduloHex;
    const eHex = informacoesCota.expoenteHex;

    if (
      !QC_validarBlocoCego178(
        bloco, nHex, eHex
      ).formatoValido
    ) {
      throw new Error("Bloco RSA inválido.");
    }

    const hash = QC_calcularHash(bloco);
    const todos = ops.linhas.slice(1);

    // Impedir que um mesmo IdOperacao seja reutilizado
    // com outro bloco ou outra cota.
    const anteriores = todos
      .map((r, i) => ({ r, linha: i + 2 }))
      .filter(o =>
        String(o.r[ops.col("IdOperacao")]).trim() ===
          operacaoId
      );

    if (anteriores.length > 1) {
      throw new Error("Operação duplicada.");
    }

    if (todos.some(r =>
      String(r[ops.col("HashBlocoCego")]).trim() === hash &&
      String(r[ops.col("IdOperacao")]).trim() !== operacaoId
    )) {
      throw new Error("Bloco cego já reservado.");
    }

    let linhaOp;

    if (anteriores.length) {
      const atual = anteriores[0];

      if (
        String(atual.r[ops.col("IdEmissao")]).trim() !== emissaoId ||
        String(atual.r[ops.col("IdCota")]).trim() !== idCota ||
        String(atual.r[ops.col("HashBlocoCego")]).trim() !== hash
      ) {
        throw new Error("Repetição com dados diferentes.");
      }

      const st = String(
        atual.r[ops.col("Status")]
      ).trim();

      // Operação concluída: devolver a mesma assinatura.
      if (st === "CONCLUIDA") {
        return {
          status: "ASSINADO",
          idOperacao: operacaoId,
          idChave: idChave,
          assinaturaCegaHex: String(
            atual.r[ops.col("AssinaturaCegaHex")]
          ).trim()
        };
      }

      if (st !== "RESERVADA") {
        throw new Error("Estado inesperado da operação.");
      }

      linhaOp = atual.linha;

    } else {
      if (
        String(emissao.r[emi.col("Status")]).trim() !==
          "AGUARDANDO_ASSINATURA" ||
        String(cota.r[cot.col("Status")]).trim() !== "PLANEJADA"
      ) {
        throw new Error("Emissão ou cota indisponível.");
      }

      const destaCota = todos.filter(r =>
        String(r[ops.col("IdCota")]).trim() === idCota
      );

      if (destaCota.some(r =>
        !["RESERVADA", "CONCLUIDA"].includes(
          String(r[ops.col("Status")]).trim()
        )
      )) {
        throw new Error("Operações inconsistentes.");
      }

      const permitido = Number(
        cota.r[cot.col("QuantidadePermitida")]
      );

      const assinadas = Number(
        cota.r[cot.col("QuantidadeAssinada")]
      );

      const concluidas = destaCota.filter(r =>
        String(r[ops.col("Status")]).trim() === "CONCLUIDA"
      ).length;

      if (
        !Number.isSafeInteger(permitido) ||
        permitido <= 0 ||
        !Number.isSafeInteger(assinadas) ||
        assinadas > concluidas ||
        destaCota.length >= permitido
      ) {
        throw new Error("Cota esgotada ou contadores inconsistentes.");
      }

      // Corrigir contador atrasado após interrupção.
      if (assinadas < concluidas) {
        cot.aba.getRange(
          cota.linha,
          cot.col("QuantidadeAssinada") + 1
        ).setValue(concluidas);
        SpreadsheetApp.flush();
      }

      // Reservar ANTES de chamar o Worker.
      ops.aba.appendRow([
        operacaoId,
        emissaoId,
        idCota,
        hash,
        "RESERVADA",
        "",
        new Date(),
        ""
      ]);

      SpreadsheetApp.flush();
      linhaOp = ops.aba.getLastRow();
    }

    // Autenticação servidor a servidor.
    const tokenWorker = props.getProperty("QC_WORKER_TOKEN");

    if (!/^[0-9a-f]{64}$/.test(tokenWorker || "")) {
      throw new Error("Worker não configurado.");
    }

    const resp = UrlFetchApp.fetch(
      "https://quintoscoin-assinador-teste.lojatiradentesii71.workers.dev/interno/assinar",
      {
        method: "post",
        contentType: "application/json",
        headers: {
          Authorization: "Bearer " + tokenWorker
        },
        payload: JSON.stringify({
          idOperacao: operacaoId,
          idEmissao: emissaoId,
          idCota: idCota,
          idChave: idChave,
          blocoHex: bloco
        }),
        muteHttpExceptions: true
      }
    );

    if (resp.getResponseCode() !== 200) {
      throw new Error(
        "Assinatura indisponível. HTTP " +
        resp.getResponseCode()
      );
    }

    const dados = JSON.parse(resp.getContentText());

    const assinatura = String(
      dados.assinaturaCegaHex || ""
    ).toLowerCase();

    if (
      dados.status !== "ASSINADO" ||
      dados.idOperacao !== operacaoId ||
      dados.idEmissao !== emissaoId ||
      dados.idCota !== idCota ||
      dados.idChave !== idChave ||
      !/^[0-9a-f]{1024}$/.test(assinatura)
    ) {
      throw new Error("Resposta de assinatura inesperada.");
    }

    // Conferir a operação RSA antes de gravar:
    // assinatura^expoente mod modulo = bloco cego.
    const n = BigInt("0x" + nHex);
    let expoente = BigInt("0x" + eHex);
    let base = BigInt("0x" + assinatura) % n;
    let resultado = BigInt(1);

    while (expoente > BigInt(0)) {
      if (expoente % BigInt(2) === BigInt(1)) {
        resultado = (resultado * base) % n;
      }

      base = (base * base) % n;
      expoente = expoente / BigInt(2);
    }

    if (resultado !== BigInt("0x" + bloco)) {
      throw new Error("Assinatura RSA não confere.");
    }

    // Registrar a assinatura e concluir a operação.
    ops.aba.getRange(
      linhaOp,
      ops.col("AssinaturaCegaHex") + 1
    ).setValue(assinatura);

    ops.aba.getRange(
      linhaOp,
      ops.col("DataAssinatura") + 1
    ).setValue(new Date());

    ops.aba.getRange(
      linhaOp,
      ops.col("Status") + 1
    ).setValue("CONCLUIDA");

    SpreadsheetApp.flush();

    const concluidasAntes = todos.filter(r =>
      String(r[ops.col("IdCota")]).trim() === idCota &&
      String(r[ops.col("Status")]).trim() === "CONCLUIDA"
    ).length;

    const novas = concluidasAntes + 1;

    cot.aba.getRange(
      cota.linha,
      cot.col("QuantidadeAssinada") + 1
    ).setValue(novas);

    if (
      novas === Number(
        cota.r[cot.col("QuantidadePermitida")]
      )
    ) {
      cot.aba.getRange(
        cota.linha,
        cot.col("Status") + 1
      ).setValue("CONCLUIDA");

      // Encerrar emissão quando todas as cotas concluírem.
      const outrasCotas = cot.linhas.slice(1).filter(r =>
        String(r[cot.col("IdEmissao")]).trim() === emissaoId &&
        String(r[cot.col("IdCota")]).trim() !== idCota
      );

      if (outrasCotas.every(r =>
        String(r[cot.col("Status")]).trim() === "CONCLUIDA"
      )) {
        emi.aba.getRange(
          emissao.linha,
          emi.col("DataConclusao") + 1
        ).setValue(new Date());

        emi.aba.getRange(
          emissao.linha,
          emi.col("Status") + 1
        ).setValue("CONCLUIDA");
      }
    }

    SpreadsheetApp.flush();

    return {
      status: "ASSINADO",
      idOperacao: operacaoId,
      idChave: idChave,
      assinaturaCegaHex: assinatura
    };

  } finally {
    lock.releaseLock();
  }
}


function QC_listarSolicitacoesCarteira191(tokenSessao) {

  const sessao = QC_validarTokenSessaoTeste(tokenSessao);

  if (!sessao || sessao.status !== "OK") {
    return { status: "SESSAO_INVALIDA", solicitacoes: [] };
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const car = ss.getSheetByName("QC_Carteiras");
  const aut = ss.getSheetByName("QC_Autorizacoes");

  if (!car || !aut) {
    throw new Error("Tabelas da carteira não encontradas.");
  }

  const dCar = car.getDataRange().getValues();
  const dAut = aut.getDataRange().getValues();

  const hCar = dCar[0].map(v => String(v).trim());
  const hAut = dAut[0].map(v => String(v).trim());

  const c = nome => hCar.indexOf(nome);
  const a = nome => hAut.indexOf(nome);

  if (
    ["IdCarteira", "IdCadastro", "Status",
     "Ambiente", "AlgoritmoSenha"].some(n => c(n) < 0) ||
    ["IdAutorizacao", "IdCadastro", "Valor",
     "Status", "IdEmissao"].some(n => a(n) < 0)
  ) {
    throw new Error("Cabeçalhos das tabelas inconsistentes.");
  }

  const donas = dCar.slice(1).filter(r =>
    String(r[c("IdCarteira")]).trim() === sessao.idCarteira &&
    String(r[c("Status")]).trim().toUpperCase() === "ATIVA" &&
    String(r[c("Ambiente")]).trim().toUpperCase() === "PRODUCAO" &&
    String(r[c("AlgoritmoSenha")]).trim().toUpperCase() ===
      "PBKDF2_V2"
  );

  if (donas.length !== 1) {
    return {
      status: "CARTEIRA_NAO_AUTORIZADA",
      solicitacoes: []
    };
  }

  const idCadastro = String(
    donas[0][c("IdCadastro")]
  ).trim();

  const solicitacoes = dAut.slice(1)
    .filter(r =>
      String(r[a("IdCadastro")]).trim() === idCadastro
    )
    .reverse()
    .map(r => ({
      idAutorizacao: String(
        r[a("IdAutorizacao")] || ""
      ).trim(),
      valor: Number(r[a("Valor")]),
      status: String(
        r[a("Status")] || ""
      ).trim().toUpperCase(),
      idEmissao: String(
        r[a("IdEmissao")] || ""
      ).trim()
    }));

  return {
    status: "OK",
    solicitacoes: solicitacoes
  };

}


function QC_localizarCarteira192(consulta) {

  const idCadastro = String(consulta?.idCadastro || "").trim();
  const idCarteira = String(consulta?.idCarteira || "").trim();

  if (
    (!idCadastro && !idCarteira) ||
    (idCadastro && idCarteira) ||
    idCadastro.length > 100 ||
    idCarteira.length > 100
  ) {
    return {
      status: "ERRO",
      mensagem: "Informe somente um identificador."
    };
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const abaCarteiras = ss.getSheetByName("QC_Carteiras");
  const abaCadastro = ss.getSheetByName("Cadastro");

  if (!abaCarteiras || !abaCadastro) {
    throw new Error("Abas QC_Carteiras ou Cadastro ausentes.");
  }

  const linhas = abaCarteiras.getDataRange().getDisplayValues();
  const cab = linhas[0].map(v => String(v).trim());
  const col = nome => cab.indexOf(nome);

  const campos = [
    "IdCarteira", "IdCadastro", "Status",
    "Ambiente", "AlgoritmoSenha"
  ];

  if (campos.some(campo => col(campo) < 0)) {
    throw new Error("Colunas de QC_Carteiras incompletas.");
  }

  const encontradas = linhas.slice(1).filter(r =>
    (idCadastro
      ? String(r[col("IdCadastro")]).trim() === idCadastro
      : String(r[col("IdCarteira")]).trim() === idCarteira) &&
    String(r[col("Status")]).trim().toUpperCase() === "ATIVA" &&
    String(r[col("Ambiente")]).trim().toUpperCase() === "PRODUCAO" &&
    String(r[col("AlgoritmoSenha")]).trim().toUpperCase() === "PBKDF2_V2"
  );

  if (encontradas.length !== 1) {
    return {
      status: "NAO_ENCONTRADA",
      mensagem: "Não existe uma carteira ativa para esse cadastro."
    };
  }

  const carteira = encontradas[0];
  const cadastroReal = String(
    carteira[col("IdCadastro")]
  ).trim();

  const dadosCadastro = abaCadastro.getDataRange().getDisplayValues();
  const cabCadastro = dadosCadastro[0].map(v => String(v).trim());

  const colId = cabCadastro.indexOf("IdCadastro");

  const colNome = [
    "Nome", "NomeCompleto", "Irmao", "IRMAO"
  ]
    .map(nome => cabCadastro.indexOf(nome))
    .find(indice => indice >= 0);

  if (colId < 0 || colNome === undefined) {
    throw new Error("Colunas de identificação do Cadastro incompletas.");
  }

  const membros = dadosCadastro.slice(1).filter(r =>
    String(r[colId]).trim() === cadastroReal
  );

  if (membros.length !== 1) {
    return {
      status: "NAO_ENCONTRADA",
      mensagem: "Cadastro não localizado."
    };
  }

  return {
    status: "OK",
    idCarteira: String(carteira[col("IdCarteira")]).trim(),
    nome: String(membros[0][colNome] || "").trim()
  };
}



function QC_obterChavePublicaCarteira194(
  tokenSessao, denominacao = 10
) {
  const valor = Number(denominacao);

  if (![2, 5, 10].includes(valor)) {
    throw new Error("Denominação não permitida.");
  }

  const sessao = QC_validarTokenSessaoTeste(tokenSessao);

  if (sessao.status !== "OK") {
    return { status: "SESSAO_INVALIDA" };
  }

  const idChave = "QC-" + valor + "-V1";

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const aba = ss.getSheetByName("QC_ChavesAssinatura");

  if (!aba) {
    throw new Error("QC_ChavesAssinatura não encontrada.");
  }

  const dados = aba.getDataRange().getDisplayValues();
  const cab = dados[0].map(v => String(v).trim());
  const col = nome => cab.indexOf(nome);

  const obrigatorias = [
    "IdChave",
    "Denominacao",
    "Versao",
    "Status",
    "ModuloPublico",
    "ExpoentePublico"
  ];

  if (obrigatorias.some(nome => col(nome) < 0)) {
    throw new Error("Colunas de chaves inválidas.");
  }

  const chaves = dados.slice(1).filter(linha =>
    String(linha[col("IdChave")]).trim() === idChave
  );

  if (chaves.length !== 1) {
    return {
      status: "CHAVE_INDISPONIVEL",
      denominacao: valor,
      idChave
    };
  }

  const chave = chaves[0];

  const statusChave = String(
    chave[col("Status")]
  ).trim();

  if (
    Number(chave[col("Denominacao")]) !== valor ||
    Number(chave[col("Versao")]) !== 1 ||
    !["AGUARDANDO_CHAVE", "ATIVA"].includes(statusChave)
  ) {
    return {
      status: "CHAVE_INDISPONIVEL",
      denominacao: valor,
      idChave
    };
  }

  const moduloHex = String(
    chave[col("ModuloPublico")]
  ).trim().toLowerCase();

  const expoenteHex = String(
    chave[col("ExpoentePublico")]
  ).trim().toLowerCase();

  // Validar os parâmetros RSA antes de fornecê-los.
  const validacao = QC_validarParametrosRSA170(
    moduloHex, expoenteHex
  );

  if (
    validacao.status !== "FORMATO_VALIDO" ||
    !/^[89a-f][0-9a-f]{1023}$/.test(moduloHex) ||
    !/^0*10001$/.test(expoenteHex)
  ) {
    return {
      status: "CHAVE_INDISPONIVEL",
      denominacao: valor,
      idChave
    };
  }

  return {
    status: "OK",
    idChave,
    denominacao: valor,
    moduloHex,
    expoenteHex,
    assinaturaPermitida: false
  };
}



function QC_conferirAssinador196() {

  const token = PropertiesService
    .getScriptProperties()
    .getProperty("QC_WORKER_TOKEN");

  if (!/^[0-9a-f]{64}$/.test(token || "")) {
    throw new Error("Token do Worker não configurado.");
  }

  const url =
    "https://quintoscoin-assinador-teste.lojatiradentesii71.workers.dev/interno/autoverificar-196";

  const resposta = UrlFetchApp.fetch(url, {
    method: "post",
    headers: {
      Authorization: "Bearer " + token
    },
    muteHttpExceptions: true
  });

  Logger.log(
    "HTTP: " + resposta.getResponseCode()
  );

  Logger.log(
    "RESULTADO: " + resposta.getContentText()
  );

}


function QC_conferirChaves218() {

  const token = PropertiesService
    .getScriptProperties()
    .getProperty("QC_WORKER_TOKEN");

  const aba = SpreadsheetApp
    .getActiveSpreadsheet()
    .getSheetByName("QC_ChavesAssinatura");

  if (!aba || !/^[0-9a-f]{64}$/.test(token || "")) {
    throw new Error("Planilha ou token não configurado.");
  }

  const dados = aba.getDataRange().getDisplayValues();
  const cab = dados[0].map(v => String(v).trim());
  const col = nome => cab.indexOf(nome);

  const campos = [
    "IdChave", "ModuloPublico", "ExpoentePublico"
  ];

  if (campos.some(nome => col(nome) < 0)) {
    throw new Error("Cabeçalhos incompletos.");
  }

  const url =
    "https://quintoscoin-assinador-teste.lojatiradentesii71.workers.dev/interno/conferir-chaves-218";

  let conferidas = 0;

  for (const id of ["QC-2-V1", "QC-5-V1"]) {

    const linhas = dados.slice(1).filter(r =>
      String(r[col("IdChave")]).trim() === id
    );

    if (linhas.length !== 1) {
      throw new Error("Cadastro inválido: " + id);
    }

    const modulo = String(
      linhas[0][col("ModuloPublico")]
    ).trim().toLowerCase();

    const expoente = String(
      linhas[0][col("ExpoentePublico")]
    ).trim().toLowerCase();

    if (
      !/^[89a-f][0-9a-f]{1023}$/.test(modulo) ||
      expoente !== "010001"
    ) {
      throw new Error(
        id + ": chave pública ausente ou inválida."
      );
    }

    const resposta = UrlFetchApp.fetch(url, {
      method: "post",
      contentType: "application/json",
      headers: {
        Authorization: "Bearer " + token
      },
      payload: JSON.stringify({
        idChave: id,
        moduloHex: modulo,
        expoenteHex: expoente
      }),
      muteHttpExceptions: true
    });

    const resultado = JSON.parse(
      resposta.getContentText()
    );

    Logger.log(
      id + ": " + resultado.status
    );

    if (
      resposta.getResponseCode() === 200 &&
      resultado.idChave === id &&
      resultado.status === "CHAVE_CONFERE"
    ) {
      conferidas++;
    }

  }

  Logger.log(
    "CHAVES VALIDADAS: " + conferidas + "/2"
  );

  if (conferidas !== 2) {
    throw new Error(
      "Uma ou mais chaves não conferem."
    );
  }

  Logger.log(
    "ASSINATURAS PERMANECEM DESATIVADAS"
  );

}


function QC_localizarCota220(idEmissao, denominacao) {

  const id = String(idEmissao || "").trim();
  const valor = Number(denominacao);

  if (!/^QC-EM-[0-9a-f-]{36}$/i.test(id)) {
    throw new Error("Identificador de emissão inválido.");
  }

  if (![1, 2, 5, 10, 50].includes(valor)) {
    throw new Error("Denominação não permitida.");
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();

  function tabela(nome, campos) {
    const aba = ss.getSheetByName(nome);
    if (!aba) throw new Error("Aba ausente: " + nome);

    const dados = aba.getDataRange().getValues();
    const cab = dados[0].map(v => String(v).trim());
    const col = nome => cab.indexOf(nome);

    if (campos.some(campo => col(campo) < 0)) {
      throw new Error("Cabeçalhos inválidos: " + nome);
    }

    return { dados, col };
  }

  const cotas = tabela("QC_CotasEmissao", [
    "IdCota", "IdEmissao", "Denominacao",
    "IdChave", "QuantidadePermitida",
    "QuantidadeAssinada", "Status"
  ]);

  const chaves = tabela("QC_ChavesAssinatura", [
    "IdChave", "Denominacao", "Versao",
    "Status", "ModuloPublico", "ExpoentePublico"
  ]);

  const idCota = id + "-" + valor;
  const idChave = "QC-" + valor + "-V2";

  const encontradas = cotas.dados.slice(1).filter(r =>
    String(r[cotas.col("IdCota")]).trim() === idCota
  );

  if (encontradas.length !== 1) {
    throw new Error("Cota ausente ou duplicada: " + idCota);
  }

  const registro = encontradas[0];

  if (
    String(registro[cotas.col("IdEmissao")]).trim() !== id ||
    Number(registro[cotas.col("Denominacao")]) !== valor ||
    String(registro[cotas.col("IdChave")]).trim() !== idChave
  ) {
    throw new Error("Denominação e cota não correspondem.");
  }

  const permitidas = Number(
    registro[cotas.col("QuantidadePermitida")]
  );

  const assinadas = Number(
    registro[cotas.col("QuantidadeAssinada")]
  );

  if (
    !Number.isInteger(permitidas) ||
    !Number.isInteger(assinadas) ||
    permitidas < 1 ||
    assinadas < 0 ||
    assinadas > permitidas
  ) {
    throw new Error("Contadores da cota inconsistentes.");
  }

  const linhasChave = chaves.dados.slice(1).filter(r =>
    String(r[chaves.col("IdChave")]).trim() === idChave
  );

  if (linhasChave.length !== 1) {
    throw new Error("Chave ausente ou duplicada: " + idChave);
  }

  const registroChave = linhasChave[0];

  if (
    Number(registroChave[chaves.col("Denominacao")]) !== valor ||
    Number(registroChave[chaves.col("Versao")]) !== 2
  ) {
    throw new Error("Cadastro da chave inconsistente.");
  }

  const moduloHex = String(
    registroChave[chaves.col("ModuloPublico")]
  ).trim().toLowerCase();

  const expoenteHex = String(
    registroChave[chaves.col("ExpoentePublico")]
  ).trim().toLowerCase();

  if (
    !/^[89a-f][0-9a-f]{1023}$/.test(moduloHex) ||
    expoenteHex !== "010001"
  ) {
    throw new Error("Chave pública inválida.");
  }

  const statusCota = String(
    registro[cotas.col("Status")]
  ).trim().toUpperCase();

  const statusChave = String(
    registroChave[chaves.col("Status")]
  ).trim().toUpperCase();

  return {
    idCota,
    idEmissao: id,
    denominacao: valor,
    idChave,
    moduloHex,
    expoenteHex,
    quantidadePermitida: permitidas,
    quantidadeAssinada: assinadas,
    quantidadeRestante: permitidas - assinadas,
    statusCota,
    statusChave,
    cotaElegivel:
      statusChave === "ATIVA" &&
      statusCota === "PLANEJADA" &&
      assinadas < permitidas
  };

}


function QC_testarPlano230() {

  const plano = QC_planejarCotasEmissao(
    17,
    "TESTE_PLANEJAMENTO_230",
    false
  );

  const esperado = {
    10: 1,
    5: 1,
    2: 1
  };

  if (
    plano.valorAutorizado !== 17 ||
    plano.totalCalculado !== 17 ||
    plano.quantidadeFichas !== 3 ||
    plano.cotas.length !== 3
  ) {
    throw new Error("Planejamento incorreto.");
  }

  for (const cota of plano.cotas) {
    if (
      esperado[cota.denominacao] !==
        cota.quantidadePermitida ||
      cota.quantidadeAssinada !== 0 ||
      cota.status !== "PLANEJADA" ||
      cota.idChave !==
        "QC-" + cota.denominacao + "-V1"
    ) {
      throw new Error("Cota incorreta.");
    }

    Logger.log(
      cota.quantidadePermitida +
      " ficha de " + cota.denominacao + " QC: OK"
    );
  }

  Logger.log("PASSO 230: APROVADO");
  Logger.log("TOTAL: 17 QC");
  Logger.log("NENHUMA EMISSAO GRAVADA");
}


function QC_validarPiloto234() {

  // COLE AQUI o IdEmissao da nova emissão de 17 QC.
  const idEmissao = "QC-EM-2c3ffba3-c84c-4703-8f09-2147907e4ab9";

  if (!/^QC-EM-[0-9a-f-]{36}$/i.test(idEmissao)) {
    throw new Error("Informe o IdEmissao válido.");
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();

  function ler(nome, campos) {
    const aba = ss.getSheetByName(nome);

    if (!aba) {
      throw new Error("Aba ausente: " + nome);
    }

    const dados = aba.getDataRange().getValues();
    const cab = dados[0].map(v => String(v).trim());
    const col = nomeColuna => cab.indexOf(nomeColuna);

    if (campos.some(c => col(c) < 0)) {
      throw new Error("Colunas ausentes: " + nome);
    }

    return {
      linhas: dados.slice(1),
      col
    };
  }

  function unica(tabela, campo, valor) {
    const encontradas = tabela.linhas.filter(linha =>
      String(linha[tabela.col(campo)]).trim() === valor
    );

    if (encontradas.length !== 1) {
      throw new Error("Registro ausente ou duplicado: " + campo);
    }

    return encontradas[0];
  }

  const emi = ler("QC_Emissoes", [
    "IdEmissao", "IdAutorizacao", "ValorAutorizado",
    "QuantidadeFichas", "Status"
  ]);

  const aut = ler("QC_Autorizacoes", [
    "IdAutorizacao", "IdEmissao", "Valor",
    "Status", "AutorizadaPor", "DataAutorizacao"
  ]);

  const cot = ler("QC_CotasEmissao", [
    "IdCota", "IdEmissao", "Denominacao",
    "IdChave", "QuantidadePermitida",
    "QuantidadeAssinada", "Status"
  ]);

  const chaves = ler("QC_ChavesAssinatura", [
    "IdChave", "Status"
  ]);

  const ops = ler("QC_OperacoesAssinatura", [
    "IdEmissao"
  ]);

  const emissao = unica(emi, "IdEmissao", idEmissao);
  const idAutorizacao = String(
    emissao[emi.col("IdAutorizacao")]
  ).trim();

  if (
    idEmissao !== "QC-EM-" + idAutorizacao ||
    Number(emissao[emi.col("ValorAutorizado")]) !== 17 ||
    Number(emissao[emi.col("QuantidadeFichas")]) !== 3 ||
    String(emissao[emi.col("Status")]).trim() !==
      "AGUARDANDO_ASSINATURA"
  ) {
    throw new Error("Dados da emissão inconsistentes.");
  }

  Logger.log("EMISSÃO DE 17 QC: OK");

  const autorizacao = unica(
    aut, "IdAutorizacao", idAutorizacao
  );

  if (
    String(autorizacao[aut.col("IdEmissao")]).trim() !==
      idEmissao ||
    Number(autorizacao[aut.col("Valor")]) !== 17 ||
    String(autorizacao[aut.col("Status")]).trim() !==
      "AUTORIZADA" ||
    !autorizacao[aut.col("AutorizadaPor")] ||
    !autorizacao[aut.col("DataAutorizacao")]
  ) {
    throw new Error("Autorização inconsistente.");
  }

  Logger.log("AUTORIZAÇÃO: OK");

  const cotas = cot.linhas.filter(linha =>
    String(linha[cot.col("IdEmissao")]).trim() ===
      idEmissao
  );

  if (cotas.length !== 3) {
    throw new Error("Quantidade de cotas incorreta.");
  }

  for (const valor of [10, 5, 2]) {

    const encontradas = cotas.filter(linha =>
      Number(linha[cot.col("Denominacao")]) === valor
    );

    if (encontradas.length !== 1) {
      throw new Error("Cota de " + valor + " QC incorreta.");
    }

    const cota = encontradas[0];
    const idChave = "QC-" + valor + "-V1";

    if (
      String(cota[cot.col("IdCota")]).trim() !==
        idEmissao + "-" + valor ||
      String(cota[cot.col("IdChave")]).trim() !== idChave ||
      Number(cota[cot.col("QuantidadePermitida")]) !== 1 ||
      Number(cota[cot.col("QuantidadeAssinada")]) !== 0 ||
      String(cota[cot.col("Status")]).trim() !== "PLANEJADA"
    ) {
      throw new Error("Dados da cota incorretos.");
    }

    const chave = unica(chaves, "IdChave", idChave);

    if (
      String(chave[chaves.col("Status")]).trim() !== "ATIVA"
    ) {
      throw new Error("Chave não está ativa: " + idChave);
    }

    Logger.log("COTA " + valor + " QC: OK");
  }

  const operacoes = ops.linhas.filter(linha =>
    String(linha[ops.col("IdEmissao")]).trim() ===
      idEmissao
  );

  if (operacoes.length !== 0) {
    throw new Error("A emissão já possui operações.");
  }

  Logger.log("NENHUMA ASSINATURA SOLICITADA: OK");

  const props = PropertiesService.getScriptProperties();

  if (
    props.getProperty("QC_EMISSAO_REAL_ATIVA") !== "NAO"
  ) {
    throw new Error("Bloqueio geral inesperado.");
  }

  if (
    !props.getProperty("QC_EMISSAO_PILOTO_ID") ||
    props.getProperty("QC_EMISSAO_PILOTO_ID") === idEmissao
  ) {
    throw new Error("Verificar configuração do piloto.");
  }

  Logger.log("BLOQUEIOS DE EMISSÃO: OK");
  Logger.log("PASSO 234: APROVADO");
  Logger.log("NENHUM DADO ALTERADO");
}


function QC_testarBloqueios238() {

  const props = PropertiesService.getScriptProperties();

  const ativo = String(
    props.getProperty("QC_EMISSAO_REAL_ATIVA") || ""
  ).trim();

  const idEmissao = String(
    props.getProperty("QC_EMISSAO_PILOTO_ID") || ""
  ).trim();

  if (ativo !== "NAO") {
    throw new Error(
      "TESTE CANCELADO: emissão real não está bloqueada."
    );
  }

  if (!/^QC-EM-[0-9a-f-]{36}$/i.test(idEmissao)) {
    throw new Error("Id da emissão piloto inválido.");
  }

  const aba = SpreadsheetApp
    .getActiveSpreadsheet()
    .getSheetByName("QC_Emissoes");

  if (!aba) {
    throw new Error("Aba QC_Emissoes ausente.");
  }

  const dados = aba.getDataRange().getValues();
  const cab = dados[0].map(v => String(v).trim());
  const col = nome => cab.indexOf(nome);

  if ([
    "IdEmissao", "ValorAutorizado", "Status"
  ].some(nome => col(nome) < 0)) {
    throw new Error("Colunas da emissão ausentes.");
  }

  const emissoes = dados.slice(1).filter(linha =>
    String(linha[col("IdEmissao")]).trim() === idEmissao
  );

  if (
    emissoes.length !== 1 ||
    Number(emissoes[0][col("ValorAutorizado")]) !== 17 ||
    String(emissoes[0][col("Status")]).trim() !==
      "AGUARDANDO_ASSINATURA"
  ) {
    throw new Error(
      "A emissão piloto não corresponde aos 17 QC."
    );
  }

  Logger.log("PILOTO DE 17 QC: OK");
  Logger.log("EMISSAO REAL DESATIVADA: OK");

  for (const valor of [10, 5, 2]) {

    // Dados fictícios, sem qualquer ficha real.
    const resposta = QC_assinarFichaCarteira190(
      "TOKEN_INVALIDO_TESTE",
      idEmissao,
      Utilities.getUuid(),
      "8" + "0".repeat(1023),
      valor
    );

    if (
      !resposta ||
      resposta.status !== "ASSINATURA_BLOQUEADA"
    ) {
      throw new Error(
        "Bloqueio não confirmado para " + valor + " QC."
      );
    }

    Logger.log(
      "ASSINATURA " + valor + " QC: BLOQUEADA"
    );
  }

  Logger.log("PASSO 238: APROVADO");
  Logger.log("NENHUMA FICHA ASSINADA");
}


function QC_testarRota239() {

  const props = PropertiesService.getScriptProperties();

  if (props.getProperty("QC_EMISSAO_REAL_ATIVA") !== "NAO") {
    throw new Error("Teste cancelado: emissão não bloqueada.");
  }

  const idEmissao = String(
    props.getProperty("QC_EMISSAO_PILOTO_ID") || ""
  ).trim();

  if (!/^QC-EM-[0-9a-f-]{36}$/i.test(idEmissao)) {
    throw new Error("Identificador piloto inválido.");
  }

  const dados = {
    acao: "qc_assinar_ficha",
    tokenSessao: "TOKEN_INVALIDO_TESTE",
    idEmissao: idEmissao,
    idOperacao: Utilities.getUuid(),
    blocoHex: "8" + "0".repeat(1023),
    denominacao: 2
  };

  Logger.log(
    "ID EMISSÃO VÁLIDO: " +
    /^QC-EM-[0-9a-f-]{36}$/i.test(dados.idEmissao)
  );

  Logger.log(
    "ID OPERAÇÃO VÁLIDO: " +
    /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i
      .test(dados.idOperacao)
  );

  Logger.log(
    "BLOCO VÁLIDO: " +
    /^[0-9a-f]{1024}$/i.test(dados.blocoHex)
  );

  const resposta = doPost({
    postData: {
      contents: JSON.stringify(dados),
      type: "application/json"
    }
  });

  const resultado = JSON.parse(resposta.getContent());

  Logger.log("STATUS DA ROTA: " + resultado.status);

  if (resultado.mensagem) {
    Logger.log("MENSAGEM: " + resultado.mensagem);
  }

  Logger.log(
    resultado.status === "ASSINATURA_BLOQUEADA"
      ? "ENCAMINHAMENTO: OK"
      : "ENCAMINHAMENTO: VERIFICAR"
  );
}


function QC_diagnosticarWorker245() {

  const props = PropertiesService.getScriptProperties();

  if (
    props.getProperty("QC_EMISSAO_REAL_ATIVA") !== "NAO"
  ) {
    throw new Error(
      "Teste cancelado: bloqueie o Apps Script primeiro."
    );
  }

  const token = props.getProperty("QC_WORKER_TOKEN");

  if (!/^[0-9a-f]{64}$/.test(token || "")) {
    throw new Error("Token do Worker não configurado.");
  }

  const resposta = UrlFetchApp.fetch(
    "https://quintoscoin-assinador-teste.lojatiradentesii71.workers.dev/interno/assinar",
    {
      method: "post",
      contentType: "application/json",
      headers: {
        Authorization: "Bearer " + token
      },
      payload: JSON.stringify({
        idOperacao: "TESTE_INVALIDO",
        idEmissao: "TESTE_INVALIDO",
        idCota: "TESTE_INVALIDO",
        idChave: "QC-10-V1",
        blocoHex: "00"
      }),
      muteHttpExceptions: true,
      followRedirects: false
    }
  );

  let dados = {};

  try {
    dados = JSON.parse(resposta.getContentText());
  } catch (_) {
    dados = {};
  }

  Logger.log("HTTP: " + resposta.getResponseCode());
  Logger.log("STATUS: " + (dados.status || "SEM_STATUS"));

  Logger.log("PASSO 245: DIAGNOSTICO CONCLUIDO");
  Logger.log("NENHUMA FICHA REAL ENVIADA");
}


// PASSO 362 — Consulta de chaves PUBLICAS V2 para a futura carteira.
// Somente leitura, exige sessao valida. Chaves privadas ficam no Worker.
// O status AGUARDANDO_INTEGRACAO NAO autoriza emitir nem assinar.
function QC_obterChavePublicaCarteiraV2362(tokenSessao, denominacao) {
  const valor = Number(denominacao);
  if (![1, 2, 5, 10, 50].includes(valor)) {
    return {status: "DENOMINACAO_INVALIDA"};
  }
  const sessao = QC_validarTokenSessaoTeste(tokenSessao);
  if (!sessao || sessao.status !== "OK") {
    return {status: "SESSAO_INVALIDA"};
  }
  const idChave = "QC-" + valor + "-V2";
  const aba = SpreadsheetApp.getActiveSpreadsheet()
    .getSheetByName("QC_ChavesAssinatura");
  if (!aba) throw new Error("QC_ChavesAssinatura ausente.");
  const dados = aba.getDataRange().getDisplayValues();
  if (!dados.length) throw new Error("Cadastro de chaves vazio.");
  const cab = dados[0].map(v => String(v).trim());
  const col = nome => cab.indexOf(nome);
  if (["IdChave", "Denominacao", "Versao", "Status",
       "ModuloPublico", "ExpoentePublico"].some(x => col(x) < 0)) {
    throw new Error("Cabecalhos de chaves incompletos.");
  }
  const linhas = dados.slice(1).filter(r =>
    String(r[col("IdChave")] || "").trim() === idChave
  );
  if (linhas.length !== 1) {
    return {status: "CHAVE_INDISPONIVEL", idChave, denominacao: valor};
  }
  const r = linhas[0];
  const statusChave = String(r[col("Status")] || "").trim().toUpperCase();
  if (Number(r[col("Denominacao")]) !== valor ||
      Number(r[col("Versao")]) !== 2 ||
      !["AGUARDANDO_INTEGRACAO", "ATIVA"].includes(statusChave)) {
    return {status: "CHAVE_INDISPONIVEL", idChave, denominacao: valor};
  }
  const moduloHex = String(r[col("ModuloPublico")] || "").trim().toLowerCase();
  const expoenteHex = String(r[col("ExpoentePublico")] || "").trim().toLowerCase();
  // Os parametros devem continuar RSA-4096 e expoente 65537.
  if (!/^[89a-f][0-9a-f]{1023}$/.test(moduloHex) ||
      !/^0*10001$/.test(expoenteHex)) {
    return {status: "CHAVE_INDISPONIVEL", idChave, denominacao: valor};
  }
  return {
    status: "OK",
    idChave,
    denominacao: valor,
    versao: 2,
    moduloHex,
    expoenteHex,
    statusChave,
    assinaturaPermitida: false
  };
}


// ============================================================================
// CONTROLE V2 / TESTE DESCARTAVEL SEM V3 — integrado ao arquivo operacional.
// NENHUMA chave privada é salva aqui: apenas parâmetros PÚBLICOS de backup.
// Primeira instalação: QC_prepararAmbienteTesteV2377()
// Após habilitar somente assinaturas TESTE no Worker: QC_ativarTestesV2377()
// Pausar imediatamente: QC_pausarTestesV2377()
// ENCERRAR somente depois de concluir todos os testes e desligar o Worker:
// QC_encerrarTestesV2377() — arquiva testbooks, restaura publicas reais.
// ============================================================================
function QC_propsTeste377() { return PropertiesService.getScriptProperties(); }
function QC_cab377(aba,nomes) {
  if(!aba) throw new Error('Aba ausente.');
  const h=aba.getRange(1,1,1,aba.getLastColumn()).getDisplayValues()[0]
    .map(x=>String(x).trim());
  const c=n=>h.indexOf(n);
  if(nomes.some(n=>c(n)<0)) throw new Error('Colunas ausentes: '+nomes.join(','));
  return {h,c};
}
function QC_estadoWorkerTeste377() {
  const p=QC_propsTeste377();
  const token=p.getProperty('QC_WORKER_TOKEN');
  if(!/^[a-f0-9]{64}$/.test(token||'')) throw new Error('Token Worker ausente.');
  const base='https://quintoscoin-assinador-teste.lojatiradentesii71.workers.dev';
  function post(rota) {
    const r=UrlFetchApp.fetch(base+rota,{method:'post',
      contentType:'application/json',headers:{Authorization:'Bearer '+token},
      payload:'{}',muteHttpExceptions:true});
    if(r.getResponseCode()!==200) throw new Error('Worker de teste inacessivel: '+rota);
    return JSON.parse(r.getContentText());
  }
  const estado=post('/interno/estado'),chaves=post('/interno/chaves-v2');
  if(estado.ambiente!=='TESTE' || chaves.ambiente!=='TESTE' ||
     !Array.isArray(chaves.chaves) || chaves.chaves.length!==5) {
    throw new Error('Worker nao esta na versao exclusiva de TESTES.');
  }
  const valores=[1,2,5,10,50], vistos=new Set(),mods=new Set();
  const mapa=new Map();
  for(const item of chaves.chaves) {
    const den=Number(item.denominacao),id=String(item.idChave||'');
    const n=String(item.moduloPublico||'').toLowerCase();
    const e=String(item.expoentePublico||'').toLowerCase();
    if(!valores.includes(den)||id!=='QC-'+den+'-V2'||
       item.status!=='CHAVE_CONFIGURADA'||
       !/^[89a-f][0-9a-f]{1023}$/.test(n)||!/^0*10001$/.test(e)||
       vistos.has(id)||mods.has(n)) throw new Error('Chaves V2 TESTE divergentes.');
    vistos.add(id);mods.add(n);mapa.set(id,{n,e});
  }
  if(mapa.size!==5)throw new Error('Sao necessarias cinco chaves de TESTE.');
  return {estado,publicas:mapa};
}
function QC_testesBloqueios377(p) {
  const flags={
    QC_V2_TESTES_LIBERADOS:'NAO',QC_EMISSAO_REAL_ATIVA:'NAO',
    QC_V2_RECEBIMENTO_ATIVO:'NAO',QC_V2_FINANCEIRO_ABERTO:'NAO',
    QC_V2_DOACOES_ATIVAS:'NAO',QC_V2_QR_PREPARO_ATIVO:'NAO',
    QC_V2_ASSINATURAS_TROCO_ATIVAS:'NAO',
    QC_V2_TRANSFERENCIAS_ATIVAS:'NAO',
    QC_V2_ASSINATURAS_TRANSFERENCIA_ATIVAS:'NAO',
    QC_V2_RESGATES_ATIVOS:'NAO',QC_V2_ASSINATURAS_RESGATE_ATIVAS:'NAO'
  };
  p.setProperties(flags,false);
}
function QC_publicasTeste377(ss) {
  const aba=ss.getSheetByName('QC_ChavesAssinatura');
  const t=QC_cab377(aba,['IdChave','Denominacao','Versao','Status',
    'ModuloPublico','ExpoentePublico']);
  const dados=aba.getDataRange().getValues();
  const lista=[];
  for(const valor of [1,2,5,10,50]) {
    const id='QC-'+valor+'-V2';
    const a=dados.slice(1).map((r,i)=>({r,linha:i+2})).filter(x=>
      String(x.r[t.c('IdChave')]).trim()===id);
    if(a.length!==1||Number(a[0].r[t.c('Denominacao')])!==valor||
       Number(a[0].r[t.c('Versao')])!==2) throw new Error('Chave V2 invalida: '+id);
    lista.push({id,den:valor,r:a[0].r,linha:a[0].linha});
  }
  return {aba,t,lista};
}
function QC_prepararAmbienteTesteV2377() {
  const p=QC_propsTeste377();
  const modo=p.getProperty('QC_V2_MODO')||'';
  if(!['','CONFIGURANDO','TESTE'].includes(modo) ||
     p.getProperty('QC_V2_TESTES_ENCERRADOS')==='SIM' ||
     p.getProperty('QC_V1_FINANCEIRO_ENCERRADO')!=='SIM')
    throw new Error('Transicao V2 nao permite preparar testes.');
  const w=QC_estadoWorkerTeste377();
  if(w.estado.assinaturaPermitida!==false)
    throw new Error('Bloqueie assinaturas no Worker antes de preparar.');
  const ss=SpreadsheetApp.getActiveSpreadsheet(),c=QC_publicasTeste377(ss);
  const nomeBackup='QC_OriginaisV2_Guardadas377';
  let backup=ss.getSheetByName(nomeBackup);
  const inicio=!backup;
  if(inicio) {
    if(modo!=='') throw new Error('Modo parcial sem backup: conferir manualmente.');
    const cot=ss.getSheetByName('QC_CotasEmissao');
    if(!cot) throw new Error('Cotas ausentes.');
    const cc=QC_cab377(cot,['IdChave']);
    if(cot.getDataRange().getValues().slice(1).some(r=>
      /^QC-(1|2|5|10|50)-V2$/.test(String(r[cc.c('IdChave')]).trim()))) {
      throw new Error('Ja existem cotas V2: nao misturar chaves.');
    }
    // Nenhum livro V2 pode conter dados antes da primeira troca de chave.
    for(const n of ['QC_DoacoesV2','QC_TransferenciasV2','QC_ResgatesV2',
      'QC_FichasGastasV2','QC_SessoesV2']) {
      const a=ss.getSheetByName(n);
      if(a&&a.getLastRow()>1) throw new Error('Livro V2 com dados: '+n);
    }
    for(const x of c.lista) {
      const status=String(x.r[c.t.c('Status')]).trim();
      const n=String(x.r[c.t.c('ModuloPublico')]).trim().toLowerCase();
      const e=String(x.r[c.t.c('ExpoentePublico')]).trim().toLowerCase();
      if(status!=='AGUARDANDO_INTEGRACAO' ||
         !/^[89a-f][0-9a-f]{1023}$/.test(n) || !/^0*10001$/.test(e) ||
         n===w.publicas.get(x.id).n) throw new Error('Chave real divergente: '+x.id);
    }
    QC_testesBloqueios377(p);
    p.setProperty('QC_V2_MODO','CONFIGURANDO');
    backup=ss.insertSheet(nomeBackup);
    backup.getRange(1,1,1,4).setValues([['IdChave','ModuloReal','ExpoenteReal','StatusReal']]);
    backup.getRange(2,1,5,4).setValues(c.lista.map(x=>[
      x.id,String(x.r[c.t.c('ModuloPublico')]).trim().toLowerCase(),
      String(x.r[c.t.c('ExpoentePublico')]).trim().toLowerCase(),
      String(x.r[c.t.c('Status')]).trim()]));
    SpreadsheetApp.flush();
  }
  const b=backup.getDataRange().getValues();
  if(b.length!==6||String(b[0][0])!=='IdChave') throw new Error('Backup incompleto.');
  for(const x of c.lista) {
    const orig=b.slice(1).filter(r=>String(r[0])===x.id);
    if(orig.length!==1||!/^[89a-f][0-9a-f]{1023}$/.test(String(orig[0][1])) ||
       String(orig[0][1])===w.publicas.get(x.id).n)
      throw new Error('Backup real invalido: '+x.id);
  }
  for(const x of c.lista) {
    const k=w.publicas.get(x.id);
    c.aba.getRange(x.linha,c.t.c('ModuloPublico')+1).setValue(k.n);
    c.aba.getRange(x.linha,c.t.c('ExpoentePublico')+1).setValue(k.e);
    c.aba.getRange(x.linha,c.t.c('Status')+1).setValue('ATIVA');
  }
  SpreadsheetApp.flush();
  p.setProperties({QC_V2_MODO:'TESTE',QC_V2_T_PUBLICAS_INSTALADAS:'SIM',
    QC_V2_TESTES_LIBERADOS:'NAO'},false);
  // Sessao ficticia APENAS em QC_SessoesV2, nunca em Sessoes ou QC_Sessoes V1.
  const sessao=QC_criarSessaoV2Teste377();
  const resultado={status:'PREPARADO',ambiente:'TESTE',chaves:5,
    assinaturaWorkerBloqueada:true,sessaoTeste:sessao};
  Logger.log(JSON.stringify(resultado));return resultado;
}
function QC_criarSessaoV2Teste377() {
  const p=QC_propsTeste377();
  if(p.getProperty('QC_V2_MODO')!=='TESTE') throw new Error('Nao esta em testes.');
  const ss=SpreadsheetApp.getActiveSpreadsheet();
  let aba=ss.getSheetByName('QC_SessoesV2');
  const cab=['IdSessao','Status','TotalQC','DinheiroFisico','TotalGeral'];
  if(!aba) {
    aba=ss.insertSheet('QC_SessoesV2');
    aba.getRange(1,1,1,cab.length).setValues([cab]);
  }
  const h=QC_cab377(aba,cab);
  const id='QC-V2-T-'+Utilities.formatDate(new Date(),
    'America/Sao_Paulo','yyyyMMdd');
  const dados=aba.getDataRange().getValues();
  const achadas=dados.slice(1).filter(r=>String(r[h.c('IdSessao')]).trim()===id);
  if(achadas.length>1) throw new Error('Sessao de teste duplicada.');
  if(achadas.length===0) {
    const linha=Array(Math.max(aba.getLastColumn(),cab.length)).fill('');
    linha[h.c('IdSessao')]=id;linha[h.c('Status')]='ABERTA';
    linha[h.c('TotalQC')]=0;linha[h.c('DinheiroFisico')]=0;linha[h.c('TotalGeral')]=0;
    aba.getRange(aba.getLastRow()+1,1,1,linha.length).setValues([linha]);
  } else if(String(achadas[0][h.c('Status')]).trim()!=='ABERTA') {
    throw new Error('Sessao de hoje nao esta ABERTA.');
  }
  return id;
}
function QC_ativarTestesV2377() {
  const p=QC_propsTeste377();
  if(p.getProperty('QC_V2_MODO')!=='TESTE'||
     p.getProperty('QC_V2_T_PUBLICAS_INSTALADAS')!=='SIM')
    throw new Error('Prepare as publicas V2 de teste primeiro.');
  const w=QC_estadoWorkerTeste377();
  if(w.estado.assinaturaPermitida!==true)
    throw new Error('Worker ainda nao permite exclusivamente assinaturas de TESTE.');
  const t=QC_publicasTeste377(SpreadsheetApp.getActiveSpreadsheet());
  for(const x of t.lista) {
    if(String(x.r[t.t.c('ModuloPublico')]).trim().toLowerCase()!==w.publicas.get(x.id).n||
       String(x.r[t.t.c('Status')]).trim()!=='ATIVA')
      throw new Error('Chave publica nao confere com Worker de teste: '+x.id);
  }
  const sessao=QC_criarSessaoV2Teste377();
  p.setProperties({QC_V2_TESTES_LIBERADOS:'SIM',
    QC_EMISSAO_REAL_ATIVA:'SIM',QC_V2_RECEBIMENTO_ATIVO:'SIM',
    QC_V2_FINANCEIRO_ABERTO:'SIM',QC_V2_DOACOES_ATIVAS:'SIM',
    QC_V2_QR_PREPARO_ATIVO:'SIM',QC_V2_ASSINATURAS_TROCO_ATIVAS:'SIM',
    QC_V2_TRANSFERENCIAS_ATIVAS:'SIM',
    QC_V2_ASSINATURAS_TRANSFERENCIA_ATIVAS:'SIM',
    QC_V2_RESGATES_ATIVOS:'SIM',QC_V2_ASSINATURAS_RESGATE_ATIVAS:'SIM'},false);
  const out={status:'TESTES_LIBERADOS',modo:'TESTE',sessaoTeste:sessao,
    creditoBancarioReal:false,emissaoMaximaPorSolicitacao:200,
    tetoAgregadoEmissoes:300};
  Logger.log(JSON.stringify(out));return out;
}
function QC_pausarTestesV2377() {
  const p=QC_propsTeste377();
  QC_testesBloqueios377(p);
  const r={status:'TESTES_PAUSADOS',worker:'DESATIVE QC_V2_T_SIGN_ENABLED NA CLOUDFARE'};
  Logger.log(JSON.stringify(r));return r;
}
// Congelamento e arquivamento FINAL: nao execute durante os testes.
// Os dados arquivados permanecem na mesma planilha (nao sao apagados).
function QC_encerrarTestesV2377() {
  const p=QC_propsTeste377();
  if(!['TESTE','ENCERRANDO'].includes(p.getProperty('QC_V2_MODO')) ||
      p.getProperty('QC_V2_TESTES_LIBERADOS')==='SIM')
    throw new Error('Primeiro pause os testes com QC_pausarTestesV2377.');
  const w=QC_estadoWorkerTeste377();
  if(w.estado.assinaturaPermitida!==false)
    throw new Error('Desative QC_V2_T_SIGN_ENABLED no Worker antes do corte.');
  const ss=SpreadsheetApp.getActiveSpreadsheet();
  const reais=ss.getSheetByName('QC_OriginaisV2_Guardadas377');
  if(!reais||reais.getLastRow()!==6)throw new Error('Backup de chaves reais ausente.');
  const livres=['QC_DoacoesV2','QC_TransferenciasV2','QC_ResgatesV2'];
  for(const nome of livres) {
    const aba=ss.getSheetByName(nome);
    if(!aba)continue;
    const h=QC_cab377(aba,['Status']);
    const estados=aba.getDataRange().getValues().slice(1).map(r=>
      String(r[h.c('Status')]).trim());
    const finais=nome==='QC_DoacoesV2'?['CONCLUIDA']:
      nome==='QC_TransferenciasV2'?['CONCLUIDA']:
      ['CONFIRMADO','CANCELADO'];
    if(estados.some(x=>x&&!finais.includes(x)))
      throw new Error('Ha operacoes V2 pendentes em '+nome+'.');
  }
  // Exigir livro V2 totalmente conciliado ANTES do primeiro arquivamento.
  if(p.getProperty('QC_V2_MODO')==='TESTE') QC_painelTotalV2373();
  const lock=LockService.getScriptLock();lock.waitLock(30000);
  try {
    if(p.getProperty('QC_V2_MODO')==='TESTE') {
      p.setProperty('QC_V2_MODO','ENCERRANDO');
    }
    // Primeiro copiar os quatro livros mistos, antes de retirar linhas V2.
    const livros=[
      ['QC_Emissoes','QC_ARQ_T377_Emissoes'],
      ['QC_Autorizacoes','QC_ARQ_T377_Autorizacoes'],
      ['QC_CotasEmissao','QC_ARQ_T377_Cotas'],
      ['QC_OperacoesAssinatura','QC_ARQ_T377_Assinaturas']
    ];
    for(const [orig,arquivado] of livros) {
      const aba=ss.getSheetByName(orig);
      if(!aba)throw new Error('Livro '+orig+' ausente.');
      if(!ss.getSheetByName(arquivado))aba.copyTo(ss).setName(arquivado);
    }
    SpreadsheetApp.flush();
    const abCotas=ss.getSheetByName('QC_ARQ_T377_Cotas');
    const hC=QC_cab377(abCotas,['IdEmissao','IdChave']);
    const ids=new Set(abCotas.getDataRange().getValues().slice(1)
      .filter(r=>/^QC-(?:1|2|5|10|50)-V2$/.test(String(r[hC.c('IdChave')]).trim()))
      .map(r=>String(r[hC.c('IdEmissao')]).trim()));
    // Se nao foi emitida ficha nos testes, nao precisamos remover linhas.
    const idsAut=new Set([...ids].map(e=>e.replace(/^QC-EM-/,'')).filter(Boolean));
    for(const [nome] of livros) {
      const aba=ss.getSheetByName(nome);
      const coluna=nome==='QC_Autorizacoes'?'IdAutorizacao':'IdEmissao';
      const h=QC_cab377(aba,[coluna]);
      const rows=aba.getDataRange().getValues();
      for(let i=rows.length-1;i>=1;i--) {
        const val=String(rows[i][h.c(coluna)]||'').trim();
        if((nome==='QC_Autorizacoes'?idsAut:ids).has(val))aba.deleteRow(i+1);
      }
    }
    // Renomeia as tabelas EXCLUSIVAS V2: todos os dados de teste sao mantidos.
    const livrosV2=[
      ['QC_DoacoesV2','QC_ARQ_T377_Doacoes'],
      ['QC_DoacaoAssinaturasV2','QC_ARQ_T377_DoacaoAss'],
      ['QC_FichasGastasV2','QC_ARQ_T377_Gastos'],
      ['QC_TransferenciasV2','QC_ARQ_T377_Transfer'],
      ['QC_TransferAssinaturasV2','QC_ARQ_T377_TransferAss'],
      ['QC_ResgatesV2','QC_ARQ_T377_Resgates'],
      ['QC_ResgateAssinaturasV2','QC_ARQ_T377_ResgateAss'],
      ['QC_SessoesV2','QC_ARQ_T377_Sessoes']];
    for(const [nome,arquivo] of livrosV2) {
      const aba=ss.getSheetByName(nome);
      if(aba) {
        if(ss.getSheetByName(arquivo)) throw new Error('Arquivo duplicado: '+arquivo);
        aba.setName(arquivo);
      }
    }
    // Devolve as publicas V2 DEFINITIVAS para as linhas originais.
    const chave=QC_publicasTeste377(ss);
    const bs=reais.getDataRange().getValues().slice(1);
    for(const c of chave.lista) {
      const orig=bs.filter(r=>String(r[0])===c.id);
      if(orig.length!==1||!/^[89a-f][0-9a-f]{1023}$/.test(String(orig[0][1])))
        throw new Error('Chave publica de producao ausente.');
      chave.aba.getRange(c.linha,chave.t.c('ModuloPublico')+1).setValue(orig[0][1]);
      chave.aba.getRange(c.linha,chave.t.c('ExpoentePublico')+1).setValue(orig[0][2]);
      chave.aba.getRange(c.linha,chave.t.c('Status')+1).setValue('AGUARDANDO_INTEGRACAO');
    }
    SpreadsheetApp.flush();
    p.setProperties({QC_V2_MODO:'REAL_PENDENTE',
      QC_V2_TESTES_ENCERRADOS:'SIM',QC_V2_T_PUBLICAS_INSTALADAS:'NAO',
      QC_V2_TESTES_LIBERADOS:'NAO'},false);
    const result={status:'TESTES_V2_ARQUIVADOS',
      moedasTesteInvalidasAposRestaurarPublicas:true,
      circulacaoRealV2:0,acoesPendentes:'Publicar Worker V2 REAL com emissao ainda bloqueada'};
    Logger.log(JSON.stringify(result));return result;
  } finally { lock.releaseLock(); }
}

