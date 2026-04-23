const MONTHS_FULL = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function roundMoney(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function cleanText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[“”„]/g, '"')
    .replace(/[’‘]/g, "'")
    .replace(/[^\x20-\x7E\n]/g, '')
    .trim();
}

function escapePdfText(value) {
  return cleanText(value).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function splitLines(value) {
  return cleanText(value).split('\n').map(line => line.trim()).filter(Boolean);
}

function fmtDate(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('ro-RO', { day: '2-digit', month: 'short', year: 'numeric' });
}

function fmtMoney(amount, currency = 'EUR') {
  return new Intl.NumberFormat('ro-RO', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(amount) || 0);
}

function wrapText(text, maxChars = 72) {
  const words = cleanText(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let current = '';
  words.forEach(word => {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  });
  if (current) lines.push(current);
  return lines.length ? lines : ['-'];
}

function lineCommand(text, x, y, size = 10, font = 'F1') {
  return `BT /${font} ${size} Tf ${x} ${y} Td (${escapePdfText(text)}) Tj ET`;
}

function buildPdf(commands) {
  const content = commands.join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
  ];

  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach(offset => {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return pdf;
}

export function getInvoiceDownloadName(invoice) {
  const number = cleanText(invoice?.invoice_number || 'draft').replace(/[^A-Za-z0-9_-]/g, '-');
  return `invoice-${number || 'draft'}.pdf`;
}

export function downloadInvoicePdf(invoice) {
  if (!invoice) return;

  const currency = invoice.invoice_currency || 'EUR';
  const rate = currency === 'EUR' ? 1 : (Number(invoice.exchange_rate) || 1);
  const amountEur = roundMoney(invoice.amount);
  const displayAmount = roundMoney(invoice.display_amount ?? amountEur * rate);
  const monthLabel = `${MONTHS_FULL[(invoice.month || 1) - 1]} ${invoice.year || new Date().getFullYear()}`;
  const itemDescription = invoice.invoice_description?.trim()
    ? invoice.invoice_description
    : `Online marketing services - ${monthLabel}`;
  const issuerLines = splitLines(invoice.issuer_details);
  const clientLines = splitLines(invoice.client_billing_details);
  const clientFallback = [
    invoice.clients?.company || invoice.clients?.name,
    invoice.clients?.email,
    invoice.clients?.phone,
  ].filter(Boolean);

  const commands = [
    '1 1 1 rg 0 0 595 842 re f',
    '0 0 0 rg',
    lineCommand('INVOICE', 48, 780, 28, 'F2'),
    lineCommand(`Invoice # ${invoice.invoice_number || 'Draft'}`, 48, 750, 11),
    lineCommand('Balance Due', 420, 780, 10),
    lineCommand(fmtMoney(displayAmount, currency), 420, 755, 20, 'F2'),
  ];

  if (currency !== 'EUR') {
    commands.push(lineCommand(`Internal: ${fmtMoney(amountEur, 'EUR')} | 1 EUR = ${rate} ${currency}`, 420, 735, 8));
  }

  commands.push(
    '0.88 0.88 0.9 RG 48 715 m 547 715 l S',
    lineCommand('From', 48, 690, 10, 'F2'),
  );

  let y = 672;
  (issuerLines.length ? issuerLines : ['Add issuer details in Billing before exporting.']).forEach(line => {
    commands.push(lineCommand(line, 48, y, 10));
    y -= 16;
  });

  commands.push(lineCommand('Bill To', 320, 690, 10, 'F2'));
  y = 672;
  (clientLines.length ? clientLines : clientFallback).forEach(line => {
    commands.push(lineCommand(line, 320, y, 10));
    y -= 16;
  });

  commands.push(
    '0.96 0.96 0.98 rg 48 585 499 48 re f',
    '0 0 0 rg',
    lineCommand('Invoice Date', 62, 615, 8, 'F2'),
    lineCommand(fmtDate(invoice.issue_date), 62, 600, 10),
    lineCommand('Due Date', 230, 615, 8, 'F2'),
    lineCommand(fmtDate(invoice.due_date), 230, 600, 10),
    lineCommand('Currency', 410, 615, 8, 'F2'),
    lineCommand(currency, 410, 600, 10),
    lineCommand('#', 48, 545, 9, 'F2'),
    lineCommand('Item & Description', 78, 545, 9, 'F2'),
    lineCommand('Qty', 360, 545, 9, 'F2'),
    lineCommand('Rate', 420, 545, 9, 'F2'),
    lineCommand('Amount', 500, 545, 9, 'F2'),
    '0.88 0.88 0.9 RG 48 535 m 547 535 l S',
    '0 0 0 rg',
    lineCommand('1', 48, 512, 10),
  );

  y = 512;
  wrapText(itemDescription, 55).slice(0, 4).forEach(line => {
    commands.push(lineCommand(line, 78, y, 10));
    y -= 15;
  });

  commands.push(
    lineCommand('1.00', 360, 512, 10),
    lineCommand(fmtMoney(displayAmount, currency), 405, 512, 10),
    lineCommand(fmtMoney(displayAmount, currency), 485, 512, 10, 'F2'),
    '0.88 0.88 0.9 RG 48 460 m 547 460 l S',
    '0 0 0 rg',
    lineCommand('Sub Total', 380, 425, 10),
    lineCommand(fmtMoney(displayAmount, currency), 485, 425, 10),
    lineCommand('Tax', 380, 405, 10),
    lineCommand(`${Number(invoice.tax_rate || 0).toFixed(2)}%`, 485, 405, 10),
    '0.88 0.88 0.9 RG 380 390 m 547 390 l S',
    '0 0 0 rg',
    lineCommand('Total', 380, 368, 13, 'F2'),
    lineCommand(fmtMoney(displayAmount, currency), 470, 368, 13, 'F2'),
    lineCommand('Balance Due', 380, 342, 11, 'F2'),
    lineCommand(fmtMoney(displayAmount, currency), 470, 342, 11, 'F2'),
    lineCommand('Notes', 48, 250, 10, 'F2'),
  );

  if (invoice.notes) {
    wrapText(invoice.notes, 90).slice(0, 3).forEach((line, index) => {
      commands.push(lineCommand(line, 48, 232 - index * 15, 10));
    });
  }

  const blob = new Blob([buildPdf(commands)], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = getInvoiceDownloadName(invoice);
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
