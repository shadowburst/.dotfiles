import Battery from './battery.js';
import Clock from './clock.js';
import Media from './media.js';
import Network from './network.js';
import Notification from './notifications.js';
import SysTray from './systray.js';
import Volume from './volume.js';
import Window from './window.js';
import Workspaces from './workspaces.js';

/**
 * @param {number} monitorId
 */
export default function Bar(monitorId = 0) {
    return Widget.Window({
        name: `bar-${monitorId}`,
        className: 'bar',
        monitor: monitorId,
        anchor: ['top', 'left', 'right'],
        exclusivity: 'exclusive',
        child: Widget.CenterBox({
            startWidget: Widget.Box({
                children: [Window(monitorId), Media()],
            }),
            centerWidget: Widget.CenterBox({
                homogeneous: true,
                startWidget: Widget.Box({
                    hpack: 'end',
                    children: [Battery()],
                }),
                centerWidget: Widget.Box({
                    children: [Workspaces(monitorId)],
                }),
                endWidget: Widget.Box({
                    children: [Volume(), Network()],
                }),
            }),
            endWidget: Widget.Box({
                hpack: 'end',
                children: [Clock(), SysTray()],
            }),
        }),
    });
}
