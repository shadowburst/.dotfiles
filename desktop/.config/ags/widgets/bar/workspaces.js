const hyprland = await Service.import('hyprland');

const workspaceNames = ['', '', '', '', '', '', ''];

/**
 * @param {number} monitorIndex
 */
export default function Workspaces(monitorIndex = 0) {
    return Widget.Box({
        className: 'workspaces',
        children: Utils.merge([hyprland.bind('monitors'), hyprland.bind('workspaces')], (monitors) =>
            workspaceNames.map((name, index) => {
                const workspaceId = index + 1;

                let className = '';
                if (monitors[monitorIndex]?.activeWorkspace.id === workspaceId) {
                    className = 'active';
                } else if ((hyprland.getWorkspace(workspaceId)?.windows ?? 0) > 0) {
                    className = 'occupied';
                }

                return Widget.Button({
                    onClicked: () => hyprland.messageAsync(`dispatch focusworkspaceoncurrentmonitor ${workspaceId}`),
                    child: Widget.Label(name),
                    className,
                });
            })
        ),
    });
}
