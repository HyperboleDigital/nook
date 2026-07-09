// Hands a File captured from the bottom tab bar's camera input across the client-side
// navigation into the capture wizard. A module-scope singleton (not a query param, blob URL,
// or context) because the file needs to survive one `router.push` and nothing more — cleared
// on read so a later hard reload correctly falls through to the wizard's normal first step.
let stashed: File | null = null;

export function stashCapturedFile(file: File) {
  stashed = file;
}

export function takeCapturedFile(): File | null {
  const file = stashed;
  stashed = null;
  return file;
}
