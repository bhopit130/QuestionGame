
/* ===== GameShow App (Teacher + Student) ===== */
const API_BASE = 'YOUR_APPS_SCRIPT_WEB_APP_URL'; // <<<< set this after deploying GAS
const POLL_MS = 1000;
const TIMER_SECONDS = 5;
const MAX_TEAMS = 10;

// Utilities
const $ = (sel, root=document) => root.querySelector(sel);
const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const uid = () => Math.random().toString(36).slice(2,9);
const now = () => Date.now();

function readHashParams(){
  const p = new URLSearchParams(location.hash.slice(1));
  return Object.fromEntries(p.entries());
}
function writeHashParams(obj){
  const p = new URLSearchParams(obj);
  location.hash = p.toString();
}

function defaultState(room){
  const board = {};
  for(const cat of window.GS_QUESTIONS){
    board[cat.id] = {};
    for(const item of cat.items) board[cat.id][item.points] = { used:false };
  }
  return {
    room: room || 'room1',
    createdAt: Date.now(),
    status: 'lobby', // lobby | in_question | reveal | ended
    teams: [], // {id,name,score}
    current: null, // {catId, points, questionText, answerText, startedAt}
    timer: { startedAt: null, duration: TIMER_SECONDS },
    board,
    submissions: [] // {teamId, teamName, text, at}
  };
}

// API (Google Apps Script)
async function apiGet(room){
  const url = API_BASE + '?action=get&room=' + encodeURIComponent(room);
  const res = await fetch(url, { cache:'no-store' });
  if(!res.ok) throw new Error('Network error');
  return await res.json();
}
async function apiSet(room, state){
  const res = await fetch(API_BASE + '?action=set&room=' + encodeURIComponent(room), {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify(state)
  });
  if(!res.ok) throw new Error('Save failed');
  return await res.json();
}
async function apiReset(room){
  const res = await fetch(API_BASE + '?action=reset&room=' + encodeURIComponent(room), { method:'POST' });
  return await res.json();
}

// Rendering helpers
function renderTeamsList(el, state, opts={}){
  el.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'col-12';
  for(const t of state.teams){
    const row = document.createElement('div');
    row.className = 'team-pill';
    row.innerHTML = `
      <span class="name">${t.name}</span>
      <div class="flex">
        ${opts.allowRename ? `<button class="btn" data-act="rename" data-id="${t.id}">แก้ชื่อ</button>`:''}
        ${opts.allowDelete ? `<button class="btn bad" data-act="del" data-id="${t.id}">ลบ</button>`:''}
        <span class="pts">${t.score ?? 0} pts</span>
      </div>
    `;
    wrap.appendChild(row);
  }
  el.appendChild(wrap);
}

function renderCategoryBoard(el, state, teacher=false){
  el.innerHTML = '';
  if(!state.selectedCategory){
    // show categories only
    const board = document.createElement('div');
    board.className = 'board';
    for(const cat of GS_QUESTIONS){
      const btn = document.createElement('button');
      btn.className = 'tile';
      btn.textContent = cat.title;
      btn.dataset.cat = cat.id;
      btn.disabled = state.status!=='lobby' && state.status!=='reveal';
      board.appendChild(btn);
    }
    el.appendChild(board);
  } else {
    // show point tiles for selected category
    const cat = GS_QUESTIONS.find(c=>c.id===state.selectedCategory);
    const head = document.createElement('div');
    head.className = 'row';
    head.innerHTML = `
      <div class="badge">หมวด: <strong style="margin-left:6px">${cat.title}</strong></div>
      ${teacher?'<button class="btn" id="btnBackCat">ย้อนกลับหมวด</button>':''}
    `;
    el.appendChild(head);
    const board = document.createElement('div');
    board.className = 'board';
    for(const item of cat.items){
      const used = state.board[cat.id][item.points].used;
      const tile = document.createElement('button');
      tile.className = 'tile'+(used?' used':'');
      tile.textContent = item.points + ' คะแนน';
      tile.dataset.points = item.points;
      tile.disabled = used || state.status==='in_question';
      board.appendChild(tile);
    }
    el.appendChild(board);
  }
}

function getQuestion(catId, points){
  const cat = GS_QUESTIONS.find(c=>c.id===catId);
  return cat.items.find(i=>i.points==points);
}

// Teacher App
async function startTeacher(){
  const els = {
    room: $('#room'),
    teamName: $('#teamName'),
    addTeam: $('#addTeam'),
    teams: $('#teams'),
    board: $('#board'),
    selectCat: $('#selectCat'),
    currentQ: $('#currentQ'),
    timer: $('#timer'),
    submissions: $('#submissions'),
    awardWrap: $('#awardWrap'),
    endBtn: $('#endGame'),
    resetBtn: $('#resetGame'),
    startBtn: $('#startTimer'),
    revealBtn: $('#revealAns'),
    showAns: $('#ansText'),
    newGameBtn: $('#newGame'),
    standings: $('#standings'),
  };

  let room = ($('#room').value || 'room1').trim();
  writeHashParams({ role:'teacher', room });

  // ensure state exists
  try {
    let state = await apiGet(room);
    if(!state || !state.room){
      state = defaultState(room);
      await apiSet(room, state);
    }
  } catch(e){
    console.error(e);
    alert('ยังไม่ตั้งค่า API_BASE หรือยังไม่ได้เผยแพร่ Apps Script');
  }

  async function refresh(){
    const state = await apiGet(room);
    bindState(state);
  }

  function bindState(state){
    // teams
    renderTeamsList(els.teams, state, {allowRename:true, allowDelete:true});
    // board
    renderCategoryBoard(els.board, state, true);

    // current question
    if(state.current){
      const q = state.current;
      els.currentQ.innerHTML = `
        <div class="badge">หมวด: ${GS_QUESTIONS.find(c=>c.id===q.catId).title}</div>
        <h3 style="margin:8px 0">${q.questionText}</h3>
      `;
      els.showAns.textContent = q.answerText || '';
    } else {
      els.currentQ.innerHTML = '<em>ยังไม่ได้เลือกคำถาม</em>';
      els.showAns.textContent = '';
    }

    // submissions table
    els.submissions.innerHTML = '';
    const table = document.createElement('table');
    table.className='table';
    table.innerHTML = '<thead><tr><th>เวลา</th><th>ทีม</th><th>คำตอบ</th><th>ให้คะแนน</th></tr></thead>';
    const tbody = document.createElement('tbody');
    for(const s of state.submissions){
      const tr = document.createElement('tr');
      const tName = (state.teams.find(t=>t.id===s.teamId)||{}).name || s.teamName || '—';
      tr.innerHTML = `
        <td>${new Date(s.at).toLocaleTimeString()}</td>
        <td>${tName}</td>
        <td>${s.text ?? ''}</td>
        <td><input type="checkbox" data-award="${s.teamId}"></td>
      `;
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    els.submissions.appendChild(table);

    // award panel
    els.awardWrap.innerHTML = '';
    if(state.current){
      const info = document.createElement('div');
      info.className='row';
      info.innerHTML = `
        <button class="btn ok" id="btnAward">ให้คะแนนทีมที่ถูก</button>
        <button class="btn" id="btnClearSub">ล้างคำตอบรอบนี้</button>
      `;
      els.awardWrap.appendChild(info);
    }

    // timer
    let remaining = 0;
    if(state.timer.startedAt){
      const passed = Math.floor((Date.now() - state.timer.startedAt)/1000);
      remaining = Math.max(0, state.timer.duration - passed);
    }
    els.timer.textContent = remaining ? remaining+'s' : 'พร้อมเริ่ม';
  }

  // Events
  $('#room').addEventListener('change', async e=>{
    room = e.target.value.trim() || 'room1';
    writeHashParams({ role:'teacher', room });
    await refresh();
  });

  $('#teams').addEventListener('click', async e=>{
    const btn = e.target.closest('button');
    if(!btn) return;
    const id = btn.dataset.id;
    let st = await apiGet(room);
    if(btn.dataset.act==='del'){
      st.teams = st.teams.filter(t=>t.id!==id);
      await apiSet(room, st);
      await refresh();
    }
    if(btn.dataset.act==='rename'){
      const t = st.teams.find(t=>t.id===id);
      const name = prompt('ตั้งชื่อทีมใหม่', t.name);
      if(name){
        t.name = name.slice(0,30);
        await apiSet(room, st);
        await refresh();
      }
    }
  });

  $('#addTeam').addEventListener('click', async ()=>{
    const name = $('#teamName').value.trim();
    if(!name) return alert('กรอกชื่อทีม');
    const st = await apiGet(room);
    if(st.teams.length>=MAX_TEAMS) return alert('ครบ 10 ทีมแล้ว');
    st.teams.push({id:uid(), name:name.slice(0,30), score:0});
    await apiSet(room, st);
    $('#teamName').value='';
    await refresh();
  });

  $('#board').addEventListener('click', async e=>{
    const btn = e.target.closest('.tile');
    if(!btn) return;
    const st = await apiGet(room);
    if(!st.selectedCategory){
      // pick category
      st.selectedCategory = btn.dataset.cat;
      await apiSet(room, st);
      await refresh();
    }else{
      // choose question by points
      const points = Number(btn.dataset.points);
      const q = getQuestion(st.selectedCategory, points);
      st.current = { catId: st.selectedCategory, points, questionText: q.q, answerText: q.a, startedAt:null };
      st.status = 'in_question';
      st.submissions = [];
      st.timer = { startedAt: null, duration: TIMER_SECONDS };
      await apiSet(room, st);
      await refresh();
    }
  });

  $('#board').addEventListener('click', async e=>{
    const back = e.target.closest('#btnBackCat');
    if(back){
      const st = await apiGet(room);
      st.selectedCategory = null;
      await apiSet(room, st);
      await refresh();
    }
  });

  $('#startTimer').addEventListener('click', async ()=>{
    const st = await apiGet(room);
    if(!st.current) return alert('ยังไม่ได้เลือกคำถาม');
    st.timer.startedAt = Date.now();
    await apiSet(room, st);
    await refresh();
  });

  $('#revealAns').addEventListener('click', async ()=>{
    const st = await apiGet(room);
    if(!st.current) return;
    st.status = 'reveal';
    await apiSet(room, st);
    await refresh();
  });

  $('#awardWrap').addEventListener('click', async e=>{
    if(e.target.id==='btnClearSub'){
      const st = await apiGet(room);
      st.submissions = [];
      await apiSet(room, st);
      await refresh();
      return;
    }
    if(e.target.id==='btnAward'){
      const st = await apiGet(room);
      const checked = $$('input[type="checkbox"][data-award]', $('#submissions'))
        .filter(i=>i.checked).map(i=>i.dataset.award);
      // award to selected teams (unique)
      const add = st.current?.points || 0;
      for(const id of new Set(checked)){
        const t = st.teams.find(x=>x.id===id);
        if(t) t.score += add;
      }
      // mark tile used & reset current
      if(st.current){
        st.board[st.current.catId][st.current.points].used = true;
      }
      st.current = null;
      st.status = 'lobby';
      st.submissions = [];
      st.timer = { startedAt:null, duration:TIMER_SECONDS };
      await apiSet(room, st);
      await refresh();
    }
  });

  $('#endGame').addEventListener('click', async ()=>{
    const st = await apiGet(room);
    st.status = 'ended';
    await apiSet(room, st);
    await refresh();
    // show standings
    const sorted = [...st.teams].sort((a,b)=>b.score - a.score);
    $('#standings').innerHTML = '<h3>สรุปผลอันดับ</h3>' + sorted.map((t,i)=>`<div class="team-pill"><span>#${i+1} ${t.name}</span><span class="pts">${t.score} pts</span></div>`).join('');
  });

  $('#resetGame, #newGame').addEventListener('click', async ()=>{
    if(!confirm('เริ่มเกมใหม่ทั้งหมด?')) return;
    await apiReset(room);
    await refresh();
  });

  // poll
  setInterval(refresh, POLL_MS);
  await refresh();
}

// Student App
async function startStudent(){
  const els = {
    room: $('#roomS'),
    teamName: $('#teamNameS'),
    joinBtn: $('#joinTeam'),
    youAre: $('#youAre'),
    board: $('#boardS'),
    currentQ: $('#currentQS'),
    timer: $('#timerS'),
    answer: $('#answerText'),
    send: $('#sendAnswer'),
    info: $('#infoS'),
  };
  let room = ($('#roomS').value || 'room1').trim();
  let myTeamId = localStorage.getItem('gs_team_id') || null;
  let myTeamName = localStorage.getItem('gs_team_name') || '';

  writeHashParams({ role:'student', room });

  async function refresh(){
    const st = await apiGet(room);
    bind(st);
  }
  function bind(st){
    // status
    if(myTeamId){
      const t = st.teams.find(x=>x.id===myTeamId);
      if(!t){ // team removed
        myTeamId = null; myTeamName='';
        localStorage.removeItem('gs_team_id'); localStorage.removeItem('gs_team_name');
      }else{
        els.youAre.innerHTML = `<div class="badge">ทีมของคุณ: <strong style="margin-left:6px">${t.name}</strong> <span class="badge" style="margin-left:6px">คะแนน: ${t.score}</span></div>`;
      }
    }else{
      els.youAre.innerHTML = '<div class="badge">ยังไม่เข้าร่วมทีม</div>';
    }

    // category/board only reflects selectedCategory and used tiles
    renderCategoryBoard(els.board, st, false);

    // current question and timer
    if(st.current){
      els.currentQ.innerHTML = `<h3>${st.current.questionText}</h3>` + (st.status==='reveal' ? `<div class="badge">เฉลย: ${st.current.answerText}</div>` : '');
    }else{
      els.currentQ.innerHTML = '<em>รอครูเลือกคำถาม…</em>';
    }

    // timer
    let remaining = 0;
    let started = st.timer.startedAt;
    if(started){
      const passed = Math.floor((Date.now() - started)/1000);
      remaining = Math.max(0, st.timer.duration - passed);
    }
    els.timer.textContent = started ? (remaining+'s') : 'รอเริ่ม';
    els.send.disabled = !(st.current && started && remaining===0 && myTeamId);
    els.answer.disabled = !(st.current && myTeamId);
    if(st.status==='reveal'){
      els.answer.value = '';
      els.send.disabled = true;
    }
  }

  // events
  els.room.addEventListener('change', e=>{
    room = e.target.value.trim() || 'room1';
    writeHashParams({ role:'student', room });
  });

  els.joinBtn.addEventListener('click', async ()=>{
    const name = els.teamName.value.trim();
    if(!name) return alert('กรอกชื่อทีม');
    let st = await apiGet(room);
    if(st.teams.some(t=>t.name===name)){
      // join existing
      const t = st.teams.find(t=>t.name===name);
      myTeamId = t.id; myTeamName = t.name;
    }else{
      if(st.teams.length>=MAX_TEAMS) return alert('ครบ 10 ทีมแล้ว');
      const newT = {id:uid(), name:name.slice(0,30), score:0};
      st.teams.push(newT);
      await apiSet(room, st);
      myTeamId = newT.id; myTeamName = newT.name;
    }
    localStorage.setItem('gs_team_id', myTeamId);
    localStorage.setItem('gs_team_name', myTeamName);
    els.teamName.value='';
    await refresh();
  });

  $('#sendAnswer').addEventListener('click', async ()=>{
    const text = els.answer.value.trim();
    if(!text) return alert('กรอกคำตอบ');
    const st = await apiGet(room);
    if(!(st.current)) return alert('ยังไม่มีคำถาม');
    // allow only one answer per team per question (replace last)
    const others = st.submissions.filter(s=>s.teamId!==myTeamId);
    others.push({teamId: myTeamId, teamName: myTeamName, text, at: Date.now()});
    st.submissions = others;
    await apiSet(room, st);
    els.answer.value='';
    await refresh();
  });

  setInterval(refresh, POLL_MS);
  await refresh();
}

// Entry
document.addEventListener('DOMContentLoaded', () => {
  const role = (readHashParams().role) || document.body.dataset.role;
  if(role==='teacher') startTeacher();
  if(role==='student') startStudent();
});
