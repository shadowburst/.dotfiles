import * as windows from './index.js';

const hyprland = await Service.import('hyprland');

export default function Backdrop() {
    return Widget.Window({
        name: 'backdrop',
        classNames: ['backdrop'],
        monitor: hyprland.active.monitor.bind('id'),
        anchor: ['top', 'bottom', 'left', 'right'],
        exclusivity: 'ignore',
        child: Widget.EventBox({
            onPrimaryClick: () => windows.closeAll(),
        }),
    });
}
