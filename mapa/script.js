'use strict';
const map=document.getElementById('map'),canvas=document.getElementById('scene'),ctx=canvas.getContext('2d',{alpha:false}),nodes=document.getElementById('nodes');
const TOTAL=20,HEIGHT=4200,biomes=[{name:'Floresta Encantada',icon:'🌲',base:'#3d7141',dark:'#214a34',light:'#75a453',path:'#c3a06b',detail:'Entre árvores e aldeias.'},{name:'Terras Nevadas',icon:'❄️',base:'#a4c7d4',dark:'#6b9eb2',light:'#dceff0',path:'#a6a5a1',detail:'Atravesse a neve e os lagos congelados.'},{name:'Montanhas Rochosas',icon:'🪨',base:'#827b6c',dark:'#575a56',light:'#aca392',path:'#c1a27b',detail:'Enfrente as pedras e montanhas.'},{name:'Penhascos Sombrios',icon:'⛰️',base:'#685a63',dark:'#383c4e',light:'#9d8191',path:'#ad8b79',detail:'Caminhe por pontes e abismos.'},{name:'Reino da Lava',icon:'🌋',base:'#5b2c2b',dark:'#291e29',light:'#9c4731',path:'#c18b65',detail:'Chegue ao coração do vulcão.'}];
// Reinício único do progresso nesta versão do mapa.
// Não reinicia novamente a cada visita: vitórias futuras continuam salvas.
const RESET_VERSION='mapa-reinicio-2026-11-09-v1';
if(localStorage.getItem('reino_reset_version')!==RESET_VERSION){
  localStorage.setItem('reino_levels_done','0');
  localStorage.setItem('reino_reset_version',RESET_VERSION);
}
let completed=Math.max(0,Math.min(20,Number(localStorage.getItem('reino_levels_done'))||0)),selected=1,paused=false;
const rng=(seed)=>{let s=seed|0;return()=>((s=Math.imul(s,1664525)+1013904223|0)>>>0)/4294967296};
const rand=rng(74121),positions=Array.from({length:20},(_,i)=>({x:.5+Math.sin(i*1.57+.5)*.29,y:HEIGHT-160-i*203}));
function resize(){const w=map.clientWidth,dpr=Math.min(devicePixelRatio||1,1.5);canvas.width=Math.round(w*dpr);canvas.height=Math.round(HEIGHT*dpr);canvas.style.height=HEIGHT+'px';ctx.setTransform(dpr,0,0,dpr,0,0);drawTerrain(w);positionNodes(w)}
function biomeAt(y){const level=(HEIGHT-160-y)/203+1;return level<5?0:level<10?1:level<15?2:level<20?3:4}
function roadX(y,w){const index=(HEIGHT-160-y)/203,low=Math.max(0,Math.min(19,Math.floor(index))),high=Math.min(19,low+1),t=Math.max(0,Math.min(1,index-low)),smooth=t*t*(3-2*t);return ((positions[low].x*(1-smooth)+positions[high].x*smooth))*w}
// Mistura orgânica dos cinco biomas, sem linhas retas entre regiões.
const CENARIO=window.CENARIO_MAPA||{};
const regionKeys=['floresta','neve','rochas','penhascos','lava'];
const region=(i)=>CENARIO[regionKeys[i]]||{};
const feature=(i,key)=>region(i)[key]||{};
const enabled=(i,key)=>feature(i,key).mostrar!==false;
const density=(i,key)=>Math.max(0,Math.min(5,Number(feature(i,key).quantidade??1)));
const color=(i,key,defaultColor)=>feature(i,key).cor||defaultColor;
const palette=['#3d7141','#a4c7d4','#827b6c','#685a63','#5b2c2b'].map((c,i)=>region(i).fundo||c);
const rgb=h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16));
const blend=(a,b,t)=>{const x=rgb(a),y=rgb(b);return `rgb(${x.map((v,i)=>Math.round(v*(1-t)+y[i]*t)).join(',')})`};
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const smooth=t=>{t=clamp(t,0,1);return t*t*(3-2*t)};
const hash=(x,y)=>{let v=Math.imul(x|0,374761393)+Math.imul(y|0,668265263);v=Math.imul(v^(v>>>13),1274126177);return ((v^(v>>>16))>>>0)/4294967295};
const noise=(x,y)=>{const ix=Math.floor(x),iy=Math.floor(y),fx=smooth(x-ix),fy=smooth(y-iy);return (hash(ix,iy)*(1-fx)+hash(ix+1,iy)*fx)*(1-fy)+(hash(ix,iy+1)*(1-fx)+hash(ix+1,iy+1)*fx)*fy};
function biomeMix(x,y,w){
  // As transições começam nos levels 4, 9, 14 e 19.
  // Cada região seguinte se revela aos poucos até o próximo level.
  const distortion=(noise(x/185,y/230)-.5)*110+(noise(x/72,y/100)-.5)*40+Math.sin(y/107+x/130)*12;
  const level=(HEIGHT-160-y+distortion)/203+1;
  const thresholds=[4,9,14,19];
  let lower=0,upper=0,t=0;
  for(let i=0;i<thresholds.length;i++){
    if(level>=thresholds[i]+1){lower=i+1;upper=i+1;continue}
    if(level>=thresholds[i]){lower=i;upper=i+1;t=smooth(level-thresholds[i]);break}
    break;
  }
  return {lower,upper,t,phase:lower+t};
}
function drawTerrain(w){
  ctx.clearRect(0,0,w,HEIGHT);
  // Fundo pintado em faixas pequenas com cores interpoladas e bordas irregulares.
  const step=12;
  for(let y=0;y<HEIGHT;y+=step)for(let x=0;x<w;x+=step){
    const b=biomeMix(x+step/2,y+step/2,w),variation=(noise(x/41,y/41)-.5)*.17;
    const c=blend(palette[b.lower],palette[b.upper],b.t);
    ctx.fillStyle=c;ctx.fillRect(x,y,step+1,step+1);
    ctx.fillStyle=variation>0?'rgba(255,255,255,.045)':'rgba(0,0,0,.045)';
    ctx.fillRect(x,y,step+1,step+1);
  }
  // Rios configuráveis: desenhados sob a estrada para preservar o caminho das fases.
  for(let biome=0;biome<5;biome++){
    if(!enabled(biome,'rios'))continue;
    const cfg=feature(biome,'rios'),amount=Math.max(0,Math.min(4,Math.round(density(biome,'rios'))));
    for(let j=0;j<amount;j++){
      const baseX=w*(.14+.72*((j+.5)/Math.max(1,amount)));
      const riverWidth=Math.max(3,Number(cfg.largura)||12);
      ctx.save();ctx.beginPath();let active=false;
      for(let y=0;y<HEIGHT;y+=8){
        const mix=biomeMix(baseX,y,w);
        const inRegion=mix.lower===biome||mix.upper===biome;
        if(!inRegion){active=false;continue}
        const x=baseX+Math.sin(y/105+j*2.3)*w*.065+Math.sin(y/43+j)*w*.016;
        if(!active){ctx.moveTo(x,y);active=true}else ctx.lineTo(x,y);
      }
      ctx.strokeStyle=color(biome,'rios','#4ba7c5');ctx.lineWidth=riverWidth;ctx.lineJoin='round';ctx.lineCap='round';ctx.stroke();
      ctx.globalAlpha=.28;ctx.strokeStyle='#ffffff';ctx.lineWidth=Math.max(1,riverWidth*.18);ctx.stroke();ctx.restore();
    }
  }
  // Elementos de cenário determinísticos, agrupados naturalmente e com mistura entre biomas.
  const r=rng(392048),count=Math.ceil(w*HEIGHT/2100);
  for(let k=0;k<count;k++){
    const x=r()*w,y=r()*HEIGHT,sz=5+r()*12,b=biomeMix(x,y,w);
    const biome=r()<b.t?b.upper:b.lower;
    // Espaço para a estrada e os botões de fase.
    if(Math.abs(x-roadX(y,w))<Math.max(40,w*.09))continue;
    const key=['arvores','pinheiros','pedras','montanhas','vulcoes'][biome];
    if(!enabled(biome,key)||r()>Math.min(1,density(biome,key)/1.5))continue;
    ctx.save();ctx.translate(x,y);
    if(biome===0){
      // Árvores com copa e tronco; algumas ganham neve na transição.
      ctx.fillStyle='#513b2a';ctx.fillRect(-2,0,4,sz*.65);
      ctx.fillStyle=color(0,'arvores','#397c43');ctx.beginPath();ctx.arc(0,-sz*.35,sz*.65,0,Math.PI*2);ctx.fill();
      if(enabled(0,'flores')&&r()<density(0,'flores')*.18){ctx.fillStyle=color(0,'flores','#ffe789');ctx.beginPath();ctx.arc(sz*.7,sz*.4,2.2,0,Math.PI*2);ctx.fill()}
      if(b.t>.23&&r()<b.t*.85){ctx.fillStyle='#e8f5f6';ctx.beginPath();ctx.ellipse(-2,-sz*.65,sz*.48,sz*.18,-.2,0,Math.PI*2);ctx.fill()}
    }else if(biome===1){
      if(r()<.52){ctx.fillStyle=color(1,'pinheiros','#597c79');ctx.beginPath();ctx.moveTo(0,-sz);ctx.lineTo(-sz*.62,sz*.6);ctx.lineTo(sz*.62,sz*.6);ctx.fill();ctx.fillStyle='#edfaff';ctx.beginPath();ctx.moveTo(0,-sz);ctx.lineTo(-sz*.27,-sz*.2);ctx.lineTo(sz*.27,-sz*.2);ctx.fill()}
      else if(enabled(1,'neveNoChao')&&r()<Math.min(1,density(1,'neveNoChao'))){ctx.fillStyle='#f1fbff';ctx.beginPath();ctx.ellipse(0,0,sz,sz*.48,0,0,Math.PI*2);ctx.fill()}
    }else if(biome===2){
      ctx.fillStyle=color(2,'pedras','#4b514f');ctx.beginPath();ctx.moveTo(-sz,sz*.45);ctx.lineTo(-sz*.32,-sz*.7);ctx.lineTo(sz*.42,-sz*.55);ctx.lineTo(sz,sz*.45);ctx.closePath();ctx.fill();ctx.fillStyle='#b7afa0';ctx.beginPath();ctx.moveTo(-sz*.32,-sz*.7);ctx.lineTo(sz*.42,-sz*.55);ctx.lineTo(sz*.15,-sz*.1);ctx.fill();
    }else if(biome===3){
      ctx.fillStyle=color(3,'montanhas','#373342');ctx.beginPath();ctx.moveTo(-sz,sz*.65);ctx.lineTo(-sz*.5,-sz*.9);ctx.lineTo(sz*.4,-sz*.7);ctx.lineTo(sz,sz*.65);ctx.closePath();ctx.fill();ctx.strokeStyle='#a78a82';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(-sz*.5,-sz*.9);ctx.lineTo(-sz*.2,sz*.2);ctx.lineTo(sz*.4,-sz*.7);ctx.stroke();
    }else{
      ctx.fillStyle=color(4,'vulcoes','#251b21');ctx.beginPath();ctx.ellipse(0,0,sz,sz*.7,0,0,Math.PI*2);ctx.fill();ctx.strokeStyle=r()>.35?'#ff8a2d':'#e34924';ctx.lineWidth=2+r()*2;ctx.beginPath();ctx.moveTo(-sz*.7,sz*.1);ctx.lineTo(0,-sz*.15);ctx.lineTo(sz*.65,sz*.25);ctx.stroke();
    }
    ctx.restore();
  }
  // Estrada única, acompanhando os cinco ambientes, com bordas e textura suave.
  ctx.lineJoin='round';ctx.lineCap='round';
  const drawLine=(width,color,dash=[])=>{ctx.beginPath();for(let y=HEIGHT+30;y>=-30;y-=6){const x=roadX(y,w);if(y===HEIGHT+30)ctx.moveTo(x,y);else ctx.lineTo(x,y)}ctx.lineWidth=width;ctx.strokeStyle=color;ctx.setLineDash(dash);ctx.stroke();ctx.setLineDash([])};
  const roadWidth=Math.max(49,Math.min(84,w*.14));
  drawLine(roadWidth+10,'#40392e');drawLine(roadWidth+3,'#8c745b');drawLine(roadWidth-5,'#c6aa80');
  // A estrada ganha pó de neve, cinza e brasas de acordo com o terreno.
  for(let y=0;y<HEIGHT;y+=16){const x=roadX(y,w),b=biomeMix(x,y,w),phase=b.phase;
    if(phase>.85&&phase<2.0){ctx.fillStyle='rgba(244,250,255,.32)';ctx.beginPath();ctx.arc(x+(hash(y,2)-.5)*roadWidth*.65,y,2.3,0,Math.PI*2);ctx.fill()}
    if(phase>3.65){ctx.fillStyle='rgba(255,133,43,.5)';ctx.fillRect(x+(hash(y,7)-.5)*roadWidth*.7,y,2,3)}
  }
  // Marcos visuais das fases, sem alterar os botões interativos.
  for(let i=0;i<20;i++){const p=positions[i],x=p.x*w,y=p.y,b=biomeAt(y),side=(i%2?1:-1),offset=Math.min(115,w*.22),lx=clamp(x+side*offset,30,w-30);
    ctx.save();ctx.translate(lx,y-30);ctx.font=`${Math.max(26,Math.min(43,w*.09))}px serif`;ctx.textAlign='center';ctx.shadowColor='#0007';ctx.shadowBlur=8;ctx.fillText(['🌳','🏔️','🪨','🦅','🔥'][b],0,0);ctx.restore()}
}
function positionNodes(w){nodes.innerHTML='';positions.forEach((p,i)=>{const n=i+1,el=document.createElement('button');el.className='node '+(n<=completed?'done':n===completed+1?'current':'locked');el.style.left=(p.x*w)+'px';el.style.top=p.y+'px';el.dataset.label=(window.CONFIG_LEVELS?.[n]?.nome||'Level '+n);el.setAttribute('aria-label',el.dataset.label);el.innerHTML=n<=completed?'✓':n>completed+1?'<span class="lock">🔒</span>':n;el.onclick=()=>openLevel(n);nodes.appendChild(el)})}
const dlg=document.getElementById('info');function openLevel(n){selected=n;const b=biomes[n<=4?0:n<=9?1:n<=14?2:n<=19?3:4];document.getElementById('biomeIcon').textContent=b.icon;document.getElementById('levelTitle').textContent=(window.CONFIG_LEVELS?.[n]?.nome||'Level '+n);document.getElementById('levelDesc').textContent=window.CONFIG_LEVELS?.[n]?.descricao ?? (b.name+' — '+b.detail);const locked=n>completed+1;document.getElementById('status').textContent=locked?'🔒 Complete as fases anteriores para liberar.':n<=completed?'✓ Fase concluída':'⭐ Fase disponível';document.getElementById('play').disabled=locked;dlg.showModal()}
document.getElementById('close').onclick=()=>dlg.close();document.getElementById('play').onclick=()=>{if(selected>completed+1)return;const file=(window.CONFIG_LEVELS?.[selected]?.arquivo||'');if(!file){alert('Configure o endereço do Level '+selected+' no arquivo links-levels.js');return}location.href=file};
window.addEventListener('pageshow',()=>{const novo=Math.max(0,Math.min(20,Number(localStorage.getItem('reino_levels_done'))||0));if(novo!==completed){completed=novo;positionNodes(map.clientWidth)}});
let resizeTimeout;addEventListener('resize',()=>{clearTimeout(resizeTimeout);resizeTimeout=setTimeout(resize,150)},{passive:true});resize();requestAnimationFrame(()=>{const p=positions[Math.min(completed,19)];map.scrollTop=Math.max(0,p.y-map.clientHeight*.58)});

// BOTÃO TEMPORÁRIO: libera a próxima fase, sem entrar no jogo.
const skipLevelButton=document.getElementById('skipLevel');
function refreshSkipButton(){
  skipLevelButton.disabled=completed>=20;
  skipLevelButton.textContent=completed>=20?'✓ Todas liberadas':'⏭ Pular fase';
}
skipLevelButton.addEventListener('click',()=>{
  if(completed>=20)return;
  completed++;
  localStorage.setItem('reino_levels_done',String(completed));
  positionNodes(map.clientWidth);
  refreshSkipButton();
});
window.addEventListener('pageshow',refreshSkipButton);
refreshSkipButton();
