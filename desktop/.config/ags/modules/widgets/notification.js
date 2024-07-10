/** @param {import('resource:///com/github/Aylur/ags/service/notifications.js').Notification} n */
function NotificationIcon({ app_entry, app_icon, image }) {
    if (image) {
        return Widget.Box({
            css:
                `background-image: url("${image}");` +
                'background-size: contain;' +
                'background-repeat: no-repeat;' +
                'background-position: center;',
        });
    }

    let icon = 'dialog-information-symbolic';
    if (Utils.lookUpIcon(app_icon)) {
        icon = app_icon;
    }

    if (app_entry && Utils.lookUpIcon(app_entry)) {
        icon = app_entry;
    }

    return Widget.Box({
        child: Widget.Icon(icon),
    });
}
export default function Notification(
    /** @type {import('resource:///com/github/Aylur/ags/service/notifications.js').Notification} */ n
) {
    const children = [];

    children.push(
        Widget.Box({
            children: [
                NotificationIcon(n),
                Widget.Box({
                    vertical: true,
                    children: [
                        Widget.Label({
                            className: 'title',
                            label: n.summary,
                            xalign: 0,
                            wrap: true,
                        }),
                        Widget.Label({
                            className: 'body',
                            label: n.body,
                            xalign: 0,
                            wrap: true,
                        }),
                    ],
                }),
            ],
        })
    );

    if (n.actions.length > 0) {
        children.push(
            Widget.Box({
                className: 'actions',
                children: n.actions.map((action) =>
                    Widget.Button({
                        expand: true,
                        child: Widget.Label(action.label),
                        onPrimaryClick: () => {
                            n.invoke(action.id);
                            n.dismiss();
                        },
                    })
                ),
            })
        );
    }

    return Widget.EventBox({
        attribute: {
            id: n.id,
        },
        child: Widget.Box({
            className: 'notification',
            vertical: true,
            children,
        }),
        onPrimaryClick: () => n.dismiss(),
    });
}
