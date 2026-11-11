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
  columns: 40, rows: 12, totalGoblins: 340, maxGoblinsOnMap: 40, startingCoins: 5,
  maxLeaks: 6, spawnInterval: 1.55,
  // Quantos goblins saem juntos e a pausa entre os grupos (segundos).
  // 1–80: de 2 em 2; 81–120: de 3 em 3; 121–200: de 3 em 3,
  // com intervalos cada vez menores conforme eles ficam mais rápidos.
  spawnGroups: [
    { until: 80, count: 2, interval: 1.35 },
    { until: 120, count: 3, interval: 0.95 },
    { until: 340, count: 3, interval: 0.60 }
  ],
  // No começo eles ficam afastados; conforme evoluem, se aproximam.
  groupSpacingStart: 3.4, // distância inicial em quadrados
  groupSpacingMin: 0.28,  // menor distância entre goblins
  spacingDecay: 0.90,    // aproximação suave após os primeiros 60 goblins
  intervalDecay: 0.97,   // reduz gradualmente a pausa após os primeiros 60 goblins
  spacingStartsAfter: 60, // só começam a se juntar após o goblin 60

  goblin: {
    baseHp: 20, baseSpeed: 1.02,
    // A cada aumento de velocidade (30 goblins), a vida aumenta em 1 tiro de Arqueiro.
    // Velocidade: 1–30 normal, depois +11% a cada 30 goblins (cumulativo).
    goblinsPerLevel: 30, // vida acompanha o aumento de velocidade
    goblinsPerSpeedLevel: 30, // velocidade: +11% a cada 30 goblins
    speedMultiplier: 1.09, // +9% de velocidade a cada 30 goblins: um pouco mais rápidos ao longo da fase
    extraHpPerLevel: 4     // +4 HP = 1 tiro extra do Arqueiro a cada aceleração

  },
  towerLimits: [7, 6, 6, 5, 5],
  defenders: [
    { name:'Torre Arqueira I', emoji:'🏹', cost:2, damage:5, range:3, fireInterval:0.85, bulletColor:'#ffe47b' },
    { name:'Torre Arqueira II', emoji:'🧙', cost:5, damage:7, range:3, fireInterval:0.8, bulletColor:'#8dd6ff' },
    { name:'Torre Arqueira III', emoji:'⚔️', cost:7, damage:9, range:3, fireInterval:0.75, bulletColor:'#c7c4ff' },
    { name:'Torre Arqueira IV', emoji:'🐉', cost:11, damage:13, range:3, fireInterval:0.7, bulletColor:'#ff8453' },
    { name:'Torre de Gelo', emoji:'❄️', cost:13, damage:35, range:3.4, fireInterval:2.1, bulletColor:'#80e8ff', splash:2, slowSeconds:3.5, slowFactor:0.48 }
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

// LEVEL 6: duas estradas assimétricas com retornos, desvios longos e curvas fechadas.
// Modifique os pares [coluna, linha] para redesenhar os percursos.
// Entradas nas extremidades, chegada no castelo central superior.
const corners=[[-1,10],[7,10],[7,7],[2,7],[2,4],[12,4],[12,9],[17,9],[17,5],[14,5],[14,2],[20,2],[20,1]];
function buildPath(points){const result=[];for(let i=0;i<points.length-1;i++){const [ax,ay]=points[i],[bx,by]=points[i+1],n=Math.max(Math.abs(bx-ax),Math.abs(by-ay));for(let j=0;j<n;j++)result.push([ax+(bx-ax)*j/n,ay+(by-ay)*j/n])}result.push(points.at(-1));return result}
const path=buildPath(corners);
const path2=buildPath([[40,10],[32,10],[32,6],[38,6],[38,3],[27,3],[27,8],[23,8],[23,5],[29,5],[29,1],[20,1]]);
const paths=[path,path2];
const CASTLE_X=20.5,CASTLE_Y=1.5;
const pathCells=new Set(paths.flat().filter(([x,y])=>x>=0&&x<C&&y>=0&&y<R).map(([x,y])=>`${x},${y}`));
let forestLayer=null,forestTile=0,pixelForestLayer=null;
let tile=48,dpr=1,selected=0,coins=5,leaks=0,spawned=0,killed=0,spawnTimer=0,active=false,finished=false,paused=false,lastTime=0;
const pauseButton=document.getElementById("pauseButton");
const pauseOverlay=document.getElementById("pauseOverlay");
function syncPauseButton(){pauseOverlay.hidden=!active||finished||!paused;pauseButton.hidden=!active||finished;pauseButton.textContent=paused?"⏸ PAUSADO":"⏸ PAUSAR";pauseButton.setAttribute("aria-label",paused?"Continuar jogo":"Pausar jogo");pauseButton.setAttribute("aria-pressed",String(paused));}
pauseButton.addEventListener("click",()=>{if(!active||finished||paused)return;paused=true;if(paused)backgroundMusic.pause();else backgroundMusic.play().catch(()=>{});syncPauseButton();});
// Três sustos aleatórios por partida, distribuídos ao longo da fase.
const goblinSurpresa=document.getElementById('goblinSurpresa');
let surpresaLimites=[],surpresaContagem=0,surpresaFim=0,surpresaSaindo=false;
function configurarSurpresas(){
  surpresaLimites=[45+Math.floor(Math.random()*65),155+Math.floor(Math.random()*65),275+Math.floor(Math.random()*75)];
  surpresaContagem=0;surpresaFim=0;surpresaSaindo=false;
  goblinSurpresa.hidden=true;goblinSurpresa.className='goblin-surpresa';
}
function iniciarSurpresa(){
  surpresaContagem++;surpresaFim=elapsedGame+4;surpresaSaindo=false;
  goblinSurpresa.className='goblin-surpresa '+(Math.random()<.5?'esquerda':'direita');
  goblinSurpresa.hidden=false;
  // Pequena vibração em aparelhos compatíveis, sem som ou recursos pesados.
  if(typeof navigator!=="undefined" && typeof navigator.vibrate==="function")navigator.vibrate(90);
}
function atualizarSurpresa(){
  if(surpresaContagem<surpresaLimites.length && spawned>=surpresaLimites[surpresaContagem] && surpresaFim===0)iniciarSurpresa();
  if(surpresaFim && elapsedGame>=surpresaFim && !surpresaSaindo){
    surpresaSaindo=true;goblinSurpresa.classList.add('saindo');
  }
  if(surpresaSaindo && elapsedGame>=surpresaFim+.65){
    goblinSurpresa.hidden=true;surpresaFim=0;surpresaSaindo=false;
  }
}
let goblins=[],towers=[],bullets=[],particles=[],grass=[];
let bossPhase="normal",bossWait=0,bossSpawned=0,bossKilled=0;
// Seis penas por partida: cinco eventos aleatórios depois de 150 goblins e um durante os ogros.
// Clique na pena ENQUANTO CAI para escolher diretamente o chão onde lançar a magia.
let featherDrop=null, featherMode=false, freezeZones=[], featherEvents=0, featherNext=0, finalFeatherTriggered=false;
const FEATHER_TOTAL=6, OGRE_COUNT=2, OGRE_HP=4000, FREEZE_RADIUS=2, FREEZE_SECONDS=5;
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
const random=(a,b)=>a+Math.random()*(b-a);
for(let i=0;i<110;i++)grass.push({x:Math.random()*C,y:Math.random()*R,s:random(.04,.14),a:random(.15,.4)});

function resize(){const rect=arena.getBoundingClientRect();
  // No celular, mantenha o mapa grande e permita arrastar horizontalmente.
  // No notebook, encaixe o mapa na área disponível quando possível.
  tile=Math.max(1,rect.width/C,rect.height/R);
  const w=C*tile,h=R*tile;dpr=Math.min(devicePixelRatio||1,1.5);canvas.style.width=`${w}px`;canvas.style.height=`${h}px`;canvas.style.marginTop=`0px`;canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);forestLayer=null;pixelForestLayer=null}
new ResizeObserver(resize).observe(arena);resize();
function shopRender(){shop.innerHTML='';CONFIG.defenders.forEach((u,i)=>{const b=document.createElement('button');const placed=towers.filter(t=>t.type===i).length;const limit=CONFIG.towerLimits[i];b.className=`unit ${selected===i?'selected':''} ${coins<u.cost?'unaffordable':''} ${placed>=limit?'limit-reached':''}`;b.setAttribute('aria-disabled',placed>=limit?'true':'false');b.innerHTML=`${placed>=limit?'<span class="limit-x" aria-label="Limite atingido">✕</span>':''}<span class="emoji"><canvas class="house-preview" width="48" height="48" data-house="${i}"></canvas></span><span class="name">${u.name} (${placed}/${limit})</span><span class="price" aria-label="Custa ${u.cost} moedas">🪙${u.cost}</span>`;b.onclick=()=>{if(placed>=limit){showToast(`Limite de ${limit} torres atingido!`);return;}selected=i;shopRender();showToast(`${u.name} selecionado`)};shop.appendChild(b);drawShopHouse(b.querySelector('canvas'),i)})}
function hud(){
  const total=Math.min(400,spawned+runnersCompleted+runnerSpawned);
  waveEl.textContent=(bossPhase==='ogres'||bossPhase==='done')?`👹 400/400 • 👹 OGROS ${bossKilled}/${OGRE_COUNT}`:`👹 ${total}/400${runnerStage%2===1?' • 👟 '+runnerSpawned+'/20':''}`;
  livesEl.textContent=`❤️ ${Math.max(0,CONFIG.maxLeaks-leaks)}/${CONFIG.maxLeaks}`;
  coinsEl.textContent=`🪙 ${coins}`;shopRender();
}
function showToast(s){} // Sem mensagens no topo do jogo.
// Sons do Level 6: substitua os MP3 na pasta audio para personalizar.
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
  const bonusPorEtapa=[0,0,2,3,4];
  const etapa=Math.floor(Math.min(spawned,CONFIG.totalGoblins)/60);
  return base+etapa*bonusPorEtapa[tipo];
}
function start(){contextAudio();trumpet();stopMusic();stopTowerSounds();backgroundMusic.play().catch(()=>{});document.getElementById('towerTip').hidden=true;document.getElementById('home').hidden=false;document.getElementById('start').textContent='▶ COMEÇAR JOGO';selectedTower=null;coins=CONFIG.startingCoins;leaks=0;spawned=0;killed=0;spawnTimer=0;bossPhase="normal";bossWait=0;bossSpawned=0;bossKilled=0;featherDrop=null;featherMode=false;freezeZones=[];featherEvents=0;finalFeatherTriggered=false;scheduleFeathers();runnerStage=0;runnerSpawned=0;runnerKilled=0;runnersCompleted=0;elapsedGame=0;configurarSurpresas();goblins=[];towers=[];bullets=[];particles=[];selected=0;active=true;finished=false;paused=false;overlay.classList.add('hidden');syncPauseButton();hud()}
function end(win){goblinSurpresa.hidden=true;surpresaFim=0;stopMusic();stopTowerSounds();if(win)applause();else lossSound();document.getElementById('towerTip').hidden=true;active=false;finished=true;paused=false;syncPauseButton();modalIcon.textContent=win?'🏆':'💀';modalTitle.textContent=win?'QUE BELA VITÓRIA!':'GAME OVER';modalText.textContent=win?`Você venceu os 400 goblins e os 2 ogros de 4000 vidas! ${CONFIG.maxLeaks-leaks} vidas restantes.`:`Os goblins chegaram ao castelo. Você derrotou ${killed} inimigos. Tente outra estratégia!`;document.getElementById('start').textContent='↻ REINICIAR';document.getElementById('home').hidden=false;overlay.classList.remove('hidden')}
// Cena de abertura: o MESMO goblin gigante olha ao redor e depois sai correndo.
const introGoblin=document.getElementById('introGoblin');
introGoblin.querySelector('.goblin-personagem').innerHTML=goblinSurpresa.querySelector('.goblin-personagem').innerHTML;
let introEmAndamento=false, introTimer=null;
function iniciarComIntro(){
  if(introEmAndamento)return;
  introEmAndamento=true;
  overlay.classList.add('hidden');
  introGoblin.className='intro-goblin';
  introGoblin.hidden=false;
  introTimer=setTimeout(()=>{
    introGoblin.hidden=true;
    introEmAndamento=false;
    introTimer=null;
    start();
  },3400);
}
document.getElementById('start').addEventListener('click',iniciarComIntro);
function voltarParaMapa(){
  if(PAGINA_MAPA){window.location.assign(PAGINA_MAPA);return;}
  if(window.history.length>1){window.history.back();return;}
  window.location.assign('../mapa/index.html');
}
document.getElementById('home').addEventListener('click',voltarParaMapa);
document.getElementById('continueButton').addEventListener('click',()=>{if(!active||finished)return;paused=false;backgroundMusic.play().catch(()=>{});syncPauseButton();});
document.getElementById('giveUpButton').addEventListener('click',()=>{paused=false;active=false;finished=true;goblinSurpresa.hidden=true;surpresaFim=0;stopMusic();stopTowerSounds();syncPauseButton();voltarParaMapa();});
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
    goblins.push({lane:(spawned-1)%2,pos:-i*spacing,hp:s.hp,maxHp:s.hp,speed:s.speed,wiggle:Math.random()*6.28});
  }
  hud();
  return Math.max(0.18,rule.interval*Math.pow(CONFIG.intervalDecay,level));
}
function posAt(progress,lane=0){const road=paths[lane]||path;const a=Math.floor(progress),f=progress-a,p=road[Math.min(a,road.length-1)],q=road[Math.min(a+1,road.length-1)];return {x:p[0]+(q[0]-p[0])*f+.5,y:p[1]+(q[1]-p[1])*f+.5}}
function burst(x,y,color,n=7){n=Math.min(n,Math.max(0,160-particles.length));for(let i=0;i<n;i++)particles.push({x,y,vx:random(-2,2),vy:random(-2,2),life:random(.2,.6),max:.6,color})}
function update(dt){if(!active||paused)return;
  elapsedGame+=dt;
  atualizarSurpresa();
  spawnTimer-=dt;
  // A magia dura 5 segundos e congela qualquer inimigo que atravesse a área enquanto ativa.
  for(const z of freezeZones)z.time-=dt;
  freezeZones=freezeZones.filter(z=>z.time>0);
  // Os dois ogros só aparecem depois que os 400 goblins terminam.
  if(bossPhase==='normal'&&spawned===CONFIG.totalGoblins&&runnerStage===6&&goblins.length===0){bossPhase='ogres';bossWait=0;showToast('⚠️ DOIS OGROS GIGANTES ESTÃO CHEGANDO!');hud();}
  if(bossPhase==='ogres'&&bossSpawned<OGRE_COUNT){bossWait-=dt;if(bossWait<=0&&goblins.length<CONFIG.maxGoblinsOnMap){bossSpawned++;const lane=Math.random()<.5?0:1;goblins.push({boss:true,lane,pos:0,hp:OGRE_HP,maxHp:OGRE_HP,speed:.60,wiggle:Math.random()*6.28});bossWait=4;hud();}}
  // A pena cai de cima para baixo e desaparece se passar da borda inferior.
  if(featherDrop){featherDrop.y+=featherDrop.speed*dt;if(featherDrop.y>R+1){featherDrop=null;showToast('🪶 A pena saiu do mapa!');}}
  const goblinProgress=spawned+runnerSpawned+runnersCompleted;
  if(bossPhase==='normal'&&featherEvents<5&&goblinProgress>=featherNext&&!featherDrop&&!featherMode){
    if(launchFeather())featherNext+=37+Math.floor(Math.random()*21);
  }
  // A sexta pena é garantida na etapa final, quando um ogro se aproxima do meio.
  if(bossPhase==='ogres'&&!finalFeatherTriggered&&goblins.some(g=>g.boss&&g.pos>=paths[g.lane].length*.40)&&!featherDrop&&!featherMode){
    if(launchFeather())finalFeatherTriggered=true;
  }
  // Três ondas de 20 corredores, total de 60, intercaladas com os normais.
  if(runnerStage===0&&killed>=30){runnerStage=1;runnerSpawned=0;runnerKilled=0;spawnTimer=0;showToast('👟 PRIMEIRA ONDA: 20 CORREDORES!')}
  if(runnerStage===2&&killed>=120){runnerStage=3;runnerSpawned=0;runnerKilled=0;spawnTimer=0;showToast('👟 SEGUNDA ONDA: 20 CORREDORES!')}
  if(runnerStage===4&&killed>=220){runnerStage=5;runnerSpawned=0;runnerKilled=0;spawnTimer=0;showToast('👟 TERCEIRA ONDA: 20 CORREDORES!')}
  if(spawnTimer<=0){
    if(bossPhase!=="normal"){spawnTimer=.3;}else if(runnerStage===1||runnerStage===3||runnerStage===5){
      const slots=CONFIG.maxGoblinsOnMap-goblins.length;
      if(slots>0&&runnerSpawned<20){
        runnerSpawned++;
        const hp=13+Math.floor(spawned/60)*3;
        goblins.push({lane:(spawned+runnerSpawned)%2,pos:-1,hp,maxHp:hp,speed:2.85,wiggle:Math.random()*6.28,runner:true});
        spawnTimer=.48;
      }else spawnTimer=.18;
    }else if(spawned<CONFIG.totalGoblins)spawnTimer=spawnGroup();
  }
  for(const g of goblins){g.slowTimer=Math.max(0,(g.slowTimer||0)-dt);g.frozen=g.pos>=0&&freezeZones.some(z=>{const p=posAt(g.pos,g.lane);return Math.hypot(p.x-z.x,p.y-z.y)<=FREEZE_RADIUS;});if(!g.frozen){const ajusteApos200=spawned>=200?.96:1;const ajusteFinal=(spawned>=300||bossPhase==="ogres")?.96:1;g.pos+=g.speed*(g.slowTimer>0?.48:1)*.92*ajusteApos200*ajusteFinal*(1+Math.min(1.0,elapsedGame/2200))*dt;}if(g.pos>=paths[g.lane||0].length-1){g.dead=true;leaks++;burst(CASTLE_X,CASTLE_Y,'#ff6e65',12);if(g.runner)runnerKilled++;if(g.boss||leaks>=CONFIG.maxLeaks){hud();end(false);return}hud()}}
  goblins=goblins.filter(g=>!g.dead);
  for(const t of towers){t.cool-=dt;if(t.cool>0)continue;const u=CONFIG.defenders[t.type];let target=null,best=-1;for(const g of goblins){if(g.pos<0)continue;const p=posAt(g.pos,g.lane),dist=Math.hypot(p.x-(t.x+.5),p.y-(t.y+.5));if(dist<=u.range&&g.pos>best){best=g.pos;target=g}}if(target){t.cool=u.fireInterval;towerShootSound(t.type);bullets.push({x:t.x+.5,y:t.y+.5,target,damage:damageDaTorre(t.type),color:u.bulletColor,speed:u.splash?8:13,splash:u.splash||0,slowSeconds:u.slowSeconds||0})}}
  for(const b of bullets){if(b.dead)continue;if(b.target.dead){b.dead=true;continue}const p=posAt(b.target.pos,b.target.lane),dx=p.x-b.x,dy=p.y-b.y,d=Math.hypot(dx,dy),step=b.speed*dt;if(d<step+.18){b.dead=true;const victims=b.splash?goblins.filter(g=>!g.dead&&g.pos>=0&&Math.hypot(posAt(g.pos,g.lane).x-p.x,posAt(g.pos,g.lane).y-p.y)<=1.45).slice(0,2):[b.target];
      for(const victim of victims){if(b.slowSeconds&&!victim.boss)victim.slowTimer=Math.max(victim.slowTimer||0,b.slowSeconds);victim.hp-=b.damage;if(victim.hp<=0&&!victim.dead){victim.dead=true;if(victim.boss){bossKilled++;coins+=5;}else if(victim.runner)runnerKilled++;else{killed++;if(killed%2===0)coins++;}burst(p.x,p.y,'#b7e06e',10);goblinDeathSound();hud()}}
      burst(p.x,p.y,b.color,b.splash?16:3);}else{b.x+=dx/d*step;b.y+=dy/d*step}}
  bullets=bullets.filter(b=>!b.dead);goblins=goblins.filter(g=>!g.dead);
  for(const p of particles){p.x+=p.vx*dt;p.y+=p.vy*dt;p.life-=dt}particles=particles.filter(p=>p.life>0);
  if((runnerStage===1||runnerStage===3||runnerStage===5)&&runnerSpawned===20&&runnerKilled===20){runnerStage++;runnersCompleted+=20;spawnTimer=.4;showToast('👹 Os goblins normais voltaram!');hud()}
  if(bossPhase==='ogres'&&bossSpawned===OGRE_COUNT&&bossKilled===OGRE_COUNT&&goblins.length===0){bossPhase='done';hud();end(true)}
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
  // Pontos vermelhos se movem junto com cada goblin em tempo real.
  mc.fillStyle=MINIMAP.goblin;mc.shadowColor='#ff2020';mc.shadowBlur=3;
  for(const g of goblins){if(g.pos<0)continue;const p=posAt(g.pos,g.lane);if(p.x<0||p.x>C||p.y<0||p.y>R)continue;mc.beginPath();mc.arc(p.x*m,p.y*m,Math.max(2,m*(g.boss?.52:.33)),0,Math.PI*2);mc.fill()}
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
 goblin3:["....NNNN....","..NNNNNNNN..",".NNGGGGGGNN.","NNGGGGGGGGNN","NGGWWGGWWGGN","NGGGKKGGGGGN","..GGGGGGGG..","..BBBBBBBB..",".NBBBBBBBBN.","..NBBBBBBN..","...DD..DD...","..DD....DD.."],
 runner:["....NNNN....","...NGGGGN...","..NGGGGGGN..","..GGWWWWGG..","...GKKKKG...","....GGGG....","...TTTTTT...","..NTTTTTTN..","...TT..TT...","...DD..DD...","..DD....DD..",".DD......DD."],
 goblin:["....RRRR....","..RRRRRRRR..",".RRDRRRRDRR.","RRRRRRRRRRRR","RDRWWRRWWRDR","RRRKKRRKKRRR",".RRRRRRRRRR.","..RRDDDDRR..","..DRRRRRRD..","..DDRRRRDD..","...DD..DD...","..DD....DD.."],
 archer:["....HHHH....","...HHHHHH...","...HSSSSH...","...HKBKSH...","....SSSS....","..GGGGGGGG..",".GGGGBBGGGG.",".GGGGBBGGGG.","...BB..BB...","...BB..BB...","..DDD..DDD..","..DDD..DDD.."],
 mage:[".....PP.....","....PPPP....","...PPPPPP...","..PPPPPPPP..","...PSSSSP...","....SKKS....","...BBBBBB...","..BBBBBBBB..","..BBBBBBBB..","..BBBBBBBB..","..BBBBBBBB..","..DD....DD.."],
 warrior:["....CCCC....","...CCCCCC...","...CSSSSC...","...CSK KSC...".replace(' ',''),"....SSSS....","..AAAAAAAA..","..AAABBAAA..","..AAABBAAA..","...AABBAA...","...BB..BB...","..DDD..DDD..","..DDD..DDD.."],
 dragon:["RR........RR","RRR......RRR",".RRR.RR.RRR.","..RRRRRRRR..","..RRYYRRYY..","...RRKKRR...",".RRRRRRRRRR.","RRRRRRRRRRRR",".RRRRRRRRRR.","..RRRRRRRR..","..DD....DD..",".DDD....DDD."],
 castle:["..CC......CC..","..CC..CC..CC..","..CCCCCCCCCC..","..CCCCCCCCCC..","..CCDDDDDDCC..","..CCDDDDDDCC..","CCCCDDDDDDCCCC","CCCCDDDDDDCCCC","CCCCDDDDDDCCCC","CCCCDDDDDDCCCC","CCCCDDKKDDCCCC","CCCCDDKKDDCCCC","CCCCDDKKDDCCCC","CCCCCCCCCCCCCC"]
};
const PALETTE={Q:'#f6faff',J:'#d4e4ed',L:'#b9cddc',N:'#244b51',T:'#bd633c',R:'#e7444a',D:'#74212b',W:'#fff3d6',K:'#22212a',H:'#79542c',S:'#f4c69d',B:'#3668b2',G:'#368448',P:'#8b50d3',C:'#aeb6bd',A:'#d3ad60',Y:'#ffdf74'};
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
 ["....CCCCCC......","...CCWWWWCC.....","..CCWWWWWWCC....","..CCWWWWWWCC....","...CCCCCCCC.....","..DDDDDDDDDD....","..DSSSSSSSSD....","..DSSKSSKSSD....","..DSSSSSSSSD....","..DWWWWWWWWD....","..DWWWWWWWWD....","..DWWDDWWWWD....","..DWWDDWWWWD....","..DWWDDWWWWD....","..DWWDDWWWWD....","..BBBBBBBBBB...."]
];
const HOUSE_PALETTE={D:'#50372b',W:'#b5a38b',S:'#e4b781',K:'#26262b',B:'#4b4d51',R:'#b63831',C:'#757d88',Y:'#e6c65a'};
const houseCache=new Map();
function renderHouse(c,art,x,y,size){const sz=Math.max(8,Math.round(size)),id=HOUSE_ART.indexOf(art),key=id+':'+sz;let cached=houseCache.get(key);if(!cached){cached=document.createElement('canvas');cached.width=sz+2;cached.height=sz+2;const b=cached.getContext('2d'),px=sz/art.length;for(let j=0;j<art.length;j++)for(let i=0;i<art[j].length;i++){const color=HOUSE_PALETTE[art[j][i]];if(color){b.fillStyle=color;b.fillRect(Math.round(i*px),Math.round(j*px),Math.ceil(px),Math.ceil(px))}}houseCache.set(key,cached)}c.drawImage(cached,Math.round(x-sz/2),Math.round(y-sz/2))}
function drawShopHouse(canvas,type){if(!canvas)return;const c=canvas.getContext('2d');c.imageSmoothingEnabled=false;c.clearRect(0,0,48,48);renderHouse(c,HOUSE_ART[type],24,24,44)}
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
  renderHouse(ctx,HOUSE_ART[t.type],px,py-tile*.13,tile*.95);
 }
 if(selectedTower&&towers.includes(selectedTower)){
  const px=(selectedTower.x+.5)*tile,py=(selectedTower.y+.5)*tile;
  const bx=px+tile*.18,by=py-tile*.34,rad=tile*.19;
  ctx.fillStyle='#e52f39';ctx.fillRect(Math.round(bx-rad),Math.round(by-rad),Math.round(rad*2),Math.round(rad*2));
  ctx.strokeStyle='#fff';ctx.lineWidth=Math.max(2,tile*.065);ctx.beginPath();ctx.moveTo(bx-rad*.37,by-rad*.37);ctx.lineTo(bx+rad*.37,by+rad*.37);ctx.moveTo(bx+rad*.37,by-rad*.37);ctx.lineTo(bx-rad*.37,by+rad*.37);ctx.stroke();
 }
 for(const g of goblins){
  if(g.pos<0)continue;const p=posAt(g.pos,g.lane),px=p.x*tile,py=p.y*tile;
  pixelEllipse(px,py+tile*.23,tile*.27,tile*.11,'#47392b');
  sprite(g.boss?'ogreWhite':g.runner?'runner':'goblin3',px,py-tile*.10+Math.round(Math.sin(time*(g.runner?20:12)+g.wiggle)*2),tile*(g.boss?1.48:g.runner?.60:.69));
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
 for(const b of bullets){const n=Math.max(4,Math.round(tile*.12));ctx.fillStyle=b.color;ctx.fillRect(Math.round(b.x*tile-n/2),Math.round(b.y*tile-n/2),n,n)}
 for(const p of particles){ctx.globalAlpha=Math.max(0,p.life/p.max);const n=Math.max(3,Math.round(tile*.10));ctx.fillStyle=p.color;ctx.fillRect(Math.round(p.x*tile),Math.round(p.y*tile),n,n);ctx.globalAlpha=1}
}
// Um toque no defensor exibe o X. Um toque fora dele esconde o X.
// O X tem uma área de toque um pouco maior para facilitar no celular.
// Clique ou toque curto posiciona/seleciona; arrastar desloca o mapa sem comprar.
let press=null;
canvas.addEventListener('pointerdown',e=>{if(!active||paused||!goblinSurpresa.hidden)return;press={x:e.clientX,y:e.clientY};});
canvas.addEventListener('pointercancel',()=>press=null);
canvas.addEventListener('pointerup',e=>{
  if(!active||paused||!goblinSurpresa.hidden||!press)return;
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
  towers.push({x,y,type:selected,cool:0});coins-=u.cost;hud();towerPlacementSound();burst(x+.5,y+.5,'#f5df8a',8);
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
