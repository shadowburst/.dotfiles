import { string } from '../../utils/index.js';

const network = await Service.import('network');

function Wifi() {
    return [
        Widget.CircularProgress({
            value: network.wifi.bind('strength'),
            child: Widget.Icon({
                icon: network.wifi.bind('icon_name'),
            }),
            startAt: 0.75,
            rounded: true,
            inverted: false,
        }),
        Widget.Label({
            visible: network.wifi.bind('ssid').as((ssid) => ssid?.length),
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
            rounded: true,
            inverted: false,
        }),
        Widget.Label({
            label: network.wired.bind('state').as(string.capitalize),
        }),
    ];
}

export default function Network() {
    return Widget.Button({
        className: network.bind('connectivity').as((connectivity) => {
            if (connectivity === 'full') return 'network';
            if (connectivity === 'limited') return 'network warning';
            return 'network muted';
        }),
        child: Widget.Box({
            children: network.bind('primary').as((primary) => (primary === 'wired' ? Wired() : Wifi())),
        }),
        onPrimaryClick: () => Utils.execAsync(['bash', '-c', '$TERMINAL -e nmtui']),
        onSecondaryClick: network.toggleWifi,
    });
}
