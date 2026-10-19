/** Saves a blob as a file through the browser, without any server involved. */
export function downloadBlob(fileName: string, blob: Blob) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.rel = 'noopener'
  document.body.append(a)
  a.click()
  a.remove()
  // Give the browser time to start the download before the temporary link is released.
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

export function downloadText(fileName: string, text: string, mime = 'application/json') {
  downloadBlob(fileName, new Blob([text], { type: mime }))
}
