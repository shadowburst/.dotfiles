const hyprland = await Service.import('hyprland');

const workspaceNames = ['', '', '', '', '', '', ''];

export default function Workspaces(/** @type {number} */ monitorId = 0) {
    return Widget.Box({
        className: 'workspaces',
        children: Utils.merge([hyprland.bind('monitors'), hyprland.bind('workspaces')], () =>
            workspaceNames.map((name, index) => {
                const workspaceId = index + 1;

                const classNames = [];
                if (hyprland.getMonitor(monitorId)?.activeWorkspace.id === workspaceId) {
                    classNames.push('active');
                } else if ((hyprland.getWorkspace(workspaceId)?.windows ?? 0) > 0) {
                    classNames.push('occupied');
                }

                return Widget.Button({
                    classNames,
                    child: Widget.Label(name),
                    onClicked: () => hyprland.messageAsync(`dispatch focusworkspaceoncurrentmonitor ${workspaceId}`),
                });
            })
        ),
    });
}
