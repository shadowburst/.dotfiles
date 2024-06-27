const bluetooth = await Service.import('bluetooth');

export default function Bluetooth() {
    const device = bluetooth.bind('connected_devices').as((devices) => (devices.length > 0 ? devices[0] : null));

    return Widget.Button({
        className: Utils.merge([bluetooth.bind('enabled'), device], (enabled, device) => {
            if (!enabled) {
                return 'bluetooth muted';
            }

            if (!device?.battery_percentage) {
                return 'bluetooth';
            }

            if (device.battery_percentage < 20) {
                return 'bluetooth danger';
            }

            if (device.battery_percentage < 40) {
                return 'bluetooth warning';
            }

            return 'bluetooth';
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
                    rounded: true,
                    inverted: false,
                }),
                Widget.Label({
                    visible: device.as((d) => d != null),
                    label: device.as((d) => d?.name ?? ''),
                }),
            ],
        }),
        onPrimaryClick: () => Utils.execAsync('blueman-manager'),
        onSecondaryClick: bluetooth.toggle,
    });
}
