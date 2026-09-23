import http from 'node:http';
import crypto from 'node:crypto';

const PORT = Number(process.env.PORT || 8787);
const rooms = new Map();

const json = (res, status, body) => {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS'
  });
  res.end(JSON.stringify(body));
};

const readBody = (req) => new Promise((resolve, reject) => {
  let data = '';
  req.on('data', (chunk) => data += chunk);
  req.on('end', () => {
    try { resolve(data ? JSON.parse(data) : {}); }
    catch (e) { reject(e); }
  });
});

const makeCode = () => {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += alphabet[Math.floor(Math.random() * alphabet.length)];
  return rooms.has(code) ? makeCode() : code;
};

const scoreGuess = (guess, target) => {
  const g = guess.split('');
  const t = target.split('');
  const states = Array(5).fill('absent');
  const remaining = {};
  for (let i = 0; i < 5; i++) {
    if (g[i] === t[i]) states[i] = 'correct';
    else remaining[t[i]] = (remaining[t[i]] || 0) + 1;
  }
  for (let i = 0; i < 5; i++) {
    if (states[i] === 'correct') continue;
    if ((remaining[g[i]] || 0) > 0) {
      states[i] = 'present';
      remaining[g[i]] -= 1;
    }
  }
  return states;
};

const getPlayer = (room, token) => {
  if (room.a.token === token) return 'a';
  if (room.b?.token === token) return 'b';
  return null;
};

const viewFor = (room, playerId) => {
  const me = room[playerId];
  const partnerId = playerId === 'a' ? 'b' : 'a';
  const partner = room[partnerId];
  const myResult = room.results[playerId] || { guesses: [], solved: false, finished: false };
  const partnerResult = room.results[partnerId] || { guesses: [], solved: false, finished: false };
  return {
    code: room.code,
    playerId,
    myName: me.name,
    partnerName: partner?.name || null,
    myWordReady: Boolean(room.words[playerId]),
    partnerWordReady: Boolean(room.words[partnerId]),
    myResult,
    partnerResult: {
      guessCount: partnerResult.guesses.length,
      solved: partnerResult.solved,
      finished: partnerResult.finished
    },
    completed: myResult.finished && partnerResult.finished,
    answer: myResult.finished ? room.words[partnerId] : null
  };
};

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return json(res, 200, { ok: true });
  const url = new URL(req.url, `http://${req.headers.host}`);
  const parts = url.pathname.split('/').filter(Boolean);

  try {
    if (req.method === 'GET' && url.pathname === '/health') return json(res, 200, { ok: true });

    if (req.method === 'POST' && url.pathname === '/rooms') {
      const body = await readBody(req);
      const name = String(body.name || '').trim();
      if (!name) return json(res, 400, { error: 'Name is required' });
      const code = makeCode();
      const token = crypto.randomUUID();
      const room = {
        code,
        a: { name, token },
        b: null,
        words: {},
        results: {
          a: { guesses: [], solved: false, finished: false },
          b: { guesses: [], solved: false, finished: false }
        }
      };
      rooms.set(code, room);
      return json(res, 201, { code, token, playerId: 'a' });
    }

    if (req.method === 'POST' && parts[0] === 'rooms' && parts[2] === 'join') {
      const code = parts[1]?.toUpperCase();
      const room = rooms.get(code);
      if (!room) return json(res, 404, { error: 'Room not found' });
      if (room.b) return json(res, 409, { error: 'Room already has two players' });
      const body = await readBody(req);
      const name = String(body.name || '').trim();
      if (!name) return json(res, 400, { error: 'Name is required' });
      const token = crypto.randomUUID();
      room.b = { name, token };
      return json(res, 200, { code, token, playerId: 'b' });
    }

    if (parts[0] === 'rooms' && parts[1]) {
      const code = parts[1].toUpperCase();
      const room = rooms.get(code);
      if (!room) return json(res, 404, { error: 'Room not found' });
      const token = url.searchParams.get('token') || req.headers['x-player-token'];
      const playerId = getPlayer(room, token);
      if (!playerId) return json(res, 401, { error: 'Invalid player token' });

      if (req.method === 'GET' && parts.length === 2) {
        return json(res, 200, viewFor(room, playerId));
      }

      if (req.method === 'POST' && parts[2] === 'word') {
        if (!room.b) return json(res, 409, { error: 'Wait for your partner to join' });
        const body = await readBody(req);
        const word = String(body.word || '').replace(/[^a-zA-Z]/g, '').toUpperCase();
        if (word.length !== 5) return json(res, 400, { error: 'Word must be 5 letters' });
        room.words[playerId] = word;
        return json(res, 200, viewFor(room, playerId));
      }

      if (req.method === 'POST' && parts[2] === 'guess') {
        const partnerId = playerId === 'a' ? 'b' : 'a';
        const target = room.words[partnerId];
        if (!target) return json(res, 409, { error: 'Partner has not set a word yet' });
        const result = room.results[playerId];
        if (result.finished) return json(res, 409, { error: 'Puzzle already finished' });
        const body = await readBody(req);
        const guess = String(body.guess || '').replace(/[^a-zA-Z]/g, '').toUpperCase();
        if (guess.length !== 5) return json(res, 400, { error: 'Guess must be 5 letters' });
        const states = scoreGuess(guess, target);
        result.guesses.push({ word: guess, states });
        result.solved = guess === target;
        result.finished = result.solved || result.guesses.length >= 6;
        return json(res, 200, viewFor(room, playerId));
      }
    }

    return json(res, 404, { error: 'Not found' });
  } catch (error) {
    console.error(error);
    return json(res, 500, { error: 'Server error' });
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Pairle local server running on http://0.0.0.0:${PORT}`);
});
