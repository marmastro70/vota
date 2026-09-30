'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' }, pingTimeout: 20000 });

const PORT = process.env.PORT || 3000;
const HOST_TOKEN = process.env.HOST_TOKEN || 'cambia-este-token';
const VOTE_SECONDS = Number(process.env.VOTE_SECONDS) > 0 ? Number(process.env.VOTE_SECONDS) : 30;
const QUESTIONS_FILE = path.join(__dirname, 'questions.json');

function normalizeQuestions(arr) {
  if (!Array.isArray(arr)) return [];
  return arr
    .map((q) => ({
      question: String((q && q.question) || '').trim(),
      options: (Array.isArray(q && q.options) ? q.options : [])
        .map((o) => String(o).trim())
        .filter(Boolean)
        .slice(0, 5)
    }))
    .filter((q) => q.options.length >= 2);
}

function fallbackQuestions() {
  const opts = (process.env.OPTIONS || 'Opcion 1,Opcion 2,Opcion 3,Opcion 4,Opcion 5')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 5);
  return [{ question: process.env.QUESTION || 'Pregunta 1', options: opts }];
}

function loadQuestions() {
  try {
    const parsed = JSON.parse(fs.readFileSync(QUESTIONS_FILE, 'utf8'));
    const q = normalizeQuestions(parsed);
    if (q.length) return q;
  } catch (e) {
    // archivo inexistente o invalido: usamos fallback
  }
  return fallbackQuestions();
}

let questions = loadQuestions();

const state = {
  phase: 'lobby',
  round: 0,
  qIndex: 0,
  votes: [],
  votedClients: new Set(),
  votedSockets: new Set(),
  expected: null,
  fullNotified: false,
  revealed: false,
  duration: VOTE_SECONDS,
  endsAt: null
};

let autoCloseTimer = null;

function clearAutoClose() {
  if (autoCloseTimer) {
    clearTimeout(autoCloseTimer);
    autoCloseTimer = null;
  }
}

function currentQ() {
  return questions[state.qIndex] || { question: '', options: [] };
}

function totalVotes() {
  return state.votes.reduce((a, b) => a + b, 0);
}

function resetVotes() {
  state.votes = currentQ().options.map(() => 0);
  state.votedClients.clear();
  state.votedSockets.clear();
  state.fullNotified = false;
}

function computeTally() {
  const counts = state.votes.slice();
  let max = 0;
  counts.forEach((v) => {
    if (v > max) max = v;
  });
  const leaders = [];
  counts.forEach((v, i) => {
    if (v === max && max > 0) leaders.push(i);
  });
  return {
    counts,
    max,
    winner: leaders.length ? leaders[0] : -1,
    leaders,
    tie: leaders.length > 1,
    total: totalVotes()
  };
}

function publicState() {
  const s = {
    phase: state.phase,
    round: state.round,
    qIndex: state.qIndex,
    questionCount: questions.length,
    question: currentQ().question,
    options: currentQ().options,
    total: totalVotes(),
    revealed: state.revealed,
    endsAt: state.endsAt,
    duration: state.duration
  };
  if (state.revealed) s.result = computeTally();
  return s;
}

function broadcastState() {
  io.emit('state', publicState());
}

function doClose() {
  if (state.phase !== 'voting') return;
  clearAutoClose();
  state.phase = 'closed';
  state.revealed = true;
  state.endsAt = null;
  const result = computeTally();
  broadcastState();
  io.to('hosts').emit('host:result', result);
  io.emit('voting:closed');
}

function resetToLobby() {
  clearAutoClose();
  state.phase = 'lobby';
  state.revealed = false;
  state.endsAt = null;
  resetVotes();
}

function saveQuestions() {
  try {
    fs.writeFileSync(QUESTIONS_FILE, JSON.stringify(questions, null, 2), 'utf8');
  } catch (e) {
    // filesystem de solo lectura (algunos hostings): se mantiene en memoria
  }
}

io.on('connection', (socket) => {
  const auth = socket.handshake.auth || {};
  const role = auth.role;
  const clientId =
    typeof auth.clientId === 'string' && auth.clientId.length >= 8 ? auth.clientId : null;

  if (role === 'host') {
    if (auth.token !== HOST_TOKEN) {
      socket.emit('host:denied');
      socket.disconnect(true);
      return;
    }

    socket.join('hosts');
    socket.emit('state', publicState());
    socket.emit('host:ready', {
      options: currentQ().options,
      question: currentQ().question,
      qIndex: state.qIndex,
      questions: questions
    });

    socket.on('host:open', (payload) => {
      const seconds =
        payload && Number(payload.seconds) > 0 ? Math.floor(Number(payload.seconds)) : VOTE_SECONDS;
      clearAutoClose();
      resetVotes();
      state.revealed = false;
      state.round += 1;
      state.phase = 'voting';
      state.duration = seconds;
      state.endsAt = Date.now() + seconds * 1000;
      broadcastState();
      io.to('hosts').emit('host:phase', 'voting');
      io.to('hosts').emit('host:timer', { endsAt: state.endsAt, seconds: seconds });
      autoCloseTimer = setTimeout(doClose, seconds * 1000);
    });

    socket.on('host:close', () => {
      if (state.phase !== 'voting') {
        socket.emit('host:notice', 'No hay votacion abierta: toca ABRIR VOTACION primero');
        return;
      }
      doClose();
    });

    socket.on('host:reveal', () => {
      if (state.phase !== 'closed') {
        socket.emit('host:notice', 'Primero cerra la votacion para revelar');
        return;
      }
      state.revealed = true;
      broadcastState();
      io.to('hosts').emit('host:revealed', computeTally());
    });

    socket.on('host:next', () => {
      if (state.qIndex >= questions.length - 1) {
        socket.emit('host:notice', 'Ya no hay mas preguntas');
        return;
      }
      state.qIndex += 1;
      state.round += 1;
      resetToLobby();
      broadcastState();
      socket.emit('host:question', {
        qIndex: state.qIndex,
        question: currentQ().question,
        options: currentQ().options
      });
    });

    socket.on('host:prev', () => {
      if (state.qIndex <= 0) {
        socket.emit('host:notice', 'Ya estas en la primera pregunta');
        return;
      }
      state.qIndex -= 1;
      state.round += 1;
      resetToLobby();
      broadcastState();
      socket.emit('host:question', {
        qIndex: state.qIndex,
        question: currentQ().question,
        options: currentQ().options
      });
    });

    socket.on('host:reset', () => {
      resetToLobby();
      broadcastState();
      io.to('hosts').emit('host:phase', 'lobby');
    });

    socket.on('host:expected', (n) => {
      const num = Number(n);
      state.expected = Number.isFinite(num) && num > 0 ? Math.floor(num) : null;
      socket.emit('host:expected', state.expected);
    });

    socket.on('host:setQuestions', (payload) => {
      const q = normalizeQuestions(payload);
      if (!q.length) {
        socket.emit('host:notice', 'Formato invalido: envie un array con question y options');
        return;
      }
      questions = q;
      state.qIndex = 0;
      state.round += 1;
      resetToLobby();
      saveQuestions();
      broadcastState();
      socket.emit('host:questions', { questions: questions, qIndex: 0 });
      io.to('hosts').emit('host:notice', 'Preguntas actualizadas');
    });

    return;
  }

  // Votante / pantalla: solo recibe estado publico.
  socket.emit('state', publicState());

  socket.on('vote', (payload) => {
    const index = payload && Number(payload.index);

    if (state.phase !== 'voting') {
      socket.emit('vote:rejected', 'La votacion no esta abierta');
      return;
    }
    if (!Number.isInteger(index) || index < 0 || index >= currentQ().options.length) {
      socket.emit('vote:rejected', 'Opcion invalida');
      return;
    }
    if (state.votedSockets.has(socket.id) || (clientId && state.votedClients.has(clientId))) {
      socket.emit('vote:rejected', 'Ya votaste en esta ronda');
      return;
    }

    state.votedSockets.add(socket.id);
    if (clientId) state.votedClients.add(clientId);
    state.votes[index] += 1;

    socket.emit('vote:accepted', { index: index, round: state.round });
    broadcastState();

    if (state.expected && !state.fullNotified && totalVotes() >= state.expected) {
      state.fullNotified = true;
      io.to('hosts').emit('host:full', totalVotes());
    }
  });
});

app.use(express.static(path.join(__dirname, 'public')));
app.get('/healthz', (req, res) =>
  res.json({ ok: true, phase: state.phase, total: totalVotes(), qIndex: state.qIndex })
);

server.listen(PORT, () => {
  console.log(`Vota escuchando en http://localhost:${PORT}`);
  console.log(`Token del conductor: ${HOST_TOKEN}`);
  console.log(`Preguntas cargadas: ${questions.length}`);
});
