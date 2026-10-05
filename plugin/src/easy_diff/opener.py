from __future__ import annotations

import platform
import subprocess
import sys


def _is_wsl() -> bool:
    return 'microsoft' in platform.release().lower()


def _opener_command(file: str) -> list[str]:
    if sys.platform == 'darwin':
        return ['open', file]
    if sys.platform == 'win32':
        return ['explorer.exe', file]
    if _is_wsl():
        # xdg-open is usually missing under WSL, and the default browser lives on the Windows side.
        windows_path = subprocess.run(['wslpath', '-w', file], capture_output=True, text=True, check=True).stdout.strip()
        return ['explorer.exe', windows_path]
    return ['xdg-open', file]


def open_in_default_app(file: str) -> None:
    """
    Returns once the opener has started; its exit code is ignored because explorer.exe exits
    with 1 even when it succeeds.
    """
    subprocess.Popen(
        _opener_command(file),
        stdin=subprocess.DEVNULL,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        start_new_session=True,
    )
