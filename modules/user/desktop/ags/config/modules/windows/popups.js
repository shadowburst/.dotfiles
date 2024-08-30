import brightness from '../../services/brightness.js';
import BrightnessOsd from '../widgets/brightness-osd.js';
import VolumeOsd from '../widgets/volume-osd.js';
import Notification from '../widgets/notification.js';

const audio = await Service.import('audio');
const hyprland = await Service.import('hyprland');
const notifications = await Service.import('notifications');

export default function Popups() {
    notifications.popupTimeout = 5000;

    const count = Variable(0);

    /** @type {number} */
    let brightnessCount = 0;

    function openBrightnessOsd(/** @type {import('resource:///com/github/Aylur/ags/widgets/box.js').Box} */ list) {
        if (brightnessCount === 0) {
            list.children = [BrightnessOsd()];
            count.value++;
        }

        brightnessCount++;

        setTimeout(() => {
            brightnessCount--;
            if (brightnessCount === 0) {
                list.children = [];
            }
        }, notifications.popupTimeout);
    }

    /** @type {number} */
    let volumeCount = 0;

    function openVolumeOsd(/** @type {import('resource:///com/github/Aylur/ags/widgets/box.js').Box} */ list) {
        if (volumeCount === 0) {
            list.children = [VolumeOsd()];
            count.value++;
        }

        volumeCount++;

        setTimeout(() => {
            volumeCount--;
            if (volumeCount === 0) {
                list.children = [];
            }
        }, notifications.popupTimeout);
    }

    return Widget.Window({
        name: 'popups',
        className: 'window',
        monitor: hyprland.active.monitor.bind('id'),
        layer: 'overlay',
        anchor: ['top', 'right'],
        child: Widget.Box({
            css: count.bind().as((value) => `min-width: 1px; min-height: ${value > 0 ? 100 : 1}px;`),
            vertical: true,
            children: [
                Widget.Box({
                    vertical: true,
                }).hook(brightness, openBrightnessOsd, 'notify::value'),
                Widget.Box({
                    vertical: true,
                })
                    .hook(audio.speaker, openVolumeOsd, 'notify::volume')
                    .hook(audio.speaker, openVolumeOsd, 'notify::is-muted'),
                Widget.Box({
                    vertical: true,
                    children: notifications.popups.map(Notification),
                })
                    .hook(
                        notifications,
                        (self, /** @type {number} id */ id) => {
                            if (notifications.dnd) {
                                return;
                            }

                            const n = notifications.getNotification(id);

                            if (n) {
                                self.children = [Notification(n), ...self.children];
                            }
                        },
                        'notified'
                    )
                    .hook(
                        notifications,
                        (self, /** @type {number} id */ id) => {
                            self.children.find((n) => n.attribute.id === id)?.destroy();
                        },
                        'dismissed'
                    )
                    .hook(
                        notifications,
                        (self, /** @type {number} id */ id) => {
                            self.children.find((n) => n.attribute.id === id)?.destroy();
                        },
                        'closed'
                    ),
            ],
        }),
    });
}
