// Caminho de retorno para o mapa caso a fase seja aberta diretamente.
// Ajuste conforme a localização dos arquivos no seu site.
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
  columns: 32, rows: 12, totalGoblins: 260, maxGoblinsOnMap: 50, startingCoins: 5,
  maxLeaks: 4, spawnInterval: 1.55,
  // Quantos goblins saem juntos e a pausa entre os grupos (segundos).
  // 1–80: de 2 em 2; 81–120: de 3 em 3; 121–200: de 3 em 3,
  // com intervalos cada vez menores conforme eles ficam mais rápidos.
  spawnGroups: [
    { until: 80, count: 2, interval: 1.35 },
    { until: 120, count: 3, interval: 0.95 },
    { until: 260, count: 3, interval: 0.60 }
  ],
  // No começo eles ficam afastados; conforme evoluem, se aproximam.
  groupSpacingStart: 3.4, // distância inicial em quadrados
  groupSpacingMin: 0.28,  // menor distância entre goblins
  spacingDecay: 0.90,    // aproximação suave após os primeiros 60 goblins
  intervalDecay: 0.97,   // reduz gradualmente a pausa após os primeiros 60 goblins
  spacingStartsAfter: 60, // só começam a se juntar após o goblin 60

  goblin: {
    baseHp: 20, baseSpeed: 0.78,
    // A cada aumento de velocidade (30 goblins), a vida aumenta em 1 tiro de Arqueiro.
    // Velocidade: 1–30 normal, 31–60 +12%, 61–90 +25% etc.
    goblinsPerLevel: 30, // vida acompanha o aumento de velocidade
    goblinsPerSpeedLevel: 30, // velocidade: +12% a cada 30 (demora mais para acelerar)
    speedMultiplier: 1.12, // +12% de velocidade por nível (cumulativo)
    extraHpPerLevel: 4     // +4 HP = 1 tiro extra do Arqueiro a cada aceleração

  },
  towerLimits: [6, 5, 5, 4, 4],
  defenders: [
    { name:'Torre Arqueira I', emoji:'🏹', cost:2, damage:5, range:3, fireInterval:0.85, bulletColor:'#ffe47b' },
    { name:'Torre Arqueira II', emoji:'🧙', cost:4, damage:7, range:3, fireInterval:0.8, bulletColor:'#8dd6ff' },
    { name:'Torre Arqueira III', emoji:'⚔️', cost:6, damage:9, range:3, fireInterval:0.75, bulletColor:'#c7c4ff' },
    { name:'Torre Arqueira IV', emoji:'🐉', cost:10, damage:13, range:3, fireInterval:0.7, bulletColor:'#ff8453' },
    { name:'Torre de Fogo', emoji:'🔥', cost:12, damage:35, range:3.4, fireInterval:2.8, bulletColor:'#ff631c', splash:2 }
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
const MINIMAP = { cell: 10, grass: '#729b60', road: '#c6ad83', goblin: '#ff5353', tower: '#6cc7ff', viewport: '#fff1a0' };
const miniCanvas=document.getElementById('minimapCanvas'),miniCtx=miniCanvas.getContext('2d');
miniCanvas.width=C*MINIMAP.cell;miniCanvas.height=R*MINIMAP.cell;

// Caminho em curvas, de cima até a casa na parte inferior.
// 9 curvas: caminho em zigue-zague da esquerda para a direita.
// Modifique os pares [coluna, linha] para redesenhar a estrada.
const corners=[[-1,6],[4,6],[4,2],[10,2],[10,9],[16,9],[16,4],[22,4],[22,9],[27,9],[27,5],[32,5]];
const path=[];
for(let i=0;i<corners.length-1;i++){
  const [ax,ay]=corners[i],[bx,by]=corners[i+1];
  const n=Math.max(Math.abs(bx-ax),Math.abs(by-ay));
  for(let j=0;j<n;j++)path.push([ax+(bx-ax)*j/n,ay+(by-ay)*j/n]);
}path.push(corners.at(-1));
const pathCells=new Set(path.filter(([x,y])=>x>=0&&x<C&&y>=0&&y<R).map(([x,y])=>`${x},${y}`));
let forestLayer=null,forestTile=0,pixelForestLayer=null;
let tile=48,dpr=1,selected=0,coins=5,leaks=0,spawned=0,killed=0,spawnTimer=0,active=false,finished=false,paused=false,lastTime=0;
const pauseButton=document.getElementById("pauseButton");
const pauseOverlay=document.getElementById("pauseOverlay");
function syncPauseButton(){pauseOverlay.hidden=!active||finished||!paused;pauseButton.hidden=!active||finished;pauseButton.textContent=paused?"▶ CONTINUAR":"⏸ PAUSAR";pauseButton.setAttribute("aria-label",paused?"Continuar jogo":"Pausar jogo");pauseButton.setAttribute("aria-pressed",String(paused));}
pauseButton.addEventListener("click",()=>{if(!active||finished)return;paused=!paused;if(paused)backgroundMusic.pause();else backgroundMusic.play().catch(()=>{});syncPauseButton();});
document.getElementById("continueButton").addEventListener("click",()=>{if(!active||finished)return;paused=false;backgroundMusic.play().catch(()=>{});syncPauseButton();});
let goblins=[],towers=[],bullets=[],particles=[],grass=[],toastTimer;
let bossPhase="normal",bossWait=0,bossSpawned=0,bossKilled=0;
let runnerStage=0,runnerSpawned=0,runnerKilled=0; // 0: normal, 1: primeira onda, 2: normal, 3: segunda onda, 4: normal
// Defensor selecionado para mostrar o botão vermelho de remoção.
let selectedTower=null;
const random=(a,b)=>a+Math.random()*(b-a);
for(let i=0;i<110;i++)grass.push({x:Math.random()*C,y:Math.random()*R,s:random(.04,.14),a:random(.15,.4)});

function resize(){const rect=arena.getBoundingClientRect();
  // No celular, mantenha o mapa grande e permita arrastar horizontalmente.
  // No notebook, encaixe o mapa na área disponível quando possível.
  tile=Math.max(1,rect.width/C,rect.height/R);
  const w=C*tile,h=R*tile;dpr=Math.min(devicePixelRatio||1,1.5);canvas.style.width=`${w}px`;canvas.style.height=`${h}px`;canvas.style.marginTop=`0px`;canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);forestLayer=null;pixelForestLayer=null}
new ResizeObserver(resize).observe(arena);resize();
function shopRender(){shop.innerHTML='';CONFIG.defenders.forEach((u,i)=>{const b=document.createElement('button');const placed=towers.filter(t=>t.type===i).length;const limit=CONFIG.towerLimits[i];b.className=`unit ${selected===i?'selected':''} ${coins<u.cost?'unaffordable':''} ${placed>=limit?'limit-reached':''}`;b.setAttribute('aria-disabled',placed>=limit?'true':'false');b.innerHTML=`${placed>=limit?'<span class="limit-x" aria-label="Limite atingido">✕</span>':''}<span class="emoji"><canvas class="house-preview" width="48" height="48" data-house="${i}"></canvas></span><span class="name">${u.name} (${placed}/${limit})</span><span class="price" aria-label="Custa ${u.cost} moedas">🪙${u.cost}</span>`;b.onclick=()=>{if(placed>=limit){showToast(`Limite de ${limit} torres atingido!`);return;}selected=i;shopRender();showToast(`${u.name} selecionado`)};shop.appendChild(b);drawShopHouse(b.querySelector('canvas'),i)})}
function hud(){coinsEl.textContent=`🪙 ${coins}`;waveEl.textContent=runnerStage===1||runnerStage===3?`👟 ${runnerKilled}/20 • 👹 ${spawned+((runnerStage>=3)?20:0)+runnerSpawned}/300`:`👹 ${spawned+(runnerStage>=2?20:0)+(runnerStage>=4?20:0)}/300`;livesEl.textContent=`❤️ ${Math.max(0,CONFIG.maxLeaks-leaks)}/${CONFIG.maxLeaks}`;shopRender()}
function showToast(s){toastEl.textContent=s;toastEl.classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>toastEl.classList.remove('visible'),1300)}
// Sons do Level 3: substitua os MP3 na pasta audio para personalizar.
const AUDIO_FILES={music:'audio/musica.mp3',death:'audio/morte-goblin.mp3',towers:[1,2,3,4,5].map(n=>`audio/torre-${n}.mp3`)};
const backgroundMusic=new Audio(AUDIO_FILES.music);
backgroundMusic.loop=true;backgroundMusic.volume=.24;
let audioCtx=null,lastDeathSound=0;
const deathSoundPool=Array.from({length:5},()=>{const a=new Audio(AUDIO_FILES.death);a.preload='auto';a.volume=.5;return a});let deathSoundIndex=0;
function contextAudio(){try{audioCtx??=new (window.AudioContext||window.webkitAudioContext)();if(audioCtx.state==='suspended')audioCtx.resume();return audioCtx}catch{return null}}
function note(f,t,d,v=.10,type='triangle'){const a=contextAudio();if(!a)return;const o=a.createOscillator(),g=a.createGain();o.type=type;o.frequency.setValueAtTime(f,t);g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(Math.max(.0002,v),t+.02);g.gain.exponentialRampToValueAtTime(.0001,t+d);o.connect(g).connect(a.destination);o.start(t);o.stop(t+d+.01)}
function trumpet(){const a=contextAudio();if(!a)return;const t=a.currentTime+.03;[392,523.25,659.25,783.99].forEach((f,i)=>note(f,t+i*.22,.32,.10,'sawtooth'))}
function lossSound(){const a=contextAudio();if(!a)return;const t=a.currentTime+.02;[392,349.23,293.66,220,164.81].forEach((f,i)=>note(f,t+i*.12,.24,.10,'sine'))}
function applause(){const a=contextAudio();if(!a)return;const t=a.currentTime;for(let i=0;i<30;i++){const len=.035,b=a.createBuffer(1,Math.ceil(a.sampleRate*len),a.sampleRate),data=b.getChannelData(0);for(let j=0;j<data.length;j++)data[j]=(Math.random()*2-1)*(1-j/data.length);const src=a.createBufferSource(),gain=a.createGain();src.buffer=b;gain.gain.value=.08;src.connect(gain).connect(a.destination);src.start(t+i*.05+Math.random()*.02)}}
function towerPlacementSound(){const a=contextAudio();if(!a)return;const t=a.currentTime+.005;note(440,t,.085,.095);note(659.25,t+.065,.12,.085)}
function goblinDeathSound(){const now=performance.now();if(now-lastDeathSound<90)return;lastDeathSound=now;const snd=deathSoundPool[deathSoundIndex];deathSoundIndex=(deathSoundIndex+1)%deathSoundPool.length;try{snd.pause();snd.currentTime=0;snd.play().catch(()=>{})}catch{}}
const towerSoundPools=AUDIO_FILES.towers.map(file=>Array.from({length:4},()=>{const a=new Audio(file);a.preload='auto';a.volume=.38;return a}));
const towerSoundIndex=[0,0,0,0,0];
function towerShootSound(type){const pool=towerSoundPools[type];if(!pool)return;const i=towerSoundIndex[type];const a=pool[i];towerSoundIndex[type]=(i+1)%pool.length;try{a.pause();a.currentTime=0;a.play().catch(()=>{})}catch{}}
function stopTowerSounds(){for(const pool of towerSoundPools)for(const a of pool){a.pause();a.currentTime=0}}
function stopMusic(){backgroundMusic.pause();backgroundMusic.currentTime=0}

function start(){contextAudio();trumpet();stopMusic();stopTowerSounds();backgroundMusic.play().catch(()=>{});document.getElementById('towerTip').hidden=true;document.getElementById('home').hidden=false;document.getElementById('start').textContent='▶ COMEÇAR JOGO';selectedTower=null;coins=CONFIG.startingCoins;leaks=0;spawned=0;killed=0;spawnTimer=0;bossPhase="normal";bossWait=0;bossSpawned=0;bossKilled=0;runnerStage=0;runnerSpawned=0;runnerKilled=0;goblins=[];towers=[];bullets=[];particles=[];selected=0;active=true;finished=false;paused=false;overlay.classList.add('hidden');syncPauseButton();hud()}
function end(win){if(win){try{const chave='reino_levels_done';const atual=Math.max(0,Math.min(20,Number(localStorage.getItem(chave))||0));if(atual===2)localStorage.setItem(chave,String(3));}catch(erro){console.warn('Não foi possível salvar o progresso',erro);}}stopMusic();stopTowerSounds();if(win)applause();else lossSound();document.getElementById('towerTip').hidden=true;active=false;finished=true;paused=false;syncPauseButton();modalIcon.textContent=win?'🏆':'💀';modalTitle.textContent=win?'QUE BELA VITÓRIA!':'GAME OVER';modalText.textContent=win?`Você venceu os 260 goblins normais e os 40 velozes! ${CONFIG.maxLeaks-leaks} vidas restantes.`:`Os goblins chegaram ao castelo. Você derrotou ${killed} inimigos. Tente outra estratégia!`;document.getElementById('start').textContent='↻ REINICIAR';document.getElementById('home').hidden=false;overlay.classList.remove('hidden')}
document.getElementById('start').addEventListener('click',start);
function voltarParaMapa(){
  // Retorna à página anterior quando o jogador veio do mapa.
  // Se abriu a fase diretamente, usa o endereço configurado acima.
  if(window.history.length>1 && document.referrer){
    try{const anterior=new URL(document.referrer);if(anterior.origin===location.origin){history.back();return;}}catch(e){}
  }
  window.location.assign(PAGINA_MAPA);
}
document.getElementById('home').addEventListener('click',voltarParaMapa);
document.getElementById('giveUpButton').addEventListener('click',()=>{
  paused=false;active=false;finished=true;stopMusic();stopTowerSounds();syncPauseButton();voltarParaMapa();
});
function statsFor(index){
  const g=CONFIG.goblin;
  const level=Math.floor((index-1)/g.goblinsPerLevel);
  const speedLevel=Math.floor((index-1)/g.goblinsPerSpeedLevel);
  return {
    hp:g.baseHp+level*g.extraHpPerLevel,
    speed:g.baseSpeed*Math.pow(g.speedMultiplier,speedLevel)*(index>220?0.90:1) // 10% mais lentos nos 40 goblins normais finais
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
function burst(x,y,color,n=7){for(let i=0;i<n;i++)particles.push({x,y,vx:random(-2,2),vy:random(-2,2),life:random(.2,.6),max:.6,color})}
function update(dt){if(!active||paused)return;
  spawnTimer-=dt;
  // Ondas especiais são liberadas após 30 e 120 goblins normais abatidos.
  if(runnerStage===0&&killed>=30){runnerStage=1;runnerSpawned=0;runnerKilled=0;spawnTimer=0;showToast('👟 ONDA DE 20 GOBLINS VELOZES!')}
  if(runnerStage===2&&killed>=120){runnerStage=3;runnerSpawned=0;runnerKilled=0;spawnTimer=0;showToast('👟 SEGUNDA ONDA VELOZ!')}
  if(spawnTimer<=0){
    if(runnerStage===1||runnerStage===3){
      const slots=CONFIG.maxGoblinsOnMap-goblins.length;
      if(slots>0&&runnerSpawned<20){
        runnerSpawned++;
        const hp=13+Math.floor(spawned/60)*3;
        goblins.push({pos:-1,hp,maxHp:hp,speed:2.35,wiggle:Math.random()*6.28,runner:true});
        spawnTimer=.48;
      }else spawnTimer=.18;
    }else if(spawned<CONFIG.totalGoblins)spawnTimer=spawnGroup();
  }
  for(const g of goblins){g.pos+=g.speed*dt;if(g.pos>=path.length-1){g.dead=true;leaks++;burst(31.5,5.5,'#ff6e65',12);if(g.runner)runnerKilled++;if(g.boss||leaks>=CONFIG.maxLeaks){hud();end(false);return}hud()}}
  goblins=goblins.filter(g=>!g.dead);
  // As torres acompanham suavemente a aceleração dos goblins: até 20% mais disparos ao final.
  const towerSpeedBonus = Math.min(0.20, Math.floor(spawned / 30) * 0.025);
  for(const t of towers){t.cool-=dt;if(t.cool>0)continue;const u=CONFIG.defenders[t.type];let target=null,best=-1;for(const g of goblins){if(g.pos<0)continue;const p=posAt(g.pos),dist=Math.hypot(p.x-(t.x+.5),p.y-(t.y+.5));if(dist<=u.range&&g.pos>best){best=g.pos;target=g}}if(target){t.cool=u.fireInterval/(1+towerSpeedBonus);towerShootSound(t.type);bullets.push({x:t.x+.5,y:t.y+.5,target,damage:u.damage,color:u.bulletColor,speed:u.splash?8:13,splash:u.splash||0})}}
  for(const b of bullets){if(b.dead)continue;if(b.target.dead||!goblins.includes(b.target)){b.dead=true;continue}const p=posAt(b.target.pos),dx=p.x-b.x,dy=p.y-b.y,d=Math.hypot(dx,dy),step=b.speed*dt;if(d<step+.18){b.dead=true;const victims=b.splash?goblins.filter(g=>!g.dead&&g.pos>=0&&Math.hypot(posAt(g.pos).x-p.x,posAt(g.pos).y-p.y)<=1.45).slice(0,2):[b.target];
      for(const victim of victims){victim.hp-=b.damage;if(victim.hp<=0&&!victim.dead){victim.dead=true;if(victim.runner)runnerKilled++;else{killed++;if(killed%2===0)coins++;}burst(p.x,p.y,'#b7e06e',10);goblinDeathSound();hud()}}
      burst(p.x,p.y,b.color,b.splash?16:3);}else{b.x+=dx/d*step;b.y+=dy/d*step}}
  bullets=bullets.filter(b=>!b.dead);goblins=goblins.filter(g=>!g.dead);
  for(const p of particles){p.x+=p.vx*dt;p.y+=p.vy*dt;p.life-=dt}particles=particles.filter(p=>p.life>0);
  if((runnerStage===1||runnerStage===3)&&runnerSpawned===20&&runnerKilled===20){runnerStage++;spawnTimer=.4;showToast('👹 Os goblins normais voltaram!')}
  if(spawned===CONFIG.totalGoblins&&runnerStage===4&&goblins.length===0)end(true)
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
 const c=layer.getContext('2d'),rand=seeded(88271);
 // Vila medieval: mesma estrada e jogabilidade, com casas, cercas, hortas e praça.
 const bg=c.createLinearGradient(0,0,w,h);bg.addColorStop(0,'#7da768');bg.addColorStop(.55,'#71985a');bg.addColorStop(1,'#567b4b');c.fillStyle=bg;c.fillRect(0,0,w,h);
 for(let i=0;i<5000;i++){const x=rand()*w,y=rand()*h;c.fillStyle=['#8caf6e','#5c8a50','#a4b979','#6a9454'][Math.floor(rand()*4)];c.globalAlpha=.18+rand()*.28;c.fillRect(x,y,tile*(.03+rand()*.13),tile*(.02+rand()*.08))}c.globalAlpha=1;
 const pts=path.map(([x,y])=>({x:(x+.5)*tile,y:(y+.5)*tile}));
 const distanceToRoad=(x,y)=>{let best=Infinity;for(let i=1;i<pts.length;i++){const a=pts[i-1],b=pts[i],dx=b.x-a.x,dy=b.y-a.y,q=Math.max(0,Math.min(1,((x-a.x)*dx+(y-a.y)*dy)/(dx*dx+dy*dy||1)));best=Math.min(best,(x-a.x-q*dx)**2+(y-a.y-q*dy)**2)}return Math.sqrt(best)};
 // Ruas de terra com bordas de pedra e marcas de carroça.
 c.lineCap='round';c.lineJoin='round';for(const [ww,color] of [[1.14,'#496342'],[1.01,'#9a8a6a'],[.86,'#b7a078'],[.65,'#d3bc91']]){c.beginPath();c.moveTo(pts[0].x,pts[0].y);for(const p of pts.slice(1))c.lineTo(p.x,p.y);c.strokeStyle=color;c.lineWidth=tile*ww;c.stroke()}
 for(let i=0;i<1100;i++){const x=rand()*w,y=rand()*h;if(distanceToRoad(x,y)>tile*.39)continue;c.fillStyle=rand()<.5?'#a68e67':'#e2caa0';c.fillRect(x,y,tile*.045,tile*.025)}
 // Sem casas ao fundo: terreno livre com árvores, flores e vegetação.
 // Árvores, flores, pedras e barris para dar vida à vila.
 for(let i=0;i<260;i++){const x=rand()*w,y=rand()*h;if(distanceToRoad(x,y)<tile*.72)continue;const r=tile*(.11+rand()*.20);c.fillStyle='#584c34';c.fillRect(x-r*.2,y,r*.4,r*.9);c.fillStyle='#294e32';c.beginPath();c.arc(x+r*.12,y-r*.22,r*1.08,0,Math.PI*2);c.fill();c.fillStyle=['#4f8b47','#679d4f','#7aa653'][Math.floor(rand()*3)];c.beginPath();c.arc(x-r*.18,y-r*.46,r*.78,0,Math.PI*2);c.fill()}
 for(let i=0;i<320;i++){const x=rand()*w,y=rand()*h;if(distanceToRoad(x,y)<tile*.55)continue;c.fillStyle=['#f3d979','#f6efdc','#e68b92'][Math.floor(rand()*3)];c.fillRect(x,y,tile*.065,tile*.065)}
 forestLayer=layer;return layer;
}
// Sprites desenhados em pixels reais: sem emojis e sem filtros borrados.
const SPRITES={
 goblin3:["....PPPP....","..PPPPPPPP..",".PPDPPPPDPP.","PPPPPPPPPPPP","PDPWWPPWWPDP","PPPKKPPKKPPP",".PPPPPPPPPP.","..PPDDDDPP..","..DPPPPPPD..","..DDPPPPDD..","...DD..DD...","..DD....DD.."],
 runner:["....GGGG....","...GGGGGG...","..GSGGGGSG..","..GGWWWWGG..","...GKKKKG...","....GGGG....","....BBBB....","...BBBBBB...","....B..B....","...SS..SS...","..WW....WW..",".WW......WW."],
 goblin:["....RRRR....","..RRRRRRRR..",".RRDRRRRDRR.","RRRRRRRRRRRR","RDRWWRRWWRDR","RRRKKRRKKRRR",".RRRRRRRRRR.","..RRDDDDRR..","..DRRRRRRD..","..DDRRRRDD..","...DD..DD...","..DD....DD.."],
 archer:["....HHHH....","...HHHHHH...","...HSSSSH...","...HKBKSH...","....SSSS....","..GGGGGGGG..",".GGGGBBGGGG.",".GGGGBBGGGG.","...BB..BB...","...BB..BB...","..DDD..DDD..","..DDD..DDD.."],
 mage:[".....PP.....","....PPPP....","...PPPPPP...","..PPPPPPPP..","...PSSSSP...","....SKKS....","...BBBBBB...","..BBBBBBBB..","..BBBBBBBB..","..BBBBBBBB..","..BBBBBBBB..","..DD....DD.."],
 warrior:["....CCCC....","...CCCCCC...","...CSSSSC...","...CSK KSC...".replace(' ',''),"....SSSS....","..AAAAAAAA..","..AAABBAAA..","..AAABBAAA..","...AABBAA...","...BB..BB...","..DDD..DDD..","..DDD..DDD.."],
 dragon:["RR........RR","RRR......RRR",".RRR.RR.RRR.","..RRRRRRRR..","..RRYYRRYY..","...RRKKRR...",".RRRRRRRRRR.","RRRRRRRRRRRR",".RRRRRRRRRR.","..RRRRRRRR..","..DD....DD..",".DDD....DDD."],
 castle:["..CC......CC..","..CC..CC..CC..","..CCCCCCCCCC..","..CCCCCCCCCC..","..CCDDDDDDCC..","..CCDDDDDDCC..","CCCCDDDDDDCCCC","CCCCDDDDDDCCCC","CCCCDDDDDDCCCC","CCCCDDDDDDCCCC","CCCCDDKKDDCCCC","CCCCDDKKDDCCCC","CCCCDDKKDDCCCC","CCCCCCCCCCCCCC"]
};
const PALETTE={R:'#e7444a',D:'#74212b',W:'#fff3d6',K:'#22212a',H:'#79542c',S:'#f4c69d',B:'#3668b2',G:'#368448',P:'#8b50d3',C:'#aeb6bd',A:'#d3ad60',Y:'#ffdf74'};
function sprite(name,x,y,size){const art=SPRITES[name],unit=size/Math.max(...art.map(r=>r.length));ctx.save();ctx.translate(Math.round(x-size/2),Math.round(y-size/2));for(let row=0;row<art.length;row++)for(let col=0;col<art[row].length;col++){const c=art[row][col];if(PALETTE[c]){ctx.fillStyle=PALETTE[c];ctx.fillRect(Math.round(col*unit),Math.round(row*unit),Math.ceil(unit),Math.ceil(unit));}}ctx.restore()}

// Quatro torres arqueiras medievais em pixel art.
// Torres de arqueiros em pixel art: quatro níveis, com arqueiros visíveis no topo.
const HOUSE_ART=[
 ["......DDDD......",".....DWWD......","....DWRRWD......","...DDWRRWDD.....","...DWWWWWWD.....","..DDDDDDDDDD....","..DSSSSSSSSD....","..DSSKSSKSSD....","..DSSSSSSSSD....","..DWWWWWWWWD....","..DWWWWWWWWD....","..DWWDDWWWWD....","..DWWDDWWWWD....","..DWWDDWWWWD....","..DWWDDWWWWD....","..BBBBBBBBBB...."],
 ["...CC....CC.....","...CCCCCCCC.....","...CDWWWWDC.....","...CDWRR WDC.....".replace(' ',''),"...CDWRRWDC.....","..CCDDDDDDCC....","..CYYSSSSYYC....","..CSSKSSKSSC....","..CSSSSSSSSC....","..CWWWWWWWWC....","..CWWWWWWWWC....","..CWWDDWWWWC....","..CWWDDWWWWC....","..CWWDDWWWWC....","..CWWDDWWWWC....","..BBBBBBBBBB...."],
 ["..CC..CC..CC....","..CCCCCCCCCC....","..CWWWWWWWWC....","..CWDRRRR DWC...".replace(' ',''),"..CWDRRRRDWC....","..CCDDDDDDCC....","..CYYSSSSYYC....","..CSSKSSKSSC....","..CSSSSSSSSC....","..CWWWWWWWWC....","..CWWWWWWWWC....","..CWWDDWWWWC....","..CWWDDWWWWC....","..CWWDDWWWWC....","..CWWDDWWWWC....","..BBBBBBBBBB...."],
 ["..CC..CC..CC....","..CCCCCCCCCC....","..CYYYYYYYYC....","..CYDRRRRDYC....","..CYDRRRRDYC....","..CCDDDDDDCC....","..CYYSSSSYYC....","..CSSKSSKSSC....","..CSSSSSSSSC....","..CWWWWWWWWC....","..CWWWWWWWWC....","..CWWDDWWWWC....","..CWWDDWWWWC....","..CWWDDWWWWC....","..CWWDDWWWWC....","..BBBBBBBBBB...."],
 ["....RRRRRR......","...RRYYYYRR.....","..RRYYYYYYRR....","..RRYYYYYYRR....","...RRRRRRRR.....","..DDDDDDDDDD....","..DSSSSSSSSD....","..DSSKSSKSSD....","..DSSSSSSSSD....","..DWWWWWWWWD....","..DWWWWWWWWD....","..DWWDDWWWWD....","..DWWDDWWWWD....","..DWWDDWWWWD....","..DWWDDWWWWD....","..BBBBBBBBBB...."]
];
const HOUSE_PALETTE={D:'#50372b',W:'#b5a38b',S:'#e4b781',K:'#26262b',B:'#4b4d51',R:'#b63831',C:'#757d88',Y:'#e6c65a'};
function renderHouse(c,art,x,y,size){const n=art.length,px=size/n;c.save();c.translate(Math.round(x-size/2),Math.round(y-size/2));for(let j=0;j<n;j++)for(let i=0;i<art[j].length;i++){const color=HOUSE_PALETTE[art[j][i]];if(color){c.fillStyle=color;c.fillRect(Math.round(i*px),Math.round(j*px),Math.ceil(px),Math.ceil(px));}}c.restore()}
function drawShopHouse(canvas,type){if(!canvas)return;const c=canvas.getContext('2d');c.imageSmoothingEnabled=false;c.clearRect(0,0,48,48);renderHouse(c,HOUSE_ART[type],24,24,44)}
function pixelForest(){if(pixelForestLayer)return pixelForestLayer;const original=forestBackground();const out=document.createElement('canvas');const step=5;out.width=Math.ceil(original.width/step);out.height=Math.ceil(original.height/step);const oc=out.getContext('2d');oc.imageSmoothingEnabled=true;oc.drawImage(original,0,0,out.width,out.height);pixelForestLayer=out;return out}
function pixelEllipse(x,y,rx,ry,color){ctx.fillStyle=color;const step=Math.max(3,Math.round(tile*.085));for(let dy=-ry;dy<=ry;dy+=step)for(let dx=-rx;dx<=rx;dx+=step)if(dx*dx/(rx*rx)+dy*dy/(ry*ry)<=1)ctx.fillRect(Math.round(x+dx),Math.round(y+dy),step,step)}
function draw(time){
 const w=C*tile,h=R*tile;ctx.imageSmoothingEnabled=false;ctx.clearRect(0,0,w,h);
 ctx.drawImage(pixelForest(),0,0,w,h);
 const cx=31.5*tile,cy=5.5*tile;
 pixelEllipse(cx,cy+tile*.30,tile*.42,tile*.15,'#172b20');
 sprite('castle',cx,cy-tile*.19,tile*.95);
 for(const t of towers){
  const px=(t.x+.5)*tile,py=(t.y+.5)*tile;
  pixelEllipse(px,py+tile*.16,tile*.38,tile*.19,'#17282c');
  pixelEllipse(px,py+tile*.10,tile*.31,tile*.13,['#ffd77c','#8bdcff','#e3e4ef','#ff9459','#ff5d1c'][t.type]);
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
  sprite(g.runner?'runner':'goblin3',px,py-tile*.10+Math.round(Math.sin(time*(g.runner?20:12)+g.wiggle)*2),tile*(g.runner?.60:.69));
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
  if(towers.filter(t=>t.type===selected).length>=CONFIG.towerLimits[selected]){showToast(`Limite de ${CONFIG.towerLimits[selected]} torres deste tipo atingido!`);return;}
  if(coins<u.cost){showToast('Moedas insuficientes!');return;}
  towers.push({x,y,type:selected,cool:0});coins-=u.cost;hud();towerPlacementSound();burst(x+.5,y+.5,'#f5df8a',8);
});
// Toques fora do tabuleiro também fecham o botão de remoção.
document.addEventListener('pointerdown',e=>{
  if(e.target!==canvas)selectedTower=null;
});
// Renderização limitada a 60 FPS; minimapa limitado a 10 FPS.
// O delta de simulação é calculado pelo tempo real para manter a velocidade do jogo.
let lastRenderTime=0,lastMinimapTime=0;
function frame(t){
 requestAnimationFrame(frame);
 if(document.hidden){lastTime=t;lastRenderTime=t;lastMinimapTime=t;return;}
 if(t-lastRenderTime<1000/60-1)return;
 const dt=Math.min((t-lastTime)/1000||0,.05);
 lastTime=t;lastRenderTime=t;
 update(dt);
 draw(t/1000);
 if(t-lastMinimapTime>=100){drawMinimap();lastMinimapTime=t;}
}
document.addEventListener('visibilitychange',()=>{lastTime=0;lastRenderTime=0;lastMinimapTime=0});
syncPauseButton();hud();requestAnimationFrame(frame);
