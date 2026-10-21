"""CLI acknowledgement regressions using a simulated serial connection."""
from contextlib import redirect_stdout, redirect_stderr
import importlib.util
import io
import itertools
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("clockctl", Path(__file__).resolve().parents[1] / "tools/clockctl.py")
clockctl = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = clockctl
spec.loader.exec_module(clockctl)


class Link:
    def __init__(self, replies):
        self.replies = iter(replies)
        self.commands = []
        self.in_waiting = 0

    def __enter__(self): return self
    def __exit__(self, *args): pass
    def read(self, count): return b""
    def reset_input_buffer(self): pass
    def flush(self): pass
    def write(self, command): self.commands.append(command)
    def readline(self): return next(self.replies, b"")


class CommandTests(unittest.TestCase):
    def run_command(self, arguments, replies):
        link = Link(replies)
        ticks = itertools.count(0, .1)
        with patch.object(sys, "argv", ["clockctl", "--port", "/dev/fake", *arguments]), \
             patch.object(clockctl.serial, "Serial", return_value=link), \
             patch.object(clockctl.time, "monotonic", side_effect=lambda: next(ticks)), \
             patch.object(clockctl.time, "time_ns", return_value=1792553400000000000), \
             redirect_stdout(io.StringIO()), redirect_stderr(io.StringIO()):
            result = clockctl.main()
        return result, link.commands

    def test_sync_waits_for_status_after_time_acknowledgement(self):
        result, commands = self.run_command(["sync"], [
            b"CLOCK_STATUS time=startup zone=Sydney\n",
            b"CLOCK_OK time\n",
            b"CLOCK_STATUS time=2026-10-21T14:30:00 zone=Sydney\n",
        ])
        self.assertEqual(result, 0)
        self.assertEqual(commands, [b"TIME 1792553400000000\n"])

    def test_startup_status_alone_cannot_confirm_sync(self):
        result, _ = self.run_command(["sync"], [b"CLOCK_STATUS time=startup zone=Sydney\n"])
        self.assertEqual(result, 1)

    def test_theme_waits_for_its_acknowledgement(self):
        result, commands = self.run_command(["theme", "swiss"], [
            b"CLOCK_STATUS time=startup theme=db\n", b"CLOCK_OK theme\n",
        ])
        self.assertEqual(result, 0)
        self.assertEqual(commands, [b"THEME swiss\n"])

    def test_status_alone_cannot_confirm_theme_write(self):
        result, _ = self.run_command(["theme", "swiss"], [b"CLOCK_STATUS time=startup theme=db\n"])
        self.assertEqual(result, 1)


if __name__ == "__main__":
    unittest.main()
