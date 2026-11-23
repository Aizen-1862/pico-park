(() => {
  const $ = id => document.getElementById(id);
  const lobby = $("lobby"), game = $("game"), canvas = $("world"), ctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;
  let socket, myId = null, roomCode = "", players = new Map(), keyTaken = false, won = false;
  let me = { x:70, y:360, vx:0, vy:0, facing:1, onGround:false, color:"#ff6b6b" };
  const keys = new Set(), platforms = [
    {x:0,y:475,w:960,h:65},{x:160,y:390,w:155,h:18},{x:365,y:330,w:180,h:18},
    {x:610,y:390,w:145,h:18},{x:775,y:315,w:115,h:18}
  ];
  let lastSend = 0, raf;
  const send = data => { if (socket && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(data)); };
  const setError = text => $("lobbyError").textContent = text || "";
  function connect(action, code) {
    setError("");
    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    socket = new WebSocket(protocol + "//" + location.host);
    socket.onopen = () => send({type:action, name:$("playerName").value.trim() || "Player", code});
    socket.onmessage = event => {
      const msg = JSON.parse(event.data);
      if (msg.type === "error") { setError(msg.message); socket.close(); return; }
      if (msg.type === "joined") {
        myId = msg.id; roomCode = msg.room; me.color = msg.color;
        $("roomLabel").textContent = roomCode;
        lobby.classList.add("hidden"); game.classList.remove("hidden");
        $("winOverlay").classList.add("hidden");
        if (raf) cancelAnimationFrame(raf);
        loop();
      }
      if (msg.type === "state") {
        keyTaken = msg.keyTaken; won = msg.won;
        players = new Map(msg.players.map(p => [p.id,p]));
        $("playerCount").textContent = players.size;
        $("missionText").textContent = won ? "You did it together!" : keyTaken ? "Key found! Everyone to the exit!" : "Find the floating key!";
        $("winOverlay").classList.toggle("hidden", !won);
        $("playersList").innerHTML = msg.players.map(p => '<span class="player-chip"><i style="background:'+p.color+'"></i>'+escapeHtml(p.name)+(p.id===myId?' (you)':'')+'</span>').join("");
      }
    };
    socket.onclose = () => {};
    socket.onerror = () => setError("Could not connect. Please try again.");
  }
  function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
  $("createBtn").onclick = () => connect("create");
  $("joinBtn").onclick = () => {
    const code = $("roomCode").value.trim().toUpperCase();
    if (code.length !== 6) return setError("Enter the 6-character room code.");
    connect("join", code);
  };
  $("roomCode").addEventListener("input",e=>e.target.value=e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,""));
  $("copyCode").onclick = async () => {
    try { await navigator.clipboard.writeText(roomCode); $("copyCode").textContent="Copied!"; }
    catch { $("copyCode").textContent=roomCode; }
    setTimeout(()=>$("copyCode").textContent="Copy code",1400);
  };
  $("leaveBtn").onclick = () => { if(socket)socket.close(); if(raf)cancelAnimationFrame(raf); players.clear();myId=null;game.classList.add("hidden");lobby.classList.remove("hidden"); };
  $("playAgain").onclick = () => { send({type:"restart"}); $("winOverlay").classList.add("hidden"); };

  window.addEventListener("keydown",e=>{
    if(["ArrowLeft","ArrowRight","ArrowUp"," "].includes(e.key))e.preventDefault();
    keys.add(e.key.toLowerCase());
  });
  window.addEventListener("keyup",e=>keys.delete(e.key.toLowerCase()));
  function bindHold(id,key){const b=$(id);const down=e=>{e.preventDefault();keys.add(key)};const up=e=>{e.preventDefault();keys.delete(key)};b.addEventListener("pointerdown",down);b.addEventListener("pointerup",up);b.addEventListener("pointerleave",up);b.addEventListener("pointercancel",up);}
  bindHold("leftBtn","arrowleft");bindHold("rightBtn","arrowright");bindHold("jumpBtn"," ");
  function collideX(nx) {
    const pw=27,ph=29;
    for(const p of platforms) if(me.y+ph>p.y+3 && me.y<p.y+p.h-2 && nx+pw>p.x && nx<p.x+p.w) return true;
    return false;
  }
  function collideY(ny) {
    const pw=27,ph=29;
    for(const p of platforms) if(me.x+pw>p.x+2 && me.x<p.x+p.w-2) {
      if(me.vy>=0 && me.y+ph<=p.y+8 && ny+ph>=p.y) {me.y=p.y-ph;me.vy=0;me.onGround=true;return true;}
      if(me.vy<0 && me.y>=p.y+p.h-5 && ny<=p.y+p.h) {me.y=p.y+p.h;me.vy=0;return true;}
    }
    return false;
  }
  function update(dt) {
    if(!myId||won)return;
    const left=keys.has("arrowleft")||keys.has("a"),right=keys.has("arrowright")||keys.has("d"),jump=keys.has(" ")||keys.has("arrowup")||keys.has("w");
    me.vx=left?-230:right?230:0;if(me.vx)me.facing=me.vx>0?1:-1;
    const nx=Math.max(0,Math.min(W-27,me.x+me.vx*dt));if(!collideX(nx))me.x=nx;
    if(jump&&me.onGround){me.vy=-510;me.onGround=false;}
    me.vy=Math.min(760,me.vy+1300*dt);
    const ny=me.y+me.vy*dt;me.onGround=false;
    if(!collideY(ny))me.y=ny;
    if(me.y>H+80){me.x=70;me.y=360;me.vy=0;}
    const now=performance.now();
    if(now-lastSend>45){send({type:"move",x:me.x,y:me.y,facing:me.facing});lastSend=now;}
  }
  function draw() {
    const g=ctx.createLinearGradient(0,0,0,H);g.addColorStop(0,"#8bd4e8");g.addColorStop(1,"#d6f1d9");ctx.fillStyle=g;ctx.fillRect(0,0,W,H);
    // Soft clouds and distant hills
    ctx.fillStyle="#ffffff66";for(let i=0;i<5;i++){const x=(i*230+80)%W;ctx.beginPath();ctx.arc(x,85+(i%2)*32,25,0,7);ctx.arc(x+25,78+(i%2)*32,31,0,7);ctx.arc(x+55,88+(i%2)*32,22,0,7);ctx.fill();}
    ctx.fillStyle="#75c9a5";ctx.beginPath();ctx.moveTo(0,455);ctx.quadraticCurveTo(160,355,330,455);ctx.quadraticCurveTo(520,365,700,455);ctx.quadraticCurveTo(830,385,960,440);ctx.lineTo(960,540);ctx.lineTo(0,540);ctx.fill();
    // Platforms
    for(const p of platforms){ctx.fillStyle="#557d64";ctx.fillRect(p.x,p.y,p.w,p.h);ctx.fillStyle="#a5e6a1";ctx.fillRect(p.x,p.y,p.w,7);ctx.fillStyle="#3d604f";for(let x=p.x+10;x<p.x+p.w-5;x+=24)ctx.fillRect(x,p.y+12,9,4);}
    // Key and locked exit
    if(!keyTaken){ctx.save();ctx.translate(490,340+Math.sin(performance.now()/260)*5);ctx.rotate(-.25);ctx.strokeStyle="#ffbf35";ctx.lineWidth=8;ctx.beginPath();ctx.arc(0,-8,12,0,Math.PI*2);ctx.moveTo(0,4);ctx.lineTo(0,27);ctx.lineTo(13,27);ctx.moveTo(0,17);ctx.lineTo(9,17);ctx.stroke();ctx.restore();}
    ctx.fillStyle=keyTaken?"#f6c85f":"#b85d66";ctx.fillRect(875,365,55,110);ctx.fillStyle="#fff1d1";ctx.fillRect(887,385,31,90);ctx.fillStyle="#6b4a43";ctx.fillRect(898,416,9,9);
    ctx.fillStyle="#fff";ctx.font="bold 12px Nunito";ctx.fillText(keyTaken?"EXIT OPEN":"LOCKED",872,350);
    // Other players
    for(const p of players.values()) if(p.id!==myId) drawCat(p.x,p.y,p.color,p.facing,p.name);
    if(myId)drawCat(me.x,me.y,me.color,me.facing,"YOU");
    // Progress hint
    ctx.fillStyle="#244657aa";ctx.font="bold 13px Nunito";ctx.fillText("TEAM UP  •  SHARE THE KEY  •  REACH THE DOOR",18,27);
  }
  function drawCat(x,y,color,facing,name){
    ctx.save();ctx.translate(x+13.5,y+14.5);ctx.scale(facing,1);
    ctx.fillStyle="#0002";ctx.beginPath();ctx.ellipse(0,17,15,4,0,0,7);ctx.fill();
    ctx.fillStyle=color;ctx.beginPath();ctx.roundRect(-13,-10,26,25,8);ctx.fill();
    ctx.beginPath();ctx.moveTo(-10,-7);ctx.lineTo(-11,-19);ctx.lineTo(-2,-12);ctx.moveTo(10,-7);ctx.lineTo(11,-19);ctx.lineTo(2,-12);ctx.fill();
    ctx.fillStyle="#fff";ctx.beginPath();ctx.arc(-5,-1,3.2,0,7);ctx.arc(5,-1,3.2,0,7);ctx.fill();
    ctx.fillStyle="#253347";ctx.beginPath();ctx.arc(-4,-1,1.4,0,7);ctx.arc(6,-1,1.4,0,7);ctx.fill();
    ctx.fillStyle="#fff";ctx.fillRect(-8,10,7,3);ctx.fillRect(2,10,7,3);
    ctx.restore();
    ctx.fillStyle="#28485a";ctx.font="bold 10px Nunito";ctx.textAlign="center";ctx.fillText(name, x+13,y-7);ctx.textAlign="left";
  }
  function loop(t){const dt=Math.min(.033,(t-(loop.last||t))/1000);loop.last=t;update(dt);draw();raf=requestAnimationFrame(loop);}
})();