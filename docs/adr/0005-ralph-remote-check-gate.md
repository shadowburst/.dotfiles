# Ralph uses a Remote Check Gate before declaring Pull Requests ready

Ralph will create draft Pull Requests, watch hosted Pull Request checks through a Remote Check Gate when supported, treat failing checks as deterministic validation failures in a bounded fix loop, and mark the Pull Request ready only after final review and the Remote Check Gate pass. This makes Ralph's done state mean remote merge readiness rather than only local validation confidence, accepting a slower and more complex PR lifecycle to avoid handing off red CI to the user.

If the host or local tooling cannot support hosted check watching, Ralph records the Remote Check Gate as BLOCKED rather than treating the Pull Request as ready.
