// Night Shift Chatroom - Interactive Narrative Prototype
// Comments are in English, UI text stays Chinese.

(function(){
  // ----------------------------
  // Global State
  // ----------------------------
  const state = {
    sceneIndex: 0,
    scenes: [],
    visited: { dmChenJie: false, dmZhengFang: false, dmZhangYu: false },
    unlocks: { dasKapital: false },
    choices: { chenJie: null, zhengFang: null, zhangYu: null },
    zf: null, // mini-game lite
    // message queue for click-to-advance
    msgQueue: [],
    msgIndex: -1,
    queueDone: null,
    queueOptions: { autoInterval: 0 },
    queueAutoTimer: null,
    queueAutoFast: false,
    queuePaused: false,
    queueThreadId: null,
    // per-thread message logs for persistence
    logs: { group: [], 'dm-chenjie': [], 'dm-zhengfang': [], 'dm-zhangyu': [], 'dm-daskapital': [] },
    // typing state (for typewriter effect)
    typing: { timer: null, el: null, full: '', idx: 0, onDone: null, active: false, perChar: 30 },
    // runtime settings
    settings: {
      messageDurationMs: 1000, // default typed duration per message
      pauseBetweenMsgsMs: 120, // short pause between messages
      minCharMs: 18,
      maxCharMs: 60,
    },
    // prologue queue
    proQueue: [],
    proIndex: -1,
    proDone: null,
    proTyping: { timer: null, el: null, full: '', idx: 0, active: false, perChar: 30 },
    didPrologue: false,
    part1GroupPlayed: false,
    // transient flags
    pendingNightTransition: false,
    pendingTransitionKey: null,
    // gating flags
    gates: {
      part1ChoiceMade: false,
      part1SecondChoiceMade: false,
      p3_cj_groupIntroDone: false,
      p3_cj_started: false,
      p3_cj_marxPlayed: false,
      p2_dossier_chenjie_shown: false,
      p2_dossier_zhengfang_shown: false,
      p2_dossier_zhangyu_shown: false,
      p3_zf_groupIntroDone: false,
      p3_zf_prePlayed: false,
      p3_zy_groupIntroDone: false,
      p3_zy_marxShown: false,
    },
  };

  // ----------------------------
  // Assets & Elements
  // ----------------------------
  const AVATARS = {
    group: '图片/群头像.png',
    you: '图片/主角.png',
    chenjie: '图片/陈洁.png',
    zhengfang: '图片/郑芳.png',
    zhangyu: '图片/张宇.png',
    daskapital: '图片/马克思.JPG'
  };

  const els = {
    // topbar
    btnNotebook: document.getElementById('btnNotebook'),
    btnMusic: document.getElementById('btnMusic'),
    btnNotice: document.getElementById('btnNotice'),
    btnTheme: document.getElementById('btnTheme'),
    btnPrev: document.getElementById('btnPrev'),
    btnNext: document.getElementById('btnNext'),
    // panels
    notebook: document.getElementById('notebook'),
    musicPlayer: document.getElementById('musicPlayer'),
    noticeBoard: document.getElementById('noticeBoard'),
    // notebook internals
    closeNotebook: document.getElementById('closeNotebook'),
    threadList: document.getElementById('threadList'),
    peerAvatar: document.getElementById('peerAvatar'),
    peerName: document.getElementById('peerName'),
    peerMeta: document.getElementById('peerMeta'),
    chatLog: document.getElementById('chatLog'),
    choiceBar: document.getElementById('choiceBar'),
    btnOpenAnalysis: document.getElementById('btnOpenAnalysis'),
    // music internals
    closeMusic: document.getElementById('closeMusic'),
    audio: document.getElementById('audio'),
    disc: document.getElementById('disc'),
    progressBar: document.getElementById('progressBar'),
    currentTime: document.getElementById('currentTime'),
    duration: document.getElementById('duration'),
    btnPrevTrack: document.getElementById('btnPrevTrack'),
    btnPlayPause: document.getElementById('btnPlayPause'),
    btnNextTrack: document.getElementById('btnNextTrack'),
    trackList: document.getElementById('trackList'),
    // notice internals
    closeNotice: document.getElementById('closeNotice'),
    objectiveList: document.getElementById('objectiveList'),
    // transition & modal
    transition: document.getElementById('transition'),
    transitionText: document.getElementById('transitionText'),
    modal: document.getElementById('modal'),
    closeModal: document.getElementById('closeModal'),
    analysisFrame: document.getElementById('analysisFrame'),
    // history modal
    btnOpenHistory: document.getElementById('btnOpenHistory'),
    historyModal: document.getElementById('historyModal'),
    closeHistoryModal: document.getElementById('closeHistoryModal'),
    historyLog: document.getElementById('historyLog'),
    // profile dossier modal
    profileModal: document.getElementById('profileModal'),
    closeProfileModal: document.getElementById('closeProfileModal'),
    profileAvatar: document.getElementById('profileAvatar'),
    profileName: document.getElementById('profileName'),
    profileMeta: document.getElementById('profileMeta'),
    profileBullets: document.getElementById('profileBullets'),
    // prologue
    prologue: document.getElementById('prologue'),
    prologueLog: document.getElementById('prologueLog'),
    // speed controls
    speedSlider: document.getElementById('speedSlider'),
    speedValue: document.getElementById('speedValue'),
    speedSlow: document.getElementById('speedSlow'),
    speedMedium: document.getElementById('speedMedium'),
    speedFast: document.getElementById('speedFast'),
  };

  // ----------------------------
  // Utilities
  // ----------------------------
  function clear(el){ while(el.firstChild) el.removeChild(el.firstChild); }
  function formatTime(sec){ if(!isFinite(sec)) return '0:00'; const m=Math.floor(sec/60), s=Math.floor(sec%60); return `${m}:${s.toString().padStart(2,'0')}`; }
  function applyTheme(){ const isGray = state.settings && state.settings.theme === 'spacegray'; document.body.classList.toggle('theme-spacegray', !!isGray); if(els.btnTheme){ els.btnTheme.textContent = isGray ? '🖥️ 默认' : '🖥️ 深空灰'; } }

  // Pause queue when thread changes to avoid cross-thread mixing
  function pauseQueueOnThreadSwitch(){
    state.queuePaused = true;
    state.queueThreadId = state.queueThreadId || null; // keep origin but pause
    if(state.queueAutoTimer){ clearTimeout(state.queueAutoTimer); state.queueAutoTimer=null; }
    state.queueAutoFast = false;
    stopTyping(true);
  }

  // If user had progressed but group intro logs were lost, rehydrate them silently
  function ensureZyGroupIntro(){
    try{
      if(!state.gates || !state.gates.p3_zy_groupIntroDone) return;
      if(!state.logs) state.logs = { group: [], 'dm-chenjie': [], 'dm-zhengfang': [], 'dm-zhangyu': [], 'dm-daskapital': [] };
      const g = Array.isArray(state.logs.group) ? state.logs.group : [];
      const hasIntro = g.some(m => m && m.type==='system' && String(m.text||'').includes('傍晚，下着大雨。群聊中'));
      if(hasIntro) return;
      const intro = [
        { type:'system', text:'[时间：傍晚，下着大雨。群聊中。]' },
        { type:'image', name:'@风里来雨里去 (张宇)', avatar:AVATARS.zhangyu, imgSrc:'图片/屋檐下躲雨自拍.png' },
        { type:'msg', name:'@风里来雨里去 (张宇)', avatar:AVATARS.zhangyu, text:'平台又改规则了，配送费降了，但超时罚款还高了。今天跑了9个小时，才赚了这点钱。说好的“时间自由”呢？' },
        { type:'msg', name:'@芳芳Fighting (郑芳)', avatar:AVATARS.zhengfang, text:'天啊，下这么大雨还在外面跑，太危险了！快回家吧！' },
      ];
      pushLog('group', intro);
      saveState();
    }catch(e){}
  }

  // logs helpers
  function getCurrentThreadId(){ return currentThread; }
  function pushLog(threadId, msgs){
    if(!threadId) return;
    if(!state.logs[threadId]) state.logs[threadId] = [];
    // Shallow copy messages to avoid accidental mutation
    msgs.forEach(m=>{ state.logs[threadId].push(Object.assign({}, m)); });
    saveState();
  }

  function createMsg({type='msg', name='', avatar='', text='', imgSrc=''}){
    const wrap = document.createElement('div'); wrap.className = `msg ${type}`;
    if(type==='system' || type==='narration'){
      const b = document.createElement('div'); b.className='bubble'; b.innerHTML=text; wrap.appendChild(document.createElement('div')); wrap.appendChild(b); return wrap;
    }
    const av = document.createElement('img'); av.className='avatar'; av.src = avatar || AVATARS.group; av.alt = name;
    const bubble = document.createElement('div'); bubble.className='bubble';
    const label = document.createElement('div'); label.className='name'; label.textContent=name; bubble.appendChild(label);
    if(type==='image'){
      const img=document.createElement('img'); img.className='inline-image'; img.src=imgSrc; img.alt=text||''; bubble.appendChild(img);
      if(text){ const cap=document.createElement('div'); cap.style.marginTop='6px'; cap.style.fontSize='12px'; cap.style.color='#bdbdbd'; cap.textContent=text; bubble.appendChild(cap);}    
    } else { const p=document.createElement('div'); p.innerHTML=text; bubble.appendChild(p); }
    wrap.appendChild(av); wrap.appendChild(bubble); return wrap;
  }

  // ----------------------------
  // Profile dossier modal helpers
  // ----------------------------
  function openProfileModal(data){
    if(!els.profileModal) return;
    const d = data || {};
    if(els.profileAvatar){ els.profileAvatar.src = d.avatar || AVATARS.group; els.profileAvatar.alt = d.name || 'profile'; }
    if(els.profileName) els.profileName.textContent = d.name || '';
    if(els.profileMeta) els.profileMeta.textContent = d.meta || '';
    if(els.profileBullets){
      clear(els.profileBullets);
      (d.bullets || []).forEach(b=>{ const li=document.createElement('li'); li.textContent=b; els.profileBullets.appendChild(li); });
    }
    els.profileModal.classList.remove('hidden');
    els.profileModal.setAttribute('aria-hidden','false');
  }
  function closeProfile(){ if(!els.profileModal) return; els.profileModal.classList.add('hidden'); els.profileModal.setAttribute('aria-hidden','true'); }

  const PROFILE_DATA = {
    chenjie: { avatar: AVATARS.chenjie, name: '@赛博画手 (陈洁)', meta: '自由插画师', bullets: ['背负 3.8 万助学贷款', 'AI 抢单率上升 47%'] },
    zhengfang: { avatar: AVATARS.zhengfang, name: '@芳芳Fighting (郑芳)', meta: '短视频作者', bullets: ['粉丝数达百万量级', '近期创作压力大、常失眠', '反思“数据崇拜”与真实表达'] },
    zhangyu: { avatar: AVATARS.zhangyu, name: '@风里来雨里去 (张宇)', meta: '外卖骑手', bullets: ['常态化日在线 > 10 小时', '雨天补贴波动大', '算法规则频繁调整'] },
  };
  function getProfileData(key){ return PROFILE_DATA[key] || {}; }
  function renderMessages(msgs){ clear(els.chatLog); msgs.forEach(m=>{ const el=createMsg(m); el.classList.add('reveal'); els.chatLog.appendChild(el); }); els.chatLog.scrollTop = els.chatLog.scrollHeight; }
  function appendMessages(msgs){ const tid=getCurrentThreadId(); msgs.forEach(m=>{ const el=createMsg(m); el.classList.add('reveal'); els.chatLog.appendChild(el); }); els.chatLog.scrollTop = els.chatLog.scrollHeight; if(tid) pushLog(tid, msgs); }
  function restoreThreadLogs(threadId){ const arr = (state.logs && state.logs[threadId]) ? state.logs[threadId] : []; if(arr && arr.length){ renderMessages(arr); return true; } return false; }
  function renderChoices(choices){
    clear(els.choiceBar);
    if(!choices||!choices.length){ els.choiceBar.classList.add('hidden'); return;}
    els.choiceBar.classList.remove('hidden');
    choices.forEach(c=>{
      const b=document.createElement('button'); b.className='choice-btn'; b.textContent=c.label;
      b.addEventListener('click', (e)=>{ e.stopPropagation(); c.onChoose(); });
      els.choiceBar.appendChild(b);
    });
  }
  function showTransition(text, cb){ els.transitionText.textContent=text; els.transition.classList.remove('hidden'); els.transition.classList.add('show'); setTimeout(()=>{ els.transition.classList.remove('show'); setTimeout(()=>{ els.transition.classList.add('hidden'); if(cb) cb(); }, 400); }, 1400); }

  // ----------------------------
  // Click-to-advance queue
  // ----------------------------
  function hasVisibleChoices(){
    return !els.choiceBar.classList.contains('hidden') && els.choiceBar.childElementCount > 0;
  }

  function startQueue(messages, onComplete, opts){
    const defaultMs = state.settings?.messageDurationMs || 0;
    const options = Object.assign({ clear: true, showFirst: true, autoInterval: defaultMs, pauseInitially: false }, opts||{});
    
    // Clear any existing queue to prevent conflicts
    if(state.queueAutoTimer){ clearTimeout(state.queueAutoTimer); state.queueAutoTimer = null; }
    
    state.msgQueue = messages || [];
    state.msgIndex = -1;
    state.queueDone = typeof onComplete === 'function' ? onComplete : null;
    state.queueOptions = { autoInterval: options.autoInterval|0 };
    state.queueAutoFast = false;
    state.queueThreadId = currentThread; // bind queue to originating thread
    state.queuePaused = !!options.pauseInitially;
    
    if(options.clear) clear(els.chatLog);
    renderChoices([]);
    
    // In typed mode, we do not pre-append the first item; we let scheduler handle typing.
    if(options.showFirst && state.msgQueue.length && state.queueOptions.autoInterval<=0){
      state.msgIndex = 0;
      const el=createMsg(state.msgQueue[0]); el.classList.add('reveal'); els.chatLog.appendChild(el);
      els.chatLog.scrollTop = els.chatLog.scrollHeight;
    }
    scheduleAutoTick();
  }

  function finishQueue(){
    const done = state.queueDone; state.queueDone = null; state.msgQueue = []; state.msgIndex = -1;
    state.queueOptions = { autoInterval: 0 };
    state.queueAutoFast = false;
    if(state.queueAutoTimer){ clearTimeout(state.queueAutoTimer); state.queueAutoTimer = null; }
    // stop typing if any
    stopTyping(true);
    if(typeof done === 'function') done();
  }

  function scheduleAutoTick(){
    // If no auto playback configured, do nothing
    if(state.queueOptions.autoInterval <= 0) return;
    // If thread changed, do not continue queue in another thread
    if(state.queueThreadId && currentThread !== state.queueThreadId) return;
    if(state.queuePaused) return;
    if(state.queueAutoTimer){ clearTimeout(state.queueAutoTimer); state.queueAutoTimer=null; }
    // If fast-forward requested, flush all remaining instantly.
    if(state.queueAutoFast){
      stopTyping(true);
      while(state.msgIndex < state.msgQueue.length - 1){
        state.msgIndex++;
        const el=createMsg(state.msgQueue[state.msgIndex]); el.classList.add('reveal'); els.chatLog.appendChild(el);
      }
      els.chatLog.scrollTop = els.chatLog.scrollHeight;
      finishQueue();
      return;
    }
    // Append next message using typewriter effect
    if(state.msgIndex < state.msgQueue.length - 1){
      state.msgIndex++;
      const msg = state.msgQueue[state.msgIndex];
      appendTypedMessage(msg, state.queueOptions.autoInterval, ()=>{
        if(state.msgIndex === state.msgQueue.length - 1){
          finishQueue();
        } else {
          // small pause between messages
          state.queueAutoTimer = setTimeout(()=>{ scheduleAutoTick(); }, state.settings.pauseBetweenMsgsMs);
        }
      });
    } else {
      finishQueue();
    }
  }

  // Append the next queued message immediately (one step only)
  function appendNextNow(){
    if(state.queueOptions.autoInterval <= 0) return;
    if(state.queueThreadId && currentThread !== state.queueThreadId) return;
    state.queuePaused = true; // switch to manual stepping
    if(state.queueAutoTimer){ clearTimeout(state.queueAutoTimer); state.queueAutoTimer=null; }
    if(state.msgIndex < state.msgQueue.length - 1){
      state.msgIndex++;
      const msg = state.msgQueue[state.msgIndex];
      appendTypedMessage(msg, state.queueOptions.autoInterval, ()=>{
        if(state.msgIndex === state.msgQueue.length - 1){ finishQueue(); }
        // Do not schedule next automatically; wait for next user click
      });
    } else {
      finishQueue();
    }
  }

  function appendTypedMessage(msg, totalDuration, done){
    const tid = state.queueThreadId || getCurrentThreadId();
    // Images append instantly
    if(msg.type==='image'){
      // Only append to DOM when in the same thread
      if(!state.queueThreadId || currentThread===state.queueThreadId){ const el=createMsg(msg); el.classList.add('reveal'); els.chatLog.appendChild(el); els.chatLog.scrollTop=els.chatLog.scrollHeight; }
      pushLog(tid, [msg]); done&&done(); return;
    }
    // Build empty message shell
    const shell = createMsg(Object.assign({}, msg, { text: '' }));
    shell.classList.add('reveal');
    // Append shell only when in the same thread as queue
    if(!state.queueThreadId || currentThread===state.queueThreadId){
      els.chatLog.appendChild(shell);
      els.chatLog.scrollTop = els.chatLog.scrollHeight;
    }
    // Find text target element
    let textEl;
    if(msg.type==='system' || msg.type==='narration'){
      textEl = shell.querySelector('.bubble');
    } else {
      const bubble = shell.querySelector('.bubble');
      // second child div is the text content
      textEl = bubble && bubble.querySelector('div:nth-child(2)');
      if(!textEl){ textEl = bubble; }
    }
    const full = String(msg.text||'');
    if(!textEl || !full){ done&&done(); return; }
    // compute per-char speed based on totalDuration
    const len = Math.max(1, full.length);
    const ms = Math.max(state.settings.minCharMs, Math.min(state.settings.maxCharMs, Math.floor(totalDuration/len)));
    // start typing
    const userDone = typeof done==='function' ? done : null;
    startTyping(textEl, full, ms, ()=>{ pushLog(tid, [msg]); if(userDone) userDone(); });
  }

  function startTyping(el, full, perCharMs, onDone){
    stopTyping(true);
    state.typing = { timer: null, el, full, idx: 0, onDone, active: true, perChar: perCharMs };
    // First tick immediately for responsiveness
    const tick = ()=>{
      if(!state.typing.active) return;
      if(state.queueAutoFast){ // flush
        el.textContent = full;
        stopTyping(false);
        onDone && onDone();
        return;
      }
      if(state.typing.idx >= full.length){
        stopTyping(false);
        onDone && onDone();
        return;
      }
      state.typing.idx++;
      el.textContent = full.slice(0, state.typing.idx);
    };
    tick();
    state.typing.timer = setInterval(tick, Math.max(5, perCharMs));
  }

  function stopTyping(clearOnly){
    if(state.typing && state.typing.timer){ clearInterval(state.typing.timer); }
    if(state.typing){ state.typing.timer=null; state.typing.active=false; }
    if(!clearOnly){}
  }

  function advanceQueue(){
    // More lenient thread checking - only block if queue is from a different thread AND that thread is still locked
    if(state.queueThreadId && currentThread !== state.queueThreadId && state.queueThreadId !== 'group') {
      console.log('Queue blocked: current thread', currentThread, 'vs queue thread', state.queueThreadId);
      return;
    }
    
    // If a typewriter is running, finish current message immediately
    if(state.typing && state.typing.active){
      state.queuePaused = true; // pause auto sequence on user interaction
      const isLast = (state.msgIndex === state.msgQueue.length - 1);
      const done = state.typing.onDone;
      if(state.typing.el){ state.typing.el.textContent = state.typing.full; }
      stopTyping(false);
      // Do NOT fast-forward remaining; only complete current line
      // Do not call done(), to avoid scheduling next automatically
      // Persist this finished line to logs as we bypass onDone (use queue thread id)
      if(state.msgQueue && state.msgIndex>=0){ const tid = state.queueThreadId || getCurrentThreadId(); pushLog(tid, [ state.msgQueue[state.msgIndex] ]); }
      if(isLast){ finishQueue(); }
      return;
    }
    if(!state.msgQueue || !state.msgQueue.length) return;
    if(hasVisibleChoices()) return; // wait for user to choose at key points
    // if auto mode, clicking acts as fast-forward
    if(state.queueOptions && state.queueOptions.autoInterval > 0){
      // Show only ONE next message, not flush all, and pause auto
      state.queuePaused = true;
      appendNextNow();
      return;
    }
    // already showed first item; go next
    if(state.msgIndex < state.msgQueue.length - 1){
      state.msgIndex++;
      const msgElement = createMsg(state.msgQueue[state.msgIndex]);
      msgElement.classList.add('reveal');
      els.chatLog.appendChild(msgElement);
      els.chatLog.scrollTop = els.chatLog.scrollHeight;
      // Save to logs immediately for better persistence
      const tid = state.queueThreadId || getCurrentThreadId();
      pushLog(tid, [state.msgQueue[state.msgIndex]]);
      // if we just appended the last item, auto-finish
      if(state.msgIndex === state.msgQueue.length - 1){
        finishQueue();
      }
    } else {
      // finished
      finishQueue();
    }
  }

  // ----------------------------
  // Threads
  // ----------------------------
  let currentThread = 'group';
  function renderThreadsForScene(sceneKey){
    clear(els.threadList);
    const marxLocked = !state.unlocks.dasKapital;
    function push(id,name,avatar,desc,locked){ const li=document.createElement('li'); li.className='thread-item'+(currentThread===id?' active':''); const img=document.createElement('img'); img.src=avatar; img.alt=name; const meta=document.createElement('div'); meta.className='meta'; const n=document.createElement('div'); n.className='name'; n.textContent=name; const d=document.createElement('div'); d.className='desc'; d.textContent=desc||''; meta.appendChild(n); meta.appendChild(d); li.appendChild(img); li.appendChild(meta); if(locked){ const l=document.createElement('div'); l.className='locked'; l.textContent='🔒'; li.appendChild(l);} if(!locked){ li.addEventListener('click', ()=>{ pauseQueueOnThreadSwitch(); currentThread=id; renderThreadsForScene(sceneKey); rebuildSceneForThread(); }); } els.threadList.appendChild(li); }
    if(sceneKey==='part1'){
      // Default to group chat
      currentThread = 'group';
      push('group','群聊 · 夜班聊天室',AVATARS.group,'4 人');
      // In part1, DMs are offline and locked (not clickable)
      push('dm-chenjie','@赛博画手 (陈洁)',AVATARS.chenjie,'离线', true);
      push('dm-zhengfang','@芳芳Fighting (郑芳)',AVATARS.zhengfang,'离线', true);
      push('dm-zhangyu','@风里来雨里去 (张宇)',AVATARS.zhangyu,'离线', true);
      push('dm-daskapital','DasKapital (马克思)',AVATARS.daskapital,'未解锁',true);
    }
    else if(sceneKey==='part2'){
      // Keep current thread; default to group if invalid
      if(!['group','dm-chenjie','dm-zhengfang','dm-zhangyu'].includes(currentThread)) currentThread='group';
      push('group','群聊 · 夜班聊天室',AVATARS.group,'4 人');
      push('dm-chenjie','@赛博画手 (陈洁)',AVATARS.chenjie,state.visited.dmChenJie?'已查看':'私聊');
      push('dm-zhengfang','@芳芳Fighting (郑芳)',AVATARS.zhengfang,state.visited.dmZhengFang?'已查看':'私聊');
      push('dm-zhangyu','@风里来雨里去 (张宇)',AVATARS.zhangyu,state.visited.dmZhangYu?'已查看':'私聊');
      push('dm-daskapital','DasKapital (马克思)',AVATARS.daskapital,'未解锁',true);
    }
    else if(sceneKey==='part3_chenjie'){
      // 允许切换线程；若未播放群聊引子，则强制停留在 group
      const allowed = ['group','dm-chenjie','dm-zhengfang','dm-zhangyu','dm-daskapital'];
      if(!allowed.includes(currentThread)) currentThread='group';
      if(!state.gates.p3_cj_groupIntroDone) currentThread='group';
      const lockedBeforeIntro = !state.gates.p3_cj_groupIntroDone;
      push('group','群聊 · 夜班聊天室',AVATARS.group,'在线');
      push('dm-chenjie','@赛博画手 (陈洁)',AVATARS.chenjie,'焦虑', lockedBeforeIntro);
      push('dm-zhengfang','@芳芳Fighting (郑芳)',AVATARS.zhengfang,'在线', lockedBeforeIntro);
      push('dm-zhangyu','@风里来雨里去 (张宇)',AVATARS.zhangyu,'在线', lockedBeforeIntro);
      push('dm-daskapital','DasKapital (马克思)',AVATARS.daskapital,marxLocked?'未解锁':'在线',marxLocked);
    }
    else if(sceneKey==='part3_zhengfang'){
      const allowed = ['group','dm-chenjie','dm-zhengfang','dm-zhangyu','dm-daskapital'];
      if(!allowed.includes(currentThread)) currentThread='group';
      if(!state.gates.p3_zf_groupIntroDone) currentThread='group';
      push('group','群聊 · 夜班聊天室',AVATARS.group,'在线');
      push('dm-chenjie','@赛博画手 (陈洁)',AVATARS.chenjie,'在线');
      push('dm-zhengfang','@芳芳Fighting (郑芳)',AVATARS.zhengfang,'紧张');
      push('dm-zhangyu','@风里来雨里去 (张宇)',AVATARS.zhangyu,'在线');
      push('dm-daskapital','DasKapital (马克思)',AVATARS.daskapital,marxLocked?'未解锁':'在线',marxLocked);
    }
    else if(sceneKey==='part3_zhangyu'){
      const allowed = ['group','dm-chenjie','dm-zhengfang','dm-zhangyu','dm-daskapital'];
      if(!allowed.includes(currentThread)) currentThread='group';
      if(!state.gates.p3_zy_groupIntroDone) currentThread='group';
      const lockedBeforeIntro = !state.gates.p3_zy_groupIntroDone;
      const lockedPreMarx = !state.gates.p3_zy_marxShown;
      push('group','群聊 · 夜班聊天室',AVATARS.group,'在线');
      push('dm-chenjie','@赛博画手 (陈洁)',AVATARS.chenjie,'在线', lockedBeforeIntro);
      push('dm-zhengfang','@芳芳Fighting (郑芳)',AVATARS.zhengfang,'在线', lockedBeforeIntro);
      push('dm-zhangyu','@风里来雨里去 (张宇)',AVATARS.zhangyu,'求助', lockedBeforeIntro || lockedPreMarx);
      push('dm-daskapital','DasKapital (马克思)',AVATARS.daskapital,marxLocked?'未解锁':'在线', lockedBeforeIntro || marxLocked);
    }
    else { push('group','群聊 · 夜班聊天室',AVATARS.group,''); }
    if(currentThread==='group'){ els.peerAvatar.src=AVATARS.group; els.peerName.textContent='群聊 · 夜班聊天室'; els.peerMeta.textContent='4 人在线'; }
    if(currentThread==='dm-chenjie'){ els.peerAvatar.src=AVATARS.chenjie; els.peerName.textContent='@赛博画手 (陈洁)'; els.peerMeta.textContent='私聊'; }
    if(currentThread==='dm-zhengfang'){ els.peerAvatar.src=AVATARS.zhengfang; els.peerName.textContent='@芳芳Fighting (郑芳)'; els.peerMeta.textContent='私聊'; }
    if(currentThread==='dm-zhangyu'){ els.peerAvatar.src=AVATARS.zhangyu; els.peerName.textContent='@风里来雨里去 (张宇)'; els.peerMeta.textContent='私聊'; }
    if(currentThread==='dm-daskapital'){ els.peerAvatar.src=AVATARS.daskapital; els.peerName.textContent='DasKapital (马克思)'; els.peerMeta.textContent='私聊'; }
    // History button only for DMs
    if(els.btnOpenHistory){
      if(['dm-chenjie','dm-zhengfang','dm-zhangyu'].includes(currentThread)) els.btnOpenHistory.classList.remove('hidden');
      else els.btnOpenHistory.classList.add('hidden');
    }
  }

  function rebuildSceneForThread(){
    const sc = state.scenes[state.sceneIndex];
    if(!sc) return;
    // In Part 1, do not rebuild on thread clicks to avoid re-triggering prologue/intro
    if(sc.key === 'part1') return;
    if(sc.key==='part2') buildPart2();
    else if(sc.key==='part3_chenjie') buildChenJie();
    else if(sc.key==='part3_zhengfang') buildZhengFang();
    else if(sc.key==='part3_zhangyu') buildZhangYu();
    else buildPart1();
  }

  // Attempt to repair mixed logs caused by earlier versions (migrates misplaced DM lines out of group)
  function repairZhangYuLogs(){
    try{
      if(!state.logs) state.logs = { group: [], 'dm-chenjie': [], 'dm-zhengfang': [], 'dm-zhangyu': [], 'dm-daskapital': [] };
      const g = Array.isArray(state.logs.group) ? state.logs.group : [];
      const keep=[]; const movedZy=[]; const movedMarx=[];
      for(const m of g){
        const name = m && m.name ? String(m.name) : '';
        const text = m && m.text ? String(m.text) : '';
        const isZy = name.includes('@风里来雨里去 (张宇)');
        const isMarxByName = name.includes('DasKapital') || name.includes('马克思');
        const isMarxByHint = (m && m.type==='system') && (/你向\s*DasKapital/.test(text) || /点击上方"可视化"按钮/.test(text) || /阅读完可视化后/.test(text));
        const isMarx = isMarxByName || isMarxByHint;
        
        // Keep Zhang Yu messages in group for Part 3 Zhang Yu scenario intro
        // Only move private conversation messages, not group intro messages
        if(isZy && (text.includes('平台又改规则了') || text.includes('傍晚，下着大雨') || name.includes('郑芳') || text.includes('系统提示'))){ 
          keep.push(m); 
          continue; 
        }
        
        if(isZy && (text.includes('休息？不敢想') || text.includes('算法困住了') || text.includes('看不见的鞭子'))){ 
          movedZy.push(m); 
          continue; 
        }
        
        // Only move Zhang Yu specific Marx content to DM logs
        if(isMarx && (text.includes('计件工资') || text.includes('剩余价值') || text.includes('外卖订单'))){ 
          movedMarx.push(m); 
          continue; 
        }
        
        // Keep other Marx conversations out of Zhang Yu logs (they belong to other storylines)
        if(isMarx && (text.includes('意识形态') || text.includes('商品拜物教') || text.includes('蒸汽织布机') || text.includes('AI取代人'))){
          // Don't move these - they belong to other storylines, keep them in group or let other repair functions handle them
          keep.push(m);
          continue;
        }
        
        keep.push(m);
      }
      
      let changed=false;
      if(movedZy.length || movedMarx.length){
        state.logs.group = keep;
        if(movedZy.length){ 
          // Only add to Zhang Yu DM if not already there
          const existingZy = state.logs['dm-zhangyu'] || [];
          const newZy = movedZy.filter(msg => !existingZy.some(existing => existing.text === msg.text));
          if(newZy.length) {
            state.logs['dm-zhangyu'] = existingZy.concat(newZy); 
            changed=true; 
          }
        }
        if(movedMarx.length){ 
          // Clear existing Marx logs and replace with Zhang Yu specific ones
          state.logs['dm-daskapital'] = movedMarx;
          changed=true; 
        }
      }
      
      // Additional cleanup: remove non-Zhang Yu Marx content from dm-daskapital logs
      const marxLogs = state.logs['dm-daskapital'] || [];
      const cleanedMarxLogs = marxLogs.filter(msg => {
        const text = msg && msg.text ? String(msg.text) : '';
        // Keep Zhang Yu specific content
        if(text.includes('计件工资') || text.includes('剩余价值') || text.includes('外卖订单')) {
          return true;
        }
        // Remove other storyline content
        if(text.includes('意识形态') || text.includes('商品拜物教') || text.includes('蒸汽织布机') || text.includes('AI取代人')) {
          return false;
        }
        // Keep system messages and neutral content
        return msg.type === 'system' || text.includes('先生') || text.includes('你向');
      });
      
      if(cleanedMarxLogs.length !== marxLogs.length) {
        state.logs['dm-daskapital'] = cleanedMarxLogs;
        changed = true;
      }
      
      if(changed) saveState();
    }catch(e){
      console.error('Error in repairZhangYuLogs:', e);
    }
  }

  // ----------------------------
  // Objectives
  // ----------------------------
  function updateObjectives(){
    clear(els.objectiveList); const key=state.sceneIndexKey(); const add=(t,done)=>{ const li=document.createElement('li'); li.textContent=(done?'✓ ':'• ')+t; if(done) li.style.color='#8bc34a'; els.objectiveList.appendChild(li); };
    if(key==='part1'){
      add('打开上方“笔记本”，查看群聊');
    } else if(key==='part2'){
      const all=state.visited.dmChenJie&&state.visited.dmZhengFang&&state.visited.dmZhangYu; add('分别查看三位朋友的私聊', all); if(els.btnNext) els.btnNext.disabled=!all; }
    else if(key==='part3_chenjie'){ add('做出关键选择（团结/竞争）', !!state.choices.chenJie); if(els.btnNext) els.btnNext.disabled=!state.choices.chenJie; }
    else if(key==='part3_zhengfang'){ add('完成《流量的赌局》三回合', !!state.choices.zhengFang); if(els.btnNext) els.btnNext.disabled=!state.choices.zhengFang; }
    else if(key==='part3_zhangyu'){ add('打开可视化并做出选择', !!state.choices.zhangYu); if(els.btnNext) els.btnNext.disabled=!state.choices.zhangYu; }
    else if(key==='ending'){ add('观看结局'); if(els.btnNext) els.btnNext.disabled=true; }
    else { add('继续推进剧情'); }
  }
  state.sceneIndexKey = function(){ return state.scenes[state.sceneIndex]?.key || ''; }

  // ----------------------------
  // Scenes
  // ----------------------------
  function buildScenes(){ state.scenes=[
    { key:'part1', title:'第一部分', build: buildPart1 },
    { key:'part2', title:'第二部分', build: buildPart2 },
    { key:'tr1', title:'转场', build: ()=>buildTransition('黑屏：台灯的光在桌面上拉出一片柔和的黄。你点开了笔记本。') },
    { key:'part3_chenjie', title:'第三部分 · 陈洁', build: buildChenJie },
    { key:'tr2', title:'转场', build: ()=>buildBlackTransition('黑屏：屏幕短暂熄灭，你深吸一口气，光标再次亮起。') },
    { key:'part3_zhengfang', title:'第三部分 · 郑芳', build: buildZhengFang },
    { key:'tr3', title:'转场', build: ()=>buildBlackTransition('黑屏：雨声渐大。你合上手心，给自己一个短暂的拥抱，然后继续。') },
    { key:'part3_zhangyu', title:'第三部分 · 张宇', build: buildZhangYu },
    { key:'tr4', title:'转场', build: ()=>buildBlackTransition('黑屏：窗外又是一阵风雨，光标在等待你的决定。') },
    { key:'ending', title:'结局', build: buildEnding },
  ]; }
  function gotoScene(i){
    // Pause any ongoing queue before scene switch
    pauseQueueOnThreadSwitch();
    if(i<0||i>=state.scenes.length) return;
    state.sceneIndex=i;
    const sc=state.scenes[i];
    els.btnOpenAnalysis.classList.add('hidden');
    renderChoices([]);
    renderThreadsForScene(sc.key);
    sc.build();
    updateObjectives();
    // Prev/Next scene buttons are not used now; do not touch them
  }
  function showToastTip(text, ms){ try{ const t=document.createElement('div'); t.style.position='fixed'; t.style.left='50%'; t.style.bottom='24px'; t.style.transform='translateX(-50%)'; t.style.background='rgba(0,0,0,0.78)'; t.style.color='#fff'; t.style.padding='10px 14px'; t.style.borderRadius='10px'; t.style.zIndex='2000'; t.style.fontSize='14px'; t.style.boxShadow='0 6px 20px rgba(0,0,0,0.35)'; t.style.pointerEvents='none'; t.textContent=String(text||''); document.body.appendChild(t); setTimeout(()=>{ if(t && t.parentNode){ t.parentNode.removeChild(t); } }, Math.max(300, ms||1200)); }catch(e){} }
  function buildTransition(text){ showToastTip(String(text||'').replace(/^黑屏：/,'').trim(), 1200); setTimeout(()=>gotoScene(state.sceneIndex+1), 600); renderChoices([]); }
function buildBlackTransition(text){ showTransition(text, ()=>gotoScene(state.sceneIndex+1)); renderMessages([{type:'system', text:'[系统提示] 转场中…'}]); renderChoices([]); }

  // Part 1
  function buildPart1(){
    // Build prologue overlay sequence first
    const prologueMsgs = [
      { k:'narr', t:'【旁白】夜深，屏幕的光像一枚小小的救生圈。' },
      { k:'narr', t:'【旁白】今天的数字不顺眼：有掉粉的红字，有超时的黄标，还有未读的系统通知。' },
      { k:'inner', t:'【内心】再这样刷下去，脑子要卡死机了。' },
      { k:'inner', t:'【内心】我应该找个人说说话……还是再扛一会儿？' },
      { k:'system', t:'[手机震动×1]' },
      { k:'system', t:'[好友 @芳芳Fighting 邀请你加入了群聊 "夜班聊天室"。]' },
      { k:'narr', t:'或许我应该打开我的笔记本' },
    ];

    // Prepare group chat content that will appear in notebook after prologue
    currentThread='group';
    renderThreadsForScene('part1');
    // 清空聊天区，等待用户打开笔记本后再逐条加载群聊内容
    renderMessages([]);
    // Show prologue only once
    if(!state.didPrologue){
      startPrologue(prologueMsgs, ()=>{
        state.didPrologue = true;
        hidePrologue();
        updateObjectives(); saveState();
      });
    } else {
      hidePrologue();
      updateObjectives();
    }
  }

  // Part 2 (DMs)
  function buildPart2(){
    const msgs=[];
    function afterDMVisit(which){
      if(which==='chenjie') state.visited.dmChenJie = true;
      if(which==='zhengfang') state.visited.dmZhengFang = true;
      if(which==='zhangyu') state.visited.dmZhangYu = true;
      const allVisited = state.visited.dmChenJie && state.visited.dmZhengFang && state.visited.dmZhangYu;
      saveState();
      if(allVisited){
        // Show final system tip from 第二部分.md
        startQueue([
          { type:'system', text:'[系统提示] 在和朋友们聊完后，你对那个叫“DasKapital”的博主产生了更浓厚的兴趣。你决定私下联系他，看看他是否能解答你和你朋友们的困惑。' }
        ], ()=>{
          // 引导用户主动关闭“笔记本”，然后进行夜间转场
          state.pendingNightTransition = true; saveState();
          appendMessages([{ type:'system', text:'[系统提示] 今晚就到这里吧。请点击右上角“关闭”按钮合上笔记本。' }]);
          renderChoices([]);
        }, { clear:false, showFirst:true, pauseInitially:true });
      } else { updateObjectives(); }
    }

    // If this thread already has logs, restore; ensure dossier提示也能补发一次
    if(restoreThreadLogs(currentThread)) {
      if(currentThread==='dm-chenjie' && !state.gates.p2_dossier_chenjie_shown){
        appendMessages([
          { type:'system', text:'[弹出角色档案解锁提示]' },
          { type:'system', text:'角色档案解锁：陈洁 —— 背负3.8万助学贷款，最近被AI抢单率上升47%' },
        ]);
        openProfileModal(getProfileData('chenjie'));
        state.gates.p2_dossier_chenjie_shown = true; saveState();
      }
      if(currentThread==='dm-zhengfang' && !state.gates.p2_dossier_zhengfang_shown){
        appendMessages([
          { type:'system', text:'[弹出角色档案解锁提示]' },
          { type:'system', text:'角色档案解锁：郑芳 —— 百万粉短视频作者，近期创作压力大，自述常失眠；对“数据崇拜”产生强烈质疑。' },
        ]);
        openProfileModal(getProfileData('zhengfang'));
        state.gates.p2_dossier_zhengfang_shown = true; saveState();
      }
      if(currentThread==='dm-zhangyu' && !state.gates.p2_dossier_zhangyu_shown){
        appendMessages([
          { type:'system', text:'[弹出角色档案解锁提示]' },
          { type:'system', text:'角色档案解锁：张宇 —— 本地外卖骑手，常态化日在线>10小时；雨天补贴波动大，算法规则频繁调整。' },
        ]);
        openProfileModal(getProfileData('zhangyu'));
        state.gates.p2_dossier_zhangyu_shown = true; saveState();
      }
      updateObjectives(); return; }

    if(currentThread==='dm-chenjie'){
      if(!state.gates.p2_dossier_chenjie_shown){ openProfileModal(getProfileData('chenjie')); state.gates.p2_dossier_chenjie_shown=true; saveState(); }
      const seq = [
        { type:'system', text:'[手机震动特效]' },
        { type:'system', text:'[弹出角色档案解锁提示]' },
        { type:'system', text:'角色档案解锁：陈洁 —— 背负3.8万助学贷款，最近被AI抢单率上升47%' },
        { type:'msg', name:'你', avatar:AVATARS.you, text:'刚看到你在群里发的图，确实很强。AI现在都这么厉害了吗？' },
        { type:'msg', name:'@赛博画手 (陈洁)', avatar:AVATARS.chenjie, text:'何止是厉害。这张图，AI一秒就画出来了。我学了五年美术，从素描到色彩到构图，辛辛苦苦练出来的本事，现在在机器面前一文不值。你说，我这几年的努力，意义何在？' },
        { type:'msg', name:'@赛博画手 (陈洁)', avatar:AVATARS.chenjie, text:'上周有个单子，客户要求画个游戏角色。我熬了两天夜出了三版草图，结果客户说不用了，他用AI生成了一个更满意的，还把AI图发给我看，问我能不能“优化一下细节”。我当时就想把电脑砸了。这不光是钱的问题，是一种彻底的价值否定。' },
        { type:'system', text:'[系统提示] 此处的对话为后续讨论“异化劳动”埋下伏笔。陈洁的感受，精确地呼应了马克思在《1844年经济学哲学手稿》中的经典论述：“劳动所生产的对象，即劳动的产品，作为一种异己的存在物，作为不依赖于生产者的力量，同劳动相对立。” 她学了数年的技艺和为此付出的心血，如今在AI这个“异己的力量”面前，反而成了否定其自身价值的证明。' },
      ];
      startQueue(seq, ()=>afterDMVisit('chenjie'), { clear:true, showFirst:true, pauseInitially:true });
      return;
    } else if(currentThread==='dm-zhengfang'){
      if(!state.gates.p2_dossier_zhengfang_shown){ openProfileModal(getProfileData('zhengfang')); state.gates.p2_dossier_zhengfang_shown=true; saveState(); }
      const seq = [
        { type:'system', text:'[手机震动特效]' },
        { type:'system', text:'[弹出角色档案解锁提示]' },
        { type:'system', text:'角色档案解锁：郑芳 —— 百万粉短视频作者，近期创作压力大，自述常失眠；对“数据崇拜”产生强烈质疑。' },
        { type:'msg', name:'你', avatar:AVATARS.you, text:'别太在意掉粉了，做视频开心最重要。' },
        { type:'msg', name:'@芳芳Fighting (郑芳)', avatar:AVATARS.zhengfang, text:'道理我都懂，但做不到啊。我现在有几十万粉丝，但感觉比刚开始只有几百个粉丝的时候还焦虑，还孤独。' },
        { type:'msg', name:'@芳芳Fighting (郑芳)', avatar:AVATARS.zhengfang, text:'每天都在表演一个“积极向上”“热爱生活”的人设，因为这样的人设流量好。真实的我在想什么，根本不重要，甚至我自己都快忘了。有时候刷到自己的视频，都觉得屏幕里那个人好陌生。粉丝越多，这种感觉越强烈。线上一堆人喊“老婆”，线下连个能说真心话的人都没有。' },
        { type:'system', text:'[系统提示] 此处的对话为后续探讨“商品拜物教”在社交媒体时代的变种做准备。郑芳所崇拜的“粉丝量”、“点赞数”，正是马克思在《资本论》中所描述的“商品拜物教”的体现。这些数字，本是反映人与人之间社会关系（喜爱、认可）的符号，如今却被赋予了独立的、神秘的魔力，仿佛它们自身就决定了她的价值与存亡。这种对抽象符号的迷信，完美掩盖了背后真实的剥削关系：平台利用她的劳动来凝聚用户注意力，再将这种注意力作为商品出售给广告商。' },
      ];
      startQueue(seq, ()=>afterDMVisit('zhengfang'), { clear:true, showFirst:true, pauseInitially:true });
      return;
    } else if(currentThread==='dm-zhangyu'){
      if(!state.gates.p2_dossier_zhangyu_shown){ openProfileModal(getProfileData('zhangyu')); state.gates.p2_dossier_zhangyu_shown=true; saveState(); }
      const seq = [
        { type:'system', text:'[手机震动特效]' },
        { type:'system', text:'[弹出角色档案解锁提示]' },
        { type:'system', text:'角色档案解锁：张宇 —— 本地外卖骑手，常态化日在线>10小时；雨天补贴波动大，算法规则频繁调整。' },
        { type:'msg', name:'你', avatar:AVATARS.you, text:'辛苦了，看你在线那么久，都没时间休息吧？' },
        { type:'msg', name:'@风里来雨里去 (张宇)', avatar:AVATARS.zhangyu, text:'休息？不敢想。平台天天宣传我们是“自由骑士”，“自己的老板”。狗屁！我感觉自己就是被算法困住了。评分、接单率、配送时间……到处都是看不见的鞭子。' },
        { type:'msg', name:'@风里来雨里去 (张宇)', avatar:AVATARS.zhangyu, text:'你知道吗，下雨天我们最怕也最“喜欢”。怕是因为危险，“喜欢”是因为有天气补贴。但平台会动态调整补贴，单子一多，补贴就降了。还有那个“准时率”，系统规划的路线根本不考虑堵车和等电梯的时间，一超时就扣钱。我们不是为顾客服务，是为算法打工。' },
        { type:'system', text:'[系统提示] 此处的对话引入了“零工经济”下的新型剥削形式。张宇所说的“看不见的鞭子”，正是马克思在《资本论》里剖析的“计件工资”的现代变体。计件工资是加强劳动强度的最有效手段，因为它让劳动者自己鞭策自己，为了多挣几块钱而进行残酷的“自我剥PETS”。在数字时代，平台算法成为了这个体系最完美的执行者，它不仅是“监工”，更是动态调整单价、规划路线、进行惩罚的“绝对统治者”，将剥削效率提升到了新的高度。' },
      ];
      startQueue(seq, ()=>afterDMVisit('zhangyu'), { clear:true, showFirst:true, pauseInitially:true });
      return;
    } else {
      // group thread: show previous group logs if any; otherwise, show tip
      if(!restoreThreadLogs('group')){
        renderMessages([{ type:'system', text:'[系统提示] 你可以点击成员头像，与他们开始私聊，更深入地了解他们的困惑。' }]);
      }
      updateObjectives();
    }
  }

  // Part 3 · ChenJie
  function buildChenJie(){ 
    // 第三幕陈洁：若群聊引子未播放，则强制进入群聊并先播放它
    renderThreadsForScene('part3_chenjie');
    // 兼容旧存档：如果群聊历史中没有“第二天傍晚”的标记，则认为引子未播放
    const gl = (state.logs && state.logs.group) ? state.logs.group : [];
    const hasIntroMark = gl.some(m=>m && m.type==='system' && typeof m.text==='string' && m.text.indexOf('第二天傍晚')!==-1);
    if(!hasIntroMark) state.gates.p3_cj_groupIntroDone = false;
    if(!state.gates.p3_cj_groupIntroDone){
      currentThread='group';
      renderThreadsForScene('part3_chenjie');
      const groupIntro = [
        { type:'system', text:'[时间：第二天傍晚]' },
        { type:'system', text:'[手机震动] 群聊“夜班聊天室”弹出新消息。' },
        { type:'image', name:'@赛博画手 (陈洁)', avatar:AVATARS.chenjie, imgSrc:'图片/客户对话.png' },
        { type:'msg', name:'@赛博画手 (陈洁)', avatar:AVATARS.chenjie, text:'我真的，唉。' },
        { type:'msg', name:'@芳芳Fighting (郑芳)', avatar:AVATARS.zhengfang, text:'抱抱你！这些客户太过分了！' },
        { type:'msg', name:'@风里来雨里去 (张宇)', avatar:AVATARS.zhangyu, text:'这AI是不是真的要砸掉我们所有人的饭碗？以后是不是画画的、写字的、开车的，都得失业？' },
        { type:'system', text:'[系统提示] 陈洁的遭遇让群里的焦虑气氛达到了顶点。作为朋友，你觉得应该先去安慰一下她。' },
        { type:'system', text:'[操作提示] 请点击左侧 @赛博画手 (陈洁) 头像进入私聊。' },
      ];
      startQueue(groupIntro, ()=>{ 
        state.gates.p3_cj_groupIntroDone=true; 
        saveState(); 
        updateObjectives(); 
        // 解除左侧锁定并自动切换到陈洁私聊，避免无法点击的问题
        currentThread='dm-chenjie';
        renderThreadsForScene('part3_chenjie');
        buildChenJie();
      }, { clear:true, showFirst:true });
      return;
    }

    if(currentThread==='dm-chenjie'){
      // 私聊：优先播放本幕的铺垫台词（避免被第二幕的历史覆盖）
      const pre = [
        { type:'msg', name:'你', avatar:AVATARS.you, text:'别太难过了，看到你被客户那么说，我也很生气。' },
        { type:'msg', name:'@赛博画手 (陈洁)', avatar:AVATARS.chenjie, text:'谢谢你…我就是觉得很无力。是不是我真的不够努力，不够有才华？如果我画得再好一点，是不是就不会被AI比下去了？' },
        { type:'system', text:'[系统提示] 你该如何回应陈洁的自我怀疑？（此处为关键选项）' },
      ];
      if(!state.gates.p3_cj_started){
        clear(els.chatLog);
        startQueue(pre, ()=>{
          state.gates.p3_cj_started = true; saveState();
          renderChoices([
            { label:'选项A：鼓励团结（联合制定行业规范）', onChoose:()=>{ 
              state.choices.chenJie='A'; 
              appendMessages([
                { type:'msg', name:'你', avatar:AVATARS.you, text:'这不是你一个人的问题。我看到很多设计师都在讨论这个。也许你们应该联合起来，制定行业使用AI的规范，保护原创设计师的权益？' },
                { type:'msg', name:'@赛博画手 (陈洁)', avatar:AVATARS.chenjie, text:'联合起来…？对啊…我之前只想着自己怎么单打独斗，怎么画得比AI更好…从来没想过，这其实是所有设计师共同面临的问题。' },
                { type:'msg', name:'@赛博画手 (陈洁)', avatar:AVATARS.chenjie, text:'你说得对，一个人的声音太小了，但如果我们能一起发声，情况也许会不一样。我去找几个设计师朋友聊聊看！' },
              ]);
              // 准备“寻求真理”队列，但不自动跳转；提供按钮由你来触发
              const seekTruth = [
                { type:'system', text:'[系统提示] 和陈洁聊完后，你感觉心情有些复杂。你想起了芳芳提到的博主“DasKapital”。你向芳芳表示想与他交流，她把你介绍给了他。' },
                { type:'system', text:'[系统提示] DasKapital 通过了你的好友申请。' },
                { type:'msg', name:'你', avatar:AVATARS.you, text:'先生，您好。我的一个画师朋友刚刚被 AI 抢了工作，陷入了很深的自我怀疑。群里大家都很焦虑……您对 AI 取代人的工作这个问题怎么看？' },
                { type:'msg', name:'DasKapital (马克思)', avatar:AVATARS.daskapital, text:'陈洁同志的问题很有代表性。这让我想起 19 世纪的织布工人，他们也曾以为是新发明的蒸汽织布机抢走了他们的工作，所以愤怒地去砸毁机器。' },
                { type:'msg', name:'DasKapital (马克思)', avatar:AVATARS.daskapital, text:'你可以思考一个问题：问题真的是出在“机器”（今天我们称之为 AI）本身吗？还是出在“谁”拥有和控制这些机器，以及“为了什么目的”而使用这些机器？' },
                { type:'msg', name:'DasKapital (马克思)', avatar:AVATARS.daskapital, text:'技术，也就是我们所说的生产力，本身是中性的。它蕴含着把人类从繁重、重复劳动中解放出来的潜力。但在现实的社会结构——也就是生产关系下，新技术被资本所有者掌握，其首要目的不是解放劳动者，而是尽可能削减劳动力成本，以追逐利润。' },
                { type:'msg', name:'你', avatar:AVATARS.you, text:'您的意思是，像当年工人砸机器那样去抵制 AI，是没用的吗？' },
                { type:'msg', name:'DasKapital (马克思)', avatar:AVATARS.daskapital, text:'这是一个历史性的进步。最初的工人们确实把愤怒发泄在工具上，但后来他们学会了“把机器和机器的资本主义应用区别开来”。要改变的，不是生产资料本身，而是利用这些资料进行剥削的社会形式。' },
                { type:'msg', name:'DasKapital (马克思)', avatar:AVATARS.daskapital, text:'AI 就像土地和蒸汽机，是强大的生产资料。问题不在于是否使用它，而在于它应该为谁服务——为少数人的利润，还是为全社会的福祉？劳动者需要联合起来，争取对 AI 的控制权与收益分配权。' },
                { type:'msg', name:'你', avatar:AVATARS.you, text:'这听起来很宏大。我们普通人能做什么？' },
                { type:'msg', name:'DasKapital (马克思)', avatar:AVATARS.daskapital, text:'宏大的变革由微小的觉醒开始。先从看清本质做起：问题不在技术，也不在个人“无能”，而在于经济结构。当足够多的人认识到这一点并组织起来提出诉求，力量就诞生了。比如，设计师可以联合推动 AI 使用的伦理规范与版权保护规则，保障创作者的劳动价值。' },
              ];
              renderChoices([{
                label:'联系 DasKapital（寻求真理）', onChoose:()=>{
                  state.unlocks.dasKapital = true; saveState();
                  currentThread='dm-daskapital';
                  renderThreadsForScene('part3_chenjie');
                  if(!state.gates.p3_cj_marxPlayed){
                    startQueue(seekTruth, ()=>{ 
                      state.gates.p3_cj_marxPlayed=true; 
                      state.pendingTransitionKey='tr2'; 
                      appendMessages([{ type:'system', text:'[系统提示] 请点击右上方关闭“笔记本”，黑屏转场后进入下一幕。' }]);
                      renderChoices([]);
                      saveState();
                    }, { clear:true, showFirst:true, pauseInitially:true });
                  } else {
                    if(!restoreThreadLogs('dm-daskapital')){ appendMessages([{ type:'system', text:'[系统提示] 你与 DasKapital 的聊天记录为空。' }]); }
                    renderChoices([]); updateObjectives();
                  }
                }
              }]);
            }},
            { label:'选项B：鼓励竞争（学习 AI 工具）', onChoose:()=>{ 
              state.choices.chenJie='B'; 
              appendMessages([
                { type:'msg', name:'你', avatar:AVATARS.you, text:'现在技术就是趋势，没办法的。你应该赶紧去学学怎么用 AI 辅助你画图，把自己变成用 AI 最厉害的设计师，这样就不会被淘汰了。' },
                { type:'msg', name:'@赛博画手 (陈洁)', avatar:AVATARS.chenjie, text:'……你说得对。抱怨没有用，我不能再这样下去了，得赶紧去报个 AI 绘画的课……跟上时代才行。' },
              ]);
              const seekTruth = [
                { type:'system', text:'[系统提示] 和陈洁聊完后，你感觉心情有些复杂。你想起了芳芳提到的博主“DasKapital”。你向芳芳表示想与他交流，她把你介绍给了他。' },
                { type:'system', text:'[系统提示] DasKapital 通过了你的好友申请。' },
                { type:'msg', name:'你', avatar:AVATARS.you, text:'先生，您好。我的一个画师朋友刚刚被 AI 抢了工作，陷入了很深的自我怀疑。群里大家都很焦虑……您对 AI 取代人的工作这个问题怎么看？' },
                { type:'msg', name:'DasKapital (马克思)', avatar:AVATARS.daskapital, text:'陈洁同志的问题很有代表性。这让我想起 19 世纪的织布工人，他们也曾以为是新发明的蒸汽织布机抢走了他们的工作，所以愤怒地去砸毁机器。' },
                { type:'msg', name:'DasKapital (马克思)', avatar:AVATARS.daskapital, text:'你可以思考一个问题：问题真的是出在“机器”（今天我们称之为 AI）本身吗？还是出在“谁”拥有和控制这些机器，以及“为了什么目的”而使用这些机器？' },
                { type:'msg', name:'DasKapital (马克思)', avatar:AVATARS.daskapital, text:'技术，也就是我们所说的生产力，本身是中性的。它蕴含着把人类从繁重、重复劳动中解放出来的潜力。但在现实的社会结构——也就是生产关系下，新技术被资本所有者掌握，其首要目的不是解放劳动者，而是尽可能削减劳动力成本，以追逐利润。' },
                { type:'msg', name:'你', avatar:AVATARS.you, text:'您的意思是，像当年工人砸机器那样去抵制 AI，是没用的吗？' },
                { type:'msg', name:'DasKapital (马克思)', avatar:AVATARS.daskapital, text:'这是一个历史性的进步。最初的工人们确实把愤怒发泄在工具上，但后来他们学会了“把机器和机器的资本主义应用区别开来”。要改变的，不是生产资料本身，而是利用这些资料进行剥削的社会形式。' },
                { type:'msg', name:'DasKapital (马克思)', avatar:AVATARS.daskapital, text:'AI 就像土地和蒸汽机，是强大的生产资料。问题不在于是否使用它，而在于它应该为谁服务——为少数人的利润，还是为全社会的福祉？劳动者需要联合起来，争取对 AI 的控制权与收益分配权。' },
                { type:'msg', name:'你', avatar:AVATARS.you, text:'这听起来很宏大。我们普通人能做什么？' },
                { type:'msg', name:'DasKapital (马克思)', avatar:AVATARS.daskapital, text:'宏大的变革由微小的觉醒开始。先从看清本质做起：问题不在技术，也不在个人“无能”，而在于经济结构。当足够多的人认识到这一点并组织起来提出诉求，力量就诞生了。比如，设计师可以联合推动 AI 使用的伦理规范与版权保护规则，保障创作者的劳动价值。' },
              ];
              renderChoices([{
                label:'联系 DasKapital（寻求真理）', onChoose:()=>{
                  state.unlocks.dasKapital = true; saveState();
                  currentThread='dm-daskapital';
                  renderThreadsForScene('part3_chenjie');
                  if(!state.gates.p3_cj_marxPlayed){
                    startQueue(seekTruth, ()=>{ 
                      state.gates.p3_cj_marxPlayed=true; 
                      state.pendingTransitionKey='tr2';
                      appendMessages([{ type:'system', text:'[系统提示] 请点击右上方关闭“笔记本”，黑屏转场后进入下一幕。' }]);
                      renderChoices([]);
                      saveState();
                    }, { clear:true, showFirst:true, pauseInitially:true });
                  } else {
                    if(!restoreThreadLogs('dm-daskapital')){ appendMessages([{ type:'system', text:'[系统提示] 你与 DasKapital 的聊天记录为空。' }]); }
                    renderChoices([]); updateObjectives();
                  }
                }
              }]);
            }},
          ]);
        }, { clear:true, showFirst:true, pauseInitially:true });
        return;
      }
      // 若本幕已开始，再根据历史决定是否直接展示选项
      if(restoreThreadLogs('dm-chenjie')){
        if(!state.choices.chenJie){
          renderChoices([
            { label:'选项A：鼓励团结（联合制定行业规范）', onChoose:()=>{ 
              state.choices.chenJie='A'; 
              appendMessages([
                { type:'msg', name:'你', avatar:AVATARS.you, text:'这不是你一个人的问题。我看到很多设计师都在讨论这个。也许你们应该联合起来，制定行业使用AI的规范，保护原创设计师的权益？' },
                { type:'msg', name:'@赛博画手 (陈洁)', avatar:AVATARS.chenjie, text:'联合起来…？对啊…我之前只想着自己怎么单打独斗，怎么画得比AI更好…从来没想过，这其实是所有设计师共同面临的问题。' },
                { type:'msg', name:'@赛博画手 (陈洁)', avatar:AVATARS.chenjie, text:'你说得对，一个人的声音太小了，但如果我们能一起发声，情况也许会不一样。我去找几个设计师朋友聊聊看！' },
              ]);
              const seekTruth = [
                { type:'system', text:'[系统提示] 和陈洁聊完后，你感觉心情有些复杂。你想起了芳芳提到的博主“DasKapital”。你向芳芳表示想与他交流，她把你介绍给了他。' },
                { type:'system', text:'[系统提示] DasKapital 通过了你的好友申请。' },
                { type:'msg', name:'你', avatar:AVATARS.you, text:'先生，您好。我的一个画师朋友刚刚被 AI 抢了工作，陷入了很深的自我怀疑。群里大家都很焦虑……您对 AI 取代人的工作这个问题怎么看？' },
                { type:'msg', name:'DasKapital (马克思)', avatar:AVATARS.daskapital, text:'陈洁同志的问题很有代表性。这让我想起 19 世纪的织布工人，他们也曾以为是新发明的蒸汽织布机抢走了他们的工作，所以愤怒地去砸毁机器。' },
                { type:'msg', name:'DasKapital (马克思)', avatar:AVATARS.daskapital, text:'你可以思考一个问题：问题真的是出在“机器”（今天我们称之为 AI）本身吗？还是出在“谁”拥有和控制这些机器，以及“为了什么目的”而使用这些机器？' },
                { type:'msg', name:'DasKapital (马克思)', avatar:AVATARS.daskapital, text:'技术，也就是我们所说的生产力，本身是中性的。它蕴含着把人类从繁重、重复劳动中解放出来的潜力。但在现实的社会结构——也就是生产关系下，新技术被资本所有者掌握，其首要目的不是解放劳动者，而是尽可能削减劳动力成本，以追逐利润。' },
                { type:'msg', name:'你', avatar:AVATARS.you, text:'您的意思是，像当年工人砸机器那样去抵制 AI，是没用的吗？' },
                { type:'msg', name:'DasKapital (马克思)', avatar:AVATARS.daskapital, text:'这是一个历史性的进步。最初的工人们确实把愤怒发泄在工具上，但后来他们学会了“把机器和机器的资本主义应用区别开来”。要改变的，不是生产资料本身，而是利用这些资料进行剥削的社会形式。' },
                { type:'msg', name:'DasKapital (马克思)', avatar:AVATARS.daskapital, text:'AI 就像土地和蒸汽机，是强大的生产资料。问题不在于是否使用它，而在于它应该为谁服务——为少数人的利润，还是为全社会的福祉？劳动者需要联合起来，争取对 AI 的控制权与收益分配权。' },
                { type:'msg', name:'你', avatar:AVATARS.you, text:'这听起来很宏大。我们普通人能做什么？' },
                { type:'msg', name:'DasKapital (马克思)', avatar:AVATARS.daskapital, text:'宏大的变革由微小的觉醒开始。先从看清本质做起：问题不在技术，也不在个人“无能”，而在于经济结构。当足够多的人认识到这一点并组织起来提出诉求，力量就诞生了。比如，设计师可以联合推动 AI 使用的伦理规范与版权保护规则，保障创作者的劳动价值。' },
              ];
              renderChoices([{
                label:'联系 DasKapital（寻求真理）', onChoose:()=>{
                  state.unlocks.dasKapital = true; saveState();
                  currentThread='dm-daskapital';
                  renderThreadsForScene('part3_chenjie');
                  if(!state.gates.p3_cj_marxPlayed){
                    startQueue(seekTruth, ()=>{ 
                      state.gates.p3_cj_marxPlayed=true; 
                      state.pendingTransitionKey='tr2'; 
                      appendMessages([{ type:'system', text:'[系统提示] 请点击右上方关闭“笔记本”，黑屏转场后进入下一幕。' }]);
                      renderChoices([]);
                      saveState();
                    }, { clear:true, showFirst:true, pauseInitially:true });
                  } else {
                    if(!restoreThreadLogs('dm-daskapital')){ appendMessages([{ type:'system', text:'[系统提示] 你与 DasKapital 的聊天记录为空。' }]); }
                    renderChoices([]); updateObjectives();
                  }
                }
              }]);
            }},
            { label:'选项B：鼓励竞争（学习 AI 工具）', onChoose:()=>{ 
              state.choices.chenJie='B'; 
              appendMessages([
                { type:'msg', name:'你', avatar:AVATARS.you, text:'现在技术就是趋势，没办法的。你应该赶紧去学学怎么用AI辅助你画图，把自己变成用AI最厉害的设计师，这样就不会被淘汰了。' },
                { type:'msg', name:'@赛博画手 (陈洁)', avatar:AVATARS.chenjie, text:'……你说得对。抱怨没有用。我不能再这样下去了，得赶紧去报个AI绘画的课…跟上时代才行。' },
              ]);
              const seekTruth = [
                { type:'system', text:'[系统提示] 和陈洁聊完后，你感觉心情有些复杂。你想起了芳芳提到的博主“DasKapital”。你向芳芳表示想与他交流，她把你介绍给了他。' },
                { type:'system', text:'[系统提示] DasKapital 通过了你的好友申请。' },
                { type:'msg', name:'你', avatar:AVATARS.you, text:'先生，您好。我的一个画师朋友刚刚被 AI 抢了工作，陷入了很深的自我怀疑。群里大家都很焦虑……您对 AI 取代人的工作这个问题怎么看？' },
                { type:'msg', name:'DasKapital (马克思)', avatar:AVATARS.daskapital, text:'陈洁同志的问题很有代表性。这让我想起 19 世纪的织布工人，他们也曾以为是新发明的蒸汽织布机抢走了他们的工作，所以愤怒地去砸毁机器。' },
                { type:'msg', name:'DasKapital (马克思)', avatar:AVATARS.daskapital, text:'你可以思考一个问题：问题真的是出在“机器”（今天我们称之为 AI）本身吗？还是出在“谁”拥有和控制这些机器，以及“为了什么目的”而使用这些机器？' },
                { type:'msg', name:'DasKapital (马克思)', avatar:AVATARS.daskapital, text:'技术，也就是我们所说的生产力，本身是中性的。它蕴含着把人类从繁重、重复劳动中解放出来的潜力。但在现实的社会结构——也就是生产关系下，新技术被资本所有者掌握，其首要目的不是解放劳动者，而是尽可能削减劳动力成本，以追逐利润。' },
                { type:'msg', name:'你', avatar:AVATARS.you, text:'您的意思是，像当年工人砸机器那样去抵制 AI，是没用的吗？' },
                { type:'msg', name:'DasKapital (马克思)', avatar:AVATARS.daskapital, text:'这是一个历史性的进步。最初的工人们确实把愤怒发泄在工具上，但后来他们学会了“把机器和机器的资本主义应用区别开来”。要改变的，不是生产资料本身，而是利用这些资料进行剥削的社会形式。' },
                { type:'msg', name:'DasKapital (马克思)', avatar:AVATARS.daskapital, text:'AI 就像土地和蒸汽机，是强大的生产资料。问题不在于是否使用它，而在于它应该为谁服务——为少数人的利润，还是为全社会的福祉？劳动者需要联合起来，争取对 AI 的控制权与收益分配权。' },
                { type:'msg', name:'你', avatar:AVATARS.you, text:'这听起来很宏大。我们普通人能做什么？' },
                { type:'msg', name:'DasKapital (马克思)', avatar:AVATARS.daskapital, text:'宏大的变革由微小的觉醒开始。先从看清本质做起：问题不在技术，也不在个人“无能”，而在于经济结构。当足够多的人认识到这一点并组织起来提出诉求，力量就诞生了。比如，设计师可以联合推动 AI 使用的伦理规范与版权保护规则，保障创作者的劳动价值。' },
              ];
              renderChoices([{
                label:'联系 DasKapital（寻求真理）', onChoose:()=>{
                  state.unlocks.dasKapital = true; saveState();
                  currentThread='dm-daskapital';
                  renderThreadsForScene('part3_chenjie');
                  if(!state.gates.p3_cj_marxPlayed){
                    startQueue(seekTruth, ()=>{ 
                      state.gates.p3_cj_marxPlayed=true; 
                      state.pendingTransitionKey='tr2';
                      appendMessages([{ type:'system', text:'[系统提示] 请点击右上方关闭“笔记本”，黑屏转场后进入下一幕。' }]);
                      renderChoices([]);
                      saveState();
                    }, { clear:true, showFirst:true, pauseInitially:true });
                  } else {
                    if(!restoreThreadLogs('dm-daskapital')){ appendMessages([{ type:'system', text:'[系统提示] 你与 DasKapital 的聊天记录为空。' }]); }
                    renderChoices([]); updateObjectives();
                  }
                }
              }]);
            }},
          ]);
        } else { renderChoices([]); }
        updateObjectives();
        return;
      }
    }
    // 处理其它线程的重建：
    if(currentThread==='dm-daskapital'){
      // 展示马克思线程历史
      if(!restoreThreadLogs('dm-daskapital')){
        renderMessages([{ type:'system', text:'[系统提示] 这里将记录你与 DasKapital 的私聊。' }]);
      }
      renderChoices([]); updateObjectives(); return;
    }
    if(currentThread==='group'){
      if(!restoreThreadLogs('group')){
        renderMessages([{ type:'system', text:'[系统提示] 点击左侧头像切换线程。' }]);
      }
      renderChoices([]); updateObjectives(); return;
    }
    if(currentThread==='dm-zhengfang'){ restoreThreadLogs('dm-zhengfang'); renderChoices([]); updateObjectives(); return; }
    if(currentThread==='dm-zhangyu'){ restoreThreadLogs('dm-zhangyu'); renderChoices([]); updateObjectives(); return; }
  }
  
  function initZf(){ state.zf={ round:1, heart:100, fans:0, collabRounds:0, mcnPlus5:false, sincerityBuffRounds:0 }; }
  // Card pool (expanded)
  function zfOptions(){ return [
    { name:'真心分享', eff:{ fans:5000, heart:-5 } },
    { name:'知识科普', eff:{ fans:15000, heart:-15 } },
    { name:'回馈粉丝直播', eff:{ fans:20000, heart:-10 } },
    { name:'打卡网红餐厅', eff:{ fans:30000, heart:-25 } },
    { name:'热门挑战', eff:{ fans:40000, heart:-30 } },
    { name:'植入商业广告', eff:{ fans:25000, heart:-35 } },
    { name:'悬念标题党', eff:{ fans:50000, heart:-40 } },
    // 风险收益型
    { name:'锐评时事热点', eff:'risk_hot' },
    { name:'“硬核”知识付费内容', eff:'risk_hardcore' },
    // 连锁/持续效果型
    { name:'开启“真情实感”新系列', eff:{ fans:5000, heart:-5 } },
    { name:'与大V进行联动', eff:{ fans:35000, heart:-30 } },
    { name:'举办粉丝见面会', eff:{ fans:-5000, heart:+40 } },
    { name:'签约MCN机构', eff:{ fans:20000, heart:-5 } },
    { name:'“佛系”更新/休息一周', eff:{ fans:-15000, heart:+50 } },
    { name:'回应负面评论（抛硬币）', eff:'coin' },
  ]; }
  function draw3(){ const pool=zfOptions().slice(); for(let i=pool.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [pool[i],pool[j]]=[pool[j],pool[i]];} return pool.slice(0,3); }
  function nextZf(){ const g=state.zf; if(g.heart<=0){ endZf('burnout'); return; } if(g.round>3){ const res=(g.fans>=100000)?((g.heart>=40)?'noble':'bleak'):'burnout'; endZf(res); return; }
    // 与大V联动的持续效果：接下来2回合，每回合自动+5000粉丝
    if(typeof g.collabRounds==='number' && g.collabRounds>0){ g.fans += 5000; g.collabRounds--; appendMessages([{ type:'system', text:'[联动加成] 本回合自动 +5000 粉丝。' }]); }
    appendMessages([{ type:'system', text:`[第 ${g.round} 回合] 当前 粉丝：${g.fans}；真心：${g.heart}` }]);
    const opts = draw3();
    renderChoices(
      opts.map(o => {
        let previewFans = '';
        let previewHeart = '';
        if (o.eff === 'coin') {
          previewFans = '+25000';
          previewHeart = '±(20/-30)';
        } else if(o.eff==='risk_hot'){
          previewFans = '±(70000/-10000)';
          previewHeart = '-25/-40';
        } else if(o.eff==='risk_hardcore'){
          previewFans = '±(40000/5000)';
          previewHeart = '-10/-20';
        } else {
          const f = o.eff.fans;
          const h = o.eff.heart;
          previewFans = (f >= 0 ? '+' : '') + f;
          previewHeart = (h >= 0 ? '+' : '') + h;
        }
        return {
          label: `${o.name}｜预计 粉丝${previewFans}，真心${previewHeart}`,
          onChoose: () => {
            // Determine effects
            let df=0, dh=0;
            if (o.eff === 'coin') {
              const ok = Math.random() < 0.5; df = 25000; dh = ok ? +20 : -30;
            } else if(o.eff==='risk_hot'){
              const ok = Math.random() < 0.5; df = ok?70000:-10000; dh = ok?-25:-40;
            } else if(o.eff==='risk_hardcore'){
              const ok = Math.random() < 0.3; df = ok?40000:5000; dh = ok?-10:-20;
            } else {
              df = o.eff.fans; dh = o.eff.heart;
              // Long-term effects
              if(o.name.indexOf('与大V进行联动')===0){ g.collabRounds = 2; }
              if(o.name.indexOf('签约MCN机构')===0){ g.mcnPlus5 = true; }
              if(o.name.indexOf('开启“真情实感”新系列')===0){ g.sincerityBuffRounds = 1; }
            }
            // MCN penalty: extra -5 heart cost on future picks with heart consumption only
            if(g.mcnPlus5 && dh < 0){ dh -= 5; }
            // Sincerity series active this round?
            const sincerityActive = (g.sincerityBuffRounds>0);
            if(sincerityActive){ if(dh<0 && Math.abs(dh) < 20){ df *= 2; } }
            // Apply
            g.fans += df; g.heart += dh;
            appendMessages([{ type:'system', text:`【结果】粉丝=${g.fans}；真心=${g.heart}` }]);
            g.round++;
            if(sincerityActive){ g.sincerityBuffRounds = Math.max(0, g.sincerityBuffRounds-1); }
            saveState();
            nextZf();
          }
        };
      })
    );
  }
  function endZf(result){
    state.choices.zhengFang=result; renderChoices([]);
    if(result==='noble') appendMessages([{type:'system', text:'结局B：“高尚的胜利” —— 守住本心并完成目标。'}]);
    else if(result==='bleak') appendMessages([{type:'system', text:'结局A：“惨淡的胜利” —— 完成目标但真心透支。'}]);
    else appendMessages([{type:'system', text:'结局C：“彻底的倦怠” —— 真心枯竭或未完成目标。'}]);
    updateObjectives(); saveState();
    // 场景四：殊途同归的真理（仍在郑芳私聊）
    const scene4 = [
      { type:'msg', name:'你', avatar:AVATARS.you, text:'芳芳，我有个感觉，不知道对不对。你有没有觉得，我们好像都在崇拜一些符号？比如点赞数、粉丝量。好像这些数字，比我们自己开不开心更重要。' },
      { type:'msg', name:'@芳芳Fighting (郑芳)', avatar:AVATARS.zhengfang, text:'（她沉默了很久）是的……我们刚刚经历的一切，不就是最好的证明吗？为了那个数字，我差点把自己逼疯。我好像……真的在拜一个叫“数据”的神。' },
      { type:'system', text:'[剧情注释] “流量赌局”让“商品拜物教”的体验变得真切：你们以“真心”交换抽象的“数据”。' },
      { type:'system', text:'[系统提示] 你决定再次联系“DasKapital”。' },
    ];
    startQueue(scene4, ()=>{
      // 场景五：探寻根源（切到马克思私聊）
      state.unlocks.dasKapital = true; saveState();
      currentThread='dm-daskapital'; renderThreadsForScene('part3_zhengfang');
      const scene5 = [
        { type:'msg', name:'你', avatar:AVATARS.you, text:'先生，我的朋友似乎被数据和流量困住了，她说自己像在“拜一个叫数据的神”。我们刚刚经历了一场痛苦的抉择……为什么这套系统有如此巨大的力量？' },
        { type:'msg', name:'DasKapital (马克思)', avatar:AVATARS.daskapital, text:'你的问题触及核心。在一个社会中，占统治地位的思想，往往是统治阶级的思想。他们通过各种机构来塑造和维护这套思想，使其看起来像天经地义、唯一的真理。' },
        { type:'msg', name:'DasKapital (马克思)', avatar:AVATARS.daskapital, text:'在当代，社交媒体平台在很大程度上扮演了这样的角色。借用阿尔都塞的概念，可以把它看作新型的“意识形态国家机器”。算法不仅塑造消费习惯，更塑造人们对“成功”“美好生活”“个人价值”的想象。' },
        { type:'msg', name:'DasKapital (马克思)', avatar:AVATARS.daskapital, text:'它不断地告诉你：更多粉丝、更高流量就是成功；像某个网红那样生活就是幸福。久而久之，人们把由资本逻辑定义的价值观内化为自己的追求。这种看不见的思想控制，就是“虚假意识”。' },
        { type:'msg', name:'DasKapital (马克思)', avatar:AVATARS.daskapital, text:'而你朋友感受到的“作品反过来控制自己”的痛苦，就是“异化”的现代形态：产品、过程、人的类本质与人与人关系都被异化为冷冰冰的指标与交易。' },
      ];
      startQueue(scene5, ()=>{ 
        state.pendingTransitionKey='tr3';
        appendMessages([{ type:'system', text:'[系统提示] 请点击右上方关闭“笔记本”，黑屏转场后进入下一幕。' }]);
        renderChoices([]);
        saveState();
      }, { clear:true, showFirst:true });
    }, { clear:false, showFirst:true });
  }
  function buildZhengFang(){ 
    renderThreadsForScene('part3_zhengfang');
    // 场景一：群聊引子（仅一次）
    if(!state.gates.p3_zf_groupIntroDone){
      currentThread='group'; renderThreadsForScene('part3_zhengfang');
      const g = [
        { type:'system', text:'[时间：第二天深夜。群聊“夜班聊天室”再次被激活。]' },
        { type:'msg', name:'@芳芳Fighting (郑芳)', avatar:AVATARS.zhengfang, text:'我…我真的撑不住了…我现在睁眼第一件事就是看数据，涨了几个粉，掉了几个粉…播放量高不高…我感觉“@芳芳Fighting”这个人设，才是我真正的老板，我每天都在为她打工…为了流量，我开始做一些自己都觉得很无聊的挑战…我到底是谁啊？' },
        { type:'msg', name:'@赛博画手 (陈洁)', avatar:AVATARS.chenjie, text:'芳芳！别这样想！' },
        { type:'msg', name:'@风里来雨里去 (张宇)', avatar:AVATARS.zhangyu, text:'做博主这么累的吗…' },
        { type:'system', text:'郑芳的发言让你十分揪心。你立刻点击了她的头像，想私下和她聊聊。' },
        { type:'system', text:'[你进入了与郑芳的私聊界面]' },
      ];
      startQueue(g, ()=>{ state.gates.p3_zf_groupIntroDone=true; saveState(); currentThread='dm-zhengfang'; renderThreadsForScene('part3_zhengfang'); buildZhengFang(); }, { clear:true, showFirst:true });
      return;
    }
    // 若当前在群聊，展示历史并提示
    if(currentThread==='group'){
      if(!restoreThreadLogs('group')){ renderMessages([{ type:'system', text:'[系统提示] 点击左侧 @芳芳Fighting 头像进入私聊。' }]); }
      updateObjectives(); return;
    }
    // 场景二：DM 铺垫 → 开始《流量的赌局》
  // If the preface and game intro haven't been played yet, play them once regardless of existing logs
  if(!state.gates.p3_zf_prePlayed){
    const pre = [
      { type:'msg', name:'你', avatar:AVATARS.you, text:'芳芳，还好吗？看到你在群里那样，很担心你。' },
      { type:'msg', name:'@芳芳Fighting (郑芳)', avatar:AVATARS.zhengfang, text:'我没事……就是觉得好累，有点不知道该怎么继续下去了。感觉自己被数据绑架了，做什么都错。' },
      { type:'msg', name:'你', avatar:AVATARS.you, text:'或许你需要休息一下。不如，接下来几期视频我帮你一起策划吧，就当换换脑子。' },
      { type:'msg', name:'@芳芳Fighting (郑芳)', avatar:AVATARS.zhengfang, text:'……真的吗？那太好了，我现在脑子一团乱麻。' },
      { type:'system', text:'[系统提示] 你开始和郑芳一起策划接下来 3 期的视频内容。这不仅是账号规划，更是一次心灵方向的抉择。' },
      { type:'system', text:'[游戏名称] 《流量的赌局》' },
      { type:'system', text:'[核心玩法] 在限定轮数内，通过选择不同创作方向达成既定目标。每张“内容卡”都会影响粉丝与真心储备。' },
      { type:'system', text:'[目标] 3 回合（3 期视频）内，粉丝 +10 万。' },
      { type:'system', text:'[核心资源] 真心储备（初始 100），代表创作热情与精神能量。部分选择会消耗它，少数选择会恢复它。' },
      { type:'system', text:'[游戏流程] 每回合从“内容卡池”随机抽取 3 张，选择 1 张执行；执行后会结算粉丝增量与真心变化，然后进入下一回合。' },
    ];
    startQueue(pre, ()=>{ 
      state.gates.p3_zf_prePlayed = true; 
      saveState(); 
      renderChoices([{ label:'开始《流量的赌局》', onChoose:()=>{ renderChoices([]); initZf(); saveState(); nextZf(); } }]);
      updateObjectives();
    }, { clear:true, showFirst:true });
    return;
  }
  // If a mini-game run is already in progress, resume it
  if(state.zf && state.zf.round && state.zf.round<=3 && !state.choices.zhengFang){
    restoreThreadLogs('dm-zhengfang');
    appendMessages([{ type:'system', text:`[继续] 第 ${state.zf.round} 回合，粉丝：${state.zf.fans}；真心：${state.zf.heart}` }]);
    nextZf(); return;
  }
  if(restoreThreadLogs('dm-zhengfang')){
      if(!state.choices.zhengFang){ renderChoices([{ label:'开始《流量的赌局》', onChoose:()=>{ renderChoices([]); initZf(); saveState(); nextZf(); } }]); }
      else { renderChoices([]); }
      updateObjectives(); return;
    }
  }

  // Part 3 · ZhangYu
  function buildZhangYu(){ 
  // Repair any mixed logs from earlier versions
  repairZhangYuLogs();
  ensureZyGroupIntro();
  renderThreadsForScene('part3_zhangyu');
  
  // Group intro (only once)
  if(!state.gates.p3_zy_groupIntroDone){
    currentThread='group';
    renderThreadsForScene('part3_zhangyu');
    const g = [
      { type:'system', text:'[时间：傍晚，下着大雨。群聊中。]' },
      { type:'image', name:'@风里来雨里去 (张宇)', avatar:AVATARS.zhangyu, imgSrc:'图片/屋檐下躲雨自拍.png' },
      { type:'msg', name:'@风里来雨里去 (张宇)', avatar:AVATARS.zhangyu, text:'平台又改规则了，配送费降了，但超时罚款还高了。今天跑了9个小时，才赚了这点钱。说好的"时间自由"呢？' },
      { type:'msg', name:'@芳芳Fighting (郑芳)', avatar:AVATARS.zhengfang, text:'天啊，下这么大雨还在外面跑，太危险了！快回家吧！' },
      { type:'system', text:'[系统提示] 张宇的经历让你想起了马克思先生提到过的"计件工资/剩余价值"。你决定向他请教。' },
    ];
    startQueue(g, ()=>{
      state.gates.p3_zy_groupIntroDone = true; 
      state.unlocks.dasKapital = true; 
      saveState();
      // Don't automatically switch thread, let user navigate
      renderThreadsForScene('part3_zhangyu');
      updateObjectives();
    }, { clear:true, showFirst:true });
    return;
  }
  
  // DasKapital 线程：恢复历史或播放指导（仅在真正位于马克思线程时）
  if(currentThread === 'dm-daskapital'){
      els.btnOpenAnalysis.classList.remove('hidden');
      
      // Check if we have Zhang Yu specific Marx conversation in logs
      const marxLogs = state.logs['dm-daskapital'] || [];
      const hasZyMarxConvo = marxLogs.some(msg => 
        msg && msg.text && (
          msg.text.includes('计件工资') || 
          msg.text.includes('剩余价值') ||
          msg.text.includes('外卖订单来分析')
        )
      );
      
      if(hasZyMarxConvo){ 
        // If Zhang Yu Marx history exists, restore it
        restoreThreadLogs('dm-daskapital');
        if(!state.gates.p3_zy_marxShown){ state.gates.p3_zy_marxShown = true; saveState(); }
        renderChoices([]); updateObjectives(); return; 
      }
      
      // Clear any existing Marx logs that might be from other storylines
      clear(els.chatLog);
      
      startQueue([
        { type:'system', text:'[系统提示] 你向 DasKapital 请教"剩余价值"。' },
        { type:'msg', name:'你', avatar:AVATARS.you, text:'先生，张宇的情况，似乎就是您之前提到的剥削的例子？但他觉得自己是"自由"的，按劳所得。' },
        { type:'msg', name:'DasKapital (马克思)', avatar:AVATARS.daskapital, text:'这并不是新问题。他这种"按单结钱"的模式，叫"计件工资"。它经常掩盖剥削关系的本质。' },
        { type:'msg', name:'DasKapital (马克思)', avatar:AVATARS.daskapital, text:'为了直观，我们用一个外卖订单来分析：名义收入、平台抽成与劳动时间的分配。' },
        { type:'system', text:'[操作提示] 点击上方"可视化"按钮，打开《剩余价值可视化表格》。' },
      ], ()=>{ 
        state.gates.p3_zy_marxShown = true; saveState(); 
        // Provide a clear next-step hint inside the chat
        appendMessages([{ type:'system', text:'[操作提示] 阅读完可视化后，请点击左侧"@风里来雨里去 (张宇)"继续做出选择。' }]);
        renderChoices([]);
        updateObjectives();
      }, { clear:true, showFirst:true, autoInterval: 800, pauseInitially:false });
      return;
    }
  // 如果当前在张宇私聊线程，才播放预热与选项；并且保证先完成马克思引导
  if(currentThread === 'dm-zhangyu'){
      // Do not allow entering ZhangYu DM choices before Marx guidance
      if(!state.gates.p3_zy_marxShown){
        appendMessages([{ type:'system', text:'[系统提示] 请先查看 DasKapital 的私聊，并点击上方“可视化”按钮了解“剩余价值”，再回来与张宇讨论。' }]);
        renderChoices([]); updateObjectives(); return;
      }
      els.btnOpenAnalysis.classList.remove('hidden');
      // 如果已有历史，且未做选择，则再次提供选项；否则不重复加载
      if(restoreThreadLogs('dm-zhangyu')){
        if(!state.choices.zhangYu){
          renderChoices([
            { label:'选项A：引导阶级意识（联合行动）', onChoose:()=>{ state.choices.zhangYu='A'; appendMessages([
              { type:'msg', name:'你', avatar:AVATARS.you, text:'你不是一个人。把分析发到骑手群，让更多人看到。一个人对抗不了算法，但一群人可以。' },
              { type:'msg', name:'@风里来雨里去 (张宇)', avatar:AVATARS.zhangyu, text:'……好！我试试！与其一个人憋着，不如让大家都看看！' },
            ]); state.pendingTransitionKey='tr4'; appendMessages([{ type:'system', text:'[系统提示] 请点击右上方关闭“笔记本”，黑屏转场后进入下一幕。' }]); renderChoices([]); updateObjectives(); saveState(); }},
            { label:'选项B：维持虚假意识（换平台/换工作）', onChoose:()=>{ state.choices.zhangYu='B'; appendMessages([
              { type:'msg', name:'你', avatar:AVATARS.you, text:'这个平台太坑了，要不换个平台，或找个更稳定的工作？' },
              { type:'msg', name:'@风里来雨里去 (张宇)', avatar:AVATARS.zhangyu, text:'唉，哪儿都一样。能干一天是一天吧。' },
            ]); state.pendingTransitionKey='tr4'; appendMessages([{ type:'system', text:'[系统提示] 请点击右上方关闭“笔记本”，黑屏转场后进入下一幕。' }]); renderChoices([]); updateObjectives(); saveState(); }},
          ]);
        } else { renderChoices([]); }
        updateObjectives(); return;
      }
      const pre = [
        { type:'msg', name:'@风里来雨里去 (张宇)', avatar:AVATARS.zhangyu, text:'平台又改规则了。跑了 9 个小时，赚了这点钱。说好的“时间自由”呢？' },
        { type:'system', text:'[系统提示] 你可以打开可视化，一步步讲清“剩余价值”。' },
      ];
      startQueue(pre, ()=>{
        renderChoices([
          { label:'选项A：引导阶级意识（联合行动）', onChoose:()=>{ state.choices.zhangYu='A'; appendMessages([
            { type:'msg', name:'你', avatar:AVATARS.you, text:'你不是一个人。把分析发到骑手群，让更多人看到。一个人对抗不了算法，但一群人可以。' },
            { type:'msg', name:'@风里来雨里去 (张宇)', avatar:AVATARS.zhangyu, text:'……好！我试试！与其一个人憋着，不如让大家都看看！' },
          ]); state.pendingTransitionKey='tr4'; appendMessages([{ type:'system', text:'[系统提示] 请点击右上方关闭“笔记本”，黑屏转场后进入下一幕。' }]); renderChoices([]); updateObjectives(); saveState(); }},
          { label:'选项B：维持虚假意识（换平台/换工作）', onChoose:()=>{ state.choices.zhangYu='B'; appendMessages([
            { type:'msg', name:'你', avatar:AVATARS.you, text:'这个平台太坑了，要不换个平台，或找个更稳定的工作？' },
            { type:'msg', name:'@风里来雨里去 (张宇)', avatar:AVATARS.zhangyu, text:'唉，哪儿都一样。能干一天是一天吧。' },
          ]); state.pendingTransitionKey='tr4'; appendMessages([{ type:'system', text:'[系统提示] 请点击右上方关闭“笔记本”，黑屏转场后进入下一幕。' }]); renderChoices([]); updateObjectives(); saveState(); }},
        ]);
      });
      return;
    }
    // 如果在群聊线程，恢复群聊历史，避免将张宇私聊内容写入群聊
    if(currentThread === 'group'){
      if(!restoreThreadLogs('group')){ renderMessages([]); }
      renderChoices([]); updateObjectives();
      return;
    }
  }

  // Ending
  function buildEnding(){ currentThread='group'; renderThreadsForScene('ending'); const good=(state.choices.chenJie==='A' && state.choices.zhengFang==='noble' && state.choices.zhangYu==='A'); if(good){ renderMessages([
    { type:'system', text:'结局A：“新的起点”（Good Ending）' },
    { type:'msg', name:'@赛博画手 (陈洁)', avatar:AVATARS.chenjie, text:'我联系了十几个独立设计师，准备搞线上合作社，共同定价、抵制不合理的 AI 条款！' },
    { type:'msg', name:'@风里来雨里去 (张宇)', avatar:AVATARS.zhangyu, text:'我们骑手群正在收集证据，准备向监管反映，要求更透明的算法和保障！' },
    { type:'msg', name:'@芳芳Fighting (郑芳)', avatar:AVATARS.zhengfang, text:'我想通了！下一期聊“我如何杀死那个百万粉丝的‘我’”。不怕掉粉了，说真话最重要！' },
    { type:'system', text:'“哲学家们只是用不同的方式解释世界，而问题在于改变世界。” —— 马克思' },
  ]); } else { renderMessages([
    { type:'system', text:'结局B：“无尽的夜晚”（Bad/Mixed Ending）' },
    { type:'msg', name:'@赛博画手 (陈洁)', avatar:AVATARS.chenjie, text:'AI 课好难…还是卷不过。昨天又被拒了。' },
    { type:'msg', name:'@芳芳Fighting (郑芳)', avatar:AVATARS.zhengfang, text:'昨天数据又掉了。先接个广告吧，不然房租都交不起。' },
    { type:'msg', name:'@风里来雨里去 (张宇)', avatar:AVATARS.zhangyu, text:'换了个平台还是一样坑。准备回老家了。' },
    { type:'system', text:'“人们自己创造历史……但不是在他们自己选定的条件下创造。” —— 马克思' },
  ]); } renderChoices([]); els.btnNext.disabled=true; }

  // ----------------------------
  // Music Player (NetEase-like simplified)
  // ----------------------------
  const tracks = [
    { name:'来去曼波', artist:'还我神ID', src:'歌曲/歌曲一（来去曼波 作者 还我神ID）.mp3' },
    { name:'不再曼波', artist:'还我神ID', src:'歌曲/歌曲二（不再曼波 作者 还我神ID）.mp3' },
    { name:'耄耋镇', artist:'还我神ID', src:'歌曲/歌曲三（耄耋镇 作者 还我神ID）.mp3' },
  ];
  let trackIndex = 0; let playing=false;
  function renderPlaylist(){ clear(els.trackList); tracks.forEach((t,i)=>{ const li=document.createElement('li'); li.className='track-item'+(i===trackIndex?' active':''); const name=document.createElement('div'); name.className='track-name'; name.textContent=t.name; const meta=document.createElement('div'); meta.className='track-meta'; meta.textContent=t.artist; li.appendChild(name); li.appendChild(meta); li.addEventListener('click', ()=>{ trackIndex=i; loadTrack(); play(); }); els.trackList.appendChild(li); }); }
  function loadTrack(){ const t=tracks[trackIndex]; els.audio.src=t.src; els.audio.load(); renderPlaylist(); }
  function play(){ els.audio.play(); playing=true; els.btnPlayPause.textContent='⏸'; els.disc.classList.add('spinning'); }
  function pause(){ els.audio.pause(); playing=false; els.btnPlayPause.textContent='▶'; els.disc.classList.remove('spinning'); }
  function prevTrack(){ trackIndex=(trackIndex-1+tracks.length)%tracks.length; loadTrack(); play(); }
  function nextTrack(){ trackIndex=(trackIndex+1)%tracks.length; loadTrack(); play(); }
  function bindPlayer(){ renderPlaylist(); loadTrack(); els.btnPlayPause.addEventListener('click', ()=>{ playing?pause():play(); }); els.btnPrevTrack.addEventListener('click', prevTrack); els.btnNextTrack.addEventListener('click', nextTrack); els.audio.addEventListener('timeupdate', ()=>{ els.progressBar.style.width = ((els.audio.currentTime/ (els.audio.duration||1))*100)+'%'; els.currentTime.textContent=formatTime(els.audio.currentTime); els.duration.textContent=formatTime(els.audio.duration); }); els.audio.addEventListener('ended', nextTrack); }

  // ----------------------------
  // Panels & Buttons
  // ----------------------------
  function showPanel(el){ el.classList.remove('hidden'); el.setAttribute('aria-hidden','false'); }
  function hidePanel(el){ el.classList.add('hidden'); el.setAttribute('aria-hidden','true'); }
  function bindPanels(){
    els.btnNotebook.addEventListener('click', ()=>{
      showPanel(els.notebook);
      // When opening notebook in Part 1, start group intro once
      if(state.sceneIndexKey()==='part1' && state.didPrologue && !state.part1GroupPlayed){
        startPart1GroupIntro();
      }
    });
    if(els.btnTheme){ els.btnTheme.addEventListener('click', ()=>{ state.settings.theme = (state.settings.theme === 'spacegray') ? 'default' : 'spacegray'; applyTheme(); saveState(); }); }
    els.btnMusic.addEventListener('click', ()=>{ pauseQueueOnThreadSwitch(); showPanel(els.musicPlayer); });
    els.btnNotice.addEventListener('click', ()=>{ pauseQueueOnThreadSwitch(); showPanel(els.noticeBoard); updateSpeedUI(); });
    els.closeNotebook.addEventListener('click', ()=>{ pauseQueueOnThreadSwitch(); hidePanel(els.notebook);
      // If a specific transition is requested by story flow, honor it
      if(state.pendingTransitionKey){ const key=state.pendingTransitionKey; state.pendingTransitionKey=null; saveState(); gotoKey(key); return; }
      if(state.pendingNightTransition){
      state.pendingNightTransition=false; saveState();
      // Step 1: 夜深了 该休息了（轻提示，不黑屏）
      showTransition('系统：夜深了，该休息了。', ()=>{
        // Step 2: 逐渐变黑并显示“第二天 傍晚”
        setTimeout(()=>{
          showTransition('第二天 · 傍晚', ()=>{
            // 进入 tr1，再去第三部分（按原规划逻辑）
            gotoKey('tr1');
          });
        }, 300);
      });
    } });
    els.closeMusic.addEventListener('click', ()=>{ pauseQueueOnThreadSwitch(); hidePanel(els.musicPlayer); });
    els.closeNotice.addEventListener('click', ()=>{ pauseQueueOnThreadSwitch(); hidePanel(els.noticeBoard); });
    // Prev/Next scene buttons are currently unused
    els.btnOpenAnalysis.addEventListener('click', ()=>{ els.analysisFrame.src='剩余价值可视化表格.html'; els.modal.classList.remove('hidden'); });
    if(els.btnOpenHistory){ els.btnOpenHistory.addEventListener('click', ()=>{ openHistoryForCurrentThread(); }); }
    els.closeModal.addEventListener('click', ()=>{ 
      els.modal.classList.add('hidden'); els.analysisFrame.src=''; 
      // In ZhangYu chapter, after closing visualization from Marx thread, guide player back to ZhangYu DM
      const key = state.sceneIndexKey && state.sceneIndexKey();
      if(key==='part3_zhangyu' && currentThread==='dm-daskapital'){
        if(!state.gates.p3_zy_marxShown){ state.gates.p3_zy_marxShown = true; saveState(); }
        currentThread='dm-zhangyu';
        renderThreadsForScene('part3_zhangyu');
        buildZhangYu();
      }
    });
    if(els.closeHistoryModal){ els.closeHistoryModal.addEventListener('click', (e)=>{ e.stopPropagation(); hideHistoryModal(); }); }
    if(els.historyModal){ els.historyModal.addEventListener('click', (e)=>{ // clicking backdrop/content advances
      // avoid clicking on close button
      if(e.target && (e.target.id==='closeHistoryModal')) return;
      historyAdvance();
    }); }
    // profile dossier modal
    if(els.closeProfileModal){ els.closeProfileModal.addEventListener('click', ()=>{ closeProfile(); }); }
    if(els.profileModal){ els.profileModal.addEventListener('click', (e)=>{ if(e.target===els.profileModal) closeProfile(); }); }
    bindSpeedControls();
  }

  // ----------------------------
  // Pre-chat History (from 游戏剧情之前的与人物对话的历史资料.md)
  // ----------------------------
  const HISTORY_DATA = {
    'dm-chenjie': [
      { k:'system', t:'与 @赛博画手 (陈洁) 的历史聊天记录' },
      { k:'system', t:'【两周前】' },
      { k:'dialog', t:'你: 看到你朋友圈发的新图了，光影好棒！' },
      { k:'dialog', t:'@赛博画手 (陈洁): 嘿嘿，那个单子磨了快一周，客户总算满意了。' },
      { k:'dialog', t:'@赛博画手 (陈洁): 总算可以喘口气，这个月助学贷款的钱有着落了！[加油 💪]' },
      { k:'dialog', t:'你: 太强了！搞定个大单，晚上不得好好犒劳下自己？' },
      { k:'dialog', t:'@赛博画手 (陈洁): 犒劳啥呀，赶紧看下一个单子了，不敢停。' },
      { k:'system', t:'【三天前】' },
      { k:'dialog', t:'@赛博画手 (陈洁): 我真是服了，现在有些客户真的一言难尽。' },
      { k:'dialog', t:'你: 怎么了？又遇到奇葩了？' },
      { k:'dialog', t:'@赛博画手 (陈洁): 刚谈的一个单子，他发给我一堆AI生成的图，说喜欢这种“华丽的科技感”，让我照着这个风格画。' },
      { k:'dialog', t:'@赛博画手 (陈洁): 我感觉自己不像个画师，像个AI的“优化师”。他说我的报价太高了，AI出图几乎不要钱…' },
      { k:'dialog', t:'你: 这也太过分了。' },
      { k:'dialog', t:'@赛博画手 (陈洁): 心累。感觉自己辛辛苦苦学的东西，越来越不值钱了。' },
    ],
    'dm-zhangyu': [
      { k:'system', t:'与 @风里来雨里去 (张宇) 的历史聊天记录' },
      { k:'system', t:'【一个月前的一个雨夜】' },
      { k:'dialog', t:'你: 雨这么大还在外面跑吗？注意安全啊！' },
      { k:'dialog', t:'@风里来雨里去 (张宇): 没事，习惯了。' },
      { k:'dialog', t:'@风里来雨里去 (张宇): 就怕这种天气，路滑，膝盖的老伤也跟着凑热闹。不过补贴高，不跑不行。' },
      { k:'dialog', t:'你: 唉，真是辛苦钱。' },
      { k:'dialog', t:'@风里来雨里去 (张宇): 可不是嘛，拿命换的“自由”。[苦笑]' },
      { k:'system', t:'【一周前】' },
      { k:'dialog', t:'@风里来雨里去 (张宇): 平台的路线规划就是个傻子，为了让我准时，给我导了一条正在修路的巷子，导航上根本没更新。' },
      { k:'dialog', t:'你: 啊？那超时了没？' },
      { k:'dialog', t:'@风里来雨里去 (张宇): 绕了一大圈，最后还是超时了5分钟，扣钱。找客服申诉，就是机器人回复，屁用没有。' },
      { k:'dialog', t:'你: 这不欺负人嘛。' },
      { k:'dialog', t:'@风里来雨里去 (张宇): 天天都这样，麻了。' },
    ],
    'dm-zhengfang': [
      { k:'system', t:'与 @芳芳Fighting (郑芳) 的历史聊天记录' },
      { k:'system', t:'【十天前】' },
      { k:'dialog', t:'@芳芳Fighting (郑芳): 家人们！帮我看看这两个封面哪个点击率会更高？' },
      { k:'dialog', t:'你: 我觉得图1更好看，更真实一点。' },
      { k:'dialog', t:'@芳芳Fighting (郑芳): 可是我感觉图2的字体和表情更夸张，可能会更吸引人点进去…数据可能会更好…好纠结啊啊啊！' },
      { k:'dialog', t:'你: 按你自己喜欢的来就好啦。' },
      { k:'dialog', t:'@芳芳Fighting (郑芳): 不行不行，选题和封面是账号的命脉，我再研究下后台数据！' },
      { k:'system', t:'【昨晚深夜】' },
      { k:'dialog', t:'你: 这么晚还不睡？' },
      { k:'dialog', t:'@芳芳Fighting (郑芳): 刷后台数据呢，刚看完了几十个同类型博主的视频，感觉自己不努力就要被淘汰了。' },
      { k:'dialog', t:'你: 你已经很厉害了，别给自己那么大压力。' },
      { k:'dialog', t:'@芳芳Fighting (郑芳): 唉，有时候看着屏幕里那个笑得没心没肺的自己，都觉得好陌生。' },
      { k:'dialog', t:'@芳芳Fighting (郑芳): 算了，不传播负能量了！明天又是元气满满的一天！晚安！[月亮]' },
    ],
  };

  // History modal flow (typewriter like prologue)
  function showHistoryModal(){ if(!els.historyModal) return; els.historyModal.classList.remove('hidden'); els.historyModal.setAttribute('aria-hidden','false'); }
  function hideHistoryModal(){ if(!els.historyModal) return; stopHistoryTyping(true); els.historyModal.classList.add('hidden'); els.historyModal.setAttribute('aria-hidden','true'); clear(els.historyLog); }
  let hisQueue = []; let hisIndex=-1; let hisTyping={ timer:null, el:null, full:'', idx:0, active:false, perChar:30 };
  function startHistoryTyping(el, full, perCharMs, onDone){ stopHistoryTyping(true); hisTyping = { timer:null, el, full, idx:0, active:true, perChar:perCharMs, onDone }; const tick=()=>{ if(!hisTyping.active) return; if(hisTyping.idx>=full.length){ stopHistoryTyping(false); onDone&&onDone(); return;} hisTyping.idx++; el.textContent = full.slice(0, hisTyping.idx); }; tick(); hisTyping.timer=setInterval(tick, Math.max(5, perCharMs)); }
  function stopHistoryTyping(clearOnly){ if(hisTyping && hisTyping.timer){ clearInterval(hisTyping.timer); } if(hisTyping){ hisTyping.timer=null; hisTyping.active=false; } if(!clearOnly){} }
  function startHistory(items){ hisQueue = items||[]; hisIndex=-1; clear(els.historyLog); showHistoryModal(); historyAdvance(); }
  function historyAdvance(){ if(!hisQueue || !hisQueue.length) return; if(hisTyping && hisTyping.active){ if(hisTyping.el){ hisTyping.el.textContent = hisTyping.full; } stopHistoryTyping(false); return; } if(hisIndex < hisQueue.length-1){ hisIndex++; const it=hisQueue[hisIndex]; const div=document.createElement('div'); div.className='pmsg '+(it.k==='narr'?'narr':it.k==='system'?'system':'inner'); const holder=document.createElement('div'); holder.textContent=''; div.appendChild(holder); els.historyLog.appendChild(div); els.historyLog.scrollTop=els.historyLog.scrollHeight; const full=String(it.t||''); const total = state.settings?.messageDurationMs || 1000; const len=Math.max(1, full.length); const ms=Math.max(state.settings.minCharMs, Math.min(state.settings.maxCharMs, Math.floor(total/len))); startHistoryTyping(holder, full, ms); } else { hideHistoryModal(); } }
  function openHistoryForCurrentThread(){ pauseQueueOnThreadSwitch(); const data = HISTORY_DATA[currentThread]; if(!data){ // no data for this thread
      return;
    }
    startHistory(data);
  }

  // Speed controls (notice board)
  function bindSpeedControls(){
    if(!els.speedSlider) return; // in case HTML not present
    const apply = (val)=>{
      const v = Math.max(200, Math.min(3000, Math.floor(val)));
      state.settings.messageDurationMs = v;
      updateSpeedUI();
      saveState();
    };
    els.speedSlider.addEventListener('input', (e)=>{ apply(e.target.value); });
    if(els.speedSlow) els.speedSlow.addEventListener('click', ()=>apply(1400));
    if(els.speedMedium) els.speedMedium.addEventListener('click', ()=>apply(1000));
    if(els.speedFast) els.speedFast.addEventListener('click', ()=>apply(700));
    updateSpeedUI();
  }
  function updateSpeedUI(){
    if(els.speedSlider){ els.speedSlider.value = String(state.settings.messageDurationMs); }
    if(els.speedValue){ els.speedValue.textContent = String(state.settings.messageDurationMs); }
  }

  // Start the group chat intro sequence in Part 1 (only once)
  function startPart1GroupIntro(){
    if(state.part1GroupPlayed) return;
    state.part1GroupPlayed = true;
    // Ensure thread header shows group
    currentThread = 'group';
    renderThreadsForScene('part1');

    const groupIntro = [
      { type:'msg', name:'@芳芳Fighting (郑芳)', avatar:AVATARS.zhengfang, text:'家人们！我来了！最近被数据搞得快疯了，赶紧建个群抱团取暖 T_T' },
      { type:'msg', name:'@赛博画手 (陈洁)', avatar:AVATARS.chenjie, text:'+1，感觉饭碗随时不保。焦虑到头秃。' },
      { type:'image', name:'@赛博画手 (陈洁)', avatar:AVATARS.chenjie, imgSrc:'图片/图片1.png', text:'客户刚发我的，说“参考一下”…' },
    ];

    const bridge = [
      { type:'image', name:'@风里来雨里去 (张宇)', avatar:AVATARS.zhangyu, imgSrc:'图片/骑手后台.png', text:'“自由”地从早上7点干到晚上11点。' },
      { type:'msg', name:'@芳芳Fighting (郑芳)', avatar:AVATARS.zhengfang, text:'我懂，我太懂了！刚看后台，掉了一百个粉，一晚上没睡好。感觉自己越来越不像个人，像个围着数据转的产品经理。' },
      { type:'msg', name:'@芳芳Fighting (郑芳)', avatar:AVATARS.zhengfang, text:'唉……好吧。那我们还是聊点别的吧……大家今天都辛苦了。' },
    ];
    function presentSecondRound(){
      renderChoices([
        { label:'选项A：【表示认同并引导】“可能正因为深奥，才说明他说到点子上了。我们这些烦心事，说不定根子就在这些道理里。”', onChoose:()=>{
          renderChoices([]);
          startQueue([
            { type:'msg', name:'你', avatar:AVATARS.you, text:'可能正因为深奥，才说明他说到点子上了。我们这些烦心事，说不定根子就在这些道理里。' },
            { type:'msg', name:'@芳芳Fighting (郑芳)', avatar:AVATARS.zhengfang, text:'对对对！我就是这个意思！[星星眼] 感觉我们不能只顾着抱怨，得找到问题到底出在哪儿。' },
            { type:'msg', name:'@赛博画手 (陈洁)', avatar:AVATARS.chenjie, text:'嗯……你这么说好像也有道理。就是怕看不懂。' },
          ], ()=>{
            state.gates.part1SecondChoiceMade = true; saveState();
            renderChoices([{ label:'继续到私聊', onChoose:()=>gotoKey('part2') }]);
          }, { clear:false, showFirst:true, pauseInitially: true });
        }},
        { label:'选项B：【附和怀疑并安慰】“确实，听着就头大。我们就是想倒倒苦水，别想那么多了。”', onChoose:()=>{
          renderChoices([]);
          startQueue([
            { type:'msg', name:'你', avatar:AVATARS.you, text:'确实，听着就头大。我们就是想倒倒苦水，别想那么多了。' },
            { type:'msg', name:'@赛博画手 (陈洁)', avatar:AVATARS.chenjie, text:'+1，脑子已经够乱了，不想再看烧脑的东西了。' },
            { type:'msg', name:'@风里来雨里去 (张宇)', avatar:AVATARS.zhangyu, text:'就是，还不如一起骂两句平台和客户来得实在。' },
            { type:'msg', name:'@芳芳Fighting (郑芳)', avatar:AVATARS.zhengfang, text:'唉……好吧。那我们还是聊点别的吧……大家今天都辛苦了。' },
          ], ()=>{
            state.gates.part1SecondChoiceMade = true; saveState();
            renderChoices([{ label:'继续到私聊', onChoose:()=>gotoKey('part2') }]);
          }, { clear:false, showFirst:true, pauseInitially: true });
        }},
        { label:'选项C：【关心个体，转移话题】“先别管什么博主了。@风里来雨里去 宇哥你赶紧找地方吃饭吧，@赛博画手 也别想那个破客户了。”', onChoose:()=>{
          renderChoices([]);
          startQueue([
            { type:'msg', name:'你', avatar:AVATARS.you, text:'先别管什么博主了。@风里来雨里去 宇哥你赶紧找地方吃饭吧，@赛博画手 也别想那个破客户了。' },
            { type:'msg', name:'@风里来雨里去 (张宇)', avatar:AVATARS.zhangyu, text:'正在路边啃面包呢。谢了兄弟。' },
            { type:'msg', name:'@赛博画手 (陈洁)', avatar:AVATARS.chenjie, text:'谢谢你……就是觉得特别憋屈……' },
            { type:'msg', name:'@芳芳Fighting (郑芳)', avatar:AVATARS.zhengfang, text:'嗯嗯，大家注意身体最重要！抱抱洁宝！' },
          ], ()=>{
            state.gates.part1SecondChoiceMade = true; saveState();
            renderChoices([{ label:'继续到私聊', onChoose:()=>gotoKey('part2') }]);
          }, { clear:false, showFirst:true, pauseInitially: true });
        }},
      ]);
    }

    function playBridgeThenSecond(){ startQueue(bridge, ()=>{ presentSecondRound(); }, { clear:false, showFirst:true }); }

    // Clear once to avoid duplication, then queue
    clear(els.chatLog);
    startQueue(groupIntro, ()=>{
      // Present the first key choice set from 第一部分.md
      renderChoices([
        { label:'选项A：【表达愤怒】“这客户什么意思？太不尊重人了。”', onChoose:()=>{
          appendMessages([
            { type:'msg', name:'你', avatar:AVATARS.you, text:'这客户什么意思？太不尊重人了。' },
            { type:'msg', name:'@赛博画手 (陈洁)', avatar:AVATARS.chenjie, text:'就是说啊…感觉自己像个随时能被扔掉的工具。' },
          ]);
          renderChoices([]); state.gates.part1ChoiceMade = true; saveState();
          playBridgeThenSecond();
        }},
        { label:'选项B：【尝试安抚】“别多想，也许他只是单纯分享。你的价值是AI比不了的。”', onChoose:()=>{
          appendMessages([
            { type:'msg', name:'你', avatar:AVATARS.you, text:'别多想，也许他只是单纯分享。你的价值是AI比不了的。' },
            { type:'msg', name:'@赛博画手 (陈洁)', avatar:AVATARS.chenjie, text:'希望吧…但看着这图，真的很难不焦虑' },
          ]);
          renderChoices([]); state.gates.part1ChoiceMade = true; saveState();
          playBridgeThenSecond();
        }},
        { label:'选项C：【理性分析】“这图看着是挺唬人，但感觉没什么灵魂。”', onChoose:()=>{
          appendMessages([
            { type:'msg', name:'你', avatar:AVATARS.you, text:'这图看着是挺唬人，但感觉没什么灵魂。' },
            { type:'msg', name:'@赛博画手 (陈洁)', avatar:AVATARS.chenjie, text:'话是这么说…但在“效率”和“成本”面前，有几个人在乎灵魂呢？' },
          ]);
          renderChoices([]); state.gates.part1ChoiceMade = true; saveState();
          playBridgeThenSecond();
        }},
      ]);
    }, { clear:false, showFirst:true });
  }

  // Navigate to Part 2 only after both Part1 choices are made
  function gotoPart2AfterPart1Choices(){
    if(state.gates.part1ChoiceMade && state.gates.part1SecondChoiceMade){
      gotoKey('part2');
    }
  }

  // ----------------------------
  // Save / Load to localStorage
  // ----------------------------
  const SAVE_KEY = 'night_shift_chatroom_save_v1';
  function serializeState(){
    return JSON.stringify({
      sceneIndex: state.sceneIndex,
      visited: state.visited,
      unlocks: state.unlocks,
      choices: state.choices,
      zf: state.zf,
      didPrologue: state.didPrologue,
      part1GroupPlayed: state.part1GroupPlayed,
      pendingNightTransition: state.pendingNightTransition,
      pendingTransitionKey: state.pendingTransitionKey,
      gates: state.gates,
      logs: state.logs,
      settings: { messageDurationMs: state.settings.messageDurationMs, theme: state.settings.theme },
    });
  }
  function applyState(data){
    if(!data) return;
    state.sceneIndex = typeof data.sceneIndex==='number'? data.sceneIndex : 0;
    state.visited = data.visited || { dmChenJie:false, dmZhengFang:false, dmZhangYu:false };
    state.unlocks = data.unlocks || { dasKapital:false };
    state.choices = data.choices || { chenJie:null, zhengFang:null, zhangYu:null };
    state.zf = data.zf || null;
    state.didPrologue = !!data.didPrologue;
    state.part1GroupPlayed = !!data.part1GroupPlayed;
    state.pendingNightTransition = !!data.pendingNightTransition;
    state.pendingTransitionKey = data.pendingTransitionKey || null;
    state.gates = data.gates || { part1ChoiceMade: false, part1SecondChoiceMade: false, p3_cj_groupIntroDone: false, p3_cj_started: false, p2_dossier_chenjie_shown: false, p2_dossier_zhengfang_shown: false, p2_dossier_zhangyu_shown: false, p3_zf_groupIntroDone: false, p3_zf_prePlayed: false, p3_zy_groupIntroDone: false, p3_zy_marxShown: false };
    if(typeof state.gates.p3_cj_groupIntroDone === 'undefined') state.gates.p3_cj_groupIntroDone = false;
    if(typeof state.gates.p3_cj_started === 'undefined') state.gates.p3_cj_started = false;
    if(typeof state.gates.p2_dossier_chenjie_shown === 'undefined') state.gates.p2_dossier_chenjie_shown = false;
    if(typeof state.gates.p2_dossier_zhengfang_shown === 'undefined') state.gates.p2_dossier_zhengfang_shown = false;
    if(typeof state.gates.p2_dossier_zhangyu_shown === 'undefined') state.gates.p2_dossier_zhangyu_shown = false;
    if(typeof state.gates.p3_zf_groupIntroDone === 'undefined') state.gates.p3_zf_groupIntroDone = false;
    if(typeof state.gates.p3_zf_prePlayed === 'undefined') state.gates.p3_zf_prePlayed = false;
    if(typeof state.gates.p3_zy_groupIntroDone === 'undefined') state.gates.p3_zy_groupIntroDone = false;
    if(typeof state.gates.p3_zy_marxShown === 'undefined') state.gates.p3_zy_marxShown = false;
    state.logs = data.logs || { group: [], 'dm-chenjie': [], 'dm-zhengfang': [], 'dm-zhangyu': [], 'dm-daskapital': [] };
    if(data.settings){ 
      if(typeof data.settings.messageDurationMs==='number'){ 
        state.settings.messageDurationMs = data.settings.messageDurationMs; 
      } 
      if(data.settings.theme){ 
        state.settings.theme = data.settings.theme; 
      } 
    }
    applyTheme();
  }
  function saveState(){ try{ localStorage.setItem(SAVE_KEY, serializeState()); }catch(e){} }
  function loadState(){ try{ const raw=localStorage.getItem(SAVE_KEY); if(!raw) return false; const data=JSON.parse(raw); applyState(data); return true; }catch(e){ return false; } }
  function clearSave(){ try{ localStorage.removeItem(SAVE_KEY); }catch(e){} }

  // ----------------------------
  // Entry
  // ----------------------------
  // Helper to jump by key
  function gotoKey(key){ const i = state.scenes.findIndex(s=>s.key===key); if(i>=0) gotoScene(i); }

  // Prologue helpers
  function showPrologue(){ els.prologue.classList.remove('hidden'); els.prologue.setAttribute('aria-hidden','false'); }
  function hidePrologue(){
    // stop any prologue typing and clear
    stopPrologueTyping(true);
    els.prologue.classList.add('hidden');
    els.prologue.setAttribute('aria-hidden','true');
    clear(els.prologueLog);
  }

  // Prologue typing helpers (independent from chat typing)
  function startPrologueTyping(el, full, perCharMs, onDone){
    stopPrologueTyping(true);
    state.proTyping = { timer: null, el, full, idx: 0, active: true, perChar: perCharMs };
    const tick = ()=>{
      if(!state.proTyping.active) return;
      if(state.proTyping.idx >= full.length){ stopPrologueTyping(false); onDone && onDone(); return; }
      state.proTyping.idx++;
      el.textContent = full.slice(0, state.proTyping.idx);
    };
    tick();
    state.proTyping.timer = setInterval(tick, Math.max(5, perCharMs));
  }
  function stopPrologueTyping(clearOnly){
    if(state.proTyping && state.proTyping.timer){ clearInterval(state.proTyping.timer); }
    if(state.proTyping){ state.proTyping.timer=null; state.proTyping.active=false; }
    if(!clearOnly){}
  }
  function startPrologue(items, onComplete){
    state.proQueue = items || [];
    state.proIndex = -1;
    state.proDone = typeof onComplete === 'function' ? onComplete : null;
    stopPrologueTyping(true);
    clear(els.prologueLog);
    showPrologue();
    prologueAdvance();
  }
  function prologueAdvance(){
    if(!state.proQueue || !state.proQueue.length) return;
    // If typing in progress, complete current line only
    if(state.proTyping && state.proTyping.active){
      if(state.proTyping.el){ state.proTyping.el.textContent = state.proTyping.full; }
      stopPrologueTyping(false);
      return;
    }
    if(state.proIndex < state.proQueue.length - 1){
      state.proIndex++;
      const item = state.proQueue[state.proIndex];
      const div = document.createElement('div');
      div.className = 'pmsg ' + (item.k==='narr'?'narr':item.k==='inner'?'inner':'system');
      // create holder and type
      const holder = document.createElement('div');
      holder.textContent = '';
      div.appendChild(holder);
      els.prologueLog.appendChild(div);
      els.prologueLog.scrollTop = els.prologueLog.scrollHeight;
      const full = String(item.t||'');
      const total = state.settings?.messageDurationMs || 1000;
      const len = Math.max(1, full.length);
      const ms = Math.max(state.settings.minCharMs, Math.min(state.settings.maxCharMs, Math.floor(total/len)));
      startPrologueTyping(holder, full, ms);
    } else {
      const done = state.proDone; state.proQueue = []; state.proIndex = -1; state.proDone = null;
      if(typeof done === 'function') done();
    }
  }

  // ----------------------------
  // Easter Eggs
  // ----------------------------
  
  // 马克思名言
  const marxQuotes = [
    "哲学家们只是用不同的方式解释世界，而问题在于改变世界。",
    "一个人应该：活泼而守纪律，天真而不幼稚，勇敢而不鲁莽，倔强而有原则。",
    "人要学会走路，也要学会摔跤，而且只有经过摔跤，才能学会走路。",
    "在科学上没有平坦的大道，只有不畏劳苦沿着陡峭山路攀登的人，才有希望达到光辉的顶点。",
    "社会的进步就是人类对美的追求的结晶。",
    "历史把那些为了广大的目标而工作，因而使自己变得高尚的人看作是伟大的人。"
  ];

  // 电话彩蛋数组
  const phoneEasterEggs = [
    {
      title: "📞 马克思语录",
      content: () => `<p style="font-style: italic; font-size: 16px; text-align: center; color: #ffd700;">"${marxQuotes[Math.floor(Math.random() * marxQuotes.length)]}"</p><p style="text-align: right; margin-top: 15px;">—— 卡尔·马克思</p>`
    },
    {
      title: "📞 拨号失败",
      content: () => `<div style="text-align: center;">
        <div class="loading-dots" style="margin: 20px 0;">
          <span></span><span></span><span></span>
        </div>
        <p>正在连接 DasKapital...</p>
        <p style="margin-top: 20px; color: #ff6b6b;">❌ 该用户正在写《资本论》，请稍后再拨</p>
      </div>`
    },
    {
      title: "📞 通话记录",
      content: () => `<div class="call-history">
        <table>
          <thead>
            <tr>
              <th>联系人</th>
              <th>通话时长</th>
              <th>时间</th>
            </tr>
          </thead>
          <tbody>
            <tr><td>📚 DasKapital (马克思)</td><td>2小时30分</td><td>昨天</td></tr>
            <tr><td>🏭 恩格斯</td><td>45分钟</td><td>2天前</td></tr>
            <tr><td>🌍 列宁</td><td>1小时15分</td><td>一周前</td></tr>
          </tbody>
        </table>
        <p style="font-size: 12px; color: #888; margin-top: 10px;">*通话费用由资本家承担</p>
      </div>`
    }
  ];

  // 视频通话彩蛋数组
  const videoEasterEggs = [
    {
      title: "📹 连接失败",
      content: () => `<div style="text-align: center;">
        <div class="video-window">📹 连接中...</div>
        <div class="loading-dots" style="margin: 20px 0;">
          <span></span><span></span><span></span>
        </div>
        <p style="color: #ff6b6b;">❌ 网络太差，连接失败</p>
        <p style="font-size: 12px; color: #888; margin-top: 10px;">提示：19世纪的网络确实不太好</p>
      </div>`
    },
    {
      title: "📹 视频通话",
      content: () => `<div style="text-align: center;">
        <div class="video-window">📷 摄像头已关闭</div>
        <p style="margin-top: 15px; color: #888;">DasKapital 拒绝了视频通话</p>
        <p style="font-size: 12px; color: #666; margin-top: 10px;">"我不上镜" —— 马克思</p>
      </div>`
    },
    {
      title: "📹 复古滤镜",
      content: () => `<div style="text-align: center;">
        <div class="video-window" style="filter: sepia(100%) contrast(120%); background: linear-gradient(45deg, #8B4513, #CD853F);">
          🎩 19世纪直播间
        </div>
        <p style="margin-top: 15px;">欢迎来到马克思的复古直播间！</p>
        <p style="font-size: 12px; color: #888; margin-top: 5px;">今日话题：如何在AI时代保持人的价值</p>
      </div>`
    }
  ];

  // 显示彩蛋弹窗
  function showEasterEgg(title, content) {
    const modal = document.getElementById('easterEggModal');
    const titleEl = document.getElementById('easterEggTitle');
    const bodyEl = document.getElementById('easterEggBody');
    
    titleEl.textContent = title;
    bodyEl.innerHTML = content;
    modal.classList.remove('hidden');
  }

  // 关闭彩蛋弹窗
  function hideEasterEgg() {
    const modal = document.getElementById('easterEggModal');
    modal.classList.add('hidden');
  }

  // 随机触发电话彩蛋
  function triggerPhoneEasterEgg() {
    const randomEgg = phoneEasterEggs[Math.floor(Math.random() * phoneEasterEggs.length)];
    showEasterEgg(randomEgg.title, randomEgg.content());
  }

  // 随机触发视频彩蛋
  function triggerVideoEasterEgg() {
    const randomEgg = videoEasterEggs[Math.floor(Math.random() * videoEasterEggs.length)];
    showEasterEgg(randomEgg.title, randomEgg.content());
  }

  function init(){
    buildScenes();
    // auto-load if save exists
    if(loadState()){
      gotoScene(state.sceneIndex);
    } else {
      gotoScene(0);
    }
    // ensure theme reflects state on fresh load
    applyTheme();
    bindPanels(); bindPlayer();
    els.chatLog.addEventListener('click', advanceQueue);
    els.prologue.addEventListener('click', prologueAdvance);
    
    // 绑定彩蛋事件
    const phoneBtn = document.getElementById('btnPhone');
    const videoBtn = document.getElementById('btnVideo');
    const closeEasterEgg = document.getElementById('closeEasterEgg');
    const modal = document.getElementById('easterEggModal');
    
    if(phoneBtn) {
      phoneBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        triggerPhoneEasterEgg();
      });
    }
    
    if(videoBtn) {
      videoBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        triggerVideoEasterEgg();
      });
    }
    
    if(closeEasterEgg) {
      closeEasterEgg.addEventListener('click', hideEasterEgg);
    }
    
    if(modal) {
      modal.addEventListener('click', (e) => {
        if(e.target === modal) {
          hideEasterEgg();
        }
      });
    }
    
    // autosave on unload
    window.addEventListener('beforeunload', saveState);
  }
  // Reset story: clear state and restart from prologue (part1)
  function resetStory(){
    // clear choices and visits
    state.visited = { dmChenJie:false, dmZhengFang:false, dmZhangYu:false };
    state.unlocks = { dasKapital:false };
    state.choices = { chenJie:null, zhengFang:null, zhangYu:null };
    state.zf = null; state.msgQueue = []; state.msgIndex = -1; state.queueDone = null;
    state.proQueue = []; state.proIndex = -1; state.proDone = null; state.didPrologue = false; state.part1GroupPlayed = false;
    state.logs = { group: [], 'dm-chenjie': [], 'dm-zhengfang': [], 'dm-zhangyu': [], 'dm-daskapital': [] };
    state.gates = { part1ChoiceMade: false, part1SecondChoiceMade: false, p3_cj_groupIntroDone: false, p3_cj_started: false, p2_dossier_chenjie_shown: false, p2_dossier_zhengfang_shown: false, p2_dossier_zhangyu_shown: false, p3_zf_groupIntroDone: false, p3_zf_prePlayed: false, p3_zy_groupIntroDone: false };
    state.pendingNightTransition = false; state.pendingTransitionKey = null;
    // close panels
    hidePanel(els.notebook); hidePanel(els.musicPlayer); hidePanel(els.noticeBoard);
    // go to beginning
    gotoKey('part1');
  }
  // Bind reset button
  document.addEventListener('click', (e)=>{
    const t = e.target; if(!t) return;
    if(t.id === 'btnReset'){
      e.preventDefault();
      resetStory(); clearSave();
    }
    if(t.id === 'btnSave'){
      e.preventDefault(); saveState();
    }
    if(t.id === 'btnLoad'){
      e.preventDefault();
      if(loadState()){
        // Re-enter target scene using loaded state
        buildScenes(); gotoScene(state.sceneIndex);
      }
    }
  });
  document.addEventListener('DOMContentLoaded', init);
})();
