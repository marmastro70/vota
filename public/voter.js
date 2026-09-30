(function () {
  var optionsEl = document.getElementById('options');
  var statusEl = document.getElementById('status');
  var waitingEl = document.getElementById('waiting');
  var voteCard = document.getElementById('voteCard');
  var questionCard = document.getElementById('questionCard');
  var questionText = document.getElementById('questionText');
  var countdownEl = document.getElementById('countdown');
  var resultsCard = document.getElementById('resultsCard');
  var resultsEl = document.getElementById('results');

  var endsAt = null;
  setInterval(function () {
    if (endsAt) {
      var left = Math.max(0, Math.round((endsAt - Date.now()) / 1000));
      countdownEl.textContent = left + ' segundos';
    } else {
      countdownEl.textContent = '';
    }
  }, 250);

  function getClientId() {
    var id = localStorage.getItem('vv_client_id');
    if (!id) {
      id = 'c_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
      localStorage.setItem('vv_client_id', id);
    }
    return id;
  }

  var socket = io({ auth: { role: 'voter', clientId: getClientId() } });

  var lastKey = null;
  var lastOptions = [];
  var currentRound = 0;

  function getVote() {
    try {
      return JSON.parse(localStorage.getItem('vv_vote') || 'null');
    } catch (e) {
      return null;
    }
  }

  function hasVoted() {
    var v = getVote();
    return !!v && v.round === currentRound && currentRound > 0;
  }

  function chosenIndex() {
    var v = getVote();
    return hasVoted() ? v.index : -1;
  }

  function setStatus(text, kind) {
    statusEl.textContent = text || '';
    statusEl.className = 'status center' + (kind ? ' ' + kind : '');
  }

  function renderOptions(options) {
    lastOptions = options;
    optionsEl.innerHTML = '';
    var chosen = chosenIndex();
    options.forEach(function (label, index) {
      var btn = document.createElement('button');
      btn.className = 'option' + (chosen === index ? ' chosen' : '');
      btn.type = 'button';
      btn.innerHTML = '<span class="num">' + (index + 1) + '</span>' + label;
      btn.addEventListener('click', function () {
        if (hasVoted()) return;
        socket.emit('vote', { index: index });
      });
      optionsEl.appendChild(btn);
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

  function showWaiting() {
    waitingEl.classList.remove('hidden');
    voteCard.classList.add('hidden');
  }

  socket.on('state', function (s) {
    if (typeof s.round === 'number') currentRound = s.round;
    endsAt = s.phase === 'voting' ? s.endsAt || null : null;

    if (s.question) {
      questionText.textContent = s.question;
      questionCard.classList.remove('hidden');
    } else {
      questionCard.classList.add('hidden');
    }

    var key = s.round + ':' + s.qIndex + ':' + s.options.join('|');
    if (key !== lastKey) {
      renderOptions(s.options);
      lastKey = key;
    }

    if (s.revealed && s.result) {
      waitingEl.classList.add('hidden');
      voteCard.classList.add('hidden');
      resultsCard.classList.remove('hidden');
      renderResults(s.result, s.options);
      return;
    }
    resultsCard.classList.add('hidden');

    if (s.phase === 'voting') {
      waitingEl.classList.add('hidden');
      voteCard.classList.remove('hidden');
      setStatus(hasVoted() ? 'Ya votaste en esta ronda.' : 'Votacion abierta.');
    } else if (s.phase === 'closed') {
      if (hasVoted()) showWaiting();
      else {
        voteCard.classList.remove('hidden');
        setStatus('La votacion se cerro.', 'err');
      }
    } else {
      waitingEl.classList.add('hidden');
      voteCard.classList.remove('hidden');
      if (!hasVoted()) setStatus('Esperando que abra la votacion...');
    }
  });

  socket.on('vote:accepted', function (payload) {
    var round = payload && payload.round ? payload.round : currentRound;
    var index = payload && typeof payload.index === 'number' ? payload.index : chosenIndex();
    try {
      localStorage.setItem('vv_vote', JSON.stringify({ round: round, index: index }));
    } catch (e) {}
    renderOptions(lastOptions);
    setStatus('Voto registrado. Gracias!', 'ok');
    setTimeout(showWaiting, 700);
  });

  socket.on('vote:rejected', function (msg) {
    setStatus(msg || 'No se pudo registrar.', 'err');
  });

  socket.on('voting:closed', function () {
    if (hasVoted()) showWaiting();
    else setStatus('La votacion se cerro.', 'err');
  });

  socket.on('game:reset', function () {
    try {
      localStorage.removeItem('vv_vote');
    } catch (e) {}
    resultsCard.classList.add('hidden');
    waitingEl.classList.add('hidden');
    voteCard.classList.remove('hidden');
    renderOptions(lastOptions);
    setStatus('Juego reiniciado.');
  });
})();
