import Notification from '../widgets/notification.js';

const notifications = await Service.import('notifications');
const hyprland = await Service.import('hyprland');

export default function () {
    notifications.popupTimeout = 5000;

    return Widget.Window({
        name: 'popups',
        className: 'window',
        monitor: hyprland.active.monitor.bind('id'),
        layer: 'overlay',
        anchor: ['top', 'right'],
        child: Widget.Box({
            css: 'min-width: 1px; min-height: 100rem;',
            vertical: true,
            children: [
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
