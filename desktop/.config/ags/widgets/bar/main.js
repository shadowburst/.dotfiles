import Battery from './battery.js';
import Clock from './clock.js';
import Media from './media.js';
import Notification from './notifications.js';
import SysTray from './systray.js';
import Volume from './volume.js';
import Window from './window.js';
import Workspaces from './workspaces.js';

/**
 * @param {number} monitor
 */
export default function Bar(monitor = 0) {
    return Widget.Window({
        name: `bar-${monitor}`,
        className: 'bar',
        monitor,
        anchor: ['top', 'left', 'right'],
        exclusivity: 'exclusive',
        child: Widget.CenterBox({
            startWidget: Widget.Box({
                children: [Window(monitor), Media()],
            }),
            centerWidget: Widget.CenterBox({
                homogeneous: true,
                startWidget: Widget.Box({
                    hpack: 'end',
                    children: [Battery()],
                }),
                centerWidget: Widget.Box({
                    children: [Workspaces(monitor)],
                }),
                endWidget: Widget.Box({
                    children: [Volume()],
                }),
            }),
            endWidget: Widget.Box({
                hpack: 'end',
                children: [Clock(), SysTray()],
            }),
        }),
    });
}
