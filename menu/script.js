'use strict';
// ALTERE SOMENTE ESTA LINHA para escolher a página do botão INICIAR JOGO.
// Pode ser um arquivo local (ex.: './mapa/index.html') ou uma URL https://.
const PAGINA_INICIAR = '../mapa/index.html';

const $ = (id) => document.getElementById(id);
const dialog = $('panel');
function showPanel(title, content) {
  $('panelTitle').textContent = title;
  $('panelContent').replaceChildren();
  if (typeof content === 'string') $('panelContent').textContent = content;
  else $('panelContent').append(content);
  if (!dialog.open) dialog.showModal();
}
function button(text, action) {
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'option'; b.textContent = text;
  b.addEventListener('click', action); return b;
}
function iniciarJogo() {
  const destino = PAGINA_INICIAR.trim();
  if (!destino) return;
  window.location.assign(destino);
}
$('playBtn').addEventListener('click', iniciarJogo);
$('howBtn').addEventListener('click', () => {
  const c = document.createElement('div');
  const p = document.createElement('p');
  p.textContent = 'Defenda o castelo dos goblins vermelhos!';
  const ul = document.createElement('ul');
  for (const t of ['Comece com 5 moedas e compre torres de arqueiros.', 'Posicione as torres na grama perto da estrada.', 'Ganhe 1 moeda a cada 2 goblins derrotados.', 'Não deixe 4 goblins chegarem ao castelo.', 'Use PAUSAR para interromper a partida.']) {
    const li = document.createElement('li'); li.textContent = t; ul.append(li);
  }
  c.append(p, ul); showPanel('COMO JOGAR', c);
});
// Reinicia apenas o progresso das fases, preservando preferências e áudios.
$('newGameBtn').addEventListener('click', () => {
  const c = document.createElement('div');
  const p = document.createElement('p');
  p.textContent = 'Reiniciar todo o progresso? Todas as fases concluídas serão bloqueadas novamente e você começará pelo Level 1. Esta ação não pode ser desfeita.';
  const confirm = button('🔄 SIM, REINICIAR TUDO', () => {
    localStorage.setItem('reino_levels_done', '0');
    // Mantém a versão de inicialização do mapa para evitar novo reset automático.
    localStorage.setItem('reino_reset_version', 'mapa-reinicio-2026-11-09-v1');
    window.location.assign(PAGINA_INICIAR);
  });
  const cancel = button('CANCELAR', () => dialog.close());
  c.append(p, confirm, cancel);
  showPanel('NOVO JOGO', c);
});
$('closePanel').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', e => { if (e.target === dialog) dialog.close(); });
if (localStorage.getItem('menuAnimations') === 'off') document.body.classList.add('no-animation');

// Efeito de clique discreto; nenhuma música é reproduzida.
const AudioMenu = (() => {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  let ctx;
  let clicksOn = localStorage.getItem('medievalClicks') !== 'off';
  function click() {
    if (!clicksOn || !Ctx) return;
    try {
      if (!ctx) ctx = new Ctx();
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      const t = ctx.currentTime + 0.005;
      for (const [frequency, delay, duration, volume] of [[650, 0, 0.09, 0.035], [880, 0.045, 0.12, 0.024]]) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = frequency;
        gain.gain.setValueAtTime(0.0001, t + delay);
        gain.gain.exponentialRampToValueAtTime(volume, t + delay + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + delay + duration);
        osc.connect(gain); gain.connect(ctx.destination);
        osc.start(t + delay); osc.stop(t + delay + duration + 0.02);
      }
    } catch (_) { /* Navegadores sem áudio seguem funcionando. */ }
  }
  function setClicks(value) {
    clicksOn = value;
    localStorage.setItem('medievalClicks', value ? 'on' : 'off');
  }
  document.addEventListener('click', e => {
    if (e.target.closest('button')) click();
  }, true);
  return { setClicks, get clicksOn() { return clicksOn; } };
})();

// Suspende animações decorativas quando o menu não está visível.
function atualizarVisibilidade() {
  document.body.classList.toggle('aba-oculta', document.hidden);
}
document.addEventListener('visibilitychange', atualizarVisibilidade, {passive:true});
atualizarVisibilidade();
