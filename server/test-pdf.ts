/** A tiny valid one-page PDF, assembled so tests exercise pdfjs rather than magic bytes. */
export function validPdfBytes(): Buffer {
  const header = '%PDF-1.4\n'
  const pageContent = 'BT /F1 18 Tf 72 720 Td (PaperBridge fixture PDF) Tj ET'
  const objects = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n',
    '4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
    `5 0 obj\n<< /Length ${Buffer.byteLength(pageContent)} >>\nstream\n${pageContent}\nendstream\nendobj\n`,
  ]
  const offsets: number[] = []
  let body = header
  for (const object of objects) {
    offsets.push(Buffer.byteLength(body))
    body += object
  }
  const xrefOffset = Buffer.byteLength(body)
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  body += offsets.map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`
  return Buffer.from(body)
}
