import * as windows from '../index.js';
const hyprland = await Service.import('hyprland');

export default function Backdrop() {
    return Widget.Window({
        name: 'backdrop',
        className: 'backdrop',
        anchor: ['left', 'top', 'bottom', 'right'],
        monitor: hyprland.active.monitor.bind('id'),
        exclusivity: 'ignore',
        child: Widget.EventBox({
            onPrimaryClick: windows.closeAll,
        }),
    });
}
