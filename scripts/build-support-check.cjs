const fs = require('node:fs');
const { spawn } = require('node:child_process');
const child = spawn(process.execPath,['node_modules/next/dist/bin/next','build','--webpack'],{env:{...process.env,SUPPORT_BUILD_NO_CACHE:'1',SUPPORT_DIST_DIR:'output/support-next'},windowsHide:true,stdio:['ignore','pipe','pipe']});
fs.mkdirSync('output/support-tests',{recursive:true});
const log=fs.createWriteStream('output/support-tests/build.log');
let buffer='';
function output(chunk){log.write(chunk);buffer+=chunk.toString();const lines=buffer.split(/\r?\n/);buffer=lines.pop();for(const line of lines)if(line.length<1500)process.stdout.write(line+'\n');}
child.stdout.on('data',output);child.stderr.on('data',output);
child.on('close',code=>{log.end();if(buffer.length<1500&&buffer)console.log(buffer);process.exitCode=code??1;});
