const GQL = '/graphql';

// AbortController para cancelar la petición anterior si el usuario sigue tecleando
let currentAbort;

async function gql(query, variables = {}) {
  if (currentAbort) currentAbort.abort();
  currentAbort = new AbortController();

  const r = await fetch(GQL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query, variables }),
    signal: currentAbort.signal
  });

  const j = await r.json().catch(async () => {
    const txt = await r.text();
    console.error('Respuesta no-JSON:', txt);
    throw new Error('Respuesta no-JSON del servidor');
  });
  if (j.errors) {
    console.error('GraphQL errors:', j.errors);
    throw new Error(j.errors.map(e => e.message).join(' | '));
  }
  return j.data;
}

// Estado de paginación
let pageSize = 20;
let offset = 0;
let total = 0;

const lista = document.getElementById('lista');
const info = document.getElementById('pageInfo');
const btnPrev = document.getElementById('prev');
const btnNext = document.getElementById('next');
const selPageSize = document.getElementById('pageSize');
const inputQ = document.getElementById('q');

// estado global de filtros
let dateFrom = '';
let dateTo = '';

async function cargar(q = '') {
  lista.textContent = 'Cargando…';



  const query = `
    query ($limit:Int!, $offset:Int!, $q:String, $dateFrom:String, $dateTo:String) {
      formularios(limit:$limit, offset:$offset, q:$q, dateFrom:$dateFrom, dateTo:$dateTo) {
        total
        count
        items {
          cc nombres sede no_op sci_ref descripcion_referencia
          fecha_inicio hora_inicio fecha_final hora_final
          actividad estado_sci cantidad area maquina horario observaciones
        }
      }
    }
  `;


  try {
    const data = await gql(query, { limit: pageSize, offset, q, dateFrom, dateTo });
    const { total: t, count, items } = data.formularios;
    total = t;

    lista.innerHTML = '';
    if (!items.length) {
      lista.innerHTML = '<tr><td colspan="4">🙈 No hay resultados</td></tr>';
    } else {
      items.forEach(it => {
        const tr = document.createElement('tr');
        tr.dataset.cc = it.cc;
        tr.innerHTML = `
          <td data-field="cc"              class="ro" tabindex="0">${it.cc ?? ''}</td>
          <td data-field="nombres"         tabindex="0">${it.nombres ?? ''}</td>
          <td data-field="sede"            tabindex="0">${it.sede ?? ''}</td>
          <td data-field="no_op"           tabindex="0">${it.no_op ?? ''}</td>
          <td data-field="sci_ref"         tabindex="0">${it.sci_ref ?? ''}</td>
          <td data-field="descripcion_referencia" tabindex="0">${it.descripcion_referencia ?? ''}</td>
          <td data-field="fecha_inicio"    tabindex="0">${it.fecha_inicio ?? ''}</td>
          <td data-field="hora_inicio"     tabindex="0">${it.hora_inicio ?? ''}</td>
          <td data-field="fecha_final"     tabindex="0">${it.fecha_final ?? ''}</td>
          <td data-field="hora_final"      tabindex="0">${it.hora_final ?? ''}</td>
          <td data-field="actividad"       tabindex="0">${it.actividad ?? ''}</td>
          <td data-field="cantidad"        tabindex="0">${it.cantidad ?? ''}</td>
          <td data-field="estado_sci"      tabindex="0">${it.estado_sci ?? ''}</td>
          <td data-field="area"            tabindex="0">${it.area ?? ''}</td>
          <td data-field="maquina"         tabindex="0">${it.maquina ?? ''}</td>
          <td data-field="horario"         tabindex="0">${it.horario ?? ''}</td>
          <td data-field="observaciones"   tabindex="0">${it.observaciones ?? ''}</td>
        `;

        lista.appendChild(tr);
      });

    }

    const from = total === 0 ? 0 : offset + 1;
    const to = offset + count;
    if (info) info.textContent = `${from}–${to} de ${total}`;
    if (btnPrev) btnPrev.disabled = offset === 0;
    if (btnNext) btnNext.disabled = offset + count >= total;

  } catch (e) {
    if (e.name === 'AbortError') return; // se canceló por nueva búsqueda
    console.error(e);
    lista.textContent = 'Error cargando datos.';
    if (info) info.textContent = '';
  }
}

// Inicializa el Litepicker (rango)
const lp = new Litepicker({
  element: document.getElementById('datepicker'),
  singleMode: false,
  format: 'YYYY-MM-DD',        // para el string del input
  autoApply: true,
});

// cuando el usuario selecciona rango
lp.on('selected', (date1, date2) => {
  // formatea; si tu build no soporta .format, usa toISOString().slice(0,10)
  const fmt = d => (typeof d?.format === 'function' ? d.format('YYYY-MM-DD') : new Date(d).toISOString().slice(0, 10));

  dateFrom = date1 ? fmt(date1) : '';
  dateTo = date2 ? fmt(date2) : '';

  offset = 0;
  cargar(inputQ.value.trim());
});

// si el usuario limpia el input manualmente
document.getElementById('datepicker').addEventListener('input', (e) => {
  if (!e.target.value) {
    dateFrom = '';
    dateTo = '';
    offset = 0;
    cargar(inputQ.value.trim());
  }
});

// util GQL
function placeCaretEnd(el) {
  const range = document.createRange();
  const sel = window.getSelection();
  range.selectNodeContents(el);
  range.collapse(false);
  sel.removeAllRanges();
  sel.addRange(range);
}

async function mutateUpdate(cc, patch) {
  const m = `
    mutation ($cc: ID!, $patch: FormularioPatch!) {
      updateFormulario(cc: $cc, patch: $patch) { cc }
    }
  `;
  await gql(m, { cc, patch });
}

function enableEdit(td) {
  if (td.classList.contains('ro')) return; // no editable
  if (td.isContentEditable) return;

  td.dataset.orig = td.textContent.trim();
  td.contentEditable = 'true';
  td.focus();
  placeCaretEnd(td);
  td.classList.add('editing');
}

function disableEdit(td) {
  td.contentEditable = 'false';
  td.classList.remove('editing');
}

function attachInlineEditingDblClick() {
  // selección visual en click (sin editar)
  lista.addEventListener('click', (e) => {
    const td = e.target.closest('td');
    if (!td) return;
    lista.querySelectorAll('td.selected').forEach(c => c.classList.remove('selected'));
    td.classList.add('selected');
  });

  // entrar a edición con doble click
  lista.addEventListener('dblclick', (e) => {
    const td = e.target.closest('td');
    if (!td) return;
    enableEdit(td);
  });

  // F2 para entrar a edición en la celda enfocada
  lista.addEventListener('keydown', (e) => {
    const td = e.target.closest('td');
    if (!td) return;
    if (e.key === 'F2' && !td.isContentEditable) {
      e.preventDefault();
      enableEdit(td);
    }
    // Navegación básica con Enter si NO está editable: entra a edición
    if (e.key === 'Enter' && !td.isContentEditable) {
      e.preventDefault();
      enableEdit(td);
    }
  });

  // Teclas dentro de la celda editable
  lista.addEventListener('keydown', (e) => {
    const td = e.target.closest('td[contenteditable="true"]');
    if (!td) return;

    if (e.key === 'Enter') {          // guardar
      e.preventDefault();
      td.blur();
    } else if (e.key === 'Escape') {  // cancelar
      e.preventDefault();
      td.textContent = td.dataset.orig || '';
      td.blur();
    }
  });

  // Blur = commit/cancel según cambios
  lista.addEventListener('blur', async (e) => {
    const td = e.target.closest('td[contenteditable="true"]');
    if (!td) return;

    const orig = (td.dataset.orig || '').trim();
    const val  = td.textContent.trim();
    const field = td.dataset.field;
    const tr = td.closest('tr');
    const cc = tr?.dataset.cc;

    // sale del modo edición
    disableEdit(td);

    if (val === orig) return; // sin cambios

    try {
      // validaciones mínimas
      if (field === 'cantidad' && val !== '' && isNaN(Number(val))) {
        throw new Error('Debe ser numérico');
      }

      td.classList.add('saving');
      const patch = {};
      patch[field] = (val === '' ? null : field === 'cantidad' ? Number(val) : val);
      await mutateUpdate(cc, patch);

      td.classList.remove('saving');
      td.classList.add('saved');
      setTimeout(() => td.classList.remove('saved'), 600);
    } catch (err) {
      console.error('Update error:', err);
      td.classList.remove('saving');
      td.classList.add('error');
      td.textContent = orig; // revertir
      setTimeout(() => td.classList.remove('error'), 800);
    }
  }, true); // usar capture para asegurar el blur
}

// Llama esto cada vez que renders tu tabla
attachInlineEditingDblClick();


// Debounce: dispara 300ms después de dejar de escribir
let debounceId;
inputQ.addEventListener('input', () => {
  clearTimeout(debounceId);
  debounceId = setTimeout(() => {
    offset = 0;                // vuelve a la primera página al buscar
    cargar(inputQ.value.trim());
  }, 300);
});

// Botones y page size
btnPrev?.addEventListener('click', () => {
  offset = Math.max(0, offset - pageSize);
  cargar(inputQ.value.trim());
});
btnNext?.addEventListener('click', () => {
  offset = offset + pageSize;
  cargar(inputQ.value.trim());
});
selPageSize?.addEventListener('change', (e) => {
  pageSize = Number(e.target.value) || 20;
  offset = 0;
  cargar(inputQ.value.trim());
});

// Arranque
cargar('');
