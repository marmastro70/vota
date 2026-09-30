(function () {
  var params = new URLSearchParams(location.search);
  var token = params.get('token') || localStorage.getItem('vv_host_token') || '';

  var stage = document.getElementById('stage');
  var phaseLine = document.getElementById('phaseLine');
  var questionCard = document.getElementById('questionCard');
  var questionText = document.getElementById('questionText');
  var optionsList = document.getElementById('optionsList');
  var resultsCard = document.getElementById('resultsCard');
  var resultsEl = document.getElementById('results');

  var endsAt = null;
  var qIndex = 0;
  var qCount = 1;
  var lastKey = null;

  function votingLine() {
    var left = endsAt ? Math.max(0, Math.round((endsAt - Date.now()) / 1000)) : 0;
    return 'Voten ahora (' + left + 's) - pregunta ' + (qIndex + 1) + ' de ' + qCount;
  }

  setInterval(function () {
    if (endsAt) phaseLine.textContent = votingLine();
  }, 250);

  var voterUrl = location.origin + '/voter.html';
  document.getElementById('voterUrlBig').textContent = voterUrl;
  if (window.QRCode) {
    new QRCode(document.getElementById('qr'), { text: voterUrl, width: 200, height: 200 });
  }

  function renderOptions(options) {
    optionsList.innerHTML = '';
    options.forEach(function (label, i) {
      var row = document.createElement('div');
      row.className = 'option';
      row.innerHTML = '<span class="num">' + (i + 1) + '</span>' + label;
      optionsList.appendChild(row);
    });
  }

  function renderResults(result, options) {
    var max = result.max || 1;
    resultsEl.innerHTML = '';
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
      resultsEl.appendChild(row);
    });
  }

  var socket = token
    ? io({ auth: { role: 'host', token: token } })
    : io({ auth: { role: 'display' } });

  socket.on('host:denied', function () {
    phaseLine.textContent = 'Token invalido en esta pantalla (modo solo lectura).';
  });

  socket.on('state', function (s) {
    qIndex = s.qIndex || 0;
    qCount = s.questionCount || 1;
    endsAt = s.phase === 'voting' ? s.endsAt || null : null;

    if (s.revealed && s.result) {
      questionCard.classList.add('hidden');
      resultsCard.classList.remove('hidden');
      stage.classList.add('two-col');
      phaseLine.textContent = 'Resultados - pregunta ' + (s.qIndex + 1) + ' de ' + s.questionCount;
      renderResults(s.result, s.options);
      return;
    }

    resultsCard.classList.add('hidden');

    if (s.phase === 'voting' && s.question) {
      questionText.textContent = s.question;
      var key = s.qIndex + ':' + s.options.join('|');
      if (key !== lastKey) {
        renderOptions(s.options);
        lastKey = key;
      }
      questionCard.classList.remove('hidden');
      stage.classList.add('two-col');
      phaseLine.textContent = votingLine();
    } else {
      questionCard.classList.add('hidden');
      stage.classList.remove('two-col');
      phaseLine.textContent = 'Esperando que el conductor abra la votacion';
    }
  });
})();
