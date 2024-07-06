const bluetooth = await Service.import('bluetooth');

export default function Bluetooth() {
    const device = bluetooth.bind('connected_devices').as((devices) => (devices.length > 0 ? devices[0] : null));

    return Widget.Button({
        classNames: Utils.merge([bluetooth.bind('enabled'), device], (enabled, d) => {
            const classes = ['bluetooth'];

            if (!enabled) {
                classes.push('muted');
            } else if (d?.battery_percentage) {
                if (d.battery_percentage <= 20) {
                    classes.push('danger');
                } else if (d.battery_percentage <= 40) {
                    classes.push('warning');
                }
            }

            return classes;
        }),
        child: Widget.Box({
            children: [
                Widget.CircularProgress({
                    value: device.as((d) => (d?.battery_percentage ? d.battery_percentage / 100 : 1)),
                    child: Widget.Icon({
                        icon: bluetooth
                            .bind('enabled')
                            .as((enabled) => (enabled ? 'bluetooth-active-symbolic' : 'bluetooth-disabled-symbolic')),
                    }),
                    startAt: 0.75,
                }),
                Widget.Label({
                    visible: device.as((d) => d != null),
                    label: device.as((d) => d?.name ?? ''),
                }),
            ],
        }),
        onPrimaryClick: () => Utils.execAsync('blueman-manager'),
        onSecondaryClick: () => bluetooth.toggle(),
    });
}
