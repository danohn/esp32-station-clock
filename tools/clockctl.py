"""Configure the station clock over its USB serial connection."""
import argparse
import getpass
import glob
import json
import sys
import time
import serial


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--port', help='USB serial device (automatically detected when unique)')
    sub = p.add_subparsers(dest='action', required=True)
    sub.add_parser('sync', help='Set time from this computer and update the onboard RTC')
    sub.add_parser('status', help='Read time and configuration')
    sub.add_parser('demo', help='Replay the minute change, then return to live time')
    sub.add_parser('live', help='Return to live time immediately')
    sub.add_parser('wifi', help='Save Wi-Fi credentials; password is entered privately')
    sub.add_parser('forget-wifi', help='Remove saved Wi-Fi credentials')
    tz = sub.add_parser('timezone'); tz.add_argument('zone', choices=['Sydney', 'Berlin', 'UTC'])
    br = sub.add_parser('brightness'); br.add_argument('percent', type=int, choices=range(5, 101), metavar='5..100')
    theme = sub.add_parser('theme'); theme.add_argument('name', choices=['db', 'swiss'])
    args = p.parse_args()
    port = args.port
    if not port:
        ports = sorted(glob.glob('/dev/cu.usbmodem*') + glob.glob('/dev/ttyACM*'))
        if len(ports) != 1:
            p.error('Use --port: expected exactly one USB clock, found ' + str(len(ports)))
        port = ports[0]
    command = {'status': 'STATUS', 'demo': 'DEMO', 'live': 'LIVE', 'forget-wifi': 'FORGET_WIFI'}.get(args.action)
    if args.action == 'wifi':
        ssid = input('Wi-Fi network name: ')
        password = getpass.getpass('Wi-Fi password: ')
        if not (1 <= len(ssid.encode()) <= 32) or len(password.encode()) > 63:
            p.error('Network name must be 1..32 UTF-8 bytes; password at most 63 bytes')
        command = 'WIFI ' + json.dumps({'ssid': ssid, 'password': password}, ensure_ascii=True)
    if args.action == 'timezone': command = 'TZ ' + args.zone
    if args.action == 'brightness': command = 'BRIGHTNESS ' + str(args.percent)
    if args.action == 'theme': command = 'THEME ' + args.name
    try:
        link = serial.Serial(port=None, baudrate=115200, timeout=0.2)
        link.dtr = False; link.rts = False
        link.port = port
        with link:
            # macOS may reset the native USB device when opening its tty. Drain
            # startup output so USB backpressure cannot stall boot. Timestamp
            # only after startup, and ignore startup status as a command reply.
            settle_deadline = time.monotonic() + 1.5
            while time.monotonic() < settle_deadline:
                link.read(link.in_waiting or 1)
            link.reset_input_buffer()
            if args.action == 'sync': command = 'TIME ' + str(time.time_ns() // 1000)
            link.write((command + '\n').encode()); link.flush()
            deadline = time.monotonic() + 4
            got_response = False
            acknowledged = False
            while time.monotonic() < deadline:
                line = link.readline().decode(errors='replace').strip()
                if line:
                    if 'CLOCK_' in line or 'demonstration started' in line:
                        print(line)
                    if 'CLOCK_ERROR' in line: return 1
                    if 'CLOCK_OK' in line:
                        acknowledged = True
                    matches_action = ('CLOCK_STATUS' in line if args.action in ['status', 'sync'] else
                                      'demonstration started' in line if args.action == 'demo' else
                                      'CLOCK_OK theme' in line if args.action == 'theme' else
                                      'CLOCK_OK' in line)
                    if matches_action:
                        if args.action == 'sync':
                            if acknowledged and 'CLOCK_STATUS' in line:
                                got_response = True
                                break
                        else:
                            got_response = True
                            break
            if not got_response:
                print('No clock response. Check that the firmware is running and close other serial monitors.', file=sys.stderr)
                return 1
    except (OSError, serial.SerialException) as e:
        print(f'Could not access {port}: {e}', file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
