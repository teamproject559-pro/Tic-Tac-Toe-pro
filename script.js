// Constants
const EMPTY = null, HUMAN = 'X', BOT = 'O';
const WIN_LINES = [
  [0,1,2],[3,4,5],[6,7,8],
  [0,3,6],[1,4,7],[2,5,8],
  [0,4,8],[2,4,6]
];

// DOM refs
const boardEl = document.getElementById('board');
const statusEl = document.getElementById('status');
const tlogEl = document.getElementById('tlog');
const qcountEl = document.getElementById('qcount');
const modeSel = document.getElementById('modeSel');
const trainBtn = document.getElementById('trainBtn');
const resetBtn = document.getElementById('resetBtn');
const saveBtn = document.getElementById('saveBtn');
const clearBtn = document.getElementById('clearBtn');

// Game state
let board = Array(9).fill(null);
let qtable = loadQ();
let mode = modeSel.value;

// --- RENDER BOARD ---
function renderBoard() {
  boardEl.innerHTML = '';
  board.forEach((v,i)=>{
    const btn = document.createElement('button');
    btn.className = 'cell';
    btn.textContent = v || '';
    btn.onclick = ()=> humanPlay(i);
    boardEl.appendChild(btn);
  });
  qcountEl.textContent = Object.keys(qtable).length;
}

// --- UTILITIES ---
function encodeState(b){ return b.map(x => x === null ? '_' : x).join(''); }

function getWinner(b){
  for (const [a,c,d] of WIN_LINES){
    if (b[a] && b[a] === b[c] && b[a] === b[d]) return b[a];
  }
  if (b.every(x=> x !== null)) return 'draw';
  return null;
}

function availableActions(b){
  return b.map((v,i)=> v===null?i:-1).filter(i=> i!==-1);
}

function loadQ(){
  try{ return JSON.parse(localStorage.getItem('tictactoe_q')||'{}'); }
  catch(e){ return {}; }
}

function saveQ(q){
  localStorage.setItem('tictactoe_q', JSON.stringify(q));
  qtable = q;
  qcountEl.textContent = Object.keys(qtable).length;
}

// ε-greedy selection
function chooseAction(q, state, validActions, epsilon){
  if (Math.random() < epsilon)
    return validActions[Math.floor(Math.random()*validActions.length)];
  const qarr = q[state] || Array(9).fill(0);
  let bestA = validActions[0], bestV = -Infinity;
  for (const a of validActions){
    const v = qarr[a] ?? 0;
    if (v > bestV){ bestV = v; bestA = a; }
  }
  return bestA;
}

function applyAction(b, a, player){
  const nb = b.slice();
  nb[a] = player;
  return nb;
}

// --- BOT MOVE ---
function botMove(q, b, epsilon=0){
  const state = encodeState(b);
  const acts = availableActions(b);
  if (acts.length===0) return b;
  const a = chooseAction(q, state, acts, epsilon);
  return applyAction(b, a, BOT);
}

// --- HUMAN PLAY ---
function humanPlay(i){
  if (board[i] !== null) return;
  if (getWinner(board)) return;

  board = applyAction(board, i, HUMAN);
  renderBoard();

  const w = getWinner(board);
  if (w){
    statusEl.textContent = w === HUMAN ? 'You win!' : 'Draw';
    return;
  }

  let eps = (mode === 'easy' ? 1 : mode === 'medium' ? 0.25 : 0);
  board = botMove(qtable, board, eps);
  renderBoard();

  const w2 = getWinner(board);
  if (w2)
    statusEl.textContent = w2 === BOT ? 'Bot wins' : 'Draw';
  else
    statusEl.textContent = 'Your turn';
}

// --- TRAINING ---
async function trainEpisodes(episodes, opts={alpha:0.5,gamma:0.9,epsilonStart:1.0,epsilonEnd:0.05}){
  const {alpha,gamma,epsilonStart,epsilonEnd} = opts;
  let q = loadQ();

  for (let ep=0; ep<episodes; ep++){
    let b = Array(9).fill(null);
    let done = false;
    let turn = HUMAN;

    const eps = epsilonStart + (epsilonEnd - epsilonStart) * (ep/Math.max(1,episodes-1));

    while (!done){
      if (turn === HUMAN){
        const acts = availableActions(b);
        if (!acts.length) break;
        const a = acts[Math.floor(Math.random()*acts.length)];
        b = applyAction(b,a,HUMAN);
        if (getWinner(b)){ done = true; break; }
        turn = BOT;
      } else {
        const sBefore = encodeState(b);
        const acts = availableActions(b);
        if (!acts.length) break;
        const a = chooseAction(q, sBefore, acts, eps);

        b = applyAction(b,a,BOT);
        const sAfter = encodeState(b);

        const winner = getWinner(b);
        let reward = 0;
        if (winner){
          done = true;
          if (winner === BOT) reward = 1;
          else if (winner === HUMAN) reward = -1;
        }

        if (!q[sBefore]) q[sBefore] = Array(9).fill(0);
        if (!q[sAfter]) q[sAfter] = Array(9).fill(0);

        const maxNext = Math.max(...q[sAfter]);

        q[sBefore][a] += alpha * (reward + gamma*maxNext - q[sBefore][a]);

        turn = HUMAN;
      }
    }

    if (ep % 200 === 0){
      tlogEl.textContent = `trained ${ep}/${episodes}`;
      await new Promise(r=>setTimeout(r,8));
    }
  }

  saveQ(q);
  return q;
}

// --- UI HANDLERS ---
trainBtn.onclick = async ()=>{
  trainBtn.disabled = true;
  trainBtn.textContent = 'Training...';

  mode = modeSel.value;

  let episodes = 5000, eStart=1.0, eEnd=0.05;
  if (mode==='easy'){ episodes=300; eStart=0.6; eEnd=0.3; }
  else if (mode==='medium'){ episodes=4000; eStart=0.9; eEnd=0.1; }
  else { episodes=22000; eStart=1.0; eEnd=0.01; }

  tlogEl.textContent = 'starting...';

  const batch = Math.max(100, Math.floor(episodes/40));
  let total = 0;
  let q = loadQ();

  for (let done=0; done<episodes; done+=batch){
    const take = Math.min(batch, episodes-done);
    q = await trainEpisodes(take, {alpha:0.5,gamma:0.9,epsilonStart:eStart,epsilonEnd:eEnd});
    total += take;
    tlogEl.textContent = `trained ${total}/${episodes}`;
  }

  qtable = q;
  qcountEl.textContent = Object.keys(qtable).length;
  tlogEl.textContent = `training complete (${episodes})`;

  trainBtn.disabled = false;
  trainBtn.textContent = 'Train';
  statusEl.textContent = 'Training finished — play against the bot.';
};

resetBtn.onclick = ()=>{
  board = Array(9).fill(null);
  renderBoard();
  statusEl.textContent = 'Your turn (you are X)';
};

modeSel.onchange = ()=> mode = modeSel.value;

saveBtn.onclick = ()=>{ saveQ(qtable); tlogEl.textContent = 'Q saved to localStorage.'; };

clearBtn.onclick = ()=>{
  localStorage.removeItem('tictactoe_q');
  qtable = {};
  qcountEl.textContent = 0;
  tlogEl.textContent = 'Q cleared.';
};

// Init
renderBoard();
