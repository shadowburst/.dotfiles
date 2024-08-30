const hyprland = await Service.import('hyprland');

const workspaces = Array.from({ length: 7 }).map((_, i) => i + 1);

export default function Workspaces(/** @type {number} */ monitorId = 0) {
    return Widget.Box({
        className: 'workspaces',
        children: Utils.merge([hyprland.bind('monitors'), hyprland.bind('workspaces')], () =>
            workspaces.map((workspaceId) => {
                const isActive = hyprland.getMonitor(monitorId)?.activeWorkspace.id === workspaceId;
                const isOccupied = (hyprland.getWorkspace(workspaceId)?.windows ?? 0) > 0;

                let classNames = [];
                let icon = 'circle-symbolic';
                if (isOccupied) {
                    classNames = ['occupied'];
                    icon = 'circle-dot-symbolic';
                }
                if (isActive) {
                    classNames = ['active'];
                }

                return Widget.Button({
                    classNames,
                    child: Widget.Icon(icon),
                    onClicked: () => hyprland.messageAsync(`dispatch focusworkspaceoncurrentmonitor ${workspaceId}`),
                });
            })
        ),
    });
}
