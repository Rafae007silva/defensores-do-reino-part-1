// Configure o caminho do mapa caso a fase seja aberta diretamente.
const PAGINA_MAPA = "../mapa/index.html";
// Altere o endereço abaixo para o site da sua tela inicial.
const SITE_TELA_INICIAL = "https://seusite.com.br";

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
  bosses: {count:3, waitSeconds:7, hitsToKill:300, speed:0.62, spawnSpacing:3.5, speedBoostPerDeath:1.12, size:1.35},
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
const MINIMAP = { cell: 10, grass: '#496f57', road: '#b9986e', goblin: '#ff5353', tower: '#6cc7ff', viewport: '#fff1a0' };
const miniCanvas=document.getElementById('minimapCanvas'),miniCtx=miniCanvas.getContext('2d');
miniCanvas.width=C*MINIMAP.cell;miniCanvas.height=R*MINIMAP.cell;

// Caminho em curvas, de cima até a casa na parte inferior.
// Novo mapa: trilha em espiral com longas retas e curvas ao redor do vale.
// Modifique os pares [coluna, linha] para redesenhar a estrada.
const corners=[[-1,1],[26,1],[26,10],[2,10],[2,4],[22,4],[22,8],[7,8],[7,6],[17,6]];
const path=[];
for(let i=0;i<corners.length-1;i++){
  const [ax,ay]=corners[i],[bx,by]=corners[i+1];
  const n=Math.max(Math.abs(bx-ax),Math.abs(by-ay));
  for(let j=0;j<n;j++)path.push([ax+(bx-ax)*j/n,ay+(by-ay)*j/n]);
}path.push(corners.at(-1));
const pathCells=new Set(path.filter(([x,y])=>x>=0&&x<C&&y>=0&&y<R).map(([x,y])=>`${x},${y}`));
// Mesmas elipses utilizadas para desenhar os lagos no cenário.
const MAP_LAKES = [[13,2.7,2.5,.50],[12.8,9.25,2.1,.37],[24.4,6.2,.48,1.05]];
function isLakeTile(x,y){
  // Impede que a base da torre invada a água, inclusive nas margens.
  const cx=x+.5,cy=y+.5;
  return MAP_LAKES.some(([lx,ly,rx,ry])=>{
    const dx=Math.max(Math.abs(cx-lx)-.35,0);
    const dy=Math.max(Math.abs(cy-ly)-.35,0);
    return (dx*dx)/(rx*rx)+(dy*dy)/(ry*ry)<=1;
  });
}
let forestLayer=null,forestTile=0,pixelForestLayer=null;
let tile=48,dpr=1,selected=0,coins=5,leaks=0,spawned=0,killed=0,spawnTimer=0,active=false,finished=false,paused=false,lastTime=0;
const pauseButton=document.getElementById('pauseButton');
const pauseOverlay=document.getElementById('pauseOverlay');
function syncPauseButton(){pauseOverlay.hidden=!active||finished||!paused;pauseButton.hidden=!active||finished;pauseButton.textContent=paused?'▶ CONTINUAR':'⏸ PAUSAR';pauseButton.setAttribute('aria-label',paused?'Continuar jogo':'Pausar jogo');pauseButton.setAttribute('aria-pressed',String(paused));}
pauseButton.addEventListener('click',()=>{if(!active||finished)return;paused=!paused;if(paused)backgroundMusic.pause();else backgroundMusic.play().catch(()=>{});syncPauseButton();});
document.getElementById('continueButton').addEventListener('click',()=>{if(!active||finished)return;paused=false;backgroundMusic.play().catch(()=>{});syncPauseButton();});
let goblins=[],towers=[],bullets=[],particles=[],grass=[],toastTimer;
let bossPhase="normal",bossWait=0,bossSpawned=0,bossKilled=0;
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
function shopRender(){shop.innerHTML='';CONFIG.defenders.forEach((u,i)=>{const b=document.createElement('button');const placed=towers.filter(t=>t.type===i).length;const limit=CONFIG.towerLimits[i];b.className=`unit ${selected===i?'selected':''} ${coins<u.cost?'unaffordable':''} ${placed>=limit?'limit-reached':''}`;b.setAttribute('aria-disabled',placed>=limit?'true':'false');b.innerHTML=`${placed>=limit?'<span class="limit-x" aria-label="Limite atingido">✕</span>':''}<span class="emoji"><canvas class="house-preview" width="48" height="48" data-house="${i}"></canvas></span><span class="name">${u.name}${Number.isFinite(limit)?` (${placed}/${limit})`:''}</span><span class="price" aria-label="Custa ${u.cost} moedas">🪙${u.cost}</span>`;b.onclick=()=>{if(placed>=limit){showToast(`Limite de ${limit} torres atingido!`);return;}selected=i;shopRender();showToast(`${u.name} selecionado`)};shop.appendChild(b);drawShopHouse(b.querySelector('canvas'),i)})}
function hud(){coinsEl.textContent=`🪙 ${coins}`;waveEl.textContent=bossPhase==="normal"?`👹 ${spawned}/${CONFIG.totalGoblins}`:bossPhase==="waiting"?`⏳ CHEFES EM ${Math.ceil(bossWait)}s`:`👑 ${bossKilled}/${CONFIG.bosses.count} CHEFES`;livesEl.textContent=`❤️ ${Math.max(0,CONFIG.maxLeaks-leaks)}/${CONFIG.maxLeaks}`;shopRender()}
function showToast(s){toastEl.textContent=s;toastEl.classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>toastEl.classList.remove('visible'),1300)}

// Sons do Level 2: substitua os MP3 na pasta audio para personalizar.
const AUDIO_FILES={music:'audio/musica.mp3',death:'audio/morte-goblin.mp3',towers:[1,2,3,4].map(n=>`audio/torre-${n}.mp3`)};
const backgroundMusic=new Audio(AUDIO_FILES.music);
backgroundMusic.loop=true;backgroundMusic.volume=.24;
let audioCtx=null,lastDeathSound=0;
function contextAudio(){try{audioCtx??=new (window.AudioContext||window.webkitAudioContext)();if(audioCtx.state==='suspended')audioCtx.resume();return audioCtx}catch{return null}}
function note(f,t,d,v=.10,type='triangle'){const a=contextAudio();if(!a)return;const o=a.createOscillator(),g=a.createGain();o.type=type;o.frequency.setValueAtTime(f,t);g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(Math.max(.0002,v),t+.02);g.gain.exponentialRampToValueAtTime(.0001,t+d);o.connect(g).connect(a.destination);o.start(t);o.stop(t+d+.01)}
function trumpet(){const a=contextAudio();if(!a)return;const t=a.currentTime+.03;[392,523.25,659.25,783.99].forEach((f,i)=>note(f,t+i*.22,.32,.10,'sawtooth'))}
function lossSound(){const a=contextAudio();if(!a)return;const t=a.currentTime+.02;[392,349.23,293.66,220,164.81].forEach((f,i)=>note(f,t+i*.12,.24,.10,'sine'))}
function applause(){const a=contextAudio();if(!a)return;const t=a.currentTime;for(let i=0;i<30;i++){const len=.035,b=a.createBuffer(1,Math.ceil(a.sampleRate*len),a.sampleRate),data=b.getChannelData(0);for(let j=0;j<data.length;j++)data[j]=(Math.random()*2-1)*(1-j/data.length);const src=a.createBufferSource(),gain=a.createGain();src.buffer=b;gain.gain.value=.08;src.connect(gain).connect(a.destination);src.start(t+i*.05+Math.random()*.02)}}
function towerPlacementSound(){const a=contextAudio();if(!a)return;const t=a.currentTime+.005;note(440,t,.085,.095);note(659.25,t+.065,.12,.085)}
const deathSoundPool=Array.from({length:5},()=>{const a=new Audio(AUDIO_FILES.death);a.preload='auto';a.volume=.5;return a});
let deathSoundIndex=0;
function goblinDeathSound(){const now=performance.now();if(now-lastDeathSound<90)return;lastDeathSound=now;const snd=deathSoundPool[deathSoundIndex];deathSoundIndex=(deathSoundIndex+1)%deathSoundPool.length;try{snd.pause();snd.currentTime=0;snd.play().catch(()=>{})}catch{}}
const towerSoundPools=AUDIO_FILES.towers.map(file=>Array.from({length:4},()=>{const a=new Audio(file);a.preload='auto';a.volume=.38;return a}));
const towerSoundIndex=[0,0,0,0];
function towerShootSound(type){const pool=towerSoundPools[type];if(!pool)return;const i=towerSoundIndex[type];const a=pool[i];towerSoundIndex[type]=(i+1)%pool.length;try{a.pause();a.currentTime=0;a.play().catch(()=>{})}catch{}}
function stopTowerSounds(){for(const pool of towerSoundPools)for(const a of pool){a.pause();a.currentTime=0}}
function stopMusic(){backgroundMusic.pause();backgroundMusic.currentTime=0}

function start(){contextAudio();trumpet();stopMusic();stopTowerSounds();backgroundMusic.play().catch(()=>{});document.getElementById('towerTip').hidden=true;document.getElementById('home').hidden=false;document.getElementById('start').textContent='▶ COMEÇAR JOGO';selectedTower=null;coins=CONFIG.startingCoins;leaks=0;spawned=0;killed=0;spawnTimer=0;bossPhase="normal";bossWait=0;bossSpawned=0;bossKilled=0;goblins=[];towers=[];bullets=[];particles=[];selected=0;active=true;finished=false;paused=false;overlay.classList.add('hidden');syncPauseButton();hud()}
function end(win){stopMusic();stopTowerSounds();if(win)applause();else lossSound();document.getElementById('towerTip').hidden=true;active=false;finished=true;paused=false;syncPauseButton();modalIcon.textContent=win?'🏆':'💀';modalTitle.textContent=win?'QUE BELA VITÓRIA!':'GAME OVER';modalText.textContent=win?`Você venceu os 200 goblins e os 3 chefes! ${CONFIG.maxLeaks-leaks} vidas restantes.`:bossPhase==='bosses'?`Um chefe chegou ao castelo! Você derrotou ${bossKilled} dos 3 chefes.`:`Os goblins chegaram ao castelo. Você derrotou ${killed} inimigos. Tente outra estratégia!`;document.getElementById('start').textContent='↻ REINICIAR';document.getElementById('home').hidden=false;overlay.classList.remove('hidden')}
document.getElementById('start').addEventListener('click',start);
function voltarParaMapa(){
  // Os dois botões (VOLTAR PARA O MAPA e DESISTIR) usam o mesmo destino.
  // Se a fase foi aberta a partir do mapa, retorna para essa página.
  // Caso contrário, usa o endereço configurado em PAGINA_MAPA.
  try {
    const anterior = document.referrer ? new URL(document.referrer) : null;
    if (anterior && anterior.origin === location.origin &&
        /(?:mapa|levels?)(?:\/|[-_.]|$)/i.test(anterior.pathname) &&
        window.history.length > 1) {
      window.location.replace(anterior.href);
      return;
    }
  } catch (e) {}
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
    speed:g.baseSpeed*Math.pow(g.speedMultiplier,speedLevel)
  };
}
function spawnGroup(){
  const rule=CONFIG.spawnGroups.find(r=>spawned<r.until) || CONFIG.spawnGroups.at(-1);
  const slots=Math.max(0,CONFIG.maxGoblinsOnMap-goblins.filter(g=>!g.dead&&!g.boss).length);
  if(slots===0)return 0.25; // aguarda liberar espaço sem exceder 50 inimigos
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
  if(bossPhase==="waiting"){
    bossWait=Math.max(0,bossWait-dt);
    if(bossWait<=0){
      bossPhase="bosses";
      for(let i=0;i<CONFIG.bosses.count;i++){
        const hp=CONFIG.bosses.hitsToKill;
        goblins.push({pos:-i*CONFIG.bosses.spawnSpacing,hp,maxHp:hp,speed:CONFIG.bosses.speed,wiggle:Math.random()*6.28,boss:true});
        bossSpawned++;
      }
      showToast('👑 OS TRÊS CHEFES CHEGARAM!');
    }
    hud();
  }
  spawnTimer-=dt;
  if(bossPhase==="normal"&&spawned<CONFIG.totalGoblins&&spawnTimer<=0){
    spawnTimer=spawnGroup();
  }
  for(const g of goblins){g.pos+=g.speed*dt;if(g.pos>=path.length-1){g.dead=true;leaks++;burst(27.5,5.5,'#ff6e65',12);if(g.boss||leaks>=CONFIG.maxLeaks){hud();end(false);return}hud()}}
  goblins=goblins.filter(g=>!g.dead);
  for(const t of towers){t.cool-=dt;if(t.cool>0)continue;const u=CONFIG.defenders[t.type];let target=null,best=-1;for(const g of goblins){if(g.pos<0)continue;const p=posAt(g.pos),dist=Math.hypot(p.x-(t.x+.5),p.y-(t.y+.5));if(dist<=u.range&&g.pos>best){best=g.pos;target=g}}if(target){t.cool=u.fireInterval;towerShootSound(t.type);bullets.push({x:t.x+.5,y:t.y+.5,target,damage:u.damage,color:u.bulletColor,speed:13})}}
  for(const b of bullets){if(b.dead)continue;if(b.target.dead||!goblins.includes(b.target)){b.dead=true;continue}const p=posAt(b.target.pos),dx=p.x-b.x,dy=p.y-b.y,d=Math.hypot(dx,dy),step=b.speed*dt;if(d<step+.18){b.dead=true;b.target.hp-=b.target.boss?1:b.damage;burst(p.x,p.y,b.color,3);if(b.target.hp<=0&&!b.target.dead){goblinDeathSound();b.target.dead=true;if(b.target.boss){bossKilled++;for(const outro of goblins){if(outro.boss&&!outro.dead)outro.speed*=CONFIG.bosses.speedBoostPerDeath;}showToast(`👑 Chefe derrotado! Os restantes ficaram mais rápidos!`);}else{ killed++;if(killed%2===0)coins++; }burst(p.x,p.y,'#b7e06e',10);hud()}}else{b.x+=dx/d*step;b.y+=dy/d*step}}
  bullets=bullets.filter(b=>!b.dead);goblins=goblins.filter(g=>!g.dead);
  for(const p of particles){p.x+=p.vx*dt;p.y+=p.vy*dt;p.life-=dt}particles=particles.filter(p=>p.life>0);
  if(bossPhase==="normal"&&spawned===CONFIG.totalGoblins&&goblins.length===0){bossPhase="waiting";bossWait=CONFIG.bosses.waitSeconds;showToast('👑 Chefes chegando em 7 segundos!');hud()}
  if(bossPhase==="bosses"&&bossKilled===CONFIG.bosses.count&&goblins.length===0)end(true)
}
function drawMinimap(){
  const m=MINIMAP.cell, mc=miniCtx;
  mc.clearRect(0,0,miniCanvas.width,miniCanvas.height);
  mc.fillStyle=MINIMAP.grass;mc.fillRect(0,0,C*m,R*m);
  mc.fillStyle=MINIMAP.road;
  for(const [x,y] of path){if(x>=0&&x<C&&y>=0&&y<R)mc.fillRect(x*m,y*m,m,m)}
  mc.fillStyle='#272e39';mc.fillRect(0,1*m,m,m);
  mc.fillStyle='#f8df8c';mc.fillRect(17*m,6*m,m,m);
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
const FOREST={roadWidth:.78,treeDensity:280,shrubDensity:1100,seed:92814};
function seeded(seed){return ()=>{seed=(Math.imul(1664525,seed)+1013904223)|0;return (seed>>>0)/4294967296}}
function forestBackground(){
 if(forestLayer&&forestTile===tile)return forestLayer;
 forestTile=tile;const w=C*tile,h=R*tile;
 const layer=document.createElement('canvas');layer.width=Math.ceil(w);layer.height=Math.ceil(h);
 const c=layer.getContext('2d');const rand=seeded(FOREST.seed);
 const base=c.createLinearGradient(0,0,w,h);base.addColorStop(0,'#526c45');base.addColorStop(.5,'#3c604c');base.addColorStop(1,'#223e3d');c.fillStyle=base;c.fillRect(0,0,w,h);
 // Manchas de vegetação, musgo, folhas e sombras naturais.
 for(let i=0;i<3200;i++){
   const x=rand()*w,y=rand()*h,r=(.05+rand()*.45)*tile;
   c.fillStyle=['#82934d','#b6a26a','#2d6055','#8e9658','#557d5c'][Math.floor(rand()*5)];c.globalAlpha=.09+rand()*.19;
   c.beginPath();c.ellipse(x,y,r,r*(.3+rand()*.5),rand()*6.28,0,Math.PI*2);c.fill();
 }c.globalAlpha=1;
 // Lagos de montanha e pedras: nova ambientação para o mapa espiral.
 for(const [lx,ly,rx,ry] of MAP_LAKES){
   c.fillStyle='#223e3e';c.beginPath();c.ellipse(lx*tile,ly*tile,rx*tile,ry*tile,0,0,Math.PI*2);c.fill();
   c.fillStyle='#387a7b';c.beginPath();c.ellipse(lx*tile,ly*tile,rx*tile*.90,ry*tile*.77,0,0,Math.PI*2);c.fill();
   c.strokeStyle='#89a99b';c.lineWidth=tile*.045;c.beginPath();c.ellipse(lx*tile,ly*tile,rx*tile*.70,ry*tile*.47,0,0,Math.PI*2);c.stroke();
 }
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
  const green=t.hue<.3?'#2c6653':t.hue<.65?'#748f4c':'#b18c43';
  for(const [dx,dy,rr,col] of [[-.42,-.13,.72,'#254c30'],[.38,-.16,.68,green],[0,-.48,.8,green],[-.25,-.67,.43,'#c5b06b']]){
   c.fillStyle=col;c.beginPath();c.arc(x+dx*r,y-height+dy*r,r*rr,0,Math.PI*2);c.fill();
  }
  c.fillStyle='rgba(215,255,186,.17)';c.beginPath();c.arc(x-r*.24,y-height-r*.56,r*.3,0,Math.PI*2);c.fill();
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
function sprite(name,x,y,size){const art=SPRITES[name],unit=size/Math.max(...art.map(r=>r.length));ctx.save();ctx.translate(Math.round(x-size/2),Math.round(y-size/2));for(let row=0;row<art.length;row++)for(let col=0;col<art[row].length;col++){const c=art[row][col];if(PALETTE[c]){ctx.fillStyle=PALETTE[c];ctx.fillRect(Math.round(col*unit),Math.round(row*unit),Math.ceil(unit),Math.ceil(unit));}}ctx.restore()}

// Quatro torres arqueiras medievais em pixel art.
// Torres de arqueiros em pixel art: quatro níveis, com arqueiros visíveis no topo.
const HOUSE_ART=[
 ["......DDDD......",".....DWWD......","....DWRRWD......","...DDWRRWDD.....","...DWWWWWWD.....","..DDDDDDDDDD....","..DSSSSSSSSD....","..DSSKSSKSSD....","..DSSSSSSSSD....","..DWWWWWWWWD....","..DWWWWWWWWD....","..DWWDDWWWWD....","..DWWDDWWWWD....","..DWWDDWWWWD....","..DWWDDWWWWD....","..BBBBBBBBBB...."],
 ["...CC....CC.....","...CCCCCCCC.....","...CDWWWWDC.....","...CDWRR WDC.....".replace(' ',''),"...CDWRRWDC.....","..CCDDDDDDCC....","..CYYSSSSYYC....","..CSSKSSKSSC....","..CSSSSSSSSC....","..CWWWWWWWWC....","..CWWWWWWWWC....","..CWWDDWWWWC....","..CWWDDWWWWC....","..CWWDDWWWWC....","..CWWDDWWWWC....","..BBBBBBBBBB...."],
 ["..CC..CC..CC....","..CCCCCCCCCC....","..CWWWWWWWWC....","..CWDRRRR DWC...".replace(' ',''),"..CWDRRRRDWC....","..CCDDDDDDCC....","..CYYSSSSYYC....","..CSSKSSKSSC....","..CSSSSSSSSC....","..CWWWWWWWWC....","..CWWWWWWWWC....","..CWWDDWWWWC....","..CWWDDWWWWC....","..CWWDDWWWWC....","..CWWDDWWWWC....","..BBBBBBBBBB...."],
 ["..CC..CC..CC....","..CCCCCCCCCC....","..CYYYYYYYYC....","..CYDRRRRDYC....","..CYDRRRRDYC....","..CCDDDDDDCC....","..CYYSSSSYYC....","..CSSKSSKSSC....","..CSSSSSSSSC....","..CWWWWWWWWC....","..CWWWWWWWWC....","..CWWDDWWWWC....","..CWWDDWWWWC....","..CWWDDWWWWC....","..CWWDDWWWWC....","..BBBBBBBBBB...."]
];
const HOUSE_PALETTE={D:'#50372b',W:'#b5a38b',S:'#e4b781',K:'#26262b',B:'#4b4d51',R:'#b63831',C:'#757d88',Y:'#e6c65a'};
function renderHouse(c,art,x,y,size){const n=art.length,px=size/n;c.save();c.translate(Math.round(x-size/2),Math.round(y-size/2));for(let j=0;j<n;j++)for(let i=0;i<art[j].length;i++){const color=HOUSE_PALETTE[art[j][i]];if(color){c.fillStyle=color;c.fillRect(Math.round(i*px),Math.round(j*px),Math.ceil(px),Math.ceil(px));}}c.restore()}
function drawShopHouse(canvas,type){if(!canvas)return;const c=canvas.getContext('2d');c.imageSmoothingEnabled=false;c.clearRect(0,0,48,48);renderHouse(c,HOUSE_ART[type],24,24,44)}
function pixelForest(){if(pixelForestLayer)return pixelForestLayer;const original=forestBackground();const out=document.createElement('canvas');const step=5;out.width=Math.ceil(original.width/step);out.height=Math.ceil(original.height/step);const oc=out.getContext('2d');oc.imageSmoothingEnabled=true;oc.drawImage(original,0,0,out.width,out.height);pixelForestLayer=out;return out}
function pixelEllipse(x,y,rx,ry,color){ctx.fillStyle=color;const step=Math.max(3,Math.round(tile*.085));for(let dy=-ry;dy<=ry;dy+=step)for(let dx=-rx;dx<=rx;dx+=step)if(dx*dx/(rx*rx)+dy*dy/(ry*ry)<=1)ctx.fillRect(Math.round(x+dx),Math.round(y+dy),step,step)}
function draw(time){
 const w=C*tile,h=R*tile;ctx.imageSmoothingEnabled=false;ctx.clearRect(0,0,w,h);
 ctx.drawImage(pixelForest(),0,0,w,h);
 const cx=17.5*tile,cy=6.5*tile;
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
  sprite('goblin',px,py-tile*.10+Math.round(Math.sin(time*12+g.wiggle)*2),tile*(g.boss?CONFIG.bosses.size:.69));
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
  if(isLakeTile(x,y)){showToast('Não é possível colocar torres nos lagos!');return;}
  if(towers.filter(t=>t.type===selected).length>=CONFIG.towerLimits[selected]){showToast(`Limite de ${CONFIG.towerLimits[selected]} torres deste tipo atingido!`);return;}
  if(coins<u.cost){showToast('Moedas insuficientes!');return;}
  towers.push({x,y,type:selected,cool:0});coins-=u.cost;hud();towerPlacementSound();burst(x+.5,y+.5,'#f5df8a',8);
});
// Toques fora do tabuleiro também fecham o botão de remoção.
document.addEventListener('pointerdown',e=>{
  if(e.target!==canvas)selectedTower=null;
});
// Limite de 60 FPS, minimapa a 10 FPS e pausa do desenho em abas ocultas.
let lastMiniFrame=0;
function frame(t){
 requestAnimationFrame(frame);
 if(document.hidden){lastTime=t;return;}
 const elapsed=t-lastTime;
 if(lastTime && elapsed<1000/60-1)return;
 const dt=Math.min(elapsed/1000||0,.05);
 lastTime=t;
 update(dt);
 draw(t/1000);
 if(t-lastMiniFrame>=100){drawMinimap();lastMiniFrame=t;}
}
document.addEventListener('visibilitychange',()=>{lastTime=performance.now()});
syncPauseButton();hud();requestAnimationFrame(frame);
