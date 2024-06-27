const battery = await Service.import('battery');

export default function Battery() {
    return Widget.Box({
        className: battery.bind('percent').as((p) => {
            if (p > 40) return 'battery';
            if (p > 20) return 'battery warning';
            return 'battery danger';
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
                rounded: true,
                inverted: false,
            }),
            Widget.Label({
                label: battery.bind('percent').as((p) => `${p}%`),
            }),
        ],
    });
}
