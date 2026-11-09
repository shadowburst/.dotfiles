// Command herdr-worktree is the pbaudry.worktree Herdr plugin.
//
//	open              open the worktree popup (bound to a key)
//	popup             the popup itself (a plugin pane)
//	job <spec>        open or create the worktree and start the agent (detached)
//	daemon            poll all Spaces (single instance through a pidfile)
//	refresh           refresh the Space in HERDR_WORKSPACE_ID (or all if unset)
//	refresh --all     refresh all Spaces
package main

import (
	"fmt"
	"os"
	"slices"
)

func main() {
	cmd := "refresh"
	if len(os.Args) > 1 {
		cmd = os.Args[1]
	}
	var err error
	switch cmd {
	case "open":
		_, err = herdrCall(defaultTimeout, nil, "plugin", "pane", "open",
			"--plugin", os.Getenv("HERDR_PLUGIN_ID"), "--entrypoint", "popup")
	case "popup":
		err = runPopup()
	case "job":
		if len(os.Args) < 3 {
			err = fmt.Errorf("job needs a spec file")
			break
		}
		err = runJob(os.Args[2])
	case "daemon":
		daemon()
	case "refresh":
		only := os.Getenv("HERDR_WORKSPACE_ID")
		if slices.Contains(os.Args, "--all") {
			only = ""
		}
		refresh(only)
	default:
		err = fmt.Errorf("unknown command %q", cmd)
	}
	if err != nil {
		fmt.Fprintln(os.Stderr, "herdr-worktree:", err)
		os.Exit(1)
	}
}
