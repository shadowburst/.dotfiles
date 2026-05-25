"""Send Kitty focus changes to pi windows.

Pi marks its Kitty window with the PI_FOCUS_AWARE user variable.  This watcher
then injects a small private escape sequence into that window whenever Kitty
focus changes, including when focus moves between Kitty splits/windows.
"""

from typing import Any

from kitty.boss import Boss
from kitty.window import Window

PI_FOCUS_AWARE_VAR = "PI_FOCUS_AWARE"
PI_FOCUS_IN = "\x1bPpi-focus=1\x1b\\"
PI_FOCUS_OUT = "\x1bPpi-focus=0\x1b\\"


def is_pi_focus_aware(window: Window) -> bool:
    return window.user_vars.get(PI_FOCUS_AWARE_VAR) == "1"


def send_focus_event(boss: Boss, window: Window, focused: bool) -> None:
    if not is_pi_focus_aware(window):
        return

    boss.call_remote_control(
        window,
        ("send-text", f"--match=id:{window.id}", PI_FOCUS_IN if focused else PI_FOCUS_OUT),
    )


def on_focus_change(boss: Boss, window: Window, data: dict[str, Any]) -> None:
    send_focus_event(boss, window, bool(data.get("focused")))


def on_set_user_var(boss: Boss, window: Window, data: dict[str, Any]) -> None:
    # When pi starts, immediately tell it the current Kitty focus state instead
    # of waiting for the next focus transition.
    if data.get("key") == PI_FOCUS_AWARE_VAR and data.get("value") == "1":
        send_focus_event(boss, window, bool(window.is_focused))
