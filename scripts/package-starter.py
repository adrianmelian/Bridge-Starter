"""Package tracked starter files plus the locally built installer; no Git history."""
from pathlib import Path
import hashlib, json, subprocess, zipfile
root=Path(__file__).resolve().parents[1]
version=json.loads((root/'package.json').read_text())['version']
installer=root/'src-tauri/target/release/bundle/nsis'/f'The Bridge_{version}_x64-setup.exe'
assert installer.is_file(), 'Build the installer first'
files=subprocess.check_output(['git','-C',str(root),'ls-files','-z']).decode().strip('\0').split('\0')
for name in files:
    parts=Path(name).parts
    assert not any(part in {'.git','.data','.mrmak','.cache','node_modules','target','dist'} for part in parts), name
    assert Path(name).name != '.env', name
out=root/'release';out.mkdir(exist_ok=True)
archive=out/f'Bridge-Starter-{version}.zip'
with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED,compresslevel=6) as z:
    for name in files:
        z.write(root/name,'Bridge-Starter/'+name)
    z.write(installer,installer.name)
    z.writestr('START HERE.txt','Install the included Windows installer, then open Bridge-Starter/Start Bridge.cmd. Read Bridge-Starter/README.md first. Use your own agent accounts.\n')
with zipfile.ZipFile(archive) as z:
    assert len(z.namelist())==len(files)+2
    assert json.loads(z.read('Bridge-Starter/workspace/workspace.json'))['entities']==[]
    assert z.testzip() is None
checksum=hashlib.sha256(archive.read_bytes()).hexdigest()
(out/'SHA256SUMS.txt').write_text(f'{checksum}  {archive.name}\n')
print(f'Packaged {len(files)} reviewed files and installer: {archive} ({archive.stat().st_size:,} bytes)')
