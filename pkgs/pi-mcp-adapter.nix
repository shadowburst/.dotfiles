{ pkgs }:
pkgs.buildNpmPackage {
  pname = "pi-mcp-adapter";
  version = "2.37.0";

  forceEmptyCache = true;

  src = pkgs.fetchFromGitHub {
    owner = "nicobailon";
    repo = "pi-mcp-adapter";
    rev = "v2.37.0";
    hash = "sha256-fZ6sAJhNjSMz/KVsuuNtjkomkI5rQ0qlWMpvFVPinEc=";
  };

  npmDepsHash = "sha256-oMET5uY6IqYEJxBPi4Zay+7pwYuHE1FsuxDgjZVGGeQ=";
  npmDepsFetcherVersion = 2;

  postPatch = ''
    ${pkgs.jq}/bin/jq 'del(.devDependencies)' package.json > package.json.tmp
    mv package.json.tmp package.json
    ${pkgs.jq}/bin/jq '
      del(.packages[""].devDependencies)
      | .packages |= with_entries(select(.value.dev != true))
    ' package-lock.json > package-lock.json.tmp
    mv package-lock.json.tmp package-lock.json
  '';

  npmInstallFlags = [
    "--omit=dev"
    "--legacy-peer-deps"
  ];
  dontNpmBuild = true;
  installPhase = ''
    runHook preInstall
    mkdir -p $out
    cp -r ./* $out/
    runHook postInstall
  '';
}