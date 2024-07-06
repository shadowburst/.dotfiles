import * as windows from './index.js';
const hyprland = await Service.import('hyprland');

/** @type {{icon: string, action: () => void}[]} */
const buttons = [
    {
        icon: 'changes-prevent-symbolic',
        action: () => {
            windows.closeAll();
            Utils.execAsync(['bash', '-c', 'sleep 0.1 && loginctl lock-session']);
        },
    },
    {
        icon: 'system-reboot-symbolic',
        action: () => Utils.execAsync('systemctl reboot'),
    },
    {
        icon: 'system-shutdown-symbolic',
        action: () => Utils.execAsync('systemctl poweroff'),
    },
    {
        icon: 'system-log-out-symbolic',
        action: () => hyprland.messageAsync('dispatch exit 0'),
    },
];

export default function Power() {
    const focused = Variable(0);

    return Widget.Window({
        name: 'power',
        className: 'window',
        monitor: hyprland.active.monitor.bind('id'),
        layer: 'overlay',
        anchor: ['top'],
        exclusivity: 'ignore',
        keymode: 'exclusive',
        child: Widget.Box({
            className: 'power',
            homogeneous: true,
            children: buttons.map((b, index) =>
                Widget.Button({
                    isFocus: focused.bind().as((value) => value === index),
                    className: 'primary',
                    child: Widget.Icon(b.icon),
                    onPrimaryClickRelease: () => b.action(),
                    onHover: () => (focused.value = index),
                })
                    .keybind('Return', () => b.action())
                    .keybind('leftarrow', () => (focused.value = Math.max(0, focused.value - 1)))
                    .keybind('rightarrow', () => (focused.value = Math.min(buttons.length - 1, focused.value + 1)))
                    .keybind('Escape', () => windows.closeAll())
            ),
        }),
    });
}
