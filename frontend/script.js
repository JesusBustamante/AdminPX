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

// estado global de filtros
let dateFrom = '';
let dateTo = '';

const lista = document.getElementById('lista');
const info = document.getElementById('pageInfo');
const btnPrev = document.getElementById('prev');
const btnNext = document.getElementById('next');
const selPageSize = document.getElementById('pageSize');
const inputQ = document.getElementById('q');
const btnClear = document.getElementById('limpiarfiltros');
const pickerEl = document.getElementById('datepicker');



// Normalizar textos provenientes de la base de datos
function normText(s) {
  if (!s) return '';
  return s.toString()
    .normalize('NFD').replace(/\p{Diacritic}/gu, '') // quita acentos
    .replace(/_/g, ' ')                              // guion_bajo → espacio
    .replace(/\s+/g, ' ')                            // colapsa espacios
    .trim()
    .toLowerCase();
}

// ------------------Sede Select-----------------------------------------

// Canonizamos valores/labels para guardar
const SEDE_A = { value: 'Colombia-Antioquia-Sabaneta-SEDE-PX-1', label: 'Colombia-Antioquia-Sabaneta-SEDE-PX-1' };
const SEDE_B = { value: 'Colombia-Antioquia-La Estrella-SEDE-PX-1', label: 'Colombia-Antioquia-La Estrella-SEDE-PX-1' };

// función util para pintar el select con la opción opuesta
function renderSedeSelect(valorBD) {

  const n = normText(valorBD);

  const isSabaneta = n.includes('sabaneta');
  const isLaEstrella = n.includes('la estrella') || n.includes('estrella');

  /// Armamos SIEMPRE ambas opciones; marcamos selected según lo detectado
  const optA = `<option value="${SEDE_A.value}" ${isSabaneta ? 'selected' : ''}>${SEDE_A.label}</option>`;
  const optB = `<option value="${SEDE_B.value}" ${isLaEstrella ? 'selected' : ''}>${SEDE_B.label}</option>`;

  // Si no reconoce ninguna, no marcamos selected (el usuario elegirá)
  return `
    <select class="sede-select" data-field="sede">
      ${optA}
      ${optB}
    </select>
  `;
}

// ------------------Actividad Select--------------------------------------

const ACTIVIDADES = [
  "Corte",
  "Descolille",
  "Embobinado",
  "Empaque",
  "Impresion",
  "Plastificado",
  "Formacion de Vasos",
  "Troquelado",
  "Impresión Zebra",
  "Alimentación",
  "Limpieza",
  "Reunion",
  "Falla mecanica"
];

function renderActividadSelect(valorBD) {
  const n = normText(valorBD);

  // detecta si el valor está en la lista canónica
  const current = ACTIVIDADES.find(act => normText(act) === n);

  // construye opciones, marcando la actual como selected
  return `
    <select class="actividad-select" data-field="actividad">
      ${ACTIVIDADES.map(act => `
        <option value="${act}" ${current === act ? 'selected' : ''}>
          ${act}
        </option>`).join('')}
    </select>
  `;
}

// ----------------Hora y Fecha ------------------

function toDateValue(s) { if (!s) return ''; const m = String(s).match(/^(\d{4}-\d{2}-\d{2})/); return m ? m[1] : ''; }
function toTimeValue(s) { if (!s) return ''; const m = String(s).match(/^(\d{2}):(\d{2})/); return m ? `${m[1]}:${m[2]}` : ''; }

function startCellEdit(td) {
  if (td.querySelector('select')) return; // no reemplazar selects (sede/actividad)

  const field = td.dataset.field;
  const tr = td.closest('tr');
  const cc = tr?.dataset.cc;
  if (!cc || td.classList.contains('ro') || td.querySelector('input')) return;

  const isDate = field === 'fecha_inicio' || field === 'fecha_final';
  const isTime = field === 'hora_inicio' || field === 'hora_final';
  const isNumber = field === 'cantidad';

  const originalText = td.textContent.trim();
  td.dataset.orig = originalText;

  const input = document.createElement('input');
  input.type = isDate ? 'date' : isTime ? 'time' : isNumber ? 'number' : 'text';
  input.className = 'cell-input';
  input.autocomplete = 'off';
  input.spellcheck = false;
  input.required = true;          // no nulos

  // Valores iniciales
  if (isDate) {
    input.value = toDateValue(originalText);
  } else if (isTime) {
    input.value = toTimeValue(originalText);
    input.step = 60;              // 1 min
  } else if (isNumber) {
    input.value = originalText === '' ? '' : String(originalText);
    input.min = '0';              // sin negativos
    input.step = '1';             // enteros (cambia a 'any' si quieres decimales)
    input.inputMode = 'numeric';
  } else {
    input.value = originalText;
  }

  // Límites cruzados fecha/hora
  if (isDate) {
    const otherTxt = (field === 'fecha_inicio')
      ? tr.querySelector('td[data-field="fecha_final"]')?.textContent.trim()
      : tr.querySelector('td[data-field="fecha_inicio"]')?.textContent.trim();
    const other = toDateValue(otherTxt);
    if (other) {
      if (field === 'fecha_inicio') input.max = other;
      else input.min = other;
    }
  }
  if (isTime) {
    const fi = toDateValue(tr.querySelector('td[data-field="fecha_inicio"]')?.textContent.trim());
    const ff = toDateValue(tr.querySelector('td[data-field="fecha_final"]')?.textContent.trim());
    if (fi && ff && fi === ff) {
      const otherTxt = (field === 'hora_inicio')
        ? tr.querySelector('td[data-field="hora_final"]')?.textContent.trim()
        : tr.querySelector('td[data-field="hora_inicio"]')?.textContent.trim();
      const other = toTimeValue(otherTxt);
      if (other) {
        if (field === 'hora_inicio') input.max = other;
        else input.min = other;
      }
    }
  }

  // Inserción UI
  td.classList.add('editing');
  td.textContent = '';
  td.appendChild(input);
  input.focus();
  if (isDate || isTime) {
    if (typeof input.showPicker === 'function') { try { input.showPicker(); } catch { } }
  }

  // 🔒 BLOQUEAR TECLADO SOLO EN FECHA/HORA (no en número)
  if (isDate || isTime) {
    input.addEventListener('beforeinput', (e) => e.preventDefault());
    input.addEventListener('keydown', (e) => {
      const ok = ['Tab', 'Enter', 'Escape', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'];
      if (!ok.includes(e.key)) e.preventDefault();
      if (e.key === 'Enter') { e.preventDefault(); commit(); }
      if (e.key === 'Escape') { e.preventDefault(); cancel(); }
    });
    input.addEventListener('pointerdown', () => {
      if (typeof input.showPicker === 'function') { try { input.showPicker(); } catch { } }
    });
  } else if (isNumber) {
    // Evitar signos negativos y letras
    input.addEventListener('beforeinput', (e) => {
      // permitir dígitos, borrar, mover, pegar con solo dígitos
      if (e.inputType === 'insertFromPaste') {
        const text = (e.dataTransfer || {}).getData?.('text') ?? '';
        if (!/^\d+(\.\d+)?$/.test(text)) e.preventDefault();
      }
      // resto lo maneja el propio <input type="number">
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === '-') e.preventDefault(); // no negativos
      if (e.key === 'Enter') { e.preventDefault(); commit(); }
      if (e.key === 'Escape') { e.preventDefault(); cancel(); }
    });
  } else {
    // texto normal (si tienes otros campos con input)
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); commit(); }
      if (e.key === 'Escape') { e.preventDefault(); cancel(); }
    });
  }

  input.addEventListener('change', commit);
  input.addEventListener('blur', commit, { once: true });

  async function commit() {
    const val = input.value.trim();

    // 🚨 Validación común: no permitir vacío en ningún campo
    if (!val) {
      markErrorAndRefocus();
      return;
    }

    let newDisplay = val;

    // Validación específica para cantidad
    if (isNumber) {
      const num = Number(val);
      if (!Number.isFinite(num) || num < 0) {
        markErrorAndRefocus();
        return;
      }
      newDisplay = String(num); // normaliza
    }

    // Validación constraints nativos (date min/max, time min/max)
    if (!input.checkValidity()) {
      markErrorAndRefocus();
      return;
    }

    td.classList.add('saving');
    try {
      const payload = isNumber ? Number(newDisplay) : newDisplay;
      await mutateUpdate(cc, { [field]: payload });
      td.classList.remove('saving');
      td.classList.add('saved');
      setTimeout(() => td.classList.remove('saved'), 600);
      td.classList.remove('editing');
      td.textContent = newDisplay;
    } catch (err) {
      console.error('Update error:', err);
      td.classList.remove('saving');
      td.classList.add('error');
      setTimeout(() => td.classList.remove('error'), 800);
      td.classList.remove('editing');
      td.textContent = td.dataset.orig ?? '';
    }
  }


  function cancel() {
    td.classList.remove('editing');
    td.textContent = td.dataset.orig ?? '';
  }

  function markErrorAndRefocus() {
    td.classList.add('error');
    setTimeout(() => td.classList.remove('error'), 800);
    input.focus();
    if (isDate || isTime) {
      if (typeof input.showPicker === 'function') { try { input.showPicker(); } catch { } }
    }
  }
}

// ------------------Estado SCI Select-----------------------------------------

// Canonizamos valores/labels para guardar
const ESTADO_A = { value: 'En proceso', label: 'En proceso' };
const ESTADO_B = { value: 'Finalizado', label: 'Finalizado' };

// función util para pintar el select con la opción opuesta
function renderEstadoSelect(valorBD) {

  const n = normText(valorBD);

  const isProceso = n.includes('en proceso') || n.includes('proceso');
  const isFinalizado = n.includes('finalizado');

  /// Armamos SIEMPRE ambas opciones; marcamos selected según lo detectado
  const optionA = `<option value="${ESTADO_A.value}" ${isProceso ? 'selected' : ''}>${ESTADO_A.label}</option>`;
  const optionB = `<option value="${ESTADO_B.value}" ${isFinalizado ? 'selected' : ''}>${ESTADO_B.label}</option>`;

  // Si no reconoce ninguna, no marcamos selected (el usuario elegirá)
  return `
    <select class="sede-select" data-field="estado_sci">
      ${optionA}
      ${optionB}
    </select>
  `;
}

// ------------------Horario Select--------------------------------------

const HORARIOS = [
  "Horario A (06:00 - 14:00)",
  "Horario B (14:00 - 22:00)",
  "Horario C (22:00 - 06:00)",
  "Horario D (07:00 - 16:00)",
  "Horario E (06:00 - 16:00)",
  "Horario F (06:00 - 18:00)",
  "Horario G (18:00 - 06:00)",
  "Horario H (20:00 - 06:00)",
  "Horario I (06:00 - 17:00)",
  "Horario J (19:00 - 06:00)",
  "Horario K (05:45 - 13:45)",
  "Horario L (14:15 - 22:15)",
  "Horario M (10:00 - 18:00)",
  "Horario N (12:00 - 22:00)",
  "Horario O (08:00 - 16:00)"
];

function renderHorarioSelect(valorBD) {
  const n = normText(valorBD);

  // detecta si el valor está en la lista canónica
  const current = HORARIOS.find(act => normText(act) === n);

  // construye opciones, marcando la actual como selected
  return `
    <select class="horario-select" data-field="horario">
      ${HORARIOS.map(act => `
        <option value="${act}" ${current === act ? 'selected' : ''}>
          ${act}
        </option>`).join('')}
    </select>
  `;
}

// ------------------Observacion Select--------------------------------------

const OBSERVACION = [
  "Fallo de maquina",
  "Falta de insumos",
  "Falta de materias primas",
  "Paro por reuniones",
  "Paro por otras actividades",
  "Falta de programación",
  "Reproceso",
  "N / A"
];

function renderObservacionSelect(valorBD) {
  const n = normText(valorBD);

  // detecta si el valor está en la lista canónica
  const current = OBSERVACION.find(act => normText(act) === n);

  // construye opciones, marcando la actual como selected
  return `
    <select class="observaciones-select" data-field="observaciones">
      ${OBSERVACION.map(act => `
        <option value="${act}" ${current === act ? 'selected' : ''}>
          ${act}
        </option>`).join('')}
    </select>
  `;
}

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
          <td id="celda-cc" data-field="cc"              class="ro" tabindex="0">${it.cc ?? ''}</td>
          <td id="celda-nombre" data-field="nombres"         class="ro" tabindex="0">${it.nombres ?? ''}</td>
          <td data-field="actividad"       tabindex="0">${renderActividadSelect(it.actividad)}</td>
          <td data-field="sede"            tabindex="0">${renderSedeSelect(it.sede)}</td>
          <td data-field="fecha_inicio"    tabindex="0">${it.fecha_inicio ?? ''}</td>
          <td data-field="fecha_final"     tabindex="0">${it.fecha_final ?? ''}</td>
          <td data-field="hora_inicio"     tabindex="0">${it.hora_inicio ?? ''}</td>
          <td data-field="hora_final"      tabindex="0">${it.hora_final ?? ''}</td>
          <td data-field="no_op"           tabindex="0">${it.no_op ?? ''}</td>
          <td data-field="sci_ref"         tabindex="0">${it.sci_ref ?? ''}</td>
          <td data-field="descripcion_referencia" tabindex="0">${it.descripcion_referencia ?? ''}</td>
          <td data-field="estado_sci"      tabindex="0">${renderEstadoSelect(it.estado_sci)}</td>
          <td data-field="cantidad"        tabindex="0">${it.cantidad ?? 0}</td>
          <td data-field="area"            tabindex="0">${it.area ?? ''}</td>
          <td data-field="maquina"         tabindex="0">${it.maquina ?? ''}</td>
          <td data-field="horario"         tabindex="0">${renderHorarioSelect(it.horario)}</td>
          <td data-field="observaciones"   tabindex="0">${renderObservacionSelect(it.observaciones)}</td>
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
  element: pickerEl,
  singleMode: false,
  format: 'YYYY-MM-DD',
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
  // Click: seleccionar celda (opcional)
  lista.addEventListener('click', (e) => {
    const td = e.target.closest('td');
    if (!td) return;
    lista.querySelectorAll('td.selected').forEach(c => c.classList.remove('selected'));
    td.classList.add('selected');
  });

  // Doble-click en OP o SCI abre el mismo editor (arranca anclado al td de OP)
  lista.addEventListener('dblclick', (e) => {
    const td = e.target.closest('td');
    if (!td) return;

    const field = td.dataset.field;

    // Caso especial para el editor OP/SCI
    if (field === 'no_op' || field === 'sci_ref') {
      const tdNoOp = td.closest('tr').querySelector('td[data-field="no_op"]');
      if (tdNoOp) {
        openOpSciEditor(tdNoOp);
      }
    }
    // Caso general para todos los demás campos editables
    else {
      startCellEdit(td);
    }
  });

  // F2 también
  lista.addEventListener('keydown', (e) => {
    if (e.key !== 'F2') return;
    const td = e.target.closest('td');
    if (!td) return;
    const field = td.dataset.field;
    if (field === 'no_op' || field === 'sci_ref') {
      const tdNoOp = td.closest('tr').querySelector('td[data-field="no_op"]');
      if (tdNoOp) { e.preventDefault(); openOpSciEditor(tdNoOp); }
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
    const val = td.textContent.trim();
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

  lista.addEventListener('change', async (e) => {
    // Busca cualquier select con un data-field
    const sel = e.target.closest('select[data-field]');
    if (!sel) return;

    const tr = sel.closest('tr');
    const cc = tr?.dataset.cc;
    const field = sel.dataset.field; // Ahora obtiene el data-field correcto
    const val = sel.value;

    try {
      sel.disabled = true;
      await mutateUpdate(cc, { [field]: val });
      sel.disabled = false;
      sel.classList.add('saved');
      setTimeout(() => sel.classList.remove('saved'), 600);
    } catch (err) {
      console.error('Update error:', err);
      sel.disabled = false;
      sel.classList.add('error');
      setTimeout(() => sel.classList.remove('error'), 800);
    }
  });

  btnClear?.addEventListener('click', () => {
    // limpia buscador
    inputQ.value = '';

    // limpia picker (si usas Litepicker)
    if (pickerEl._litepicker) {
      pickerEl._litepicker.clearSelection();
    } else {
      pickerEl.value = '';
    }

    // reset globales
    dateFrom = '';
    dateTo = '';
    offset = 0;

    // recargar datos sin filtros
    cargar('');
  });


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


// --------------------------CONTROL OP FILTRO---------------------------------------------------------------
// --- helpers ---
function debounce(fn, ms = 250) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

async function apiBuscarOps(prefix, limit = 8) {
  const q = `query($prefix:String!, $limit:Int){ buscarOpsExcel(prefix:$prefix, limit:$limit) }`;
  const { buscarOpsExcel } = await gql(q, { prefix, limit });
  return buscarOpsExcel || [];
}

async function apiBuscarSciPorOp(op, prefix = '', limit = 20) {
  const q = `query($op:String!, $prefix:String, $limit:Int){ buscarSciPorOp(op:$op, prefix:$prefix, limit:$limit) }`;
  const { buscarSciPorOp } = await gql(q, { op, prefix, limit });
  return buscarSciPorOp || [];
}

async function apiRefPorOpSci(op, sci) {
  const q = `query($op:String!, $sci:String!){ refPorOpSci(op:$op, sci:$sci){ descripcion } }`;
  const { refPorOpSci } = await gql(q, { op, sci });
  return refPorOpSci?.descripcion || '';
}

async function apiUpdateFormulario(cc, patch) {
  const m = `mutation($cc:ID!, $patch:FormularioPatch!){
    updateFormulario(cc:$cc, patch:$patch){
      cc no_op sci_ref descripcion_referencia
    }
  }`;
  const data = await gql(m, { cc, patch });
  return data.updateFormulario;
}


//----editor embebido------
// Cierra cualquier editor abierto
function closeAnyOpSciEditor() {
  document.querySelectorAll('.op-sci-editor').forEach(n => n.remove());
}

// Crea y abre el editor sobre la celda de OP
function openOpSciEditor(tdNoOp) {
  closeAnyOpSciEditor();

  const tr = tdNoOp.closest('tr');
  const tdSci = tr.querySelector('td[data-field="sci_ref"]');
  const tdDR = tr.querySelector('td[data-field="descripcion_referencia"]');
  const cc = tr.dataset.cc;

  const currOP = (tdNoOp.textContent || '').trim();
  const currSCI = (tdSci?.textContent || '').trim();
  const currDR = (tdDR?.textContent || '').trim();

  const host = document.createElement('div');
  host.className = 'op-sci-editor';

  // --- CAMBIO EN EL HTML: Se añade `readonly` al input de SCI ---
  host.innerHTML = `
    <div class="op-sci-box">
      <label>OP</label>
      <input type="text" class="op-input" placeholder="Buscar OP..." autocomplete="off">
      <div class="op-suggestions suggestions-box"></div>

      <label>SCI</label>
      <input type="text" class="sci-input" placeholder="Seleccione una OP primero..." autocomplete="off" readonly disabled>
      <div class="sci-suggestions suggestions-box"></div>

      <label>Descripción</label>
      <textarea class="dr-output" rows="2" readonly></textarea>

      <div class="opsi-actions">
        <button class="btn-cancel">Cancelar (Esc)</button>
        <button class="btn-save">Guardar (Enter)</button>
      </div>
    </div>
  `;

  // --- Posicionamiento y Referencias (sin cambios) ---
  const rect = tdNoOp.getBoundingClientRect();
  const scrollTop = document.documentElement.scrollTop || document.body.scrollTop;
  const scrollLeft = document.documentElement.scrollLeft || document.body.scrollLeft;
  host.style.position = 'absolute';
  host.style.left = (rect.left + scrollLeft) + 'px';
  host.style.top = (rect.bottom + scrollTop) + 'px';
  host.style.zIndex = 9999;
  document.body.appendChild(host);

  const $opI = host.querySelector('.op-input');
  const $opBox = host.querySelector('.op-suggestions');
  const $sciI = host.querySelector('.sci-input');
  const $sciBox = host.querySelector('.sci-suggestions');
  const $drOut = host.querySelector('.dr-output');
  const $btnOk = host.querySelector('.btn-save');
  const $btnKo = host.querySelector('.btn-cancel');

  let chosenOP = currOP || '';
  let chosenSCI = currSCI || '';
  let descRef = currDR || '';
  let sciPool = [];

  $opI.value = chosenOP;
  $sciI.value = chosenSCI;
  $drOut.value = descRef;

  // --- Función renderSciSuggestions (sin cambios, pero ahora se usa con `click`) ---
  function renderSciSuggestions(list) {
    $sciBox.innerHTML = '';
    if (!list.length) return;
    list.forEach(sci => {
      const row = document.createElement('div');
      row.className = 'sugg-item';
      row.textContent = sci;
      // ✅ CAMBIO CLAVE: Usamos 'click' en lugar de 'mousedown'
      row.addEventListener('click', (ev) => {
        chooseSCI(sci);
      });
      $sciBox.appendChild(row);
    });
  }

  // --- Función renderOpSuggestions (Modificada para usar 'click') ---
  function renderOpSuggestions(list) {
    $opBox.innerHTML = '';
    if (!list.length) {
      $opBox.innerHTML = `<div class="sugg-empty">Sin coincidencias</div>`;
      return;
    }
    list.forEach(op => {
      const row = document.createElement('div');
      row.className = 'sugg-item';
      row.textContent = op;
      // ✅ CAMBIO CLAVE: Usamos 'click' en lugar de 'mousedown'
      row.addEventListener('click', (ev) => {
        chooseOP(op);
      });
      $opBox.appendChild(row);
    });
  }

  async function chooseOP(op) {
    $opBox.innerHTML = '';
    $opI.value = op;
    chosenOP = op;
    chosenSCI = '';
    $sciI.value = '';
    descRef = '';
    $drOut.value = '';

    $sciI.placeholder = 'Cargando SCIs...';
    sciPool = await apiBuscarSciPorOp(chosenOP, '', 200);

    // ✅ CAMBIO CLAVE: Muestra las sugerencias de SCI automáticamente
    renderSciSuggestions(sciPool);

    $sciI.placeholder = 'Haga clic para seleccionar SCI';
    $sciI.disabled = false;
  }

  async function chooseSCI(sci) {
    $sciBox.innerHTML = '';
    $sciI.value = sci;
    chosenSCI = sci;

    $drOut.value = 'Buscando descripción...';
    descRef = await apiRefPorOpSci(chosenOP, chosenSCI);
    $drOut.value = descRef;

    $btnOk.focus();
  }

  async function save() {

    console.log('Función save() INICIADA');
    // 1. Validación inicial (sin cambios)
    if (!chosenOP || !chosenSCI) {
      host.querySelector('.op-sci-box').classList.add('opsi-error');
      setTimeout(() => host.querySelector('.op-sci-box').classList.remove('opsi-error'), 800);
      return;
    }

    // Deshabilitar botones para evitar doble clic
    $btnOk.disabled = true;
    $btnKo.disabled = true;
    $btnOk.textContent = 'Guardando...';

    try {
      // 2. Verificación y mutación (dentro del `try`)
      const realDR = await apiRefPorOpSci(chosenOP, chosenSCI) || '';

      await apiUpdateFormulario(cc, {
        no_op: chosenOP,
        sci_ref: chosenSCI,
        descripcion_referencia: realDR
      });

      // 3. ÉXITO: Si llegamos aquí, todo salió bien.
      // Ahora actualizamos la tabla.
      tdNoOp.textContent = chosenOP;
      if (tdSci) tdSci.textContent = chosenSCI;
      if (tdDR) tdDR.textContent = realDR;

      // Feedback visual de éxito
      tdNoOp.classList.add('saved');
      setTimeout(() => tdNoOp.classList.remove('saved'), 800);

      closeAnyOpSciEditor(); // Cierra el editor solo si fue exitoso

    } catch (err) {
      // 4. ERROR: Si algo falló, lo atrapamos aquí.
      console.error("Error al guardar:", err); // Muestra el error en la consola

      // Feedback visual de error
      host.querySelector('.op-sci-box').classList.add('opsi-error');
      setTimeout(() => host.querySelector('.op-sci-box').classList.remove('opsi-error'), 1000);

      // El editor NO se cierra, para que el usuario pueda intentarlo de nuevo.

    } finally {
      // 5. FINALMENTE: Este bloque se ejecuta siempre, haya error o no.
      // Reactivamos los botones.
      $btnOk.disabled = false;
      $btnKo.disabled = false;
      $btnOk.textContent = 'Guardar (Enter)';
    }
  }
  function cancel() {
    closeAnyOpSciEditor();
  }

  // --- Eventos UI (Modificados) ---
  const debOpSearch = debounce(async (txt) => {
    if (!txt.trim()) { $opBox.innerHTML = ''; return; }
    const ops = await apiBuscarOps(txt, 8);
    renderOpSuggestions(ops);
  }, 250);

  $opI.addEventListener('input', (e) => {
    $opBox.style.display = 'block';
    chosenOP = '';
    chosenSCI = '';
    descRef = '';
    $drOut.value = '';
    $sciI.value = '';
    $sciI.disabled = true;
    $sciI.placeholder = 'Seleccione una OP primero...';
    $sciBox.innerHTML = '';
    debOpSearch(e.target.value || '');
  });

  // ✅ CAMBIO CLAVE: El input de SCI ahora reacciona a 'click' para mostrar la lista
  $sciI.addEventListener('click', () => {
    // Si ya hay SCIs cargados, los muestra
    if (sciPool.length > 0) {
      renderSciSuggestions(sciPool);
    }
  });

  $btnOk.addEventListener('click', save);
  $btnKo.addEventListener('click', cancel);

  host.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); save(); }
    if (e.key === 'Escape') { e.preventDefault(); cancel(); }
  });

  setTimeout(() => {
    const onDoc = (ev) => {
      if (!host.contains(ev.target)) {
        cancel();
        document.removeEventListener('mousedown', onDoc);
      }
    };
    document.addEventListener('mousedown', onDoc);
  }, 0);

  (async () => {
    if (currOP) {
      $sciI.disabled = false;
      $sciI.placeholder = 'Haga clic para seleccionar SCI';
      sciPool = await apiBuscarSciPorOp(currOP, '', 200);
    } else {
      $opI.focus();
    }
  })();
}