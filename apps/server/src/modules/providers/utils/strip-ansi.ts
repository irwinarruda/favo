const AnsiSequence = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g');

export function stripAnsi(text: string) {
  return text.replace(AnsiSequence, '');
}
