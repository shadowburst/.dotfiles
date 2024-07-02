import Notification from '../widgets/notification.js';

const notifications = await Service.import('notifications');
const hyprland = await Service.import('hyprland');

export default function () {
    notifications.popupTimeout = 5000;

    return Widget.Window({
        name: 'popups',
        className: 'window',
        anchor: ['top', 'right'],
        monitor: hyprland.active.monitor.bind('id'),
        child: Widget.Box({
            css: 'min-width: 2px; min-height: 2px;',
            child: Widget.Box({
                vertical: true,
                children: notifications.popups.map(Notification),
            })
                .hook(
                    notifications,
                    (self, /** @type {number} id */ id) => {
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
                ),
        }),
    });
}
