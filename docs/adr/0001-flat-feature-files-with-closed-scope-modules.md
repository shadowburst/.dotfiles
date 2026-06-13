# Flat feature files with closed scope modules

We will reorganize flake modules so `modules/` is flat and files are named after features or tools, while exported flake module names are limited to a closed public scope vocabulary: `core`, `cli`, `gui`, `gaming`, `laravel`, and hostnames. Feature files may contribute to one or more scopes, but must not expose feature-named public modules; this trades fine-grained opt-in modularity for simpler host composition and clearer configuration boundaries.

## Consequences

Host definitions remain the composition root and explicitly list scopes. `core` absorbs the former shared baseline, `terminal` becomes `cli`, `desktop` becomes `gui`, `dev` is folded into `cli`, `work` becomes `laravel`, and host scopes absorb host hardware/configuration submodules behind a single hostname-named public module.
