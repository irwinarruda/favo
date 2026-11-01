const args = process.argv.slice(2);
const exitFlag = args.find((word) => word.startsWith('--exit='));

console.log(JSON.stringify(args));

if (args.includes('--wait-for-term')) {
  process.on('SIGTERM', () => process.exit(42));
  setInterval(() => {}, 1000);
} else if (args.includes('--die-by-sigkill')) {
  process.kill(process.pid, 'SIGKILL');
} else {
  process.exit(Number(exitFlag?.slice('--exit='.length) ?? 0));
}
