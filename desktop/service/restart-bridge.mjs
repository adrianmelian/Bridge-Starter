import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
const exec = promisify(execFile);
const quote = value => "'" + String(value).replaceAll("'", "''") + "'";

export function restartScript(repo, stateDir, servicePid) {
  if (!Number.isInteger(servicePid) || servicePid < 1) throw new Error('Invalid service process.');
  return `$ErrorActionPreference='Stop'
$repo=${quote(repo)}
$result=${quote(path.join(stateDir, 'agent-update-restart-result.txt'))}
try {
  $service=Get-CimInstance Win32_Process -Filter 'ProcessId=${servicePid}'
  if (-not $service) { throw 'Bridge service is no longer running.' }
  $app=Get-Process -Id $service.ParentProcessId
  $exe=$app.Path
  if ((Split-Path -Leaf $exe) -ne 'data-workspace.exe') { throw 'Restart is only available in the installed Bridge.' }
  Start-Sleep -Seconds 3
  Start-Process -FilePath $exe -ArgumentList '--quit' -WindowStyle Hidden
  for($i=0;$i -lt 40;$i++){if(-not(Get-Process -Id $app.Id -ErrorAction SilentlyContinue)){break};Start-Sleep -Seconds 1}
  if(Get-Process -Id $app.Id -ErrorAction SilentlyContinue){throw 'Bridge did not exit; it was not forcibly stopped.'}
  Start-Process -FilePath $exe -ArgumentList '--repo', ('"'+$repo+'"') -WorkingDirectory $repo -WindowStyle Hidden
  Set-Content -LiteralPath $result -Value 'Updated agent installed; Bridge relaunch requested.'
} catch { Set-Content -LiteralPath $result -Value ('Restart failed: '+$_.Exception.Message) }
`;
}
export async function restartBridge(repo, stateDir) {
  if (process.platform !== 'win32') throw new Error('Automatic Bridge restart currently requires Windows.');
  // Launch through CIM so the helper survives the application's child-process cleanup.
  const file = path.join(stateDir, 'restart-after-agent-update.ps1');
  await writeFile(file, restartScript(repo, stateDir, process.pid), 'utf8');
  const command = `powershell.exe -NoProfile -ExecutionPolicy Bypass -File "${file}"`;
  const script = `$ErrorActionPreference='Stop'; $service=Get-CimInstance Win32_Process -Filter 'ProcessId=${process.pid}'; $app=Get-Process -Id $service.ParentProcessId; if((Split-Path -Leaf $app.Path) -ne 'data-workspace.exe'){throw 'Restart requires the installed Bridge.'}; $options=New-CimInstance -ClassName Win32_ProcessStartup -ClientOnly -Property @{ShowWindow=[uint16]0}; $result=Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{CommandLine=${quote(command)};CurrentDirectory=${quote(repo)};ProcessStartupInformation=$options}; if($result.ReturnValue -ne 0){throw 'Could not launch the restart helper.'}`;
  await exec('powershell.exe', ['-NoProfile', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], { windowsHide: true, timeout: 15000 });
}
