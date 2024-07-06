import * as windows from './index.js';
const hyprland = await Service.import('hyprland');

export default function Backdrop(/** @type {boolean} */ dark = false) {
    return Widget.Window({
        name: 'backdrop',
        classNames: ['backdrop', dark ? 'dark' : ''],
        anchor: ['left', 'top', 'bottom', 'right'],
        monitor: hyprland.active.monitor.bind('id'),
        exclusivity: 'ignore',
        child: Widget.EventBox({
            onPrimaryClick: windows.closeAll,
        }),
    });
}
