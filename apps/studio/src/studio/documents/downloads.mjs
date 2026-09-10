export function downloadBlob(blob, filename, { document: scope = globalThis.document, url = globalThis.URL } = {}) {
  const objectUrl = url.createObjectURL(blob);
  const anchor = scope.createElement('a');
  try {
    anchor.href = objectUrl;
    anchor.download = filename;
    scope.body.appendChild(anchor);
    anchor.click();
  } finally {
    anchor.remove();
    url.revokeObjectURL(objectUrl);
  }
}
