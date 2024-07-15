import Battery from './battery.js';
import Bluetooth from './bluetooth.js';
import Clock from './clock.js';
import Cpu from './cpu.js';
import Media from './media.js';
import Network from './network.js';
import Notifications from './notifications.js';
import Ram from './ram.js';
import Torrents from './torrents.js';
import Vpn from './vpn.js';
import Volume from './volume.js';
import Updates from './updates.js';
import Window from './window.js';
import Workspaces from './workspaces.js';

export default function Bar(/** @type {number} */ monitorId = 0) {
    return Widget.Window({
        name: `bar-${monitorId}`,
        className: 'bar',
        monitor: monitorId,
        anchor: ['top', 'left', 'right'],
        exclusivity: 'exclusive',
        child: Widget.CenterBox({
            startWidget: Widget.Box({
                children: [Workspaces(monitorId), Media(), Window(monitorId)],
            }),
            centerWidget: Clock(),
            endWidget: Widget.Box({
                hpack: 'end',
                children: [
                    Torrents(),
                    Updates(),
                    Bluetooth(),
                    Network(),
                    Vpn(),
                    Volume(),
                    Cpu(),
                    Ram(),
                    Battery(),
                    Notifications(),
                ],
            }),
        }),
    });
}
