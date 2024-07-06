const battery = await Service.import('battery');

export default function Battery() {
    return Widget.Box({
        classNames: battery.bind('percent').as((p) => {
            const classes = ['battery'];
            if (p <= 20) {
                classes.push('danger');
            } else if (p <= 40) {
                classes.push('warning');
            }
            return classes;
        }),
        children: [
            Widget.CircularProgress({
                value: battery.bind('percent').as((p) => (p > 0 ? p / 100 : 0)),
                child: Widget.Icon({
                    icon: Utils.merge([battery.bind('charging'), battery.bind('icon_name')], (charging, name) =>
                        charging ? 'thunderbolt-symbolic' : name
                    ),
                }),
                startAt: 0.75,
            }),
            Widget.Label({
                label: battery.bind('percent').as((p) => `${p}%`),
            }),
        ],
    });
}
