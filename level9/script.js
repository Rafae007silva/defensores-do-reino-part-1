// Configure aqui o caminho do mapa de fases.
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
  columns: 40, rows: 12, totalGoblins: 400, maxGoblinsOnMap: 40, startingCoins: 5,
  maxLeaks: 6, spawnInterval: 1.55,
  // Quantos goblins saem juntos e a pausa entre os grupos (segundos).
  // 1–80: de 2 em 2; 81–120: de 3 em 3; 121–200: de 3 em 3,
  // com intervalos cada vez menores conforme eles ficam mais rápidos.
  spawnGroups: [
    { until: 80, count: 2, interval: 1.35 },
    { until: 120, count: 3, interval: 0.95 },
    { until: 400, count: 3, interval: 0.60 }
  ],
  // No começo eles ficam afastados; conforme evoluem, se aproximam.
  groupSpacingStart: 3.4, // distância inicial em quadrados
  groupSpacingMin: 0.28,  // menor distância entre goblins
  spacingDecay: 0.90,    // aproximação suave após os primeiros 60 goblins
  intervalDecay: 0.97,   // reduz gradualmente a pausa após os primeiros 60 goblins
  spacingStartsAfter: 60, // só começam a se juntar após o goblin 60

  goblin: {
    baseHp: 20, baseSpeed: 0.84,
    // A cada aumento de velocidade (30 goblins), a vida aumenta em 1 tiro de Arqueiro.
    // Velocidade: 1–30 normal, depois +11% a cada 30 goblins (cumulativo).
    goblinsPerLevel: 30, // vida acompanha o aumento de velocidade
    goblinsPerSpeedLevel: 30, // velocidade: +11% a cada 30 goblins
    speedMultiplier: 1.025, // +2,5% a cada 30 goblins: aumento leve e gradual
    extraHpPerLevel: 5     // +5 HP por etapa: goblins terrestres ficam gradualmente mais resistentes

  },
  towerLimits: [9, 8, 8, 7, 7, 6],
  defenders: [
    { name:'Torre Arqueira I', emoji:'🏹', cost:2, damage:6, range:3, fireInterval:0.85, bulletColor:'#ffe47b' },
    { name:'Torre Arqueira II', emoji:'🧙', cost:5, damage:8, range:3, fireInterval:0.8, bulletColor:'#8dd6ff' },
    { name:'Torre Arqueira III', emoji:'⚔️', cost:7, damage:10, range:3, fireInterval:0.75, bulletColor:'#c7c4ff' },
    { name:'Torre Arqueira IV', emoji:'🐉', cost:11, damage:15, range:3, fireInterval:0.7, bulletColor:'#ff8453' },
    { name:'Torre de Gelo', emoji:'❄️', cost:13, damage:38, range:3.4, fireInterval:2.1, bulletColor:'#80e8ff', splash:2, slowSeconds:3.5, slowFactor:0.48 },
    { name:'X-Besta', emoji:'🏹', cost:8, damage:1, range:11, minRange:0, fireInterval:0.75, bulletColor:'#ffe7a2', siegeOnly:true }
  ]
};
// Com 20 HP iniciais, os defensores precisam de 5, 4, 3 e 2 tiros.
// A cada aceleração, +4 HP equivalem a +1 tiro do Arqueiro (dano 4).

const canvas=document.getElementById('board'),ctx=canvas.getContext('2d');
const arena=document.querySelector('.arena'),shop=document.getElementById('shop');
const coinsEl=document.getElementById('coins'),waveEl=document.getElementById('wave'),livesEl=document.getElementById('lives');
const overlay=document.getElementById('overlay'),modalTitle=document.getElementById('modalTitle'),modalText=document.getElementById('modalText'),modalIcon=document.getElementById('modalIcon');
// Avisos flutuantes superiores desativados a pedido do jogador.
const C=CONFIG.columns,R=CONFIG.rows;
// MINIMAPA: ajuste estas opções para personalizar cores e tamanho lógico.
const MINIMAP = { cell: 10, grass: '#d8ebf2', road: '#8aafc6', goblin: '#ff5353', tower: '#6cc7ff', viewport: '#fff1a0' };
const miniCanvas=document.getElementById('minimapCanvas'),miniCtx=miniCanvas.getContext('2d');
miniCanvas.width=C*MINIMAP.cell;miniCanvas.height=R*MINIMAP.cell;

// LEVEL 9 — uma única entrada à esquerda e uma estrada longa e sinuosa até o castelo.
// O caminho passa por toda a região nevada antes de alcançar o castelo.
const corners=[[-1,9],[3,9],[3,3],[8,3],[8,10],[14,10],[14,5],[19,5],[19,9],[26,9],[26,3],[33,3],[33,7],[38,7],[38,1],[20,1]];
function buildPath(points){const result=[];for(let i=0;i<points.length-1;i++){const [ax,ay]=points[i],[bx,by]=points[i+1],n=Math.max(Math.abs(bx-ax),Math.abs(by-ay));for(let j=0;j<n;j++)result.push([ax+(bx-ax)*j/n,ay+(by-ay)*j/n])}result.push(points.at(-1));return result}
const path=buildPath(corners);
const paths=[path];
const CASTLE_X=20.5,CASTLE_Y=1.5;
const pathCells=new Set(paths.flat().filter(([x,y])=>x>=0&&x<C&&y>=0&&y<R).map(([x,y])=>`${x},${y}`));
let forestLayer=null,forestTile=0,pixelForestLayer=null;
let tile=48,dpr=1,selected=0,coins=5,leaks=0,spawned=0,killed=0,spawnTimer=0,active=false,finished=false,paused=false,lastTime=0;
const pauseButton=document.getElementById("pauseButton");
const pauseOverlay=document.getElementById("pauseOverlay");
function syncPauseButton(){pauseOverlay.hidden=!active||finished||!paused;pauseButton.hidden=!active||finished;pauseButton.textContent=paused?"⏸ PAUSADO":"⏸ PAUSAR";pauseButton.setAttribute("aria-label",paused?"Continuar jogo":"Pausar jogo");pauseButton.setAttribute("aria-pressed",String(paused));}
pauseButton.addEventListener("click",()=>{if(!active||finished||paused)return;paused=true;if(paused)backgroundMusic.pause();else backgroundMusic.play().catch(()=>{});syncPauseButton();});
// Level 9 sem goblins explosivos: nenhuma torre é destruída por sabotadores.
let bombers=[],towerExplosionMarks=[];
function resetBombers(){bombers=[];towerExplosionMarks=[];}
function updateBombers(dt){}
function drawBombers(time){}
let goblins=[],towers=[],bullets=[],particles=[],grass=[];
// Evento aéreo: goblins montados em pequenos dinossauros voadores.
// Apenas X-Bestas atingem estes inimigos. Começam com 4 acertos e ganham resistência ao longo da fase.
const SIEGE_TOTAL=40;
let siegeGoblins=[],siegeStones=[],siegeSpawned=0,siegeNext=0,siegeWaves=[],siegeWaveIndex=0;
// Quarenta voadores em 21 eventos aleatórios: 6 sozinhos, 11 duplas e 4 trios.
// Os eventos começam depois de 100 goblins; os trios aparecem na reta final.
function resetSiege(){
 siegeGoblins=[];siegeStones=[];siegeSpawned=0;siegeWaveIndex=0;
 siegeWaves=[];
 const stages=[{start:105,end:169,count:6,size:1},{start:175,end:298,count:11,size:2},{start:310,end:388,count:4,size:3}];
 for(const stage of stages){
  const width=(stage.end-stage.start)/stage.count;
  for(let i=0;i<stage.count;i++){
   const at=Math.round(stage.start+width*(i+.18+Math.random()*.64));
   siegeWaves.push({at,count:stage.size});
  }
 }
 siegeNext=siegeWaves[0].at;
}
function spawnSiege(){
 if(!towers.length)return false;
 const target=towers[Math.floor(Math.random()*towers.length)];
 const side=Math.random()<.5?-1:C+1;
 const y=Math.max(1,Math.min(R-2,target.y+(Math.random()-.5)*3));
 const flyingHp=4+Math.min(4,Math.floor(Math.max(0,spawned-100)/75)); // 4 a 8 tiros conforme a partida avança
 siegeGoblins.push({x:side,y,hp:flyingHp,maxHp:flyingHp,dead:false,wiggle:Math.random()*6.28,
   target,fromLeft:side<0,speed:(2.25+Math.random()*.5)*(1+Math.min(.55,Math.max(0,spawned-100)/300*.55)),cool:0,bombed:false});
 siegeSpawned++;
 showToast('🦖 Goblin voador! Só a X-Besta pode derrubá-lo!');return true;
}
function updateSiege(dt){
 if(siegeWaveIndex<siegeWaves.length&&spawned>=siegeWaves[siegeWaveIndex].at){
  const wave=siegeWaves[siegeWaveIndex];
  // Um mesmo evento pode trazer dois ou três voadores ao mesmo tempo.
  if(towers.length){
   for(let n=0;n<wave.count&&siegeSpawned<SIEGE_TOTAL;n++)spawnSiege();
   siegeWaveIndex++;
   siegeNext=siegeWaveIndex<siegeWaves.length?siegeWaves[siegeWaveIndex].at:Infinity;
  }
 }
 for(const enemy of siegeGoblins){
  if(enemy.dead)continue;
  // Cada voador escolhe uma torre aleatória e segue em direção a ela.
  // Caso a torre seja removida antes da chegada, escolhe outra disponível.
  if(!enemy.bombed&&!towers.includes(enemy.target)){
   enemy.target=towers.length?towers[Math.floor(Math.random()*towers.length)]:null;
  }
  const target=enemy.target;
  if(!enemy.bombed&&target){
   const tx=target.x+.5,ty=target.y+.5;
   const dx=tx-enemy.x,dy=ty-enemy.y;
   const distance=Math.hypot(dx,dy);
   const step=enemy.speed*dt;
   if(distance<=Math.max(.55,step)){
    // A bomba é lançada exatamente sobre a torre escolhida.
    siegeStones.push({x:enemy.x,y:enemy.y,target,speed:8.5,dead:false});
    enemy.bombed=true;
   }else{
    enemy.x+=dx/distance*step;
    enemy.y+=dy/distance*step;
   }
  }else{
   // Depois de lançar a bomba, o dinossauro continua voando e sai do mapa.
   enemy.x+=(enemy.fromLeft?1:-1)*enemy.speed*dt;
   enemy.y+=Math.sin(elapsedGame*3+enemy.wiggle)*dt*.12;
  }
  if(enemy.x< -2||enemy.x>C+2||enemy.y< -2||enemy.y>R+2)enemy.dead=true;
 }
 for(const bomb of siegeStones){
  if(bomb.dead)continue;
  if(!towers.includes(bomb.target)){bomb.dead=true;continue}
  const dx=bomb.target.x+.5-bomb.x,dy=bomb.target.y+.5-bomb.y,d=Math.hypot(dx,dy),step=bomb.speed*dt;
  if(d<=step+.15){
   bomb.dead=true;const t=bomb.target;const i=towers.indexOf(t);
   if(i>=0){towers.splice(i,1);if(selectedTower===t)selectedTower=null;
    burst(t.x+.5,t.y+.5,'#ff8c35',28);
    towerExplosionMarks.push({x:t.x+.5,y:t.y+.5,until:elapsedGame+.7});hud()}
  }else if(d>0){bomb.x+=dx/d*step;bomb.y+=dy/d*step}
 }
 siegeStones=siegeStones.filter(b=>!b.dead);
 siegeGoblins=siegeGoblins.filter(e=>!e.dead);
}

let bossPhase="normal",bossWait=0,bossSpawned=0,bossKilled=0;
// Seis penas por partida: cinco eventos aleatórios depois de 150 goblins e um durante os ogros.
// Clique na pena ENQUANTO CAI para escolher diretamente o chão onde lançar a magia.
let featherDrop=null, featherMode=false, freezeZones=[], featherEvents=0, featherNext=0, finalFeatherTriggered=false;
const FEATHER_TOTAL=6, OGRE_COUNT=0, OGRE_HP=4000, FREEZE_RADIUS=2, FREEZE_SECONDS=5;
const featherButton=document.getElementById('featherButton');
if(featherButton)featherButton.remove();
function scheduleFeathers(){
  // 5 aparições espaçadas, em momentos diferentes a cada nova partida.
  featherNext=150+Math.floor(Math.random()*22);
}
function launchFeather(){
  if(featherDrop||featherMode||featherEvents>=FEATHER_TOTAL)return false;
  featherEvents++;
  featherDrop={x:2+Math.random()*(C-4),y:-.8,speed:0.95+Math.random()*.30};
  showToast(`🪶 PENA ${featherEvents}/${FEATHER_TOTAL}! Clique antes que saia do mapa!`);
  return true;
}
let runnerStage=0,runnerSpawned=0,runnerKilled=0, runnersCompleted=0, elapsedGame=0; // 3 ondas de 20 corredores
// Defensor selecionado para mostrar o botão vermelho de remoção.
let selectedTower=null;
// Posição da prévia de alcance antes de instalar a X-Besta.
let xbestaPreview=null;
const random=(a,b)=>a+Math.random()*(b-a);
for(let i=0;i<110;i++)grass.push({x:Math.random()*C,y:Math.random()*R,s:random(.04,.14),a:random(.15,.4)});

function resize(){const rect=arena.getBoundingClientRect();
  // No celular, mantenha o mapa grande e permita arrastar horizontalmente.
  // No notebook, encaixe o mapa na área disponível quando possível.
  tile=Math.max(1,rect.width/C,rect.height/R);
  const w=C*tile,h=R*tile;dpr=Math.min(devicePixelRatio||1,1.5);canvas.style.width=`${w}px`;canvas.style.height=`${h}px`;canvas.style.marginTop=`0px`;canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);forestLayer=null;pixelForestLayer=null}
new ResizeObserver(resize).observe(arena);resize();
function shopRender(){shop.innerHTML='';CONFIG.defenders.forEach((u,i)=>{const b=document.createElement('button');const placed=towers.filter(t=>t.type===i).length;const limit=CONFIG.towerLimits[i];b.className=`unit ${selected===i?'selected':''} ${coins<u.cost?'unaffordable':''} ${placed>=limit?'limit-reached':''}`;b.setAttribute('aria-disabled',placed>=limit?'true':'false');b.innerHTML=`${placed>=limit?'<span class="limit-x" aria-label="Limite atingido">✕</span>':''}<span class="emoji"><canvas class="house-preview" width="48" height="48" data-house="${i}"></canvas></span><span class="name">${u.name} (${placed}/${limit})</span><span class="price" aria-label="Custa ${u.cost} moedas">🪙${u.cost}</span>`;b.onclick=()=>{if(placed>=limit){showToast(`Limite de ${limit} torres atingido!`);return;}selected=i;xbestaPreview=null;shopRender();showToast(`${u.name} selecionado`)};shop.appendChild(b);drawShopHouse(b.querySelector('canvas'),i)})}
function hud(){
  const total=Math.min(400,spawned);
  waveEl.textContent=`👹 ${total}/400`;
  livesEl.textContent=`❤️ ${Math.max(0,CONFIG.maxLeaks-leaks)}/${CONFIG.maxLeaks}`;
  coinsEl.textContent=`🪙 ${coins}`;shopRender();
}
function showToast(s){} // Sem mensagens no topo do jogo.
// Sons do Level 9: substitua os MP3 na pasta audio para personalizar.
const AUDIO_FILES={music:'audio/musica.mp3',death:'audio/morte-goblin.mp3',towers:[1,2,3,4,5].map(n=>`audio/torre-${n}.mp3`)};
const backgroundMusic=new Audio(AUDIO_FILES.music);
backgroundMusic.loop=true;backgroundMusic.volume=.24;
let audioCtx=null,lastDeathSound=0;
function contextAudio(){try{audioCtx??=new (window.AudioContext||window.webkitAudioContext)();if(audioCtx.state==='suspended')audioCtx.resume();return audioCtx}catch{return null}}
function note(f,t,d,v=.10,type='triangle'){const a=contextAudio();if(!a)return;const o=a.createOscillator(),g=a.createGain();o.type=type;o.frequency.setValueAtTime(f,t);g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(Math.max(.0002,v),t+.02);g.gain.exponentialRampToValueAtTime(.0001,t+d);o.connect(g).connect(a.destination);o.start(t);o.stop(t+d+.01)}
function trumpet(){const a=contextAudio();if(!a)return;const t=a.currentTime+.03;[392,523.25,659.25,783.99].forEach((f,i)=>note(f,t+i*.22,.32,.10,'sawtooth'))}
function lossSound(){const a=contextAudio();if(!a)return;const t=a.currentTime+.02;[392,349.23,293.66,220,164.81].forEach((f,i)=>note(f,t+i*.12,.24,.10,'sine'))}
function applause(){const a=contextAudio();if(!a)return;const t=a.currentTime;for(let i=0;i<30;i++){const len=.035,b=a.createBuffer(1,Math.ceil(a.sampleRate*len),a.sampleRate),data=b.getChannelData(0);for(let j=0;j<data.length;j++)data[j]=(Math.random()*2-1)*(1-j/data.length);const src=a.createBufferSource(),gain=a.createGain();src.buffer=b;gain.gain.value=.08;src.connect(gain).connect(a.destination);src.start(t+i*.05+Math.random()*.02)}}
function towerPlacementSound(){const a=contextAudio();if(!a)return;const t=a.currentTime+.005;note(440,t,.085,.095);note(659.25,t+.065,.12,.085)}
function goblinDeathSound(){const now=performance.now();if(now-lastDeathSound<90)return;lastDeathSound=now;const snd=new Audio(AUDIO_FILES.death);snd.volume=.5;snd.play().catch(()=>{});snd.addEventListener('ended',()=>{snd.src=''}, {once:true})}
const towerSoundPools=AUDIO_FILES.towers.map(file=>Array.from({length:4},()=>{const a=new Audio(file);a.preload='auto';a.volume=.38;return a}));
const towerSoundIndex=[0,0,0,0,0];
function towerShootSound(type){const pool=towerSoundPools[type];if(!pool)return;const i=towerSoundIndex[type];const a=pool[i];towerSoundIndex[type]=(i+1)%pool.length;try{a.pause();a.currentTime=0;a.play().catch(()=>{})}catch{}}
function stopTowerSounds(){for(const pool of towerSoundPools)for(const a of pool){a.pause();a.currentTime=0}}
function stopMusic(){backgroundMusic.pause();backgroundMusic.currentTime=0}

// Torres 3, 4 e 5 evoluem automaticamente conforme os goblins ganham vida.
// A cada 60 goblins surgidos, elas recebem mais dano. Torres 1 e 2 não mudam.
function damageDaTorre(tipo){
  const base=CONFIG.defenders[tipo].damage;
  const bonusPorEtapa=[0,0,2,3,4,0];
  const etapa=Math.floor(Math.min(spawned,CONFIG.totalGoblins)/60);
  return base+etapa*bonusPorEtapa[tipo];
}
// LEVEL 9 — Cavalo de Troia: evento único após 150 goblins normais.
const TROJAN_HP=200,TROJAN_WAIT=10,TROJAN_RUNNERS=10;
let trojanState='waiting',trojanWreck=null,trojanReleased=0;
function resetTrojan(){trojanState='waiting';trojanWreck=null;trojanReleased=0;}
function trojanDestroyed(g){
  trojanState='countdown';trojanWreck={lane:g.lane,pos:g.pos,timer:TROJAN_WAIT};
  burst(posAt(g.pos,g.lane).x,posAt(g.pos,g.lane).y,'#9b6942',20);
  showToast('🐴 Os empurradores caíram! O cavalo vai abrir em 10 segundos!');
}
function updateTrojan(dt){
  if(trojanState==='waiting'&&spawned>=150){
    const lane=0;
    goblins.push({trojan:true,lane,pos:-1,hp:TROJAN_HP,maxHp:TROJAN_HP,speed:.52,wiggle:0});
    trojanState='moving';showToast('🐴 Um cavalo de Troia se aproxima!');hud();
  }
  if(trojanState==='countdown'&&trojanWreck){
    trojanWreck.timer-=dt;
    if(trojanWreck.timer<=0){
      const {lane,pos}=trojanWreck,p=posAt(pos,lane);
      burst(p.x,p.y,'#ffb34a',35);
      // Libera 10 corredores, um atrás do outro, na mesma estrada.
      for(let i=0;i<TROJAN_RUNNERS;i++){
        const hp=13+Math.floor(spawned/60)*3;
        goblins.push({lane,pos:pos-i*.55,hp,maxHp:hp,speed:2.85,wiggle:Math.random()*6.28,runner:true});
      }
      trojanReleased=TROJAN_RUNNERS;trojanWreck=null;trojanState='done';
      showToast('💥 Cavalo destruído! 10 corredores escaparam!');hud();
    }
  }
}
function drawTrojanHorse(px,py,time,pushers){
  const u=tile;
  ctx.save();ctx.translate(px,py);
  // Cavalo de madeira com corpo, pescoço, cabeça e rodas.
  ctx.fillStyle='#463326';ctx.fillRect(-u*.77,u*.22,u*1.54,u*.12);
  ctx.fillStyle='#80512f';ctx.fillRect(-u*.69,-u*.45,u*1.20,u*.65);
  ctx.fillStyle='#b48249';ctx.fillRect(-u*.60,-u*.39,u*1.04,u*.47);
  ctx.fillStyle='#603e29';for(let i=-1;i<=2;i++)ctx.fillRect(i*u*.23-u*.13,-u*.40,u*.055,u*.45);
  ctx.fillStyle='#8b5c36';ctx.fillRect(u*.27,-u*.91,u*.25,u*.63);
  ctx.fillStyle='#b48249';ctx.fillRect(u*.33,-u*.96,u*.47,u*.32);
  ctx.fillStyle='#503726';ctx.fillRect(u*.63,-u*.86,u*.10,u*.10);
  ctx.fillStyle='#d9a865';ctx.beginPath();ctx.moveTo(u*.37,-u*.92);ctx.lineTo(u*.37,-u*1.19);ctx.lineTo(u*.51,-u*.94);ctx.fill();
  ctx.fillStyle='#68432d';ctx.fillRect(-u*.53,u*.12,u*.18,u*.30);ctx.fillRect(u*.26,u*.12,u*.18,u*.30);
  for(const x of [-.48,.42]){ctx.fillStyle='#3d3029';ctx.beginPath();ctx.arc(x*u,u*.35,u*.19,0,Math.PI*2);ctx.fill();ctx.fillStyle='#c99a55';ctx.beginPath();ctx.arc(x*u,u*.35,u*.07,0,Math.PI*2);ctx.fill();}
  if(pushers){
    // Dois goblins com casaco azul empurram, com pernas animadas.
    for(let i=0;i<2;i++){
      const x=(-1.18-i*.36)*u,y=(-.05+Math.sin(time*12+i*2)*.045)*u;
      ctx.fillStyle='#368448';ctx.beginPath();ctx.arc(x,y-u*.15,u*.15,0,Math.PI*2);ctx.fill();ctx.fillStyle='#3668b2';ctx.fillRect(x-u*.13,y-u*.03,u*.26,u*.28);ctx.fillStyle='#fff3d6';ctx.fillRect(x-u*.085,y-u*.18,u*.05,u*.05);ctx.fillRect(x+u*.035,y-u*.18,u*.05,u*.05);ctx.strokeStyle='#74212b';ctx.lineWidth=Math.max(2,u*.045);ctx.beginPath();ctx.moveTo(x-u*.06,y+u*.25);ctx.lineTo(x-u*.08+Math.sin(time*12+i)*u*.09,y+u*.39);ctx.moveTo(x+u*.06,y+u*.25);ctx.lineTo(x+u*.08-Math.sin(time*12+i)*u*.09,y+u*.39);ctx.stroke();
      ctx.strokeStyle='#5a9a60';ctx.lineWidth=Math.max(2,u*.06);ctx.beginPath();ctx.moveTo(x+u*.12,y);ctx.lineTo(-u*.70,y-u*.07);ctx.stroke();
    }
  }
  ctx.restore();
}
function start(){contextAudio();trumpet();stopMusic();stopTowerSounds();backgroundMusic.play().catch(()=>{});document.getElementById('towerTip').hidden=true;document.getElementById('home').hidden=false;document.getElementById('start').textContent='▶ COMEÇAR JOGO';selectedTower=null;xbestaPreview=null;coins=CONFIG.startingCoins;leaks=0;spawned=0;killed=0;spawnTimer=0;bossPhase="normal";bossWait=0;bossSpawned=0;bossKilled=0;featherDrop=null;featherMode=false;freezeZones=[];featherEvents=0;finalFeatherTriggered=false;scheduleFeathers();runnerStage=0;runnerSpawned=0;runnerKilled=0;runnersCompleted=0;elapsedGame=0;resetBombers();resetTrojan();resetSiege();goblins=[];towers=[];bullets=[];particles=[];selected=0;active=true;finished=false;paused=false;overlay.classList.add('hidden');syncPauseButton();hud()}
function end(win){if(win){try{const key='reino_levels_done';localStorage.setItem(key,String(Math.max(9,Number(localStorage.getItem(key))||0)));}catch(e){}}bombers=[];trojanState="done";stopMusic();stopTowerSounds();if(win)applause();else lossSound();document.getElementById('towerTip').hidden=true;active=false;finished=true;paused=false;syncPauseButton();modalIcon.textContent=win?'🏆':'💀';modalTitle.textContent=win?'QUE BELA VITÓRIA!':'GAME OVER';modalText.textContent=win?`Você venceu os 400 goblins e resistiu ao cavalo de Troia! ${CONFIG.maxLeaks-leaks} vidas restantes.`:`Os goblins chegaram ao castelo. Você derrotou ${killed} inimigos. Tente outra estratégia!`;document.getElementById('start').textContent='↻ REINICIAR';document.getElementById('home').hidden=false;overlay.classList.remove('hidden')}
// Inicia a partida imediatamente, sem cena de abertura.
// Introdução: X-Besta no chão girando e atirando nos dinossauros voadores.
// A simulação da partida só começa quando a animação termina.
const introX=document.getElementById('introX'),introXCanvas=document.getElementById('introXCanvas');
const introCtx=introXCanvas.getContext('2d');
let introActive=false,introRequest=0,introStartedAt=0,introLastShot=-1;
const INTRO_DURATION=4400;
function introFinish(){
 if(!introActive)return;
 introActive=false;cancelAnimationFrame(introRequest);introX.hidden=true;
 start();
}
function introFlyer(c,x,y,size,flap){
 c.save();c.translate(Math.round(x),Math.round(y));const p=size/18;
 const block=(a,b,w,h,color)=>{c.fillStyle=color;c.fillRect(Math.round(a*p),Math.round(b*p),Math.ceil(w*p),Math.ceil(h*p))};
 block(-13,-1+flap,9,3,'#4c8291');block(-12,-3+flap,7,2,'#7fb4c1');
 block(3,-2-flap,10,3,'#4c8291');block(5,-4-flap,7,2,'#7fb4c1');
 block(-7,0,14,6,'#4b8589');block(4,-4,5,6,'#56999a');block(8,-5,5,4,'#56999a');
 block(10,-4,2,2,'#b5d2ac');block(9,-4,1,1,'#172d34');
 block(-3,-9,7,6,'#6ebc51');block(-5,-7,2,2,'#6ebc51');block(3,-7,2,2,'#6ebc51');
 block(-1,-7,1,1,'#18282b');block(3,-7,1,1,'#18282b');block(-3,-3,7,4,'#765038');
 c.restore();
}
function drawIntroX(now){
 if(!introActive)return;
 const elapsed=now-introStartedAt,secs=elapsed/1000;
 const w=Math.max(320,window.innerWidth),h=Math.max(260,window.innerHeight),scale=Math.min(2,window.devicePixelRatio||1);
 const pw=Math.round(w*scale),ph=Math.round(h*scale);
 if(introXCanvas.width!==pw||introXCanvas.height!==ph){introXCanvas.width=pw;introXCanvas.height=ph}
 const c=introCtx;c.setTransform(scale,0,0,scale,0,0);c.imageSmoothingEnabled=false;
 c.fillStyle='#102c39';c.fillRect(0,0,w,h);
 // Céu, neve e montanhas em blocos pixelados.
 c.fillStyle='#1b4353';for(let i=0;i<13;i++){const xx=i*w/12,hh=28+(i*47%90);c.fillRect(xx,h*.58-hh,w/11,hh)}
 c.fillStyle='#b6d7e5';c.fillRect(0,h*.74,w,h*.26);c.fillStyle='#8db5c9';c.fillRect(0,h*.74,w,8);
 for(let i=0;i<36;i++){const xx=(i*137+29)%w,yy=(i*67+secs*38)%(h*.78);c.fillStyle=i%3?'#e0f1fa':'#b3d7e8';c.fillRect(Math.round(xx),Math.round(yy),3,3)}
 const tx=w*.28,ty=h*.73,sz=Math.min(w*.19,h*.30,150);
 c.fillStyle='#627b8a';c.fillRect(tx-sz*.34,ty-sz*.13,sz*.68,sz*.18);
 // A cabeça da X-Besta acompanha o dinossauro mais próximo.
 const flyers=[{x:w*(-.17+.33*secs),y:h*.31+Math.sin(secs*4)*12},{x:w*(-.48+.34*secs),y:h*.45+Math.sin(secs*5+2)*11},{x:w*(-.78+.36*secs),y:h*.23+Math.sin(secs*3+1)*12}];
 const target=flyers.find(f=>f.x>0&&f.x<w+50)||flyers[0];
 const angle=Math.atan2(target.y-(ty-sz*.12),target.x-tx);
 drawXBesta(c,tx,ty-sz*.12,sz,angle,secs%0.55<.1?.15:0);
 const shot=Math.floor(Math.max(0,secs-.28)/.52);
 if(shot!==introLastShot&&secs>.28){introLastShot=shot;}
 // Virotes viajando da X-Besta até os voadores, sem teletransporte.
 for(let i=0;i<=shot;i++){
  const fired=.28+i*.52,age=secs-fired;if(age<0||age>.65)continue;
  const f=flyers[i%flyers.length];const progress=Math.min(1,age/.48);
  const bx=tx+(f.x-tx)*progress,by=ty-sz*.12+(f.y-(ty-sz*.12))*progress;
  c.strokeStyle='#fff1b2';c.lineWidth=Math.max(3,sz*.045);c.beginPath();c.moveTo(bx-12,by+6);c.lineTo(bx+9,by-5);c.stroke();
  c.fillStyle='#fff8db';c.fillRect(bx-3,by-3,6,6);
 }
 for(let i=0;i<flyers.length;i++){
  const f=flyers[i];if(f.x<-80||f.x>w+100)continue;
  introFlyer(c,f.x,f.y,Math.min(w*.09,h*.17,74),Math.round(Math.sin(secs*15+i)*2));
 }
 c.textAlign='center';c.textBaseline='middle';c.fillStyle='#f7f3db';c.shadowColor='#000';c.shadowBlur=7;
 c.font=`900 ${Math.max(17,Math.min(36,w*.047))}px system-ui`;c.fillText('LEVEL 9',w*.5,h*.11);
 c.font=`700 ${Math.max(12,Math.min(19,w*.027))}px system-ui`;c.fillText('X-BESTA CONTRA OS GOBLINS VOADORES',w*.5,h*.17);c.shadowBlur=0;
 if(elapsed>=INTRO_DURATION){introFinish();return}
 introRequest=requestAnimationFrame(drawIntroX);
}
function playIntroX(){
 if(introActive)return;
 introActive=true;introLastShot=-1;introStartedAt=performance.now();introX.hidden=false;
 introRequest=requestAnimationFrame(drawIntroX);
}
document.getElementById('skipIntroX').addEventListener('click',introFinish);
document.getElementById('start').addEventListener('click',playIntroX);

function voltarParaMapa(){
  if(PAGINA_MAPA){window.location.assign(PAGINA_MAPA);return;}
  if(window.history.length>1){window.history.back();return;}
  window.location.assign('../mapa/index.html');
}
document.getElementById('home').addEventListener('click',voltarParaMapa);
document.getElementById('continueButton').addEventListener('click',()=>{if(!active||finished)return;paused=false;backgroundMusic.play().catch(()=>{});syncPauseButton();});
document.getElementById('giveUpButton').addEventListener('click',()=>{paused=false;active=false;finished=true;bombers=[];stopMusic();stopTowerSounds();syncPauseButton();voltarParaMapa();});
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
    goblins.push({lane:0,pos:-i*spacing,hp:s.hp,maxHp:s.hp,speed:s.speed,wiggle:Math.random()*6.28});
  }
  hud();
  return Math.max(0.18,rule.interval*Math.pow(CONFIG.intervalDecay,level));
}
function posAt(progress,lane=0){const road=paths[lane]||path;const a=Math.floor(progress),f=progress-a,p=road[Math.min(a,road.length-1)],q=road[Math.min(a+1,road.length-1)];return {x:p[0]+(q[0]-p[0])*f+.5,y:p[1]+(q[1]-p[1])*f+.5}}
function burst(x,y,color,n=7){n=Math.min(n,Math.max(0,160-particles.length));for(let i=0;i<n;i++)particles.push({x,y,vx:random(-2,2),vy:random(-2,2),life:random(.2,.6),max:.6,color})}
function update(dt){if(!active||paused)return;
  elapsedGame+=dt;
  updateBombers(dt);
  updateSiege(dt);
  spawnTimer-=dt;
  // A magia dura 5 segundos e congela qualquer inimigo que atravesse a área enquanto ativa.
  for(const z of freezeZones)z.time-=dt;
  freezeZones=freezeZones.filter(z=>z.time>0);
  // Não existem chefes nem goblins explosivos no Level 9.
  // A pena cai de cima para baixo e desaparece se passar da borda inferior.
  if(featherDrop){featherDrop.y+=featherDrop.speed*dt;if(featherDrop.y>R+1){featherDrop=null;showToast('🪶 A pena saiu do mapa!');}}
  const goblinProgress=spawned;
  if(bossPhase==='normal'&&featherEvents<5&&goblinProgress>=featherNext&&!featherDrop&&!featherMode){
    if(launchFeather())featherNext+=37+Math.floor(Math.random()*21);
  }
  // A sexta pena é garantida na etapa final, quando um ogro se aproxima do meio.
  if(false&&!finalFeatherTriggered&&goblins.some(g=>g.boss&&g.pos>=paths[g.lane].length*.40)&&!featherDrop&&!featherMode){
    if(launchFeather())finalFeatherTriggered=true;
  }
  // Sem ondas de corredores: somente os 10 que saem do cavalo de Troia.
  if(spawnTimer<=0){
    if(bossPhase!=="normal")spawnTimer=.3;
    else if(spawned<CONFIG.totalGoblins)spawnTimer=spawnGroup();
  }
  updateTrojan(dt);
  for(const g of goblins){g.slowTimer=Math.max(0,(g.slowTimer||0)-dt);g.frozen=g.pos>=0&&freezeZones.some(z=>{const p=posAt(g.pos,g.lane);return Math.hypot(p.x-z.x,p.y-z.y)<=FREEZE_RADIUS;});if(!g.frozen){const ajusteApos200=spawned>=200?.96:1;const ajusteFinal=(spawned>=300||bossPhase==="ogres")?.96:1;g.pos+=g.speed*(g.trojan?1:(g.slowTimer>0?.48:1))*.92*ajusteApos200*ajusteFinal*(1+Math.min(0.08,elapsedGame/4000))*dt;}if(g.pos>=paths[g.lane||0].length-1){g.dead=true;leaks++;burst(CASTLE_X,CASTLE_Y,'#ff6e65',12);if(g.trojan){trojanState="done";trojanWreck=null;}if(g.runner)runnerKilled++;if(g.boss||leaks>=CONFIG.maxLeaks){hud();end(false);return}hud()}}
  goblins=goblins.filter(g=>!g.dead);
  for(const t of towers){if(t.flash)t.flash=Math.max(0,t.flash-dt);t.cool-=dt;if(t.cool>0)continue;const u=CONFIG.defenders[t.type];let target=null,best=-1;
    if(u.siegeOnly){for(const enemy of siegeGoblins){const dist=Math.hypot(enemy.x-(t.x+.5),enemy.y-(t.y+.5));if(!enemy.dead&&dist>=u.minRange&&dist<=u.range&&dist>best){best=dist;target=enemy}}}
    else for(const g of goblins){if(g.pos<0)continue;const p=posAt(g.pos,g.lane),dist=Math.hypot(p.x-(t.x+.5),p.y-(t.y+.5));if(dist<=u.range&&g.pos>best){best=g.pos;target=g}}
    if(target){if(u.siegeOnly){t.angle=Math.atan2(target.y-(t.y+.5),target.x-(t.x+.5));t.flash=.17;}t.cool=u.fireInterval;if(t.type<5)towerShootSound(t.type);bullets.push({x:t.x+.5,y:t.y+.5,target,damage:u.siegeOnly?1:damageDaTorre(t.type),color:u.bulletColor,speed:u.siegeOnly?10:u.splash?8:13,splash:u.splash||0,slowSeconds:u.slowSeconds||0,siege:u.siegeOnly||false})}}
  for(const b of bullets){if(b.dead)continue;if(b.target.dead){b.dead=true;continue}const p=b.siege?{x:b.target.x,y:b.target.y}:posAt(b.target.pos,b.target.lane),dx=p.x-b.x,dy=p.y-b.y,d=Math.hypot(dx,dy),step=b.speed*dt;if(d<step+.18){b.dead=true;if(b.siege){b.target.hp-=b.damage;burst(p.x,p.y,'#ffe18b',6);if(b.target.hp<=0){b.target.dead=true;coins+=2;hud();burst(p.x,p.y,'#d0a45b',15)}continue;}const victims=b.splash?goblins.filter(g=>!g.dead&&g.pos>=0&&Math.hypot(posAt(g.pos,g.lane).x-p.x,posAt(g.pos,g.lane).y-p.y)<=1.45).slice(0,2):[b.target];
      for(const victim of victims){if(b.slowSeconds&&!victim.boss&&!victim.trojan)victim.slowTimer=Math.max(victim.slowTimer||0,b.slowSeconds);victim.hp-=b.damage;if(victim.hp<=0&&!victim.dead){victim.dead=true;if(victim.trojan){trojanDestroyed(victim); }else if(victim.boss){bossKilled++;coins+=5;}else if(victim.runner)runnerKilled++;else{killed++;if(killed%2===0)coins++;}burst(p.x,p.y,'#b7e06e',10);goblinDeathSound();hud()}}
      burst(p.x,p.y,b.color,b.splash?16:3);}else{b.x+=dx/d*step;b.y+=dy/d*step}}
  bullets=bullets.filter(b=>!b.dead);goblins=goblins.filter(g=>!g.dead);
  for(const p of particles){p.x+=p.vx*dt;p.y+=p.vy*dt;p.life-=dt}particles=particles.filter(p=>p.life>0);
  
  if(spawned===CONFIG.totalGoblins&&goblins.length===0&&trojanState==='done'&&siegeGoblins.length===0&&siegeSpawned>=SIEGE_TOTAL&&siegeStones.length===0){bossPhase='done';hud();end(true)}
}
const minimapWrapper=document.querySelector('.minimap');
function drawMinimap(){
  minimapWrapper.classList.toggle('feather-alert',!!featherDrop);
  const m=MINIMAP.cell, mc=miniCtx;
  mc.clearRect(0,0,miniCanvas.width,miniCanvas.height);
  mc.fillStyle=MINIMAP.grass;mc.fillRect(0,0,C*m,R*m);
  mc.fillStyle=MINIMAP.road;
  for(const road of paths)for(const [x,y] of road){if(x>=0&&x<C&&y>=0&&y<R)mc.fillRect(x*m,y*m,m,m)}
  mc.fillStyle='#272e39';mc.fillRect(0,1*m,m,m);mc.fillRect(0,6*m,m,m);
  mc.fillStyle='#f8df8c';mc.fillRect((C-1)*m,5*m,m,m);
  // Penas caindo e zonas congeladas também aparecem no minimapa.
  for(const z of freezeZones){
    mc.save();mc.beginPath();mc.arc(z.x*m,z.y*m,FREEZE_RADIUS*m,0,Math.PI*2);
    mc.fillStyle='rgba(230,247,255,.65)';mc.fill();mc.strokeStyle='#ffffff';mc.lineWidth=1.5;mc.stroke();
    mc.font=`${Math.max(12,m*1.4)}px sans-serif`;mc.textAlign='center';mc.textBaseline='middle';
    mc.fillText('❄',z.x*m,z.y*m);mc.restore();
  }
  if(featherDrop){
    // Alerta especial SOMENTE no minimapa: alvo luminoso pulsante na posição exata.
    const fx=featherDrop.x*m, fy=Math.max(m*1.5,Math.min((R-.7)*m,featherDrop.y*m));
    const pulse=(Math.sin(performance.now()/155)+1)/2;
    mc.save();
    mc.beginPath();mc.arc(fx,fy,m*(2.3+pulse*.9),0,Math.PI*2);
    mc.fillStyle=`rgba(5,42,80,${.64+.16*pulse})`;mc.fill();
    mc.strokeStyle='#ffe65c';mc.lineWidth=3.5;mc.shadowColor='#ffe65c';mc.shadowBlur=15;
    mc.stroke();
    mc.beginPath();mc.arc(fx,fy,m*(3.4+pulse*1.1),0,Math.PI*2);
    mc.strokeStyle=`rgba(255,235,88,${.9-.45*pulse})`;mc.lineWidth=2.5;mc.stroke();
    mc.shadowColor='#00eaff';mc.shadowBlur=18;
    mc.fillStyle='#ffffff';mc.font=`bold ${Math.round(m*3.6)}px sans-serif`;
    mc.textAlign='center';mc.textBaseline='middle';mc.fillText('❄',fx,fy);
    mc.restore();
  }
  mc.fillStyle=MINIMAP.tower;
  for(const t of towers){mc.beginPath();mc.arc((t.x+.5)*m,(t.y+.5)*m,Math.max(2,m*.27),0,Math.PI*2);mc.fill()}
 // Os sabotadores aparecem como pontos pretos com contorno amarelo.
 for(const b of bombers){mc.fillStyle='#151515';mc.strokeStyle='#ffd04b';mc.lineWidth=2;mc.beginPath();mc.arc(b.x*m,b.y*m,m*.53,0,Math.PI*2);mc.fill();mc.stroke()}
 // Pontos vermelhos se movem junto com cada goblin em tempo real.
  mc.fillStyle=MINIMAP.goblin;mc.shadowColor='#ff2020';mc.shadowBlur=3;
  for(const g of goblins){if(g.pos<0)continue;const p=posAt(g.pos,g.lane);if(p.x<0||p.x>C||p.y<0||p.y>R)continue;mc.beginPath();mc.arc(p.x*m,p.y*m,Math.max(2,m*(g.boss?.52:.33)),0,Math.PI*2);mc.fill()}
  mc.shadowBlur=0;
  // Cavalo de Troia: marcador grande e pulsante, desenhado POR CIMA dos goblins.
  const cavaloAtivo=goblins.find(g=>g.trojan&&!g.dead);
  const cavaloPos=cavaloAtivo?posAt(cavaloAtivo.pos,cavaloAtivo.lane):trojanWreck?posAt(trojanWreck.pos,trojanWreck.lane):null;
  if(cavaloPos){
    const cx=cavaloPos.x*m,cy=cavaloPos.y*m;
    const pulso=(Math.sin(performance.now()/230)+1)/2;
    mc.save();
    mc.beginPath();mc.arc(cx,cy,m*(1.45+pulso*.38),0,Math.PI*2);
    mc.fillStyle='rgba(55,27,8,.86)';mc.fill();
    mc.strokeStyle='#ffdc58';mc.lineWidth=3;mc.shadowColor='#ffdb43';mc.shadowBlur=13;mc.stroke();
    mc.font=`bold ${Math.round(m*2.5)}px sans-serif`;
    mc.textAlign='center';mc.textBaseline='middle';mc.shadowBlur=0;
    mc.fillText('🐴',cx,cy);
    mc.restore();
  }
  // Explosões de torres: X vermelho pulsante na posição exata somente no instante da explosão (0,7 segundo).
  for(const mark of towerExplosionMarks){
    const remain=mark.until-elapsedGame;if(remain<=0)continue;
    const mx=mark.x*m,my=mark.y*m;
    const pulse=(Math.sin(performance.now()/170)+1)/2;
    mc.save();
    mc.beginPath();mc.arc(mx,my,m*(1.0+pulse*.45),0,Math.PI*2);
    mc.fillStyle=`rgba(95,0,0,${.72+.18*pulse})`;mc.fill();
    mc.strokeStyle='#ffdd42';mc.lineWidth=2.5;mc.shadowColor='#ff3b1f';mc.shadowBlur=12;mc.stroke();
    mc.shadowBlur=0;mc.strokeStyle='#fff';mc.lineWidth=3.5;mc.lineCap='round';
    const r=m*.48;mc.beginPath();mc.moveTo(mx-r,my-r);mc.lineTo(mx+r,my+r);mc.moveTo(mx+r,my-r);mc.lineTo(mx-r,my+r);mc.stroke();
    mc.restore();
  }
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
// Terreno de neve pré-renderizado uma vez por escala, sem custo por frame.
function forestBackground(){
 if(forestLayer&&forestTile===tile)return forestLayer;
 forestTile=tile;const w=C*tile,h=R*tile;
 const layer=document.createElement('canvas');layer.width=Math.ceil(w);layer.height=Math.ceil(h);
 const c=layer.getContext('2d'),rand=seeded(58421);
 const bg=c.createLinearGradient(0,0,w,h);bg.addColorStop(0,'#eaf7ff');bg.addColorStop(.55,'#d3e9f3');bg.addColorStop(1,'#b7d5e5');c.fillStyle=bg;c.fillRect(0,0,w,h);
 // Manchas suaves, cristais e pequenas ondulações de neve.
 for(let i=0;i<2400;i++){const x=rand()*w,y=rand()*h,r=tile*(.03+rand()*.28);c.fillStyle=rand()<.5?'rgba(255,255,255,.48)':'rgba(110,160,190,.13)';c.beginPath();c.ellipse(x,y,r,r*.35,0,0,Math.PI*2);c.fill()}
 const allPts=paths.map(road=>road.map(([x,y])=>({x:(x+.5)*tile,y:(y+.5)*tile})));
 const distanceToRoad=(x,y)=>{let best=Infinity;for(const pts of allPts)for(let i=1;i<pts.length;i++){const a=pts[i-1],b=pts[i],dx=b.x-a.x,dy=b.y-a.y,q=Math.max(0,Math.min(1,((x-a.x)*dx+(y-a.y)*dy)/(dx*dx+dy*dy||1)));best=Math.min(best,(x-a.x-q*dx)**2+(y-a.y-q*dy)**2)}return Math.sqrt(best)};
 // Estradas geladas sinuosas, separadas à esquerda e à direita.
 c.lineCap='round';c.lineJoin='round';for(const [ww,color] of [[1.55,'#effaff'],[1.37,'#9dbdcd'],[1.12,'#789cb0'],[.90,'#b7d3de']])for(const pts of allPts){c.beginPath();c.moveTo(pts[0].x,pts[0].y);for(const v of pts.slice(1))c.lineTo(v.x,v.y);c.strokeStyle=color;c.lineWidth=tile*ww;c.stroke()}
 // Pinheiros cobertos de neve, fora dos caminhos e da área do castelo.
 for(let i=0;i<195;i++){const x=rand()*w,y=rand()*h;if(distanceToRoad(x,y)<tile*1.00||Math.hypot(x-CASTLE_X*tile,y-CASTLE_Y*tile)<tile*1.6)continue;const r=tile*(.13+rand()*.18);c.fillStyle='#637e89';c.fillRect(x-r*.14,y,r*.28,r*.9);for(let k=0;k<3;k++){const yy=y-r*(.35+k*.34),rr=r*(1.18-k*.21);c.fillStyle=['#315f68','#427782','#548a8d'][k];c.beginPath();c.moveTo(x,yy-r*.88);c.lineTo(x-rr,yy+r*.42);c.lineTo(x+rr,yy+r*.42);c.closePath();c.fill();c.strokeStyle='#edfaff';c.lineWidth=Math.max(2,tile*.065);c.beginPath();c.moveTo(x,yy-r*.88);c.lineTo(x-rr*.72,yy+r*.12);c.stroke()}}
 for(let i=0;i<210;i++){const x=rand()*w,y=rand()*h;if(distanceToRoad(x,y)<tile*.55)continue;c.fillStyle=rand()<.7?'#fff':'#8ab6ce';c.fillRect(x,y,Math.max(2,tile*.035),Math.max(2,tile*.035))}
 forestLayer=layer;return layer;
}
// Sprites desenhados em pixels reais: sem emojis e sem filtros borrados.
const SPRITES={
 ogreWhite:["...JJ....JJ...","..JJJJ..JJJJ..","..JQQQJJQQQJ..","...QQQQQQQQ...","..QQQQQQQQQQ..","..QQKQQQQKQQ..","..QQQQKKQQQQ..","...QQQQQQQQ...","..LLLLLLLLLL..",".JLLLLLLLLLLJ.",".JLLLLLLLLLLJ.","..LLL....LLL..","..JJJ....JJJ.."],
 stoneGoblin:["....MMMM....","..MMMMMMMM..",".MMYYYYYYMM.","MMYYYYYYYYMM","MYYWWYYWWYYM","MYYYYKKYYYYM","..YYYYYYYY..","..OOOOOOOO..",".MOOOOOOOOM.","..MOOOOOOM..","...DD..DD...","..DD....DD.."],
 goblin3:["....NNNN....","..NNNNNNNN..",".NNGGGGGGNN.","NNGGGGGGGGNN","NGGWWGGWWGGN","NGGGKKGGGGGN","..GGGGGGGG..","..BBBBBBBB..",".NBBBBBBBBN.","..NBBBBBBN..","...DD..DD...","..DD....DD.."],
 runner:["....NNNN....","...NGGGGN...","..NGGGGGGN..","..GGWWWWGG..","...GKKKKG...","....GGGG....","...TTTTTT...","..NTTTTTTN..","...TT..TT...","...DD..DD...","..DD....DD..",".DD......DD."],
 goblin:["....RRRR....","..RRRRRRRR..",".RRDRRRRDRR.","RRRRRRRRRRRR","RDRWWRRWWRDR","RRRKKRRKKRRR",".RRRRRRRRRR.","..RRDDDDRR..","..DRRRRRRD..","..DDRRRRDD..","...DD..DD...","..DD....DD.."],
 archer:["....HHHH....","...HHHHHH...","...HSSSSH...","...HKBKSH...","....SSSS....","..GGGGGGGG..",".GGGGBBGGGG.",".GGGGBBGGGG.","...BB..BB...","...BB..BB...","..DDD..DDD..","..DDD..DDD.."],
 mage:[".....PP.....","....PPPP....","...PPPPPP...","..PPPPPPPP..","...PSSSSP...","....SKKS....","...BBBBBB...","..BBBBBBBB..","..BBBBBBBB..","..BBBBBBBB..","..BBBBBBBB..","..DD....DD.."],
 warrior:["....CCCC....","...CCCCCC...","...CSSSSC...","...CSK KSC...".replace(' ',''),"....SSSS....","..AAAAAAAA..","..AAABBAAA..","..AAABBAAA..","...AABBAA...","...BB..BB...","..DDD..DDD..","..DDD..DDD.."],
 dragon:["RR........RR","RRR......RRR",".RRR.RR.RRR.","..RRRRRRRR..","..RRYYRRYY..","...RRKKRR...",".RRRRRRRRRR.","RRRRRRRRRRRR",".RRRRRRRRRR.","..RRRRRRRR..","..DD....DD..",".DDD....DDD."],
 castle:["..CC......CC..","..CC..CC..CC..","..CCCCCCCCCC..","..CCCCCCCCCC..","..CCDDDDDDCC..","..CCDDDDDDCC..","CCCCDDDDDDCCCC","CCCCDDDDDDCCCC","CCCCDDDDDDCCCC","CCCCDDDDDDCCCC","CCCCDDKKDDCCCC","CCCCDDKKDDCCCC","CCCCDDKKDDCCCC","CCCCCCCCCCCCCC"]
};
const PALETTE={Q:'#f6faff',J:'#d4e4ed',L:'#b9cddc',N:'#244b51',T:'#bd633c',R:'#e7444a',D:'#74212b',W:'#fff3d6',K:'#22212a',H:'#79542c',S:'#f4c69d',B:'#3668b2',G:'#368448',P:'#8b50d3',C:'#aeb6bd',A:'#d3ad60',Y:'#ffdf74',M:'#754c33',O:'#ab5d26'};
// Desenhos dos personagens ficam em cache, evitando centenas de retângulos por quadro.
const spriteCache=new Map();
function sprite(name,x,y,size){
 const sz=Math.max(8,Math.round(size)),key=name+':'+sz;
 let cached=spriteCache.get(key);
 if(!cached){const art=SPRITES[name],unit=sz/Math.max(...art.map(r=>r.length));cached=document.createElement('canvas');cached.width=sz+2;cached.height=sz+2;const c=cached.getContext('2d');for(let row=0;row<art.length;row++)for(let col=0;col<art[row].length;col++){const color=PALETTE[art[row][col]];if(color){c.fillStyle=color;c.fillRect(Math.round(col*unit),Math.round(row*unit),Math.ceil(unit),Math.ceil(unit));}}spriteCache.set(key,cached)}
 ctx.drawImage(cached,Math.round(x-sz/2),Math.round(y-sz/2));
}

// Quatro torres arqueiras medievais em pixel art.
// Torres de arqueiros em pixel art: quatro níveis, com arqueiros visíveis no topo.
const HOUSE_ART=[
 ["......DDDD......",".....DWWD......","....DWRRWD......","...DDWRRWDD.....","...DWWWWWWD.....","..DDDDDDDDDD....","..DSSSSSSSSD....","..DSSKSSKSSD....","..DSSSSSSSSD....","..DWWWWWWWWD....","..DWWWWWWWWD....","..DWWDDWWWWD....","..DWWDDWWWWD....","..DWWDDWWWWD....","..DWWDDWWWWD....","..BBBBBBBBBB...."],
 ["...CC....CC.....","...CCCCCCCC.....","...CDWWWWDC.....","...CDWRR WDC.....".replace(' ',''),"...CDWRRWDC.....","..CCDDDDDDCC....","..CYYSSSSYYC....","..CSSKSSKSSC....","..CSSSSSSSSC....","..CWWWWWWWWC....","..CWWWWWWWWC....","..CWWDDWWWWC....","..CWWDDWWWWC....","..CWWDDWWWWC....","..CWWDDWWWWC....","..BBBBBBBBBB...."],
 ["..CC..CC..CC....","..CCCCCCCCCC....","..CWWWWWWWWC....","..CWDRRRR DWC...".replace(' ',''),"..CWDRRRRDWC....","..CCDDDDDDCC....","..CYYSSSSYYC....","..CSSKSSKSSC....","..CSSSSSSSSC....","..CWWWWWWWWC....","..CWWWWWWWWC....","..CWWDDWWWWC....","..CWWDDWWWWC....","..CWWDDWWWWC....","..CWWDDWWWWC....","..BBBBBBBBBB...."],
 ["..CC..CC..CC....","..CCCCCCCCCC....","..CYYYYYYYYC....","..CYDRRRRDYC....","..CYDRRRRDYC....","..CCDDDDDDCC....","..CYYSSSSYYC....","..CSSKSSKSSC....","..CSSSSSSSSC....","..CWWWWWWWWC....","..CWWWWWWWWC....","..CWWDDWWWWC....","..CWWDDWWWWC....","..CWWDDWWWWC....","..CWWDDWWWWC....","..BBBBBBBBBB...."],
 ["....CCCCCC......","...CCWWWWCC.....","..CCWWWWWWCC....","..CCWWWWWWCC....","...CCCCCCCC.....","..DDDDDDDDDD....","..DSSSSSSSSD....","..DSSKSSKSSD....","..DSSSSSSSSD....","..DWWWWWWWWD....","..DWWWWWWWWD....","..DWWDDWWWWD....","..DWWDDWWWWD....","..DWWDDWWWWD....","..DWWDDWWWWD....","..BBBBBBBBBB...."],
 ["......DDDD......",".....DYYD......","....DDYYDD......","..DDDDDDDDDD....","..DCCCCCCCCD....","..DCCCCCCCCD....","..DCCDDDDCCD....","..DCDYYYYDCD....","..DCCDDDDCCD....","..DCCCCCCCCD....","..DCCCCCCCCD....","..DCCCCCCCCD....","..DCCCCCCCCD....","..DCCCCCCCCD....","..DCCCCCCCCD....","..BBBBBBBBBB...."]
];
// X-Besta desenhada no próprio canvas: construção pixel art e mecanismo giratório.
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
const HOUSE_PALETTE={D:'#50372b',W:'#b5a38b',S:'#e4b781',K:'#26262b',B:'#4b4d51',R:'#b63831',C:'#757d88',Y:'#e6c65a'};
const houseCache=new Map();
function renderHouse(c,art,x,y,size){const sz=Math.max(8,Math.round(size)),id=HOUSE_ART.indexOf(art),key=id+':'+sz;let cached=houseCache.get(key);if(!cached){cached=document.createElement('canvas');cached.width=sz+2;cached.height=sz+2;const b=cached.getContext('2d'),px=sz/art.length;for(let j=0;j<art.length;j++)for(let i=0;i<art[j].length;i++){const color=HOUSE_PALETTE[art[j][i]];if(color){b.fillStyle=color;b.fillRect(Math.round(i*px),Math.round(j*px),Math.ceil(px),Math.ceil(px))}}houseCache.set(key,cached)}c.drawImage(cached,Math.round(x-sz/2),Math.round(y-sz/2))}
function drawShopHouse(canvas,type){if(!canvas)return;const c=canvas.getContext('2d');c.imageSmoothingEnabled=false;c.clearRect(0,0,48,48);if(type===5)drawXBesta(c,24,25,44,-.35,0);else renderHouse(c,HOUSE_ART[type],24,24,44)}
function pixelForest(){if(pixelForestLayer)return pixelForestLayer;const original=forestBackground();const out=document.createElement('canvas');const step=5;out.width=Math.ceil(original.width/step);out.height=Math.ceil(original.height/step);const oc=out.getContext('2d');oc.imageSmoothingEnabled=true;oc.drawImage(original,0,0,out.width,out.height);pixelForestLayer=out;return out}
function pixelEllipse(x,y,rx,ry,color){ctx.fillStyle=color;const step=Math.max(3,Math.round(tile*.085));for(let dy=-ry;dy<=ry;dy+=step)for(let dx=-rx;dx<=rx;dx+=step)if(dx*dx/(rx*rx)+dy*dy/(ry*ry)<=1)ctx.fillRect(Math.round(x+dx),Math.round(y+dy),step,step)}
function draw(time){
 const w=C*tile,h=R*tile;ctx.imageSmoothingEnabled=false;ctx.clearRect(0,0,w,h);
 ctx.drawImage(pixelForest(),0,0,w,h);
 const cx=CASTLE_X*tile,cy=CASTLE_Y*tile;
 pixelEllipse(cx,cy+tile*.30,tile*.42,tile*.15,'#172b20');
 sprite('castle',cx,cy-tile*.19,tile*.95);
 for(const t of towers){
  const px=(t.x+.5)*tile,py=(t.y+.5)*tile;
  pixelEllipse(px,py+tile*.16,tile*.38,tile*.19,'#17282c');
  pixelEllipse(px,py+tile*.10,tile*.31,tile*.13,['#ffd77c','#8bdcff','#e3e4ef','#ff9459','#80e8ff'][t.type]);
  if(t.type===5)drawXBesta(ctx,px,py-tile*.13,tile*.95,t.angle||0,t.flash||0);else renderHouse(ctx,HOUSE_ART[t.type],px,py-tile*.13,tile*.95);
 }
 if(selectedTower&&towers.includes(selectedTower)){
  const px=(selectedTower.x+.5)*tile,py=(selectedTower.y+.5)*tile;
  const bx=px+tile*.18,by=py-tile*.34,rad=tile*.19;
  ctx.fillStyle='#e52f39';ctx.fillRect(Math.round(bx-rad),Math.round(by-rad),Math.round(rad*2),Math.round(rad*2));
  ctx.strokeStyle='#fff';ctx.lineWidth=Math.max(2,tile*.065);ctx.beginPath();ctx.moveTo(bx-rad*.37,by-rad*.37);ctx.lineTo(bx+rad*.37,by+rad*.37);ctx.moveTo(bx+rad*.37,by-rad*.37);ctx.lineTo(bx-rad*.37,by+rad*.37);ctx.stroke();
 }
 // Dinossauro voador em pixel art, com goblin montado e asas batendo.
 for(const enemy of siegeGoblins){
   const px=enemy.x*tile,py=(enemy.y+Math.sin(time*6+enemy.wiggle)*.12)*tile;
   const u=tile/18;
   ctx.save();ctx.translate(Math.round(px),Math.round(py));
   if(!enemy.fromLeft)ctx.scale(-1,1);
   const rect=(x,y,w,h,color)=>{ctx.fillStyle=color;ctx.fillRect(Math.round(x*u),Math.round(y*u),Math.ceil(w*u),Math.ceil(h*u))};
   // sombra pequena no chão e silhueta do réptil voador
   ctx.fillStyle='rgba(16,35,43,.22)';ctx.beginPath();ctx.ellipse(0,13*u,9*u,2*u,0,0,Math.PI*2);ctx.fill();
   const flap=Math.sin(time*13+enemy.wiggle)*3;
   rect(-10,-2+flap,7,3,'#426d80');rect(-12,-4+flap,5,2,'#76a6b2');
   rect(2,-3-flap,8,3,'#426d80');rect(5,-5-flap,6,2,'#85b7c0');
   rect(-6,0,12,5,'#3f7c80');rect(-3,4,7,2,'#24565c');
   rect(4,-3,4,5,'#4c9091');rect(7,-5,5,4,'#4c9091');rect(10,-4,3,2,'#92bdab');
   rect(8,-4,1,1,'#17252b');rect(-10,1,5,2,'#31646c');
   // Goblin piloto: cabeça, olhos e roupa, no mesmo estilo das torres
   rect(-3,-9,6,5,'#69b64e');rect(-5,-7,2,2,'#69b64e');rect(3,-7,2,2,'#69b64e');
   rect(-2,-8,1,1,'#17252b');rect(2,-8,1,1,'#17252b');
   rect(-3,-4,6,4,'#75513a');rect(-2,-1,4,2,'#4d352a');
   ctx.restore();
   ctx.fillStyle='#241c24';ctx.fillRect(px-tile*.25,py-tile*.73,tile*.5,tile*.07);
   ctx.fillStyle='#f6c86a';ctx.fillRect(px-tile*.25,py-tile*.73,tile*.5*(enemy.hp/4),tile*.07);
 }
 for(const bomb of siegeStones){
   const px=bomb.x*tile,py=bomb.y*tile,r=Math.max(4,tile*.16);
   ctx.fillStyle='#24252e';ctx.beginPath();ctx.arc(px,py,r,0,Math.PI*2);ctx.fill();
   ctx.fillStyle='#ffbb45';ctx.fillRect(px+r*.25,py-r*1.35,Math.max(2,r*.35),Math.max(2,r*.45));
 }
 for(const g of goblins){
  if(g.pos<0)continue;const p=posAt(g.pos,g.lane),px=p.x*tile,py=p.y*tile;
  pixelEllipse(px,py+tile*.23,tile*.27,tile*.11,'#47392b');
  if(g.trojan)drawTrojanHorse(px,py,time,true);
  else sprite(g.boss?'ogreWhite':g.runner?'runner':'goblin3',px,py-tile*.10+Math.round(Math.sin(time*(g.runner?20:12)+g.wiggle)*2),tile*(g.boss?1.48:g.runner?.60:.69));
  if(g.frozen||g.slowTimer>0){
    // Floco discreto sobre quem está lento pela torre de gelo.
    ctx.save();ctx.font=`${Math.max(9,Math.round(tile*.22))}px sans-serif`;
    ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='#e5faff';
    ctx.shadowColor='#60d8ff';ctx.shadowBlur=3;
    ctx.fillText('❄',px,py-tile*(g.boss?.96:.58));ctx.restore();
  }
  const bx=Math.round(px-tile*(g.boss?.48:.29)),by=Math.round(py-tile*(g.boss?.90:.51)),bw=Math.round(tile*(g.boss?.96:.58)),bh=Math.max(3,Math.round(tile*.08));
  ctx.fillStyle='#341d20';ctx.fillRect(bx-1,by-1,bw+2,bh+2);
  ctx.fillStyle='#7ce96b';ctx.fillRect(bx,by,Math.round(bw*Math.max(0,g.hp/g.maxHp)),bh);
 }
 if(trojanWreck){const p=posAt(trojanWreck.pos,trojanWreck.lane);drawTrojanHorse(p.x*tile,p.y*tile,time,false);ctx.save();ctx.font=`bold ${Math.round(tile*.30)}px sans-serif`;ctx.textAlign='center';ctx.fillStyle='#ffeb88';ctx.strokeStyle='#17252b';ctx.lineWidth=3;ctx.strokeText(`${Math.ceil(trojanWreck.timer)}s`,p.x*tile,p.y*tile-tile*1.12);ctx.fillText(`${Math.ceil(trojanWreck.timer)}s`,p.x*tile,p.y*tile-tile*1.12);ctx.restore();}
 // Campo gelado, raio de dois quadrados, com contagem regressiva.
 for(const z of freezeZones){ctx.save();ctx.beginPath();ctx.arc(z.x*tile,z.y*tile,FREEZE_RADIUS*tile,0,Math.PI*2);ctx.fillStyle='rgba(255,255,255,.25)';ctx.fill();ctx.strokeStyle='#ffffff';ctx.lineWidth=3;ctx.stroke();ctx.font=`${Math.max(16,tile*.38)}px sans-serif`;ctx.fillStyle='#ffffff';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('❄️',z.x*tile,z.y*tile);ctx.font=`${Math.max(12,tile*.24)}px sans-serif`;ctx.fillText(`${Math.ceil(z.time)}s`,z.x*tile,z.y*tile+tile*.42);ctx.restore();}
 if(featherDrop){ctx.font=`${Math.round(tile*1.25)}px sans-serif`;ctx.textAlign='center';ctx.shadowColor='#d9faff';ctx.shadowBlur=18;ctx.fillStyle='#ffffff';ctx.fillText('❄',featherDrop.x*tile,featherDrop.y*tile+Math.sin(time*4)*tile*.13);ctx.shadowBlur=0;}
 // Durante a escolha da pena, somente a estrada pisca em azul para indicar os locais válidos.
 if(featherMode){
  const pulse=.18+.34*(.5+.5*Math.sin(time*7));
  ctx.save();ctx.fillStyle=`rgba(38,173,255,${pulse.toFixed(3)})`;
  for(const key of pathCells){const [x,y]=key.split(',').map(Number);ctx.fillRect(x*tile,y*tile,tile,tile);}
  ctx.restore();
 }
 drawBombers(time);
 for(const b of bullets){const n=Math.max(4,Math.round(tile*(b.siege?.17:.12)));ctx.fillStyle=b.color;ctx.fillRect(Math.round(b.x*tile-n/2),Math.round(b.y*tile-n/2),n,n);if(b.siege){const target=b.target;const dx=target.x-b.x,dy=target.y-b.y,mag=Math.hypot(dx,dy)||1;ctx.strokeStyle='rgba(255,244,190,.8)';ctx.lineWidth=Math.max(2,tile*.065);ctx.beginPath();ctx.moveTo(b.x*tile-dx/mag*tile*.27,b.y*tile-dy/mag*tile*.27);ctx.lineTo(b.x*tile,b.y*tile);ctx.stroke();}}
 for(const p of particles){ctx.globalAlpha=Math.max(0,p.life/p.max);const n=Math.max(3,Math.round(tile*.10));ctx.fillStyle=p.color;ctx.fillRect(Math.round(p.x*tile),Math.round(p.y*tile),n,n);ctx.globalAlpha=1}
}
// Um toque no defensor exibe o X. Um toque fora dele esconde o X.
// O X tem uma área de toque um pouco maior para facilitar no celular.
// Clique ou toque curto posiciona/seleciona; arrastar desloca o mapa sem comprar.
let press=null;
function updateXBestaPreview(e){
 if(!active||paused||finished||selected!==5){xbestaPreview=null;return;}
 const r=canvas.getBoundingClientRect();
 const px=(e.clientX-r.left)/tile,py=(e.clientY-r.top)/tile;
 const x=Math.floor(px),y=Math.floor(py);
 xbestaPreview=(x>=0&&x<C&&y>=0&&y<R)?{x:x+.5,y:y+.5}:null;
}


canvas.addEventListener('pointerdown',e=>{if(!active||paused)return;press={x:e.clientX,y:e.clientY};});
canvas.addEventListener('pointercancel',()=>press=null);
canvas.addEventListener('pointerup',e=>{
  if(!active||paused||!press)return;
  const moved=Math.hypot(e.clientX-press.x,e.clientY-press.y);press=null;
  if(moved>12)return;
  const r=canvas.getBoundingClientRect();
  const px=(e.clientX-r.left)/tile,py=(e.clientY-r.top)/tile;
  if(featherDrop&&Math.hypot(px-featherDrop.x,py-featherDrop.y)<1.35){featherDrop=null;featherMode=true;selectedTower=null;showToast('❄️ Agora toque na estrada para congelar em raio de 2 quadrados!');return;}
  if(featherMode){const x=Math.floor(px),y=Math.floor(py);if(x<0||x>=C||y<0||y>=R||!pathCells.has(`${x},${y}`)){showToast('❄️ O gelo só pode ser colocado na estrada!');return;}const fx=x+.5,fy=y+.5;freezeZones.push({x:fx,y:fy,time:FREEZE_SECONDS});featherMode=false;burst(x+.5,y+.5,'#a3efff',24);showToast('❄️ CONGELAMENTO ATIVADO POR 5 SEGUNDOS!');return;}
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
  if(pathCells.has(`${x},${y}`)||Math.hypot(x+.5-CASTLE_X,y+.5-CASTLE_Y)<1.2){showToast('Coloque o defensor na neve, fora da estrada!');return;}
  if(towers.filter(t=>t.type===selected).length>=CONFIG.towerLimits[selected]){showToast(`Limite de ${CONFIG.towerLimits[selected]} torres deste tipo atingido!`);return;}
  if(coins<u.cost){showToast('Moedas insuficientes!');return;}
  towers.push({x,y,type:selected,cool:0});xbestaPreview=null;coins-=u.cost;hud();towerPlacementSound();burst(x+.5,y+.5,'#f5df8a',8);
});
// Toques fora do tabuleiro também fecham o botão de remoção.
document.addEventListener('pointerdown',e=>{
  if(e.target!==canvas)selectedTower=null;
});
// Desenho até 60 FPS, com simulação em passos pequenos e minimapa a 10 FPS.
// O limite evita renderizações acima de 60 Hz em telas de 120/144 Hz.
const FRAME_MS=1000/60;
let lastMini=0, lastFrame=0;
function frame(t){
 requestAnimationFrame(frame);
 if(document.hidden){lastTime=0;lastFrame=0;return}
 if(!lastTime){lastTime=t;lastFrame=t;return}
 if(t-lastFrame<FRAME_MS-1.1)return;
 const elapsed=Math.min(t-lastTime,100);
 lastTime=t;lastFrame=t;
 // Subpassos preservam a colisão e a velocidade mesmo se algum quadro atrasar.
 let remaining=elapsed/1000;
 while(remaining>0){const step=Math.min(remaining,1/60);update(step);remaining-=step}
 draw(t/1000);
 if(t-lastMini>=100){drawMinimap();lastMini=t}
}
document.addEventListener('visibilitychange',()=>{lastTime=0});
syncPauseButton();hud();requestAnimationFrame(frame);
