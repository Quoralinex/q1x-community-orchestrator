const mode = process.argv[2];
if (mode !== 'json' && mode !== 'text') {
  process.stderr.write('mode must be json or text\n');
  process.exit(2);
}

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => { input += chunk; });
process.stdin.on('end', () => {
  if (mode === 'json') {
    const value = JSON.parse(input);
    process.stdout.write(JSON.stringify({ ...value, mode: 'json' }));
    return;
  }
  process.stdout.write(`${input}|mode=text`);
});
