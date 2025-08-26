// frontend/script.js
const GQL = '/graphql';

async function gql(query, variables = {}) {
  const r = await fetch(GQL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query, variables })
  });
  const j = await r.json();
  if (j.errors) throw new Error(j.errors.map(e => e.message).join(' | '));
  return j.data;
}

// Estado de paginación
let pageSize = 20;
let offset = 0;
let total = 0;

const lista = document.getElementById('lista');
const info  = document.getElementById('pageInfo');   // <span id="pageInfo"></span>
const btnPrev = document.getElementById('prev');      // <button id="prev">Anterior</button>
const btnNext = document.getElementById('next');      // <button id="next">Siguiente</button>
const selPageSize = document.getElementById('pageSize'); // <select id="pageSize">…</select>

async function cargar() {
  lista.textContent = 'Cargando…';

  const query = `
    query ($limit:Int!, $offset:Int!) {
      formularios(limit:$limit, offset:$offset) {
        total
        count
        items { cc nombres }
      }
    }
  `;

  try {
    const data = await gql(query, { limit: pageSize, offset });
    const { total: t, count, items } = data.formularios;
    total = t;

    // Render
    lista.innerHTML = '';
    if (!items.length) {
      lista.textContent = 'Sin resultados.';
    } else {
      items.forEach(it => {
        const div = document.createElement('div');
        div.className = 'item';
        div.innerHTML = `
          <div class="cc"><strong>CC:</strong> ${it.cc ?? ''}</div>
          <div><strong>Nombre:</strong> ${it.nombres ?? ''}</div>
        `;
        lista.appendChild(div);
      });
    }

    // Rango X–Y de total
    const from = total === 0 ? 0 : offset + 1;
    const to   = offset + count;
    info.textContent = `${from}–${to} de ${total}`;

    // Habilitar/Deshabilitar controles
    btnPrev.disabled = offset === 0;
    btnNext.disabled = offset + count >= total;

  } catch (e) {
    console.error(e);
    lista.textContent = 'Error cargando datos.';
    info.textContent = '';
  }
}

btnPrev.addEventListener('click', () => {
  offset = Math.max(0, offset - pageSize);
  cargar();
});

btnNext.addEventListener('click', () => {
  offset = offset + pageSize;
  cargar();
});

selPageSize?.addEventListener('change', (e) => {
  pageSize = Number(e.target.value) || 20;
  offset = 0; // reset a primera página
  cargar();
});

// inicial
cargar();
