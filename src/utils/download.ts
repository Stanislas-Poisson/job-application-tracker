// Offers a text to the user as a file to save.
export function downloadText(name: string, text: string, type = 'application/json') {
  const link = document.createElement('a')
  link.href = URL.createObjectURL(new Blob([text], { type }))
  link.download = name
  link.click()
  URL.revokeObjectURL(link.href)
}
