{ pkgs }:
pkgs.herdr-core.overrideAttrs (old: {
  patches = (old.patches or [ ]) ++ [ ./resume.patch ];
  postPatch = (old.postPatch or "") + ''
    cp ${./tests.rs} crates/herdr-core/tests/resume.rs
  '';
  # Refresh generated references, then run the recovery tests before the full upstream suite.
  preCheck = (old.preCheck or "") + ''
    HC_UPDATE_SCHEMA=1 HC_UPDATE_DOCS=1 cargo test --release \
      --target ${pkgs.stdenv.hostPlatform.rust.rustcTarget} \
      -p herdr-core --test m0 --test cli_docs --test resume
  '';
})
