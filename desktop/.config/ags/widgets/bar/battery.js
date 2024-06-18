const battery = await Service.import('battery');

export default function Battery() {
    return Widget.Box({
        className: battery.bind('percent').as((p) => {
            if (p > 40) return 'battery';
            if (p > 20) return 'battery warning';
            return 'battery danger';
        }),
        children: [
            Widget.Label({
                label: battery.bind('percent').as((p) => `${p}%`),
            }),
            Widget.CircularProgress({
                value: battery.bind('percent').as((p) => (p > 0 ? p / 100 : 0)),
                child: Widget.Icon({
                    icon: battery.bind('icon_name'),
                }),
                startAt: 0.75,
                rounded: true,
                inverted: false,
            }),
        ],
    });
}
