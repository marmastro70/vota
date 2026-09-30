(function () {
  var params = new URLSearchParams(location.search);
  var setupEl = document.getElementById('setup');
  var panelEl = document.getElementById('panel');
  var tokenInput = document.getElementById('token');
  var setupStatus = document.getElementById('setupStatus');
  var statusEl = document.getElementById('status');
  var saveStatus = document.getElementById('saveStatus');
  var diagEl = document.getElementById('diag');
  var logEl = document.getElementById('log');
  var phasePill = document.getElementById('phasePill');
  var roundPill = document.getElementById('roundPill');
  var qPill = document.getElementById('qPill');
  var totalEl = document.getElementById('total');
  var questionTextEl = document.getElementById('questionText');
  var qEditor = document.getElementById('qEditor');
  var secondsEl = document.getElementById('seconds');
  var countdownEl = document.getElementById('countdown');
  var hostResultsCard = document.getElementById('hostResultsCard');
  var hostResultsEl = document.getElementById('hostResults');
  var endsAt = null;

  function renderResults(result, options) {
    var max = result.max || 1;
    hostResultsEl.innerHTML = '';
    var order = options.map(function (_, i) {
      return i;
    });
    order.sort(function (a, b) {
      return result.counts[b] - result.counts[a] || a - b;
    });
    order.forEach(function (i) {
      var isWinner = result.leaders.indexOf(i) >= 0;
      var pct = result.total ? Math.round((result.counts[i] / result.total) * 100) : 0;

      var row = document.createElement('div');
      row.className = 'result-row' + (isWinner ? ' winner' : '');

      var fill = document.createElement('div');
      fill.className = 'fill';
      fill.style.width = (result.total ? (result.counts[i] / max) * 100 : 0) + '%';

      var lr = document.createElement('div');
      lr.className = 'label-row';

      var left = document.createElement('span');
      left.innerHTML =
        (isWinner ? '<span class="badge">GANADORA</span>' : '') + (i + 1) + '. ' + options[i];

      var right = document.createElement('span');
      right.className = 'count';
      right.textContent = result.counts[i] + ' (' + pct + '%)';

      lr.appendChild(left);
      lr.appendChild(right);
      row.appendChild(fill);
      row.appendChild(lr);
      hostResultsEl.appendChild(row);
    });
  }

  function tickCountdown() {
    if (!endsAt) {
      countdownEl.textContent = '--';
      return;
    }
    var left = Math.max(0, Math.round((endsAt - Date.now()) / 1000));
    countdownEl.textContent = left + 's';
  }
  setInterval(tickCountdown, 250);

  function log(msg) {
    var t = new Date().toLocaleTimeString();
    logEl.textContent += '[' + t + '] ' + msg + '\n';
    logEl.scrollTop = logEl.scrollHeight;
  }

  function isInAppBrowser() {
    var ua = navigator.userAgent || '';
    return /(FBAN|FBAV|Instagram|Line\/|WhatsApp|Twitter|MicroMessenger|; wv\))/i.test(ua);
  }

  function canVibrate() {
    return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
  }

  function updateDiag() {
    var parts = [];
    parts.push(canVibrate() ? 'vibrate OK' : 'vibrate NO DISPONIBLE');
    if (isInAppBrowser()) parts.push('NAVEGADOR INTERNO');
    diagEl.textContent = parts.join(' | ');
    diagEl.className = 'status ' + (canVibrate() && !isInAppBrowser() ? 'ok' : 'err');
  }

  function patternFor(pulses, tie) {
    var p = [130, 650];
    for (var i = 0; i < pulses; i++) {
      p.push(420);
      if (i < pulses - 1) p.push(260);
    }
    if (tie) p.push(300, 180, 900);
    if (p.length % 2 !== 0) p.push(0);
    return p;
  }

  function buzzWinner(index, tie) {
    if (!canVibrate()) {
      log('ERROR: navigator.vibrate no existe en este navegador.');
      setStatus('Vibracion no disponible. Abri el link en Chrome.', 'err');
      return;
    }
    var pulses = Math.max(1, Number(index) + 1);
    var pattern = patternFor(pulses, tie);
    var ok = navigator.vibrate(pattern);
    log('vibrate(' + JSON.stringify(pattern) + ') => ' + ok + ' | opcion=' + pulses + (tie ? ' EMPATE' : ''));
    setStatus(
      'Resultado: opcion ' + pulses + ' (' + pulses + ' vibraciones)' + (tie ? ' [EMPATE]' : ''),
      'ok'
    );
  }

  function buzzFull() {
    if (!canVibrate()) return;
    navigator.vibrate([90, 120, 90, 0]);
    log('Todos votaron.');
    setStatus('Todos votaron.', 'ok');
  }

  function setStatus(text, kind) {
    statusEl.textContent = text || '';
    statusEl.className = 'status' + (kind ? ' ' + kind : '');
    if (text) log(text);
  }

  function setSaveStatus(text, kind) {
    saveStatus.textContent = text || '';
    saveStatus.className = 'status' + (kind ? ' ' + kind : '');
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function renumberQuestions() {
    var blocks = qEditor.querySelectorAll('.q-block');
    Array.prototype.forEach.call(blocks, function (b, i) {
      var head = b.querySelector('.q-head');
      if (head) head.textContent = 'Pregunta ' + (i + 1);
    });
  }

  function addQuestionBlock(q) {
    q = q || { question: '', options: [] };
    var opts = (q.options || []).concat(['', '', '', '', '']).slice(0, 5);
    var block = document.createElement('div');
    block.className = 'q-block';

    var html = '';
    html += '<div class="q-head">Pregunta</div>';
    html +=
      '<input class="q-text" type="text" placeholder="Escribe la pregunta" value="' +
      esc(q.question) +
      '" />';
    html += '<div class="q-opts">';
    for (var i = 0; i < 5; i++) {
      html +=
        '<input class="q-opt" type="text" placeholder="Opcion ' +
        (i + 1) +
        '" value="' +
        esc(opts[i]) +
        '" />';
    }
    html += '</div>';
    html += '<button class="q-del" type="button">Eliminar pregunta</button>';
    block.innerHTML = html;

    block.querySelector('.q-del').addEventListener('click', function () {
      block.remove();
      renumberQuestions();
    });

    qEditor.appendChild(block);
    renumberQuestions();
  }

  function renderEditor(questions) {
    qEditor.innerHTML = '';
    var qs = questions && questions.length ? questions : [{ question: '', options: [] }];
    qs.forEach(addQuestionBlock);
  }

  function collectQuestions() {
    var out = [];
    var blocks = qEditor.querySelectorAll('.q-block');
    Array.prototype.forEach.call(blocks, function (b) {
      var question = b.querySelector('.q-text').value.trim();
      var options = [];
      Array.prototype.forEach.call(b.querySelectorAll('.q-opt'), function (inp) {
        var v = inp.value.trim();
        if (v) options.push(v);
      });
      if (question || options.length) out.push({ question: question, options: options });
    });
    return out;
  }

  function updateQuestion(qIndex, questionCount, question) {
    qPill.textContent = 'pregunta ' + (qIndex + 1) + '/' + questionCount;
    questionTextEl.textContent = question || '';
  }

  var socket = null;

  function connect(token) {
    socket = io({ auth: { role: 'host', token: token } });

    socket.on('connect', function () {
      log('Conectado como host. id=' + socket.id);
      setupStatus.textContent = 'Conectado.';
      setupStatus.className = 'status ok';
    });

    socket.on('connect_error', function (e) {
      log('Error de conexion: ' + e.message);
    });

    socket.on('host:denied', function () {
      log('Token incorrecto.');
      setupStatus.textContent = 'Token incorrecto.';
      setupStatus.className = 'status err';
      localStorage.removeItem('vv_host_token');
      socket.disconnect();
      panelEl.classList.add('hidden');
      setupEl.classList.remove('hidden');
    });

    socket.on('host:ready', function (data) {
      log('Host autenticado. Preguntas en servidor: ' + (data.questions || []).length);
      localStorage.setItem('vv_host_token', token);
      setupEl.classList.add('hidden');
      panelEl.classList.remove('hidden');
      updateQuestion(data.qIndex || 0, (data.questions || []).length, data.question);

      var saved = null;
      try {
        saved = JSON.parse(localStorage.getItem('vv_questions') || 'null');
      } catch (e) {
        saved = null;
      }
      if (
        saved &&
        saved.length &&
        JSON.stringify(saved) !== JSON.stringify(data.questions || [])
      ) {
        renderEditor(saved);
        socket.emit('host:setQuestions', saved);
        log('Tus preguntas guardadas en este celular fueron aplicadas.');
      } else {
        renderEditor(saved && saved.length ? saved : data.questions || []);
      }
      updateDiag();
    });

    socket.on('host:questions', function (data) {
      renderEditor(data.questions || []);
      updateQuestion(data.qIndex || 0, (data.questions || []).length, '');
      log('Preguntas guardadas: ' + (data.questions || []).length);
    });

    socket.on('host:question', function (data) {
      updateQuestion(data.qIndex || 0, 99, data.question);
    });

    socket.on('state', function (s) {
      phasePill.textContent = s.phase;
      roundPill.textContent = 'ronda ' + s.round;
      totalEl.textContent = s.total;
      updateQuestion(s.qIndex, s.questionCount, s.question);
      endsAt = s.endsAt || null;

      if (s.revealed && s.result) {
        hostResultsCard.classList.remove('hidden');
        renderResults(s.result, s.options);
      } else {
        hostResultsCard.classList.add('hidden');
      }
    });

    socket.on('host:result', function (r) {
      log('RESULTADO recibido: winner=' + r.winner + ' total=' + r.total + ' tie=' + r.tie);
      buzzWinner(r.winner, r.tie);
    });

    socket.on('host:revealed', function (r) {
      log('Revelado a todos. Ganadora opcion ' + (r.winner + 1) + (r.tie ? ' (empate)' : ''));
      setStatus('Resultados mostrados en pantalla y celulares.', 'ok');
    });

    socket.on('host:full', function () {
      buzzFull();
    });

    socket.on('host:notice', function (msg) {
      log('Aviso del servidor: ' + msg);
      setStatus(msg, 'err');
    });

    socket.on('host:expected', function (n) {
      setStatus(n ? 'Aviso configurado en ' + n + ' votos.' : 'Aviso desactivado.');
    });

    socket.on('disconnect', function () {
      log('Desconectado.');
    });
  }

  document.getElementById('connect').addEventListener('click', function () {
    var token = tokenInput.value.trim();
    if (!token) {
      setupStatus.textContent = 'Ingresa el token.';
      setupStatus.className = 'status err';
      return;
    }
    connect(token);
  });

  document.getElementById('open').addEventListener('click', function () {
    var seconds = Number(secondsEl.value) || 30;
    if (canVibrate()) navigator.vibrate(60);
    if (socket) socket.emit('host:open', { seconds: seconds });
    setStatus('Votacion abierta por ' + seconds + 's.');
  });

  document.getElementById('close').addEventListener('click', function () {
    if (canVibrate()) navigator.vibrate(30);
    if (socket) socket.emit('host:close');
    log('Emitido host:close...');
  });

  document.getElementById('reveal').addEventListener('click', function () {
    if (socket) socket.emit('host:reveal');
    log('Emitido host:reveal...');
  });

  document.getElementById('prev').addEventListener('click', function () {
    if (socket) socket.emit('host:prev');
  });

  document.getElementById('next').addEventListener('click', function () {
    if (socket) socket.emit('host:next');
  });

  document.getElementById('reset').addEventListener('click', function () {
    if (socket) socket.emit('host:reset');
    setStatus('Listo para nueva ronda.');
  });

  document.getElementById('restart').addEventListener('click', function () {
    if (socket) socket.emit('host:restart');
    setStatus('Reiniciado: pregunta 1, sin votos.');
  });

  document.getElementById('expected').addEventListener('change', function () {
    if (socket) socket.emit('host:expected', this.value);
  });

  document.getElementById('test').addEventListener('click', function () {
    if (!canVibrate()) {
      setStatus('Este navegador no soporta vibracion.', 'err');
      return;
    }
    var pattern = patternFor(3, false);
    var ok = navigator.vibrate(pattern);
    log('TEST 3 pulsos vibrate(' + JSON.stringify(pattern) + ') => ' + ok);
    setStatus('Probar: deberias contar 3 vibraciones.');
  });

  document.getElementById('addQuestion').addEventListener('click', function () {
    addQuestionBlock({ question: '', options: [] });
  });

  document.getElementById('saveQuestions').addEventListener('click', function () {
    var parsed = collectQuestions();
    if (!parsed.length) {
      setSaveStatus('Agrega al menos una pregunta.', 'err');
      return;
    }
    var bad = null;
    parsed.forEach(function (q, i) {
      if (!q.question) bad = 'La pregunta ' + (i + 1) + ' no tiene texto.';
      else if (q.options.length < 2) bad = 'La pregunta ' + (i + 1) + ' necesita al menos 2 opciones.';
    });
    if (bad) {
      setSaveStatus(bad, 'err');
      return;
    }
    if (socket) socket.emit('host:setQuestions', parsed);
    try {
      localStorage.setItem('vv_questions', JSON.stringify(parsed));
    } catch (e) {}
    setSaveStatus('Guardado en este celular y en el servidor.', 'ok');
  });

  updateDiag();
  var stored = params.get('token') || localStorage.getItem('vv_host_token');
  if (stored) {
    tokenInput.value = stored;
    connect(stored);
  }
})();
