(()=>{'use strict';
const canvas=document.querySelector('#game'),ctx=canvas.getContext('2d');const $=s=>document.querySelector(s);let W=1000,H=600,dpr=1,coins=5,lives=6,kills=0,spawned=0,total=50,towers=[],birds=[],bolts=[],bombs=[],particles=[],mode='menu',placing=false,selected=-1,aim={x:500,y:200},time=0,last=0,spawnTimer=0,fireCooldown=0,uid=0,shake=0;
const maxTowers=4,price=5,rand=(a,b)=>a+Math.random()*(b-a),clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function resize(){const r=canvas.getBoundingClientRect();W=r.width;H=r.height;dpr=Math.min(2,devicePixelRatio||1);canvas.width=Math.round(r.width*dpr);canvas.height=Math.round(r.height*dpr);ctx.setTransform(dpr,0,0,dpr,0,0)}window.addEventListener('resize',resize);resize();
function laneY(i){return H*(i===0?.81:.93)}function skyBottom(){return H*.78}function updateUI(){ $('#coins').textContent=coins;$('#lives').textContent=lives;$('#kills').textContent=kills;$('#total').textContent=total;$('#counter').textContent=`Torres: ${towers.length}/${maxTowers}`;$('#buy').classList.toggle('active',placing);$('#selection').textContent=placing?'Toque em um dos 2 corredores para construir':'';}
function show(title,body,button){mode='paused';$('#overlayTitle').textContent=title;$('#overlayText').innerHTML=body;$('#play').textContent=button;$('#overlay').classList.remove('hidden')}
function start(){coins=5;lives=6;kills=0;spawned=0;towers=[];birds=[];bolts=[];bombs=[];particles=[];time=0;spawnTimer=0;selected=-1;placing=false;fireCooldown=0;uid=0;mode='play';$('#overlay').classList.add('hidden');for(let i=0;i<5;i++)spawnBird();updateUI()}
function spawnBird(){if(spawned>=total)return;let from=Math.random()<.5?-40:W+40;let strength=1+Math.floor(spawned/10);birds.push({id:++uid,x:from,y:rand(H*.17,H*.53),vx:rand(48,75)*(from<0?1:-1)*(1+spawned*.008),vy:0,hp:3,maxHp:3,phase:rand(0,6.3),drop:rand(5.5,9.5),target:null,wing:0});spawned++}
function place(x,y){let lane=Math.abs(y-laneY(0))<Math.abs(y-laneY(1))?0:1;if(Math.abs(y-laneY(lane))>H*.09)return;if(towers.length>=maxTowers||coins<price)return;let ty=laneY(lane),tx=clamp(x,28,W-28);if(towers.some(t=>Math.hypot(t.x-tx,t.y-ty)<45))return;towers.push({x:tx,y:ty,angle:-Math.PI/2,lane,id:++uid,autoCooldown:rand(.5,1.5)});coins-=price;selected=-1;placing=false;updateUI()}
function fire(){if(mode!=='play'||selected<0||!towers[selected]||fireCooldown>0)return;const t=towers[selected],a=Math.atan2(aim.y-t.y,aim.x-t.x);if(a>-.06||a< -Math.PI+.06)return;t.angle=a;bolts.push({x:t.x+Math.cos(a)*22,y:t.y-12+Math.sin(a)*22,vx:Math.cos(a)*680,vy:Math.sin(a)*680,life:1.8});fireCooldown=.23;for(let i=0;i<5;i++)particles.push({x:t.x+Math.cos(a)*25,y:t.y-12+Math.sin(a)*25,vx:rand(-55,55),vy:rand(-55,55),life:.22,color:'#ffdf89'});}
function hit(x,y){for(let i=0;i<12;i++)particles.push({x,y,vx:rand(-100,100),vy:rand(-110,70),life:rand(.25,.6),color:Math.random()<.5?'#f8be56':'#c5e2e6'})}
function pointer(e){let r=canvas.getBoundingClientRect();return{x:(e.clientX-r.left),y:(e.clientY-r.top)}}
canvas.addEventListener('pointermove',e=>{aim=pointer(e);if(selected>=0&&towers[selected]){let t=towers[selected];t.angle=Math.atan2(aim.y-t.y,aim.x-t.x)}});
canvas.addEventListener('pointerdown',e=>{if(mode!=='play')return;e.preventDefault();let p=pointer(e);aim=p;if(placing){place(p.x,p.y);return}let idx=towers.findIndex(t=>Math.hypot(t.x-p.x,t.y-p.y)<36);if(idx>=0){selected=selected===idx?-1:idx;updateUI();return}if(p.y<skyBottom())fire()});
$('#buy').onclick=()=>{if(mode!=='play')return;placing=!placing;if(placing)selected=-1;updateUI()};$('#pause').onclick=()=>{if(mode==='play')show('PAUSADO','Continue sua defesa aérea ou volte ao mapa.','▶ CONTINUAR')};$('#play').onclick=()=>{if(mode==='paused'&&($('#overlayTitle').textContent==='PAUSADO')){mode='play';$('#overlay').classList.add('hidden')}else start()};$('#back').onclick=()=>{location.href='../mapa/index.html'};
function automaticFire(t){
 const targets=[...birds,...bombs];if(!targets.length)return;
 const visible=targets.filter(b=>b.y<t.y-40);if(!visible.length)return;
 const target=visible[Math.floor(Math.random()*visible.length)];
 // Torres automáticas disparam na direção aproximada, errando bastante.
 const spread=rand(-1.05,1.05);
 const angle=Math.atan2(target.y-(t.y-12),target.x-t.x)+spread;
 if(angle>-.06||angle< -Math.PI+.06)return;
 t.angle=angle;
 bolts.push({x:t.x+Math.cos(angle)*22,y:t.y-12+Math.sin(angle)*22,vx:Math.cos(angle)*560,vy:Math.sin(angle)*560,life:1.8});
 for(let i=0;i<3;i++)particles.push({x:t.x,y:t.y-22,vx:rand(-25,25),vy:rand(-50,10),life:.2,color:'#ffdf89'});
}
function update(dt){time+=dt;
 for(let i=0;i<towers.length;i++){
  if(i===selected)continue;
  const t=towers[i];t.autoCooldown-=dt;
  if(t.autoCooldown<=0){automaticFire(t);t.autoCooldown=rand(1.05,1.8)}
 }
fireCooldown=Math.max(0,fireCooldown-dt);spawnTimer+=dt;if(spawned<total&&spawnTimer>clamp(4.5-spawned*.035,2.1,4.5)){spawnTimer=0;spawnBird();if(spawned>25&&Math.random()<.35)spawnBird()}
for(const b of birds){b.wing+=dt*12;b.phase+=dt*1.7;b.x+=b.vx*dt;b.y+=Math.sin(b.phase)*dt*33;b.y=clamp(b.y,H*.15,H*.59);if(b.x<-55)b.x=W+45;if(b.x>W+55)b.x=-45;if(Math.random()<dt*.55)b.vx*=-1;b.drop-=dt;if(b.drop<=0){b.drop=rand(6.5,10.5);const cx=W*.5,cy=H*.69;const dx=cx-b.x,dy=cy-b.y,dist=Math.hypot(dx,dy)||1;const speed=Math.max(56,H*.115);bombs.push({x:b.x,y:b.y+16,vx:dx/dist*speed,vy:dy/dist*speed,life:12,phase:rand(0,6.28)});}}
for(let i=bolts.length-1;i>=0;i--){const a=bolts[i];a.x+=a.vx*dt;a.y+=a.vy*dt;a.life-=dt;let bomb=bombs.find(b=>Math.hypot(b.x-a.x,b.y-a.y)<17);if(bomb){bombs.splice(bombs.indexOf(bomb),1);hit(a.x,a.y);bolts.splice(i,1);continue}let target=birds.find(b=>Math.hypot(b.x-a.x,b.y-a.y)<23);if(target){target.hp--;hit(a.x,a.y);bolts.splice(i,1);if(target.hp<=0){birds.splice(birds.indexOf(target),1);kills++;if(kills%2===0)coins+=1;updateUI()}}else if(a.life<=0||a.x<0||a.x>W||a.y<0)bolts.splice(i,1)}for(let i=bombs.length-1;i>=0;i--){let b=bombs[i];b.x+=b.vx*dt;b.y+=b.vy*dt;b.phase+=dt*7;b.life-=dt;if(Math.hypot(b.x-W*.5,b.y-H*.69)<Math.max(24,H*.045)){bombs.splice(i,1);lives--;shake=.28;hit(W*.5,H*.69);updateUI();if(lives<=0){show('GAME OVER','O castelo foi destruído pelas bombas dos voadores!','↻ REINICIAR');return}}else if(b.life<=0||b.x<0||b.x>W||b.y>H)bombs.splice(i,1)}for(let i=particles.length-1;i>=0;i--){let p=particles[i];p.x+=p.vx*dt;p.y+=p.vy*dt;p.life-=dt;if(p.life<=0)particles.splice(i,1)}if(kills>=total){try{localStorage.setItem('towerDefenseUnlockedLevel',String(Math.max(11,Number(localStorage.getItem('towerDefenseUnlockedLevel')||1))))}catch{}show('QUE BELA VITÓRIA!','Você defendeu a montanha e liberou o Level 11!','↻ JOGAR NOVAMENTE')}}
function poly(points,color){ctx.fillStyle=color;ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();ctx.fill()}
function drawMountain(){
const grad=ctx.createLinearGradient(0,0,0,H);grad.addColorStop(0,'#638ea2');grad.addColorStop(.55,'#aec5c5');grad.addColorStop(1,'#dae0d6');ctx.fillStyle=grad;ctx.fillRect(0,0,W,H);
// Montanhas em camadas, neve e blocos no mesmo estilo pixelado das construções.
poly([[0,H*.52],[W*.12,H*.24],[W*.24,H*.49],[W*.39,H*.10],[W*.58,H*.49],[W*.74,H*.17],[W*.91,H*.44],[W,H*.28],[W,H*.75],[0,H*.75]],'#647e83');
poly([[W*.04,H*.43],[W*.12,H*.24],[W*.19,H*.39],[W*.13,H*.36],[W*.10,H*.40]],'#e8f0e9');
poly([[W*.27,H*.32],[W*.39,H*.10],[W*.50,H*.32],[W*.40,H*.25],[W*.36,H*.30]],'#edf3ec');
poly([[W*.65,H*.35],[W*.74,H*.17],[W*.84,H*.37],[W*.74,H*.30],[W*.71,H*.34]],'#edf2eb');
poly([[W*.89,H*.40],[W,H*.28],[W,H*.46]],'#dce9e5');
ctx.fillStyle='#8b9f99';ctx.fillRect(0,H*.64,W,H*.36);
for(let i=0;i<95;i++){let x=(i*173)%Math.max(W,1),y=H*(.65+((i*47)%33)/100);ctx.fillStyle=i%3?'#a4b6aa':'#d7e0d5';ctx.fillRect(x,y,Math.max(3,W*.007),Math.max(3,H*.008))}
for(let i=0;i<2;i++){let y=laneY(i);ctx.fillStyle='#465660';ctx.fillRect(0,y-18,W,36);ctx.fillStyle='#89999a';ctx.fillRect(0,y-13,W,26);ctx.strokeStyle='#d2d4c8';ctx.setLineDash([18,14]);ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke();ctx.setLineDash([])}
// Castelo central com torres, ameias e portão.
const cx=W*.5,cy=H*.69,sz=Math.max(36,Math.min(W*.095,H*.18));ctx.save();ctx.translate(cx,cy);ctx.fillStyle='#3b4854';ctx.fillRect(-sz*.59,-sz*.44,sz*1.18,sz*.95);ctx.fillStyle='#87979a';ctx.fillRect(-sz*.52,-sz*.55,sz*1.04,sz*.9);ctx.fillStyle='#576d7c';ctx.fillRect(-sz*.2,-sz*.77,sz*.4,sz*.48);ctx.fillStyle='#9cabb0';for(let k=-2;k<=2;k++)ctx.fillRect(k*sz*.19-sz*.075,-sz*.65,sz*.15,sz*.18);ctx.fillStyle='#596d7b';ctx.fillRect(-sz*.67,-sz*.55,sz*.23,sz*.73);ctx.fillRect(sz*.44,-sz*.55,sz*.23,sz*.73);ctx.fillStyle='#c3c7bf';ctx.fillRect(-sz*.69,-sz*.64,sz*.27,sz*.13);ctx.fillRect(sz*.42,-sz*.64,sz*.27,sz*.13);ctx.fillStyle='#4a3731';ctx.fillRect(-sz*.15,-sz*.12,sz*.3,sz*.48);ctx.fillStyle='#f3cf78';ctx.fillRect(-sz*.35,-sz*.3,sz*.11,sz*.13);ctx.fillRect(sz*.24,-sz*.3,sz*.11,sz*.13);ctx.restore();
}
function drawXBesta(c,x,y,size,angle=0,flash=0){
 const p=size/32;
 c.save();c.translate(Math.round(x),Math.round(y));c.imageSmoothingEnabled=false;
 const rect=(xx,yy,w,h,color)=>{c.fillStyle=color;c.fillRect(Math.round(xx*p),Math.round(yy*p),Math.max(1,Math.round(w*p)),Math.max(1,Math.round(h*p)))};
 // Fundação de pedra azul, como as demais construções do reino.
 rect(-14,6,28,7,'#394a61');rect(-13,4,26,7,'#637c9c');rect(-12,3,24,5,'#a6b7c9');
 rect(-11,8,5,3,'#77b9dc');rect(6,8,5,3,'#77b9dc');rect(-8,3,16,3,'#d1d8dc');
 rect(-5,-2,10,8,'#4b596d');rect(-4,-5,8,8,'#7d91a6');rect(-2,-8,4,5,'#c0cad2');
 // Gira todo o arco na direção do goblin arremessador.
 c.save();c.rotate(angle);
 rect(-12,-4,24,7,'#65432b');rect(-12,-5,24,3,'#a36b3c');
 rect(-15,-7,6,9,'#75451f');rect(9,-7,6,9,'#75451f');
 rect(-15,-8,5,3,'#d9a467');rect(10,-8,5,3,'#d9a467');
 rect(-12,0,24,2,'#e4c58c');rect(-3,-6,6,11,'#5b6576');rect(-2,-7,4,9,'#9baabb');
 // Flecha e corda visíveis mesmo em tamanho pequeno.
 rect(0,-2,16,2,'#d8e3ed');rect(13,-4,5,6,'#8fc7e5');
 rect(-13,-6,2,9,'#f0d9ac');rect(11,-6,2,9,'#f0d9ac');
 if(flash>0){rect(16,-5,6,8,'#ffe99b');rect(20,-3,5,4,'#fff8d6')}
 c.restore();c.restore();
}
function drawBow(t,i){
 // Mesmo desenho pixel-art da X-Besta do Level 9, com base de pedra e arco giratório.
 drawXBesta(ctx,t.x,t.y-13,55,t.angle,0);
 if(i===selected){ctx.strokeStyle='#ffe19a';ctx.lineWidth=2;ctx.strokeRect(t.x-25,t.y-37,50,48)}
}
function drawBowIcon(){const icon=document.querySelector('#bowIcon');if(!icon)return;const c=icon.getContext('2d');c.clearRect(0,0,52,52);drawXBesta(c,26,27,48,-Math.PI/4,0)}
function drawBird(b){ctx.save();ctx.translate(b.x,b.y+Math.sin(b.wing)*3);if(b.vx<0)ctx.scale(-1,1);let wing=Math.sin(b.wing)*9;poly([[-22,-3],[-40,-17-wing],[-19,-13],[-9,-6]],'#386a69');poly([[7,-6],[30,-22+wing],[21,3],[6,7]],'#3b827a');ctx.fillStyle='#4a9d82';ctx.fillRect(-17,-9,37,20);ctx.fillStyle='#35765e';ctx.fillRect(10,-16,17,15);ctx.fillStyle='#e6d6a2';ctx.fillRect(21,-11,4,4);ctx.fillStyle='#6d9b47';ctx.fillRect(-5,-25,15,16);ctx.fillStyle='#8cb752';ctx.fillRect(-2,-29,12,10);ctx.fillStyle='#293a24';ctx.fillRect(6,-24,3,3);ctx.fillStyle='#795c36';ctx.fillRect(-9,-12,15,5);ctx.restore();ctx.fillStyle='#273a44';ctx.fillRect(b.x-17,b.y-35,34,4);ctx.fillStyle='#e2b56c';ctx.fillRect(b.x-17,b.y-35,34*(b.hp/b.maxHp),4)}
function drawMinimap(){const m=document.getElementById('minimapCanvas');if(!m)return;const c=m.getContext('2d'),w=m.width,h=m.height;c.fillStyle='#688d9b';c.fillRect(0,0,w,h);c.fillStyle='#65756d';c.beginPath();c.moveTo(0,h*.6);c.lineTo(w*.3,h*.12);c.lineTo(w*.55,h*.62);c.lineTo(w*.8,h*.2);c.lineTo(w,h*.6);c.fill();c.fillStyle='#e7d3a2';c.fillRect(w*.48,h*.68,9,11);for(const b of birds){c.fillStyle='#d33';c.fillRect(Math.max(0,Math.min(w-3,b.x/W*w)),Math.max(0,Math.min(h-3,b.y/H*h)),3,3)}for(const t of towers){c.fillStyle='#7be3fa';c.fillRect(t.x/W*w,t.y/H*h,3,3)}}
function render(){drawMinimap();ctx.save();if(shake>0){ctx.translate(rand(-3,3),rand(-3,3));shake-=.016}drawMountain();for(let i=0;i<towers.length;i++)drawBow(towers[i],i);for(const b of birds)drawBird(b);for(const b of bombs){ctx.save();ctx.translate(b.x,b.y);ctx.rotate(b.phase);ctx.fillStyle='#2b3038';ctx.fillRect(-9,-9,18,18);ctx.fillStyle='#d18d4c';ctx.fillRect(-3,-12,6,5);ctx.fillStyle='#f4dc7a';ctx.fillRect(-2,-16,4,5);ctx.restore()}for(const a of bolts){ctx.strokeStyle='#ffe7a6';ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(a.x-a.vx*.025,a.y-a.vy*.025);ctx.stroke()}for(const p of particles){ctx.globalAlpha=clamp(p.life*2,0,1);ctx.fillStyle=p.color;ctx.fillRect(p.x,p.y,4,4)}ctx.globalAlpha=1;if(placing){ctx.fillStyle='#ffc75b44';ctx.fillRect(0,laneY(0)-22,W,44);ctx.fillRect(0,laneY(1)-22,W,44)}if(selected>=0&&towers[selected]&&mode==='play'){let t=towers[selected];ctx.strokeStyle='#f6df9c66';ctx.lineWidth=1;ctx.setLineDash([6,8]);ctx.beginPath();ctx.moveTo(t.x,t.y-10);ctx.lineTo(aim.x,aim.y);ctx.stroke();ctx.setLineDash([]);ctx.strokeStyle='#f6d98b88';ctx.beginPath();ctx.arc(aim.x,aim.y,12,0,Math.PI*2);ctx.moveTo(aim.x-18,aim.y);ctx.lineTo(aim.x+18,aim.y);ctx.moveTo(aim.x,aim.y-18);ctx.lineTo(aim.x,aim.y+18);ctx.stroke()}ctx.restore()}
function frame(now){let dt=Math.min(.035,(now-last)/1000||.016);last=now;if(mode==='play')update(dt);render();requestAnimationFrame(frame)}drawBowIcon();updateUI();requestAnimationFrame(frame);
})();
