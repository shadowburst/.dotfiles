const network = await Service.import('network');

export default function Vpn() {
    const connectionIndex = Variable(0);

    const connection = Utils.merge(
        [network.vpn.bind('activated_connections'), connectionIndex.bind()],
        (connections, index) => (connections.length > index ? connections[index] : null)
    );

    return Widget.Button({
        classNames: connection.as((c) => {
            const classes = ['vpn'];
            if (!c) {
                classes.push('muted');
            } else if (c.state === 'disconnected') {
                classes.push('danger');
            } else if (['connecting', 'disconnecting'].includes(c.state)) {
                classes.push('warning');
            }
            return classes;
        }),
        child: Widget.Box({
            children: [
                Widget.CircularProgress({
                    value: 1,
                    child: Widget.Icon({
                        icon: connection.as((c) => c?.icon_name ?? 'network-vpn-symbolic'),
                    }),
                }),
                Widget.Label({
                    visible: connection.as((c) => c != null),
                    label: connection.as((c) => c?.id ?? ''),
                }),
            ],
        }),
        onPrimaryClick: () =>
            network.vpn.connections[connectionIndex.value]?.setConnection(
                network.vpn.activated_connections[connectionIndex.value]?.state !== 'connected'
            ),
        onSecondaryClick: () => (connectionIndex.value = (connectionIndex.value + 1) % network.vpn.connections.length),
    });
}
