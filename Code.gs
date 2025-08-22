
// ===== Google Apps Script backend (Code.gs) =====
// Create a Google Sheet named 'GameShow' with a sheet 'Rooms' and 2 columns: Room, JSON
// Deploy as web app: Execute as you, Anyone with the link
const SHEET_NAME = 'Rooms';

function getSheet(){
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(SHEET_NAME);
  if(!sh){
    sh = ss.insertSheet(SHEET_NAME);
    sh.getRange(1,1,1,2).setValues([['Room','JSON']]);
  }
  return sh;
}

function _findRow(sh, room){
  const values = sh.getRange(1,1, sh.getLastRow(), 2).getValues();
  for(let i=2;i<=values.length;i++){
    if(values[i-1][0]===room) return i;
  }
  return -1;
}

function doGet(e){
  const action = (e.parameter.action||'').toLowerCase();
  const room = (e.parameter.room||'room1').trim();
  if(action==='get'){
    return _resp(200, getState(room));
  }
  return _resp(400, {error:'Unknown action'});
}

function doPost(e){
  const action = (e.parameter.action||'').toLowerCase();
  const room = (e.parameter.room||'room1').trim();
  if(action==='set'){
    const body = JSON.parse(e.postData.contents||'{}');
    saveState(room, body);
    return _resp(200, {ok:true});
  }
  if(action==='reset'){
    const state = defaultState(room);
    saveState(room, state);
    return _resp(200, {ok:true});
  }
  return _resp(400, {error:'Unknown action'});
}

function defaultState(room){
  const board = {};
  const questions = getQuestions();
  for(const cat of questions){
    board[cat.id] = {};
    for(const item of cat.items){ board[cat.id][item.points] = { used:false }; }
  }
  return {
    room: room,
    createdAt: Date.now(),
    status: 'lobby',
    teams: [],
    current: null,
    timer: { startedAt: null, duration: 5 },
    board: board,
    selectedCategory: null,
    submissions: []
  };
}

function getState(room){
  const sh = getSheet();
  let row = _findRow(sh, room);
  if(row<0){
    const st = defaultState(room);
    sh.appendRow([room, JSON.stringify(st)]);
    return st;
  }
  const json = sh.getRange(row,2).getValue();
  if(!json){ 
    const st = defaultState(room);
    sh.getRange(row,2).setValue(JSON.stringify(st));
    return st;
  }
  try{
    return JSON.parse(json);
  }catch(err){
    return defaultState(room);
  }
}

function saveState(room, state){
  const sh = getSheet();
  let row = _findRow(sh, room);
  if(row<0){
    sh.appendRow([room, JSON.stringify(state)]);
  }else{
    sh.getRange(row,2).setValue(JSON.stringify(state));
  }
}

function _resp(code, obj){
  const out = ContentService.createTextOutput(JSON.stringify(obj));
  out.setMimeType(ContentService.MimeType.JSON);
  return out;
}

// Hardcode question metadata server-side to keep board shape in sync
function getQuestions(){
  return [
    { id:'cat1', title:'วัสดุ', items:[{points:100},{points:200},{points:300},{points:400},{points:500},{points:600},{points:700}] },
    { id:'cat2', title:'อุปกรณ์และเครื่องมือ', items:[{points:100},{points:200},{points:300},{points:400},{points:500},{points:600},{points:700}] },
    { id:'cat3', title:'กลไก', items:[{points:100},{points:200},{points:300},{points:400},{points:500},{points:600},{points:700}] },
    { id:'cat4', title:'อินเทอร์เน็ตเบื้องต้น', items:[{points:100},{points:200},{points:300},{points:400},{points:500},{points:600},{points:700}] },
    { id:'cat5', title:'บริการอินเทอร์เน็ต', items:[{points:100},{points:200},{points:300},{points:400},{points:500},{points:600},{points:700}] },
    { id:'cat6', title:'โครงสร้างอินเทอร์เน็ต', items:[{points:100},{points:200},{points:300},{points:400},{points:500},{points:600},{points:700}] },
    { id:'cat7', title:'ระบบเว็บแอปด้วย Canva AI', items:[{points:100},{points:200},{points:300},{points:400},{points:500},{points:600},{points:700}] }
  ];
}
