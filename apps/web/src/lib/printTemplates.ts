import { numberToWords, formatNPR, formatDate } from './billingUtils';

export function getPrintLayoutCSS(): string {
  return `
    body { font-family: 'Arial', sans-serif; font-size: 11px; color: #000; margin: 20px; background: #fff; }
    .print-container { max-width: 800px; margin: 0 auto; padding: 20px; border: 1px solid #000; }
    .header { display: flex; justify-content: space-between; border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 15px; }
    .company-title { font-size: 18px; font-weight: 900; letter-spacing: 1px; }
    .title { text-align: center; font-size: 14px; font-weight: bold; border-bottom: 1px solid #000; padding-bottom: 4px; margin-bottom: 10px; letter-spacing: 1px; text-transform: uppercase; }
    .meta-grid { display: flex; justify-content: space-between; margin-bottom: 15px; gap: 20px; font-size: 10px; }
    .item-table { width: 100%; border-collapse: collapse; margin-bottom: 15px; }
    .item-table th, .item-table td { border: 1px solid #000; padding: 5px 6px; font-size: 10px; }
    .item-table th { background: #f2f2f2; font-weight: bold; text-align: center; }
    .text-right { text-align: right; }
    .text-center { text-align: center; }
    .total-box { margin-left: auto; width: 250px; border-collapse: collapse; margin-top: 10px; font-size: 10px; }
    .total-box td { border: 1px solid #000; padding: 4px 8px; font-weight: bold; }
    .words-box { border: 1px solid #000; padding: 6px 8px; background: #fafafa; font-size: 10px; margin-bottom: 15px; }
    .footer-signs { display: flex; justify-content: space-between; margin-top: 40px; font-size: 9px; }
    .sign-box { border-top: 1px solid #005; width: 180px; text-align: center; padding-top: 3px; }
    .digit-box { border: 1px solid #000; width: 14px; height: 14px; display: inline-flex; alignItems: center; justifyContent: center; fontSize: 9px; fontWeight: bold; fontFamily: monospace; backgroundColor: #fff; margin-right: 2px; text-align: center; }
  `;
}

function renderDigitBoxes(val: string | null): string {
  if (!val) return '—';
  const cleaned = val.replace(/[^0-9A-Za-z]/g, '');
  return cleaned
    .split('')
    .map(
      (c) =>
        `<span style="border:1px solid #000; width:13px; height:13px; display:inline-flex; align-items:center; justify-content:center; font-size:9px; font-weight:bold; font-family:monospace; background-color:#fff; margin-right:2px;">${c}</span>`
    )
    .join('');
}

interface ParsedNotes {
  notes: string;
  discounts: {
    type: 'NONE' | 'OVERALL' | 'PRODUCT';
    overallPct?: number;
    items?: Record<number, number>;
  } | null;
}

function parseOrderNotesAndDiscounts(rawNotes: string | null): ParsedNotes {
  if (!rawNotes) return { notes: '', discounts: null };
  try {
    const match = rawNotes.match(/(.*?)\s*\|\|DISCOUNTS:(.*?)\|\|/);
    if (match) {
      return {
        notes: match[1].trim(),
        discounts: JSON.parse(match[2])
      };
    }
    const plainMatch = rawNotes.match(/\|\|DISCOUNTS:(.*?)\|\|/);
    if (plainMatch) {
      return {
        notes: rawNotes.replace(/\|\|DISCOUNTS:.*?\|\|/, '').trim(),
        discounts: JSON.parse(plainMatch[1])
      };
    }
  } catch (e) {
    console.error('Error parsing order notes/discounts JSON:', e);
  }
  return { notes: rawNotes.trim(), discounts: null };
}

export function renderSalesBillHTML(order: any, billNo: string, invNo: string, items: any[]): string {
  const printedOn = new Date().toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  // Parse order notes and discounts
  const parsed = parseOrderNotesAndDiscounts(order.notes);
  const billingRemarks = parsed.notes || order.billing_remarks || 'System auto-generated billing.';

  const discounts = parsed.discounts;
  const discountType = discounts?.type || 'NONE';
  const overallPct = discounts?.overallPct || 0;

  // Process items
  let subtotal = 0;
  const processedItems = items.map((item) => {
    const product = item.products || item.product || {};
    const productName = product.product_name || 'Generic Item';
    const refCode = product.ref_code || '—';
    const unit = product.unit || 'Pcs';

    let rate = item.unit_price;
    let lessPct = 0;

    if (discountType === 'PRODUCT') {
      lessPct = discounts?.items?.[item.product_id] || 0;
      // Pre-discount rate is MRP
      rate = product.mrp !== null && product.mrp !== undefined ? product.mrp : item.unit_price;
    }

    const amount = item.quantity * rate * (1 - lessPct / 100);
    subtotal += amount;

    return {
      productName,
      refCode,
      qty: item.quantity,
      unit,
      rate,
      lessPct,
      amount
    };
  });

  let discountAmount = 0;
  if (discountType === 'OVERALL') {
    discountAmount = Math.round(subtotal * (overallPct / 100) * 100) / 100;
  }

  let listSubtotal = 0;
  let discountVal = 0;

  if (discountType === 'PRODUCT') {
    processedItems.forEach(item => {
      listSubtotal += item.qty * item.rate;
    });
    discountVal = listSubtotal - subtotal;
  } else if (discountType === 'OVERALL') {
    listSubtotal = subtotal;
    discountVal = discountAmount;
  } else {
    listSubtotal = subtotal;
    discountVal = 0;
  }

  const taxableAmount = subtotal - discountAmount;
  const vatAmount = Math.round(taxableAmount * 0.13 * 100) / 100;
  const netTotal = taxableAmount + vatAmount;

  return `
    <div class="print-container">
      <div class="header">
        <div>
          <div class="company-title">TEJAS IMPEX PVT. LTD.</div>
          <div style="font-size: 10px; color: #333; margin-top: 2px;">Teku - 12, Kathmandu, Nepal</div>
          <div style="font-size: 10px; color: #333; margin-top: 2px;">Phone: 9820151570 | Email: tejasimpex2023@gmail.com</div>
        </div>
        <div style="text-align: right; font-size: 10px;">
          <div><strong>PAN No.</strong></div>
          <div style="margin-top: 4px;">${renderDigitBoxes('610493742')}</div>
        </div>
      </div>

      <div class="title">Tax Invoice</div>

      <div class="meta-grid">
        <div>
          <div style="margin-bottom: 4px;"><strong>Party Name:</strong> ${order.parties?.Parties_name || 'N/A'}</div>
          <div style="margin-bottom: 4px;"><strong>Address:</strong> ${order.parties?.address || 'N/A'}</div>
          ${order.parties?.contact_number ? `<div style="margin-bottom: 4px;"><strong>Phone No:</strong> ${order.parties.contact_number}</div>` : ''}
          <div style="margin-top: 6px;">
            <strong style="margin-right: 6px;">VAT No / PAN:</strong>
            ${renderDigitBoxes(order.parties?.pan_no)}
          </div>
        </div>
        <div style="text-align: right; min-width: 220px; line-height: 1.4;">
          <div><strong>Bill No:</strong> ${billNo}</div>
          <div><strong>Invoice No:</strong> ${invNo}</div>
          <div><strong>Order Date:</strong> ${formatDate(order.created_at)}</div>
          <div><strong>Printed On:</strong> ${printedOn}</div>
          <div><strong>Payment Mode:</strong> Credit / Settlement</div>
        </div>
      </div>

      <table class="item-table">
        <thead>
          <tr>
            <th style="width: 40px;">SNo.</th>
            <th style="width: 80px;">Ref Code</th>
            <th>Particulars</th>
            <th style="width: 60px;">Qty</th>
            <th style="width: 50px;">Unit</th>
            <th style="width: 85px;">Rate (Rs.)</th>
            <th style="width: 65px;">Less%</th>
            <th style="width: 100px;">Amount (Rs.)</th>
          </tr>
        </thead>
        <tbody>
          ${processedItems.map((item, idx) => `
            <tr>
              <td class="text-center">${idx + 1}</td>
              <td class="text-center" style="font-family: monospace;">${item.refCode}</td>
              <td>${item.productName}</td>
              <td class="text-center">${item.qty}</td>
              <td class="text-center">${item.unit}</td>
              <td class="text-right">${item.rate.toFixed(2)}</td>
              <td class="text-center">${item.lessPct > 0 ? `-${item.lessPct}%` : '—'}</td>
              <td class="text-right">${item.amount.toFixed(2)}</td>
            </tr>
          `).join('')}
          ${Array.from({ length: Math.max(0, 6 - processedItems.length) }).map((_, i) => `
            <tr style="height: 20px;">
              <td class="text-center">${processedItems.length + i + 1}</td>
              <td>&nbsp;</td>
              <td>&nbsp;</td>
              <td>&nbsp;</td>
              <td>&nbsp;</td>
              <td>&nbsp;</td>
              <td>&nbsp;</td>
              <td>&nbsp;</td>
            </tr>
          `).join('')}
        </tbody>
      </table>

      <div style="display: flex; justify-content: space-between; gap: 15px; margin-bottom: 10px;">
        <div style="flex: 1; border: 1px solid #000; padding: 6px; border-radius: 4px;">
          <div style="font-size: 8px; font-weight: bold; text-transform: uppercase; color: #555; margin-bottom: 2px;">Billing Remarks</div>
          <div style="font-size: 9px; white-space: pre-wrap;">${billingRemarks}</div>
        </div>
        <table class="total-box">
          <tr>
            <td>Sub Total</td>
            <td class="text-right">${listSubtotal.toFixed(2)}</td>
          </tr>
          ${discountVal > 0 ? `
          <tr>
            <td>Discount${discountType === 'OVERALL' ? ` (${overallPct}%)` : ''}</td>
            <td class="text-right">-${discountVal.toFixed(2)}</td>
          </tr>
          ` : ''}
          <tr>
            <td>Taxable Amt</td>
            <td class="text-right">${taxableAmount.toFixed(2)}</td>
          </tr>
          <tr>
            <td>VAT (13%)</td>
            <td class="text-right">${vatAmount.toFixed(2)}</td>
          </tr>
          <tr style="background-color: #f2f2f2;">
            <td>Net Total</td>
            <td class="text-right">${formatNPR(netTotal)}</td>
          </tr>
        </table>
      </div>

      <div class="words-box">
        <strong>Amount in words:</strong> Nepalese Rupees ${numberToWords(netTotal)}
      </div>

      <div style="font-size: 8px; color: #555; border-bottom: 1px solid #eee; padding-bottom: 5px; margin-bottom: 10px;">
        <strong>Declaration / Terms:</strong>
        <ol style="margin: 3px 0; padding-left: 12px; line-height: 1.3;">
          <li>Goods sold will be taken back only within 7 days of this invoice.</li>
          <li>Interest will be charged if payment is not received within credit limits.</li>
        </ol>
      </div>

      <div class="footer-signs">
        <div class="sign-box">Received By</div>
        <div class="sign-box" style="text-align: center;">
          <div style="font-size: 8px; font-weight: bold; margin-bottom: 10px;">For TEJAS IMPEX PVT. LTD.</div>
          <div>Authorized Signatory</div>
        </div>
      </div>
    </div>
  `;
}

export function renderDebitNoteHTML(order: any, debitNoteNo: string, items: any[], notes: string): string {
  const printedOn = new Date().toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const subtotal = items.reduce((sum, item) => sum + item.refund_amount, 0);

  return `
    <div class="print-container" style="border-color: #dc2626;">
      <div class="header" style="border-bottom-color: #dc2626;">
        <div>
          <div class="company-title">TEJAS IMPEX PVT. LTD.</div>
          <div style="font-size: 10px; color: #333; margin-top: 2px;">Teku - 12, Kathmandu, Nepal</div>
          <div style="font-size: 10px; color: #333; margin-top: 2px;">Phone: 9820151570 | Email: tejasimpex2023@gmail.com</div>
        </div>
        <div style="text-align: right; font-size: 10px;">
          <div><strong>PAN No.</strong></div>
          <div style="margin-top: 4px;">${renderDigitBoxes('610493742')}</div>
        </div>
      </div>

      <div class="title" style="color: #dc2626; border-bottom-color: #dc2626; background-color: #fef2f2;">Debit Note (Sales Return)</div>

      <div class="meta-grid">
        <div>
          <div style="margin-bottom: 4px;"><strong>Customer Part:</strong> ${order.parties?.Parties_name || 'N/A'}</div>
          <div style="margin-bottom: 4px;"><strong>Address:</strong> ${order.parties?.address || 'N/A'}</div>
        </div>
        <div style="text-align: right; min-width: 220px; line-height: 1.4;">
          <div><strong style="color: #dc2626;">Debit Note No:</strong> ${debitNoteNo}</div>
          <div><strong>Original Order Ref:</strong> ${order.order_number}</div>
          <div><strong>Return Date:</strong> ${printedOn}</div>
        </div>
      </div>

      <table class="item-table" style="border-color: #dc2626;">
        <thead>
          <tr style="background-color: #fef2f2;">
            <th style="width: 40px; border-color: #dc2626;">SNo.</th>
            <th style="border-color: #dc2626;">Item details</th>
            <th style="width: 80px; border-color: #dc2626;">Returned Qty</th>
            <th style="width: 120px; border-color: #dc2626;">Refund Amount (रु)</th>
          </tr>
        </thead>
        <tbody>
          ${items.map((item, idx) => `
            <tr>
              <td class="text-center" style="border-color: #dc2626;">${idx + 1}</td>
              <td style="border-color: #dc2626;">${item.product_name}</td>
              <td class="text-center" style="border-color: #dc2626;">${item.quantity_returned}</td>
              <td class="text-right" style="border-color: #dc2626;">${item.refund_amount.toFixed(2)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>

      <div style="display: flex; justify-content: space-between; gap: 15px; margin-bottom: 10px;">
        <div style="flex: 1; border: 1px solid #dc2626; padding: 6px; border-radius: 4px; background-color: #fff8f8;">
          <div style="font-size: 8px; font-weight: bold; text-transform: uppercase; color: #dc2626; margin-bottom: 2px;">Return Accounting Remarks</div>
          <div style="font-size: 9px; white-space: pre-wrap;">${notes || 'Goods returned.'}</div>
        </div>
        <table class="total-box" style="border-color: #dc2626;">
          <tr style="background-color: #fef2f2; color: #b91c1c;">
            <td style="border-color: #dc2626;">Total Credited</td>
            <td class="text-right" style="border-color: #dc2626;">${formatNPR(subtotal)}</td>
          </tr>
        </table>
      </div>

      <div class="words-box" style="border-color: #dc2626; background-color: #fffafb;">
        <strong>Refund Account limit (Words):</strong> ${numberToWords(subtotal)}
      </div>

      <div class="footer-signs">
        <div class="sign-box" style="border-top-color: #dc2626;">Prepared By</div>
        <div class="sign-box" style="border-top-color: #dc2626;">Authorized Auditor Audit</div>
      </div>
    </div>
  `;
}
