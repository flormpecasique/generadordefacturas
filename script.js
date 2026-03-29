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
// PRINT / PDF
// =============================================
function printInvoice() {
  // Increment the invoice number for next invoice after printing
  const currentNumber = val('invoiceNumber');

  // Open a new window with just the invoice for clean PDF
  const invoiceDoc = document.getElementById('invoiceDocument');
  if (!invoiceDoc) {
    showToast('⚠️ Rellena la factura antes de imprimir');
    return;
  }

  const styles = document.querySelector('link[rel="stylesheet"]');
  const stylesHref = styles ? styles.href : 'styles.css';

  const printWindow = window.open('', '_blank', 'width=900,height=700');
  printWindow.document.write(`
    <!DOCTYPE html>
    <html lang="es" data-theme="light">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Factura ${escapeHtml(val('invoiceNumber'))}</title>
      <link rel="preconnect" href="https://fonts.googleapis.com">
      <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
      <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&family=DM+Mono:ital,wght@0,300;0,400;0,500;1,400&display=swap" rel="stylesheet">
      <style>
        :root {
          --font-sans: 'Outfit', Helvetica, sans-serif;
          --font-mono: 'DM Mono', 'Courier New', monospace;
          --bg-surface: #fff;
          --bg-surface-2: #f8f8f6;
          --bg-surface-3: #f0efeb;
          --border: #e2e0d9;
          --text-primary: #111;
          --text-secondary: #555;
          --text-muted: #888;
          --accent: #1a56db;
          --green: #059669;
          --red: #dc2626;
          --amber: #d97706;
        }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
          font-family: var(--font-sans);
          color: var(--text-primary);
          background: #fff;
          padding: 0;
        }
        .inv-document {
          padding: 16mm 18mm;
          max-width: 210mm;
          margin: 0 auto;
        }
        .inv-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 28px;
          padding-bottom: 20px;
          border-bottom: 2px solid var(--border);
        }
        .inv-brand-name { font-size: 1.3rem; font-weight: 700; letter-spacing: -0.02em; margin-bottom: 5px; }
        .inv-brand-nif, .inv-brand-address { font-size: 0.75rem; color: var(--text-muted); font-family: var(--font-mono); margin-top: 2px; max-width: 220px; line-height: 1.4; }
        .inv-meta { text-align: right; }
        .inv-title { font-size: 1.7rem; font-weight: 700; letter-spacing: -0.03em; color: var(--accent); margin-bottom: 6px; }
        .inv-number { font-family: var(--font-mono); font-size: 0.82rem; color: var(--text-secondary); margin-bottom: 3px; }
        .inv-date { font-size: 0.77rem; color: var(--text-muted); font-family: var(--font-mono); }
        .inv-parties { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 24px; }
        .inv-party-label { font-size: 0.65rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: var(--text-muted); margin-bottom: 5px; }
        .inv-party-name { font-size: 0.9rem; font-weight: 600; margin-bottom: 2px; }
        .inv-party-detail { font-size: 0.75rem; color: var(--text-secondary); font-family: var(--font-mono); line-height: 1.4; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 18px; font-size: 0.82rem; }
        thead tr { background: var(--bg-surface-3); }
        th { padding: 7px 9px; text-align: left; font-size: 0.65rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.07em; color: var(--text-muted); border-bottom: 1px solid var(--border); }
        th:nth-child(2), th:nth-child(3), th:nth-child(4), td:nth-child(2), td:nth-child(3), td:nth-child(4) { text-align: right; }
        td { padding: 8px 9px; border-bottom: 1px solid var(--border); color: var(--text-primary); vertical-align: top; }
        td:nth-child(2), td:nth-child(3), td:nth-child(4) { font-family: var(--font-mono); color: var(--text-secondary); white-space: nowrap; }
        tr:last-child td { border-bottom: 2px solid var(--border); }
        .inv-totals { display: flex; justify-content: flex-end; margin-bottom: 20px; }
        .inv-totals-table { min-width: 210px; }
        .inv-totals-row { display: flex; justify-content: space-between; gap: 28px; padding: 4px 0; font-size: 0.82rem; color: var(--text-secondary); }
        .inv-totals-row span:last-child { font-family: var(--font-mono); font-weight: 500; color: var(--text-primary); min-width: 90px; text-align: right; }
        .inv-totals-row--irpf span:last-child { color: var(--red); }
        .inv-totals-row--iva span:last-child { color: var(--green); }
        .inv-totals-divider { height: 1px; background: var(--border); margin: 5px 0; }
        .inv-totals-row--total { font-size: 1rem; font-weight: 700; padding: 7px 0 3px; }
        .inv-totals-row--total span:last-child { color: var(--accent); font-size: 1.1rem; font-weight: 700; }
        .inv-footer { border-top: 1px solid var(--border); padding-top: 14px; font-size: 0.72rem; color: var(--text-muted); line-height: 1.6; display: flex; flex-direction: column; gap: 5px; }
        .inv-footer-row { display: flex; gap: 6px; }
        .inv-footer-row strong { color: var(--text-secondary); white-space: nowrap; font-weight: 600; }
        .inv-exempt-note { color: var(--amber); font-size: 0.72rem; font-style: italic; }
        @media print {
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          body { background: #fff; }
        }
      </style>
    </head>
    <body>
      ${invoiceDoc.outerHTML}
      <script>
        window.onload = function() {
          setTimeout(function() { window.print(); }, 600);
        };
      <\/script>
    </body>
    </html>
  `);
  printWindow.document.close();
  showToast('🖨️ Preparando PDF...');
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
