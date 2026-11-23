(() => {
  const $ = id => document.getElementById(id);
  const canvas = $("world"), ctx = canvas.getContext("2d");
  const W = 960, H = 540, levels = window.CATNAP_LEVELS;
  let socket, myId = null, roomCode = "", players = new Map(), stageNo = 1;
  let stageState = {}, me = {x:48,y:460,vx:0,vy:0,facing:1,onGround:false,color:"#ff6b6b"};
  const keys = new Set(); let lastSend = 0, raf = 0, joined = false;
  const send = data => { if (socket && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(data)); };
  function showError(message) { $("lobbyError").textContent = message || ""; }
  function connect(action, code) {
    showError("");
    socket = new WebSocket("wss://pico-park-multiplayer.onrender.com");
    socket.onopen = () => send({type:action,name:$("playerName").value.trim() || "Player",code});
    socket.onmessage = event => {
      const msg = JSON.parse(event.data);
      if (msg.type === "error") { showError(msg.message); socket.close(); return; }
      if (msg.type === "joined") {
        myId = msg.id; roomCode = msg.room; me.color = msg.color; joined = true;
        $("lobby").classList.add("hidden"); $("game").classList.remove("hidden");
        $("roomCodeHud").textContent = roomCode; $("winOverlay").classList.add("hidden");
        if (raf) cancelAnimationFrame(raf); loop();
      }
      if (msg.type === "state") {
        stageNo = msg.stage; stageState = msg;
        players = new Map(msg.players.map(p => [p.id,p]));
        const mine = players.get(myId);
        if (mine) { me.color = mine.color; }
        $("stageLabel").textContent = "STAGE " + String(msg.stage).padStart(2,"0") + " / 20";
        $("stageName").textContent = msg.stageName;
        $("missionText").textContent = msg.won ? "Campaign complete!" : msg.keyTaken ? "Key secured — activate the switches and reach the exit!" : msg.hint;
        $("playerCount").textContent = msg.players.length + "/8";
        $("switchProgress").textContent = msg.switches.filter(Boolean).length + " / " + msg.requiredSwitches + " SWITCHES";
        $("playersList").innerHTML = msg.players.map(p => '<span class="player-chip"><i style="background:'+p.color+'"></i>'+escapeHtml(p.name)+(p.id===myId?' · YOU':'')+'</span>').join("");
        const showClear = msg.stageClear;
        $("winOverlay").classList.toggle("hidden", !showClear);
        $("winTitle").textContent = msg.won ? "CAMPAIGN COMPLETE!" : "STAGE " + msg.stage + " CLEARED!";
        $("winMessage").textContent = msg.won ? "20 rooms. One incredible team." : "Everyone made it. Ready for the next room?";
        $("nextStage").classList.toggle("hidden", msg.won);
        $("restartCampaign").textContent = msg.won ? "Play campaign again" : "Restart campaign";
      }
    };
    socket.onerror = () => showError("Could not connect to the game server. Try again.");
  }
  function escapeHtml(s) { return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
  $("createBtn").onclick = () => connect("create");
  $("joinBtn").onclick = () => {
    const code = $("roomCode").value.trim().toUpperCase();
    if (code.length !== 6) return showError("Enter the 6-character room code.");
    connect("join", code);
  };
  $("roomCode").addEventListener("input",e=>e.target.value=e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,""));
  const fullscreenBtn=$("fullscreenBtn");
  function syncFullscreenLabel(){fullscreenBtn.textContent=document.fullscreenElement?"⤢ EXIT":"⛶ FULL";}
  fullscreenBtn.onclick=async()=>{
    try {
      if(!document.fullscreenElement) await $("game").requestFullscreen();
      else await document.exitFullscreen();
      if(screen.orientation?.lock && !document.fullscreenElement) screen.orientation.unlock?.();
    } catch { showError("Fullscreen isn't available in this browser. Try your browser menu."); }
    syncFullscreenLabel();
  };
  document.addEventListener("fullscreenchange",syncFullscreenLabel);
  $("copyCode").onclick = async () => {
    try { await navigator.clipboard.writeText(roomCode); $("copyCode").textContent = "COPIED"; }
    catch { $("copyCode").textContent = roomCode; }
    setTimeout(()=>$("copyCode").textContent="COPY",1200);
  };
  $("leaveBtn").onclick = () => {
    if (socket) socket.close(); if (raf) cancelAnimationFrame(raf);
    joined=false; myId=null; players.clear(); $("game").classList.add("hidden"); $("lobby").classList.remove("hidden");
  };
  $("nextStage").onclick = () => { send({type:"next"}); $("winOverlay").classList.add("hidden"); };
  $("restartCampaign").onclick = () => { send({type:"restart"}); $("winOverlay").classList.add("hidden"); };

  window.addEventListener("keydown", e => {
    if (["ArrowLeft","ArrowRight","ArrowUp"," "].includes(e.key)) e.preventDefault();
    keys.add(e.key.toLowerCase());
  });
  window.addEventListener("keyup", e => keys.delete(e.key.toLowerCase()));
  window.addEventListener("blur", () => keys.clear());
  function bindHold(id,key) {
    const b=$(id), down=e=>{e.preventDefault();keys.add(key);}, up=e=>{e.preventDefault();keys.delete(key);};
    b.addEventListener("pointerdown",down); b.addEventListener("pointerup",up);
    b.addEventListener("pointerleave",up); b.addEventListener("pointercancel",up);
  }
  bindHold("leftBtn","arrowleft"); bindHold("rightBtn","arrowright"); bindHold("jumpBtn"," ");

  function currentLevel() { return levels[Math.max(0,Math.min(19,stageNo-1))]; }
  function collideX(nx, platforms) {
    const pw=27,ph=29;
    return platforms.some(p=>me.y+ph>p.y+3 && me.y<p.y+p.h-2 && nx+pw>p.x && nx<p.x+p.w);
  }
  function collideY(ny, platforms) {
    const pw=27,ph=29;
    for (const p of platforms) if (me.x+pw>p.x+2 && me.x<p.x+p.w-2) {
      if (me.vy>=0 && me.y+ph<=p.y+9 && ny+ph>=p.y) { me.y=p.y-ph;me.vy=0;me.onGround=true;return true; }
      if (me.vy<0 && me.y>=p.y+p.h-5 && ny<=p.y+p.h) { me.y=p.y+p.h;me.vy=0;return true; }
    }
    return false;
  }
  function update(dt) {
    if (!joined || stageState.stageClear || stageState.won) return;
    const platforms=currentLevel().platforms;
    const left=keys.has("arrowleft")||keys.has("a"), right=keys.has("arrowright")||keys.has("d");
    const jump=keys.has(" ")||keys.has("arrowup")||keys.has("w");
    me.vx=left?-245:right?245:0; if(me.vx)me.facing=me.vx>0?1:-1;
    const nx=Math.max(0,Math.min(W-27,me.x+me.vx*dt)); if(!collideX(nx,platforms))me.x=nx;
    if(jump&&me.onGround){me.vy=-535;me.onGround=false;}
    me.vy=Math.min(780,me.vy+1450*dt);
    const ny=me.y+me.vy*dt; me.onGround=false; if(!collideY(ny,platforms))me.y=ny;
    if(me.y>H+80){me.x=48;me.y=460;me.vy=0;}
    const now=performance.now();
    if(now-lastSend>40){send({type:"move",x:me.x,y:me.y,facing:me.facing});lastSend=now;}
  }
  function drawPlatform(p) {
    ctx.fillStyle="#27394b";ctx.fillRect(p.x,p.y,p.w,p.h);
    ctx.fillStyle="#a9e6a1";ctx.fillRect(p.x,p.y,p.w,6);
    ctx.fillStyle="#182a39";for(let x=p.x+10;x<p.x+p.w-5;x+=22)ctx.fillRect(x,p.y+11,9,4);
  }
  function roundedRect(x,y,w,h,r) {
    r=Math.min(r,w/2,h/2);
    ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);
    ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);
    ctx.arcTo(x,y,x+w,y,r);ctx.closePath();
  }
  function drawSwitch(sw,active,index) {
    ctx.save();ctx.translate(sw.x,sw.y);
    ctx.fillStyle=active?"#9cffbd":"#42566b";ctx.shadowColor=active?"#8cffb4":"#000";ctx.shadowBlur=active?18:4;
    roundedRect(-17,-7,34,14,5);ctx.fill();
    ctx.shadowBlur=0;ctx.fillStyle=active?"#f4fff5":"#aebdca";ctx.beginPath();ctx.arc(0,-1,5,0,Math.PI*2);ctx.fill();
    ctx.fillStyle="#eaf5ff";ctx.font="bold 10px Nunito";ctx.textAlign="center";ctx.fillText("S"+(index+1),0,-17);ctx.restore();
  }
  function draw() {
    const level=currentLevel(), t=performance.now();
    const sky=ctx.createLinearGradient(0,0,0,H);sky.addColorStop(0,"#182b46");sky.addColorStop(1,"#355c69");
    ctx.fillStyle=sky;ctx.fillRect(0,0,W,H);
    ctx.fillStyle="#ffffff12";for(let i=0;i<55;i++){const x=(i*173)%W,y=(i*79)%300;ctx.fillRect(x,y,2,2);}
    ctx.fillStyle="#8ac6a0";ctx.beginPath();ctx.moveTo(0,490);ctx.quadraticCurveTo(250,440,470,490);ctx.quadraticCurveTo(720,430,960,485);ctx.lineTo(960,540);ctx.lineTo(0,540);ctx.fill();
    level.platforms.forEach(drawPlatform);
    level.switches.forEach((sw,i)=>drawSwitch(sw,!!(stageState.switches||[])[i],i));
    if(!stageState.keyTaken){
      ctx.save();ctx.translate(level.key.x,level.key.y+Math.sin(t/240)*5);ctx.rotate(-.2);
      ctx.strokeStyle="#ffd166";ctx.lineWidth=7;ctx.shadowColor="#ffd166";ctx.shadowBlur=18;
      ctx.beginPath();ctx.arc(0,-7,10,0,Math.PI*2);ctx.moveTo(0,3);ctx.lineTo(0,24);ctx.lineTo(11,24);ctx.moveTo(0,15);ctx.lineTo(8,15);ctx.stroke();ctx.restore();
    }
    const exitOpen=stageState.keyTaken&&(stageState.switches||[]).filter(Boolean).length>=stageState.requiredSwitches;
    ctx.fillStyle=exitOpen?"#f5ca68":"#9b6571";ctx.fillRect(876,390,58,110);
    ctx.fillStyle="#fff0d1";ctx.fillRect(888,405,34,95);ctx.fillStyle="#56434a";ctx.fillRect(901,444,8,8);
    ctx.fillStyle="#fff";ctx.font="bold 12px Nunito";ctx.fillText(exitOpen?"EXIT OPEN":"LOCKED",875,378);
    // Render every player from the latest server snapshot; always show our own avatar too.
    for(const p of players.values()) {
      const local=p.id===myId;
      drawCat(local?me.x:p.x,local?me.y:p.y,p.color,p.facing,local?"YOU":p.name);
    }
    // A short-lived fallback keeps the local character visible while the first state packet arrives.
    if(myId && !players.has(myId)) drawCat(me.x,me.y,me.color,me.facing,"YOU");
    ctx.fillStyle="#f4f7ff";ctx.font="bold 13px Nunito";ctx.fillText("TEAMWORK REQUIRED  •  20 ROOMS",20,28);
    ctx.fillStyle="#ffffffaa";ctx.font="11px Nunito";ctx.fillText("Collect the key  →  Hold switches  →  Everyone reaches the door",20,47);
  }
  function drawCat(x,y,color,facing,name) {
    ctx.save();ctx.translate(x+13.5,y+14.5);ctx.scale(facing||1,1);
    ctx.fillStyle="#0005";ctx.beginPath();ctx.ellipse(0,17,15,4,0,0,7);ctx.fill();
    ctx.fillStyle=color;roundedRect(-13,-10,26,25,8);ctx.fill();
    ctx.beginPath();ctx.moveTo(-10,-7);ctx.lineTo(-11,-19);ctx.lineTo(-2,-12);ctx.moveTo(10,-7);ctx.lineTo(11,-19);ctx.lineTo(2,-12);ctx.fill();
    ctx.fillStyle="#fff";ctx.beginPath();ctx.arc(-5,-1,3.2,0,7);ctx.arc(5,-1,3.2,0,7);ctx.fill();
    ctx.fillStyle="#253347";ctx.beginPath();ctx.arc(-4,-1,1.4,0,7);ctx.arc(6,-1,1.4,0,7);ctx.fill();
    ctx.fillStyle="#fff";ctx.fillRect(-8,10,7,3);ctx.fillRect(2,10,7,3);ctx.restore();
    ctx.fillStyle="#fff";ctx.font="bold 10px Nunito";ctx.textAlign="center";ctx.fillText(name,x+13,y-7);ctx.textAlign="left";
  }
  function loop(t){const dt=Math.min(.033,(t-(loop.last||t))/1000);loop.last=t;update(dt);draw();raf=requestAnimationFrame(loop);}
})();