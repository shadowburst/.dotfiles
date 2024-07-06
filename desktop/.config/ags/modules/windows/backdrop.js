import * as windows from './index.js';
const hyprland = await Service.import('hyprland');

export default function Backdrop(/** @type {boolean} */ dark = false) {
    return Widget.Window({
        name: 'backdrop',
        classNames: ['backdrop', dark ? 'dark' : ''],
        monitor: hyprland.active.monitor.bind('id'),
        anchor: ['top', 'bottom', 'left', 'right'],
        exclusivity: 'ignore',
        child: Widget.EventBox({
            onPrimaryClick: () => windows.closeAll(),
        }),
    });
}
