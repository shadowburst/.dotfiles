const notifications = await Service.import('notifications');

export default function Notifications() {
    return Widget.Button({
        classNames: notifications.bind('dnd').as((dnd) => ['notifications', dnd ? 'muted' : '']),
        child: Widget.CircularProgress({
            value: 1,
            child: Widget.Icon({
                icon: Utils.merge(
                    [notifications.bind('notifications'), notifications.bind('dnd')],
                    (notifs, dnd) => `notification-${dnd ? 'disabled-' : ''}${notifs.length > 0 ? 'new-' : ''}symbolic`
                ),
            }),
        }),
        onSecondaryClickRelease: () => (notifications.dnd = !notifications.dnd),
    });
}
