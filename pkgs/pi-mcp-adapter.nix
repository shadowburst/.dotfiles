{ pkgs }:
pkgs.buildNpmPackage {
  pname = "pi-mcp-adapter";
  version = "3.2.0";

  forceEmptyCache = true;

  src = pkgs.fetchFromGitHub {
    owner = "nicobailon";
    repo = "pi-mcp-adapter";
    rev = "v3.2.0";
    hash = "sha256-gzWJdYMz9gvSPE8ftTJpsqqmnlE6y0mcaIuELaaVWkM=";
  };

  npmDepsHash = "sha256-HxWSp8L0h10Pg2SbNooAnXa9QhQGG39k3+h+v/9QzVg=";
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