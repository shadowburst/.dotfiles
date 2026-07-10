{ lib, pkgs }:
(pkgs.buildNpmPackage.override { nodejs = pkgs.nodejs_22; }) (finalAttrs: {
  pname = "clickup-cli";
  version = "1.38.3";

  src = pkgs.fetchFromGitHub {
    owner = "krodak";
    repo = "clickup-cli";
    rev = "v${finalAttrs.version}";
    hash = "sha256-LDYiQ7Q8E6ywRzr6y2mu12QbDip9At11WBDUrbdfsXA=";
  };

  npmDepsHash = "sha256-eH//seWNd0GQxTF/DY/PcEjAOzWZuBxoBo0IuMLYLXc=";

  nativeBuildInputs = [ pkgs.makeWrapper ];
  npmBuildScript = "build";

  postInstall = ''
    wrapProgram $out/bin/cup --prefix PATH : ${lib.makeBinPath [ pkgs.nodejs_22 ]}
  '';

  meta = {
    description = "ClickUp CLI for AI agents and humans";
    homepage = "https://github.com/krodak/clickup-cli";
    license = lib.licenses.mit;
    mainProgram = "cup";
  };
})
