const { spawn } = require('node:child_process');
const path = require('node:path');
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(require('electron'), [path.join(__dirname, 'electron-smoke.cjs')], {
  env, stdio: 'inherit', windowsHide: true
});
const timeout = setTimeout(() => { child.kill(); process.exitCode = 1; }, 60000);
child.on('error', error => { console.error(error.message); clearTimeout(timeout); process.exitCode = 1; });
child.on('exit', code => { clearTimeout(timeout); process.exitCode = code ?? 1; });
