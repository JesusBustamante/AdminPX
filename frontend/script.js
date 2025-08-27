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
          <td data-field="cc"              class="ro">${it.cc ?? ''}</td>
          <td data-field="nombres"         contenteditable="true">${it.nombres ?? ''}</td>
          <td data-field="actividad"       contenteditable="true">${it.actividad ?? ''}</td>
          <td data-field="sede"            contenteditable="true">${it.sede ?? ''}</td>
          <td data-field="fecha_inicio"    contenteditable="true">${it.fecha_inicio ?? ''}</td>
          <td data-field="fecha_final"     contenteditable="true">${it.fecha_final ?? ''}</td>
          <td data-field="hora_inicio"     contenteditable="true">${it.hora_inicio ?? ''}</td>
          <td data-field="hora_final"      contenteditable="true">${it.hora_final ?? ''}</td>
          <td data-field="no_op"           contenteditable="true">${it.no_op ?? ''}</td>
          <td data-field="sci_ref"         contenteditable="true">${it.sci_ref ?? ''}</td>
          <td data-field="descripcion_referencia" contenteditable="true">${it.descripcion_referencia ?? ''}</td>
          <td data-field="estado_sci"      contenteditable="true">${it.estado_sci ?? ''}</td>
          <td data-field="cantidad"        contenteditable="true">${it.cantidad ?? ''}</td>
          <td data-field="area"            contenteditable="true">${it.area ?? ''}</td>
          <td data-field="maquina"         contenteditable="true">${it.maquina ?? ''}</td>
          <td data-field="horario"         contenteditable="true">${it.horario ?? ''}</td>
          <td data-field="observaciones"   contenteditable="true">${it.observaciones ?? ''}</td>
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
  const fmt = d => (typeof d?.format === 'function' ? d.format('YYYY-MM-DD') : new Date(d).toISOString().slice(0,10));

  dateFrom = date1 ? fmt(date1) : '';
  dateTo   = date2 ? fmt(date2) : '';

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
async function mutateUpdate(cc, patch) {
  const m = `
    mutation ($cc: ID!, $patch: FormularioPatch!) {
      updateFormulario(cc: $cc, patch: $patch) {
        cc
      }
    }
  `;
  await gql(m, { cc, patch });
}

function attachInlineEditing() {
  // guarda el valor original al entrar
  lista.querySelectorAll('td[contenteditable="true"]').forEach(td => {
    td.addEventListener('focus', () => {
      td.dataset.orig = td.textContent.trim();
      td.classList.remove('error');
    });

    // Enter = guardar; Esc = cancelar
    td.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault(); // evita salto de línea
        td.blur();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        td.textContent = td.dataset.orig || '';
        td.blur();
      }
    });

    // Al salir: si cambió, dispara mutation
    td.addEventListener('blur', async () => {
      const orig = (td.dataset.orig || '').trim();
      const val = td.textContent.trim();
      if (val === orig) return; // nada que hacer

      const tr = td.closest('tr');
      const cc = tr?.dataset.cc;
      const field = td.dataset.field;

      // validaciones básicas en cliente (ejemplo cantidad y fechas)
      try {
        if (field === 'cantidad' && val !== '' && isNaN(Number(val))) {
          throw new Error('Debe ser numérico');
        }
        // (opcional) valida formato YYYY-MM-DD para fecha_* y HH:mm para hora_*

        // estado visual: guardando…
        td.classList.add('saving');

        const patch = {};
        patch[field] = val === '' ? null : (field === 'cantidad' ? Number(val) : val);

        await mutateUpdate(cc, patch);

        td.classList.remove('saving');
        td.classList.add('saved');
        setTimeout(() => td.classList.remove('saved'), 600);
      } catch (err) {
        console.error('Update error:', err);
        td.classList.remove('saving');
        td.classList.add('error');
        // revierte
        td.textContent = orig;
      }
    });
  });
}

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
