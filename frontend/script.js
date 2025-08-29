const GQL = '/graphql';

// AbortController para cancelar la petición anterior si el usuario sigue tecleando
let currentAbort;

// ----------- Validación de fecha y hora -----------------

/**
 * Valida el rango completo de fecha/hora de una fila.
 * Marca las celdas con error si la validación falla.
 * @param {HTMLTableRowElement} tr - La fila <tr> que se está validando.
 * @param {string} campoActual - El 'data-field' del campo que se acaba de editar.
 * @param {string} valorNuevo - El nuevo valor para el campo que se acaba de editar.
 * @returns {boolean} - 'true' si es válido, 'false' si no.
 */
function validarRangoFechaHora(tr, campoActual, valorNuevo) {
  // 1. Referencias a las 4 celdas de fecha/hora
  const tdFi = tr.querySelector('td[data-field="fecha_inicio"]');
  const tdHi = tr.querySelector('td[data-field="hora_inicio"]');
  const tdFf = tr.querySelector('td[data-field="fecha_final"]');
  const tdHf = tr.querySelector('td[data-field="hora_final"]');

  // Limpia errores previos en las 4 celdas
  [tdFi, tdHi, tdFf, tdHf].forEach(td => td.classList.remove('error'));

  // 2. Obtiene los 4 valores, usando el valor nuevo para el campo que se está editando
  const fi = campoActual === 'fecha_inicio' ? valorNuevo : tdFi.textContent.trim();
  const hi = campoActual === 'hora_inicio' ? valorNuevo : tdHi.textContent.trim();
  const ff = campoActual === 'fecha_final' ? valorNuevo : tdFf.textContent.trim();
  const hf = campoActual === 'hora_final' ? valorNuevo : tdHf.textContent.trim();

  // Si falta algún dato, la validación pasa por ahora (se validará el no-vacío en otra parte)
  if (!fi || !hi || !ff || !hf) return true;

  // 3. Crea los objetos Date para comparar
  const start = new Date(`${fi}T${hi}`);
  const end = new Date(`${ff}T${hf}`);

  // 4. Ejecuta las validaciones
  if (end <= start) {
    console.error('Validation Error: La fecha final debe ser mayor que la inicial.');
    tdFf.classList.add('error');
    tdHf.classList.add('error');
    return false; // No es válido
  }

  const diffHoras = (end - start) / 3600000; // 36e5 es 3600000
  if (diffHoras > 14) {
    console.error('Validation Error: El rango no puede superar las 14 horas.');
    tdFf.classList.add('error');
    tdHf.classList.add('error');
    return false; // No es válido
  }

  // 5. Si todo está bien, devuelve true
  return true;
}

// --------------------------------------------------------

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
  const cc = tr?.dataset.id;
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
    input.step = 'any';
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
    const tr = td.closest('tr');
    const id = tr?.dataset.id;

    // Validación común: no permitir vacío en ningún campo
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

    // Validación de constraints nativos (date min/max, time min/max)
    if (!input.checkValidity()) {
      markErrorAndRefocus();
      return;
    }

    // --- INICIO DE LA VALIDACIÓN DE RANGO ---
    // Si el campo que se editó es una fecha o una hora, valida el rango completo.
    if (isDate || isTime) {
      const esRangoValido = validarRangoFechaHora(tr, field, newDisplay);
      if (!esRangoValido) {
        // La función validarRangoFechaHora ya marcó los errores visualmente.
        // Cancelamos la edición para revertir el texto de la celda actual.
        cancel();
        return; // Detiene el proceso de guardado
      }
    }
    // --- FIN DE LA VALIDACIÓN DE RANGO ---

    // Si todas las validaciones pasan, procede a guardar
    td.classList.add('saving');
    try {
      const payload = isNumber ? Number(newDisplay) : newDisplay;
      await mutateUpdate(id, { [field]: payload });
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
const ESTADO_C = { value: 'N/A', label: 'N/A' };

function renderEstadoSelect(valorBD) {
  // Si el valor es "N/A", retorna un select deshabilitado.
  if (normText(valorBD) === 'n/a') {
    return `
      <select class="estado-select" data-field="estado_sci" disabled>
        <option selected>N/A</option>
      </select>
    `;
  }

  // Si no es "N/A", ejecuta la lógica normal para crear el select editable.
  const n = normText(valorBD);
  const isProceso = n.includes('en proceso') || n.includes('proceso');
  const isFinalizado = n.includes('finalizado');

  const optionA = `<option value="En proceso" ${isProceso ? 'selected' : ''}>En proceso</option>`;
  const optionB = `<option value="Finalizado" ${isFinalizado ? 'selected' : ''}>Finalizado</option>`;

  return `
    <select class="estado-select" data-field="estado_sci">
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
  "Horario O (08:00 - 16:00)",
  "N/A"
];

// EN: script.js

// ✅ REEMPLAZA tu función 'renderHorarioSelect' con esta versión
function renderHorarioSelect(valorBD) {
  // Si el valor es "N/A", retorna un select deshabilitado.
  if (normText(valorBD) === 'n/a') {
    return `
      <select class="horario-select" data-field="horario" disabled>
        <option selected>N/A</option>
      </select>
    `;
  }

  // Si no es "N/A", ejecuta la lógica normal para crear el select editable.
  const n = normText(valorBD);
  const current = HORARIOS.find(act => normText(act) === n);

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
  "N/A"
];

function renderObservacionSelect(valorBD) {
  // Si el valor es "N/A", retorna un select deshabilitado.
  if (normText(valorBD) === 'n/a') {
    return `
      <select class="observaciones-select" data-field="observaciones" disabled>
        <option selected>N/A</option>
      </select>
    `;
  }

  // Si no es "N/A", ejecuta la lógica normal para crear el select editable.
  const n = normText(valorBD);
  const current = OBSERVACION.find(act => normText(act) === n);

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

  // GUARDA LA POSICIÓN ACTUAL DEL SCROLL
  const scrollY = window.scrollY;
  
  lista.textContent = 'Cargando…';

  const query = `
    query ($limit:Int!, $offset:Int!, $q:String, $dateFrom:String, $dateTo:String) {
      formularios(limit:$limit, offset:$offset, q:$q, dateFrom:$dateFrom, dateTo:$dateTo) {
        total
        count
        items {
          id cc nombres sede no_op sci_ref descripcion_referencia
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
        tr.dataset.id = it.id;
        tr.dataset.cc = it.cc;
        tr.innerHTML = `
          <td data-field="id" class="ro">${it.id ?? ''}</td>
          <td id="celda-cc" data-field="cc"              class="ro" tabindex="0">${it.cc ?? ''}</td>
          <td id="celda-nombre" data-field="nombres"         class="ro" tabindex="0">${it.nombres ?? ''}</td>
          <td data-field="actividad"       tabindex="0">${renderActividadSelect(it.actividad)}</td>
          <td data-field="sede"            tabindex="0">${renderSedeSelect(it.sede)}</td>
          <td data-field="fecha_inicio"    tabindex="0">${it.fecha_inicio ?? ''}</td>
          <td data-field="fecha_final"     tabindex="0">${it.fecha_final ?? ''}</td>
          <td data-field="hora_inicio"     tabindex="0">${it.hora_inicio ?? ''}</td>
          <td data-field="hora_final"      tabindex="0">${it.hora_final ?? ''}</td>
          <td data-field="no_op"           class="${it.no_op === 'N/A' ? 'ro' : ''}" tabindex="0">${it.no_op ?? ''}</td>
          <td data-field="sci_ref"         class="${it.sci_ref === 'N/A' ? 'ro' : ''}" tabindex="0">${it.sci_ref ?? ''}</td>
          <td data-field="descripcion_referencia" class="ro" tabindex="0">${it.descripcion_referencia ?? ''}</td>
          <td data-field="estado_sci"      tabindex="0">${renderEstadoSelect(it.estado_sci)}</td>
          <td data-field="cantidad"        class="${it.cantidad === 0 ? 'ro' : ''}" tabindex="0">${it.cantidad ?? 0}</td>
          <td data-field="area"            class="${it.area === 'N/A' ? 'ro' : ''}" tabindex="0">${it.area ?? ''}</td>
          <td data-field="maquina"         class="${it.maquina === 'N/A' ? 'ro' : ''}" tabindex="0">${it.maquina ?? ''}</td>
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

    // RESTAURA LA POSICIÓN DEL SCROLL
    window.scrollTo(0, scrollY);


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

async function mutateUpdate(id, patch) {
  const m = `
    mutation ($id: ID!, $patch: FormularioPatch!) {
      updateFormulario(id: $id, patch: $patch) { id }
    }
  `;
  await gql(m, { id, patch });
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
  // Click: seleccionar celda (opcional)
  lista.addEventListener('click', (e) => {
    const td = e.target.closest('td');
    if (!td) return;
    lista.querySelectorAll('td.selected').forEach(c => c.classList.remove('selected'));
    td.classList.add('selected');
  });

  // Doble-click para abrir el editor apropiado
  lista.addEventListener('dblclick', (e) => {
    const td = e.target.closest('td');
    if (!td || td.classList.contains('ro')) return;

    const field = td.dataset.field;

    if (field === 'no_op' || field === 'sci_ref') {
      const tdNoOp = td.closest('tr').querySelector('td[data-field="no_op"]');
      if (tdNoOp) openOpSciEditor(tdNoOp);
    } else if (field === 'area' || field === 'maquina') {
      const tdArea = td.closest('tr').querySelector('td[data-field="area"]');
      if (tdArea) openAreaMaquinaEditor(tdArea);
    } else {
      startCellEdit(td);
    }
  });

  // F2 para abrir el editor de OP/SCI
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

  // Teclas dentro de la celda editable (contenteditable)
  lista.addEventListener('keydown', (e) => {
    const td = e.target.closest('td[contenteditable="true"]');
    if (!td) return;

    if (e.key === 'Enter') {
      e.preventDefault();
      td.blur();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      td.textContent = td.dataset.orig || '';
      td.blur();
    }
  });

  // Guardar al salir de la celda editable (blur)
  lista.addEventListener('blur', async (e) => {
    const td = e.target.closest('td[contenteditable="true"]');
    if (!td) return;

    const tr = td.closest('tr');
    if (!tr) return;

    const id = tr.dataset.id;
    const orig = (td.dataset.orig || '').trim();
    const val = td.textContent.trim();
    const field = td.dataset.field;

    disableEdit(td);

    if (val === orig) return;

    try {
      if (field === 'cantidad' && val !== '' && isNaN(Number(val))) {
        throw new Error('Debe ser numérico');
      }
      td.classList.add('saving');
      const patch = { [field]: (val === '' ? null : field === 'cantidad' ? Number(val) : val) };
      await mutateUpdate(id, patch);
      td.classList.remove('saving');
      td.classList.add('saved');
      setTimeout(() => td.classList.remove('saved'), 600);
    } catch (err) {
      console.error('Update error:', err);
      td.classList.remove('saving');
      td.classList.add('error');
      td.textContent = orig;
      setTimeout(() => td.classList.remove('error'), 800);
    }
  }, true);

  lista.addEventListener('change', async (e) => {
    const sel = e.target.closest('select[data-field]');
    if (!sel) return;

    // Define 'tr' primero
    const tr = sel.closest('tr');
    if (!tr) return;

    // Ahora obtén el 'id' y los demás datos
    const id = tr.dataset.id;
    const field = sel.dataset.field;
    const val = sel.value;

    if (!id) {
      console.error("No se pudo encontrar el 'id' de la fila para el select.");
      return;
    }

    try {
      sel.disabled = true;
      await mutateUpdate(id, { [field]: val });
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

  // Listener para el botón de limpiar filtros
  btnClear?.addEventListener('click', () => {
    inputQ.value = '';
    if (pickerEl._litepicker) {
      pickerEl._litepicker.clearSelection();
    } else {
      pickerEl.value = '';
    }
    dateFrom = '';
    dateTo = '';
    offset = 0;
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

setInterval(() => {
  console.log('Actualizando datos automáticamente...');
  cargar(inputQ.value.trim());
}, 30000);


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

//----editor embebido------
// Cierra cualquier editor abierto

function closeAnyOpSciEditor() {
  // Elimina cualquier editor abierto
  document.querySelectorAll('.op-sci-editor').forEach(n => n.remove());
  // Elimina cualquier fondo oscuro (overlay)
  document.querySelectorAll('.editor-overlay').forEach(n => n.remove());
  // Quita el resaltado de cualquier fila
  document.querySelectorAll('tr.editing-row').forEach(r => r.classList.remove('editing-row'));
}

// Crea y abre el editor sobre la celda de OP
function openOpSciEditor(tdNoOp) {
  closeAnyOpSciEditor();

  const tr = tdNoOp.closest('tr');
  const tdSci = tr.querySelector('td[data-field="sci_ref"]');
  const tdDR = tr.querySelector('td[data-field="descripcion_referencia"]');
  const id = tr.dataset.id;

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
  const overlay = document.createElement('div');
  overlay.className = 'editor-overlay';
  document.body.appendChild(overlay);

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

  function closeEditor() {
    tr.classList.remove('editing-row');
    host.remove();
    overlay.remove();
  }

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

    // Muestra las sugerencias de SCI automáticamente
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
    const id = tr.dataset.id;
    if (!id) {
      console.error("Error crítico: No se encontró el 'id' de la fila para guardar.");
      return;
    }

    if (!chosenOP || !chosenSCI) {
      host.querySelector('.op-sci-box').classList.add('opsi-error');
      setTimeout(() => host.querySelector('.op-sci-box').classList.remove('opsi-error'), 800);
      return;
    }

    $btnOk.disabled = true;
    $btnKo.disabled = true;
    $btnOk.textContent = 'Guardando...';

    try {
      const realDR = await apiRefPorOpSci(chosenOP, chosenSCI) || '';

      // CORRECCIÓN: Llama a la función correcta 'mutateUpdate'
      await mutateUpdate(id, {
        no_op: chosenOP,
        sci_ref: chosenSCI,
        descripcion_referencia: realDR
      });

      // Actualiza la tabla visualmente
      tdNoOp.textContent = chosenOP;
      tdSci.textContent = chosenSCI;
      tdDR.textContent = realDR;

      // Feedback y cierre
      tdNoOp.classList.add('saved');
      setTimeout(() => tdNoOp.classList.remove('saved'), 800);
      closeEditor();

    } catch (err) {
      console.error("Error al guardar OP/SCI:", err);
      host.querySelector('.op-sci-box').classList.add('opsi-error');
      setTimeout(() => host.querySelector('.op-sci-box').classList.remove('opsi-error'), 1000);
    } finally {
      $btnOk.addEventListener('click', save);
      $btnKo.addEventListener('click', closeEditor);
      overlay.addEventListener('click', closeEditor);
    }

    host.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); save(); }
      if (e.key === 'Escape') { e.preventDefault(); closeEditor(); } // ✅ CORREGIDO
    });

    setTimeout(() => {
      const onDoc = (ev) => {
        if (!host.contains(ev.target)) {
          closeEditor(); // ✅ CORREGIDO
          document.removeEventListener('mousedown', onDoc);
        }
      };
      document.addEventListener('mousedown', onDoc);
    }, 0);

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

// ---------------------------CT PN  y MÁQUINAS-------------------------------
async function apiGetCtpnList() {
  const q = `query { ctpnList }`;
  const { ctpnList } = await gql(q);
  return ctpnList || [];
}

async function apiGetMaquinasPorCtpn(ctpn) {
  const q = `query($ctpn: String!) { maquinasPorCtpn(ctpn: $ctpn) }`;
  const { maquinasPorCtpn } = await gql(q, { ctpn });
  return maquinasPorCtpn || [];
}


function openAreaMaquinaEditor(tdArea) {
  closeAnyOpSciEditor(); // Cierra cualquier otro editor que esté abierto

  const tr = tdArea.closest('tr');
  const tdMaquina = tr.querySelector('td[data-field="maquina"]');
  const cc = tr.dataset.cc;
  const id = tr.dataset.id;

  // Resaltar la fila actual
  tr.classList.add('editing-row');

  // Valores actuales de la tabla
  const currArea = tdArea.textContent.trim();
  const currMaquina = tdMaquina.textContent.trim();

  // Crear el HTML del editor
  const host = document.createElement('div');
  host.className = 'op-sci-editor';
  host.innerHTML = `
    <div class="ctpn-maq-box">
      <label>Área (CT Pn)</label>
      <select class="area-select" disabled>
        <option>Cargando áreas...</option>
      </select>

      <label>Máquina</label>
      <select class="maquina-select" disabled>
        <option>Seleccione un área...</option>
      </select>

      <div class="opsi-actions">
        <button class="btn-cancel">Cancelar</button>
        <button class="btn-save">Guardar</button>
      </div>
    </div>
  `;

  // Posicionamiento centrado y overlay
  host.style.position = 'fixed';
  host.style.left = '50%';
  host.style.top = '50%';
  host.style.transform = 'translate(-50%, -50%) scale(0.95)';
  host.style.zIndex = 10001;
  document.body.appendChild(host);

  const overlay = document.createElement('div');
  overlay.className = 'editor-overlay';
  document.body.appendChild(overlay);

  // Referencias a los elementos del editor
  const $areaSelect = host.querySelector('.area-select');
  const $maquinaSelect = host.querySelector('.maquina-select');
  const $btnOk = host.querySelector('.btn-save');
  const $btnKo = host.querySelector('.btn-cancel');


  /**
   * Carga las máquinas para un área específica y selecciona una si se provee.
   * @param {string} areaSeleccionada - El área (CTPn) por la cual filtrar.
   * @param {string | null} maquinaActual - La máquina que debe quedar seleccionada.
   */
  async function cargarMaquinas(areaSeleccionada, maquinaActual = null) {
    $maquinaSelect.innerHTML = `<option>Cargando máquinas...</option>`;
    $maquinaSelect.disabled = true;

    // Si no hay un área seleccionada, resetea el select de máquinas.
    if (!areaSeleccionada) {
      $maquinaSelect.innerHTML = `<option value="">Seleccione un área...</option>`;
      return;
    }

    const maquinas = await apiGetMaquinasPorCtpn(areaSeleccionada);

    $maquinaSelect.innerHTML = `<option value="">Seleccione una máquina...</option>`;
    maquinas.forEach(m => {
      const esSeleccionada = m === maquinaActual;
      const optionHTML = `<option value="${m}" ${esSeleccionada ? 'selected' : ''}>${m}</option>`;
      $maquinaSelect.innerHTML += optionHTML;
    });
    $maquinaSelect.disabled = false;
  }

  // Evento: cuando el usuario cambia el área, recarga las máquinas.
  $areaSelect.addEventListener('change', () => {
    const nuevaArea = $areaSelect.value;
    cargarMaquinas(nuevaArea); // Simplemente llama a la función de carga
  });

  // --- Lógica de Guardado y Cancelación (Sin cambios) ---

  function closeEditor() {
    tr.classList.remove('editing-row');
    host.remove();
    overlay.remove();
  }

  async function save() {
    const id = tr.dataset.id;
    const nuevaArea = $areaSelect.value;
    const nuevaMaquina = $maquinaSelect.value;

    if (!nuevaArea || !nuevaMaquina) {
      host.querySelector('.op-sci-box').classList.add('opsi-error');
      setTimeout(() => host.querySelector('.op-sci-box').classList.remove('opsi-error'), 500);
      return;
    }

    $btnOk.disabled = true;
    $btnOk.textContent = 'Guardando...';

    try {
      await mutateUpdate(id, { area: nuevaArea, maquina: nuevaMaquina });

      tdArea.textContent = nuevaArea;
      tdMaquina.textContent = nuevaMaquina;

      tdArea.classList.add('saved');
      setTimeout(() => tdArea.classList.remove('saved'), 800);

      closeEditor();
    } catch (err) {
      console.error("Error al guardar área/máquina:", err);
      $btnOk.disabled = false;
      $btnOk.textContent = 'Guardar';
    }
  }



  $btnOk.addEventListener('click', save);
  $btnKo.addEventListener('click', closeEditor);
  overlay.addEventListener('click', closeEditor);

  // --- Carga Inicial de Datos (Mejorada) ---
  (async () => {
    try {
      // 1. Carga la lista completa de áreas
      const areas = await apiGetCtpnList();
      $areaSelect.innerHTML = `<option value="">Seleccione un área...</option>`;
      areas.forEach(a => {
        const esSeleccionada = a === currArea;
        const optionHTML = `<option value="${a}" ${esSeleccionada ? 'selected' : ''}>${a}</option>`;
        $areaSelect.innerHTML += optionHTML;
      });
      $areaSelect.disabled = false;

      // 2. Si ya hay un área en la fila, carga sus máquinas correspondientes
      if (currArea) {
        await cargarMaquinas(currArea, currMaquina);
      }
    } catch (err) {
      console.error("Error al inicializar el editor de Área/Máquina:", err);
      $areaSelect.innerHTML = `<option>Error al cargar</option>`;
    }
  })();
}