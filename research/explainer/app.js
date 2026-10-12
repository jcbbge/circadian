(() => {
  'use strict';
  const exhibits = JSON.parse(document.getElementById('exhibit-data').textContent);
  const $ = id => document.getElementById(id);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let selected = 0, state = 0, touring = !reduced.matches, timer = 0, visible = false, hovered = false, focused = false;
  const tools = $('tools'), states = $('states'), plate = $('plate');
  const set = (id, text) => { $(id).textContent = text; };
  const list = (id, values) => { $(id).replaceChildren(...values.map(text => { const li = document.createElement('li'); li.textContent = text; return li; })); };
  const stopTimer = () => { clearTimeout(timer); timer = 0; };
  function schedule(delay = 6000) {
    stopTimer();
    if (touring && visible && !hovered && !focused && !reduced.matches && !document.hidden) timer = setTimeout(() => { chooseState(1 - state); }, delay);
  }
  function chooseState(index) {
    state = index;
    const exhibit = exhibits[selected], value = exhibit.states[state];
    $('art').querySelectorAll('.art-layer').forEach((el, i) => el.classList.toggle('is-current', i === state));
    states.querySelectorAll('button').forEach((b, i) => b.setAttribute('aria-pressed', String(i === state)));
    set('readout', value.readout); set('outcome-title', value.title); set('outcome-explanation', value.explanation);
    list('inputs', value.inputs); list('outputs', value.lines);
    set('raw', JSON.stringify({ selectedCase: value.raw, additionalBoundaryEvidence: exhibit.extra.raw ?? null }, null, 2));
    plate.dataset.state = value.key; plate.dataset.proposal = exhibit.id;
    plate.setAttribute('aria-label', `${exhibit.title}. ${value.label}: ${value.readout}. Left and right arrows switch condition.`);
    schedule();
  }
  function chooseTool(index, focus = false) {
    selected = index;
    const x = exhibits[selected];
    tools.querySelectorAll('button').forEach((b, i) => { b.setAttribute('aria-selected', String(i === index)); b.tabIndex = i === index ? 0 : -1; });
    $('tool-panel').setAttribute('aria-labelledby', `tool-${x.id}`);
    set('tool-kicker', `${x.id} / ${x.title}`); set('question', x.question); set('premise', x.premise);
    set('figure-no', `FIG ${x.id}`); set('figure-title', x.verb); set('mechanism', x.mechanism);
    set('benefit', x.benefit); set('where', x.where); set('math', x.math); set('limit', x.limit); set('extra-note', x.extra.note);
    $('art').innerHTML = x.states.map(s => `<div class="art-layer">${s.svg}</div>`).join('');
    states.replaceChildren(...x.states.map((s, i) => { const b = document.createElement('button'); b.className = 'state-button'; b.textContent = s.label; b.setAttribute('aria-pressed', 'false'); b.addEventListener('click', () => chooseState(i)); return b; }));
    $('source-code').href = `../prototypes/${x.directory}/index.ts`;
    set('chapter-count', `${x.id} of 06`);
    $('next').innerHTML = index === exhibits.length - 1 ? 'Back to the first instrument <span aria-hidden="true">↺</span>' : 'Next instrument <span aria-hidden="true">→</span>';
    chooseState(0);
    if (focus) tools.children[index].focus();
  }
  exhibits.forEach((x, i) => {
    const b = document.createElement('button'); b.id = `tool-${x.id}`; b.className = 'tool-button'; b.setAttribute('role', 'tab'); b.setAttribute('aria-controls', 'tool-panel');
    b.innerHTML = `<span class="num">${x.id}</span><span><strong>${x.title}</strong><small>${x.verb}</small></span>`;
    b.addEventListener('click', () => chooseTool(i));
    b.addEventListener('keydown', e => { let next;
      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') next = (selected + 1) % exhibits.length;
      if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') next = (selected + exhibits.length - 1) % exhibits.length;
      if (e.key === 'Home') next = 0; if (e.key === 'End') next = exhibits.length - 1;
      if (next !== undefined) { e.preventDefault(); chooseTool(next, true); }
    }); tools.append(b);
  });
  plate.addEventListener('keydown', e => { if (['ArrowLeft', 'ArrowRight', ' ', 'Enter'].includes(e.key)) { e.preventDefault(); chooseState(e.key === 'ArrowLeft' ? 0 : e.key === 'ArrowRight' ? 1 : 1 - state); } });
  plate.addEventListener('click', () => chooseState(1 - state));
  $('next').addEventListener('click', () => { chooseTool((selected + 1) % exhibits.length); $('tool-panel').scrollIntoView({ behavior: reduced.matches ? 'instant' : 'smooth', block: 'start' }); $('tool-panel').focus({ preventScroll: true }); });
  function tourLabel() { $('tour').setAttribute('aria-pressed', String(touring)); $('tour').innerHTML = `Auto demo <span>${touring ? 'on' : 'off'}</span>`; }
  $('tour').addEventListener('click', () => { touring = !touring; tourLabel(); schedule(); });
  $('tool-panel').addEventListener('pointerenter', () => { hovered = true; stopTimer(); });
  $('tool-panel').addEventListener('pointerleave', () => { hovered = false; schedule(3600); });
  $('tool-panel').addEventListener('focusin', () => { focused = true; stopTimer(); });
  $('tool-panel').addEventListener('focusout', e => { focused = !!e.relatedTarget && $('tool-panel').contains(e.relatedTarget); schedule(3600); });
  new IntersectionObserver(entries => { visible = entries[entries.length - 1].isIntersecting; schedule(); }).observe(plate);
  document.addEventListener('visibilitychange', () => schedule());
  reduced.addEventListener('change', () => { if (reduced.matches) touring = false; tourLabel(); schedule(); });
  $('theme').addEventListener('click', () => { const dark = document.body.dataset.theme !== 'dark'; document.body.dataset.theme = dark ? 'dark' : 'light'; $('theme').innerHTML = `${dark ? 'Dark' : 'Light'} <span aria-hidden="true">◐</span>`; $('theme').setAttribute('aria-label', `Switch to ${dark ? 'light' : 'dark'} appearance`); });
  chooseTool(0); tourLabel();
})();
