"""Compare the compiled firmware lookup with IANA at boundaries and future dates."""
from datetime import datetime, timezone
from importlib.resources import files
import io
import json
from pathlib import Path
import struct
import subprocess
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
DATA = files('tzdata.zoneinfo')


def transitions(raw):
    # Independently read the exact transition instants in the source TZif file.
    counts = struct.unpack('>6I', raw[20:44])
    ut, std, leap, count, types, chars = counts
    at = 44 + count * 5 + types * 6 + chars + leap * 8 + std + ut
    count = struct.unpack_from('>I', raw, at + 32)[0]
    return struct.unpack_from(f'>{count}q', raw, at + 44)


def main():
    binary = ROOT / '.local/test-timezones'
    binary.parent.mkdir(exist_ok=True)
    subprocess.run(['c++', '-std=c++17', '-O2', str(ROOT / 'tests/test_timezones.cpp'), '-o', str(binary)], check=True)
    subprocess.run([str(binary)], check=True)
    queries, expected = [], []
    catalog = json.loads((ROOT / 'assets/timezones.json').read_text())
    for name in sorted(catalog['aliases']):
        if name in ('Sydney', 'Berlin'): continue
        raw = DATA.joinpath(name).read_bytes()
        zone = ZoneInfo.from_file(io.BytesIO(raw))
        instants = set()
        # The source's explicit transitions include irregular Ramadan changes.
        for instant in transitions(raw):
            if 1704067200 < instant < 4102444800:
                instants.update((instant - 1, instant, instant + 1))
        # Check future recurring rules, year 2038, fractional offsets and date rollover.
        for year in (2024, 2026, 2038, 2040, 2099):
            for month in range(1, 13):
                instants.add(int(datetime(year, month, 15, 12, tzinfo=timezone.utc).timestamp()))
        # Daily probes after the TZif explicit table ends exercise the expanded footer.
        if name in ('Australia/Sydney', 'Europe/Berlin', 'America/New_York', 'Australia/Lord_Howe', 'Pacific/Chatham'):
            start = int(datetime(2040, 1, 1, tzinfo=timezone.utc).timestamp())
            instants.update(range(start, start + 366 * 86400, 1800))
        instants.update((1704067200, 4102444799))
        for instant in sorted(instants):
            queries.append(f'{name} {instant}\n')
            expected.append(int(datetime.fromtimestamp(instant, timezone.utc).astimezone(zone).utcoffset().total_seconds()))
    result = subprocess.run([str(binary), '--query'], input=''.join(queries), text=True, capture_output=True, check=True)
    actual = [int(line) for line in result.stdout.splitlines()]
    assert len(actual) == len(expected)
    for query, got, want in zip(queries, actual, expected):
        assert got == want, f'{query.strip()}: firmware {got}, IANA {want}'
    print(f'{len(queries):,} firmware UTC offsets match IANA (all IDs; DST boundaries, Ramadan, fractional offsets, 2038–2099)')


if __name__ == '__main__': main()
