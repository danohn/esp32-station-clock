"""Merge a clean build into the factory image used by releases and the browser installer."""
from pathlib import Path
import hashlib
import subprocess
import sys
import shutil

ROOT = Path(__file__).resolve().parents[1]
BUILD = ROOT / 'build'
OUT = ROOT / 'firmware'
PARTS = [(0, BUILD / 'bootloader/bootloader.bin'), (0x8000, BUILD / 'partition_table/partition-table.bin'), (0x10000, BUILD / 'db_station_clock.bin')]

def main():
    for _, source in PARTS:
        if not source.is_file():
            raise SystemExit(f'Missing build output: {source}. Run tools/idf.sh build first.')
    import esptool
    OUT.mkdir(exist_ok=True)
    image = OUT / 'db-station-clock-factory.bin'
    args = ['--chip', 'esp32s3', 'merge-bin', '--flash-mode', 'dio', '--flash-size', '16MB', '--flash-freq', '80m', '-o', str(image)]
    if int(esptool.__version__.split('.')[0]) < 5:
        args = ['--' + arg[2:].replace('-', '_') if arg.startswith('--') else arg for arg in args]
        args[2] = 'merge_bin'
    for address, source in PARTS:
        args.extend([hex(address), str(source)])
    subprocess.run([sys.executable, '-m', 'esptool', *args], check=True)
    digest = hashlib.sha256(image.read_bytes()).hexdigest()
    (OUT / 'SHA256SUMS.txt').write_text(f'{digest}  {image.name}\n')
    shutil.copyfile(ROOT / 'THIRD_PARTY_NOTICES.md', OUT / 'THIRD_PARTY_NOTICES.md')
    shutil.copyfile(ROOT / 'assets/swiss/NOTICE.md', OUT / 'SWISS_ARTWORK_NOTICE.md')
    print(f'Packaged {image.stat().st_size:,} bytes; SHA-256 {digest}')

if __name__ == '__main__':
    main()
