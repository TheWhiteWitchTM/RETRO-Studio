export function $(selector) {
  return document.querySelector(selector);
}

export function toast(message) {
  const host = $('#toasts');
  const item = document.createElement('div');
  item.className = 'toast';
  item.textContent = message;
  host.appendChild(item);
  setTimeout(() => item.remove(), 3200);
}

export function ask({ title, message = '', value = '', placeholder = '', input = false, wide = false, fill = null, buttons }) {
  const host = $('#modal');
  const actions = buttons || [
    { id: 'cancel', label: 'Cancel' },
    { id: 'ok', label: 'OK', primary: true },
  ];
  host.innerHTML = '';
  host.hidden = false;
  const card = document.createElement('form');
  card.className = wide ? 'modal-card wide' : 'modal-card';
  const heading = document.createElement('h2');
  heading.textContent = title;
  card.appendChild(heading);
  const body = document.createElement('div');
  card.appendChild(body);
  let field = null;
  if (input) {
    field = document.createElement('input');
    field.value = value;
    field.placeholder = placeholder;
    field.spellcheck = false;
    body.appendChild(field);
  }
  const row = document.createElement('div');
  row.className = 'modal-actions';
  card.appendChild(row);
  host.appendChild(card);

  return new Promise((resolve) => {
    let settled = false;
    const finish = (id) => {
      if (settled) return;
      settled = true;
      host.hidden = true;
      host.innerHTML = '';
      if (!id || id === 'cancel') {
        resolve(null);
        return;
      }
      resolve({ id, value: field ? field.value : '' });
    };
    if (fill) fill(body, finish);
    else if (message) {
      const copy = document.createElement('p');
      copy.textContent = message;
      body.appendChild(copy);
    }
    for (const button of actions) {
      const el = document.createElement('button');
      el.type = 'button';
      el.textContent = button.label;
      el.className = button.primary ? 'primary' : button.danger ? 'danger' : '';
      el.addEventListener('click', () => finish(button.id));
      row.appendChild(el);
    }
    card.addEventListener('submit', (event) => {
      event.preventDefault();
      const primary = actions.find((button) => button.primary) || actions[actions.length - 1];
      finish(primary.id);
    });
    host.addEventListener('mousedown', function outside(event) {
      if (event.target !== host) return;
      host.removeEventListener('mousedown', outside);
      finish(null);
    });
    document.addEventListener('keydown', function onKey(event) {
      if (host.hidden) {
        document.removeEventListener('keydown', onKey);
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        document.removeEventListener('keydown', onKey);
        finish(null);
      }
    });
    if (field) {
      field.focus();
      field.select();
    } else {
      const primary = row.querySelector('.primary') || row.querySelector('button');
      primary?.focus();
    }
  });
}

export function contextMenu(x, y, items) {
  const menu = $('#ctx');
  menu.innerHTML = '';
  menu.hidden = false;
  for (const item of items) {
    if (item.separator) {
      const rule = document.createElement('div');
      rule.className = 'ctx-sep';
      menu.appendChild(rule);
      continue;
    }
    const row = document.createElement('button');
    row.type = 'button';
    row.textContent = item.label;
    row.addEventListener('click', () => {
      menu.hidden = true;
      item.run();
    });
    menu.appendChild(row);
  }
  menu.style.left = '0px';
  menu.style.top = '0px';
  const rect = menu.getBoundingClientRect();
  const left = Math.min(x, window.innerWidth - rect.width - 8);
  const top = Math.min(y, window.innerHeight - rect.height - 8);
  menu.style.left = `${Math.max(4, left)}px`;
  menu.style.top = `${Math.max(4, top)}px`;
  const close = (event) => {
    if (menu.contains(event.target)) return;
    menu.hidden = true;
    window.removeEventListener('mousedown', close);
  };
  setTimeout(() => window.addEventListener('mousedown', close), 0);
}

export function renderMarkdown(text) {
  const source = String(text || '');
  const chunks = source.split('```');
  let html = '';
  chunks.forEach((chunk, index) => {
    if (index % 2 === 1) {
      const breakAt = chunk.indexOf('\n');
      const body = breakAt === -1 ? chunk : chunk.slice(breakAt + 1);
      html += `<pre><code>${escapeHtml(body.replace(/\n$/, ''))}</code></pre>`;
      return;
    }
    html += escapeHtml(chunk)
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\n/g, '<br>');
  });
  return html;
}

function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
