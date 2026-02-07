"""
Launcher so 'python fetch_locations.py' works from project root.
Runs datacollection/fetch_locations.py with the same arguments.
"""
import os
import subprocess
import sys

_ROOT = os.path.dirname(os.path.abspath(__file__))
_SCRIPT = os.path.join(_ROOT, "datacollection", "fetch_locations.py")

if __name__ == "__main__":
    sys.exit(
        subprocess.run(
            [sys.executable, _SCRIPT] + sys.argv[1:],
            cwd=_ROOT,
        ).returncode
    )
