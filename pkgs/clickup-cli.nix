{ lib, pkgs }:
(pkgs.buildNpmPackage.override { nodejs = pkgs.nodejs_22; }) (finalAttrs: {
  pname = "clickup-cli";
  version = "1.46.1";

  src = pkgs.fetchFromGitHub {
    owner = "krodak";
    repo = "clickup-cli";
    rev = "v${finalAttrs.version}";
    hash = "sha256-KgvPTah0NKBxmDXnqOB5QZAI+D5mj/EVCSglEGE+7F8=";
  };

  npmDepsHash = "sha256-elmtOSF1ZqmXFlaVN/W1QJtTl+yWtlCgw1kSP+JPpRQ=";

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
