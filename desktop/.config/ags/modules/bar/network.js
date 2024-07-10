import { string } from '../../utils/index.js';

const network = await Service.import('network');

function Wifi() {
    return [
        Widget.CircularProgress({
            value: network.wifi.bind('strength').as((strength) => strength / 100),
            child: Widget.Icon({
                icon: network.wifi.bind('icon_name'),
            }),
            startAt: 0.75,
        }),
        Widget.Label({
            visible: network.wifi.bind('ssid').as((ssid) => ssid != null && ssid.length > 0),
            label: network.wifi.bind('ssid').as((ssid) => ssid ?? ''),
        }),
    ];
}

function Wired() {
    return [
        Widget.CircularProgress({
            value: 100,
            child: Widget.Icon({
                icon: network.wired.bind('icon_name'),
            }),
            startAt: 0.75,
        }),
        Widget.Label({
            label: network.wired.bind('state').as(string.capitalize),
        }),
    ];
}

export default function Network() {
    return Widget.Button({
        classNames: network.bind('connectivity').as((connectivity) => {
            const classes = ['network'];
            if (connectivity === 'full') {
                classes.push('connected');
            } else if (connectivity === 'limited') {
                classes.push('connected warning');
            }
            return classes;
        }),
        child: Widget.Box({
            children: network.bind('primary').as((primary) => (primary === 'wired' ? Wired() : Wifi())),
        }),
        onPrimaryClick: () => Utils.execAsync(['bash', '-c', '$TERMINAL -e nmtui']),
        onSecondaryClick: network.toggleWifi,
    });
}
