{
  description = "Flake to work with homelab setup";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
    flake-utils.url = "github:numtide/flake-utils";

    krew2nix = {
      url = "github:eigengrau/krew2nix";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs = { nixpkgs, flake-utils, krew2nix, ... }: flake-utils.lib.eachDefaultSystem (system:
    let
      lib = nixpkgs.lib;

      # Import nixpkgs to access packages
      pkgs = import nixpkgs {
        inherit system;
        config = {
          allowUnfreePredicate = pkg: builtins.elem (lib.getName pkg) [
            "terraform"
          ];
        };
      };

      kubectl = krew2nix.packages.${system}.kubectl;
    in {
      # Define the devShell for the current system
      devShell = pkgs.mkShell {
        buildInputs = with pkgs; [
          kubernetes-helm
          (kubectl.withKrewPlugins (plugins: with plugins; [
            cnpg
          ]))
          nil
          terraform
          tflint
          typescript-language-server
          prettier
          jq
          openssl
          awscli2

          # Adding node for copilot
          nodejs_24

          # cli tools
          nodePackages.cdktf-cli
        ];
      };
    }
  );
}
