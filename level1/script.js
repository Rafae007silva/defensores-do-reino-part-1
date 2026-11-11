// Altere o endereço abaixo para o site da sua tela inicial.
const PAGINA_MAPA = "../mapa/index.html";

/* ==============================================================
   CONFIGURAÇÕES DO JOGO — EDITE AQUI!
   ==============================================================
   speed: velocidade em QUADRADOS POR SEGUNDO (maior = mais rápido)
   hp: vida dos goblins em pontos. Cada tiro tira o 'damage' do defensor.
   spawnGroups: quantidade de goblins por grupo e intervalo entre grupos.
   range: alcance dos defensores em quadrados.
   fireInterval: intervalo em segundos entre os disparos (menor = mais rápido).
*/
const CONFIG = {
  columns: 28, rows: 12, totalGoblins: 200, maxGoblinsOnMap: 50, startingCoins: 5,
  maxLeaks: 4, spawnInterval: 1.55,
  // Quantos goblins saem juntos e a pausa entre os grupos (segundos).
  // 1–80: de 2 em 2; 81–120: de 3 em 3; 121–200: de 3 em 3,
  // com intervalos cada vez menores conforme eles ficam mais rápidos.
  spawnGroups: [
    { until: 80, count: 2, interval: 1.35 },
    { until: 120, count: 3, interval: 0.95 },
    { until: 200, count: 3, interval: 0.60 }
  ],
  // No começo eles ficam afastados; conforme evoluem, se aproximam.
  groupSpacingStart: 3.4, // distância inicial em quadrados
  groupSpacingMin: 0.28,  // menor distância entre goblins
  spacingDecay: 0.90,    // aproximação suave após os primeiros 60 goblins
  intervalDecay: 0.97,   // reduz gradualmente a pausa após os primeiros 60 goblins
  spacingStartsAfter: 60, // só começam a se juntar após o goblin 60

  goblin: {
    baseHp: 20, baseSpeed: 0.85,
    // A cada aumento de velocidade (30 goblins), a vida aumenta em 1 tiro de Arqueiro.
    // Velocidade: 1–30 normal, 31–60 +12%, 61–90 +25% etc.
    goblinsPerLevel: 30, // vida acompanha o aumento de velocidade
    goblinsPerSpeedLevel: 30, // velocidade: +12% a cada 30 (demora mais para acelerar)
    speedMultiplier: 1.12, // +12% de velocidade por nível (cumulativo)
    extraHpPerLevel: 4     // +4 HP = 1 tiro extra do Arqueiro a cada aceleração

  },
  towerLimits: [6, 5, 5, 4],
  defenders: [
    { name:'Torre Arqueira I', emoji:'🏹', cost:2, damage:4, range:3, fireInterval:0.85, bulletColor:'#ffe47b' },
    { name:'Torre Arqueira II', emoji:'🧙', cost:4, damage:5, range:3, fireInterval:0.8, bulletColor:'#8dd6ff' },
    { name:'Torre Arqueira III', emoji:'⚔️', cost:6, damage:7, range:3, fireInterval:0.75, bulletColor:'#c7c4ff' },
    { name:'Torre Arqueira IV', emoji:'🐉', cost:10, damage:10, range:3, fireInterval:0.7, bulletColor:'#ff8453' }
  ]
};
// Com 20 HP iniciais, os defensores precisam de 5, 4, 3 e 2 tiros.
// A cada aceleração, +4 HP equivalem a +1 tiro do Arqueiro (dano 4).

const canvas=document.getElementById('board'),ctx=canvas.getContext('2d');
const arena=document.querySelector('.arena'),shop=document.getElementById('shop');
const coinsEl=document.getElementById('coins'),waveEl=document.getElementById('wave'),livesEl=document.getElementById('lives');
const overlay=document.getElementById('overlay'),modalTitle=document.getElementById('modalTitle'),modalText=document.getElementById('modalText'),modalIcon=document.getElementById('modalIcon');
const toastEl=document.getElementById('toast');
const C=CONFIG.columns,R=CONFIG.rows;
// MINIMAPA: ajuste estas opções para personalizar cores e tamanho lógico.
const MINIMAP = { cell: 10, grass: '#477c45', road: '#b9986e', goblin: '#ff5353', tower: '#6cc7ff', viewport: '#fff1a0' };
const miniCanvas=document.getElementById('minimapCanvas'),miniCtx=miniCanvas.getContext('2d');
miniCanvas.width=C*MINIMAP.cell;miniCanvas.height=R*MINIMAP.cell;

// Caminho em curvas, de cima até a casa na parte inferior.
// 9 curvas: caminho em zigue-zague da esquerda para a direita.
// Modifique os pares [coluna, linha] para redesenhar a estrada.
const corners=[[-1,2],[3,2],[3,9],[7,9],[7,2],[11,2],[11,9],[15,9],[15,2],[19,2],[19,9],[23,9],[23,5],[28,5]];
const path=[];
for(let i=0;i<corners.length-1;i++){
  const [ax,ay]=corners[i],[bx,by]=corners[i+1];
  const n=Math.max(Math.abs(bx-ax),Math.abs(by-ay));
  for(let j=0;j<n;j++)path.push([ax+(bx-ax)*j/n,ay+(by-ay)*j/n]);
}path.push(corners.at(-1));
const pathCells=new Set(path.filter(([x,y])=>x>=0&&x<C&&y>=0&&y<R).map(([x,y])=>`${x},${y}`));
// Casinhas decorativas nos espaços marcados em preto: entre as estradas
// e nas bordas da floresta. Cada casinha ocupa uma célula bloqueada.
const villageHouses=[
 [5,3],[5,5],[5,7],       // primeiro corredor
 [9,4],[9,6],[9,8],       // segundo corredor
 [13,3],[13,5],[13,7],    // terceiro corredor
 [17,4],[17,6],[17,8],    // quarto corredor
 [12,0],[15,0],[25,0],    // borda superior
 [1,11],[9,11],[12,11],[14,11],[17,11], // borda inferior
 [25,1],[26,2]            // canto direito
];
const houseCells=new Set(villageHouses.filter(([x,y])=>x>=0&&x<C&&y>=0&&y<R&&!pathCells.has(`${x},${y}`)).map(([x,y])=>`${x},${y}`));
function isVillageHouse(x,y){return houseCells.has(`${x},${y}`)}

let forestLayer=null,forestTile=0,pixelForestLayer=null;
let tile=48,dpr=1,selected=0,coins=5,leaks=0,spawned=0,killed=0,spawnTimer=0,active=false,finished=false,paused=false,lastTime=0;
const pauseButton=document.getElementById("pauseButton");
const pauseOverlay=document.getElementById("pauseOverlay");
function syncPauseButton(){pauseOverlay.hidden=!active||finished||!paused;pauseButton.hidden=!active||finished;pauseButton.textContent=paused?"▶ CONTINUAR":"⏸ PAUSAR";pauseButton.setAttribute("aria-label",paused?"Continuar jogo":"Pausar jogo");pauseButton.setAttribute("aria-pressed",String(paused));}
pauseButton.addEventListener("click",()=>{if(!active||finished)return;paused=!paused;if(paused)backgroundMusic.pause();else if(musicURL)backgroundMusic.play().catch(()=>{});syncPauseButton();});
let goblins=[],towers=[],bullets=[],particles=[],grass=[],toastTimer;
let bossPhase="normal",bossWait=0,bossSpawned=0,bossKilled=0;
// Defensor selecionado para mostrar o botão vermelho de remoção.
let selectedTower=null;
const random=(a,b)=>a+Math.random()*(b-a);
for(let i=0;i<110;i++)grass.push({x:Math.random()*C,y:Math.random()*R,s:random(.04,.14),a:random(.15,.4)});
let lastCanvasWidth=0,lastCanvasHeight=0;

function resize(){const rect=arena.getBoundingClientRect();
  // No celular, mantenha o mapa grande e permita arrastar horizontalmente.
  // No notebook, encaixe o mapa na área disponível quando possível.
  tile=Math.max(1,rect.width/C,rect.height/R);
  const w=C*tile,h=R*tile;dpr=Math.min(devicePixelRatio||1,1.5);
  const physicalW=Math.round(w*dpr),physicalH=Math.round(h*dpr);
  if(physicalW===lastCanvasWidth&&physicalH===lastCanvasHeight)return;
  lastCanvasWidth=physicalW;lastCanvasHeight=physicalH;
  canvas.style.width=`${w}px`;canvas.style.height=`${h}px`;canvas.style.marginTop=`0px`;canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);forestLayer=null;pixelForestLayer=null;spriteCache.clear();houseCache.clear()}
// Inicialização adiada até os caches e os sprites estarem definidos.
// Evita erro de inicialização que impedia a versão anterior de abrir.

function shopRender(){shop.innerHTML='';CONFIG.defenders.forEach((u,i)=>{const b=document.createElement('button');const placed=towers.filter(t=>t.type===i).length;const limit=CONFIG.towerLimits[i];b.className=`unit ${selected===i?'selected':''} ${coins<u.cost?'unaffordable':''} ${placed>=limit?'limit-reached':''}`;b.setAttribute('aria-disabled',placed>=limit?'true':'false');b.innerHTML=`${placed>=limit?'<span class="limit-x" aria-label="Limite atingido">✕</span>':''}<span class="emoji"><canvas class="house-preview" width="48" height="48" data-house="${i}"></canvas></span><span class="name">${u.name}${Number.isFinite(limit)?` (${placed}/${limit})`:''}</span><span class="price" aria-label="Custa ${u.cost} moedas">🪙${u.cost}</span>`;b.onclick=()=>{if(placed>=limit){showToast(`Limite de ${limit} torres atingido!`);return;}selected=i;shopRender();showToast(`${u.name} selecionado`)};shop.appendChild(b);drawShopHouse(b.querySelector('canvas'),i)})}
function hud(){coinsEl.textContent=`🪙 ${coins}`;waveEl.textContent=bossPhase==="normal"?`👹 ${spawned}/${CONFIG.totalGoblins}`:bossPhase==="waiting"?`⏳ CHEFES EM ${Math.ceil(bossWait)}s`:`👑 ${bossKilled}/${CONFIG.bosses.count} CHEFES`;livesEl.textContent=`❤️ ${Math.max(0,CONFIG.maxLeaks-leaks)}/${CONFIG.maxLeaks}`;shopRender()}
function showToast(s){toastEl.textContent=s;toastEl.classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>toastEl.classList.remove('visible'),1300)}
// Áudios personalizados: arquivos locais, sem envio a servidores.
// Coloque seus arquivos de áudio na pasta "audio" ao lado de index.html.
// Para trocar a música ou o efeito de morte, substitua os arquivos ou edite os nomes abaixo.
const AUDIO_FILES = {
  music: 'audio/musica.mp3',
  death: 'audio/morte-goblin.mp3',
  towers: ['audio/torre-1.mp3', 'audio/torre-2.mp3', 'audio/torre-3.mp3', 'audio/torre-4.mp3']
};
const backgroundMusic = new Audio(AUDIO_FILES.music);
backgroundMusic.loop = true;
backgroundMusic.volume = .24;
let musicURL = AUDIO_FILES.music, deathURL = AUDIO_FILES.death, audioCtx = null, lastDeathSound = 0;
function contextAudio(){try{audioCtx??=new (window.AudioContext||window.webkitAudioContext)();if(audioCtx.state==='suspended')audioCtx.resume();return audioCtx}catch{return null}}
function note(frequency,when,duration,volume=.12,type='triangle'){const a=contextAudio();if(!a)return;const osc=a.createOscillator(),gain=a.createGain();osc.type=type;osc.frequency.setValueAtTime(frequency,when);gain.gain.setValueAtTime(.0001,when);gain.gain.exponentialRampToValueAtTime(Math.max(.0002,volume),when+.025);gain.gain.exponentialRampToValueAtTime(.0001,when+duration);osc.connect(gain).connect(a.destination);osc.start(when);osc.stop(when+duration+.01)}
// Efeito curto de construção: toca somente após posicionar uma torre com sucesso.
function towerPlacementSound(){
  const a=contextAudio(); if(!a)return;
  const t=a.currentTime+.005;
  note(440,t,.085,.095,'triangle');
  note(659.25,t+.065,.12,.085,'triangle');
}
function trumpet(){const a=contextAudio();if(!a)return;const t=a.currentTime+.03;[392,523.25,659.25,783.99].forEach((f,i)=>{note(f,t+i*.22,.33,.13,'sawtooth');note(f*2,t+i*.22,.28,.025,'triangle')})}
function lossSound(){const a=contextAudio();if(!a)return;const t=a.currentTime+.02;[392,349.23,293.66,220,164.81].forEach((f,i)=>note(f,t+i*.12,.24,.12,'sine'))}
function applause(){const a=contextAudio();if(!a)return;const t=a.currentTime;for(let i=0;i<32;i++){const len=.035,buffer=a.createBuffer(1,Math.ceil(a.sampleRate*len),a.sampleRate),data=buffer.getChannelData(0);for(let j=0;j<data.length;j++)data[j]=(Math.random()*2-1)*(1-j/data.length);const source=a.createBufferSource(),gain=a.createGain();source.buffer=buffer;gain.gain.value=.10;source.connect(gain).connect(a.destination);source.start(t+i*.047+Math.random()*.018)}}
const deathSoundPool=Array.from({length:3},()=>{const a=new Audio(AUDIO_FILES.death);a.preload='auto';a.volume=.45;return a});
let deathSoundIndex=0;
function goblinDeathSound(){if(!deathURL)return;const now=performance.now();if(now-lastDeathSound<110)return;lastDeathSound=now;const snd=deathSoundPool[deathSoundIndex++%deathSoundPool.length];try{snd.pause();snd.currentTime=0;snd.play().catch(()=>{})}catch(_){}}
// Cada torre usa seu próprio arquivo. Várias instâncias podem disparar ao mesmo tempo.
// Limite de vozes simultâneas evita excesso de volume e travamentos em ondas grandes.
const towerSoundPools = AUDIO_FILES.towers.map(file => Array.from({length: 4}, () => {
  const audio = new Audio(file);
  audio.preload = 'auto';
  audio.volume = 0.38;
  return audio;
}));
const towerSoundIndex = [0, 0, 0, 0];
function towerShootSound(type){
  const pool = towerSoundPools[type];
  if (!pool) return;
  const index = towerSoundIndex[type];
  const audio = pool[index];
  towerSoundIndex[type] = (index + 1) % pool.length;
  try { audio.pause(); audio.currentTime = 0; audio.play().catch(() => {}); } catch (_) {}
}
function stopTowerSounds(){
  for (const pool of towerSoundPools) for (const audio of pool) {
    audio.pause(); audio.currentTime = 0;
  }
}
function stopMusic(){backgroundMusic.pause();backgroundMusic.currentTime=0}
function start(){contextAudio();trumpet();stopMusic();stopTowerSounds();if(musicURL)backgroundMusic.play().catch(()=>{});document.getElementById('towerTip').hidden=true;document.getElementById('home').hidden=false;document.getElementById('start').textContent='▶ COMEÇAR JOGO';selectedTower=null;coins=CONFIG.startingCoins;leaks=0;spawned=0;killed=0;spawnTimer=0;bossPhase="normal";bossWait=0;bossSpawned=0;bossKilled=0;goblins=[];towers=[];bullets=[];particles=[];selected=0;active=true;finished=false;paused=false;overlay.classList.add('hidden');syncPauseButton();hud()}
function end(win){stopMusic();stopTowerSounds();if(win)applause();else lossSound();document.getElementById('towerTip').hidden=true;active=false;finished=true;paused=false;syncPauseButton();modalIcon.textContent=win?'🏆':'💀';modalTitle.textContent=win?'QUE BELA VITÓRIA!':'GAME OVER';modalText.textContent=win?`Você venceu os 200 goblins! ${CONFIG.maxLeaks-leaks} vidas restantes.`:`Os goblins chegaram ao castelo. Você derrotou ${killed} inimigos. Tente outra estratégia!`;document.getElementById('start').textContent='↻ REINICIAR';document.getElementById('home').hidden=false;overlay.classList.remove('hidden')}
document.getElementById('start').addEventListener('click',start);
function voltarParaMapa(){
  // Prioriza o mapa configurado, com retorno ao histórico somente quando necessário.
  if(PAGINA_MAPA){window.location.assign(PAGINA_MAPA);return;}
  if(window.history.length>1){window.history.back();return;}
  window.location.assign('../mapa/index.html');
}
document.getElementById('home').addEventListener('click',voltarParaMapa);
document.getElementById('continueButton').addEventListener('click',()=>{if(!active||finished)return;paused=false;if(musicURL)backgroundMusic.play().catch(()=>{});syncPauseButton();});
document.getElementById('giveUpButton').addEventListener('click',()=>{paused=false;active=false;finished=true;stopMusic();stopTowerSounds();syncPauseButton();voltarParaMapa();});
function statsFor(index){
  const g=CONFIG.goblin;
  const level=Math.floor((index-1)/g.goblinsPerLevel);
  const speedLevel=Math.floor((index-1)/g.goblinsPerSpeedLevel);
  return {
    hp:g.baseHp+level*g.extraHpPerLevel,
    speed:g.baseSpeed*Math.pow(g.speedMultiplier,speedLevel)
  };
}
function spawnGroup(){
  const rule=CONFIG.spawnGroups.find(r=>spawned<r.until) || CONFIG.spawnGroups.at(-1);
  const slots=Math.max(0,CONFIG.maxGoblinsOnMap-goblins.filter(g=>!g.dead&&!g.boss).length);
  if(slots===0)return 0.25;
  const count=Math.min(rule.count,rule.until-spawned,CONFIG.totalGoblins-spawned,slots);
  const level=Math.max(0,Math.floor((spawned-CONFIG.spacingStartsAfter)/CONFIG.goblin.goblinsPerSpeedLevel));
  const spacing=Math.max(CONFIG.groupSpacingMin,CONFIG.groupSpacingStart*Math.pow(CONFIG.spacingDecay,level));
  for(let i=0;i<count;i++){
    spawned++;
    const s=statsFor(spawned);
    // Espaçamento pequeno para não ficarem desenhados exatamente um sobre o outro.
    goblins.push({pos:-i*spacing,hp:s.hp,maxHp:s.hp,speed:s.speed,wiggle:Math.random()*6.28});
  }
  hud();
  return Math.max(0.18,rule.interval*Math.pow(CONFIG.intervalDecay,level));
}
function posAt(progress){const a=Math.floor(progress),f=progress-a,p=path[Math.min(a,path.length-1)],q=path[Math.min(a+1,path.length-1)];return {x:p[0]+(q[0]-p[0])*f+.5,y:p[1]+(q[1]-p[1])*f+.5}}
function burst(x,y,color,n=7){n=Math.min(n,Math.max(0,130-particles.length));for(let i=0;i<n;i++)particles.push({x,y,vx:random(-2,2),vy:random(-2,2),life:random(.2,.6),max:.6,color})}
function update(dt){if(!active||paused)return;
  spawnTimer-=dt;
  if(spawned<CONFIG.totalGoblins&&spawnTimer<=0){
    spawnTimer=spawnGroup();
  }
  for(const g of goblins){g.pos+=g.speed*dt;if(g.pos>=path.length-1){g.dead=true;leaks++;burst(27.5,5.5,'#ff6e65',12);if(g.boss||leaks>=CONFIG.maxLeaks){hud();end(false);return}hud()}}
  goblins=goblins.filter(g=>!g.dead);
  for(const t of towers){t.cool-=dt;if(t.cool>0)continue;const u=CONFIG.defenders[t.type];let target=null,best=-1;for(const g of goblins){if(g.pos<0)continue;const p=posAt(g.pos),dist=Math.hypot(p.x-(t.x+.5),p.y-(t.y+.5));if(dist<=u.range&&g.pos>best){best=g.pos;target=g}}if(target){t.cool=u.fireInterval;towerShootSound(t.type);bullets.push({x:t.x+.5,y:t.y+.5,target,damage:u.damage,color:u.bulletColor,speed:13})}}
  for(const b of bullets){if(b.dead)continue;if(b.target.dead){b.dead=true;continue}const p=posAt(b.target.pos),dx=p.x-b.x,dy=p.y-b.y,d=Math.hypot(dx,dy),step=b.speed*dt;if(d<step+.18){b.dead=true;b.target.hp-=b.target.boss?1:b.damage;burst(p.x,p.y,b.color,3);if(b.target.hp<=0&&!b.target.dead){goblinDeathSound();b.target.dead=true;if(b.target.boss){bossKilled++;}else{ killed++;if(killed%2===0)coins++; }burst(p.x,p.y,'#b7e06e',10);hud()}}else{b.x+=dx/d*step;b.y+=dy/d*step}}
  bullets=bullets.filter(b=>!b.dead);goblins=goblins.filter(g=>!g.dead);
  for(const p of particles){p.x+=p.vx*dt;p.y+=p.vy*dt;p.life-=dt}particles=particles.filter(p=>p.life>0);
  if(spawned===CONFIG.totalGoblins&&goblins.length===0)end(true)
}
function drawMinimap(){
  const m=MINIMAP.cell, mc=miniCtx;
  mc.clearRect(0,0,miniCanvas.width,miniCanvas.height);
  mc.fillStyle=MINIMAP.grass;mc.fillRect(0,0,C*m,R*m);
  mc.fillStyle=MINIMAP.road;
  for(const [x,y] of path){if(x>=0&&x<C&&y>=0&&y<R)mc.fillRect(x*m,y*m,m,m)}
  mc.fillStyle='#272e39';mc.fillRect(0,1.6*m,m,.8*m);
  mc.fillStyle='#f8df8c';mc.fillRect((C-1)*m,5*m,m,m);
  mc.fillStyle=MINIMAP.tower;
  for(const t of towers){mc.beginPath();mc.arc((t.x+.5)*m,(t.y+.5)*m,Math.max(2,m*.27),0,Math.PI*2);mc.fill()}
  // Pontos vermelhos se movem junto com cada goblin em tempo real.
  mc.fillStyle=MINIMAP.goblin;mc.shadowColor='#ff2020';mc.shadowBlur=3;
  for(const g of goblins){if(g.pos<0)continue;const p=posAt(g.pos);if(p.x<0||p.x>C||p.y<0||p.y>R)continue;mc.beginPath();mc.arc(p.x*m,p.y*m,Math.max(2,m*(g.boss?.52:.33)),0,Math.PI*2);mc.fill()}
  mc.shadowBlur=0;
  // Retângulo indica qual parte do mapa está aparecendo na tela.
  const x=Math.max(0,arena.scrollLeft/tile*m),y=Math.max(0,arena.scrollTop/tile*m);
  const w=Math.min(C*m,arena.clientWidth/tile*m),h=Math.min(R*m,arena.clientHeight/tile*m);
  mc.strokeStyle=MINIMAP.viewport;mc.lineWidth=2;mc.strokeRect(x+1,y+1,Math.max(0,w-2),Math.max(0,h-2));
  mc.fillStyle='#fff1a018';mc.fillRect(x,y,w,h);
}
// Toque no minimapa para ir direto à região desejada, sem comprar defensores.
function miniNavigate(e){
  const r=miniCanvas.getBoundingClientRect();
  const x=(e.clientX-r.left)/r.width*C*tile;
  const y=(e.clientY-r.top)/r.height*R*tile;
  arena.scrollLeft=Math.max(0,x-arena.clientWidth/2);
  arena.scrollTop=Math.max(0,y-arena.clientHeight/2);
}
miniCanvas.addEventListener('pointerdown',e=>{miniCanvas.setPointerCapture(e.pointerId);miniNavigate(e)});
miniCanvas.addEventListener('pointermove',e=>{if(e.buttons)miniNavigate(e)});
function roundRect(x,y,w,h,r,fill){ctx.fillStyle=fill;ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fill()}

// FLORESTA 2.5D: terreno orgânico e estrada de terra, sem quadrados visíveis.
// A grade continua existindo apenas para posicionamento e alcance dos defensores.
const FOREST={roadWidth:.78,treeDensity:380,shrubDensity:900,seed:29471};
function seeded(seed){return ()=>{seed=(Math.imul(1664525,seed)+1013904223)|0;return (seed>>>0)/4294967296}}
function forestBackground(){
 if(forestLayer&&forestTile===tile)return forestLayer;
 forestTile=tile;const w=C*tile,h=R*tile;
 const layer=document.createElement('canvas');layer.width=Math.ceil(w);layer.height=Math.ceil(h);
 const c=layer.getContext('2d');const rand=seeded(FOREST.seed);
 const base=c.createLinearGradient(0,0,w,h);base.addColorStop(0,'#618d53');base.addColorStop(.5,'#3d7040');base.addColorStop(1,'#244c31');c.fillStyle=base;c.fillRect(0,0,w,h);
 // Manchas de vegetação, musgo, folhas e sombras naturais.
 for(let i=0;i<3200;i++){
   const x=rand()*w,y=rand()*h,r=(.05+rand()*.45)*tile;
   c.fillStyle=['#69945c','#8aab67','#345e38','#a0b779','#527b47'][Math.floor(rand()*5)];c.globalAlpha=.09+rand()*.19;
   c.beginPath();c.ellipse(x,y,r,r*(.3+rand()*.5),rand()*6.28,0,Math.PI*2);c.fill();
 }c.globalAlpha=1;
 // Estrada contínua com curvas suaves, sem tiles nem linhas de grade.
 const pts=path.map(([x,y])=>({x:(x+.5)*tile,y:(y+.5)*tile}));
 function roadPath(){c.beginPath();c.moveTo(pts[0].x,pts[0].y);for(let i=1;i<pts.length;i++)c.lineTo(pts[i].x,pts[i].y)}
 c.lineCap='round';c.lineJoin='round';
 for(const [width,color] of [[1.13,'#4b422e'],[1.03,'#746044'],[.94,'#937550'],[.83,'#b38d5f'],[.70,'#c9a778']]){
   roadPath();c.lineWidth=tile*FOREST.roadWidth*width;c.strokeStyle=color;c.stroke();
 }
 // Sulcos de carroça e pequenos cascalhos na terra.
 c.save();c.globalAlpha=.20;
 for(const off of [-.16,.16]){c.beginPath();c.moveTo(pts[0].x,pts[0].y+off*tile);for(let i=1;i<pts.length;i++){
 const prev=pts[Math.max(0,i-1)],next=pts[Math.min(pts.length-1,i+1)];const dx=next.x-prev.x,dy=next.y-prev.y,l=Math.hypot(dx,dy)||1;
 c.lineTo(pts[i].x-dy/l*off*tile,pts[i].y+dx/l*off*tile);
 }c.lineWidth=tile*.045;c.strokeStyle='#806344';c.stroke()}c.restore();
 // Evita árvores sobre o caminho e mantém espaço para colocar defensores.
 function nearRoad(x,y){let best=1e10;for(let i=1;i<pts.length;i++){
 const a=pts[i-1],b=pts[i],dx=b.x-a.x,dy=b.y-a.y;
 const q=Math.max(0,Math.min(1,((x-a.x)*dx+(y-a.y)*dy)/(dx*dx+dy*dy||1)));
 const d=(x-a.x-q*dx)**2+(y-a.y-q*dy)**2;if(d<best)best=d;
 }return Math.sqrt(best)<tile*.61}
 for(let i=0;i<FOREST.shrubDensity;i++){
  const x=rand()*w,y=rand()*h;if(nearRoad(x,y))continue;
  const r=(.04+rand()*.15)*tile;c.fillStyle=rand()<.5?'#2d6338':'#92ba72';c.globalAlpha=.22+rand()*.32;
  c.beginPath();c.ellipse(x,y,r*1.6,r*.65,rand()*6.28,0,Math.PI*2);c.fill();
 }c.globalAlpha=1;
 const trees=[];for(let i=0;i<FOREST.treeDensity;i++){
  const x=rand()*w,y=rand()*h;if(nearRoad(x,y))continue;
  trees.push({x,y,r:(.16+rand()*.30)*tile,hue:rand(),height:(.18+rand()*.2)*tile});
 }trees.sort((a,b)=>a.y-b.y);
 for(const t of trees){
  const {x,y,r,height}=t;
  c.fillStyle='rgba(15,18,23,.42)';c.beginPath();c.ellipse(x+r*.35,y+r*.45,r*1.25,r*.47,-.2,0,Math.PI*2);c.fill();
  c.strokeStyle='#69523a';c.lineWidth=Math.max(2,r*.22);c.beginPath();c.moveTo(x,y);c.lineTo(x-r*.08,y-height);c.stroke();
  const green=t.hue<.3?'#315f37':t.hue<.65?'#407d45':'#538f4c';
  for(const [dx,dy,rr,col] of [[-.42,-.13,.72,'#254c30'],[.38,-.16,.68,green],[0,-.48,.8,green],[-.25,-.67,.43,'#7caf66']]){
   c.fillStyle=col;c.beginPath();c.arc(x+dx*r,y-height+dy*r,r*rr,0,Math.PI*2);c.fill();
  }
  c.fillStyle='rgba(215,255,186,.17)';c.beginPath();c.arc(x-r*.24,y-height-r*.56,r*.3,0,Math.PI*2);c.fill();
 }
 // Casinhas em pixel art, desenhadas sobre a floresta.
 for(const key of houseCells){
  const [hx,hy]=key.split(',').map(Number);
  const x=(hx+.5)*tile,y=(hy+.5)*tile;
  const w=tile*.78,h=tile*.76;
  c.fillStyle='rgba(10,24,15,.42)';c.fillRect(x-w*.46+4,y+h*.24,w*.98,h*.34);
  c.fillStyle='#66503a';c.fillRect(x-w*.43,y-h*.08,w*.86,h*.53);
  c.fillStyle='#e2c38d';c.fillRect(x-w*.34,y-h*.02,w*.68,h*.38);
  c.fillStyle='#9d4739';c.beginPath();c.moveTo(x-w*.52,y-h*.08);c.lineTo(x,y-h*.54);c.lineTo(x+w*.52,y-h*.08);c.closePath();c.fill();
  c.fillStyle='#d67b52';c.fillRect(x-w*.38,y-h*.13,w*.76,h*.075);
  c.fillStyle='#51392f';c.fillRect(x-w*.095,y+h*.08,w*.19,h*.26);
  c.fillStyle='#7bb4c3';c.fillRect(x-w*.28,y+h*.015,w*.14,h*.13);c.fillRect(x+w*.14,y+h*.015,w*.14,h*.13);
  c.strokeStyle='#6c4937';c.lineWidth=Math.max(1,tile*.025);c.strokeRect(x-w*.28,y+h*.015,w*.14,h*.13);c.strokeRect(x+w*.14,y+h*.015,w*.14,h*.13);
 }
 forestLayer=layer;return layer;
}
// Sprites desenhados em pixels reais: sem emojis e sem filtros borrados.
const SPRITES={
 goblin:["....RRRR....","..RRRRRRRR..",".RRDRRRRDRR.","RRRRRRRRRRRR","RDRWWRRWWRDR","RRRKKRRKKRRR",".RRRRRRRRRR.","..RRDDDDRR..","..DRRRRRRD..","..DDRRRRDD..","...DD..DD...","..DD....DD.."],
 archer:["....HHHH....","...HHHHHH...","...HSSSSH...","...HKBKSH...","....SSSS....","..GGGGGGGG..",".GGGGBBGGGG.",".GGGGBBGGGG.","...BB..BB...","...BB..BB...","..DDD..DDD..","..DDD..DDD.."],
 mage:[".....PP.....","....PPPP....","...PPPPPP...","..PPPPPPPP..","...PSSSSP...","....SKKS....","...BBBBBB...","..BBBBBBBB..","..BBBBBBBB..","..BBBBBBBB..","..BBBBBBBB..","..DD....DD.."],
 warrior:["....CCCC....","...CCCCCC...","...CSSSSC...","...CSK KSC...".replace(' ',''),"....SSSS....","..AAAAAAAA..","..AAABBAAA..","..AAABBAAA..","...AABBAA...","...BB..BB...","..DDD..DDD..","..DDD..DDD.."],
 dragon:["RR........RR","RRR......RRR",".RRR.RR.RRR.","..RRRRRRRR..","..RRYYRRYY..","...RRKKRR...",".RRRRRRRRRR.","RRRRRRRRRRRR",".RRRRRRRRRR.","..RRRRRRRR..","..DD....DD..",".DDD....DDD."],
 castle:["..CC......CC..","..CC..CC..CC..","..CCCCCCCCCC..","..CCCCCCCCCC..","..CCDDDDDDCC..","..CCDDDDDDCC..","CCCCDDDDDDCCCC","CCCCDDDDDDCCCC","CCCCDDDDDDCCCC","CCCCDDDDDDCCCC","CCCCDDKKDDCCCC","CCCCDDKKDDCCCC","CCCCDDKKDDCCCC","CCCCCCCCCCCCCC"]
};
const PALETTE={R:'#e7444a',D:'#74212b',W:'#fff3d6',K:'#22212a',H:'#79542c',S:'#f4c69d',B:'#3668b2',G:'#368448',P:'#8b50d3',C:'#aeb6bd',A:'#d3ad60',Y:'#ffdf74'};
// Sprites pré-renderizados: evita redesenhar centenas de quadradinhos a cada quadro.
const spriteCache=new Map();
function sprite(name,x,y,size){
 const key=name+':'+Math.round(size);
 let cached=spriteCache.get(key);
 if(!cached){
  const art=SPRITES[name],sz=Math.max(1,Math.round(size));
  cached=document.createElement('canvas');cached.width=sz;cached.height=sz;
  const c=cached.getContext('2d');const unit=sz/Math.max(...art.map(r=>r.length));
  for(let row=0;row<art.length;row++)for(let col=0;col<art[row].length;col++){
   const color=PALETTE[art[row][col]];if(color){c.fillStyle=color;c.fillRect(Math.round(col*unit),Math.round(row*unit),Math.ceil(unit),Math.ceil(unit));}
  }
  spriteCache.set(key,cached);
 }
 ctx.drawImage(cached,Math.round(x-size/2),Math.round(y-size/2),size,size);
}

// Quatro torres arqueiras medievais em pixel art.
// Torres de arqueiros em pixel art: quatro níveis, com arqueiros visíveis no topo.
const HOUSE_ART=[
 ["......DDDD......",".....DWWD......","....DWRRWD......","...DDWRRWDD.....","...DWWWWWWD.....","..DDDDDDDDDD....","..DSSSSSSSSD....","..DSSKSSKSSD....","..DSSSSSSSSD....","..DWWWWWWWWD....","..DWWWWWWWWD....","..DWWDDWWWWD....","..DWWDDWWWWD....","..DWWDDWWWWD....","..DWWDDWWWWD....","..BBBBBBBBBB...."],
 ["...CC....CC.....","...CCCCCCCC.....","...CDWWWWDC.....","...CDWRR WDC.....".replace(' ',''),"...CDWRRWDC.....","..CCDDDDDDCC....","..CYYSSSSYYC....","..CSSKSSKSSC....","..CSSSSSSSSC....","..CWWWWWWWWC....","..CWWWWWWWWC....","..CWWDDWWWWC....","..CWWDDWWWWC....","..CWWDDWWWWC....","..CWWDDWWWWC....","..BBBBBBBBBB...."],
 ["..CC..CC..CC....","..CCCCCCCCCC....","..CWWWWWWWWC....","..CWDRRRR DWC...".replace(' ',''),"..CWDRRRRDWC....","..CCDDDDDDCC....","..CYYSSSSYYC....","..CSSKSSKSSC....","..CSSSSSSSSC....","..CWWWWWWWWC....","..CWWWWWWWWC....","..CWWDDWWWWC....","..CWWDDWWWWC....","..CWWDDWWWWC....","..CWWDDWWWWC....","..BBBBBBBBBB...."],
 ["..CC..CC..CC....","..CCCCCCCCCC....","..CYYYYYYYYC....","..CYDRRRRDYC....","..CYDRRRRDYC....","..CCDDDDDDCC....","..CYYSSSSYYC....","..CSSKSSKSSC....","..CSSSSSSSSC....","..CWWWWWWWWC....","..CWWWWWWWWC....","..CWWDDWWWWC....","..CWWDDWWWWC....","..CWWDDWWWWC....","..CWWDDWWWWC....","..BBBBBBBBBB...."]
];
const HOUSE_PALETTE={D:'#50372b',W:'#b5a38b',S:'#e4b781',K:'#26262b',B:'#4b4d51',R:'#b63831',C:'#757d88',Y:'#e6c65a'};
const houseCache=new Map();
function renderHouse(c,art,x,y,size){
 const key=HOUSE_ART.indexOf(art)+':'+Math.round(size);
 let cached=houseCache.get(key);
 if(!cached){
  const sz=Math.max(1,Math.round(size)),n=art.length,px=sz/n;
  cached=document.createElement('canvas');cached.width=sz;cached.height=sz;
  const cc=cached.getContext('2d');
  for(let j=0;j<n;j++)for(let i=0;i<art[j].length;i++){
   const color=HOUSE_PALETTE[art[j][i]];
   if(color){cc.fillStyle=color;cc.fillRect(Math.round(i*px),Math.round(j*px),Math.ceil(px),Math.ceil(px));}
  }
  houseCache.set(key,cached);
 }
 c.drawImage(cached,Math.round(x-size/2),Math.round(y-size/2),size,size);
}
function drawShopHouse(canvas,type){if(!canvas)return;const c=canvas.getContext('2d');c.imageSmoothingEnabled=false;c.clearRect(0,0,48,48);renderHouse(c,HOUSE_ART[type],24,24,44)}
function pixelForest(){if(pixelForestLayer)return pixelForestLayer;const original=forestBackground();const out=document.createElement('canvas');const step=5;out.width=Math.ceil(original.width/step);out.height=Math.ceil(original.height/step);const oc=out.getContext('2d');oc.imageSmoothingEnabled=true;oc.drawImage(original,0,0,out.width,out.height);pixelForestLayer=out;return out}
function pixelEllipse(x,y,rx,ry,color){ctx.fillStyle=color;const step=Math.max(3,Math.round(tile*.085));for(let dy=-ry;dy<=ry;dy+=step)for(let dx=-rx;dx<=rx;dx+=step)if(dx*dx/(rx*rx)+dy*dy/(ry*ry)<=1)ctx.fillRect(Math.round(x+dx),Math.round(y+dy),step,step)}
function draw(time){
 const w=C*tile,h=R*tile;ctx.imageSmoothingEnabled=false;ctx.clearRect(0,0,w,h);
 ctx.drawImage(pixelForest(),0,0,w,h);
 const cx=27.5*tile,cy=5.5*tile;
 pixelEllipse(cx,cy+tile*.30,tile*.42,tile*.15,'#172b20');
 sprite('castle',cx,cy-tile*.19,tile*.95);
 for(const t of towers){
  const px=(t.x+.5)*tile,py=(t.y+.5)*tile;
  pixelEllipse(px,py+tile*.16,tile*.38,tile*.19,'#17282c');
  pixelEllipse(px,py+tile*.10,tile*.31,tile*.13,['#ffd77c','#8bdcff','#e3e4ef','#ff9459'][t.type]);
  renderHouse(ctx,HOUSE_ART[t.type],px,py-tile*.13,tile*.95);
 }
 if(selectedTower&&towers.includes(selectedTower)){
  const px=(selectedTower.x+.5)*tile,py=(selectedTower.y+.5)*tile;
  const bx=px+tile*.18,by=py-tile*.34,rad=tile*.19;
  ctx.fillStyle='#e52f39';ctx.fillRect(Math.round(bx-rad),Math.round(by-rad),Math.round(rad*2),Math.round(rad*2));
  ctx.strokeStyle='#fff';ctx.lineWidth=Math.max(2,tile*.065);ctx.beginPath();ctx.moveTo(bx-rad*.37,by-rad*.37);ctx.lineTo(bx+rad*.37,by+rad*.37);ctx.moveTo(bx+rad*.37,by-rad*.37);ctx.lineTo(bx-rad*.37,by+rad*.37);ctx.stroke();
 }
 for(const g of goblins){
  if(g.pos<0)continue;const p=posAt(g.pos),px=p.x*tile,py=p.y*tile;
  pixelEllipse(px,py+tile*.23,tile*.27,tile*.11,'#47392b');
  sprite('goblin',px,py-tile*.10+Math.round(Math.sin(time*12+g.wiggle)*2),tile*.69);
  if(g.boss){ctx.font=`${Math.round(tile*.35)}px sans-serif`;ctx.textAlign='center';ctx.fillText('👑',px,py-tile*.75);}
  const bx=Math.round(px-tile*(g.boss?.48:.29)),by=Math.round(py-tile*(g.boss?.90:.51)),bw=Math.round(tile*(g.boss?.96:.58)),bh=Math.max(3,Math.round(tile*.08));
  ctx.fillStyle='#341d20';ctx.fillRect(bx-1,by-1,bw+2,bh+2);
  ctx.fillStyle='#7ce96b';ctx.fillRect(bx,by,Math.round(bw*Math.max(0,g.hp/g.maxHp)),bh);
 }
 for(const b of bullets){const n=Math.max(4,Math.round(tile*.12));ctx.fillStyle=b.color;ctx.fillRect(Math.round(b.x*tile-n/2),Math.round(b.y*tile-n/2),n,n)}
 for(const p of particles){ctx.globalAlpha=Math.max(0,p.life/p.max);const n=Math.max(3,Math.round(tile*.10));ctx.fillStyle=p.color;ctx.fillRect(Math.round(p.x*tile),Math.round(p.y*tile),n,n);ctx.globalAlpha=1}
}
// Um toque no defensor exibe o X. Um toque fora dele esconde o X.
// O X tem uma área de toque um pouco maior para facilitar no celular.
// Clique ou toque curto posiciona/seleciona; arrastar desloca o mapa sem comprar.
let press=null;
canvas.addEventListener('pointerdown',e=>{if(!active||paused)return;press={x:e.clientX,y:e.clientY};});
canvas.addEventListener('pointercancel',()=>press=null);
canvas.addEventListener('pointerup',e=>{
  if(!active||paused||!press)return;
  const moved=Math.hypot(e.clientX-press.x,e.clientY-press.y);press=null;
  if(moved>12)return;
  const r=canvas.getBoundingClientRect();
  const px=(e.clientX-r.left)/tile,py=(e.clientY-r.top)/tile;
  if(selectedTower&&towers.includes(selectedTower)){
    const bx=selectedTower.x+.68,by=selectedTower.y+.16;
    if(Math.hypot(px-bx,py-by)<=.32){
      const refund = CONFIG.defenders[selectedTower.type].cost;
      towers.splice(towers.indexOf(selectedTower),1);selectedTower=null;
      coins += refund;
      hud();
      showToast(`Defensor removido! +${refund} moedas`);return;
    }
  }
  const x=Math.floor(px),y=Math.floor(py);
  const existing=towers.find(t=>t.x===x&&t.y===y);
  if(existing){selectedTower=existing;return;}
  selectedTower=null;
  if(x<0||x>=C||y<0||y>=R)return;
  const u=CONFIG.defenders[selected];
  if(pathCells.has(`${x},${y}`)){showToast('Coloque o defensor na grama!');return;}
  if(isVillageHouse(x,y)){showToast('Não é possível colocar torres sobre as casinhas!');return;}
  if(towers.filter(t=>t.type===selected).length>=CONFIG.towerLimits[selected]){showToast(`Limite de ${CONFIG.towerLimits[selected]} torres deste tipo atingido!`);return;}
  if(coins<u.cost){showToast('Moedas insuficientes!');return;}
  towers.push({x,y,type:selected,cool:0});coins-=u.cost;hud();towerPlacementSound();burst(x+.5,y+.5,'#f5df8a',8);
});
// Toques fora do tabuleiro também fecham o botão de remoção.
document.addEventListener('pointerdown',e=>{
  if(e.target!==canvas)selectedTower=null;
});
// Até 60 FPS, minimapa a 10 FPS e economia de CPU com a aba oculta.
let lastMiniFrame=0;
function frame(t){
 requestAnimationFrame(frame);
 if(document.hidden){lastTime=t;return;}
 const elapsed=t-lastTime;
 if(elapsed<1000/60-1)return;
 const dt=Math.min(elapsed/1000,.05);
 lastTime=t;
 update(dt);
 draw(t/1000);
 if(t-lastMiniFrame>=100){drawMinimap();lastMiniFrame=t;}
}
document.addEventListener('visibilitychange',()=>{lastTime=performance.now();});
// Monta o canvas após declarar os caches; mantém a atualização responsiva.
const resizeObserver=new ResizeObserver(resize);resizeObserver.observe(arena);resize();
syncPauseButton();hud();requestAnimationFrame(frame);
