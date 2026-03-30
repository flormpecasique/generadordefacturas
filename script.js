/* =============================================
   FACTURA RÁPIDA — script.js
   100% Client-Side · No Server · No Login
   ============================================= */

'use strict';

// =============================================
// STATE
// =============================================
let state = {
  lines: [],
  storageEnabled: false,
  lineIdCounter: 0
};

// =============================================
// VERI*FACTU — REGISTRO FISCAL (Camino B)
// Hash SHA-256 encadenado según RD 1007/2023
// Anexo II. NO es un SIF homologado.
// =============================================

/** SHA-256 de un string → hex MAYÚSCULAS (Web Crypto API nativa) */
async function sha256hex(message) {
  const data = new TextEncoder().encode(message);
  const buf  = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('').toUpperCase();
}

/**
 * Cadena de campos para la huella del registro (Anexo II RD 1007/2023):
 * NIF_EMISOR|NUM_SERIE|FECHA_EXPEDICION|TIPO_FACTURA|CUOTA_TOTAL|IMPORTE_TOTAL
 */
function buildHashInput(f) {
  return [f.nifEmisor, f.numSerie, f.fechaExpedicion,
          f.tipoFactura, f.cuotaTotal.toFixed(2), f.importeTotal.toFixed(2)].join('|');
}

/**
 * Cadena de encadenamiento con factura anterior:
 * HASH_ANTERIOR|NIF_EMISOR|NUM_SERIE|FECHA_EXPEDICION|IMPORTE_TOTAL
 */
function buildEncadenamientoInput(hashAnterior, f) {
  return [hashAnterior, f.nifEmisor, f.numSerie,
          f.fechaExpedicion, f.importeTotal.toFixed(2)].join('|');
}

/** Lee el último hash guardado (localStorage o sessionStorage) */
function getLastHash() {
  const key = 'factura_last_hash';
  return state.storageEnabled
    ? (localStorage.getItem(key) || '')
    : (sessionStorage.getItem(key + '_session') || '');
}

/** Persiste el hash generado para encadenar la siguiente factura */
function saveLastHash(hash) {
  const key = 'factura_last_hash';
  state.storageEnabled
    ? localStorage.setItem(key, hash)
    : sessionStorage.setItem(key + '_session', hash);
}

/** Genera el registro de facturación completo con hash encadenado */
async function generarRegistroFiscal() {
  const { base, iva, irpf, total } = calculateTotals();
  const ivaRate  = parseFloat(val('ivaType'));
  const irpfRate = parseFloat(val('irpfType'));
  const ahora    = new Date();

  const factura = {
    nifEmisor:       val('emisorNif') || 'NO-INFORMADO',
    numSerie:        val('invoiceNumber') || 'FAC-0001',
    fechaExpedicion: val('invoiceDate') || ahora.toISOString().split('T')[0],
    tipoFactura:     'F1',   // Factura completa
    cuotaTotal:      iva,
    importeTotal:    total,
  };

  const huella          = await sha256hex(buildHashInput(factura));
  const hashAnterior    = getLastHash();
  const hashEncadenado  = await sha256hex(buildEncadenamientoInput(hashAnterior, factura));

  const registro = {
    _aviso: 'Registro generado con fines de apoyo al contribuyente. ' +
            'No constituye un SIF homologado conforme al RD 1007/2023. ' +
            'Consulte con su asesor fiscal.',
    _normativa: 'RD 1007/2023 — Estructura Anexo II (simplificada, sin firma de fabricante)',
    IDFactura: {
      IDEmisorFactura:        factura.nifEmisor,
      NumSerieFactura:        factura.numSerie,
      FechaExpedicionFactura: factura.fechaExpedicion,
    },
    TipoFactura:         factura.tipoFactura,
    DescripcionOperacion: state.lines.filter(l => l.description)
      .map(l => l.description).join(' | ') || 'Servicios profesionales',
    ImporteTotal:  parseFloat(total.toFixed(2)),
    Desglose: {
      BaseImponible:    parseFloat(base.toFixed(2)),
      TipoImpositivo:   ivaRate,
      CuotaRepercutida: parseFloat(iva.toFixed(2)),
      ...(irpfRate > 0 && {
        RetencionIRPF: parseFloat(irpf.toFixed(2)),
        TipoRetencion: irpfRate,
      }),
    },
    Encadenamiento: {
      PrimerRegistro: hashAnterior === '' ? 'S' : 'N',
      ...(hashAnterior !== '' && {
        EncadenamientoAnterior: { HuellaAnterior: hashAnterior },
      }),
    },
    SistemaInformatico: {
      NombreSistema:    'FacturaRápida (herramienta de apoyo)',
      Version:          '1.0',
      NumeroInstalacion: 'CLIENT-SIDE',
      TipoUsoPosibleSoloVerifactu: 'N',
      TipoUsoPosibleMultiOT:       'N',
    },
    FechaHoraHusoGenRegistro: ahora.toISOString(),
    HuellaSistema:      huella,
    HashEncadenamiento: hashEncadenado,
    _inputHashGenerado:   buildHashInput(factura),
    _inputEncadenamiento: buildEncadenamientoInput(hashAnterior, factura),
  };

  return { registro, huella };
}

/** Exporta el registro fiscal como .json y actualiza la cadena */
async function exportarRegistroFiscal() {
  if (!val('invoiceNumber') || !val('emisorNif')) {
    showToast('⚠️ Rellena el Nº de factura y tu NIF antes de exportar');
    return;
  }

  const btn = document.getElementById('btnRegistroFiscal');
  if (btn) { btn.disabled = true; btn.style.opacity = '0.6'; }

  try {
    showToast('⏳ Calculando hash SHA-256…');
    const { registro, huella } = await generarRegistroFiscal();

    const blob = new Blob([JSON.stringify(registro, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `registro-fiscal_${val('invoiceNumber').replace(/[^a-zA-Z0-9\-_]/g, '_')}.json`;
    a.click();
    URL.revokeObjectURL(url);

    saveLastHash(huella);
    updateHashChainInfo();
    showToast('✅ Registro fiscal exportado y cadena actualizada');
  } catch (err) {
    console.error('Error registro fiscal:', err);
    showToast('❌ Error al generar el registro. Revisa los datos.');
  } finally {
    if (btn) { btn.disabled = false; btn.style.opacity = '1'; }
  }
}

/** Muestra el estado del encadenamiento bajo el botón */
function updateHashChainInfo() {
  const el = document.getElementById('hashChainInfo');
  if (!el) return;
  const last = getLastHash();
  if (last) {
    const short = last.substring(0, 12) + '…' + last.substring(last.length - 8);
    el.innerHTML = `🔗 Encadenado · hash anterior: <code title="${last}">${short}</code>`;
  } else {
    el.textContent = '🔗 Primera factura de la serie · sin encadenamiento previo';
  }
  el.style.display = 'block';
}

// =============================================
// INIT
// =============================================
document.addEventListener('DOMContentLoaded', () => {
  checkStoragePermission();
  setDefaultDates();
  generateInvoiceNumber();
  addLine();           // default first line
  bindAllInputs();
  bindFiscalSelects();
  loadSavedData();
  updatePreview();
  updateHashChainInfo();
});

// =============================================
// DATE HELPERS
// =============================================
function setDefaultDates() {
  const today = new Date();
  const invoiceDateEl = document.getElementById('invoiceDate');
  const dueDateEl = document.getElementById('dueDate');

  invoiceDateEl.value = formatDateInput(today);

  const due = new Date(today);
  due.setDate(due.getDate() + 30);
  dueDateEl.value = formatDateInput(due);
}

function formatDateInput(date) {
  return date.toISOString().split('T')[0];
}

function formatDateDisplay(dateStr) {
  if (!dateStr) return '—';
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}

// =============================================
// INVOICE NUMBER
// =============================================
function generateInvoiceNumber() {
  const year = new Date().getFullYear();
  let counter = 1;

  if (state.storageEnabled) {
    const saved = localStorage.getItem('factura_counter');
    if (saved) counter = parseInt(saved, 10);
  } else {
    const temp = sessionStorage.getItem('factura_counter_session');
    if (temp) counter = parseInt(temp, 10);
  }

  const number = `FAC-${year}-${String(counter).padStart(4, '0')}`;
  document.getElementById('invoiceNumber').value = number;
}

function incrementInvoiceCounter() {
  const year = new Date().getFullYear();
  let counter = 1;
  const key = 'factura_counter';

  if (state.storageEnabled) {
    const saved = localStorage.getItem(key);
    if (saved) counter = parseInt(saved, 10) + 1;
    localStorage.setItem(key, counter);
  } else {
    const temp = sessionStorage.getItem(key + '_session');
    if (temp) counter = parseInt(temp, 10) + 1;
    sessionStorage.setItem(key + '_session', counter);
  }

  return `FAC-${year}-${String(counter).padStart(4, '0')}`;
}

// =============================================
// LOCAL STORAGE MANAGEMENT
// =============================================
function checkStoragePermission() {
  const allowed = localStorage.getItem('factura_storage_allowed');
  if (allowed === 'yes') {
    state.storageEnabled = true;
    hideBanner();
    updateBannerButton();
  }
}

function enableLocalStorage() {
  state.storageEnabled = true;
  localStorage.setItem('factura_storage_allowed', 'yes');
  saveToLocalStorage();
  hideBanner();
  showToast('💾 Guardado en este dispositivo activado');
}

function hideBanner() {
  const banner = document.getElementById('privacyBanner');
  if (banner) banner.style.display = 'none';
}

function closeBanner() {
  hideBanner();
}

function updateBannerButton() {
  const btn = document.getElementById('btnEnableStorage');
  if (btn && state.storageEnabled) {
    btn.textContent = '✅ Guardando en dispositivo';
    btn.disabled = true;
    btn.style.opacity = '0.6';
  }
}

function saveToLocalStorage() {
  if (!state.storageEnabled) return;

  const data = {
    emisorNombre: val('emisorNombre'),
    emisorNif: val('emisorNif'),
    emisorDireccion: val('emisorDireccion'),
    emisorEmail: val('emisorEmail'),
    emisorTelefono: val('emisorTelefono'),
    paymentConditions: val('paymentConditions'),
    bankAccount: val('bankAccount'),
    ivaType: val('ivaType'),
    irpfType: val('irpfType'),
    savedAt: new Date().toISOString()
  };

  localStorage.setItem('factura_emisor_data', JSON.stringify(data));
}

function loadSavedData() {
  if (!state.storageEnabled) return;

  const raw = localStorage.getItem('factura_emisor_data');
  if (!raw) return;

  try {
    const data = JSON.parse(raw);
    setVal('emisorNombre', data.emisorNombre);
    setVal('emisorNif', data.emisorNif);
    setVal('emisorDireccion', data.emisorDireccion);
    setVal('emisorEmail', data.emisorEmail);
    setVal('emisorTelefono', data.emisorTelefono);
    setVal('paymentConditions', data.paymentConditions);
    setVal('bankAccount', data.bankAccount);
    setVal('ivaType', data.ivaType || '21');
    setVal('irpfType', data.irpfType || '0');
    updatePreview();
  } catch (e) {
    console.warn('Error loading saved data:', e);
  }
}

// =============================================
// LINES MANAGEMENT
// =============================================
function addLine() {
  const id = ++state.lineIdCounter;
  state.lines.push({ id, description: '', qty: 1, price: 0 });
  renderLines();
  updatePreview();
}

function removeLine(id) {
  if (state.lines.length <= 1) {
    showToast('⚠️ Debe haber al menos una línea');
    return;
  }
  state.lines = state.lines.filter(l => l.id !== id);
  renderLines();
  updatePreview();
}

function renderLines() {
  const container = document.getElementById('linesContainer');
  container.innerHTML = '';

  state.lines.forEach(line => {
    const div = document.createElement('div');
    div.className = 'invoice-line';
    div.dataset.id = line.id;

    div.innerHTML = `
      <input
        type="text"
        placeholder="Descripción del servicio"
        value="${escapeHtml(line.description)}"
        oninput="updateLine(${line.id}, 'description', this.value)"
        aria-label="Descripción"
      >
      <input
        type="number"
        placeholder="1"
        value="${line.qty}"
        min="0"
        step="any"
        oninput="updateLine(${line.id}, 'qty', this.value)"
        aria-label="Cantidad"
      >
      <input
        type="number"
        placeholder="0,00"
        value="${line.price > 0 ? line.price : ''}"
        min="0"
        step="0.01"
        oninput="updateLine(${line.id}, 'price', this.value)"
        aria-label="Precio unitario"
      >
      <div class="line-total" aria-label="Total línea">${formatCurrency(line.qty * line.price)}</div>
      <button
        class="btn-remove-line"
        onclick="removeLine(${line.id})"
        type="button"
        aria-label="Eliminar línea"
      >×</button>
    `;

    container.appendChild(div);
  });
}

function updateLine(id, field, value) {
  const line = state.lines.find(l => l.id === id);
  if (!line) return;

  if (field === 'description') {
    line.description = value;
  } else if (field === 'qty') {
    line.qty = parseFloat(value) || 0;
  } else if (field === 'price') {
    line.price = parseFloat(value) || 0;
  }

  // Update total display in the row
  const container = document.getElementById('linesContainer');
  const row = container.querySelector(`[data-id="${id}"]`);
  if (row) {
    const totalEl = row.querySelector('.line-total');
    if (totalEl) totalEl.textContent = formatCurrency(line.qty * line.price);
  }

  updatePreview();
  if (state.storageEnabled) saveToLocalStorage();
}

// =============================================
// CALCULATE TOTALS
// =============================================
function calculateTotals() {
  const base = state.lines.reduce((sum, l) => sum + (l.qty * l.price), 0);
  const ivaRate = parseFloat(val('ivaType')) / 100;
  const irpfRate = parseFloat(val('irpfType')) / 100;

  const iva = base * ivaRate;
  const irpf = base * irpfRate;
  const total = base + iva - irpf;

  return { base, iva, irpf, total, ivaRate, irpfRate };
}

// =============================================
// BIND INPUTS
// =============================================
function bindAllInputs() {
  const ids = [
    'invoiceNumber', 'invoiceDate', 'dueDate',
    'emisorNombre', 'emisorNif', 'emisorDireccion', 'emisorEmail', 'emisorTelefono',
    'clienteNombre', 'clienteNif', 'clienteDireccion', 'clienteEmail',
    'paymentConditions', 'bankAccount', 'invoiceNotes', 'exemptNote'
  ];

  ids.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('input', () => {
        updatePreview();
        if (state.storageEnabled) saveToLocalStorage();
      });
    }
  });
}

function bindFiscalSelects() {
  const ivaSelect = document.getElementById('ivaType');
  const irpfSelect = document.getElementById('irpfType');
  const exemptGroup = document.getElementById('exemptNoteGroup');

  ivaSelect.addEventListener('change', () => {
    const isZero = ivaSelect.value === '0';
    exemptGroup.style.display = isZero ? 'block' : 'none';
    updatePreview();
  });

  irpfSelect.addEventListener('change', updatePreview);
}

// =============================================
// PREVIEW RENDER
// =============================================
function updatePreview() {
  const preview = document.getElementById('invoicePreview');
  const { base, iva, irpf, total } = calculateTotals();

  const emisorNombre = val('emisorNombre');
  const hasContent = emisorNombre || val('clienteNombre') || base > 0;

  if (!hasContent) {
    preview.innerHTML = `
      <div class="inv-empty">
        <div class="inv-empty-icon">📄</div>
        <p class="inv-empty-text">Empieza a rellenar el formulario para ver tu factura aquí</p>
      </div>
    `;
    return;
  }

  const ivaRate = parseFloat(val('ivaType'));
  const irpfRate = parseFloat(val('irpfType'));
  const exemptNote = val('exemptNote');
  const paymentConditions = val('paymentConditions');
  const bankAccount = val('bankAccount');
  const invoiceNotes = val('invoiceNotes');
  const dueDate = val('dueDate');

  // Lines rows
  const linesHTML = state.lines.filter(l => l.description || l.price > 0).map(l => `
    <tr>
      <td>${escapeHtml(l.description) || '<em style="opacity:0.4">Sin descripción</em>'}</td>
      <td>${formatNumber(l.qty)}</td>
      <td>${formatCurrency(l.price)}</td>
      <td>${formatCurrency(l.qty * l.price)}</td>
    </tr>
  `).join('') || `<tr><td colspan="4" style="text-align:center;opacity:0.4;font-style:italic;padding:16px">Sin conceptos</td></tr>`;

  // IVA row
  const ivaRow = ivaRate > 0
    ? `<div class="inv-totals-row inv-totals-row--iva">
        <span>IVA (${ivaRate}%)</span>
        <span>+ ${formatCurrency(iva)}</span>
       </div>`
    : `<div class="inv-totals-row">
        <span>IVA</span>
        <span>Exento</span>
       </div>`;

  // IRPF row
  const irpfRow = irpfRate > 0
    ? `<div class="inv-totals-row inv-totals-row--irpf">
        <span>IRPF (−${irpfRate}%)</span>
        <span>− ${formatCurrency(irpf)}</span>
       </div>`
    : '';

  // Footer details
  const footerParts = [];
  if (paymentConditions) footerParts.push(`<div class="inv-footer-row"><strong>Pago:</strong> <span>${escapeHtml(paymentConditions)}</span></div>`);
  if (bankAccount) footerParts.push(`<div class="inv-footer-row"><strong>IBAN:</strong> <span style="font-family:var(--font-mono)">${escapeHtml(bankAccount)}</span></div>`);
  if (dueDate) footerParts.push(`<div class="inv-footer-row"><strong>Vencimiento:</strong> <span>${formatDateDisplay(dueDate)}</span></div>`);
  if (invoiceNotes) footerParts.push(`<div class="inv-footer-row"><span>${escapeHtml(invoiceNotes)}</span></div>`);
  if (exemptNote && ivaRate === 0) footerParts.push(`<div class="inv-exempt-note">${escapeHtml(exemptNote)}</div>`);

  preview.innerHTML = `
    <div class="inv-document" id="invoiceDocument">

      <div class="inv-header">
        <div class="inv-brand">
          <div class="inv-brand-name">${escapeHtml(emisorNombre) || 'Tu Empresa'}</div>
          ${val('emisorNif') ? `<div class="inv-brand-nif">NIF: ${escapeHtml(val('emisorNif'))}</div>` : ''}
          ${val('emisorDireccion') ? `<div class="inv-brand-address">${escapeHtml(val('emisorDireccion'))}</div>` : ''}
          ${val('emisorEmail') ? `<div class="inv-brand-nif">${escapeHtml(val('emisorEmail'))}</div>` : ''}
          ${val('emisorTelefono') ? `<div class="inv-brand-nif">${escapeHtml(val('emisorTelefono'))}</div>` : ''}
        </div>
        <div class="inv-meta">
          <div class="inv-title">FACTURA</div>
          <div class="inv-number">${escapeHtml(val('invoiceNumber')) || 'FAC-2026-0001'}</div>
          <div class="inv-date">📅 ${formatDateDisplay(val('invoiceDate'))}</div>
        </div>
      </div>

      <div class="inv-parties">
        <div class="inv-party">
          <div class="inv-party-label">Emisor</div>
          <div class="inv-party-name">${escapeHtml(emisorNombre) || '—'}</div>
          ${val('emisorNif') ? `<div class="inv-party-detail">NIF: ${escapeHtml(val('emisorNif'))}</div>` : ''}
          ${val('emisorDireccion') ? `<div class="inv-party-detail">${escapeHtml(val('emisorDireccion'))}</div>` : ''}
        </div>
        <div class="inv-party">
          <div class="inv-party-label">Cliente</div>
          <div class="inv-party-name">${escapeHtml(val('clienteNombre')) || '—'}</div>
          ${val('clienteNif') ? `<div class="inv-party-detail">NIF: ${escapeHtml(val('clienteNif'))}</div>` : ''}
          ${val('clienteDireccion') ? `<div class="inv-party-detail">${escapeHtml(val('clienteDireccion'))}</div>` : ''}
          ${val('clienteEmail') ? `<div class="inv-party-detail">${escapeHtml(val('clienteEmail'))}</div>` : ''}
        </div>
      </div>

      <table class="inv-lines-table">
        <thead>
          <tr>
            <th>Concepto</th>
            <th>Cant.</th>
            <th>Precio u.</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>${linesHTML}</tbody>
      </table>

      <div class="inv-totals">
        <div class="inv-totals-table">
          <div class="inv-totals-row">
            <span>Base imponible</span>
            <span>${formatCurrency(base)}</span>
          </div>
          ${ivaRow}
          ${irpfRow}
          <div class="inv-totals-divider"></div>
          <div class="inv-totals-row inv-totals-row--total">
            <span>Total</span>
            <span>${formatCurrency(total)}</span>
          </div>
        </div>
      </div>

      ${footerParts.length ? `<div class="inv-footer">${footerParts.join('')}</div>` : ''}

    </div>
  `;
}

// =============================================
// PRINT / PDF — Mobile-compatible via html2canvas + jsPDF
// =============================================
async function printInvoice() {
  const invoiceDoc = document.getElementById('invoiceDocument');
  if (!invoiceDoc) {
    showToast('⚠️ Rellena la factura antes de descargar');
    return;
  }

  // Check libraries are loaded
  if (typeof html2canvas === 'undefined' || typeof window.jspdf === 'undefined') {
    showToast('⏳ Cargando librerías… inténtalo de nuevo');
    return;
  }

  // Disable button to prevent double-click
  const btn = document.querySelector('.btn--primary');
  if (btn) { btn.disabled = true; btn.style.opacity = '0.6'; }

  showToast('⏳ Generando PDF…');

  try {
    // Render the invoice with forced light theme + fixed width for consistent output
    const canvas = await html2canvas(invoiceDoc, {
      scale: 2,
      useCORS: true,
      allowTaint: false,
      backgroundColor: '#ffffff',
      logging: false,
      width: invoiceDoc.scrollWidth,
      height: invoiceDoc.scrollHeight,
      onclone: (clonedDoc) => {
        // Force light theme on the clone so dark-mode users get a white PDF
        clonedDoc.documentElement.setAttribute('data-theme', 'light');
        // Ensure the cloned invoice document has white background
        const clonedInvoice = clonedDoc.getElementById('invoiceDocument');
        if (clonedInvoice) {
          clonedInvoice.style.background = '#ffffff';
          clonedInvoice.style.color = '#111111';
        }
      }
    });

    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
      compress: true
    });

    const pageW = pdf.internal.pageSize.getWidth();   // 210mm
    const pageH = pdf.internal.pageSize.getHeight();  // 297mm
    const margin = 10; // mm
    const usableW = pageW - margin * 2; // 190mm
    const usableH = pageH - margin * 2; // 277mm

    // Calculate image dimensions preserving aspect ratio
    const aspectRatio = canvas.width / canvas.height;
    let imgW = usableW;
    let imgH = imgW / aspectRatio;

    // If taller than one page, scale down to fit
    if (imgH > usableH) {
      imgH = usableH;
      imgW = imgH * aspectRatio;
    }

    // Center horizontally if narrower than page
    const xOffset = margin + (usableW - imgW) / 2;

    const imgData = canvas.toDataURL('image/jpeg', 0.95);
    pdf.addImage(imgData, 'JPEG', xOffset, margin, imgW, imgH);

    // Safe filename (remove special chars)
    const rawNumber = val('invoiceNumber') || 'factura';
    const filename = rawNumber.replace(/[^a-zA-Z0-9\-_]/g, '_') + '.pdf';

    pdf.save(filename);
    showToast('✅ PDF descargado correctamente');

  } catch (err) {
    console.error('PDF generation error:', err);
    showToast('❌ Error al generar el PDF. Recarga la página.');
  } finally {
    // Re-enable button
    if (btn) { btn.disabled = false; btn.style.opacity = '1'; }
  }
}

// =============================================
// COPY TO CLIPBOARD
// =============================================
function copyInvoice() {
  const { base, iva, irpf, total } = calculateTotals();
  const ivaRate = parseFloat(val('ivaType'));
  const irpfRate = parseFloat(val('irpfType'));

  const lines = state.lines
    .filter(l => l.description || l.price > 0)
    .map(l => `  • ${l.description || 'Sin descripción'} — ${formatNumber(l.qty)} × ${formatCurrency(l.price)} = ${formatCurrency(l.qty * l.price)}`)
    .join('\n');

  const text = `FACTURA ${val('invoiceNumber')}
Fecha: ${formatDateDisplay(val('invoiceDate'))}
${val('dueDate') ? `Vencimiento: ${formatDateDisplay(val('dueDate'))}` : ''}

EMISOR
${val('emisorNombre')}  NIF: ${val('emisorNif')}
${val('emisorDireccion')}

CLIENTE
${val('clienteNombre')}  ${val('clienteNif') ? `NIF: ${val('clienteNif')}` : ''}
${val('clienteDireccion')}

CONCEPTOS
${lines}

Base imponible: ${formatCurrency(base)}
IVA ${ivaRate}%: ${formatCurrency(iva)}
${irpfRate > 0 ? `IRPF ${irpfRate}%: -${formatCurrency(irpf)}` : ''}
TOTAL: ${formatCurrency(total)}

${val('paymentConditions') ? `Condiciones: ${val('paymentConditions')}` : ''}
${val('bankAccount') ? `IBAN: ${val('bankAccount')}` : ''}
`.trim();

  navigator.clipboard.writeText(text)
    .then(() => showToast('📋 Factura copiada al portapapeles'))
    .catch(() => {
      // Fallback
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      showToast('📋 Factura copiada al portapapeles');
    });
}

// =============================================
// EXPORT JSON
// =============================================
function exportJSON() {
  const { base, iva, irpf, total } = calculateTotals();

  const data = {
    version: '1.0',
    generatedAt: new Date().toISOString(),
    factura: {
      numero: val('invoiceNumber'),
      fechaEmision: val('invoiceDate'),
      fechaVencimiento: val('dueDate'),
      emisor: {
        nombre: val('emisorNombre'),
        nif: val('emisorNif'),
        direccion: val('emisorDireccion'),
        email: val('emisorEmail'),
        telefono: val('emisorTelefono'),
      },
      receptor: {
        nombre: val('clienteNombre'),
        nif: val('clienteNif'),
        direccion: val('clienteDireccion'),
        email: val('clienteEmail'),
      },
      lineas: state.lines.filter(l => l.description || l.price > 0).map(l => ({
        descripcion: l.description,
        cantidad: l.qty,
        precioUnitario: l.price,
        totalLinea: parseFloat((l.qty * l.price).toFixed(2))
      })),
      fiscal: {
        baseImponible: parseFloat(base.toFixed(2)),
        tipoIVA: parseFloat(val('ivaType')),
        cuotaIVA: parseFloat(iva.toFixed(2)),
        tipoIRPF: parseFloat(val('irpfType')),
        retencionIRPF: parseFloat(irpf.toFixed(2)),
        totalFactura: parseFloat(total.toFixed(2)),
        moneda: 'EUR'
      },
      condicionesPago: val('paymentConditions'),
      cuentaBancaria: val('bankAccount'),
      notas: val('invoiceNotes'),
    }
  };

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${val('invoiceNumber') || 'factura'}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('📦 JSON exportado');
}

// =============================================
// RESET FORM
// =============================================
function resetForm() {
  const confirm = window.confirm('¿Limpiar todos los datos de la factura?');
  if (!confirm) return;

  const fields = [
    'clienteNombre', 'clienteNif', 'clienteDireccion', 'clienteEmail',
    'invoiceNotes', 'exemptNote'
  ];
  fields.forEach(id => setVal(id, ''));

  // Reset lines
  state.lines = [];
  state.lineIdCounter = 0;
  addLine();

  // Reset selects
  setVal('ivaType', '21');
  setVal('irpfType', '0');
  document.getElementById('exemptNoteGroup').style.display = 'none';

  // New invoice number
  const newNum = incrementInvoiceCounter();
  setVal('invoiceNumber', newNum);

  setDefaultDates();
  updatePreview();
  showToast('🔄 Factura limpiada');
}

// =============================================
// THEME
// =============================================
function toggleTheme() {
  const html = document.documentElement;
  const current = html.getAttribute('data-theme');
  const next = current === 'light' ? 'dark' : 'light';
  html.setAttribute('data-theme', next);
  document.querySelector('.theme-icon').textContent = next === 'dark' ? '🌙' : '☀️';
  localStorage.setItem('factura_theme', next);
}

function loadTheme() {
  const saved = localStorage.getItem('factura_theme');
  if (saved) {
    document.documentElement.setAttribute('data-theme', saved);
    const icon = document.querySelector('.theme-icon');
    if (icon) icon.textContent = saved === 'dark' ? '🌙' : '☀️';
  }
}
loadTheme();

// =============================================
// UTILITY FUNCTIONS
// =============================================
function val(id) {
  const el = document.getElementById(id);
  return el ? el.value.trim() : '';
}

function setVal(id, value) {
  const el = document.getElementById(id);
  if (el) el.value = value;
}

function formatCurrency(amount) {
  if (isNaN(amount)) amount = 0;
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2
  }).format(amount);
}

function formatNumber(num) {
  if (isNaN(num)) return '0';
  // Show decimals only if needed
  return parseFloat(num).toLocaleString('es-ES', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3
  });
}

function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function showToast(message, duration = 2800) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), duration);
}
