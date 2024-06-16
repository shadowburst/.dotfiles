const battery = await Service.import('battery');

function Battery() {
    const value = battery.bind('percent').as((p) => (p > 0 ? p / 100 : 0));
    const className = battery.bind('percent').as((p) => {
        if (p > 40) return 'battery';
        if (p > 20) return 'battery warning';
        return 'battery danger';
    });

    return Widget.Box({
        className,
        children: [
            Widget.Label({
                label: battery.bind('percent').as((p) => `${p}%`),
            }),
            Widget.CircularProgress({
                value,
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

export default Battery;
